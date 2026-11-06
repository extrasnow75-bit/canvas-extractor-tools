/**
 * What the app tells people when something goes wrong with Google.
 *
 * Every message follows the same three rules: say what happened in plain words, say what it
 * means for the person, and say what to do next. No status codes, no names of technologies and
 * no instructions meant for a developer. Where support might need the technical cause, it comes
 * last, after "Details for support:", so it can be read out or pasted without being the first
 * thing anyone meets.
 *
 * Kept free of Electron imports so the wording can be unit tested.
 */

/** What a check of the stored Google sign-in found. */
export type GoogleCheck = 'valid' | 'expired' | 'unknown' | 'none'

const ASK_SUPPORT = 'If it keeps happening, tell the person who supports this app.'
const OR_LOCAL = 'Or choose “save a local copy” to save a file on your computer instead.'

function details(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  return clean ? ` Details for support: ${clean}` : ''
}

/** "Initial setup" is the name of a panel on screen; the display wraps it in italics. */
export const MSG_NOT_SIGNED_IN =
  'You are not signed in to Google, so this cannot be saved to your Google Drive. ' +
  'Open Initial setup at the top, choose Sign in with Google, and try again. ' +
  OR_LOCAL

export const MSG_SIGN_IN_EXPIRED =
  'Your Google sign-in has expired, so this cannot be saved to your Google Drive. ' +
  'Open Initial setup at the top, choose Sign in with Google, and try again. ' +
  OR_LOCAL

export const MSG_UNREACHABLE =
  'The app could not reach Google. Check your internet connection and try again. ' +
  'You can still choose “save a local copy” to save a file on your computer.'

export const MSG_NOT_SET_UP =
  'This copy of the app was not set up for Google sign-in, so Google features are not available in it. ' +
  'You can still choose “Continue without Google” and save files to your computer. ' +
  'If you expected Google sign-in to work, tell the person who supports this app.'

/**
 * MSG_NOT_SET_UP with the reason for support: which piece this copy of the app is missing.
 * "No client secret" means the build did not receive it, which only the person who makes
 * builds can fix, and is worth saying outright because the message above reads the same either way.
 */
export function notSetUpMessage(missing: 'client ID' | 'client secret'): string {
  return `${MSG_NOT_SET_UP}${details(`This copy was built without the Google ${missing}`)}`
}

export const MSG_STATE_MISMATCH =
  'The Google sign-in did not match the window that started it, so it was stopped to keep your account safe. ' +
  'Please choose Sign in with Google and try again.'

export const MSG_SIGN_IN_TIMEOUT =
  'Google sign-in took too long, so it was stopped. Choose Sign in with Google and finish signing in within three minutes.'

export const MSG_NO_REFRESH_TOKEN =
  'Google signed you in but did not give the app lasting access. In your Google Account, open Security, ' +
  'then Third-party apps and services, remove Canvas Extractor Tools, and then sign in here again.'

export const MSG_KEYCHAIN =
  'This computer’s secure storage is not available, so the app cannot keep your Google sign-in. ' +
  `Restart the app and try again. ${ASK_SUPPORT}`

/** The person closed the Google window or pressed Cancel; `code` is Google's word for why. */
export function signInCancelledMessage(code?: string | null): string {
  if (code === 'access_denied') {
    return 'You chose not to allow access, so you are not signed in to Google. If that was a mistake, choose Sign in with Google and try again.'
  }
  return `Google sign-in did not finish. Choose Sign in with Google and try again.${code ? details(`Google said: ${code}`) : ''}`
}

/** Google refused the exchange that completes a sign-in. */
export function tokenExchangeMessage(status: number, body: string): string {
  // These two mean the app's own Google settings are wrong, which nothing the person does fixes.
  if (/invalid_client|unauthorized_client/i.test(body)) return `${MSG_NOT_SET_UP}${details(`Google sign-in exchange ${status}`)}`
  return `Google did not finish signing you in. Please try again. ${ASK_SUPPORT}${details(`Google sign-in exchange ${status}. ${body}`)}`
}

/**
 * A failed Drive, Docs or Sheets request, by what the app was doing at the time.
 * `doing` finishes the sentence "while …", for example "saving the file to Google Drive".
 */
export function googleApiMessage(service: string, doing: string, status: number, body = ''): string {
  const tail = details(`${service} ${status}. ${body}`)
  if (status === 401) return MSG_SIGN_IN_EXPIRED
  if (status === 403 && /storageQuotaExceeded|storage quota/i.test(body)) {
    return 'Your Google Drive is full, so the file could not be saved. Free up some space in Google Drive and try again.'
  }
  if (status === 429 || (status === 403 && /rateLimit|RATE_LIMIT/i.test(body))) {
    return `Google is busy right now. Wait a minute and try again.${tail}`
  }
  if (status === 403) {
    return `Google would not allow the app to do that while ${doing}. Try signing out and signing in again. ${ASK_SUPPORT}${tail}`
  }
  if (status === 404) return `Google could not find the file it needed while ${doing}. Please run the extraction again.${tail}`
  if (status >= 500) return `Google is having a problem right now. Wait a few minutes and try again.${tail}`
  return `Something went wrong while ${doing}. Please try again. ${ASK_SUPPORT}${tail}`
}

/**
 * Whether a failed refresh means the sign-in is finished or Google was merely unavailable.
 * Only a refusal ends it. Treating an outage as a dead sign-in would sign people out for
 * Google's trouble and make them do it all again.
 */
export function classifyRefreshFailure(status: number): 'expired' | 'unknown' {
  return status === 400 || status === 401 ? 'expired' : 'unknown'
}

/**
 * fetch for Google's servers. A request that never gets an answer (no connection, a firewall)
 * would otherwise surface as the browser's own "fetch failed", which tells a person nothing.
 */
export async function googleFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new Error(MSG_UNREACHABLE)
  }
}
