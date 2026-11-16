import { describe, it, expect } from 'vitest'
import { planToolChips, TOOL_OPTIONS, TOOL_DEFINITION_ID, definitionRequest, iconDefinitionRequest, ICON_OPTIONS, ICON_DEFINITION_ID, ChipElement } from './docsToolChips'

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

  it('has the template\'s 16 icons, in its order, shown with brackets under the title Icons', () => {
    expect(ICON_OPTIONS.map((o) => o.name)).toEqual([
      'Attention', 'Audio', 'Computer', 'Document', 'Discussion', 'List', 'Looking Ahead', 'Policies',
      'Reading', 'Schedule', 'Syllabus', 'Task', 'Tip', 'Upload', 'Video', 'Warning',
    ])
    const def = (iconDefinitionRequest() as { createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionProperties: { title: string; options: Array<{ displayValue: string }> } } } }).createDropdownDefinition.dropdownDefinition.dropdownDefinitionProperties
    expect(def.title).toBe('Icons')
    expect(def.options[0].displayValue).toBe('[Attention Icon]')
    expect(def.options[15].displayValue).toBe('[Warning Icon]')
    expect(ICON_DEFINITION_ID).toMatch(/^kix\.[a-zA-Z0-9_-]{2,14}$/)
    for (const o of ICON_OPTIONS) expect(o.optionId).toMatch(/^dropdownItem\.[a-zA-Z0-9_-]{2,14}$/)
    expect(new Set(ICON_OPTIONS.map((o) => o.optionId)).size).toBe(16)
  })

  it('turns an icon marker inside a line into a chip and keeps the text around it', () => {
    const { requests, chips } = planToolChips([para(5, ['[Audio Icon] ', 'Please note, this course\n'])])
    expect(chips).toBe(1)
    expect(requests[0]).toMatchObject({ createDropdownDefinition: { dropdownDefinition: { dropdownDefinitionId: ICON_DEFINITION_ID } } })
    expect(requests[1]).toEqual({ deleteContentRange: { range: { startIndex: 5, endIndex: 5 + '[Audio Icon]'.length } } })
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
    expect(planToolChips([para(1, ['[Mystery Icon] and [Note] and [audio icon]\n'])])).toEqual({ requests: [], chips: 0 })
  })

  it('skips a marker that a picture splits', () => {
    const split: ChipElement = { startIndex: 1, endIndex: 20, paragraph: { elements: [
      { startIndex: 1, textRun: { content: '[Audio ' } }, { startIndex: 8 }, { startIndex: 9, textRun: { content: 'Icon]\n' } },
    ] } }
    expect(planToolChips([split]).chips).toBe(0)
  })
})

describe('a Page line is the name alone', () => {
  const red = { bold: true, foregroundColor: { color: { rgbColor: { red: 1 } } } }
  const lone = (start: number, text: string, style: object | undefined): ChipElement => ({
    startIndex: start,
    endIndex: start + text.length + 1,
    paragraph: { elements: [{ startIndex: start, textRun: { content: `${text}\n`, textStyle: style } }] },
  })
  it('becomes a chip when it is drawn as a tool line (bold red)', () => {
    const { requests, chips } = planToolChips([lone(10, 'Page', red)])
    expect(chips).toBe(1)
    expect(requests.find((r) => 'deleteContentRange' in r)).toEqual({ deleteContentRange: { range: { startIndex: 10, endIndex: 14 } } })
    expect(requests.find((r) => 'insertDropdown' in r)).toMatchObject({ insertDropdown: { location: { index: 10 }, selectedOptionId: 'dropdownItem.ts-page' } })
  })
  it('stays text when it is ordinary writing: plain, not bold, or not red', () => {
    expect(planToolChips([lone(10, 'Page', {})]).chips).toBe(0)
    expect(planToolChips([lone(10, 'Page', undefined)]).chips).toBe(0)
    expect(planToolChips([lone(10, 'Page', { bold: true })]).chips).toBe(0)
    expect(planToolChips([lone(10, 'Page', { foregroundColor: { color: { rgbColor: { red: 1 } } } })]).chips).toBe(0)
    expect(planToolChips([lone(10, 'Page', { bold: true, foregroundColor: { color: { rgbColor: { red: 0.2, green: 0.2, blue: 0.9 } } } })]).chips).toBe(0)
  })
  it('does not turn a longer line that starts with Page into a chip', () => {
    expect(planToolChips([lone(10, 'Page 2 of the syllabus', red)]).chips).toBe(0)
    expect(planToolChips([lone(10, 'Pages', red)]).chips).toBe(0)
  })
  it('still recognises the older lines that carry the phrase, for every tool', () => {
    expect(planToolChips([line(10, 'Page; Link to settings tab'), line(60, 'Discussion; Link to settings tab')]).chips).toBe(2)
  })
  it('works with the rest of the document, last position first', () => {
    const { requests } = planToolChips([lone(10, 'Page', red), line(60, 'Assignment; Link to settings tab')])
    const at = requests.filter((r) => 'insertDropdown' in r).map((r) => (r as { insertDropdown: { location: { index: number } } }).insertDropdown.location.index)
    expect(at).toEqual([60, 10])
  })
})
