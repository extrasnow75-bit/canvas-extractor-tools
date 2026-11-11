/**
 * The note shown after a document was saved but a cosmetic step (blue lines, tool dropdowns,
 * contents links) failed.
 *
 * The step's own error message is written for a failed save ("sign-in expired, so this cannot be
 * saved", "please try again"). Repeating it here said something false, because the document WAS
 * saved, and "try again" would have made a duplicate. So only the technical details are kept, for
 * whoever supports the app, and the sentence is written for this situation.
 *
 * Kept free of Electron imports so it can be unit tested.
 */
export interface FinishingFailure {
  /** What is missing, finishing the sentence "could not be added:". */
  missing: string
  error: unknown
}

const DETAILS = 'Details for support:'

function detailsOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const at = message.indexOf(DETAILS)
  return at === -1 ? '' : message.slice(at + DETAILS.length).trim()
}

export function finishingTouchNote(failures: FinishingFailure[]): string {
  if (failures.length === 0) return ''
  const list = failures.map((f) => f.missing).join('; ')
  const details = failures.map((f) => detailsOf(f.error)).filter(Boolean).join(' | ')
  return (
    ` Your document is saved and open. Some finishing touches could not be added: ${list}. ` +
    'You do not need to run the extraction again.' +
    (details ? ` ${DETAILS} ${details}` : '')
  )
}
