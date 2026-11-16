/**
 * Finding HTML elements in one pass, without regular-expression backtracking.
 *
 * A quote-aware pattern such as `<a\b(?:[^>"']|"[^"]*"|'[^']*')*>` rescans to the end of the text from
 * every `<a` that has no closing `>`, so thousands of broken tags in one body cost seconds. This walks the
 * text once: if a tag never closes, nothing after it can either, and the scan stops.
 */

/** Index just past the `>` that ends the open tag whose attributes start at `from`, or -1. Quote-aware. */
export function findOpenTagEnd(html: string, from: number): number {
  let quote = ''
  for (let i = from; i < html.length; i++) {
    const c = html[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      return i + 1
    }
  }
  return -1
}

/** Where the next `<tag` that is really that tag (not `<abbr` for `a`) starts at or after `from`, or -1. */
function nextOpen(lower: string, tag: string, from: number): number {
  const needle = `<${tag}`
  let i = lower.indexOf(needle, from)
  while (i >= 0) {
    const after = lower.charCodeAt(i + needle.length)
    const isNameChar = (after >= 97 && after <= 122) || (after >= 48 && after <= 57) || after === 45
    if (!isNameChar) return i
    i = lower.indexOf(needle, i + needle.length)
  }
  return -1
}

/**
 * Replace every `<tag …>…</tag>` (or, when `closing` is 'optional', every open tag together with its close
 * tag if one follows before the next `<tag`) with whatever `fn` returns. `fn` gets the attribute text and
 * the inner text, and the original text of the whole element so an unchanged one can be returned exactly.
 * A required close tag that never comes leaves the rest of the text untouched.
 */
export function replaceElements(
  html: string,
  tag: string,
  closing: 'required' | 'optional',
  fn: (attrs: string, inner: string, whole: string) => string,
): string {
  const lower = html.toLowerCase()
  const closeTag = `</${tag}`
  let nextClose = -2 // -2: not looked for yet; -1: none left
  const closeAfter = (p: number): { start: number; end: number } | null => {
    for (;;) {
      if (nextClose === -2 || (nextClose !== -1 && nextClose < p)) nextClose = lower.indexOf(closeTag, p)
      if (nextClose === -1) return null
      // The close tag is `</tag` then optional spaces then `>`.
      let j = nextClose + closeTag.length
      while (j < lower.length && /\s/.test(lower[j])) j++
      if (lower[j] === '>') return { start: nextClose, end: j + 1 }
      p = nextClose + closeTag.length
      nextClose = -2
    }
  }

  let out = ''
  let pos = 0
  for (;;) {
    const open = nextOpen(lower, tag, pos)
    if (open < 0) break
    const openEnd = findOpenTagEnd(html, open + tag.length + 1)
    if (openEnd < 0) break
    const attrs = html.slice(open + tag.length + 1, openEnd - 1)
    const close = closeAfter(openEnd)
    let end = openEnd
    let inner = ''
    if (close) {
      const following = nextOpen(lower, tag, openEnd)
      if (closing === 'required' || following < 0 || close.start < following) {
        inner = html.slice(openEnd, close.start)
        end = close.end
      }
    } else if (closing === 'required') {
      break
    }
    out += html.slice(pos, open) + fn(attrs, inner, html.slice(open, end))
    pos = end
  }
  return out + html.slice(pos)
}
