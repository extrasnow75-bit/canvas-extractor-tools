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
import { BROKEN_LINK_HIGHLIGHT } from './brokenLinks'
import { replaceElements } from './tagScan'

export interface EmbedOptions {
  /** The Canvas host, to resolve a host-relative source. */
  baseUrl?: string
  /** How the label is drawn, given its plain text, for example "Embed video" (the caller adds the colon). */
  renderLabel(text: string): string
  /**
   * Draws the whole embed itself instead of "label, then link". It is given the pieces and uses
   * embedLink() for the link, so the later steps (the dead-video check, the real video title) can find it.
   */
  renderEmbed?(e: EmbedParts): string
}

export interface EmbedParts {
  kind: 'video' | 'audio' | 'content'
  /** The plain label, "Embed video". */
  label: string
  /** The title the course gave it, or the website's name when it gave none. */
  name: string
  /** The website's name, "www.youtube.com". */
  host: string
  /** The address to open, or null when there is no usable one. */
  href: string | null
}

/** The link an embed is drawn with. data-embed marks it as a player, not an ordinary link. */
export function embedLink(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" data-embed="1">${escapeHtml(text)}</a>`
}

/** What a missing address looks like: the name, marked light red, with no link. */
export function brokenEmbedName(text: string): string {
  return `<span style="background-color:${BROKEN_LINK_HIGHLIGHT};">${escapeHtml(text)}</span>`
}

const SOURCE_RE = /<source\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i
const ATTR = (name: string) => new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))`, 'i')
const SRC_RE = ATTR('src')
const TITLE_RE = ATTR('title')

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function attr(tag: string, re: RegExp): string {
  const m = re.exec(tag)
  return decode((m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim())
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

/**
 * Canvas embeds a video from the editor's "Embed" button as a page of its own that wraps the real
 * address: /courses/5/external_tools/retrieve?display=borderless&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D...
 * Opened from a copy of the course that page goes nowhere, so the video's own address is used instead.
 */
function unwrapExternalTool(u: URL): URL | null {
  if (!/\/external_tools\/(?:retrieve|sessionless_launch)\/?$/i.test(u.pathname)) return null
  return absolute(u.searchParams.get('url') ?? '')
}

function line(kind: 'video' | 'audio' | 'content', src: string, title: string, o: EmbedOptions): string {
  const wrapped = absolute(src, o.baseUrl)
  const u = (wrapped && unwrapExternalTool(wrapped)) || wrapped
  const known = u ? recognise(u) : null
  const noun = kind === 'content' && known && known.provider !== 'H5P' ? 'video' : kind
  // The provider is not named: the link shows the address, which says where the video lives.
  const label = `Embed ${noun}`
  const shown = title || (u ? u.hostname : '')
  const target = known?.watch ?? u?.toString()
  if (o.renderEmbed) {
    return o.renderEmbed({ kind: noun, label, name: shown || 'no web address found', host: u?.hostname ?? '', href: target ?? null })
  }
  // No usable address: the player cannot work, so the name is marked in light red.
  if (!target) {
    return `${o.renderLabel(label)} ${brokenEmbedName(shown || 'no web address found')}`
  }
  return `${o.renderLabel(label)} ${embedLink(target, shown || target)}`
}

/** Replace every <iframe>, <video> and <audio> in a body with a label and a link. */
export function replaceEmbeddedMedia(html: string, o: EmbedOptions): string {
  if (!html || html.length > MAX_SCANNED_BODY_BYTES) return html
  // An iframe's own content is only what a browser shows when it cannot load it, so it goes with it.
  let out = replaceElements(html, 'iframe', 'optional', (attrs) => line('content', attr(attrs, SRC_RE), attr(attrs, TITLE_RE), o))
  for (const kind of ['video', 'audio'] as const) {
    out = replaceElements(out, kind, 'required', (attrs, inner) => {
      const src = attr(attrs, SRC_RE) || attr(SOURCE_RE.exec(inner)?.[1] ?? '', SRC_RE)
      return line(kind, src, attr(attrs, TITLE_RE), o)
    })
  }
  return out
}
