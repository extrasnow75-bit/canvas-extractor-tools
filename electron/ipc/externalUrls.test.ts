import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl } from './externalUrls'

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://docs.google.com/document/d/abc/edit',
    'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=1',
    'https://boisestatecanvas.instructure.com/courses/1',
    'https://github.com/extrasnow75-bit/canvas-extractor-tools/releases/latest',
    'https://boisestateecampus.atlassian.net/wiki/spaces/x',
  ])('opens %s', (u) => expect(isAllowedExternalUrl(u)).toBe(true))

  it.each([
    'http://docs.google.com/',
    'file:///C:/Windows/System32/calc.exe',
    'https://evil.example/login',
    'https://docs.google.com.evil.example/',
    'https://instructure.com.evil.example/',
    'https://user:pw@docs.google.com/',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s', (u) => expect(isAllowedExternalUrl(u)).toBe(false))
})
