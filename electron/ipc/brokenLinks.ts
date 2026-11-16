/**
 * Links that cannot work, in light red so a designer's eye is drawn to them.
 *
 * This only judges the address as written; it never contacts anything. So it catches links that are
 * broken by how they were typed (an empty address, "javascript:", "htp://", a web address with no
 * "https://" in front, which Canvas reads as a page inside the course), and it cannot tell that a
 * well-formed link points at a video that was deleted or a page that moved. Finding those means
 * asking the other site, which this does not do.
 *
 * Google Docs reads the background of a text run, not of an <a>, so the highlight is a span inside
 * the anchor. The anchor and its address are left exactly as they were.
 */
import { MAX_SCANNED_BODY_BYTES } from './styledHtml'
import { replaceElements } from './tagScan'

/** Google Docs' "light red 3". */
export const BROKEN_LINK_HIGHLIGHT = '#f4cccc'

const HREF_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']*))/i

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

const BARE_EMAIL = /^[^\s@/:?#]+@[^\s@/:?#]+\.[a-z]{2,}(?:[^\w]|$)/i
// A scheme that is almost "http" or "https": htp, http//, https:/ and so on.
const NEARLY_HTTP = /^(?:ht+ps?:?\/{0,1}(?!\/)|https?\/\/|htt?ps?:\/\/?(?=[^/]))/i
// A first path segment that is a web address typed without its scheme: www.example.com, docs.google.com/x, youtu.be/x.
// Only the common endings are listed, so a file name such as "notes.co" or "intro.me" is not mistaken for one.
const BARE_ADDRESS = /^(?:www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|gov|io)(?:[/?#:]|$)|youtu\.be\/)/i

/** An email address written as the link's destination, with no "mailto:" in front of it. */
export function isBareEmailHref(raw: string): boolean {
  return BARE_EMAIL.test(decode(raw).trim())
}

/**
 * A link whose destination is a bare email address does nothing when clicked: Canvas reads it as a page
 * in the course, and Google Docs, with nothing to resolve it against, makes it a link to nowhere. The
 * address is still worth reading, so the link is dropped and the text stays, as plain text. It is not
 * turned into a "mailto:" link, and a link that already has "mailto:" is left alone.
 */
export function unlinkBareEmails(html: string): string {
  if (!html || html.length > MAX_SCANNED_BODY_BYTES) return html
  return replaceElements(html, 'a', 'required', (attrs, inner, whole) => {
    const m = HREF_RE.exec(attrs)
    if (!m) return whole
    return isBareEmailHref(m[1] ?? m[2] ?? m[3] ?? '') ? inner : whole
  })
}

/** True when this address, as written, cannot lead anywhere. */
export function isBrokenHref(raw: string): boolean {
  const href = decode(raw).trim()
  if (href === '') return true
  if (/^javascript:/i.test(href)) return true
  if (/^about:/i.test(href)) return true // what Google Docs writes for an address it could not use
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('?') || href.startsWith('.')) return false
  if (/^(?:mailto|tel|sms):/i.test(href)) return false
  if (/^https?:\/\//i.test(href)) {
    try {
      const host = new URL(href).hostname
      return host === '' || (!host.includes('.') && host !== 'localhost')
    } catch {
      return true
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    // Some other scheme. Only the near-misses of http(s) are wrong; ftp:, data: and the like are left alone.
    // (A real http(s):// address was handled above, so any other http(s): is missing slashes.)
    return /^ht+p+s*:/i.test(href)
  }
  if (NEARLY_HTTP.test(href)) return true
  // No scheme and no leading slash: Canvas reads it as a path inside the course. Fine for "page-name",
  // broken when it was meant as a web address.
  return BARE_ADDRESS.test(href)
}

/**
 * Wrap the text of every link whose address cannot work in the light-red highlight. A link whose text
 * already has a background (the cyan mark for links into Canvas) is left as it is, not given a second one.
 */
export function highlightBrokenLinks(html: string): string {
  if (!html || html.length > MAX_SCANNED_BODY_BYTES) return html
  return replaceElements(html, 'a', 'required', (attrs, inner, whole) => {
    const m = HREF_RE.exec(attrs)
    if (!m) return whole // a named anchor, not a link
    const href = m[1] ?? m[2] ?? m[3] ?? ''
    if (!isBrokenHref(href) || /^\s*<span style="background-color:/i.test(inner)) return whole
    return `<a${attrs}><span style="background-color:${BROKEN_LINK_HIGHLIGHT};">${inner}</span></a>`
  })
}
