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
  mapWithConcurrency,
  CANVAS_CONCURRENCY,
} from './canvasUtils'
import { FONT, htmlDocument, escapeHtml, LANDSCAPE_PAGE } from './blueprintFormat'
import { MAX_SCANNED_BODY_BYTES } from './styledHtml'
import { makeProgressReporter } from './canvasExport'
import { consumeSavePath } from './savePaths'

interface RubricExportArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
}

interface CanvasCourse { id: number; name: string }

// Canvas sends JSON null rather than omitting these, so the unions are `| null`, not just
// optional — `long_description?: string` would let `.trim()` past the type checker.
interface CanvasRating {
  id: string
  description: string
  /** The paragraph shown inside the rating cell in Canvas. The short level name is `description`. */
  long_description?: string | null
  points: number
}

interface CanvasCriterion {
  id: string
  description: string
  long_description?: string | null
  points: number
  /**
   * Set by Canvas when the criterion scores as a band rather than a fixed value. It is what
   * makes Canvas render "4 to >3 pts" instead of "4 pts", so the range is shown only when
   * this is true — inventing one on a fixed-value rubric would misstate how it is graded.
   * Comes back as null, not false, on rubrics that do not use ranges.
   */
  criterion_use_range?: boolean | null
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

// Criteria and Points are fixed; the rating columns divide what is left. Points only ever holds
// something like "10 pts", so it takes the smallest share. On a landscape page these put a
// three-level rubric at roughly 2.2in of criteria and 2.3in per rating — enough that the rating
// descriptions, which are the longest text in the table, wrap in whole words rather than letters.
const CRITERIA_WIDTH = 22
const POINTS_WIDTH = 8

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
}

const ENTITY_RE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(nbsp|lt|gt|quot|apos|amp));/g

/**
 * Decode the entities Canvas actually emits.
 *
 * One pass, not one per entity kind. Chained replaces re-scan each other's output, so
 * `&#38;lt;` — a literal, escaped `&lt;` — decoded to `&` and then that `&` combined with the
 * following `lt;` to yield `<`, silently changing what the rubric said. A single scan resumes
 * after each match and cannot do that.
 *
 * Out-of-range numeric references are left as written: `String.fromCodePoint` throws a
 * RangeError above 0x10FFFF, and that throw escapes the per-rubric error handling and aborts
 * the whole course extraction. Lone surrogates are rejected for a quieter version of the same
 * problem — they do not throw, they reach writeFileSync and land in the file as U+FFFD.
 * Control characters are rejected because they have no meaning in a document cell.
 */
function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (match, dec: string, hex: string, name: string) => {
    if (name) return ENTITIES[name.toLowerCase()]
    const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16)
    if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return match
    if (code >= 0xd800 && code <= 0xdfff) return match
    return String.fromCodePoint(code)
  })
}

/**
 * Render a rubric long description as document HTML.
 *
 * Rubrics authored in Canvas's own rubric editor store these as plain text, and that is the
 * common case — it returns escaped immediately. Rubrics that arrived by course copy, import,
 * or the rich content editor store HTML instead, and escaping that wholesale prints literal
 * `<p>` tags into the extracted document. Tags are not passed through: block boundaries and
 * list items become line breaks, everything else is dropped. Inline emphasis is lost, which
 * is the deliberate trade — a table cell holding untrusted course HTML would carry its
 * styling, width and scripts into a document that is opened straight from disk.
 *
 * Line breaks travel as real newlines rather than a sentinel character, so nothing this
 * writes can collide with the text it is rewriting. Plain-text descriptions take the same
 * splitting pass: Canvas stores their paragraph breaks as newlines, which HTML would
 * otherwise collapse into single spaces.
 *
 * Oversized input skips the tag pass and is treated as plain text. `<[^>]*>` restarts at
 * every `<` and scans to end-of-string when no `>` follows, so unterminated tags cost
 * quadratic time on the main-process thread: measured 37ms at 10KB, 866ms at 50KB, 3.5s at
 * 100KB. This is the same pattern MAX_SCANNED_BODY_BYTES was introduced for elsewhere, and
 * five passes here make it worse per byte than the case that first justified the ceiling.
 * Degrading to plain text means a huge malformed description shows its tags rather than
 * hanging the app — no rubric field that exists in practice comes near the limit.
 */
function richTextToHtml(raw: string): string {
  const flattened = raw.length <= MAX_SCANNED_BODY_BYTES && /<[a-z!/]/i.test(raw)
    ? decodeEntities(
        raw
          .replace(/<li\b[^>]*>/gi, '\n\u2022 ')
          .replace(/<\/(?:p|div|li|tr|ul|ol|h[1-6])\s*>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, ''),
      )
    : raw
  return flattened
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== '\u2022')
    .map(escapeHtml)
    .join('<br>')
}

/**
 * The points caption Canvas puts at the foot of a rating cell.
 *
 * A range's lower bound is not a field — it is the next rating down, which is why this needs
 * the whole list rather than one rating. Canvas returns ratings highest-first; if some rubric
 * does not, the comparison fails and the cell falls back to the fixed value rather than
 * printing an inverted range.
 */
function ratingPointsLabel(criterion: CanvasCriterion, ratings: CanvasRating[], i: number): string {
  const upper = ratings[i].points
  if (!criterion.criterion_use_range) return `${upper} pts`
  const lower = ratings[i + 1] ? ratings[i + 1].points : 0
  return lower < upper ? `${upper} to >${lower} pts` : `${upper} pts`
}

/**
 * Build one rubric's HTML table (Criteria | rating levels | Points).
 * Adapts to however many rating columns Canvas provides — Boise State rubrics
 * are usually 4-level, but the count can vary per rubric.
 */
function buildRubricTableHtml(rubric: CanvasRubricFull): string {
  const criteria = rubric.data ?? rubric.criteria ?? []

  const maxRatings = criteria.reduce((m, c) => Math.max(m, (c.ratings ?? []).length), 0)
  const numCols = maxRatings || 1

  // `?.` after `ratings` as well as after `firstCriteria`: a criterion can come back with no
  // ratings array at all, and when it does maxRatings is 0, numCols falls back to 1, and that
  // criterion is the one `find` returns.
  //
  // Trimmed, because the cell below compares a trimmed label against these to decide whether
  // to repeat the level name. Untrimmed, a single trailing space — routine in rubrics built by
  // copy-paste — made every comparison in that column unequal and repeated the name in every
  // cell, which is the exact opposite of what the comparison is for.
  const firstCriteria = criteria.find((c) => (c.ratings ?? []).length === maxRatings)
  const ratingHeaders = Array.from(
    { length: numCols },
    (_, i) => firstCriteria?.ratings?.[i]?.description?.trim() || `Level ${i + 1}`,
  )

  const ratingWidth = ((100 - CRITERIA_WIDTH - POINTS_WIDTH) / numCols).toFixed(2)
  const rows: string[] = []

  // One header row, not two.
  //
  // This used to be a Criteria/Ratings/Points row above a row of level names, using rowspan and
  // colspan. Google Docs takes its column widths from the first row without expanding spans, so
  // a five-column table whose first row held three cells left the last two columns with no width
  // at all: they collapsed to one character per line and a two-page rubric became fourteen. The
  // "Ratings" grouping label was the only thing the spanned row added, and it is not worth a
  // structure that the target application reads wrongly.
  rows.push(
    '<tr>' +
      `<th style="${HEAD}">Criteria</th>` +
      ratingHeaders.map((h) => `<th style="${HEAD}">${escapeHtml(h)}</th>`).join('') +
      `<th style="${HEAD}">Points</th>` +
      '</tr>',
  )

  // Data rows — one per criterion
  for (const c of criteria) {
    const ratings = c.ratings ?? []
    const critLong = (c.long_description ?? '').trim()
    const critCell =
      `<td style="${CELL}vertical-align:top;"><strong>${escapeHtml(c.description)}</strong>` +
      (critLong ? `<br>${richTextToHtml(critLong)}` : '') +
      '</td>'
    const ratingCells = Array.from({ length: numCols }, (_, i) => {
      const r = ratings[i]
      if (!r) return `<td style="${CELL}"></td>`

      const label = (r.description ?? '').trim()
      const body = (r.long_description ?? '').trim()
      const lines: string[] = []
      // The level name is already the column header, so repeating it in every cell would only
      // push the description that distinguishes this cell further down. It is written out only
      // when this criterion names its levels differently from the header row — which happens on
      // rubrics whose criteria do not share one scale — or when there is no description to show.
      if (label && (label !== ratingHeaders[i] || !body)) {
        lines.push(`<strong>${escapeHtml(label)}</strong>`)
      }
      if (body) lines.push(richTextToHtml(body))

      // Points sit under the description, right-aligned, the way Canvas positions them.
      const pts =
        `<div style="text-align:right;margin-top:4px;">` +
        `${escapeHtml(ratingPointsLabel(c, ratings, i))}</div>`
      return `<td style="${CELL}vertical-align:top;">${lines.join('<br>')}${pts}</td>`
    }).join('')
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

  // Widths are declared here rather than on the cells. A <colgroup> states one width per real
  // column, so it cannot be thrown off by a span the way per-cell widths were, and it is the
  // form Google Docs emits in its own HTML export. The footer's colspan is left alone: it is
  // the last row, and with the widths already fixed here nothing reads column sizes from it.
  const colgroup =
    '<colgroup>' +
    `<col style="width:${CRITERIA_WIDTH}%;">` +
    ratingHeaders.map(() => `<col style="width:${ratingWidth}%;">`).join('') +
    `<col style="width:${POINTS_WIDTH}%;">` +
    '</colgroup>'

  return `<table style="border-collapse:collapse;width:100%;">${colgroup}${rows.join('')}</table>`
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

  // The detail fetches run concurrently — a course can hold dozens of rubrics, and one
  // round trip each was the whole cost of this extraction. Results are collected first and
  // written out afterwards so the document still follows Canvas's rubric order.
  const fetched = await mapWithConcurrency(list.length, CANVAS_CONCURRENCY, async (i) => {
    throwIfCancelled(cancel)
    // Two-step fetch: the single-rubric endpoint returns the full criteria (`data`).
    let full: CanvasRubricFull | null = null
    let failure = ''
    try {
      full = await canvasGetOne<CanvasRubricFull>(
        `/courses/${ref.courseId}/rubrics/${list[i].id}`,
        ref,
      )
    } catch (err) {
      if (isCancellation(err)) throw err
      failure = err instanceof Error ? err.message : 'unknown error'
    }
    done++
    progress?.(done, list.length)
    return { full, failure }
  })

  list.forEach((rubricRef, i) => {
    const { full, failure } = fetched[i]

    parts.push(
      `<h2 style="font-family:${FONT};">${escapeHtml(full?.title || rubricRef.title)}</h2>`,
    )

    if (full) {
      parts.push(buildRubricTableHtml(full))
    } else {
      // Say so, loudly. This used to substitute an empty rubric with 0 points possible, which
      // is indistinguishable from a rubric that genuinely has no criteria — so a failed fetch
      // silently became plausible-looking data. One bad rubric still must not abort the
      // extraction, so the run continues with the failure recorded in place.
      parts.push(
        '<p style="color:purple;font-weight:bold;">' +
          'This rubric could not be retrieved from Canvas, so its criteria are missing here — ' +
          'this is NOT an empty rubric. Please check it manually. ' +
          `(${escapeHtml(failure)})</p>`,
      )
    }
    parts.push('<p style="margin:0;">&nbsp;</p>')
  })

  return {
    html: htmlDocument(`${course.name} Rubrics`, parts, LANDSCAPE_PAGE),
    courseName: course.name,
    count: list.length,
  }
}

export async function handleRubricExport(
  event: IpcMainInvokeEvent,
  args: RubricExportArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }

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

    writeFileSync(consumeSavePath(args.savePath), result.html, 'utf-8')
    return {
      ok: true,
      message: `Extracted ${result.count} rubric${result.count !== 1 ? 's' : ''} from "${result.courseName}".`,
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Extraction cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
