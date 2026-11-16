/**
 * Pure planning for linking the clean document's contents list to its headings. Kept apart
 * from googleDocs.ts, which imports Electron, so it can be tested without it.
 */

interface DocsElement {
  startIndex?: number
  endIndex?: number
  paragraph?: {
    elements?: Array<{ textRun?: { content?: string } }>
    paragraphStyle?: { namedStyleType?: string }
  }
}

export interface DocsHeadingElement extends DocsElement {
  paragraph?: DocsElement['paragraph'] & {
    paragraphStyle?: { namedStyleType?: string; headingId?: string }
  }
}

/**
 * Which headings start a new page. Google's HTML import ignores the CSS `page-break-before`, so
 * the page breaks are set afterwards with `pageBreakBefore`. `expected` lists the document's
 * headings in order with whether each breaks; they are matched to the real headings by text, in
 * order, exactly as the contents links are, so two headings with one name each get their own.
 */
export function planPageBreaks(
  content: DocsHeadingElement[],
  expected: Array<{ text: string; breakBefore: boolean }>,
): object[] {
  const textOf = (el: DocsHeadingElement) =>
    (el.paragraph?.elements ?? []).map((e) => e.textRun?.content ?? '').join('')
  const isH1 = (el: DocsHeadingElement) => el.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1'
  const label = content.findIndex((el) => el.paragraph && textOf(el).trim() === 'Contents')
  const firstHeading = content.findIndex((el, i) => i > label && isH1(el))
  if (label < 0 || firstHeading < 0) return []

  const headings = content.slice(firstHeading).filter((el) => {
    const t = el.paragraph?.paragraphStyle?.namedStyleType
    return t === 'HEADING_1' || t === 'HEADING_2'
  })
  const requests: object[] = []
  let from = 0
  for (const want of expected) {
    let hit = -1
    for (let i = from; i < headings.length; i++) {
      if (textOf(headings[i]).trim() === want.text.trim()) {
        hit = i
        break
      }
    }
    if (hit < 0) continue
    from = hit + 1
    if (!want.breakBefore) continue
    const h = headings[hit]
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: h.startIndex, endIndex: h.endIndex },
        paragraphStyle: { pageBreakBefore: true },
        fields: 'pageBreakBefore',
      },
    })
  }
  return requests
}

/** Which contents lines to link to which headings. */
export function planContentsLinks(content: DocsHeadingElement[]): object[] {
  const textOf = (el: DocsHeadingElement) =>
    (el.paragraph?.elements ?? []).map((e) => e.textRun?.content ?? '').join('')

  const label = content.findIndex((el) => el.paragraph && textOf(el).trim() === 'Contents')
  if (label < 0) return []

  const isH1 = (el: DocsHeadingElement) =>
    el.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1'
  const firstHeading = content.findIndex((el, i) => i > label && isH1(el))
  if (firstHeading < 0) return []

  const entries = content
    .slice(label + 1, firstHeading)
    .filter((el) => el.paragraph && el.startIndex !== undefined && textOf(el).trim() !== '')

  const headings = content
    .slice(firstHeading)
    .filter((el) => {
      const t = el.paragraph?.paragraphStyle?.namedStyleType
      return (t === 'HEADING_1' || t === 'HEADING_2') && el.paragraph?.paragraphStyle?.headingId
    })

  const requests: object[] = []
  let from = 0
  for (const entry of entries) {
    const text = textOf(entry).trim()
    let hit = -1
    for (let i = from; i < headings.length; i++) {
      if (textOf(headings[i]).trim() === text) {
        hit = i
        break
      }
    }
    if (hit < 0) continue
    from = hit + 1
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: entry.startIndex,
          // Up to, not including, the paragraph's newline.
          endIndex: (entry.endIndex as number) - 1,
        },
        textStyle: { link: { headingId: headings[hit].paragraph?.paragraphStyle?.headingId } },
        fields: 'link',
      },
    })
  }
  return requests
}
