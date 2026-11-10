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
