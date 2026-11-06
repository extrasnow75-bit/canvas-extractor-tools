import { describe, it, expect } from 'vitest'
import { courseLink } from './cleanFormat'

describe('courseLink', () => {
  it('shows the address as a clickable link', () => {
    const html = courseLink('https://boisestate.instructure.com/courses/82')
    expect(html).toContain('href="https://boisestate.instructure.com/courses/82"')
    expect(html).toContain('>https://boisestate.instructure.com/courses/82</a>')
  })

  it('escapes characters that could break out of the attribute', () => {
    expect(courseLink('https://x.test/courses/1"><b>')).not.toContain('"><b>')
  })
})

import { extractionStampText } from './cleanFormat'

describe('extractionStampText', () => {
  it('gives the date, the time and the time zone', () => {
    const when = new Date('2026-05-05T02:45:00Z')
    expect(extractionStampText(when, 'America/Denver')).toBe('Extracted May 4, 2026 at 8:45 PM MDT')
  })
})
