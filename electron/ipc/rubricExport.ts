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
  /**
   * Optional because every use below already guards it with `?? []` or `?.`, which is the
   * honest reading: this is an unvalidated cast over JSON from a service we do not control,
   * and a criterion with no ratings array must not throw. Declaring it required only hid
   * that from the type checker.
   */
  ratings?: CanvasRating[]
}

/**
 * The subset the item picker needs. The list endpoint returns each rubric in full, criteria
 * included — this narrower view just says which fields `listRubricItems` reads.
 */
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

// decodeEntities, richTextToHtml and buildRubricTableHtml below are exported for
// rubricExport.test.ts and are not called outside this module. They are pure string functions
// and hold most of the logic that has actually been wrong here, so they are worth testing
// directly rather than only through the IPC handler, which needs a live Canvas to reach.

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
export function decodeEntities(s: string): string {
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
export function richTextToHtml(raw: string): string {
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
 * The points caption that heads a rating cell.
 *
 * A range's lower bound is not a field — it is the next rating down, which is why this needs
 * the whole list rather than one rating. Canvas returns ratings highest-first; if some rubric
 * does not, the comparison fails and the cell falls back to the fixed value rather than
 * printing an inverted range.
 *
 * "points", not Canvas's own "pts", to match the eCampus rubric template these documents are
 * read alongside. The `to >` phrasing is Canvas's and is kept deliberately: the lower bound is
 * exclusive, so 2.5 in "3 to >2.5" scores in the band below, not this one. The template's
 * hyphen form ("10-8") cannot say that, and rewriting it that way would state something about
 * how the rubric grades that is not true.
 */
function ratingPointsLabel(criterion: CanvasCriterion, ratings: CanvasRating[], i: number): string {
  const upper = ratings[i].points
  if (!criterion.criterion_use_range) return `${upper} points`
  const lower = ratings[i + 1] ? ratings[i + 1].points : 0
  return lower < upper ? `${upper} to >${lower} points` : `${upper} points`
}

/**
 * Build one rubric's HTML table (Criteria | rating levels | Points).
 * Adapts to however many rating columns Canvas provides — Boise State rubrics
 * are usually 4-level, but the count can vary per rubric.
 */
export function buildRubricTableHtml(rubric: CanvasRubricFull): string {
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

      // Points head the cell, centred and bold, matching the eCampus rubric template rather
      // than Canvas's own layout. Canvas puts them last and right-aligned, which reads fine on
      // screen where each cell is its own box, but in a printed table it left the number
      // stranded at the foot of a long description and hard to find. No font declared: CELL
      // already sets Arial 11pt on the cell and this inherits it, so there is one place that
      // decides the table's typeface rather than two that can drift apart.
      const pts =
        `<div style="text-align:center;font-weight:bold;margin-bottom:4px;">` +
        `${escapeHtml(ratingPointsLabel(c, ratings, i))}</div>`
      return `<td style="${CELL}vertical-align:top;">${pts}${lines.join('<br>')}</td>`
    }).join('')
    // "points" here too, so the row does not say "pts" in one column and "points" in the next.
    // Left unbolded on purpose: the template shows this column plain, and the bold in the
    // rating cells is what marks those out as the thing to look at.
    const ptsCell = `<td style="${CELL}text-align:center;">${c.points} points</td>`
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
 * heading. Kept separate from the file-write for Drive reuse. When `selectedIds` is provided,
 * only matching rubrics are included.
 *
 * One request, not one per rubric. This used to list the rubrics and then fetch each one again
 * for its criteria, on a comment asserting the list endpoint did not return them. It does:
 * `index` renders through `rubrics_json` → `rubric_json`, and `data` is in that serializer's
 * allowed-fields list, so criteria, ratings, long descriptions and criterion_use_range all
 * arrive with the list. `electron/ipc/__fixtures__/rubrics-list-response.json` is a captured
 * response showing exactly that.
 *
 * The second request was not merely redundant, it could lose data. The two endpoints resolve a
 * rubric differently — `index` reads the course's own rubrics (`@context.rubrics.active`),
 * while `show` goes through bookmarked rubric associations and 404s when it finds none. Both
 * authorize identically, so `show` can never succeed where `index` failed, only fail where it
 * succeeded. When it did, this function reported "could not be retrieved" for a rubric whose
 * criteria it was already holding.
 */
export async function buildRubricsHtml(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
): Promise<{ html: string; courseName: string; count: number } | null> {
  const course = await canvasGetOne<CanvasCourse>(`/courses/${ref.courseId}`, ref)
  const allList = await canvasGet<CanvasRubricFull>(`/courses/${ref.courseId}/rubrics`, ref)
  const list = selectedIds ? allList.filter((r) => selectedIds.has(String(r.id))) : allList
  if (list.length === 0) return null

  const parts: string[] = []
  parts.push(`<h1 style="font-family:${FONT};">${escapeHtml(`${course.name} Rubrics`)}</h1>`)

  progress?.(0, list.length)

  list.forEach((rubric, i) => {
    throwIfCancelled(cancel)
    parts.push(`<h2 style="font-family:${FONT};">${escapeHtml(rubric.title)}</h2>`)

    // Say so, loudly — but about the shape of the response rather than a failed request.
    //
    // The point of this warning has always been that "no criteria" and "criteria we could not
    // get" look identical once rendered, and rendering the second as the first turns a failure
    // into plausible data. With the per-rubric fetch gone there is no per-rubric failure to
    // catch: the one list request either returns or throws, and a throw is handled by the
    // caller. What remains is the response arriving without the field at all, which is the
    // same ambiguity from a different direction. An empty array is a real, empty rubric and is
    // rendered as one.
    const criteria = rubric.data ?? rubric.criteria
    if (criteria) {
      parts.push(buildRubricTableHtml(rubric))
    } else {
      parts.push(
        '<p style="color:purple;font-weight:bold;">' +
          'Canvas returned this rubric without any criteria data, so they are missing here — ' +
          'this is NOT an empty rubric. Please check it manually.</p>',
      )
    }
    parts.push('<p style="margin:0;">&nbsp;</p>')
    progress?.(i + 1, list.length)
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
