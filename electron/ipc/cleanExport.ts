import { IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'fs'
import { consumeSavePath } from './savePaths'
import {
  parseCourseUrl,
  canvasGet,
  canvasGetOne,
  CourseRef,
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
  CanvasAssignment,
  CanvasCourse,
  CanvasDiscussion,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  CanvasQuiz,
  FileNameCache,
  assignmentToolName,
  fetchFileName,
  itemKey,
  makeProgressReporter,
  seedFileNames,
} from './canvasExport'
import {
  collectIconFileIds,
  collectImageFileIds,
  escapeHtml,
  htmlDocument,
  isDueHeader,
  safeLinkHref,
} from './blueprintFormat'
import {
  ItemDates,
  TocEntry,
  activity,
  contentsList,
  courseTitle,
  datesText,
  documentSubtitle,
  dueByText,
  formatCleanBody,
  sectionHeading,
  sectionLabel,
} from './cleanFormat'
import { loadIconDataUri } from './iconImages'

export interface CleanOptions {
  /** Start every activity on a new page. Files and links stay with the activity before them. */
  pageBreaks: boolean
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = { pageBreaks: true }

interface ExportCleanArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
  options?: Partial<CleanOptions>
}

/** One module item, fetched and ready to place. */
type Fetched =
  | { kind: 'header'; title: string; due: boolean }
  | {
      kind: 'activity'
      title: string
      titleIsHtml?: boolean
      /** The title without markup, for the contents list. */
      plainTitle?: string
      tool: string
      body: string
      dates: string
      /** Gets the module's "Due by" text. Only things a student hands in or posts to. */
      scheduled: boolean
      /** Files and links are short: they stay on the page of whatever comes before them. */
      compact: boolean
    }

/** Resolves a Canvas file id to the icon's picture, once per extraction. */
type IconCache = Map<string, Promise<string | null>>

async function cleanBody(
  html: string | null | undefined,
  ref: CourseRef,
  files: FileNameCache,
  icons: IconCache,
): Promise<string> {
  if (!html) return formatCleanBody(html, { baseUrl: ref.baseUrl })

  const ids = collectImageFileIds(html)
  const fileNames = new Map<string, string>()
  await mapWithConcurrency(ids.length, CANVAS_CONCURRENCY, async (i) => {
    const name = await fetchFileName(ids[i], ref, files)
    if (name) fileNames.set(ids[i], name)
  })

  const iconIds = collectIconFileIds(html, fileNames)
  const iconData = new Map<string, string>()
  await mapWithConcurrency(iconIds.length, CANVAS_CONCURRENCY, async (i) => {
    let pending = icons.get(iconIds[i])
    if (!pending) {
      pending = loadIconDataUri(iconIds[i], ref)
      icons.set(iconIds[i], pending)
    }
    const uri = await pending
    if (uri) iconData.set(iconIds[i], uri)
  })

  return formatCleanBody(html, { baseUrl: ref.baseUrl, fileNames, iconData })
}

async function fetchItem(
  item: CanvasModuleItem,
  ref: CourseRef,
  zone: string | null | undefined,
  files: FileNameCache,
  icons: IconCache,
): Promise<Fetched> {
  const when = (d: ItemDates) => datesText(d, zone)
  switch (item.type) {
    case 'Page': {
      const page = await canvasGetOne<CanvasPage>(
        `/courses/${ref.courseId}/pages/${item.page_url}`,
        ref,
      )
      return {
        kind: 'activity',
        title: page.title,
        tool: 'Page',
        body: await cleanBody(page.body, ref, files, icons),
        dates: '',
        scheduled: false,
        compact: false,
      }
    }
    case 'Assignment': {
      const a = await canvasGetOne<CanvasAssignment>(
        `/courses/${ref.courseId}/assignments/${item.content_id}`,
        ref,
      )
      return {
        kind: 'activity',
        title: a.name,
        tool: assignmentToolName(a),
        body: await cleanBody(a.description, ref, files, icons),
        dates: when({ due: a.due_at, unlock: a.unlock_at, lock: a.lock_at }),
        scheduled: true,
        compact: false,
      }
    }
    case 'Discussion': {
      const d = await canvasGetOne<CanvasDiscussion>(
        `/courses/${ref.courseId}/discussion_topics/${item.content_id}`,
        ref,
      )
      return {
        kind: 'activity',
        title: d.title,
        tool: 'Discussion',
        body: await cleanBody(d.message, ref, files, icons),
        dates: when({
          due: d.assignment?.due_at,
          unlock: d.delayed_post_at ?? d.assignment?.unlock_at,
          lock: d.lock_at ?? d.assignment?.lock_at,
        }),
        scheduled: true,
        compact: false,
      }
    }
    case 'Quiz': {
      const q = await canvasGetOne<CanvasQuiz>(
        `/courses/${ref.courseId}/quizzes/${item.content_id}`,
        ref,
      )
      return {
        kind: 'activity',
        title: q.title,
        tool: 'Quiz (Classic)',
        body: await cleanBody(q.description, ref, files, icons),
        dates: when({ due: q.due_at, unlock: q.unlock_at, lock: q.lock_at }),
        scheduled: true,
        compact: false,
      }
    }
    case 'File':
      return {
        kind: 'activity',
        title: item.title,
        tool: 'File',
        body: '',
        dates: '',
        scheduled: false,
        compact: true,
      }
    case 'ExternalUrl': {
      const url = safeLinkHref(item.external_url)
      return {
        kind: 'activity',
        title: url
          ? `<a href="${escapeHtml(url)}">${escapeHtml(item.title)}</a>`
          : escapeHtml(item.title),
        titleIsHtml: true,
        plainTitle: item.title,
        tool: 'External Link',
        body: '',
        dates: '',
        scheduled: false,
        compact: true,
      }
    }
    case 'SubHeader':
      return { kind: 'header', title: item.title, due: isDueHeader(item.title) }
    default:
      return {
        kind: 'activity',
        title: item.title,
        tool: item.type,
        body: '',
        dates: '',
        scheduled: false,
        compact: true,
      }
  }
}

/**
 * Build the clean course document: module names as Heading 1, activities as Heading 2, a
 * contents list at the top, real dates from Canvas, and icons as pictures.
 */
export async function buildCleanHtml(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
  options: CleanOptions = DEFAULT_CLEAN_OPTIONS,
): Promise<{ html: string; courseName: string; moduleCount: number }> {
  const course = await canvasGetOne<CanvasCourse>(
    `/courses/${ref.courseId}?include[]=syllabus_body`,
    ref,
  )
  const zone = course.time_zone
  const files: FileNameCache = new Map()
  const icons: IconCache = new Map()
  await seedFileNames(ref, files)

  const modules = await canvasGet<CanvasModule>(`/courses/${ref.courseId}/modules`, ref)
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

  const flat = plan.flatMap((p) => p.items)
  // Home page and syllabus count as work too, so the bar does not sit at 0 while they load.
  const total = flat.length + 2
  let done = 0
  progress?.(0, total)

  const front = await (async () => {
    try {
      const fp = await canvasGetOne<CanvasPage>(`/courses/${ref.courseId}/front_page`, ref)
      return await cleanBody(fp.body, ref, files, icons)
    } catch (err) {
      if (isCancellation(err)) throw err
      return ''
    }
  })()
  progress?.(++done, total)
  const syllabus = await cleanBody(course.syllabus_body, ref, files, icons)
  progress?.(++done, total)

  const fetched = await mapWithConcurrency(flat.length, CANVAS_CONCURRENCY, async (i) => {
    throwIfCancelled(cancel)
    const result = await fetchItem(flat[i], ref, zone, files, icons)
    progress?.(++done, total)
    return result
  })

  // Assembly is a separate, ordered pass: fetches finish in any order, and the "Due by"
  // text each activity carries depends on the headers that came before it.
  const toc: TocEntry[] = []
  const body: string[] = []

  if (front) {
    toc.push({ level: 1, text: 'Home Page', id: 'sec-home' })
    body.push(sectionHeading('Home Page', 'sec-home'), front)
  }
  if (course.syllabus_body) {
    toc.push({ level: 1, text: 'Syllabus', id: 'sec-syllabus' })
    body.push(sectionHeading('Syllabus', 'sec-syllabus'), syllabus)
  }

  let cursor = 0
  plan.forEach(({ mod, items }, m) => {
    const modId = `mod-${m + 1}`
    toc.push({ level: 1, text: mod.name, id: modId })
    body.push(sectionHeading(mod.name, modId))

    // A module's own page break already starts its first activity on a fresh page.
    let first = true
    let dueBy: string | null = null
    items.forEach((_item, i) => {
      const f = fetched[cursor++]
      if (f.kind === 'header') {
        // The header text moves onto the activities under it rather than printing as a
        // heading of its own; other text headers become a quiet label.
        dueBy = f.due ? dueByText(f.title) : null
        if (!f.due) body.push(sectionLabel(f.title))
        return
      }
      const id = `act-${m + 1}-${i + 1}`
      toc.push({ level: 2, text: f.plainTitle ?? f.title, id })
      body.push(
        activity({
          title: f.title,
          titleIsHtml: f.titleIsHtml,
          id,
          tool: f.tool,
          dueBy: f.scheduled ? dueBy : null,
          dates: f.dates,
          body: f.body,
          pageBreak: options.pageBreaks && !first && !f.compact,
        }),
      )
      first = false
    })
  })

  const parts = [
    courseTitle(course.name),
    documentSubtitle('Course content document'),
    contentsList(toc),
    ...body,
  ]

  return {
    html: htmlDocument(`${course.name} — Course Document`, parts),
    courseName: course.name,
    moduleCount: plan.length,
  }
}

export async function handleCleanExport(
  event: IpcMainInvokeEvent,
  args: ExportCleanArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) {
    return {
      ok: false,
      message:
        'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345',
    }
  }
  const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
  const cancel = beginJob(args.jobId)
  const ref: CourseRef = { ...parsed, token: args.token, cancel }
  try {
    const { html, courseName, moduleCount } = await buildCleanHtml(
      ref,
      selectedIds,
      cancel,
      makeProgressReporter(event, args.jobId),
      { ...DEFAULT_CLEAN_OPTIONS, ...args.options },
    )
    writeFileSync(consumeSavePath(args.savePath), html, 'utf-8')
    return {
      ok: true,
      message: `Extracted "${courseName}" — ${moduleCount} module${moduleCount === 1 ? '' : 's'}.`,
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Extraction cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
