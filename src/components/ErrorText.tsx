import React from 'react'

/**
 * Presentation for error messages that reach the user.
 *
 * Two jobs. First, strip the plumbing: anything thrown inside an ipcMain handler comes back
 * to the renderer wrapped by Electron as
 *
 *     Error invoking remote method 'canvas:exportToDrive': Error: <the real message>
 *
 * which names an internal channel and says "remote method" to someone exporting a course.
 * The wrapper is added on the way across the boundary, so no amount of rewording in the main
 * process removes it — it has to come off here.
 *
 * Second, mark up the one phrase that names something on screen. "Initial setup" is a panel
 * the reader has to find, so it is set in italics to read as a label rather than as part of
 * the sentence.
 */

const IPC_WRAPPER_RE = /^Error invoking remote method '[^']*':\s*/
const ERROR_CLASS_PREFIX_RE = /^(?:[A-Z]\w*)?Error:\s*/

/** The plain-text message, with Electron's IPC wrapper and any `Error:` prefixes removed. */
export function cleanErrorMessage(raw: string): string {
  let out = raw.replace(IPC_WRAPPER_RE, '')
  // Repeated because the wrapper leaves its own "Error: " behind, and a rethrow can stack
  // more than one. Bounded by the fact that each pass must shorten the string.
  let previous: string
  do {
    previous = out
    out = out.replace(ERROR_CLASS_PREFIX_RE, '')
  } while (out !== previous)
  return out.trim() || 'Something went wrong.'
}

/** Exactly as the panel's own heading reads, so the reader is looking for the same words. */
const PANEL_NAME = 'Initial setup'

export function ErrorText({ message }: { message: string }) {
  const clean = cleanErrorMessage(message)
  const segments = clean.split(PANEL_NAME)

  return (
    <>
      {segments.map((segment, i) => (
        <React.Fragment key={i}>
          {segment}
          {i < segments.length - 1 && <em>{PANEL_NAME}</em>}
        </React.Fragment>
      ))}
    </>
  )
}
