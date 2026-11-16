/**
 * Marking YouTube and Vimeo videos that no longer exist.
 *
 * A link can be perfectly written and still lead nowhere because the video was deleted or made private.
 * The only way to know is to ask the video site, so this asks YouTube and Vimeo's public "oEmbed" service,
 * which answers whether a video is there without playing it. What is sent is the video's own public
 * address and nothing else: no Canvas token, no course name, no personal information.
 *
 * It fails open. A network error, a timeout, a limit, or any answer other than "not found" leaves the
 * link as it was, so a slow or blocked network never marks a working video as broken. Panopto, Kaltura
 * and similar services need a login the app does not have, so they are not checked.
 */
import { BROKEN_LINK_HIGHLIGHT } from './brokenLinks'
import { MAX_SCANNED_BODY_BYTES } from './styledHtml'
import { replaceElements } from './tagScan'

export type VideoRef = { provider: 'youtube' | 'vimeo'; id: string }
export type Verdict = 'found' | 'gone' | 'blocked' | 'unknown'

/** Which video a web address names, or null when it is not a YouTube or Vimeo video. */
export function videoRef(raw: string): VideoRef | null {
  let u: URL
  try {
    u = new URL(raw.replace(/&amp;/g, '&'))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname)?.[1]
    return id && /^[\w-]{11}$/.test(id) ? { provider: 'youtube', id } : null
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1)
    return /^[\w-]{11}$/.test(id) ? { provider: 'youtube', id } : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /^\/(?:video\/)?(\d{5,})/.exec(u.pathname)?.[1]
    return id ? { provider: 'vimeo', id } : null
  }
  return null
}

export function oembedUrl(ref: VideoRef): string {
  return ref.provider === 'youtube'
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ref.id}`)}`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${ref.id}`)}`
}

export interface CheckOptions {
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch
  /** Seconds-level limits so a slow network cannot stall an extraction. */
  timeoutMs?: number
  concurrency?: number
  maxChecks?: number
  isCancelled?: () => boolean
}

/**
 * 'gone': the service says there is no such video (404 or 410).
 * 'blocked': the service knows it but will not hand it out (private, or embedding switched off: 401 or 403).
 *   For an embedded player that is as good as broken; for a plain link it may still open, so the caller decides.
 */
export async function checkVideo(ref: VideoRef, o: CheckOptions = {}): Promise<Verdict> {
  return (await lookupVideo(ref, o)).verdict
}

export interface VideoLookup {
  verdict: Verdict
  /** The video's own title, when the service gave one. */
  title?: string
}

/** The same question as checkVideo, keeping the title the service sends back with a good answer. */
export async function lookupVideo(ref: VideoRef, o: CheckOptions = {}): Promise<VideoLookup> {
  const doFetch = o.fetch ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 6000)
  try {
    const res = await doFetch(oembedUrl(ref), { signal: ctl.signal, redirect: 'follow', credentials: 'omit' as RequestCredentials })
    if (res.ok) {
      let title: string | undefined
      try {
        const t = ((await res.json()) as { title?: unknown }).title
        if (typeof t === 'string' && t.trim() !== '') title = t.trim().slice(0, 200)
      } catch {
        // An answer without a readable title still says the video is there.
      }
      return { verdict: 'found', title }
    }
    if (res.status === 404 || res.status === 410) return { verdict: 'gone' }
    if (res.status === 401 || res.status === 403) return { verdict: 'blocked' }
    return { verdict: 'unknown' }
  } catch {
    return { verdict: 'unknown' }
  } finally {
    clearTimeout(timer)
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const decodeText = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/**
 * True when a link's text says nothing about which video it is: empty, just a website's name, or the
 * stock title a player gives itself ("YouTube video player"). A name the course author chose is kept.
 */
export function isGenericName(innerHtml: string): boolean {
  const text = decodeText(innerHtml.replace(/<[^>]+>/g, '')).trim()
  if (text === '') return true
  if (/^https?:\/\//i.test(text)) return true
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(text)) return true
  return /^(?:(?:youtube|vimeo)\s+)?(?:video\s+)?player$|^(?:embedded\s+)?video$/i.test(text)
}

const HREF_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i

/**
 * In a finished document's HTML, put the light-red highlight on the text of each link to a YouTube or
 * Vimeo video that the service says is gone. A video behind an embedded player (marked data-embed by
 * embeddedMedia) is also marked when the service says it is private or not embeddable.
 */
export async function markDeadVideos(html: string, o: CheckOptions = {}): Promise<string> {
  if (!html || html.length > MAX_SCANNED_BODY_BYTES * 20) return html
  const refs = new Map<string, VideoRef>()
  replaceElements(html, 'a', 'required', (attrs, _inner, whole) => {
    const m = HREF_RE.exec(attrs)
    const ref = m ? videoRef(m[1] ?? m[2] ?? m[3] ?? '') : null
    if (ref) refs.set(`${ref.provider}:${ref.id}`, ref)
    return whole
  })
  if (refs.size === 0) return html

  const list = [...refs.entries()].slice(0, o.maxChecks ?? 150)
  const verdicts = new Map<string, VideoLookup>()
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(o.concurrency ?? 6, list.length) }, async () => {
      while (next < list.length && !o.isCancelled?.()) {
        const [key, ref] = list[next++]
        verdicts.set(key, await lookupVideo(ref, o))
      }
    }),
  )

  return replaceElements(html, 'a', 'required', (attrs, inner, whole) => {
    const m = HREF_RE.exec(attrs)
    const ref = m ? videoRef(m[1] ?? m[2] ?? m[3] ?? '') : null
    const v = ref ? verdicts.get(`${ref.provider}:${ref.id}`) : undefined
    const embedded = /\sdata-embed\b/i.test(attrs)
    // An embedded player that names no video gets the video's own title.
    if (v?.verdict === 'found' && v.title && embedded && isGenericName(inner)) return `<a${attrs}>${escapeHtml(v.title)}</a>`
    const dead = v?.verdict === 'gone' || (v?.verdict === 'blocked' && embedded)
    if (!dead || /^\s*<span style="background-color:/i.test(inner)) return whole
    return `<a${attrs}><span style="background-color:${BROKEN_LINK_HIGHLIGHT};">${inner}</span></a>`
  })
}
