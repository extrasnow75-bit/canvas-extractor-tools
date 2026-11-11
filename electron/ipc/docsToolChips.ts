/**
 * Turning the Canvas tool name on each tool line into a dropdown chip.
 *
 * The Blueprint template marks each Canvas item with a line such as "Page; Link to settings tab",
 * where the tool name is a dropdown chip (bold red, choosing from the list of Canvas tools). The
 * HTML import can only produce plain red text, so after the document exists this pass swaps each
 * tool name for the chip, with the matching tool selected. The rest of the line is left alone.
 *
 * The list, its order, its title and the option colours are copied from the template file, so a
 * chip made here behaves like one made by hand. A tool that is not in the template's list (a file,
 * an external link) is left as the plain red text it already is, rather than being added to a list
 * that other tools read.
 *
 * The Blueprint icons work the same way: each "[Reading Icon]" red marker in the text becomes a chip
 * from the template's 15-icon list. They sit inside a line rather than being the whole line, so
 * they are found anywhere in a paragraph.
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

/** The template's icon list, in its order (15 icons). Option ids are made here: the colour is plain red text. */
export const ICON_NAMES = [
  'Reading',
  'Video',
  'Task',
  'List',
  'Attention',
  'Warning',
  'Tip',
  'Discussion',
  'Policies',
  'Looking Ahead',
  'Upload',
  'Computer',
  'Syllabus',
  'Schedule',
  'Clock',
] as const

export const ICON_OPTIONS = ICON_NAMES.map((name) => ({
  name: name as string,
  optionId: `dropdownItem.ic-${name.toLowerCase().replace(/[^a-z]/g, '')}`.slice(0, 26),
}))

export const ICON_DEFINITION_ID = 'kix.canvasicon'
export const ICON_DEFINITION_TITLE = 'Icon'

export const TOOL_DEFINITION_ID = 'kix.canvastool'
export const TOOL_DEFINITION_TITLE = 'Tool/Page'

/** The tool names a line may start with, longest first so "Assignment (Not Graded)" beats "Assignment". */
const NAMES = TOOL_OPTIONS.filter((o) => o.name !== 'Select Tool')
  .map((o) => o.name)
  .sort((a, b) => b.length - a.length)

// The semicolon (or the black circle older extractions used), with whatever spaces the import left around it.
const LINE_RE = new RegExp(`^(${NAMES.map((n) => n.replace(/[()]/g, '\\$&')).join('|')})\\s*[;⏺]\\s*Link to settings tab\\s*$`)

const ICON_RE = new RegExp(`\\[(${ICON_NAMES.map((n) => n.replace(/[()]/g, '\\$&')).join('|')}) Icon\\]`, 'g')

export interface ChipElement {
  startIndex?: number
  endIndex?: number
  paragraph?: { elements?: Array<{ startIndex?: number; textRun?: { content?: string } }> }
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

export function iconDefinitionRequest(): Record<string, unknown> {
  return {
    createDropdownDefinition: {
      dropdownDefinition: {
        dropdownDefinitionId: ICON_DEFINITION_ID,
        dropdownDefinitionProperties: {
          title: ICON_DEFINITION_TITLE,
          options: ICON_OPTIONS.map((o) => ({
            optionId: o.optionId,
            displayValue: o.name,
            textStyle: { foregroundColor: { color: { rgbColor: RED } } },
          })),
        },
      },
    },
  }
}

interface Edit {
  start: number
  length: number
  definitionId: string
  optionId: string
}

/** Every "[Name Icon]" in the paragraph, with its position in the document. */
function iconEdits(el: ChipElement): Edit[] {
  const segments: Array<{ docStart: number; textStart: number; length: number }> = []
  let text = ''
  let next = el.startIndex ?? 0
  for (const e of el.paragraph?.elements ?? []) {
    const content = e.textRun?.content
    if (content === undefined) {
      // A picture or other object takes one position and has no text.
      next = (e.startIndex ?? next) + 1
      continue
    }
    const docStart = e.startIndex ?? next
    segments.push({ docStart, textStart: text.length, length: content.length })
    text += content
    next = docStart + content.length
  }
  const docIndex = (textPos: number): number => {
    const seg = segments.find((g) => textPos >= g.textStart && textPos < g.textStart + g.length)
    return seg ? seg.docStart + (textPos - seg.textStart) : -1
  }
  const edits: Edit[] = []
  for (const m of text.matchAll(ICON_RE)) {
    const from = m.index as number
    const start = docIndex(from)
    const end = docIndex(from + m[0].length - 1)
    // Skip a marker split by a picture or another object: its positions are not one run.
    if (start < 0 || end !== start + m[0].length - 1) continue
    const option = ICON_OPTIONS.find((o) => o.name === m[1])
    if (option) edits.push({ start, length: m[0].length, definitionId: ICON_DEFINITION_ID, optionId: option.optionId })
  }
  return edits
}

/**
 * The requests that put the chips in: the definitions first, then, last position first so no
 * earlier index moves, delete the text, insert the chip, and make the chip bold red as in the
 * template. Covers the tool-name chips and the icon chips. Returns the number of chips and an
 * empty list when there are none.
 */
export function planToolChips(content: ChipElement[]): { requests: Array<Record<string, unknown>>; chips: number } {
  const edits: Edit[] = []
  for (const el of content) {
    if (!el.paragraph?.elements || el.startIndex === undefined) continue
    const text = el.paragraph.elements.map((e) => e.textRun?.content ?? '').join('')
    const m = LINE_RE.exec(text.replace(/\n$/, ''))
    if (m) {
      const option = TOOL_OPTIONS.find((o) => o.name === m[1]) as ToolOption
      edits.push({ start: el.startIndex, length: m[1].length, definitionId: TOOL_DEFINITION_ID, optionId: option.optionId })
    }
    edits.push(...iconEdits(el))
  }
  if (edits.length === 0) return { requests: [], chips: 0 }

  const requests: Array<Record<string, unknown>> = []
  if (edits.some((e) => e.definitionId === TOOL_DEFINITION_ID)) requests.push(definitionRequest())
  if (edits.some((e) => e.definitionId === ICON_DEFINITION_ID)) requests.push(iconDefinitionRequest())
  for (const { start, length, definitionId, optionId } of edits.sort((a, b) => b.start - a.start)) {
    requests.push(
      { deleteContentRange: { range: { startIndex: start, endIndex: start + length } } },
      { insertDropdown: { location: { index: start }, dropdownDefinitionId: definitionId, selectedOptionId: optionId } },
      {
        updateTextStyle: {
          range: { startIndex: start, endIndex: start + 1 },
          textStyle: { bold: true, foregroundColor: { color: { rgbColor: RED } } },
          fields: 'bold,foregroundColor',
        },
      },
    )
  }
  return { requests, chips: edits.length }
}
