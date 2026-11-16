import React, { useEffect, useId, useRef } from 'react'
import { groupState } from './pickerSelection'

interface Props {
  moduleName: string
  /** What the group is called in the label: "module" for a real module, "group" for the catch-all group. */
  noun?: string
  /** The ids of every item in the module, headers included. */
  ids: readonly string[]
  selected: ReadonlySet<string>
  onChange(on: boolean): void
}

/**
 * The "Everything in this module" row under a module's heading in an item picker.
 *
 * It summarises the items below it: ticked when all are, empty when none are, and showing a dash
 * when only some are. The dash is the browser's own "indeterminate" state, which screen readers
 * announce as mixed. Clicking it from the dash selects everything, as such boxes normally do.
 */
export function ModuleSelectRow({ moduleName, noun = 'module', ids, selected, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  const state = groupState(ids, selected)
  const count = ids.reduce((n, item) => n + (selected.has(item) ? 1 : 0), 0)

  // `indeterminate` is a property of the element, not an attribute, so it cannot be set in JSX.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])

  return (
    <label className="flex items-center gap-2 py-1 px-1 mb-0.5 rounded-lg hover:bg-gray-50 text-[13px] font-bold cursor-pointer border-b border-gray-100">
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'all'}
        onChange={(e) => onChange(e.target.checked)}
        // The visible words are the same for every module, so the name carries which one. It
        // starts with the visible label, which is what voice-control users say.
        aria-label={`Everything in this ${noun}, ${moduleName}`}
        aria-describedby={`${id}-count`}
        className="w-3.5 h-3.5 accent-[#0033a0]"
      />
      <span>Everything in this {noun}</span>
      <span id={`${id}-count`} className="ml-auto font-normal text-[11px] text-gray-600 tabular-nums">
        {count} of {ids.length} selected
      </span>
    </label>
  )
}
