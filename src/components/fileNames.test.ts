import { describe, it, expect } from 'vitest'
import { titleKeywords, courseFileSuffix, localFileName } from './fileNames'

const BASE = 'course_content_extraction'

describe('titleKeywords', () => {
  it('takes the first few meaningful words', () => {
    expect(titleKeywords('eCampus Demo')).toBe('eCampus_Demo')
    expect(titleKeywords('Advanced Respiratory Care Practicum II')).toBe('Advanced_Respiratory_Care')
  })

  it('skips filler words and the word "course"', () => {
    expect(titleKeywords('Introduction to the Theory of Statistics')).toBe('Introduction_Theory_Statistics')
    expect(titleKeywords('The Demo Course')).toBe('Demo')
    expect(titleKeywords('Art and Design')).toBe('Art_Design')
  })

  it('keeps numbers, which often tell sections apart', () => {
    expect(titleKeywords('Biology 101')).toBe('Biology_101')
  })

  it('removes punctuation, and turns accented letters into plain ones', () => {
    expect(titleKeywords('Español: Nivel 2!')).toBe('Espanol_Nivel_2')
    expect(titleKeywords('Math/Stats (Fall 2026)')).toBe('Math_Stats_Fall')
  })

  it('never ends in the middle of a word, and stays short', () => {
    const out = titleKeywords('Interdisciplinary Perspectives Communication')
    expect(out.length).toBeLessThanOrEqual(30)
    expect(out).toBe('Interdisciplinary_Perspectives')
    expect(titleKeywords('Supercalifragilisticexpialidocious_and_extra_long_word_here_forever')).toHaveLength(30)
  })

  it('is empty when there is nothing usable', () => {
    for (const t of [null, undefined, '', '   ', '???', '日本語', 'The of and']) expect(titleKeywords(t)).toBe('')
  })

  it('never contains anything a file name cannot', () => {
    expect(titleKeywords('A/B: C*D? "E" <F> |G|\\H')).toMatch(/^[A-Za-z0-9_]*$/)
  })
})

describe('courseFileSuffix', () => {
  it('uses the course code when there is one', () => {
    expect(courseFileSuffix('RESPCARE 560', 'Advanced Respiratory Care')).toBe('respcare_560')
  })

  it('uses the title when the course has no usable code', () => {
    expect(courseFileSuffix(null, 'eCampus Demo')).toBe('ecampus_demo')
    expect(courseFileSuffix(undefined, 'eCampus Demo')).toBe('ecampus_demo')
    expect(courseFileSuffix('', 'eCampus Demo')).toBe('ecampus_demo')
    expect(courseFileSuffix('---', 'eCampus Demo')).toBe('ecampus_demo')
  })

  it('cleans a code that has awkward characters', () => {
    expect(courseFileSuffix('ENGL-416/001', null)).toBe('engl_416_001')
  })
})

describe('localFileName', () => {
  it('puts the prefix in front of the plain name', () => {
    expect(localFileName(BASE, 'CS 321', null)).toBe('course_content_extraction_cs_321')
    expect(localFileName(BASE, null, 'eCampus Demo')).toBe('course_content_extraction_ecampus_demo')
  })

  it('falls back to the plain name when neither is usable', () => {
    expect(localFileName(BASE, null, null)).toBe(BASE)
    expect(localFileName(BASE, null, '日本語')).toBe(BASE)
  })
  it('puts the course part before a file extension', () => {
    expect(localFileName('course_rubrics.html', 'CS 321', null)).toBe('course_rubrics_cs_321.html')
    expect(localFileName('course_settings_tables.xlsx', null, 'eCampus Demo')).toBe('course_settings_tables_ecampus_demo.xlsx')
    expect(localFileName('course_rubrics.html', null, null)).toBe('course_rubrics.html')
  })
})
