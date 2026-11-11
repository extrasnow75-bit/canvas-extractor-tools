/**
 * Selection rules for a picker group (a module's worth of items), kept apart from the
 * component so they can be tested without a window.
 */

export type GroupState = 'all' | 'some' | 'none'

/** Whether every, some, or none of a group's items are selected. An empty group is 'none'. */
export function groupState(ids: readonly string[], selected: ReadonlySet<string>): GroupState {
  if (ids.length === 0) return 'none'
  const count = ids.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0)
  if (count === 0) return 'none'
  return count === ids.length ? 'all' : 'some'
}

/** A new selection with every item in the group switched on or off. Other items are untouched. */
export function withGroup(selected: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(selected)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}
