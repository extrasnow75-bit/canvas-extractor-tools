/**
 * Embedded players (YouTube, Panopto, Vimeo, Canvas media…) as a visible line with a link.
 *
 * Canvas puts a video in a page as an <iframe>, <video> or <audio> tag. Google Docs' HTML
 * import throws all three away and leaves an empty paragraph, so an extracted page that says
 * "watch the video above" shows nothing above it, and nobody can tell a video was ever there.
 * This replaces each player with a short label and a link to the video, so a reviewer can see
 * that there was one and open it.
 *
 * The label is drawn by the caller (`renderLabel`) so the QA extraction can use its red bold
 * marker and the clean document its plain wording. Pure: strings in, string out.
 */
import { MAX_SCANNED_BODY_BYTES } from './styledHtml'

export interface EmbedOptions {
  /** The Canvas host, to resolve a host-relative source. */
  baseUrl?: string
  /** How the label is drawn, given its plain text, for example "Embedded video (YouTube)". */
  renderLabel(text: string): string
}

// Quote-aware, like the other tag patterns here: a `>` inside an attribute value must not end the tag.
const TAG = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*'
const IFRAME_RE = new RegExp(`<iframe\\b${TAG}>(?:\\s*</iframe\\s*>)?`, 'gi')
const MEDIA_RE = new RegExp(`<(video|audio)\\b${TAG}>[\\s\\S]*?</\\1\\s*>`, 'gi')
const ATTR_DQ = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
const SRC_RE = ATTR_DQ('src')
const TITLE_RE = ATTR_DQ('title')
const SOURCE_RE = new RegExp(`<source\\b${TAG}>`, 'i')

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function attr(tag: string, re: RegExp): string {
  const m = re.exec(tag)
  return decode((m?.[1] ?? m?.[2] ?? '').trim())
}

/** An absolute http(s) address, or null for anything else (javascript:, data:, empty). */
function absolute(src: string, baseUrl?: string): URL | null {
  if (!src) return null
  try {
    const u = new URL(src.startsWith('//') ? `https:${src}` : src, baseUrl)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

interface Known {
  provider: string
  /** The address a person can open in a browser, which for most players is not the embed address. */
  watch: string
}

/** Names the provider and, where the embed address differs from the watch address, converts it. */
export function recognise(u: URL): Known | null {
  const host = u.hostname.toLowerCase()
  if (/(^|\.)youtube(-nocookie)?\.com$/.test(host) || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (/^\/embed\/([^/?]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get('v'))
    return { provider: 'YouTube', watch: id ? `https://www.youtube.com/watch?v=${id}` : u.toString() }
  }
  if (/(^|\.)panopto\.(com|eu)$/.test(host)) {
    const id = u.searchParams.get('id')
    const watch = /\/Embed\.aspx$/i.test(u.pathname) && id ? `${u.origin}${u.pathname.replace(/Embed\.aspx$/i, 'Viewer.aspx')}?id=${id}` : u.toString()
    return { provider: 'Panopto', watch }
  }
  if (host === 'player.vimeo.com' || /(^|\.)vimeo\.com$/.test(host)) {
    const id = /\/video\/(\d+)/.exec(u.pathname)?.[1]
    return { provider: 'Vimeo', watch: id ? `https://vimeo.com/${id}` : u.toString() }
  }
  if (/kaltura\.com$/.test(host)) return { provider: 'Kaltura', watch: u.toString() }
  if (/mediasite\./.test(host)) return { provider: 'Mediasite', watch: u.toString() }
  if (/echo360\./.test(host)) return { provider: 'Echo360', watch: u.toString() }
  if (/(^|\.)loom\.com$/.test(host)) return { provider: 'Loom', watch: u.toString().replace('/embed/', '/share/') }
  if (/(^|\.)h5p\./.test(host) || /h5p/.test(u.pathname)) return { provider: 'H5P', watch: u.toString() }
  return null
}

function line(kind: 'video' | 'audio' | 'content', src: string, title: string, o: EmbedOptions): string {
  const u = absolute(src, o.baseUrl)
  const known = u ? recognise(u) : null
  const noun = kind === 'content' && known && known.provider !== 'H5P' ? 'video' : kind
  const label = `Embedded ${noun}${known ? ` (${known.provider})` : ''}`
  const shown = title || (u ? u.hostname : '')
  const target = known?.watch ?? u?.toString()
  if (!target) return `${o.renderLabel(label)}${shown ? ` ${escapeHtml(shown)}` : ''}`
  return `${o.renderLabel(label)} <a href="${escapeHtml(target)}">${escapeHtml(shown || target)}</a>`
}

/** Replace every <iframe>, <video> and <audio> in a body with a label and a link. */
export function replaceEmbeddedMedia(html: string, o: EmbedOptions): string {
  if (!html || html.length > MAX_SCANNED_BODY_BYTES) return html
  let out = html.replace(IFRAME_RE, (tag) => line('content', attr(tag, SRC_RE), attr(tag, TITLE_RE), o))
  out = out.replace(MEDIA_RE, (whole, kind: string) => {
    const open = whole.slice(0, whole.indexOf('>') + 1)
    const src = attr(open, SRC_RE) || attr(SOURCE_RE.exec(whole)?.[0] ?? '', SRC_RE)
    return line(kind.toLowerCase() as 'video' | 'audio', src, attr(open, TITLE_RE), o)
  })
  return out
}
