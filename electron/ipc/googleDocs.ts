import { getAccessToken } from './googleAuth'

/**
 * Post-pass that draws the blue horizontal rules above and below every
 * "Due by … Mountain Time" header, using the Google Docs API.
 *
 * This mirrors `applyDueHeaderBorders` in blueprint-tools/Code.gs. Paragraph borders are
 * the one part of the Blueprint spec that Google Docs' HTML importer does not reliably
 * preserve, and QA treats these rules as required — so rather than trusting the CSS in
 * the uploaded HTML, we set them explicitly here.
 *
 * A paragraph border is a single-valued style attribute, so re-applying the same spec to
 * a header that already has it (because the CSS did survive) is a harmless no-op. That
 * lets us border every matching header without tracking which already have rules.
 *
 * Scope note: the Docs API accepts `drive.file`, so this needs no extra permission —
 * the app still only touches documents it created.
 */

/**
 * Same relaxed match as blueprintFormat.isDueHeader — keyed on the opening "Due by",
 * because real courses write the tail as "MT", "Mountain Time", "MST", etc., and often
 * decorate the header with leading emoji or arrow glyphs (⬇️ / ↓) that must be ignored.
 * Keep this in sync with blueprintFormat.isDueHeader.
 */
const LEADING_DECOR_RE = /^[^\p{L}\p{N}]+/u
const DUE_RE = /^due\s+by\b/i

/**
 * We scan every paragraph in the document, so the match must be narrow.
 *
 * Only the module Text Headers this app emits via `dueHeader()` get rules, and those are
 * written as <h3> — which the importer maps to HEADING_3. A heading style is therefore
 * required. An earlier version also accepted any short line, and a document dump showed
 * that catching in-page prose: overview pages list their deadlines as body text ("DUE BY
 * WEDNESDAY at 11:59 p.m. Mountain Time"), and each one was picking up blue rules that
 * belong only to a Text Header on the Modules page.
 */
function isDueParagraph(text: string, namedStyleType?: string): boolean {
  if (namedStyleType !== 'HEADING_3') return false
  return DUE_RE.test(text.trim().replace(LEADING_DECOR_RE, ''))
}

// Code.gs:601 — #0000e7 expressed as rgb(0, 0, 0.90588), 1.5pt wide, 2pt padding, solid.
const BLUE_BORDER = {
  color: { color: { rgbColor: { red: 0, green: 0, blue: 0.90588 } } },
  width: { magnitude: 1.5, unit: 'PT' },
  padding: { magnitude: 2, unit: 'PT' },
  dashStyle: 'SOLID',
}

interface DocsElement {
  startIndex?: number
  endIndex?: number
  paragraph?: {
    elements?: Array<{ textRun?: { content?: string } }>
    paragraphStyle?: { namedStyleType?: string }
  }
}

/** Returns how many due-by headers were bordered. */
export async function applyDueHeaderBorders(documentId: string): Promise<number> {
  const accessToken = await getAccessToken()

  const getRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!getRes.ok) {
    const detail = await getRes.text().catch(() => '')
    throw new Error(`Docs API read failed (${getRes.status}). ${detail.slice(0, 200)}`)
  }

  const doc = (await getRes.json()) as { body?: { content?: DocsElement[] } }
  const content = doc.body?.content ?? []

  const requests = []
  for (const el of content) {
    if (!el.paragraph?.elements) continue
    if (el.startIndex === undefined || el.endIndex === undefined) continue
    const text = el.paragraph.elements.map((e) => e.textRun?.content ?? '').join('')
    if (!isDueParagraph(text, el.paragraph.paragraphStyle?.namedStyleType)) continue
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: el.startIndex, endIndex: el.endIndex },
        paragraphStyle: { borderTop: BLUE_BORDER, borderBottom: BLUE_BORDER },
        fields: 'borderTop,borderBottom',
      },
    })
  }

  // Do not try to "clear" borders on neighbouring paragraphs. An updateParagraphStyle that
  // names borderTop/borderBottom in `fields` with no value supplied does not remove a border
  // — it resets the field to an empty ParagraphBorder, which renders as a hairline rule.

  if (requests.length === 0) return 0

  // updateParagraphStyle does not change text length, so there is no index drift
  // and request order is irrelevant.
  const updRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
  )
  if (!updRes.ok) {
    const detail = await updRes.text().catch(() => '')
    throw new Error(`Docs API update failed (${updRes.status}). ${detail.slice(0, 200)}`)
  }

  return requests.length
}
