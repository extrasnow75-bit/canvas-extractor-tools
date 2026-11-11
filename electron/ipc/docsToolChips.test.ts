import { describe, it, expect } from 'vitest'
import { planToolChips, TOOL_OPTIONS, TOOL_DEFINITION_ID, definitionRequest, ICON_OPTIONS, ICON_DEFINITION_ID, ChipElement } from './docsToolChips'

const line = (start: number, text: string): ChipElement => ({
  startIndex: start,
  endIndex: start + text.length + 1,
  paragraph: { elements: [{ textRun: { content: text.slice(0, 4) } }, { textRun: { content: `${text.slice(4)}\n` } }] },
})

describe('planToolChips', () => {
  const doc: ChipElement[] = [
    { startIndex: 1, endIndex: 10, paragraph: { elements: [{ textRun: { content: 'Module 1\n' } }] } },
    line(10, 'Page; Link to settings tab'),
    line(60, 'Assignment (Not Graded); Link to settings tab'),
    line(120, 'Quiz (Classic) ⏺ Link to settings tab'),
    line(180, 'File; Link to settings tab'),
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

describe('icon chips', () => {
  const para = (start: number, runs: string[]): ChipElement => {
    let at = start
    const elements = runs.map((content) => {
      const e = { startIndex: at, textRun: { content } }
      at += content.length
      return e
    })
    return { startIndex: start, endIndex: at, paragraph: { elements } }
  }

  it('has the template\'s 15 icons, with Clock and without Audio or Document', () => {
    expect(ICON_OPTIONS.map((o) => o.name)).toEqual([
      'Reading', 'Video', 'Task', 'List', 'Attention', 'Warning', 'Tip', 'Discussion', 'Policies', 'Looking Ahead',
      'Upload', 'Computer', 'Syllabus', 'Schedule', 'Clock',
    ])
    expect(ICON_DEFINITION_ID).toMatch(/^kix\.[a-zA-Z0-9_-]{2,14}$/)
    for (const o of ICON_OPTIONS) expect(o.optionId).toMatch(/^dropdownItem\.[a-zA-Z0-9_-]{2,14}$/)
    expect(new Set(ICON_OPTIONS.map((o) => o.optionId)).size).toBe(15)
  })

  it('turns an icon marker inside a line into a chip and keeps the text around it', () => {
    const { requests, chips } = planToolChips([para(5, ['[Clock Icon] ', 'Please note, this course\n'])])
    expect(chips).toBe(1)
    expect(requests[0]).toMatchObject({ createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionId: ICON_DEFINITION_ID } } })
    expect(requests[1]).toEqual({ deleteContentRange: { range: { startIndex: 5, endIndex: 5 + '[Clock Icon]'.length } } })
    expect(requests[2]).toMatchObject({ insertDropdown: { location: { index: 5 }, dropdownDefinitionId: ICON_DEFINITION_ID } })
  })

  it('finds several icons in a paragraph and works from the last to the first', () => {
    const { requests, chips } = planToolChips([para(10, ['[List Icon] Learning ', '[Tip Icon] more\n'])])
    expect(chips).toBe(2)
    const at = requests.filter((r) => 'insertDropdown' in r).map((r) => (r as { insertDropdown: { location: { index: number } } }).insertDropdown.location.index)
    expect(at).toEqual([10 + '[List Icon] Learning '.length, 10])
  })

  it('mixes a tool line and icons in one document without disturbing positions', () => {
    const { requests, chips } = planToolChips([line(10, 'Page; Link to settings tab'), para(60, ['[Task Icon] Assignments\n'])])
    expect(chips).toBe(2)
    expect(requests.filter((r) => 'createDropdownDefinition' in r)).toHaveLength(2)
    const at = requests.filter((r) => 'insertDropdown' in r).map((r) => (r as { insertDropdown: { location: { index: number } } }).insertDropdown.location.index)
    expect(at).toEqual([60, 10])
  })

  it('leaves unknown icons and ordinary brackets as text', () => {
    expect(planToolChips([para(1, ['[Audio Icon] and [Note] and [Clock icon]\n'])])).toEqual({ requests: [], chips: 0 })
  })

  it('skips a marker that a picture splits', () => {
    const split: ChipElement = { startIndex: 1, endIndex: 20, paragraph: { elements: [
      { startIndex: 1, textRun: { content: '[Clock ' } }, { startIndex: 8 }, { startIndex: 9, textRun: { content: 'Icon]\n' } },
    ] } }
    expect(planToolChips([split]).chips).toBe(0)
  })
})
