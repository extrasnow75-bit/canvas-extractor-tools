import { describe, it, expect } from 'vitest'
import { planPageBreaks } from './docsContents'

describe('planPageBreaks', () => {
  const para = (start: number, text: string, style: string) => ({
    startIndex: start,
    endIndex: start + text.length + 1,
    paragraph: { elements: [{ textRun: { content: text + '\n' } }], paragraphStyle: { namedStyleType: style, headingId: `h.${start}` } },
  })
  const doc = [
    para(1, 'Course', 'NORMAL_TEXT'),
    para(10, 'Contents', 'NORMAL_TEXT'),
    para(20, 'Module 1', 'NORMAL_TEXT'),
    para(40, 'Module 1', 'HEADING_1'),
    para(60, 'README', 'HEADING_2'),
    para(80, 'Quiz', 'HEADING_2'),
    para(100, 'Module 2', 'HEADING_1'),
    para(120, 'README', 'HEADING_2'),
  ]
  const expected = [
    { text: 'Module 1', breakBefore: true },
    { text: 'README', breakBefore: false },
    { text: 'Quiz', breakBefore: true },
    { text: 'Module 2', breakBefore: true },
    { text: 'README', breakBefore: true },
  ]
  it('sets the break on exactly the headings that want one, matching repeated names in order', () => {
    const r = planPageBreaks(doc, expected) as Array<{ updateParagraphStyle: { range: { startIndex: number }; paragraphStyle: object; fields: string } }>
    expect(r.map((x) => x.updateParagraphStyle.range.startIndex)).toEqual([40, 80, 100, 120])
    expect(r[0].updateParagraphStyle).toMatchObject({ paragraphStyle: { pageBreakBefore: true }, fields: 'pageBreakBefore' })
  })
  it('does nothing without a contents list or without headings', () => {
    expect(planPageBreaks([para(1, 'Hello', 'NORMAL_TEXT')], expected)).toEqual([])
  })
  it('skips a heading the document does not have rather than breaking the wrong one', () => {
    const r = planPageBreaks(doc, [{ text: 'Not there', breakBefore: true }, { text: 'Quiz', breakBefore: true }]) as Array<{ updateParagraphStyle: { range: { startIndex: number } } }>
    expect(r.map((x) => x.updateParagraphStyle.range.startIndex)).toEqual([80])
  })
})
