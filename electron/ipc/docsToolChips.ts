/**
 * Turning the Canvas tool name on each tool line into a dropdown chip.
 *
 * The Blueprint template marks each Canvas item with a line such as "Page ⏺ Link to settings tab",
 * where the tool name is a dropdown chip (bold red, choosing from the list of Canvas tools). The
 * HTML import can only produce plain red text, so after the document exists this pass swaps each
 * tool name for the chip, with the matching tool selected. The rest of the line is left alone.
 *
 * The list, its order, its title and the option colours are copied from the template file, so a
 * chip made here behaves like one made by hand. A tool that is not in the template's list (a file,
 * an external link) is left as the plain red text it already is, rather than being added to a list
 * that other tools read.
 *
 * Pure: it reads the document's JSON and returns the requests to send. The one function that talks
 * to Google lives in googleDocs.ts.
 */

const GREY_A = { red: 0.9098, green: 0.9176, blue: 0.9294 }
const GREY_B = { red: 0.902, green: 0.902, blue: 0.902 }
const RED = { red: 1 }

export interface ToolOption {
  name: string
  optionId: string
  background: Record<string, number>
  /** Null is the template's plain black, used for the "Select Tool" placeholder. */
  red: boolean
}

/** The template's "Tool/Page" list, in its order. */
export const TOOL_OPTIONS: ToolOption[] = [
  { name: 'Select Tool', optionId: 'dropdownItem.ts-select', background: GREY_A, red: false },
  { name: 'Assignment', optionId: 'dropdownItem.ts-assign', background: GREY_A, red: true },
  { name: 'Assignment (Not Graded)', optionId: 'dropdownItem.ts-assign-ng', background: GREY_A, red: true },
  { name: 'Discussion', optionId: 'dropdownItem.ts-discuss', background: GREY_B, red: true },
  { name: 'Page', optionId: 'dropdownItem.ts-page', background: GREY_B, red: true },
  { name: 'Quiz (Classic)', optionId: 'dropdownItem.ts-quiz-cl', background: GREY_A, red: true },
  { name: 'Quiz (New)', optionId: 'dropdownItem.ts-quiz-new', background: GREY_A, red: true },
]

export const TOOL_DEFINITION_ID = 'kix.canvastool'
export const TOOL_DEFINITION_TITLE = 'Tool/Page'

/** The tool names a line may start with, longest first so "Assignment (Not Graded)" beats "Assignment". */
const NAMES = TOOL_OPTIONS.filter((o) => o.name !== 'Select Tool')
  .map((o) => o.name)
  .sort((a, b) => b.length - a.length)

// The marker character, with whatever spaces the import left around it.
const LINE_RE = new RegExp(`^(${NAMES.map((n) => n.replace(/[()]/g, '\\$&')).join('|')})\\s*⏺\\s*Link to settings tab\\s*$`)

export interface ChipElement {
  startIndex?: number
  endIndex?: number
  paragraph?: { elements?: Array<{ textRun?: { content?: string } }> }
}

export function definitionRequest(): Record<string, unknown> {
  return {
    createDropdownDefinition: {
      dropdownDefinition: {
        dropdownDefinitionId: TOOL_DEFINITION_ID,
        dropdownDefinitionProperties: {
          title: TOOL_DEFINITION_TITLE,
          options: TOOL_OPTIONS.map((o) => ({
            optionId: o.optionId,
            displayValue: o.name,
            textStyle: {
              backgroundColor: { color: { rgbColor: o.background } },
              ...(o.red ? { foregroundColor: { color: { rgbColor: RED } } } : {}),
            },
          })),
        },
      },
    },
  }
}

/**
 * The requests that replace each tool name with a chip: the definition first, then, last
 * paragraph first so no earlier index moves, delete the name, insert the chip, and make the chip
 * bold red as in the template. Returns the number of chips and an empty list when there are none.
 */
export function planToolChips(content: ChipElement[]): { requests: Array<Record<string, unknown>>; chips: number } {
  const found: Array<{ start: number; name: string }> = []
  for (const el of content) {
    if (!el.paragraph?.elements || el.startIndex === undefined) continue
    const text = el.paragraph.elements.map((e) => e.textRun?.content ?? '').join('')
    const m = LINE_RE.exec(text.replace(/\n$/, ''))
    if (m) found.push({ start: el.startIndex, name: m[1] })
  }
  if (found.length === 0) return { requests: [], chips: 0 }

  const requests: Array<Record<string, unknown>> = [definitionRequest()]
  for (const { start, name } of found.reverse()) {
    const option = TOOL_OPTIONS.find((o) => o.name === name) as ToolOption
    requests.push(
      { deleteContentRange: { range: { startIndex: start, endIndex: start + name.length } } },
      { insertDropdown: { location: { index: start }, dropdownDefinitionId: TOOL_DEFINITION_ID, selectedOptionId: option.optionId } },
      {
        updateTextStyle: {
          range: { startIndex: start, endIndex: start + 1 },
          textStyle: { bold: true, foregroundColor: { color: { rgbColor: RED } } },
          fields: 'bold,foregroundColor',
        },
      },
    )
  }
  return { requests, chips: found.length }
}
