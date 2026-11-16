import { describe, it, expect } from 'vitest'
import { validateView } from './validateView'

const base = { urlValid: true, validating: false, courseName: null, nameError: null, source: 'typed' as const }

describe('validateView', () => {
  it('is a grey, unpressable Validate until the address is complete', () => {
    expect(validateView({ ...base, urlValid: false })).toEqual({ label: 'Validate', tone: 'off', pressable: false, note: null })
  })
  it('asks for a press when a full address has not been checked', () => {
    const v = validateView(base)
    expect(v).toMatchObject({ label: 'Validate', tone: 'ready', pressable: true })
    expect(v.note).toEqual({ kind: 'todo', text: 'Not checked yet. Press Validate to find the course.' })
  })
  it('says it is checking, in words that fit where the course came from', () => {
    expect(validateView({ ...base, validating: true })).toMatchObject({ label: 'Checking…', tone: 'busy', pressable: false, note: { kind: 'busy', text: 'Looking up this course…' } })
    expect(validateView({ ...base, validating: true, source: 'list' }).note?.text).toBe('Looking up the course you chose…')
  })
  it('is a finished, unpressable Validated once the course is found', () => {
    expect(validateView({ ...base, courseName: 'CS 408' })).toEqual({ label: 'Validated', tone: 'done', pressable: false, note: null })
  })
  it('offers Try again when the course could not be loaded', () => {
    expect(validateView({ ...base, nameError: 'Could not load this course.' })).toEqual({ label: 'Try again', tone: 'retry', pressable: true, note: null })
  })
  it('never offers a press while looking up, whatever else is true', () => {
    expect(validateView({ ...base, validating: true, courseName: 'x', nameError: 'y' }).pressable).toBe(false)
  })
})
