import { describe, it, expect } from 'vitest'
import { groupState, withGroup } from './pickerSelection'

const ids = ['a', 'b', 'c']

describe('groupState', () => {
  it('is all, some or none by how many of the group are selected', () => {
    expect(groupState(ids, new Set(['a', 'b', 'c']))).toBe('all')
    expect(groupState(ids, new Set(['a', 'c']))).toBe('some')
    expect(groupState(ids, new Set())).toBe('none')
  })

  it('ignores selected items that belong to other groups', () => {
    expect(groupState(ids, new Set(['x', 'y']))).toBe('none')
    expect(groupState(ids, new Set(['a', 'b', 'c', 'x']))).toBe('all')
  })

  it('treats an empty group as none, never all', () => {
    expect(groupState([], new Set(['x']))).toBe('none')
  })
})

describe('withGroup', () => {
  it('selects every item in the group and leaves the rest alone', () => {
    const next = withGroup(new Set(['x']), ids, true)
    expect([...next].sort()).toEqual(['a', 'b', 'c', 'x'])
  })

  it('clears only the group', () => {
    const next = withGroup(new Set(['a', 'b', 'c', 'x']), ids, false)
    expect([...next]).toEqual(['x'])
  })

  it('completes a partly selected group when switched on', () => {
    expect(groupState(ids, withGroup(new Set(['a']), ids, true))).toBe('all')
  })

  it('does not change the selection it was given', () => {
    const original = new Set(['a'])
    withGroup(original, ids, true)
    expect([...original]).toEqual(['a'])
  })
})
