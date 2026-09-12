import React from 'react'

/**
 * Presentation for error messages that reach the user.
 *
 * Two jobs. First, strip the plumbing: anything thrown inside an ipcMain handler comes back
 * to the renderer wrapped by Electron as
 *
 *     Error invoking remote method 'canvas:exportToDrive': Error: <the real message>
 *
 * which names an internal channel and says "remote method" to someone extracting a course.
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

/**
 * Trailing punctuation is part of the sentence, not the address — a message ending
 * "…overview?project=123." would otherwise carry the full stop into the link.
 */
const URL_RE = /(https?:\/\/[^\s]+?)([.,;:)\]]*)(?=\s|$)/g

/**
 * Some errors exist to tell the reader where to go — the Sheets API one hands over a Google
 * Cloud console URL to click. Rendered as plain text that link is unusable: not reachable by
 * keyboard or screen reader, and ninety characters to select by hand. It is opened through
 * `window.open`, matching the "Open again" button on a finished extraction; main.ts refuses
 * the popup and hands the URL to the real browser, and only for http(s).
 */
function LinkedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(URL_RE)) {
    const [, url, trailing] = match
    const start = match.index ?? 0
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <button
        key={start}
        onClick={() => window.open(url, '_blank')}
        /* break-all so a long URL wraps inside the tile instead of forcing the card wider
           than the window — the same treatment long strings get in HelpCenter and
           SetupPanel. */
        className="underline underline-offset-2 font-bold text-blue-700 hover:text-blue-900 break-all text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
      >
        {url}
      </button>,
    )
    parts.push(trailing)
    cursor = start + match[0].length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return <>{parts}</>
}

export function ErrorText({ message }: { message: string }) {
  const clean = cleanErrorMessage(message)
  const segments = clean.split(PANEL_NAME)

  return (
    <>
      {segments.map((segment, i) => (
        <React.Fragment key={i}>
          <LinkedText text={segment} />
          {i < segments.length - 1 && <em>{PANEL_NAME}</em>}
        </React.Fragment>
      ))}
    </>
  )
}
