/**
 * What the app tells people when Canvas will not do something.
 *
 * Same rules as googleMessages.ts: say what happened in plain words, say what to do, and keep the
 * technical cause for the end, after "Details for support:", where the renderer folds it behind
 * a "Show technical details" link. No status codes or technology names in the sentence itself.
 *
 * Kept free of Electron imports so the wording can be unit tested.
 */

/** Longest technical detail kept. Plenty for a Canvas error, short enough not to flood the screen. */
const MAX_DETAIL = 1500

function details(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL)
  return clean ? ` Details for support: ${clean}` : ''
}

/**
 * A Canvas request that came back with an error. Carries the status so callers can decide on it
 * (for example "this course has no home page") without searching the wording of the message.
 */
export class CanvasApiError extends Error {
  readonly status: number
  constructor(status: number, body = '') {
    super(canvasApiMessage(status, body))
    this.name = 'CanvasApiError'
    this.status = status
  }
}

export function canvasApiMessage(status: number, body = ''): string {
  const tail = details(`Canvas replied with status ${status}${body ? `: ${body}` : '.'}`)
  if (status === 401) {
    return (
      'Canvas no longer accepts your saved access code. It may have expired. ' +
      'What to do: open Initial setup at the top, make a new access token in Canvas ' +
      '(Account → Settings → New Access Token), and paste it in.' +
      tail
    )
  }
  if (status === 403) {
    return (
      'Your Canvas account isn’t allowed to do this in this course. ' +
      'What to do: make sure you are a teacher, designer or course administrator in the course, ' +
      'or ask the course owner to add you.' +
      tail
    )
  }
  if (status === 404) {
    return (
      'Canvas can’t find this course. ' +
      'What to do: check that the link you pasted is the right course, and that you are signed up in it. ' +
      'Courses that have ended may no longer be available.' +
      tail
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
    'What to do: try again. If it fails again, send the technical details to the person who supports this app.' +
    tail
  )
}

/** The request never got an answer. `cause` is the system's own description, kept for support. */
export function canvasUnreachableMessage(cause = ''): string {
  return (
    'The app can’t reach Canvas. What to do: check your internet connection and try again.' +
    details(cause)
  )
}
