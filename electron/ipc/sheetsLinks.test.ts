import { describe, it, expect } from 'vitest'
import { formulaLink, hyperlinkFormula, rowLayout, valueCellA1 } from './sheetsLayout'
import { ASSIGNMENT_TEMPLATE, CLASSIC_QUIZ_TEMPLATE } from './settingsTemplates'

describe('template placeholder links', () => {
  const rubric = ASSIGNMENT_TEMPLATE.rows.find((r) => r.key === 'link_to_rubric')!
  const quiz = CLASSIC_QUIZ_TEMPLATE.rows.find((r) => r.key === 'quiz_questions')!

  it('writes Template Rubrics and Template Quiz as HYPERLINK formulas, underlined', () => {
    for (const row of [rubric, quiz]) {
      const link = formulaLink(row, new Map())!
      expect(link).toBe(row.link)
      expect(hyperlinkFormula(link, String(row.default))).toBe(`=HYPERLINK("${row.link}", "${row.default}")`)
      expect(rowLayout(row, new Map()).value.underline).toBe(true)
    }
  })

  it('drops the template link once a value is extracted', () => {
    expect(formulaLink(rubric, new Map([['link_to_rubric', 'Essay rubric']]))).toBeUndefined()
  })
})

describe('hyperlinkFormula', () => {
  it('doubles quotes so the text stays text', () => {
    expect(hyperlinkFormula('https://docs.google.com/document/d/abc/edit', 'Say "hi"')).toBe(
      '=HYPERLINK("https://docs.google.com/document/d/abc/edit", "Say ""hi""")',
    )
  })

  it('refuses any address that is not a Google Doc', () => {
    expect(hyperlinkFormula('https://evil.example/x', 'a')).toBeNull()
    expect(hyperlinkFormula('https://docs.google.com/document/d/abc/copy"),A1', 'a')).toBeNull()
  })
})

describe('valueCellA1', () => {
  it('quotes the tab name and skips the heading row', () => {
    expect(valueCellA1("CQ - It's a Quiz", 3)).toBe("'CQ - It''s a Quiz'!B5")
  })
})
