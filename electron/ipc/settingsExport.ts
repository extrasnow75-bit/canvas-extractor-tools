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
import { cellValue, CellStyle, FONT, PALETTE, rowLayout, ruleRows, titleLayout } from './sheetsLayout'
import {
  SettingsTemplate,
  COURSE_SETTINGS_TEMPLATE,
  ASSIGNMENT_TEMPLATE,
  DISCUSSION_TEMPLATE,
  CLASSIC_QUIZ_TEMPLATE,
  NEW_QUIZ_TEMPLATE,
  UNSET_DROPDOWN,
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
  /**
   * Set on a graded discussion. Canvas also embeds the whole assignment under `assignment`,
   * and which of the two arrives depends on the include[] parameters in play, so
   * resolveItems reads both.
   */
  assignment_id?: number | null
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

/**
 * `nqa` is a New Quiz recognised from its assignment record rather than a quiz record — see
 * resolveItems. It needs a prefix of its own because the id it carries is an assignment id,
 * and assignment ids and quiz ids are separate Canvas sequences that can collide numerically.
 */
type ItemPrefix = 'asgn' | 'disc' | 'quiz' | 'newquiz' | 'nqa'

function itemKey(prefix: ItemPrefix, id: number): string {
  return `${prefix}-${id}`
}

/**
 * One settings-bearing thing in the course, after the three listings have been reconciled
 * against each other. `kind` picks the template; the attached record is what the tab is
 * built from.
 */
export type ResolvedItem =
  | { key: string; kind: 'asgn'; label: string; group: string; assignment: CanvasAssignmentRaw }
  | { key: string; kind: 'disc'; label: string; group: string; discussion: CanvasDiscussionRaw }
  | { key: string; kind: 'quiz'; label: string; group: string; quiz: CanvasQuizRaw }
  | {
      key: string
      kind: 'newquiz'
      label: string
      group: string
      /** Absent only when a quiz record names an assignment the assignments list did not return. */
      assignment?: CanvasAssignmentRaw
    }

/**
 * Decide, once, which listing owns each item — and therefore which settings template it gets.
 *
 * `/courses/:id/assignments` is the gradebook's view of a course, not a list of tools. It
 * returns a record for every classic quiz (`submission_types: ['online_quiz']`), every graded
 * discussion (`['discussion_topic']`) and every New Quiz, alongside the ordinary assignments.
 * Treating it as a peer of the other two listings is what produced two tabs for one object: a
 * classic quiz came out as both a Classic Quiz table and an Assignment table, the second one
 * describing submission types, file uploads and Turnitin rows that a quiz does not have.
 *
 * The rule here is *claim*, not *skip*. An assignment is dropped only when a quiz or
 * discussion record actually turned up to represent it. Dropping by submission type instead
 * would make an item disappear from the picker altogether whenever the owning listing does not
 * return it — not hypothetical for New Quizzes, which `/quizzes` omits entirely on instances
 * that do not surface them there. A New Quiz reaching this function only as an assignment is
 * still identifiable from `is_quiz_lti_assignment`, and its template maps the Assignments-API
 * fields anyway, so it keeps its own tab rather than falling back to an Assignment one.
 *
 * Ordering is assignments, then discussions, then quizzes, which is the tab order the export
 * had before this function existed.
 */
export function resolveItems(
  assignments: CanvasAssignmentRaw[],
  discussions: CanvasDiscussionRaw[],
  quizzes: CanvasQuizRaw[],
): ResolvedItem[] {
  const claimed = new Set<number>()
  for (const q of quizzes) {
    if (q.assignment_id != null) claimed.add(q.assignment_id)
  }
  for (const d of discussions) {
    const id = d.assignment_id ?? d.assignment?.id
    if (id != null) claimed.add(id)
  }

  const assignmentsById = new Map(assignments.map((a) => [a.id, a]))
  const out: ResolvedItem[] = []

  for (const a of assignments) {
    if (claimed.has(a.id)) continue
    if (a.is_quiz_lti_assignment) {
      out.push({
        key: itemKey('nqa', a.id),
        kind: 'newquiz',
        label: a.name,
        group: 'New Quizzes',
        assignment: a,
      })
    } else {
      out.push({
        key: itemKey('asgn', a.id),
        kind: 'asgn',
        label: a.name,
        group: 'Assignments',
        assignment: a,
      })
    }
  }

  for (const d of discussions) {
    out.push({
      key: itemKey('disc', d.id),
      kind: 'disc',
      label: d.title,
      group: 'Discussions',
      discussion: d,
    })
  }

  for (const q of quizzes) {
    if (q.quiz_type === 'quizzes.next') {
      out.push({
        key: itemKey('newquiz', q.id),
        kind: 'newquiz',
        label: q.title,
        group: 'New Quizzes',
        assignment: q.assignment_id != null ? assignmentsById.get(q.assignment_id) : undefined,
      })
    } else {
      out.push({
        key: itemKey('quiz', q.id),
        kind: 'quiz',
        label: q.title,
        group: 'Classic Quizzes',
        quiz: q,
      })
    }
  }

  return out
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

  // The same resolveItems the builder walks, so what the picker offers and what the export
  // produces cannot drift apart. Keeping those two rules in step by hand is what let a classic
  // quiz be listed twice under different headings with no way to tell the entries apart.
  return [
    { id: COURSE_SETTINGS_ID, label: 'Course Settings (whole-course settings, not tied to one item)' },
    ...resolveItems(assignments, discussions, quizzes).map((item) => ({
      id: item.key,
      label: item.label,
      group: item.group,
    })),
  ]
}

function heading(template: SettingsTemplate, name: string): string {
  const title = template.heading.replace('{name}', name)
  return template.headingNote ? `${title}\n${template.headingNote}` : title
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

  const selected = resolveItems(assignments, discussions, quizzes).filter((item) => wants(item.key))

  // Counted before the building loop so the progress bar has a real total to work from.
  // Without this the bar sat at 0% through every paginated fetch above and then jumped
  // straight to 100%, which the other extractors deliberately avoid.
  const total = tabs.length + selected.length + reservedSteps
  progress?.(tabs.length, total)

  let containsAccessCode = false

  for (const item of selected) {
    switch (item.kind) {
      case 'asgn':
        tabs.push({
          template: ASSIGNMENT_TEMPLATE,
          // Short prefixes, because the whole title has to fit Excel's 31-character worksheet
          // limit and the item's own name is the part worth the room. See safeTabTitle.
          title: safeTabTitle(`A - ${item.label}`, usedTitles),
          heading: heading(ASSIGNMENT_TEMPLATE, item.label),
          values: mapAssignment(item.assignment, groups),
        })
        break

      case 'disc':
        tabs.push({
          template: DISCUSSION_TEMPLATE,
          title: safeTabTitle(`D - ${item.label}`, usedTitles),
          heading: heading(DISCUSSION_TEMPLATE, item.label),
          values: mapDiscussion(item.discussion, groups),
        })
        break

      case 'newquiz':
        // New Quizzes run on an external LTI engine; only the fields Canvas exposes through
        // the ordinary Assignments API are mappable. The rest of the tab stays at the
        // template's own defaults — see NEW_QUIZ_TEMPLATE's comment.
        tabs.push({
          template: NEW_QUIZ_TEMPLATE,
          title: safeTabTitle(`NQ - ${item.label}`, usedTitles),
          heading: heading(NEW_QUIZ_TEMPLATE, item.label),
          values: item.assignment ? mapNewQuiz(item.assignment, groups) : new Map(),
        })
        break

      case 'quiz': {
        const values = mapClassicQuiz(item.quiz, groups)
        if (values.has('access_code_password')) containsAccessCode = true
        tabs.push({
          template: CLASSIC_QUIZ_TEMPLATE,
          title: safeTabTitle(`CQ - ${item.label}`, usedTitles),
          heading: heading(CLASSIC_QUIZ_TEMPLATE, item.label),
          values,
        })
        break
      }
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
const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: `FF${PALETTE.black}` } }

function applyStyle(cell: ExcelJS.Cell, style: CellStyle, link?: string): void {
  cell.font = {
    name: FONT.family,
    size: FONT.size,
    bold: style.bold,
    color: { argb: `FF${style.color}` },
    ...(link ? { underline: true } : {}),
  }
  if (style.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${style.fill}` } }
  }
  cell.alignment = { horizontal: style.align, vertical: 'middle', wrapText: true }
}

export async function buildSettingsWorkbook(data: SettingsData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  for (const tab of data.tabs) {
    const sheet = workbook.addWorksheet(tab.title)
    // Character widths, matching the workbook's own columns (A 38–46 wide, B 36–42).
    sheet.getColumn(1).width = 44
    sheet.getColumn(2).width = 40

    const title = titleLayout()
    const headingRow = sheet.addRow([tab.heading])
    applyStyle(headingRow.getCell(1), title.label)
    sheet.mergeCells(headingRow.number, 1, headingRow.number, 2)

    for (const row of tab.template.rows) {
      const layout = rowLayout(row, tab.values)
      const excelRow = sheet.addRow([row.label])
      applyStyle(excelRow.getCell(1), layout.label)
      applyStyle(excelRow.getCell(2), layout.value, layout.link)
      if (layout.merged) sheet.mergeCells(excelRow.number, 1, excelRow.number, 2)
      if (row.kind === 'note') continue

      const value = cellValue(row, tab.values)
      const cell = excelRow.getCell(2)
      if (row.kind === 'checkbox') {
        cell.value = value === true
      } else if (layout.link) {
        cell.value = { text: String(value), hyperlink: layout.link }
      } else {
        cell.value = String(value)
        if (row.kind === 'dropdown' && row.options) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${UNSET_DROPDOWN},${row.options.join(',')}"`],
          }
        }
      }
    }

    // Borders: a box round the whole block with a line between the columns, and a rule
    // along the top of every row rowLayout says gets one — so a primary setting and the
    // sub-options beneath it read as one group.
    const rowCount = tab.template.rows.length + 1
    const rules = new Set(ruleRows(tab.template.rows, tab.values))
    for (let i = 0; i < rowCount; i++) {
      const top = i === 0 || rules.has(i) ? THIN : undefined
      const bottom = i === rowCount - 1 ? THIN : undefined
      const merged = i > 0 && rowLayout(tab.template.rows[i - 1], tab.values).merged
      const a = sheet.getCell(i + 1, 1)
      const b = sheet.getCell(i + 1, 2)
      a.border = { left: THIN, top, bottom, ...(merged || i === 0 ? {} : { right: THIN }) }
      b.border = { right: THIN, top, bottom }
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
