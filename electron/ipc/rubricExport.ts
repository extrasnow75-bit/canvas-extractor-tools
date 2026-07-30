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
import { FONT, htmlDocument, escapeHtml } from './blueprintFormat'
import { makeProgressReporter } from './canvasExport'

interface RubricExportArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
}

interface CanvasCourse { id: number; name: string }

interface CanvasRating {
  id: string
  description: string
  long_description?: string
  points: number
}

interface CanvasCriterion {
  id: string
  description: string
  long_description?: string
  points: number
  ratings: CanvasRating[]
}

/** List endpoint returns id/title; criteria arrive as `data` on the single-rubric GET. */
interface CanvasRubricRef {
  id: string | number
  title: string
}

interface CanvasRubricFull {
  id: string | number
  title: string
  points_possible: number
  data?: CanvasCriterion[]
  criteria?: CanvasCriterion[]
}

const CELL = `border:1px solid #000;padding:6px;font-family:${FONT};font-size:11pt;`
const HEAD = `${CELL}background:#f3f4f6;font-weight:bold;text-align:center;`

/**
 * Build one rubric's HTML table (Criteria | rating levels | Points).
 * Adapts to however many rating columns Canvas provides — Boise State rubrics
 * are usually 4-level, but the count can vary per rubric.
 */
function buildRubricTableHtml(rubric: CanvasRubricFull): string {
  const criteria = rubric.data ?? rubric.criteria ?? []

  const maxRatings = criteria.reduce((m, c) => Math.max(m, (c.ratings ?? []).length), 0)
  const numCols = maxRatings || 1

  const firstCriteria = criteria.find((c) => (c.ratings ?? []).length === maxRatings)
  const ratingHeaders = Array.from(
    { length: numCols },
    (_, i) => firstCriteria?.ratings[i]?.description ?? `Level ${i + 1}`,
  )

  const rows: string[] = []

  // Header row 1: Criteria (rowspan) | Ratings (colspan) | Points (rowspan)
  rows.push(
    '<tr>' +
      `<th rowspan="2" style="${HEAD}">Criteria</th>` +
      `<th colspan="${numCols}" style="${HEAD}">Ratings</th>` +
      `<th rowspan="2" style="${HEAD}">Points</th>` +
      '</tr>',
  )
  // Header row 2: individual rating level names
  rows.push('<tr>' + ratingHeaders.map((h) => `<th style="${HEAD}">${escapeHtml(h)}</th>`).join('') + '</tr>')

  // Data rows — one per criterion
  for (const c of criteria) {
    const ratings = c.ratings ?? []
    const critCell =
      `<td style="${CELL}vertical-align:top;"><strong>${escapeHtml(c.description)}</strong>` +
      (c.long_description ? `<br>${escapeHtml(c.long_description)}` : '') +
      '</td>'
    const ratingCells = Array.from({ length: numCols }, (_, i) =>
      i < ratings.length
        ? `<td style="${CELL}vertical-align:top;"><strong>${ratings[i].points}</strong><br>${escapeHtml(ratings[i].description)}</td>`
        : `<td style="${CELL}"></td>`,
    ).join('')
    const ptsCell = `<td style="${CELL}text-align:center;">${c.points} pts</td>`
    rows.push('<tr>' + critCell + ratingCells + ptsCell + '</tr>')
  }

  // Footer: Total Points
  rows.push(
    '<tr>' +
      `<td colspan="${numCols + 1}" style="${CELL}text-align:right;"><strong>Total Points</strong></td>` +
      `<td style="${CELL}text-align:center;"><strong>${rubric.points_possible} points</strong></td>` +
      '</tr>',
  )

  return `<table style="border-collapse:collapse;width:100%;">${rows.join('')}</table>`
}

/** List every rubric in the course, for the picker UI. */
export async function listRubricItems(ref: CourseRef): Promise<PickerItem[]> {
  const list = await canvasGet<CanvasRubricRef>(`/courses/${ref.courseId}/rubrics`, ref)
  return list.map((r) => ({ id: String(r.id), label: r.title }))
}

/**
 * Build the full "Rubrics" HTML for a course — one document, each rubric under its title
 * heading. Does the two-step fetch (list → per-rubric detail) since the list endpoint
 * does not return full criteria. Kept separate from the file-write for Drive reuse.
 * When `selectedIds` is provided, only matching rubrics are included.
 */
export async function buildRubricsHtml(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
): Promise<{ html: string; courseName: string; count: number } | null> {
  const course = await canvasGetOne<CanvasCourse>(`/courses/${ref.courseId}`, ref)
  const allList = await canvasGet<CanvasRubricRef>(`/courses/${ref.courseId}/rubrics`, ref)
  const list = selectedIds ? allList.filter((r) => selectedIds.has(String(r.id))) : allList
  if (list.length === 0) return null

  const parts: string[] = []
  parts.push(`<h1 style="font-family:${FONT};">${escapeHtml(`${course.name} Rubrics`)}</h1>`)

  let done = 0
  progress?.(0, list.length)

  for (const rubricRef of list) {
    throwIfCancelled(cancel)
    // Two-step fetch: the single-rubric endpoint returns the full criteria (`data`).
    let full: CanvasRubricFull | null = null
    let failure = ''
    try {
      full = await canvasGetOne<CanvasRubricFull>(
        `/courses/${ref.courseId}/rubrics/${rubricRef.id}`,
        ref,
      )
    } catch (err) {
      if (isCancellation(err)) throw err
      failure = err instanceof Error ? err.message : 'unknown error'
    }

    parts.push(
      `<h2 style="font-family:${FONT};">${escapeHtml(full?.title || rubricRef.title)}</h2>`,
    )

    if (full) {
      parts.push(buildRubricTableHtml(full))
    } else {
      // Say so, loudly. This used to substitute an empty rubric with 0 points possible, which
      // is indistinguishable from a rubric that genuinely has no criteria — so a failed fetch
      // silently became plausible-looking data. One bad rubric still must not abort the
      // export, so the run continues with the failure recorded in place.
      parts.push(
        '<p style="color:purple;font-weight:bold;">' +
          'This rubric could not be retrieved from Canvas, so its criteria are missing here — ' +
          'this is NOT an empty rubric. Please check it manually. ' +
          `(${escapeHtml(failure)})</p>`,
      )
    }
    parts.push('<p style="margin:0;">&nbsp;</p>')
    done++
    progress?.(done, list.length)
  }

  return {
    html: htmlDocument(`${course.name} Rubrics`, parts),
    courseName: course.name,
    count: list.length,
  }
}

export async function handleRubricExport(
  event: IpcMainInvokeEvent,
  args: RubricExportArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'Invalid Canvas course URL.' }

  const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
  const cancel = beginJob(args.jobId)
  const ref: CourseRef = { ...parsed, token: args.token, cancel }
  try {
    const result = await buildRubricsHtml(
      ref,
      selectedIds,
      cancel,
      makeProgressReporter(event, args.jobId),
    )
    if (!result) return { ok: false, message: 'No rubrics found in this course.' }

    writeFileSync(args.savePath, result.html, 'utf-8')
    return {
      ok: true,
      message: `Exported ${result.count} rubric${result.count !== 1 ? 's' : ''} from "${result.courseName}".`,
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Export cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
