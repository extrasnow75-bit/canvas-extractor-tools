/**
 * What the app tells people when Canvas will not do something.
 *
 * Same rules as googleMessages.ts: say what happened in plain words, say what to do, and keep the
 * technical cause for the end, after "Details for support:", where the renderer folds it behind
 * a "Show technical details" link. No status codes or technology names in the sentence itself.
 *
 * Kept free of Electron imports so the wording can be unit tested.
 */

import { SUPPORT_CONTACT } from './googleMessages'

import { redact } from './redact'

/** Longest technical detail kept. Plenty for a Canvas error, short enough not to flood the screen. */
const MAX_DETAIL = 1500

function details(text: string): string {
  const clean = redact(text).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL)
  return clean ? ` Details for support: ${clean}` : ''
}

/**
 * A Canvas request that came back with an error. Carries the status so callers can decide on it
 * (for example "this course has no home page") without searching the wording of the message.
 */
export class CanvasApiError extends Error {
  readonly status: number
  constructor(status: number, body = '', what?: string) {
    super(canvasApiMessage(status, body, what))
    this.name = 'CanvasApiError'
    this.status = status
  }
}

/**
 * `what` names the thing that was being asked for when it is not "this course" (for example "your
 * list of courses" or "part of this course"), so a 403 or 404 on a list or a sub-resource is not
 * blamed on the course link the person pasted.
 */
export function canvasApiMessage(status: number, body = '', what?: string): string {
  const tail = details(`Canvas replied with status ${status}${body ? `: ${body}` : '.'}`)
  if (status === 401) {
    return (
      'Canvas no longer accepts your saved access token. It may have expired. ' +
      'What to do: make a new access token in Canvas (Account → Settings → New Access Token). ' +
      'Then open Initial setup at the top, remove the old token, and paste the new one.' +
      tail
    )
  }
  if (status === 403) {
    return (
      (what
        ? `Canvas says your account isn’t allowed to see ${what}. ` +
          'What to do: make sure you are a teacher, designer or course administrator in the course. Your school may also have turned this part off.'
        : 'Your Canvas account isn’t allowed to do this in this course. ' +
          'What to do: make sure you are a teacher, designer or course administrator in the course, ' +
          'or ask the course owner to add you.') + tail
    )
  }
  if (status === 404) {
    return (
      (what
        ? `Canvas couldn’t find ${what}. What to do: check the Canvas site address and your course link, then try again.`
        : 'Canvas can’t find this course. ' +
          'What to do: check that the link you pasted is the right course, and that you are signed up in it. ' +
          'Courses that have ended may no longer be available.') + tail
    )
  }
  if (status === 429) {
    return 'Canvas needs the app to slow down. What to do: wait 5 minutes and try again.' + tail
  }
  if (status >= 500) {
    return (
      'Canvas is having trouble right now. This is not caused by you or your course. ' +
      'What to do: wait a few minutes and try again. If it still fails, tell your Canvas support team.' +
      tail
    )
  }
  return (
    'Canvas wouldn’t accept that. ' +
    `What to do: try again. If it fails again, send the technical details to ${SUPPORT_CONTACT}.` +
    tail
  )
}

/** What a Canvas API path is about, for the cases where "this course" would be the wrong thing to blame. */
export function whatIsAsked(url: string): string | undefined {
  let path: string
  try {
    path = new URL(url).pathname.replace(/^\/api\/v1/, '')
  } catch {
    return undefined
  }
  if (/^\/courses\/\d+\/?$/.test(path)) return undefined // the course itself
  if (/^\/(courses|accounts|users\/self\/courses|accounts\/\d+\/courses)\/?$/.test(path)) return 'your list of courses'
  return 'part of this course'
}

/** The request never got an answer. `cause` is the system's own description, kept for support. */
export function canvasUnreachableMessage(cause = ''): string {
  return (
    'The app can’t reach Canvas. What to do: check your internet connection and try again.' +
    details(cause)
  )
}
