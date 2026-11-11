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
