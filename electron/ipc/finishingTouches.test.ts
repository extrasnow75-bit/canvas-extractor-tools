import { describe, it, expect } from 'vitest'
import { finishingTouchNote } from './finishingTouches'

describe('finishingTouchNote', () => {
  it('says nothing when everything worked', () => {
    expect(finishingTouchNote([])).toBe('')
  })
  it('never repeats a save-failure sentence or tells the person to try again', () => {
    const note = finishingTouchNote([
      {
        missing: 'the blue lines',
        error: new Error('Your Google sign-in has expired, so this cannot be saved to your Google Drive. Details for support: Docs 401.'),
      },
    ])
    expect(note).not.toMatch(/expired|cannot be saved|try again/i)
    expect(note).toMatch(/saved and open/)
    expect(note).toMatch(/do not need to run the extraction again/)
    expect(note).toMatch(/Details for support: Docs 401\./)
  })
  it('lists every missing touch once and keeps one details section at the end', () => {
    const note = finishingTouchNote([
      { missing: 'the blue lines', error: new Error('x Details for support: Docs 500.') },
      { missing: 'the tool dropdowns', error: new Error('y Details for support: Docs 503.') },
    ])
    expect(note).toContain('the blue lines; the tool dropdowns')
    expect(note.match(/Details for support:/g)).toHaveLength(1)
    expect(note.endsWith('Docs 500. | Docs 503.')).toBe(true)
  })
})
