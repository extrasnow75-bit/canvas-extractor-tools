import { IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'fs'
import { consumeSavePath } from './savePaths'
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
  mapWithConcurrency,
  CANVAS_CONCURRENCY,
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
  safeLinkHref,
  collectImageFileIds,
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

interface CanvasFile {
  display_name?: string
  filename?: string
}

/**
 * Canvas file id → display name, for the whole export.
 *
 * Needed because Canvas embeds images with no name in the markup at all: the `src` is
 * `/files/6932907/preview` and the `alt` is empty, so the only way to tell an icon from a
 * photograph is to ask Canvas what the file is called. The Blueprint icons repeat on nearly
 * every page, so caching turns that from one request per image into one per distinct file —
 * roughly a dozen for a whole course.
 *
 * Promises rather than names, so that concurrent items asking for the same id share one
 * request instead of racing to make their own.
 */
type FileNameCache = Map<string, Promise<string | null>>

function fetchFileName(id: string, ref: CourseRef, cache: FileNameCache): Promise<string | null> {
  let pending = cache.get(id)
  if (!pending) {
    pending = canvasGetOne<CanvasFile>(`/files/${id}`, ref)
      .then((file) => file.display_name ?? file.filename ?? null)
      .catch((err) => {
        // Stop must not be absorbed here. Cancellation reaches this as a thrown error like
        // any other, and swallowing it left the export running until the next checkpoint.
        if (isCancellation(err)) throw err
        // Anything else — deleted file, locked folder, a hotlink from another course, a
        // rate-limit that outlasted its retries — leaves the image as an image rather than
        // failing a multi-minute export over an icon. The entry is dropped rather than
        // cached, so a transient failure does not follow the file for the whole run.
        cache.delete(id)
        return null
      })
    cache.set(id, pending)
  }
  return pending
}

/**
 * Seed the cache with every file in the course, in one paginated call.
 *
 * Without this each embedded image costs its own `GET /files/:id`, including the photographs
 * and diagrams whose names will never match an icon — on an image-heavy course that nearly
 * doubled the export's Canvas traffic. Courses where the token cannot list files fall back
 * to the per-id path, which is why a failure here is swallowed rather than raised.
 */
async function seedFileNames(ref: CourseRef, cache: FileNameCache): Promise<void> {
  try {
    const files = await canvasGet<CanvasFile & { id?: number }>(
      `/courses/${ref.courseId}/files`,
      ref,
    )
    for (const file of files) {
      const name = file.display_name ?? file.filename
      if (file.id != null && name) cache.set(String(file.id), Promise.resolve(name))
    }
  } catch (err) {
    if (isCancellation(err)) throw err
    // No file list — every id falls through to its own lookup, as before.
  }
}

/** Format a Canvas body, having first looked up the names of the files it embeds. */
async function formatBody(
  html: string | null | undefined,
  ref: CourseRef,
  cache: FileNameCache,
): Promise<string> {
  if (!html) return formatCanvasBody(html, ref.baseUrl)

  // Bounded like every other Canvas call. The id count comes from author-controlled HTML,
  // so an unbounded fan-out here would put an arbitrary number of authenticated requests in
  // flight at once and drain the account's rate-limit bucket from inside a single slot.
  const ids = collectImageFileIds(html)
  const names = new Map<string, string>()
  await mapWithConcurrency(ids.length, CANVAS_CONCURRENCY, async (i) => {
    const name = await fetchFileName(ids[i], ref, cache)
    if (name) names.set(ids[i], name)
  })
  return formatCanvasBody(html, ref.baseUrl, names)
}

/** Stable key for a module item, used by the "choose specific items" picker. */
function itemKey(item: CanvasModuleItem): string {
  return `mi-${item.id}`
}

/**
 * One module item's finished HTML fragments, plus whether it is a due-date header — the
 * caller needs that to record the header's index once the document order is settled.
 */
interface RenderedItem {
  parts: string[]
  isDueHeader?: boolean
}

/**
 * Fetch and format a single module item.
 *
 * Split out of the main loop so items can be rendered concurrently. It returns fragments
 * instead of appending to a shared array, because with several of these in flight the order
 * of completion says nothing about the order they belong in.
 */
async function renderModuleItem(
  item: CanvasModuleItem,
  ref: CourseRef,
  cssBorders: boolean,
  files: FileNameCache,
): Promise<RenderedItem> {
  switch (item.type) {
    case 'Page': {
      const page = await canvasGetOne<CanvasPage>(
        `/courses/${ref.courseId}/pages/${item.page_url}`,
        ref,
      )
      return {
        parts: [
          itemTitle(page.title),
          toolLabel('Page'),
          await formatBody(page.body, ref, files),
        ],
      }
    }
    case 'Assignment': {
      const asgn = await canvasGetOne<CanvasAssignment>(
        `/courses/${ref.courseId}/assignments/${item.content_id}`,
        ref,
      )
      return {
        parts: [
          itemTitle(asgn.name),
          // A New Quiz lands here rather than in the `Quiz` case. Canvas labels it "Quiz"
          // on the Modules page, and the tool label is the cue QA reads, so match Canvas
          // rather than the underlying object type.
          toolLabel(asgn.is_quiz_lti_assignment ? 'Quiz' : 'Assignment'),
          await formatBody(asgn.description, ref, files),
        ],
      }
    }
    case 'Discussion': {
      const disc = await canvasGetOne<CanvasDiscussion>(
        `/courses/${ref.courseId}/discussion_topics/${item.content_id}`,
        ref,
      )
      return {
        parts: [
          itemTitle(disc.title),
          toolLabel('Discussion'),
          await formatBody(disc.message, ref, files),
        ],
      }
    }
    case 'Quiz': {
      // Classic Quiz. The questions are the quiz export's job, but the instructions above
      // them are authored body content like any page's — without this they appeared in
      // neither export.
      const quiz = await canvasGetOne<CanvasQuiz>(
        `/courses/${ref.courseId}/quizzes/${item.content_id}`,
        ref,
      )
      return {
        parts: [
          itemTitle(quiz.title),
          toolLabel('Quiz'),
          await formatBody(quiz.description, ref, files),
        ],
      }
    }
    case 'File':
      return { parts: [itemTitle(item.title), toolLabel('File')] }
    case 'ExternalUrl': {
      // The URL is whatever a course author typed into Canvas, so the scheme is checked
      // rather than assumed. Escaping alone would not help: it stops an attribute breakout,
      // not a `javascript:` or `file:` target. Google Docs sanitises links on import, but the
      // local .html export is opened straight from the filesystem, where a javascript: link
      // would run in the file:// origin.
      const url = safeLinkHref(item.external_url)
      return {
        parts: [
          itemTitle(
            url
              ? `<a href="${escapeHtml(url)}">${escapeHtml(item.title)}</a>`
              : escapeHtml(item.title),
            false,
          ),
          toolLabel('External Link'),
        ],
      }
    }
    case 'SubHeader':
      return isDueHeader(item.title)
        ? { parts: [dueHeader(item.title, cssBorders)], isDueHeader: true }
        : { parts: [subHeader(item.title)] }
    default:
      return {
        parts: [
          `<p style="color:gray;"><em>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</em></p>`,
        ],
      }
  }
}

/** List every module item in the course, grouped by module, for the picker UI. */
export async function listContentItems(ref: CourseRef): Promise<PickerItem[]> {
  const modules = await canvasGet<CanvasModule>(`/courses/${ref.courseId}/modules`, ref)

  // Bounded concurrency rather than a serial loop: the user is watching a spinner while this
  // runs, and one round trip per module added up to several seconds on a normal course.
  // mapWithConcurrency preserves index order, so the picker still lists modules in Canvas's
  // order rather than in whatever order the responses happened to arrive.
  const perModule = await mapWithConcurrency(
    modules.length,
    CANVAS_CONCURRENCY,
    (i) =>
      canvasGet<CanvasModuleItem>(`/courses/${ref.courseId}/modules/${modules[i].id}/items`, ref),
  )

  const out: PickerItem[] = []
  modules.forEach((mod, i) => {
    for (const item of perModule[i]) {
      out.push({ id: itemKey(item), label: item.title, group: mod.name })
    }
  })
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
  /**
   * False when the result is uploaded to Google Docs: the API post-pass draws the blue
   * due-header rules there, and leaving the CSS in makes the importer emit grey ones too.
   */
  cssBorders = true,
): Promise<{ html: string; courseName: string; moduleCount: number }> {
  const course = await canvasGetOne<CanvasCourse>(
    `/courses/${ref.courseId}?include[]=syllabus_body`,
    ref,
  )

  const parts: string[] = []
  // Positions of the due-date headers, so the bodies on either side can have a colliding
  // template divider trimmed once the document is assembled.
  const dueHeaderIndices: number[] = []
  // One cache for the whole export, so an icon used on twenty pages is fetched once.
  const files: FileNameCache = new Map()
  await seedFileNames(ref, files)
  parts.push(`<h1 style="font-family:${FONT};">${escapeHtml(course.name)}</h1>`)

  // Front page (home)
  parts.push(`<h2 style="font-family:${FONT};">Home Page</h2>`)
  try {
    const fp = await canvasGetOne<CanvasPage>(`/courses/${ref.courseId}/front_page`, ref)
    parts.push(await formatBody(fp.body, ref, files))
  } catch {
    parts.push('<p>No front page found.</p>')
  }

  // Syllabus
  parts.push(`<h2 style="font-family:${FONT};">Syllabus</h2>`)
  parts.push(await formatBody(course.syllabus_body ?? '<p>No syllabus found.</p>', ref, files))

  // Modules, in module-page order
  const modules = await canvasGet<CanvasModule>(`/courses/${ref.courseId}/modules`, ref)

  // Pre-pass: collect each module's items first so the total is known before the slow
  // per-item fetches start. That total is what makes a remaining-time estimate possible.
  // Listing items is one request per module; the expensive work is the per-item fetches.
  const listed = await mapWithConcurrency(modules.length, CANVAS_CONCURRENCY, async (i) => {
    throwIfCancelled(cancel)
    return canvasGet<CanvasModuleItem>(
      `/courses/${ref.courseId}/modules/${modules[i].id}/items?include[]=content_details`,
      ref,
    )
  })

  const plan: Array<{ mod: CanvasModule; items: CanvasModuleItem[] }> = []
  modules.forEach((mod, i) => {
    const items = selectedIds ? listed[i].filter((it) => selectedIds.has(itemKey(it))) : listed[i]
    if (selectedIds && items.length === 0) return
    plan.push({ mod, items })
  })

  const total = plan.reduce((n, p) => n + p.items.length, 0)
  let done = 0
  progress?.(0, total)

  // Flatten every module's items into one list so that requests can overlap across module
  // boundaries too — otherwise a module holding a single item would drain the pool.
  const flatItems: CanvasModuleItem[] = plan.flatMap((p) => p.items)

  const rendered = await mapWithConcurrency(flatItems.length, CANVAS_CONCURRENCY, async (i) => {
    // Checked per item rather than per batch, so Stop takes effect within one request rather
    // than after the whole in-flight group drains.
    throwIfCancelled(cancel)
    const result = await renderModuleItem(flatItems[i], ref, cssBorders, files)
    done++
    progress?.(done, total)
    return result
  })

  // Assembly is a separate, strictly ordered pass. The fetches above may finish in any
  // order, but the document must read in Modules-page order, and the due-header bookkeeping
  // depends on knowing each fragment's final index — so nothing is appended until every
  // item is in hand.
  let cursor = 0
  for (const { mod, items } of plan) {
    parts.push(moduleHeader(mod.name))
    for (let i = 0; i < items.length; i++) {
      const item = rendered[cursor++]
      if (item.isDueHeader) dueHeaderIndices.push(parts.length)
      parts.push(...item.parts)
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
      // Written for Google Docs, because that is where a locally saved export goes: the
      // people using this route cannot sign in, so they upload the file and open it with
      // Docs by hand. Leaving the CSS rules in makes the importer draw a grey line above
      // and below every due header — worse than no line at all. Neither route can give
      // them the blue rules; only the Docs API can, and that needs the sign-in they lack.
      // The UI says so before the file is written, and the Help Center repeats it.
      false,
    )
    writeFileSync(consumeSavePath(args.savePath), html, 'utf-8')
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
