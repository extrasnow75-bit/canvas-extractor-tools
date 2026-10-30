/**
 * Formatting for the clean course document: course content with the eCampus markup taken out
 * and the eCampus templates drawn the way they look in Canvas.
 *
 * The QA extraction (blueprintFormat.ts) exists to be reviewed: it prints "(H2)" after
 * headings, names every stylized-HTML template in red, replaces icons with "[Tip Icon]" and
 * highlights links back into Canvas. None of that belongs in a document someone reads. This
 * module is the reader's version of the same pipeline.
 *
 * Everything here is pure string work so it can be tested without Electron or Canvas.
 */

import {
  BLACK,
  DEEP_BLUE,
  FONT,
  NO_INDENT,
  RED,
  ANCHOR_RE,
  HREF_RE,
  API_RETURNTYPE_RE,
  escapeHtml,
  isCanvasHref,
  normalizeCanvasImages,
  undecorate,
} from './blueprintFormat'
import { LOOKAHEAD, MAX_SCANNED_BODY_BYTES, classifyTemplate } from './styledHtml'

export const GREY = '#595959' // dates: 7:1 on white, so it stays legible for low-vision readers
const OPEN_TAG_RE_SRC = '<([a-zA-Z][a-zA-Z0-9-]*)\\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>'

// ─── Dates ───────────────────────────────────────────────────────────────────────────────

const DEFAULT_ZONE = 'America/Denver'

/** "Fri, Sep 12, 2026, 11:59 PM MDT", in the course's own time zone. Empty for no/bad input. */
export function formatCanvasDate(iso: string | null | undefined, zone?: string | null): string {
  if (!iso) return ''
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const make = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  try {
    return make(zone || DEFAULT_ZONE).format(when)
  } catch {
    // An unrecognised zone name must not cost the item its dates.
    return make(DEFAULT_ZONE).format(when)
  }
}

export interface ItemDates {
  due?: string | null
  unlock?: string | null
  lock?: string | null
}

/**
 * The text of the grey date line, or '' when the item has no dates.
 * "Due: … · Available: … – …", or "Available from …" / "Available until …" when only one end
 * is set.
 */
export function datesText(d: ItemDates, zone?: string | null): string {
  const due = formatCanvasDate(d.due, zone)
  const from = formatCanvasDate(d.unlock, zone)
  const until = formatCanvasDate(d.lock, zone)
  const bits: string[] = []
  if (due) bits.push(`Due: ${due}`)
  if (from && until) bits.push(`Available: ${from} – ${until}`)
  else if (from) bits.push(`Available from: ${from}`)
  else if (until) bits.push(`Available until: ${until}`)
  return bits.join('  ·  ')
}

// ─── Block-level structure ───────────────────────────────────────────────────────────────

/** Heading sizes. Activity titles are bold in the clean document: the "(H2)" tags are gone,
 *  so weight is what carries the hierarchy. */
const SIZE = { module: '20pt', activity: '16pt', h3: '13pt', h4: '12pt' }

function run(size: string, weight: 'bold' | 'normal', color: string): string {
  return `font-family:${FONT};font-size:${size};font-weight:${weight};color:${color};`
}

function heading(
  level: 1 | 2 | 3 | 4,
  inner: string,
  size: string,
  color = BLACK,
  extra = '',
): string {
  // Run styling goes on an inner span; Google Docs' importer maps <hN> to its named style
  // and overrides CSS on the heading element itself (see blueprintFormat.moduleHeader).
  return (
    `<h${level} style="${NO_INDENT}${extra}${run(size, 'bold', color)}">` +
    `<span style="${run(size, 'bold', color)}">${inner}</span></h${level}>`
  )
}

const BREAK = 'page-break-before:always;'

/** Course title: a plain large paragraph, so it is not a heading in the contents. */
export function courseTitle(name: string): string {
  return `<p style="${NO_INDENT}margin-top:0;margin-bottom:4pt;${run('24pt', 'bold', BLACK)}">${escapeHtml(name)}</p>`
}

export function documentSubtitle(text: string): string {
  return `<p style="${NO_INDENT}margin-top:0;margin-bottom:18pt;${run('11pt', 'normal', GREY)}">${escapeHtml(text)}</p>`
}

/** Heading 1: a module, or the Home page / Syllabus section. Always starts a page. */
export function sectionHeading(text: string, id: string, pageBreak = true): string {
  const h = heading(1, escapeHtml(text), SIZE.module, BLACK, pageBreak ? BREAK : '')
  return h.replace('<h1 ', `<h1 id="${id}" `)
}

export interface ActivityParts {
  /** Plain text, or HTML when `titleIsHtml`. */
  title: string
  titleIsHtml?: boolean
  id: string
  /** The Canvas tool, in red under the title. */
  tool: string
  /** Text of the module "Due by …" header this item falls under. */
  dueBy?: string | null
  /** The grey Canvas due/availability line. */
  dates?: string
  body?: string
  pageBreak: boolean
}

/** Heading 2 and the lines under it. */
export function activity(a: ActivityParts): string {
  const title = a.titleIsHtml ? a.title : escapeHtml(a.title)
  const h = heading(2, title, SIZE.activity, BLACK, a.pageBreak ? BREAK : '').replace(
    '<h2 ',
    `<h2 id="${a.id}" `,
  )
  const line = (inner: string) =>
    `<p style="${NO_INDENT}margin-top:0;margin-bottom:2pt;">${inner}</p>`
  const out = [h, line(`<span style="${run('10pt', 'bold', RED)}">${escapeHtml(a.tool)}</span>`)]
  if (a.dueBy) {
    out.push(
      line(
        `<span style="${run('9pt', 'normal', DEEP_BLUE)}">Module schedule: ${escapeHtml(a.dueBy)}</span>`,
      ),
    )
  }
  if (a.dates) {
    out.push(line(`<span style="${run('10pt', 'normal', GREY)}">${escapeHtml(a.dates)}</span>`))
  }
  if (a.body) out.push(a.body)
  return out.join('\n')
}

/** A non-due Canvas text header inside a module: a quiet bold label, not a heading. */
export function sectionLabel(text: string): string {
  return `<p style="${NO_INDENT}margin-top:12pt;margin-bottom:4pt;${run('13pt', 'bold', GREY)}">${escapeHtml(text)}</p>`
}

/** The text of a "Due by …" header with any leading emoji or arrows removed. */
export function dueByText(headerTitle: string): string {
  return undecorate(headerTitle).trim()
}

export interface TocEntry {
  level: 1 | 2
  text: string
  id: string
}

/**
 * The contents list. Google Docs' HTML import cannot create its own table of contents, so
 * these are ordinary paragraphs linked to the headings by id; after upload googleDocs.ts
 * re-points each one at its heading with the Docs API, which is what makes the links work in
 * the finished document.
 */
export function contentsList(entries: TocEntry[]): string {
  const rows = entries.map((e) => {
    const indent = e.level === 1 ? 0 : 24
    const weight = e.level === 1 ? 'bold' : 'normal'
    const gap = e.level === 1 ? 'margin-top:8pt;' : ''
    return (
      `<p style="${NO_INDENT}${gap}margin-bottom:3pt;margin-left:${indent}px;">` +
      `<a href="#${e.id}"><span style="${run('11pt', weight, '#1155cc')}">${escapeHtml(e.text)}</span></a></p>`
    )
  })
  return [`<p style="${NO_INDENT}margin-bottom:6pt;${run('14pt', 'bold', BLACK)}">Contents</p>`, ...rows].join('\n')
}

// ─── Body content ────────────────────────────────────────────────────────────────────────

export interface CleanBodyOptions {
  baseUrl?: string
  fileNames?: Map<string, string>
  /** Canvas file id → data: URI of the icon image. Ids missing here fall back to text. */
  iconData?: Map<string, string>
}

const NOTHING = `<p style="${NO_INDENT}${run('11pt', 'normal', GREY)}"><em>This item has no text.</em></p>`

function iconHtml(name: string, fileId: string | null, iconData?: Map<string, string>): string {
  const uri = fileId ? iconData?.get(fileId) : undefined
  if (uri) {
    return (
      `<img src="${uri}" width="28" height="28" alt="${escapeHtml(name)} icon" ` +
      'style="width:28px;height:28px;vertical-align:middle;"> '
    )
  }
  // No picture to show — say what it was, so the reader still gets the meaning.
  return `<strong>${escapeHtml(name)}:</strong> `
}

/**
 * Links into Canvas go nowhere outside the course, so the anchor is removed and its text kept.
 * External links (YouTube, publishers, Drive) are untouched.
 */
export function unlinkCanvasLinks(html: string, baseUrl?: string): string {
  if (html.length > MAX_SCANNED_BODY_BYTES) return html
  return html.replace(ANCHOR_RE, (whole, attrs: string, inner: string) => {
    const m = HREF_RE.exec(attrs)
    const href = m?.[1] ?? m?.[2] ?? m?.[3]
    const onCanvas = (href !== undefined && isCanvasHref(href, baseUrl)) || API_RETURNTYPE_RE.test(attrs)
    return onCanvas ? inner : whole
  })
}

/** Index just past the close tag that matches an element whose open tag ends at `from`. */
function findClose(html: string, from: number, tag: string): { innerEnd: number; end: number } | null {
  const re = new RegExp(`<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
  re.lastIndex = from
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth--
      if (depth === 0) return { innerEnd: m.index, end: m.index + m[0].length }
    } else if (!/\/>$/.test(m[0])) {
      depth++
    }
  }
  return null
}

/** A one-cell table: the only box Google Docs' importer reliably keeps its fill and edge for. */
function box(inner: string, bg: string, left: string, color: string, edge = 'none'): string {
  const border = edge === 'none' ? `border:none;border-left:${left};` : `border:${edge};`
  return (
    '<table style="width:100%;border-collapse:collapse;margin-top:6pt;margin-bottom:6pt;"><tr>' +
    `<td style="background-color:${bg};${border}padding:10pt 12pt;color:${color};">${inner}</td>` +
    '</tr></table>'
  )
}

function accordion(inner: string): string {
  const m = /<summary\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/summary\s*>/i.exec(inner)
  const title = m ? m[1].trim() : 'Details'
  const rest = m ? inner.replace(m[0], '') : inner
  const edge = 'border:1px solid #333333;'
  return (
    '<table style="width:100%;border-collapse:collapse;margin-top:6pt;margin-bottom:6pt;">' +
    `<tr><td style="${edge}background-color:#f6f6f6;padding:8pt 10pt;"><strong>${title}</strong></td></tr>` +
    `<tr><td style="${edge}padding:8pt 10pt;">${rest}</td></tr></table>`
  )
}

function sideBySide(inner: string): string | null {
  const cells = [...inner.matchAll(/<li\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/li\s*>/gi)].map((m) => m[1])
  if (cells.length === 0) return null
  const width = Math.floor(100 / cells.length)
  return (
    '<table style="width:100%;border-collapse:collapse;margin-top:6pt;margin-bottom:6pt;"><tr>' +
    cells.map((c) => `<td style="width:${width}%;padding:4pt;vertical-align:top;border:none;">${c}</td>`).join('') +
    '</tr></table>'
  )
}

/** Replacement for one recognised template, or undefined to leave the element as it is. */
function renderTemplate(label: string, openTag: string, inner: string): string | undefined {
  switch (label) {
    case 'Callout Box':
      return box(inner, '#f6f7f9', '12px solid #0033a0', DEEP_BLUE)
    case 'Alert Box':
      return box(inner, '#fff3f0', '6px solid #D64309', '#5c1d05')
    case 'Branded Border':
      return box(
        heading(3, inner, SIZE.h3, '#ffffff'),
        '#0033a0',
        '10px solid #D64309',
        '#ffffff',
      )
    case 'Styled Border':
      return box(inner, '#ffffff', '', BLACK, '2px solid #0033a0')
    case 'Quote':
      return box(inner, '#f8f9fa', '6px solid #0033a0', '#222222')
    case 'Dropdown':
    case 'Styled Dropdown':
      return accordion(inner)
    case 'Side-by-Side Images':
      return sideBySide(inner) ?? undefined
    case 'Horizontal Bar':
      // "Select Next to continue →": navigation for a Canvas page, meaningless in a document.
      return ''
    case 'Styled Table':
      return `${openTag.replace(/^<table\b/i, '<table border="1" cellpadding="6"')}${inner}</table>`
    default:
      return undefined
  }
}

const MAX_NESTING = 6

/**
 * Walk the body and redraw every eCampus template. Nested templates (a table inside a callout)
 * are handled by converting the inside first.
 */
export function drawTemplates(html: string, depth = 0): string {
  if (depth > MAX_NESTING || html.length > MAX_SCANNED_BODY_BYTES) return html
  const re = new RegExp(OPEN_TAG_RE_SRC, 'g')
  let out = ''
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const name = m[1].toLowerCase()
    const start = m.index + m[0].length
    const label = classifyTemplate(name, m[0], html.slice(start, start + LOOKAHEAD))
    if (!label) continue
    const close = findClose(html, start, name)
    if (!close) continue
    const rendered = renderTemplate(label, m[0], drawTemplates(html.slice(start, close.innerEnd), depth + 1))
    if (rendered === undefined) continue
    out += html.slice(pos, m.index) + rendered
    pos = close.end
    re.lastIndex = close.end
  }
  return out + html.slice(pos)
}

const HEADING_RE = /<h([1-6])\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/h\1\s*>/gi
const COLOR_RE = /(?:^|[;\s"'])color\s*:\s*([^;"']+)/i

/**
 * Headings inside Canvas content become real Heading 3 / Heading 4, below the activity title
 * that contains them. A page's own <h2> would otherwise rank level with its activity.
 */
export function remapHeadings(html: string): string {
  if (html.length > MAX_SCANNED_BODY_BYTES) return html
  return html.replace(HEADING_RE, (_m, level: string, attrs: string, inner: string) => {
    const deep = Number(level) >= 4
    const color = COLOR_RE.exec(attrs)?.[1]?.trim() || BLACK
    return heading(deep ? 4 : 3, inner, deep ? SIZE.h4 : SIZE.h3, color)
  })
}

/** Everything a Canvas body needs to become reader-friendly document HTML. */
export function formatCleanBody(html: string | null | undefined, opts: CleanBodyOptions = {}): string {
  if (!html || !html.trim()) return NOTHING
  let out = normalizeCanvasImages(html, opts.baseUrl, opts.fileNames, (name, fileId) =>
    iconHtml(name, fileId, opts.iconData),
  )
  // The QA wording for missing alt text describes the course, not the picture.
  out = out.replace(/alt="Image \((?:marked decorative|no alt text) in Canvas\)"/g, 'alt="Image"')
  out = unlinkCanvasLinks(out, opts.baseUrl)
  out = drawTemplates(out)
  out = remapHeadings(out)
  return out
}
