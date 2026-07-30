import { IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'fs'
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
import {
  FONT,
  htmlDocument,
  escapeHtml,
  formatCanvasBody,
  stripEdgeRules,
  moduleHeader,
  itemTitle,
  toolLabel,
  isDueHeader,
  dueHeader,
  subHeader,
} from './blueprintFormat'

interface ExportContentArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
}

interface CanvasModule {
  id: number
  name: string
}

interface CanvasModuleItem {
  id: number
  title: string
  type: string
  content_id?: number
  page_url?: string
  external_url?: string
}

interface CanvasCourse {
  id: number
  name: string
  syllabus_body?: string
}

interface CanvasPage {
  title: string
  body: string
}

interface CanvasAssignment {
  name: string
  description: string
  /**
   * True for a New Quiz. Canvas models those as an assignment submitted through the
   * Quizzes.Next LTI tool, so they arrive as an `Assignment` module item and never reach
   * the `Quiz` case below.
   */
  is_quiz_lti_assignment?: boolean
}

interface CanvasDiscussion {
  title: string
  message: string
}

interface CanvasQuiz {
  title: string
  /**
   * The Rich Content Editor instructions shown above the questions. This is body content
   * like a page's, so it belongs in the content export; the questions themselves belong to
   * the quiz export and are deliberately not fetched here.
   */
  description?: string
}

/** Stable key for a module item, used by the "choose specific items" picker. */
function itemKey(item: CanvasModuleItem): string {
  return `mi-${item.id}`
}

/** List every module item in the course, grouped by module, for the picker UI. */
export async function listContentItems(ref: CourseRef): Promise<PickerItem[]> {
  const modules = await canvasGet<CanvasModule>(`/courses/${ref.courseId}/modules`, ref)
  const out: PickerItem[] = []
  for (const mod of modules) {
    const items = await canvasGet<CanvasModuleItem>(
      `/courses/${ref.courseId}/modules/${mod.id}/items`,
      ref,
    )
    for (const item of items) {
      out.push({ id: itemKey(item), label: item.title, group: mod.name })
    }
  }
  return out
}

/**
 * Build the full Blueprint-formatted HTML for a course's module content.
 * Kept separate from the file-write so the Google Drive upload path can reuse it.
 * When `selectedIds` is provided, only matching module items are included
 * (a module with none selected is skipped entirely); Home/Syllabus always show.
 */
export async function buildContentHtml(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
): Promise<{ html: string; courseName: string; moduleCount: number }> {
  const course = await canvasGetOne<CanvasCourse>(
    `/courses/${ref.courseId}?include[]=syllabus_body`,
    ref,
  )

  const parts: string[] = []
  // Positions of the due-date headers, so the bodies on either side can have a colliding
  // template divider trimmed once the document is assembled.
  const dueHeaderIndices: number[] = []
  parts.push(`<h1 style="font-family:${FONT};">${escapeHtml(course.name)}</h1>`)

  // Front page (home)
  parts.push(`<h2 style="font-family:${FONT};">Home Page</h2>`)
  try {
    const fp = await canvasGetOne<CanvasPage>(`/courses/${ref.courseId}/front_page`, ref)
    parts.push(formatCanvasBody(fp.body))
  } catch {
    parts.push('<p>No front page found.</p>')
  }

  // Syllabus
  parts.push(`<h2 style="font-family:${FONT};">Syllabus</h2>`)
  parts.push(formatCanvasBody(course.syllabus_body ?? '<p>No syllabus found.</p>'))

  // Modules, in module-page order
  const modules = await canvasGet<CanvasModule>(`/courses/${ref.courseId}/modules`, ref)

  // Pre-pass: collect each module's items first so the total is known before the slow
  // per-item fetches start. That total is what makes a remaining-time estimate possible.
  // Listing items is one request per module; the expensive work is the per-item fetches.
  const plan: Array<{ mod: CanvasModule; items: CanvasModuleItem[] }> = []
  for (const mod of modules) {
    throwIfCancelled(cancel)
    const allItems = await canvasGet<CanvasModuleItem>(
      `/courses/${ref.courseId}/modules/${mod.id}/items?include[]=content_details`,
      ref,
    )
    const items = selectedIds ? allItems.filter((it) => selectedIds.has(itemKey(it))) : allItems
    if (selectedIds && items.length === 0) continue
    plan.push({ mod, items })
  }

  const total = plan.reduce((n, p) => n + p.items.length, 0)
  let done = 0
  progress?.(0, total)

  for (const { mod, items } of plan) {
    parts.push(moduleHeader(mod.name))

    for (const item of items) {
      throwIfCancelled(cancel)
      switch (item.type) {
        case 'Page': {
          const page = await canvasGetOne<CanvasPage>(
            `/courses/${ref.courseId}/pages/${item.page_url}`,
            ref,
          )
          parts.push(itemTitle(page.title))
          parts.push(toolLabel('Page'))
          parts.push(formatCanvasBody(page.body))
          break
        }
        case 'Assignment': {
          const asgn = await canvasGetOne<CanvasAssignment>(
            `/courses/${ref.courseId}/assignments/${item.content_id}`,
            ref,
          )
          parts.push(itemTitle(asgn.name))
          // A New Quiz lands here rather than in the `Quiz` case. Canvas labels it "Quiz"
          // on the Modules page, and the tool label is the cue QA reads, so match Canvas
          // rather than the underlying object type.
          parts.push(toolLabel(asgn.is_quiz_lti_assignment ? 'Quiz' : 'Assignment'))
          parts.push(formatCanvasBody(asgn.description))
          break
        }
        case 'Discussion': {
          const disc = await canvasGetOne<CanvasDiscussion>(
            `/courses/${ref.courseId}/discussion_topics/${item.content_id}`,
            ref,
          )
          parts.push(itemTitle(disc.title))
          parts.push(toolLabel('Discussion'))
          parts.push(formatCanvasBody(disc.message))
          break
        }
        case 'Quiz': {
          // Classic Quiz. The questions are the quiz export's job, but the instructions above
          // them are authored body content like any page's — without this they appeared in
          // neither export.
          const quiz = await canvasGetOne<CanvasQuiz>(
            `/courses/${ref.courseId}/quizzes/${item.content_id}`,
            ref,
          )
          parts.push(itemTitle(quiz.title))
          parts.push(toolLabel('Quiz'))
          parts.push(formatCanvasBody(quiz.description))
          break
        }
        case 'File':
          parts.push(itemTitle(item.title))
          parts.push(toolLabel('File'))
          break
        case 'ExternalUrl':
          parts.push(
            itemTitle(
              `<a href="${escapeHtml(item.external_url ?? '')}">${escapeHtml(item.title)}</a>`,
              false,
            ),
          )
          parts.push(toolLabel('External Link'))
          break
        case 'SubHeader':
          if (isDueHeader(item.title)) {
            dueHeaderIndices.push(parts.length)
            parts.push(dueHeader(item.title))
          } else {
            parts.push(subHeader(item.title))
          }
          break
        default:
          parts.push(
            `<p style="color:gray;"><em>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</em></p>`,
          )
      }
      done++
      progress?.(done, total)
    }
  }

  // A grey template divider pressed right up against a due header competes with the blue
  // Blueprint rules. Trim only those two edges; every other divider the author placed stays.
  for (const i of dueHeaderIndices) {
    if (i > 0) parts[i - 1] = stripEdgeRules(parts[i - 1], 'trailing')
    if (i + 1 < parts.length) parts[i + 1] = stripEdgeRules(parts[i + 1], 'leading')
  }

  return {
    html: htmlDocument(`${course.name} — Course Content`, parts),
    courseName: course.name,
    moduleCount: plan.length,
  }
}

/** Sends progress for this job back to the window that requested the export. */
export function makeProgressReporter(
  event: IpcMainInvokeEvent,
  jobId?: string,
): ProgressReporter | null {
  if (!jobId) return null
  return (done, total) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('canvas:exportProgress', { jobId, done, total })
    }
  }
}

export async function handleCanvasExport(
  event: IpcMainInvokeEvent,
  args: ExportContentArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }

  const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
  const cancel = beginJob(args.jobId)
  const ref: CourseRef = { ...parsed, token: args.token, cancel }
  try {
    const { html, courseName, moduleCount } = await buildContentHtml(
      ref,
      selectedIds,
      cancel,
      makeProgressReporter(event, args.jobId),
    )
    writeFileSync(args.savePath, html, 'utf-8')
    return {
      ok: true,
      message: `Exported "${courseName}" — ${moduleCount} module${moduleCount === 1 ? '' : 's'}.`,
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Export cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
