import { describe, it, expect } from 'vitest'
import { cleanErrorMessage } from './ErrorText'

/**
 * Covers the pure message-cleaning function and the URL pattern the renderer uses to turn a
 * console link into something clickable. The React rendering itself is not tested here —
 * this project has no DOM test setup — so the regex is exercised directly.
 */

// Kept in step with URL_RE in ErrorText.tsx.
const URL_RE = /(https?:\/\/[^\s]+?)([.,;:)\]]*)(?=\s|$)/g

function urlsIn(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[1])
}

describe('cleanErrorMessage', () => {
  it("strips Electron's IPC wrapper and the Error: prefixes it leaves behind", () => {
    const raw =
      "Error invoking remote method 'canvas:exportToDrive': Error: Sheets API request failed (403)."
    expect(cleanErrorMessage(raw)).toBe('Sheets API request failed (403).')
  })

  it('never returns an empty string', () => {
    expect(cleanErrorMessage('   ')).toBe('Something went wrong.')
  })
})

describe('URL detection in error text', () => {
  it('finds the console link in the Sheets-API-not-enabled message', () => {
    const message =
      'The Google Sheets API is not enabled for this app’s Google Cloud project. ' +
      'Enable it here: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456789012'
    expect(urlsIn(message)).toEqual([
      'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456789012',
    ])
  })

  it('leaves sentence punctuation out of the link', () => {
    // Otherwise the trailing full stop is carried into the URL and the link 404s.
    expect(urlsIn('Go to https://example.com/setup. Then retry.')).toEqual([
      'https://example.com/setup',
    ])
  })

  it('finds nothing in an ordinary error, so those render unchanged', () => {
    expect(urlsIn('Canvas API error 401: Invalid access token.')).toEqual([])
  })
})
