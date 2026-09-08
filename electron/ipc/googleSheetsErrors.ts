/**
 * Turns the one Sheets API failure people actually hit into an answer they can act on.
 *
 * Kept out of googleSheets.ts so it can be unit tested: that module reaches googleAuth.ts,
 * which reads `app.getPath` at module scope and cannot be imported outside Electron.
 */

/**
 * The first thing anyone meets on a fresh Google Cloud project. The raw response is a poor
 * guide to fixing it — the console URL sits at the very end of a long JSON body, so it was
 * the first thing lost when the message was truncated for display. Answered here the way
 * main.ts answers the equivalent Docs API failure, with the enablement link rebuilt from
 * the project id Google names in the error.
 *
 * Returns null for every other failure, which keeps its own detail.
 */
export function apiNotEnabledMessage(body: string): string | null {
  if (!/has not been used in project|Google Sheets API .*is disabled/i.test(body)) return null
  const project = body.match(/project\s+(\d+)/)?.[1]
  return (
    'The Google Sheets API is not enabled for this app’s Google Cloud project, so the ' +
    'spreadsheet could not be created. Enable it, wait a minute, and run the extraction ' +
    'again — nothing else needs changing, and you do not need to sign in again. ' +
    (project
      ? `Enable it here: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${project}`
      : 'Enable it at https://console.developers.google.com/apis/api/sheets.googleapis.com')
  )
}
