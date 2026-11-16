import { describe, it, expect } from 'vitest'
import { googleLine, googleReady, googleSignedIn } from './googleView'
import type { GoogleCheckState } from '../types'

const ALL: GoogleCheckState[] = ['checking', 'valid', 'unknown', 'expired', 'none']

describe('googleLine', () => {
  it('names the account only when Google has confirmed the sign-in', () => {
    expect(googleLine('valid', 'a@b.edu').text).toContain('a@b.edu')
    for (const state of ALL.filter((s) => s !== 'valid')) {
      expect(googleLine(state, 'a@b.edu').text).not.toContain('a@b.edu')
    }
  })

  it('never says signed in unless it is confirmed', () => {
    for (const state of ALL.filter((s) => s !== 'valid')) {
      expect(googleLine(state).text).not.toMatch(/^Signed in/)
    }
  })

  it('offers to sign in exactly when signing in would help', () => {
    expect(ALL.filter((s) => googleLine(s).offerSignIn)).toEqual(['expired', 'none'])
  })

  it('is plain: no codes, no technical words', () => {
    for (const state of ALL) {
      expect(googleLine(state, 'a@b.edu').text).not.toMatch(/\b(token|OAuth|API|401|400|refresh)\b/i)
    }
  })

  it('says what happens to the files in each state that is not signed in', () => {
    expect(googleLine('none').text).toMatch(/saved as files on your computer/)
    expect(googleLine('expired').text).toMatch(/save files to your computer/)
  })

  it('uses a warning tone for the states that need attention, and good only when confirmed', () => {
    expect(ALL.filter((s) => googleLine(s).tone === 'good')).toEqual(['valid'])
    expect(googleLine('expired').tone).toBe('warn')
    expect(googleLine('unknown').tone).toBe('warn')
  })
})

describe('googleReady', () => {
  it('keeps the Google option while checking or unable to check, and removes it when not signed in', () => {
    expect(ALL.filter(googleReady)).toEqual(['checking', 'valid', 'unknown'])
  })
})

describe('googleSignedIn', () => {
  it('is true only for a confirmed sign-in, or one that could not be ruled out', () => {
    expect(ALL.filter(googleSignedIn)).toEqual(['valid', 'unknown'])
  })
})
