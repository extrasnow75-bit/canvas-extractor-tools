/**
 * What the Validate button and the line under it should say, from what the course card knows.
 *
 * The button used to read "Validate" in the same blue before and after a course was checked, so a
 * course chosen from the list (checked for you) still looked as if it was waiting for a click.
 * Kept out of the component so the words and states can be tested.
 */
export interface ValidateInput {
  /** The box holds a complete course address. */
  urlValid: boolean
  /** A lookup is running, or about to start for a course just chosen from the list. */
  validating: boolean
  courseName: string | null
  nameError: string | null
  /** Where the running lookup came from. */
  source: 'typed' | 'list'
}

export type ValidateTone = 'off' | 'ready' | 'busy' | 'done' | 'retry'

export interface ValidateView {
  label: string
  tone: ValidateTone
  /** Whether pressing the button does anything. */
  pressable: boolean
  /** A line under the box: 'todo' when a press is needed, 'busy' while looking up. */
  note: { kind: 'todo' | 'busy'; text: string } | null
}

export function validateView(i: ValidateInput): ValidateView {
  if (!i.urlValid) return { label: 'Validate', tone: 'off', pressable: false, note: null }
  if (i.validating) {
    return {
      label: 'Checking…',
      tone: 'busy',
      pressable: false,
      note: { kind: 'busy', text: i.source === 'list' ? 'Looking up the course you chose…' : 'Looking up this course…' },
    }
  }
  if (i.courseName) return { label: 'Validated', tone: 'done', pressable: false, note: null }
  if (i.nameError) return { label: 'Try again', tone: 'retry', pressable: true, note: null }
  return {
    label: 'Validate',
    tone: 'ready',
    pressable: true,
    note: { kind: 'todo', text: 'Not checked yet. Press Validate to find the course.' },
  }
}
