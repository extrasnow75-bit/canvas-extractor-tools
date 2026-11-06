import { describe, it, expect } from 'vitest'
import { planToolChips, TOOL_OPTIONS, TOOL_DEFINITION_ID, definitionRequest, ChipElement } from './docsToolChips'

const line = (start: number, text: string): ChipElement => ({
  startIndex: start,
  endIndex: start + text.length + 1,
  paragraph: { elements: [{ textRun: { content: text.slice(0, 4) } }, { textRun: { content: `${text.slice(4)}\n` } }] },
})

describe('planToolChips', () => {
  const doc: ChipElement[] = [
    { startIndex: 1, endIndex: 10, paragraph: { elements: [{ textRun: { content: 'Module 1\n' } }] } },
    line(10, 'Page ⏺ Link to settings tab'),
    line(60, 'Assignment (Not Graded) ⏺ Link to settings tab'),
    line(120, 'Quiz (Classic) ⏺ Link to settings tab'),
    line(180, 'File ⏺ Link to settings tab'),
    { startIndex: 220, endIndex: 240, paragraph: { elements: [{ textRun: { content: 'Page is a word here\n' } }] } },
  ]
  const { requests, chips } = planToolChips(doc)

  it('finds the tool lines and nothing else', () => {
    expect(chips).toBe(3) // not the File line (not in the template list), not ordinary text
  })

  it('creates the list from the template first', () => {
    const def = (requests[0] as { createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionId: string; dropdownDefinitionProperties: { title: string; options: Array<{ displayValue: string }> } } } }).createDropdownDefinition.dropdownDefinition
    expect(def.dropdownDefinitionId).toBe(TOOL_DEFINITION_ID)
    expect(def.dropdownDefinitionProperties.title).toBe('Tool/Page')
    expect(def.dropdownDefinitionProperties.options.map((o) => o.displayValue)).toEqual([
      'Select Tool', 'Assignment', 'Assignment (Not Graded)', 'Discussion', 'Page', 'Quiz (Classic)', 'Quiz (New)',
    ])
  })

  it('works from the last line to the first so earlier positions do not move', () => {
    const inserts = requests.filter((r) => 'insertDropdown' in r).map((r) => (r as { insertDropdown: { location: { index: number }; selectedOptionId: string } }).insertDropdown)
    expect(inserts.map((i) => i.location.index)).toEqual([120, 60, 10])
    expect(inserts.map((i) => i.selectedOptionId)).toEqual(['dropdownItem.ts-quiz-cl', 'dropdownItem.ts-assign-ng', 'dropdownItem.ts-page'])
  })

  it('deletes exactly the tool name, then makes the chip bold red', () => {
    expect(requests[1]).toEqual({ deleteContentRange: { range: { startIndex: 120, endIndex: 120 + 'Quiz (Classic)'.length } } })
    expect(requests[3]).toMatchObject({ updateTextStyle: { range: { startIndex: 120, endIndex: 121 }, fields: 'bold,foregroundColor' } })
  })

  it('does nothing when there are no tool lines', () => {
    expect(planToolChips([{ startIndex: 1, endIndex: 5, paragraph: { elements: [{ textRun: { content: 'Hi\n' } }] } }])).toEqual({ requests: [], chips: 0 })
  })

  it('uses ids Google accepts', () => {
    expect(TOOL_DEFINITION_ID).toMatch(/^kix\.[a-zA-Z0-9_-]{2,14}$/)
    for (const o of TOOL_OPTIONS) expect(o.optionId).toMatch(/^dropdownItem\.[a-zA-Z0-9_-]{2,14}$/)
    expect(new Set(TOOL_OPTIONS.map((o) => o.optionId)).size).toBe(TOOL_OPTIONS.length)
    expect(JSON.stringify(definitionRequest())).toContain('foregroundColor')
  })
})
