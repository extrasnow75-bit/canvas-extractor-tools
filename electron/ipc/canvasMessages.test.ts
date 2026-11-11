import { describe, it, expect } from 'vitest'
import { CanvasApiError, canvasApiMessage, canvasUnreachableMessage } from './canvasMessages'

describe('canvasApiMessage', () => {
  it.each([401, 403, 404, 429, 500, 503, 422, 400])('status %i says what to do and keeps the cause last', (status) => {
    const m = canvasApiMessage(status, 'some canvas text')
    const [plain, details] = m.split(' Details for support: ')
    expect(plain).toMatch(/What to do:|try again/i)
    expect(plain).not.toMatch(/\b(40\d|42\d|5\d\d)\b|API|HTTP/)
    expect(details).toContain(`status ${status}`)
    expect(details).toContain('some canvas text')
  })
  it('names the roles a designer may hold when permission is refused', () => {
    expect(canvasApiMessage(403)).toMatch(/teacher, designer or course administrator/)
  })
  it('does not mention a VPN', () => {
    expect(canvasUnreachableMessage('fetch failed')).not.toMatch(/vpn/i)
  })
  it('keeps up to 1500 characters of detail', () => {
    expect(canvasApiMessage(500, 'x'.repeat(3000)).length).toBeLessThan(2100)
    expect(canvasApiMessage(500, 'x'.repeat(1000))).toContain('x'.repeat(1000))
  })
})

describe('CanvasApiError', () => {
  it('carries the status so callers need not read the wording', () => {
    const e = new CanvasApiError(404, 'The specified resource does not exist.')
    expect(e.status).toBe(404)
    expect(e.message).toMatch(/can’t find this course/)
  })
})

import { whatIsAsked } from './canvasMessages'
describe('what a failed request was about', () => {
  it('blames the course link only when the course itself was requested', () => {
    expect(whatIsAsked('https://x.instructure.com/api/v1/courses/123')).toBeUndefined()
    expect(whatIsAsked('https://x.instructure.com/api/v1/courses?per_page=100')).toBe('your list of courses')
    expect(whatIsAsked('https://x.instructure.com/api/v1/courses/123/quizzes?per_page=100')).toBe('part of this course')
  })
  it('says a missing quiz list is not a missing course', () => {
    const m = canvasApiMessage(404, 'not found', 'part of this course')
    expect(m).toMatch(/couldn’t find part of this course/)
    expect(m).not.toMatch(/can’t find this course/)
  })
  it('tells an expired-token user to remove the old token first, using one term', () => {
    const m = canvasApiMessage(401)
    expect(m).toMatch(/remove the old token/)
    expect(m).toMatch(/access token/)
    expect(m).not.toMatch(/access code/)
  })
})
