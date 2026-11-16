import { describe, it, expect } from 'vitest'
import { pickLoose, hasLooseKey, isLooseKey } from './looseContent'
import type { CanvasModuleItem } from './canvasExport'

const inModules: CanvasModuleItem[] = [
  { id: 1, title: 'P', type: 'Page', page_url: 'in-module' },
  { id: 2, title: 'A', type: 'Assignment', content_id: 20 },
  { id: 3, title: 'D', type: 'Discussion', content_id: 30 },
  { id: 4, title: 'Q', type: 'Quiz', content_id: 40 },
]

describe('pickLoose', () => {
  const src = {
    pages: [
      { url: 'in-module', title: 'In a module', published: true },
      { url: 'zeta', title: 'Zeta', published: true, page_id: 9 },
      { url: 'alpha', title: 'Alpha', published: true, page_id: 8 },
      { url: 'hidden', title: 'Hidden', published: false },
      { url: 'front', title: 'Home', published: true, front_page: true },
    ],
    assignments: [
      { id: 20, name: 'In a module', published: true },
      { id: 21, name: 'Loose', published: true },
      { id: 22, name: 'Unpublished', published: false },
      { id: 23, name: 'Graded discussion', published: true, submission_types: ['discussion_topic'] },
      { id: 24, name: 'Classic quiz', published: true, submission_types: ['online_quiz'] },
      { id: 25, name: 'New quiz', published: true, is_quiz_lti_assignment: true },
    ],
    discussions: [{ id: 30, title: 'In a module', published: true }, { id: 31, title: 'Loose talk', published: true }, { id: 32, title: 'Draft talk', published: false }],
    quizzes: [{ id: 40, title: 'In a module', published: true }, { id: 41, title: 'Loose quiz', published: true }],
  }
  const out = pickLoose(inModules, src)

  it('keeps only published items that no module holds', () => {
    expect(out.map((i) => i.key)).toEqual(['pg-alpha', 'pg-zeta', 'as-21', 'dt-31', 'qz-41'])
  })
  it('leaves out the front page and the items behind a discussion or a quiz', () => {
    const keys = out.map((i) => i.key)
    expect(keys).not.toContain('pg-front')
    expect(keys).not.toEqual(expect.arrayContaining(['as-23']))
    expect(keys).not.toContain('as-24')
    expect(keys).not.toContain('as-25')
  })
  it('shapes each as a module item the extractors already understand', () => {
    expect(out[0]).toMatchObject({ type: 'Page', page_url: 'alpha', title: 'Alpha' })
    expect(out[2]).toMatchObject({ type: 'Assignment', content_id: 21 })
  })
  it('recognises the picker keys', () => {
    expect(isLooseKey('pg-x') && isLooseKey('as-1') && isLooseKey('dt-1') && isLooseKey('qz-1')).toBe(true)
    expect(isLooseKey('mi-5')).toBe(false)
    expect(hasLooseKey(new Set(['mi-1', 'home']))).toBe(false)
    expect(hasLooseKey(new Set(['mi-1', 'qz-3']))).toBe(true)
  })
})
