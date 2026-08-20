/**
 * Recognises the eCampus stylized-HTML templates inside a Canvas body and reports where a
 * red bold marker belongs.
 *
 * The Blueprint document names each piece of stylized HTML in red bold text, because the
 * styling itself does not survive the trip out of Canvas: a callout box arrives as an
 * ordinary <div>, a <details> accordion arrives as a line of text with no caret, and Google
 * Docs' importer renders both as plain paragraphs. A reviewer reading the extraction cannot
 * tell that the author used a template at all — which is exactly the thing they are meant to
 * be reviewing.
 *
 * Signatures, not template text. The templates in the KB article are pasted into the Rich
 * Content Editor and then edited: widths change, headings are replaced, text is retinted.
 * Matching a literal snippet would recognise only the untouched ones. Each signature instead
 * keys on the parts an author does not usually touch — the class tokens and the brand hex
 * values — and a body that matches nothing simply gets no marker.
 *
 * This module deliberately imports nothing from blueprintFormat. The caller passes in a
 * marker renderer, so the red-bold styling stays with the rest of the styling and the
 * dependency runs one way.
 *
 * Reference: "HTML Templates" (eCampus KB) — the snippets each signature was derived from.
 */

/** Renders one marker. `inline` is true for markers that sit inside a line of text. */
export type MarkerRenderer = (label: string, inline: boolean) => string

/**
 * Above this the body is passed through unannotated.
 *
 * The number is set by how badly OPEN_TAG_RE degrades, not by how large a body is reasonable.
 * The pattern is linear whenever it matches, but a run of opening tags that never reach an
 * unquoted `>` makes every start position scan to end-of-string and fail, which is quadratic:
 * measured 1.3s at 100KB, 5.2s at 200KB, 20.7s at 400KB, and around nine minutes at the 2MB
 * this used to allow. That is not slow, it is a hung app — the scan runs synchronously in the
 * main process, on the same thread as the window holding the Stop button, so there is no
 * error, no progress and no way out.
 *
 * 100KB keeps the worst case near a second. Real Canvas bodies are tens of KB; a well-formed
 * 1MB body costs 49ms, so the ceiling costs annotation on nothing that exists in practice,
 * and a body that does exceed it still comes through in full — only its markers are missing.
 *
 * Keep this in step with the identical constant in blueprintFormat.ts, which guards the same
 * class of pattern.
 */
const MAX_SCANNED_BODY_BYTES = 100_000

/**
 * Every opening tag, matched whole — not just the ones carrying a signature.
 *
 * Quote-aware for the reason documented on IMG_TAG_RE: `<div[^>]*>` stops at the first `>`
 * even when that `>` is inside a quoted attribute value, so a tag carrying `title="a > b"`
 * would be matched only as far as the inner `>`, and a truncated match means a truncated
 * style attribute and a missed signature.
 *
 * Matching *every* element rather than the seven interesting ones is what keeps a marker
 * from being spliced into the middle of another tag. An earlier version listed only the tags
 * it cared about, which meant a `<p …>` sitting inside some other element's attribute value
 * was matched as though it were markup:
 *
 *   <a href="#" title="<p style=background:#0033a0>">link</a>
 *
 * The marker went in at that offset, and since the marker contains both `"` and `>` it
 * terminated the `title=` attribute and closed the `<a>` early — turning the marker into live
 * markup and the anchor's remaining attributes into visible text, in a document the reviewer
 * opens from file://. Scanning all tags fixes it structurally: the enclosing `<a …>` is one
 * match whose quoted run swallows the inner `<p`, the scan resumes past it, and the thing
 * inside the attribute is never offered to `classify` at all. Uninteresting tags cost one
 * name comparison.
 */
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g

/** Tags a signature can key on. Everything else is matched only to be skipped over. */
const INTERESTING = new Set(['div', 'table', 'details', 'figure', 'dl', 'ol', 'p', 'img'])

/** How far past a `<details>` or `<figure>` to look for the child that identifies it. */
const LOOKAHEAD = 600

const ATTR_RE = (name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]*))`, 'i')

const CLASS_RE = ATTR_RE('class')
const STYLE_RE = ATTR_RE('style')
const ID_RE = ATTR_RE('id')

function attr(tag: string, re: RegExp): string {
  const m = re.exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
}

/**
 * Whole-token class test, case-insensitively.
 *
 * Whole token because `grid-row-inner` is not `grid-row` and a substring test would say it
 * was. Case-insensitively because Canvas writes `ic-Table` with a capital in the middle and
 * an author retyping it by hand will not — the templates are pasted, but they are also
 * repaired by hand afterwards.
 */
function hasClass(tag: string, name: string): boolean {
  return attr(tag, CLASS_RE).toLowerCase().split(/\s+/).includes(name.toLowerCase())
}

/**
 * The tag's inline style as property → value, both lowercased.
 *
 * A map rather than a substring search on the raw attribute, so a signature does not depend
 * on the order the editor happened to write the declarations in, or on how much whitespace
 * sits around the colons. Values keep their internal spacing collapsed to single spaces so
 * that `12px  solid  #D64309` and `12px solid #d64309` compare equal.
 */
type Style = Map<string, string>

function styleOf(tag: string): Style {
  const out: Style = new Map()
  const raw = attr(tag, STYLE_RE)
  if (!raw) return out
  for (const decl of raw.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const prop = decl.slice(0, colon).trim().toLowerCase()
    if (prop) out.set(prop, decl.slice(colon + 1).trim().toLowerCase().replace(/\s+/g, ' '))
  }
  return out
}

/** Whatever paints the element's background, whichever of the two properties was used. */
function background(s: Style): string {
  return `${s.get('background') ?? ''} ${s.get('background-color') ?? ''}`
}

/** Any border-ish declaration, so `border-color` and the `border` shorthand both count. */
function borders(s: Style): string {
  let out = ''
  for (const [prop, value] of s) if (prop.startsWith('border')) out += ` ${value}`
  return out
}

/**
 * Which template this tag is, or null for ordinary markup.
 *
 * Order is load-bearing where signatures overlap. Four of the templates are `border-left`
 * divs and two are `<details>`, so each block tests from the most specific downward and
 * returns on the first hit.
 *
 * `after` is a bounded window of the document text following the tag, for the two templates
 * whose identity is carried by a child rather than by their own attributes. Bounded rather
 * than "the rest of the body" because this is called once per tag: slicing the remainder
 * each time made a long page cost quadratic memory to annotate.
 */
function classify(tagName: string, tag: string, after: string): string | null {
  switch (tagName) {
    case 'div': {
      const s = styleOf(tag)
      const bg = background(s)
      const left = s.get('border-left') ?? ''

      // Brand orange rule down the side. The two that use it are told apart by their fill:
      // deep blue for the branded header, near-white pink for the alert.
      if (left.includes('#d64309')) {
        if (bg.includes('#0033a0')) return 'Branded Border'
        if (bg.includes('#fff3f0')) return 'Alert Box'
      }
      // The class is the reliable half — authors keep it and edit the style. The style test
      // is the fallback for boxes pasted without it.
      if (hasClass(tag, 'callout-left')) return 'Callout Box'
      if (left.includes('#0033a0') && bg.includes('#f6f7f9')) return 'Callout Box'
      // Rounded blue box. Both halves are required: a square blue border is ordinary markup.
      if (borders(s).includes('#0033a0') && s.has('border-radius')) return 'Styled Border'
      if (hasClass(tag, 'grid-row')) return 'Side-by-Side Images'
      return null
    }

    case 'table':
      // Canvas' own table class. It is what the template is built on and what the striping
      // and hover styling come from, so its absence means the author built the table by hand.
      return hasClass(tag, 'ic-Table') ? 'Styled Table' : null

    case 'details': {
      // The <details> element itself is identical in both templates; the styling lives on
      // the <summary> inside it, so the child has to be read to tell them apart.
      const summary = /<summary\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(after)
      const s = summary ? styleOf(summary[0]) : new Map<string, string>()
      const styled = background(s).includes('linear-gradient') || s.has('border-radius')
      return styled ? 'Styled Dropdown' : 'Dropdown'
    }

    case 'figure':
      // <figure> is also how Canvas wraps captioned images, so the blockquote is what makes
      // this the quote template rather than a picture with a caption.
      return /<blockquote\b/i.test(after) ? 'Quote' : null

    case 'dl':
      return hasClass(tag, 'dl-horizontal') ? 'Horizontal Definition List' : 'Definition List'

    case 'ol':
      return (styleOf(tag).get('list-style-type') ?? '').includes('lower-alpha')
        ? 'Lettered List'
        : null

    case 'p': {
      // Full-width blue bar with reversed text, used for "Select Next to continue".
      const s = styleOf(tag)
      return background(s).includes('#0033a0') ? 'Horizontal Bar' : null
    }

    case 'img': {
      const float = styleOf(tag).get('float') ?? ''
      if (float.startsWith('left')) return 'Float Left'
      if (float.startsWith('right')) return 'Float Right'
      return null
    }

    default:
      return null
  }
}

/** Markers that belong inside the line rather than on their own above it. */
const INLINE_LABELS = new Set(['Float Left', 'Float Right'])

/**
 * Insert a marker in front of every stylized-HTML template in `html`.
 *
 * Each template is marked at its own opening tag, which handles nesting for free: a styled
 * table inside a callout box produces both markers, each where it belongs. Nothing is
 * removed or rewritten — the markup carries on to the output exactly as Canvas returned it.
 *
 * Footnotes are the one whole-body signature. A footnoted page carries a link per footnote
 * and a paragraph per footnote, and marking each of them would bury the page in markers, so
 * only the first footnote paragraph gets one.
 */
export function annotateStyledHtml(html: string, marker: MarkerRenderer): string {
  if (html.length > MAX_SCANNED_BODY_BYTES) return html

  let footnoted = false

  return html.replace(OPEN_TAG_RE, (tag, rawName: string, offset: number) => {
    const name = rawName.toLowerCase()
    // Every element is matched, so that an opening tag inside another tag's attribute value
    // is consumed with its enclosing tag rather than treated as markup; the ones no signature
    // keys on are handed straight back untouched.
    if (!INTERESTING.has(name)) return tag

    if (name === 'p' && !footnoted && /^footnote-/i.test(attr(tag, ID_RE))) {
      footnoted = true
      return marker('Footnotes', false) + tag
    }

    const start = offset + tag.length
    const label = classify(name, tag, html.slice(start, start + LOOKAHEAD))
    return label ? marker(label, INLINE_LABELS.has(label)) + tag : tag
  })
}
