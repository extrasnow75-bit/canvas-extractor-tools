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
  const doFetch = o.fetch ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 6000)
  try {
    const res = await doFetch(oembedUrl(ref), { signal: ctl.signal, redirect: 'follow', credentials: 'omit' as RequestCredentials })
    if (res.ok) return 'found'
    if (res.status === 404 || res.status === 410) return 'gone'
    if (res.status === 401 || res.status === 403) return 'blocked'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(timer)
  }
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
  const verdicts = new Map<string, Verdict>()
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(o.concurrency ?? 6, list.length) }, async () => {
      while (next < list.length && !o.isCancelled?.()) {
        const [key, ref] = list[next++]
        verdicts.set(key, await checkVideo(ref, o))
      }
    }),
  )

  return replaceElements(html, 'a', 'required', (attrs, inner, whole) => {
    const m = HREF_RE.exec(attrs)
    const ref = m ? videoRef(m[1] ?? m[2] ?? m[3] ?? '') : null
    const v = ref ? verdicts.get(`${ref.provider}:${ref.id}`) : undefined
    const embedded = /\sdata-embed\b/i.test(attrs)
    const dead = v === 'gone' || (v === 'blocked' && embedded)
    if (!dead || /^\s*<span style="background-color:/i.test(inner)) return whole
    return `<a${attrs}><span style="background-color:${BROKEN_LINK_HIGHLIGHT};">${inner}</span></a>`
  })
}
