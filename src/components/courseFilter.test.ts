import { describe, it, expect } from 'vitest'
import { visibleGroups, countCourses } from './courseFilter'
import type { CourseChoice } from '../types'

const c = (id: string, name: string, term: string, ended = false, code = ''): CourseChoice => ({
  id, name, code, role: 'teacher', roleLabel: 'Teacher', term, termStart: null, ended, blueprint: false,
})
const all = [
  c('1', 'Intro to Health', 'Fall 2026', false, 'HLTH-101'),
  c('2', 'Respiratory Care', 'Fall 2026', false, 'RESPCARE-560'),
  c('3', 'Data Structures', 'Spring 2026', true, 'CS-321'),
]

describe('visibleGroups', () => {
  it('lists every course, ended ones included', () => {
    expect(countCourses(visibleGroups(all, ''))).toBe(3)
  })
  it('groups by term in the given order', () => {
    expect(visibleGroups(all, '').map((g) => g.term)).toEqual(['Fall 2026', 'Spring 2026'])
  })
  it('matches every typed word against name and code', () => {
    expect(visibleGroups(all, 'resp 560')[0].courses[0].id).toBe('2')
    expect(visibleGroups(all, 'health care')).toEqual([])
  })
})

describe('visibleGroups with live and ended courses in one term', () => {
  it('never labels a live course as ended, or the other way round', () => {
    const mixed = [c('1', 'Live', 'Fall 2026', false), c('2', 'Done', 'Fall 2026', true)]
    expect(visibleGroups(mixed, '').map((g) => [g.term, g.ended, g.courses.length])).toEqual([['Fall 2026', false, 1], ['Fall 2026', true, 1]])
  })
})
