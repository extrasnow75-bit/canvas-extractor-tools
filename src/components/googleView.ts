import type { GoogleCheckState } from '../types'

/**
 * How the app describes the Google sign-in, in one place so the setup panel, the line above
 * the tools and the tiles can never disagree about it.
 *
 * The state is what a check of the stored sign-in found, not whether something is stored: a
 * name and an email are only shown as "signed in" once Google has confirmed them.
 */

export type GoogleTone = 'good' | 'warn' | 'neutral'

export interface GoogleLine {
  tone: GoogleTone
  text: string
  /** Offer a way to sign in next to the text. */
  offerSignIn: boolean
}

export function googleLine(state: GoogleCheckState, who?: string | null): GoogleLine {
  switch (state) {
    case 'checking':
      return { tone: 'neutral', text: 'Checking your Google sign-in…', offerSignIn: false }
    case 'valid':
      return {
        tone: 'good',
        text: `Signed in to Google${who ? ` as ${who}` : ''}. Extractions can be saved as Google Docs and Sheets.`,
        offerSignIn: false,
      }
    case 'unknown':
      return {
        tone: 'warn',
        text: 'Could not check your Google sign-in just now. The app could not reach Google. You can still try, or save files to your computer.',
        offerSignIn: false,
      }
    case 'expired':
      return {
        tone: 'warn',
        text: 'Your Google sign-in has expired. Sign in again to save to Google Drive, or save files to your computer.',
        offerSignIn: true,
      }
    case 'none':
      return {
        tone: 'neutral',
        text: 'Not signed in to Google. Extractions will be saved as files on your computer.',
        offerSignIn: true,
      }
  }
}

/**
 * Whether the tools should offer saving to Google Drive. Waiting for the check, or not being
 * able to complete it, does not take the option away: the extraction checks again before any
 * work starts, and an offer that quietly vanished would be more confusing than one that fails
 * early with a clear reason.
 */
export function googleReady(state: GoogleCheckState): boolean {
  return state === 'valid' || state === 'unknown' || state === 'checking'
}

/** A sign-in the app can show a name for. Never while the check is still running. */
export function googleSignedIn(state: GoogleCheckState): boolean {
  return state === 'valid' || state === 'unknown'
}
