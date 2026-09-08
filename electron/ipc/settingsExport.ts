import { IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'fs/promises'
import ExcelJS from 'exceljs'
import {
  parseCourseUrl,
  canvasGet,
  canvasGetOne,
  CourseRef,
  PickerItem,
  CancelToken,
  ProgressReporter,
  throwIfCancelled,
  beginJob,
  endJob,
  isCancellation,
} from './canvasUtils'
import { makeProgressReporter } from './canvasExport'
import { consumeSavePath } from './savePaths'
import { cellValue } from './sheetsLayout'
import {
  SettingsTemplate,
  COURSE_SETTINGS_TEMPLATE,
  ASSIGNMENT_TEMPLATE,
  DISCUSSION_TEMPLATE,
  CLASSIC_QUIZ_TEMPLATE,
  NEW_QUIZ_TEMPLATE,
} from './settingsTemplates'
import {
  CellValue,
  GroupNameLookup,
  CanvasAssignmentFull,
  CanvasDiscussionFull,
  CanvasQuizFull,
  CanvasCourseFull,
  CanvasCourseSettings,
  mapAssignment,
  mapNewQuiz,
  mapDiscussion,
  mapClassicQuiz,
  mapCourseSettings,
} from './settingsMapping'

interface SettingsExportArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
}

/** One tab's worth of data: which template it follows, its heading, and its row overrides. */
export interface SettingsTab {
  template: SettingsTemplate
  /** Tab title, already made Sheets/Excel-safe and de-duplicated. */
  title: string
  /** A1 heading text, with `{name}` already substituted. */
  heading: string
  values: Map<string, CellValue>
}

export interface SettingsData {
  courseName: string
  tabs: SettingsTab[]
  /**
   * True when at least one classic quiz wrote its student access code into a tab. The UI
   * says so on completion: that code is the password students type to start the exam, and
   * these files exist to be handed round for QA review — outside Canvas's access controls.
   */
  containsAccessCode: boolean
}

/** Appended to the completion message whenever `containsAccessCode` is set. */
export const ACCESS_CODE_WARNING =
  ' Note: this includes a quiz student access code — the password students use to start the ' +
  'exam. Treat the file the way you would that password.'

interface CanvasCourseRaw extends CanvasCourseFull {
  id: number
  name: string
}

interface CanvasAssignmentRaw extends CanvasAssignmentFull {
  id: number
  name: string
  is_quiz_lti_assignment?: boolean | null
}

interface CanvasDiscussionRaw extends CanvasDiscussionFull {
  id: number
  title: string
}

interface CanvasQuizRaw extends CanvasQuizFull {
  id: number
  title: string
  quiz_type?: string | null
  assignment_id?: number | null
}

interface CanvasAssignmentGroup {
  id: number
  name: string
}

const COURSE_SETTINGS_ID = 'course-settings'

function itemKey(kind: 'asgn' | 'disc' | 'quiz' | 'newquiz', id: number): string {
  return `${kind}-${id}`
}

/**
 * A tab name both Google Sheets and Excel will accept, and that survives de-duplication.
 *
 * Excel is much the tighter of the two: 31 characters, and exceljs truncates to that limit
 * *before* it checks for duplicates. De-duplicating on the full name would therefore let two
 * distinct titles that differ only after character 31 — two discussions both starting
 * "Week 1 Discussion Board …" is entirely ordinary — collapse into the same worksheet name
 * and throw, aborting the whole local export. So everything here works inside the
 * 31-character budget, and the short type prefixes below exist to leave room for the item's
 * own name within it.
 *
 * Both applications also reject []:*?/\ outright, and Excel rejects a name that starts or
 * ends with an apostrophe.
 */
const MAX_TAB_TITLE = 31

export function safeTabTitle(raw: string, used: Set<string>): string {
  const cleaned = raw
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .trim()
  // Trailing quotes are stripped again after the slice: cutting at 31 can expose one.
  const base =
    cleaned.slice(0, MAX_TAB_TITLE).replace(/'+$/, '').trim() || 'Untitled'

  let title = base
  for (let n = 2; used.has(title.toLowerCase()); n++) {
    const suffix = ` (${n})`
    title = `${base.slice(0, MAX_TAB_TITLE - suffix.length).trim()}${suffix}`
  }
  used.add(title.toLowerCase())
  return title
}

async function fetchGroupLookup(ref: CourseRef): Promise<GroupNameLookup> {
  const groups = await canvasGet<CanvasAssignmentGroup>(`/courses/${ref.courseId}/assignment_groups`, ref)
  return new Map(groups.map((g) => [g.id, g.name]))
}

/** List every settings-bearing item in the course, for the picker UI. */
export async function listSettingsItems(ref: CourseRef): Promise<PickerItem[]> {
  const [assignments, discussions, quizzes] = await Promise.all([
    canvasGet<CanvasAssignmentRaw>(`/courses/${ref.courseId}/assignments`, ref),
    canvasGet<CanvasDiscussionRaw>(`/courses/${ref.courseId}/discussion_topics`, ref),
    canvasGet<CanvasQuizRaw>(`/courses/${ref.courseId}/quizzes`, ref),
  ])

  const out: PickerItem[] = [
    { id: COURSE_SETTINGS_ID, label: 'Course Settings (whole-course settings, not tied to one item)' },
  ]
  for (const a of assignments) {
    if (a.is_quiz_lti_assignment) continue // surfaced under New Quizzes below instead
    out.push({ id: itemKey('asgn', a.id), label: a.name, group: 'Assignments' })
  }
  for (const d of discussions) {
    out.push({ id: itemKey('disc', d.id), label: d.title, group: 'Discussions' })
  }
  for (const q of quizzes) {
    const isNewQuiz = q.quiz_type === 'quizzes.next'
    out.push({
      id: itemKey(isNewQuiz ? 'newquiz' : 'quiz', q.id),
      label: q.title,
      group: isNewQuiz ? 'New Quizzes' : 'Classic Quizzes',
    })
  }
  return out
}

function heading(template: SettingsTemplate, name: string): string {
  return template.heading.replace('{name}', name)
}

/**
 * Build every selected tab's data. Kept separate from both output formats (Sheets, local
 * .xlsx) so they stay in exact agreement — one build, two renderers.
 */
export async function buildSettingsData(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
  /**
   * Steps the caller will perform after this returns, counted into the progress total so the
   * bar does not reach 100% while there is still work to do. The Drive path reserves one for
   * writing the spreadsheet, which is the slowest step of the whole extraction.
   */
  reservedSteps = 0,
): Promise<SettingsData> {
  const wantAll = !selectedIds
  const wants = (id: string) => wantAll || selectedIds!.has(id)

  const course = await canvasGetOne<CanvasCourseRaw>(`/courses/${ref.courseId}`, ref)
  const groups = await fetchGroupLookup(ref)

  const usedTitles = new Set<string>()
  const tabs: SettingsTab[] = []

  throwIfCancelled(cancel)
  if (wants(COURSE_SETTINGS_ID)) {
    try {
      const settings = await canvasGetOne<CanvasCourseSettings>(`/courses/${ref.courseId}/settings`, ref)
      tabs.push({
        template: COURSE_SETTINGS_TEMPLATE,
        title: safeTabTitle('Course Settings', usedTitles),
        heading: heading(COURSE_SETTINGS_TEMPLATE, course.name),
        values: mapCourseSettings(course, settings),
      })
    } catch (err) {
      if (isCancellation(err)) throw err
      // Course-wide settings require the "Manage course settings" permission; a token that
      // lacks it must not fail the whole extraction over one tab.
    }
  }

  const [assignments, discussions, quizzes] = await Promise.all([
    canvasGet<CanvasAssignmentRaw>(`/courses/${ref.courseId}/assignments`, ref),
    canvasGet<CanvasDiscussionRaw>(`/courses/${ref.courseId}/discussion_topics`, ref),
    canvasGet<CanvasQuizRaw>(`/courses/${ref.courseId}/quizzes`, ref),
  ])
  throwIfCancelled(cancel)

  const assignmentsById = new Map(assignments.map((a) => [a.id, a]))

  // Counted before the building loops so the progress bar has a real total to work from.
  // Without this the bar sat at 0% through every paginated fetch above and then jumped
  // straight to 100%, which the other extractors deliberately avoid.
  const total =
    tabs.length +
    assignments.filter((a) => !a.is_quiz_lti_assignment && wants(itemKey('asgn', a.id))).length +
    discussions.filter((d) => wants(itemKey('disc', d.id))).length +
    quizzes.filter((q) => wants(itemKey(q.quiz_type === 'quizzes.next' ? 'newquiz' : 'quiz', q.id))).length +
    reservedSteps
  progress?.(tabs.length, total)

  for (const a of assignments) {
    if (a.is_quiz_lti_assignment) continue
    if (!wants(itemKey('asgn', a.id))) continue
    tabs.push({
      template: ASSIGNMENT_TEMPLATE,
      // Short prefixes, because the whole title has to fit Excel's 31-character worksheet
      // limit and the item's own name is the part worth the room. See safeTabTitle.
      title: safeTabTitle(`A - ${a.name}`, usedTitles),
      heading: heading(ASSIGNMENT_TEMPLATE, a.name),
      values: mapAssignment(a, groups),
    })
    progress?.(tabs.length, total)
  }

  for (const d of discussions) {
    if (!wants(itemKey('disc', d.id))) continue
    tabs.push({
      template: DISCUSSION_TEMPLATE,
      title: safeTabTitle(`D - ${d.title}`, usedTitles),
      heading: heading(DISCUSSION_TEMPLATE, d.title),
      values: mapDiscussion(d, groups),
    })
    progress?.(tabs.length, total)
  }

  let containsAccessCode = false
  for (const q of quizzes) {
    const isNewQuiz = q.quiz_type === 'quizzes.next'
    const key = itemKey(isNewQuiz ? 'newquiz' : 'quiz', q.id)
    if (!wants(key)) continue
    if (isNewQuiz) {
      // New Quizzes run on an external LTI engine; only the fields Canvas exposes through
      // the ordinary Assignments API are mappable. The rest of the tab stays at the
      // template's own defaults — see NEW_QUIZ_TEMPLATE's comment.
      const pairedAssignment = q.assignment_id != null ? assignmentsById.get(q.assignment_id) : undefined
      tabs.push({
        template: NEW_QUIZ_TEMPLATE,
        title: safeTabTitle(`NQ - ${q.title}`, usedTitles),
        heading: heading(NEW_QUIZ_TEMPLATE, q.title),
        values: pairedAssignment ? mapNewQuiz(pairedAssignment, groups) : new Map(),
      })
    } else {
      const values = mapClassicQuiz(q, groups)
      if (values.has('access_code_password')) containsAccessCode = true
      tabs.push({
        template: CLASSIC_QUIZ_TEMPLATE,
        title: safeTabTitle(`CQ - ${q.title}`, usedTitles),
        heading: heading(CLASSIC_QUIZ_TEMPLATE, q.title),
        values,
      })
    }
    progress?.(tabs.length, total)
  }

  return { courseName: course.name, tabs, containsAccessCode }
}

/**
 * Render the settings data as a local .xlsx workbook, one sheet per tab.
 *
 * Checkboxes are written as plain TRUE/FALSE — a real tickable checkbox widget is a
 * Google Sheets (or Excel form-control) feature exceljs cannot produce, so the local copy
 * shows the boolean as text rather than a box. The ToolTile "one difference to expect"
 * notice tells people this before they save. Dropdown rows still get their exact option
 * list as native Excel data validation, so the file is not just static text.
 */
export async function buildSettingsWorkbook(data: SettingsData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  for (const tab of data.tabs) {
    const sheet = workbook.addWorksheet(tab.title)
    sheet.getColumn(1).width = 46
    sheet.getColumn(2).width = 34

    const headingRow = sheet.addRow([tab.heading])
    headingRow.font = { bold: true, size: 13 }
    sheet.mergeCells(headingRow.number, 1, headingRow.number, 2)

    for (const row of tab.template.rows) {
      const excelRow = sheet.addRow([row.label])
      excelRow.getCell(1).font = { bold: row.kind !== 'note' }
      if (row.kind === 'note') continue

      const value = cellValue(row, tab.values)
      const cell = excelRow.getCell(2)
      if (row.kind === 'checkbox') {
        cell.value = value === true
      } else {
        cell.value = String(value)
        if (row.kind === 'dropdown' && row.options) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"Choose from dropdown,${row.options.join(',')}"`],
          }
        }
      }
    }
  }

  // exceljs resolves its own ArrayBuffer-shaped type, which fs.writeFile does not accept.
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
}

export async function handleSettingsExport(
  event: IpcMainInvokeEvent,
  args: SettingsExportArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }

  const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
  const cancel = beginJob(args.jobId)
  const ref: CourseRef = { ...parsed, token: args.token, cancel }
  try {
    const data = await buildSettingsData(ref, selectedIds, cancel, makeProgressReporter(event, args.jobId))
    if (data.tabs.length === 0) return { ok: false, message: 'No settings tables were selected.' }

    const buffer = await buildSettingsWorkbook(data)
    await writeFile(consumeSavePath(args.savePath), buffer)
    return {
      ok: true,
      message:
        `Extracted ${data.tabs.length} settings table${data.tabs.length === 1 ? '' : 's'} from "${data.courseName}".` +
        (data.containsAccessCode ? ACCESS_CODE_WARNING : ''),
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Extraction cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
