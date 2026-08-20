/**
 * Blueprint formatting constants and HTML helpers, shared by all three extractors.
 *
 * Specs are taken from the Boise State Blueprint Tools suite (`blueprint-tools/Code.gs`)
 * and the Blueprint template document — NOT the older Python Colab script, whose output
 * formatting was not up to standard.
 *
 * Two details QA treats as critical:
 *   1. The blue horizontal rules above AND below every "Due by …" header.
 *   2. The grey chip highlight behind Canvas tool names (Page, Assignment, …).
 */

import { annotateStyledHtml } from './styledHtml'

export const DEEP_BLUE = '#0033a0' // due-header text
export const RED = '#ff0000' // Canvas tool labels + heading-level tags
export const BORDER_BLUE = '#0000e7' // due-header rules (Code.gs: rgb(0, 0, 0.90588))
export const GREY_CHIP = '#e8eaed' // Canvas-tool chip highlight (Code.gs GREY_CHIP)
export const BLACK = '#000000'
export const FONT = 'Arial'

/** Blueprint has no hanging/left indents — force them off, since Google Docs' named
 *  heading styles can otherwise introduce their own indentation. */
const NO_INDENT = 'margin-left:0;text-indent:0;padding-left:0;'

/** Base run style for ordinary text: black Arial 11pt (Blueprint's NORMAL paragraph). */
export const BODY_RUN = `font-family:${FONT};font-size:11pt;color:${BLACK};`

/** Escape plain-text (titles, labels) for safe HTML embedding. Never use on Canvas HTML bodies. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Return `url` if it is safe to put in an href, or null if it is not.
 *
 * Only http and https survive. Course authors control these values, and the extracted .html
 * is opened directly from disk — a `javascript:` URL there executes in the file:// origin,
 * and `file:` targets local content. Relative URLs are rejected too: the document has no
 * meaningful base, so they cannot resolve to anything useful.
 */
export function safeLinkHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Wrap body parts in a complete HTML document (opens cleanly in Google Docs / Word). */
export function htmlDocument(title: string, bodyParts: string[]): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    `<body style="${BODY_RUN}${NO_INDENT}">`,
    ...bodyParts,
    '</body>',
    '</html>',
  ].join('\n')
}

/**
 * Module header — Heading 2, Arial 17pt bold black.
 *
 * Run styling lives on an inner <span> throughout this module: Google Docs' HTML import
 * maps <hN> to its built-in named heading style (own font, size and weight) and overrides
 * CSS set on the heading element itself. Span-level direct formatting survives the import.
 */
export function moduleHeader(name: string): string {
  return (
    `<h2 style="${NO_INDENT}font-family:${FONT};font-size:17pt;font-weight:bold;color:${BLACK};">` +
    `<span style="font-family:${FONT};font-size:17pt;font-weight:bold;color:${BLACK};">${escapeHtml(name)}</span>` +
    '</h2>'
  )
}

/**
 * Activity title — Blueprint spec (Code.gs:233,235): Heading 4, Arial 15pt, NOT bold, black.
 * `inner` may be pre-built HTML (e.g. an <a> for external links) when `escape` is false.
 */
export function itemTitle(inner: string, escape = true): string {
  const content = escape ? escapeHtml(inner) : inner
  return (
    `<h4 style="${NO_INDENT}font-family:${FONT};font-size:15pt;font-weight:normal;color:${BLACK};">` +
    `<span style="font-family:${FONT};font-size:15pt;font-weight:normal;color:${BLACK};">${content}</span>` +
    '</h4>'
  )
}

/**
 * Canvas tool label (Page, Assignment, Discussion, …) — Blueprint spec (Code.gs:245,433):
 * Arial 11pt bold red, on a grey #e8eaed chip highlight. QA relies on the chip as a
 * visual cue, so the background is applied to the tool name run itself.
 */
export function toolLabel(label: string): string {
  return (
    `<p style="${NO_INDENT}margin-top:0;margin-bottom:0;">` +
    `<span style="font-family:${FONT};font-size:11pt;font-weight:bold;color:${RED};` +
    `background-color:${GREY_CHIP};">${escapeHtml(label)}</span>` +
    '</p>'
  )
}

/**
 * Matches the Canvas Text Header used as a due-date marker on the Modules page.
 *
 * Deliberately keyed on the opening "Due by" only. Real eCampus courses vary the tail
 * freely — "11:59pm MT", "11:59 p.m. Mountain Time", "11:59 PM MST" — so requiring the
 * words "Mountain Time" (as an earlier version did) silently missed most real headers
 * and left them without their blue rules.
 *
 * Course authors also decorate these headers with attention-getters that sit *before*
 * the words — emoji arrows (⬇️), plain arrow glyphs (↓), asterisks, dashes. Those are
 * stripped before matching, so decoration never costs a header its blue rules. The
 * decoration itself is preserved in the rendered output.
 */
const LEADING_DECOR_RE = /^[^\p{L}\p{N}]+/u
const DUE_RE = /^due\s+by\b/i

/** Strip leading whitespace, emoji, arrows and punctuation so matching sees the words. */
function undecorate(title: string): string {
  return title.replace(LEADING_DECOR_RE, '')
}

/** True for Canvas text headers that are due-date markers. */
export function isDueHeader(title: string): boolean {
  return DUE_RE.test(undecorate(title))
}

/**
 * Blueprint due-by header — Heading 3, Arial 15pt bold #0033a0, with blue horizontal
 * rules above and below (Code.gs:601 — #0000e7, 1.5pt, 2pt padding, solid, top+bottom).
 * QA treats both rules as required.
 *
 * `cssBorders` must be false for HTML destined for Google Docs. Docs' importer cannot
 * represent a paragraph border, and rather than dropping the declaration it renders each
 * one as its own grey rule — so the CSS produces exactly the grey lines above and below
 * the header that it was meant to produce in blue. The real blue rules are applied after
 * upload by applyDueHeaderBorders() in googleDocs.ts, which is authoritative for that path.
 *
 * Keep it true for the local .html extraction, where nothing runs afterwards and the CSS is
 * the only thing drawing the rules.
 */
export function dueHeader(title: string, cssBorders = true): string {
  const borders = cssBorders
    ? `border-top:1.5pt solid ${BORDER_BLUE};border-bottom:1.5pt solid ${BORDER_BLUE};` +
      'padding-top:2pt;padding-bottom:2pt;'
    : ''
  return (
    `<h3 style="${NO_INDENT}font-family:${FONT};font-size:15pt;font-weight:bold;color:${DEEP_BLUE};` +
    borders +
    '">' +
    `<span style="font-family:${FONT};font-size:15pt;font-weight:bold;color:${DEEP_BLUE};">${escapeHtml(title)}</span>` +
    '</h3>'
  )
}

/** Non-due Canvas text header (SubHeader) — blue H3, 15pt. */
export function subHeader(title: string): string {
  return (
    `<h3 style="${NO_INDENT}font-family:${FONT};font-size:15pt;color:${BORDER_BLUE};">` +
    `<span style="font-family:${FONT};font-size:15pt;color:${BORDER_BLUE};">${escapeHtml(title)}</span>` +
    '</h3>'
  )
}

/**
 * Canvas' Rich Content Editor has a "Decorative Image" checkbox. Ticking it blanks the alt
 * text and stamps the tag with `data-decorative`, `role="presentation"` and/or
 * `aria-hidden` — and course authors tick it for virtually every icon, since that is what
 * the box is for. Consumers of the extracted HTML read those markers as permission to drop
 * the image (Google Docs' importer among them), so the extracted document loses exactly the
 * icons a course reviewer is looking at.
 *
 * A course-review document has to show every image regardless of how it was tagged, so the
 * decorative markers are stripped outright and the tag is given real alt text.
 *
 * Relative `src` values are resolved against the Canvas host at the same time. The API
 * returns some file URLs host-relative, and neither a document opened from file:// nor
 * Google's server-side importer has a base to resolve those against — a second, quieter
 * way for an image to vanish from the extraction.
 *
 * Quote-aware on purpose. `<img\b[^>]*>` stops at the first `>` even when that `>` sits
 * inside a quoted attribute value, where a browser treats it as ordinary text — so a tag
 * like `<img alt="><script>…">` would be matched only as far as the `>` inside `alt`, and
 * replacing that fragment with an icon marker would promote the rest of the attribute to
 * live markup in a document the reviewer opens from file://. Matching whole tags is what
 * prevents that. The three alternatives begin with distinct characters, so the engine has
 * nothing to backtrack through; a tag with an unbalanced quote simply does not match and
 * is passed through untouched, which is the safe outcome.
 */
const IMG_TAG_RE = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi

/**
 * Attribute patterns, all non-global: `.test()` on a /g regex advances lastIndex between
 * calls, and an <img> carries each of these at most once anyway.
 *
 * Two rules keep the strippers from corrupting a tag. Every pattern ends at a real
 * attribute boundary, so `role=presentationfoo=bar` is not read as `role=presentation`
 * with `foo=bar` fused onto the tag name. And no unquoted branch may begin with a quote
 * character, so a stripper can never consume a lone `"` and shift every attribute boundary
 * after it — which turned inert text into a live `onerror=` handler.
 */
const ATTR_END = '(?=[\\s>/])'
const UNQUOTED = '[^\\s>"\']*'
const DATA_DECORATIVE_RE = new RegExp(
  `\\sdata-decorative(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|${UNQUOTED}))?${ATTR_END}`,
  'i',
)
const ROLE_PRESENTATION_RE = new RegExp(
  `\\srole\\s*=\\s*(?:"\\s*(?:presentation|none)\\s*"|'\\s*(?:presentation|none)\\s*'` +
    `|presentation|none)${ATTR_END}`,
  'i',
)
// Value optional so `<img aria-hidden>` is caught, but `aria-hidden="false"` is not: the
// optional group fails to match "false", and the boundary check then fails on the `=`.
const ARIA_HIDDEN_RE = new RegExp(
  `\\saria-hidden(?:\\s*=\\s*(?:"\\s*true\\s*"|'\\s*true\\s*'|true))?${ATTR_END}`,
  'i',
)
const ALT_RE = new RegExp(`\\salt\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(${UNQUOTED}))`, 'i')
const SRC_RE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const SRC_ANY_RE = new RegExp(`\\ssrc\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(${UNQUOTED}))`, 'i')
const TITLE_RE = /\stitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i

/**
 * The Blueprint icon set. In the extraction these are replaced by a red text marker rather than
 * the image itself: a reviewer needs to know *which* icon the author used, and a picture of
 * it says less than its name — especially once the image has been through Google Docs' HTML
 * importer, which is where they have been going missing.
 */
const ICON_NAMES = [
  'Attention',
  'Audio',
  'Computer',
  'Document',
  'Discussion',
  'List',
  'Looking Ahead',
  'Policies',
  'Reading',
  'Schedule',
  'Syllabus',
  'Task',
  'Tip',
  'Upload',
  'Video',
  'Warning',
]

const ICON_LABELS = new Map(
  ICON_NAMES.map((name) => [name.toLowerCase().replace(/[^a-z]/g, ''), `[${name} Icon]`]),
)

function attrValue(tag: string, re: RegExp): string {
  const m = re.exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
}

/**
 * Reduce a file name to a comparison key: drop the folder, the extension, and the "-1"
 * Canvas appends when the same file is uploaded twice. `attention-1.svg` and `Attention.SVG`
 * both come out as `attention`.
 */
function fileNameKey(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name
  return base
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-\d+$/, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/**
 * Which Blueprint icon a file name refers to, or null for an ordinary image.
 *
 * Matched whole, not by substring. In the real courses these are named exactly for the icon
 * — `attention.svg`, `video.svg`, `discussion.svg` — so an exact key is enough, and it is
 * what keeps a photograph called `video-lecture.jpg` from being mistaken for the Video icon
 * and thrown away. Files outside the set (`AI Allowed.svg`) stay images.
 */
export function matchIconLabelFromFileName(fileName: string): string | null {
  return ICON_LABELS.get(fileNameKey(fileName)) ?? null
}

/**
 * The Canvas file id an <img> points at, or null if it is not a Canvas file.
 *
 * Canvas embeds these with no name at all — `src` is `/files/6932907/preview` and `alt` is
 * empty — so the id is the only handle on the tag, and the name has to be fetched with it.
 * `data-api-endpoint` is preferred because Canvas puts the canonical URL there.
 */
const API_ENDPOINT_FILE_RE = /\sdata-api-endpoint\s*=\s*(?:"|')[^"']*\/files\/(\d+)/i
const SRC_FILE_RE = /\ssrc\s*=\s*(?:"|')[^"']*\/files\/(\d+)/i

function canvasFileId(tag: string): string | null {
  return (API_ENDPOINT_FILE_RE.exec(tag) ?? SRC_FILE_RE.exec(tag))?.[1] ?? null
}

/** Every Canvas file id referenced by an <img> in this body, de-duplicated. */
export function collectImageFileIds(html: string): string[] {
  if (html.length > MAX_SCANNED_BODY_BYTES) return []
  const ids = new Set<string>()
  for (const tag of html.match(IMG_TAG_RE) ?? []) {
    const id = canvasFileId(tag)
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

/**
 * Which icon this <img> is, using the fetched file names where available and falling back
 * to whatever the tag itself carries. The fallback matters for bodies whose images were
 * embedded by URL rather than uploaded, where the name is in the `src` path.
 */
function matchIconLabel(tag: string, fileNames?: Map<string, string>): string | null {
  const id = canvasFileId(tag)
  const fetched = id ? fileNames?.get(id) : undefined
  if (fetched) return matchIconLabelFromFileName(fetched)

  for (const value of [attrValue(tag, SRC_ANY_RE), attrValue(tag, ALT_RE), attrValue(tag, TITLE_RE)]) {
    if (!value) continue
    const label = matchIconLabelFromFileName(value.split('?')[0])
    if (label) return label
  }
  return null
}

/**
 * Blueprint icon marker — Arial 11pt bold red, in square brackets.
 *
 * Trailing space because the image it replaces was doing that job: Canvas writes
 * `<img …>Learning Objectives` with nothing between them, and without it the marker runs
 * straight into the heading text.
 */
function iconMarker(label: string): string {
  return (
    `<span style="font-family:${FONT};font-size:11pt;font-weight:bold;color:${RED};">` +
    `${escapeHtml(label)}</span> `
  )
}

/**
 * Above this, the per-tag scanning below is skipped and the body is passed through as-is.
 *
 * `<img\b…>` restarts its scan at every `<img` and runs to the end of the string when no
 * closing `>` follows, so a body consisting of unterminated `<img ` tags costs quadratic
 * time — and this runs synchronously in the main process, where it would freeze the window
 * with the Stop button on it.
 *
 * This was 2_000_000 on the reasoning that nothing legitimate comes close to it. True, and
 * beside the point: the ceiling has to be set by where the quadratic case stops being
 * survivable, not by where a plausible body stops. Measured on the same pattern, 2MB of
 * unterminated tags takes around nine minutes. 100KB takes about a second.
 *
 * Keep this in step with the identical constant in styledHtml.ts.
 */
const MAX_SCANNED_BODY_BYTES = 100_000

function normalizeCanvasImages(
  html: string,
  baseUrl?: string,
  fileNames?: Map<string, string>,
): string {
  if (html.length > MAX_SCANNED_BODY_BYTES) return html
  return html.replace(IMG_TAG_RE, (tag) => {
    // A recognised icon becomes text and the image is dropped; everything below applies to
    // the ordinary images that remain.
    const iconLabel = matchIconLabel(tag, fileNames)
    if (iconLabel) return iconMarker(iconLabel)

    const wasDecorative =
      DATA_DECORATIVE_RE.test(tag) || ROLE_PRESENTATION_RE.test(tag) || ARIA_HIDDEN_RE.test(tag)

    let out = tag
      .replace(DATA_DECORATIVE_RE, '')
      .replace(ROLE_PRESENTATION_RE, '')
      .replace(ARIA_HIDDEN_RE, '')

    // Empty alt is the other half of the decorative marking, and on its own it is enough
    // for an importer to treat the image as skippable. Naming why it is empty is also
    // useful to the reviewer, who is often assessing the course's accessibility.
    const altMatch = ALT_RE.exec(out)
    const altText = (altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? '').trim()
    if (!altText) {
      const alt = ` alt="${
        wasDecorative ? 'Image (marked decorative in Canvas)' : 'Image (no alt text in Canvas)'
      }"`
      out = altMatch ? out.replace(ALT_RE, alt) : out.replace(/^<img\b/i, `<img${alt}`)
    }

    if (baseUrl) {
      out = out.replace(SRC_RE, (whole, doubleQuoted?: string, singleQuoted?: string) => {
        const src = doubleQuoted ?? singleQuoted ?? ''
        // A single leading slash only. `//host/path` and `/\host/path` both resolve to a
        // foreign origin, and rewriting one would turn a src that fails harmlessly in a
        // file:// document into a working request to whatever host the author named.
        if (!/^\/[^/\\]/.test(src)) return whole
        try {
          // Prefixed rather than run through escapeHtml: the captured text came out of an
          // HTML attribute and is already escaped, so escaping it again turned `&amp;` into
          // `&amp;amp;` and corrupted every Canvas URL carrying more than one query
          // parameter — which is all of the ones with a `verifier` token.
          return ` src="${new URL(baseUrl).origin}${src}"`
        } catch {
          return whole
        }
      })
    }

    return out
  })
}

/**
 * Stylized-HTML marker — Arial 11pt bold red, in square brackets, matching the icon markers
 * and the (H1)…(H6) level tags. No grey chip: that highlight is the Canvas tool cue and QA
 * reads it as one, so giving it to a second kind of label would dilute it.
 *
 * Block markers are their own zero-margin paragraph above the element they name. Inline ones
 * get a trailing space, for the same reason `iconMarker` does — they butt up against text.
 */
function styledHtmlMarker(label: string, inline: boolean): string {
  const span =
    `<span style="font-family:${FONT};font-size:11pt;font-weight:bold;color:${RED};">` +
    `[${escapeHtml(label)}]</span>`
  return inline ? `${span} ` : `<p style="${NO_INDENT}margin-top:0;margin-bottom:0;">${span}</p>`
}

/**
 * Convert heading tags inside a Canvas HTML body to Blueprint style: an 11pt Arial
 * paragraph whose text is bold black, followed by a bold red "(H1)…(H6)" level tag, and
 * name each piece of stylized HTML with a red bold marker of its own.
 * The rest of the body is Canvas-authored HTML and passes through unchanged — including
 * <hr> dividers, which authors insert deliberately via the Rich Content Editor. Only the
 * rules that collide with a due-date header are removed; see `stripEdgeRules`.
 *
 * The three passes are ordered. Images first, so that the stylized-HTML pass sees only the
 * <img> tags that survived — a Blueprint icon has already become text by then and cannot
 * pick up a stray [Float Left] on its way out. Stylized HTML second, before the headings
 * become <p> elements of this module's own making: the paragraph signature keys on a blue
 * background, and running it over generated markup means auditing generated markup against
 * it forever.
 *
 * `baseUrl` is the Canvas host, used to resolve host-relative image sources. Omitting it
 * only means those images keep the src Canvas gave them. `fileNames` maps Canvas file ids
 * to their display names, which is how icons are recognised; without it only images whose
 * name is visible in the tag can be matched.
 */
export function formatCanvasBody(
  html: string | null | undefined,
  baseUrl?: string,
  fileNames?: Map<string, string>,
): string {
  if (!html) {
    return '<p style="color:purple;font-weight:bold;">This item had no text — it may be unparseable by the API or empty by design. Please check manually.</p>'
  }
  let out = annotateStyledHtml(normalizeCanvasImages(html, baseUrl, fileNames), styledHtmlMarker)
  for (let level = 1; level <= 6; level++) {
    out = out.replace(
      new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'gi'),
      (_m, inner) =>
        `<p style="${BODY_RUN}${NO_INDENT}">` +
        `<span style="${BODY_RUN}font-weight:bold;">${inner}</span>` +
        `<span style="font-family:${FONT};font-size:11pt;font-weight:bold;color:${RED};"> (H${level})</span>` +
        '</p>',
    )
  }
  return out
}

/**
 * Remove <hr> rules from the very start or very end of a body — and only there.
 *
 * Canvas page and assignment templates commonly open or close a body with a divider.
 * Google Docs imports each one as a thin grey rule, and where such a divider sits directly
 * against a due-date header it prints immediately beside the blue Blueprint rules, which is
 * the cue QA reads. Dividers anywhere inside a body are author-inserted structure and are
 * left alone; the caller applies this only to the bodies bracketing a due header.
 *
 * Empty paragraphs are allowed to sit between the rule and the edge (editors leave them
 * behind) and are preserved, so only the rule itself disappears and spacing is unchanged.
 */
const RULE_SRC = '<hr\\b[^>]*>(?:\\s*</hr>)?'
const EMPTY_P_SRC = '<p[^>]*>(?:\\s|&nbsp;|<br\\s*/?>)*</p>'
const EDGE_RUN_SRC = `(?:\\s*(?:${RULE_SRC}|${EMPTY_P_SRC}))+`
const LEADING_RUN_RE = new RegExp(`^${EDGE_RUN_SRC}`, 'i')
// Trailing `\s*` so a newline after the final rule does not hide it from the `$` anchor.
const TRAILING_RUN_RE = new RegExp(`${EDGE_RUN_SRC}\\s*$`, 'i')
const RULE_RE = new RegExp(RULE_SRC, 'gi')

export function stripEdgeRules(html: string, edge: 'leading' | 'trailing'): string {
  const re = edge === 'leading' ? LEADING_RUN_RE : TRAILING_RUN_RE
  return html.replace(re, (run) => run.replace(RULE_RE, ''))
}
