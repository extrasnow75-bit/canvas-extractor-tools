import { describe, it, expect } from 'vitest'
import {
  MSG_NOT_SIGNED_IN,
  MSG_SIGN_IN_EXPIRED,
  MSG_UNREACHABLE,
  MSG_NOT_SET_UP,
  notSetUpMessage,
  MSG_STATE_MISMATCH,
  MSG_SIGN_IN_TIMEOUT,
  MSG_NO_REFRESH_TOKEN,
  MSG_KEYCHAIN,
  signInCancelledMessage,
  tokenExchangeMessage,
  googleApiMessage,
  classifyRefreshFailure,
} from './googleMessages'

// Words that mean something to a developer and nothing to the person reading.
const JARGON = /\b(OAuth|PKCE|token|refresh|\.env|env\.local|client secret|client ID|API|endpoint|keychain|JSON|HTTP|stack|undefined|exception)\b/i

/** The part a person reads: everything before "Details for support:". */
const readable = (m: string) => m.split(' Details for support:')[0]

const fixed = {
  MSG_NOT_SIGNED_IN,
  MSG_SIGN_IN_EXPIRED,
  MSG_UNREACHABLE,
  MSG_NOT_SET_UP,
  MSG_STATE_MISMATCH,
  MSG_SIGN_IN_TIMEOUT,
  MSG_NO_REFRESH_TOKEN,
  MSG_KEYCHAIN,
}

describe('every message', () => {
  const all: Array<[string, string]> = [
    ...Object.entries(fixed),
    ['cancelled: denied', signInCancelledMessage('access_denied')],
    ['cancelled: other', signInCancelledMessage('something_else')],
    ['cancelled: none', signInCancelledMessage()],
    ['exchange 400', tokenExchangeMessage(400, '{"error":"invalid_grant"}')],
    ['exchange invalid_client', tokenExchangeMessage(401, '{"error":"invalid_client"}')],
    ['api 401', googleApiMessage('Drive', 'saving the file to Google Drive', 401)],
    ['api 403 quota', googleApiMessage('Drive', 'saving the file to Google Drive', 403, 'storageQuotaExceeded')],
    ['api 403 rate', googleApiMessage('Drive', 'saving the file to Google Drive', 403, 'userRateLimitExceeded')],
    ['api 403', googleApiMessage('Drive', 'saving the file to Google Drive', 403, 'forbidden')],
    ['api 403 scopes', googleApiMessage('Drive', 'saving the file to Google Drive', 403, 'Insufficient Permission')],
    ['api 404', googleApiMessage('Docs', 'finishing the Google Doc', 404)],
    ['api 429', googleApiMessage('Sheets', 'creating the Google Sheet', 429)],
    ['api 503', googleApiMessage('Sheets', 'creating the Google Sheet', 503)],
    ['api 418', googleApiMessage('Sheets', 'creating the Google Sheet', 418, 'teapot')],
  ]

  it.each(all)('%s is in plain words, with no developer vocabulary', (_name, message) => {
    expect(readable(message)).not.toMatch(JARGON)
  })

  it.each(all)('%s says what to do next', (_name, message) => {
    expect(readable(message)).toMatch(/\b(try again|sign in|signing in|choose|ask|tell|wait|restart|free up|remove|run the extraction)\b/i)
  })

  it.each(all)('%s never leads with a status code or a technical name', (_name, message) => {
    expect(readable(message)).not.toMatch(/\b[1-5]\d\d\b/)
  })
})

describe('the "not set up" message', () => {
  it('says only what is true: this copy has no Google sign-in, and what to do about it', () => {
    expect(MSG_NOT_SET_UP).toMatch(/not set up for Google sign-in/)
    expect(MSG_NOT_SET_UP).toMatch(/Continue without Google/)
    expect(MSG_NOT_SET_UP).toMatch(/tell the person who supports this app\.$/)
  })

  it('does not suggest any approval or endorsement by anyone', () => {
    for (const m of [MSG_NOT_SET_UP, tokenExchangeMessage(401, 'invalid_client')]) {
      expect(m).not.toMatch(/\b(official|approved|authorized|authorised|certified|endorsed)\b/i)
    }
  })
})

describe('the sign-in messages', () => {
  it('tell the person where to sign in, and offer saving to the computer instead', () => {
    for (const m of [MSG_NOT_SIGNED_IN, MSG_SIGN_IN_EXPIRED]) {
      expect(m).toContain('Initial setup')
      expect(m).toContain('Sign in with Google')
      expect(m).toContain('save a local copy')
    }
  })

  it('treat being denied as the person’s own choice, not a fault', () => {
    expect(signInCancelledMessage('access_denied')).toMatch(/you chose not to allow/i)
  })

  it('send an app setup problem to support, not to the person', () => {
    const m = tokenExchangeMessage(401, '{"error":"invalid_client"}')
    expect(m).toMatch(/not set up for Google sign-in/)
    expect(m).toMatch(/Details for support: Google sign-in exchange 401/)
  })
})

describe('support details', () => {
  it('come last, after the plain explanation, and are short', () => {
    const m = tokenExchangeMessage(400, 'x'.repeat(1000))
    expect(m.indexOf('Details for support:')).toBeGreaterThan(m.indexOf('Please try again'))
    expect(m.split('Details for support:')[1].length).toBeLessThanOrEqual(210)
  })

  it('are left off when there is nothing to add', () => {
    expect(signInCancelledMessage('access_denied')).not.toContain('Details for support')
    expect(googleApiMessage('Drive', 'x', 401)).not.toContain('Details for support')
  })
})

describe('googleApiMessage', () => {
  it('tells a full Drive from a refusal', () => {
    expect(googleApiMessage('Drive', 'saving', 403, 'storageQuotaExceeded')).toMatch(/Google Drive is full/)
    expect(googleApiMessage('Drive', 'saving', 403, 'forbidden')).toMatch(/would not allow/)
    expect(
      googleApiMessage('Drive', 'saving', 403, '{"error":{"message":"Request had insufficient authentication scopes."}}'),
    ).toMatch(/tick the Drive box/)
  })

  it('tells Google being busy or broken from the person’s own problem', () => {
    expect(googleApiMessage('Sheets', 'saving', 429)).toMatch(/busy/)
    expect(googleApiMessage('Sheets', 'saving', 500)).toMatch(/having a problem/)
  })

  it('sends a 401 to the expired sign-in message', () => {
    expect(googleApiMessage('Drive', 'saving', 401)).toBe(MSG_SIGN_IN_EXPIRED)
  })
})

describe('classifyRefreshFailure', () => {
  it('ends the sign-in only when Google refuses it', () => {
    expect(classifyRefreshFailure(400)).toBe('expired')
    expect(classifyRefreshFailure(401)).toBe('expired')
  })

  it('does not blame the sign-in for Google being unavailable', () => {
    for (const s of [429, 500, 502, 503]) expect(classifyRefreshFailure(s)).toBe('unknown')
  })

describe('notSetUpMessage', () => {
  it('keeps the plain message and adds what is missing for support', () => {
    const m = notSetUpMessage('client secret')
    expect(m.startsWith(MSG_NOT_SET_UP)).toBe(true)
    expect(m).toContain('Details for support: This copy was built without the Google client secret')
  })
})
})
