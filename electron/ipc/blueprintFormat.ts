/**
 * Blueprint formatting constants and HTML helpers, shared by all three exporters.
 *
 * Specs are taken from the Boise State Blueprint Tools suite (`blueprint-tools/Code.gs`)
 * and the Blueprint template document — NOT the older Python Colab script, whose output
 * formatting was not up to standard.
 *
 * Two details QA treats as critical:
 *   1. The blue horizontal rules above AND below every "Due by …" header.
 *   2. The grey chip highlight behind Canvas tool names (Page, Assignment, …).
 */

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
 * QA treats both rules as required, so they are set on the paragraph as top/bottom borders.
 */
export function dueHeader(title: string): string {
  return (
    `<h3 style="${NO_INDENT}font-family:${FONT};font-size:15pt;font-weight:bold;color:${DEEP_BLUE};` +
    `border-top:1.5pt solid ${BORDER_BLUE};border-bottom:1.5pt solid ${BORDER_BLUE};` +
    'padding-top:2pt;padding-bottom:2pt;">' +
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
 * Convert heading tags inside a Canvas HTML body to Blueprint style: an 11pt Arial
 * paragraph whose text is bold black, followed by a bold red "(H1)…(H6)" level tag.
 * The rest of the body is Canvas-authored HTML and passes through unchanged — including
 * <hr> dividers, which authors insert deliberately via the Rich Content Editor. Only the
 * rules that collide with a due-date header are removed; see `stripEdgeRules`.
 */
export function formatCanvasBody(html: string | null | undefined): string {
  if (!html) {
    return '<p style="color:purple;font-weight:bold;">This item had no text — it may be unparseable by the API or empty by design. Please check manually.</p>'
  }
  let out = html
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
