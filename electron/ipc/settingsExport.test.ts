import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildSettingsWorkbook, resolveItems, safeTabTitle, SettingsData } from './settingsExport'
import {
  FONT,
  PALETTE,
  cellValue,
  rowLayout,
  ruleRows,
  sheetRangeA1,
  sheetsFormatRequests,
  validationRuns,
} from './sheetsLayout'
import { apiNotEnabledMessage } from './googleSheetsErrors'
import {
  ASSIGNMENT_TEMPLATE,
  CLASSIC_QUIZ_TEMPLATE,
  COURSE_SETTINGS_TEMPLATE,
  DISCUSSION_TEMPLATE,
  NEW_QUIZ_TEMPLATE,
  UNSET_DROPDOWN,
} from './settingsTemplates'
import { CellValue } from './settingsMapping'

/**
 * Round-trips the local .xlsx export: build a workbook from known data, read it back, and
 * check the cells landed where the template says they should. buildSettingsData itself needs
 * a live Canvas and is not covered here — this is the half that turns data into a file.
 */

const data: SettingsData = {
  courseName: 'RESPCARE 560',
  containsAccessCode: false,
  tabs: [
    {
      template: ASSIGNMENT_TEMPLATE,
      title: 'A - Essay 1',
      heading: 'Essay 1 Settings Table',
      values: new Map<string, CellValue>([
        ['Points', '50'],
        ['File Uploads', true],
        ['Submission Type', 'Online'],
      ]),
    },
    {
      template: CLASSIC_QUIZ_TEMPLATE,
      title: 'CQ - Midterm',
      heading: 'Midterm Settings Table',
      values: new Map<string, CellValue>([
        ['Score', '20'],
        ['Time Limit', true],
        ['time_limit_minutes', '45 minutes'],
      ]),
    },
  ],
}

async function readBack(): Promise<ExcelJS.Workbook> {
  const buffer = await buildSettingsWorkbook(data)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook
}

describe('buildSettingsWorkbook', () => {
  it('creates one sheet per tab, named as the tab is', async () => {
    const workbook = await readBack()
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'A - Essay 1',
      'CQ - Midterm',
    ])
  })

  it('puts the heading in A1 and the first template row directly beneath it', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    expect(sheet.getCell('A1').value).toBe('Essay 1 Settings Table')
    expect(sheet.getCell('A2').value).toBe('Points')
    expect(sheet.getCell('B2').value).toBe('50')
  })

  it('writes checkbox rows as real booleans, mapped and unmapped alike', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const fileUploads = ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === 'File Uploads') + 2
    const textEntry = ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === 'Text Entry') + 2
    expect(sheet.getCell(`B${fileUploads}`).value).toBe(true)
    // Not in `values`, so it falls back to the template's own default rather than going blank.
    expect(sheet.getCell(`B${textEntry}`).value).toBe(false)
  })

  it('keeps the template placeholder for rows Canvas had no value for', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const linkToRubric = ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === 'link_to_rubric') + 2
    // The workbook attaches a hyperlink to this placeholder, so it comes back as a link cell.
    expect(sheet.getCell(`B${linkToRubric}`).value).toEqual({
      text: 'Template Rubrics',
      hyperlink: ASSIGNMENT_TEMPLATE.rows.find((r) => r.key === 'link_to_rubric')!.link,
    })
  })

  it('gives dropdown rows their exact option list as data validation', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const row = ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === 'Display Grade as') + 2
    expect(sheet.getCell(`B${row}`).dataValidation).toEqual({
      type: 'list',
      allowBlank: true,
      formulae: [
        '"Choose from dropdown,Percentage,Complete/Incomplete,Points,Letter Grade,GPA Scale,Not Graded"',
      ],
    })
  })

  it('leaves column B empty on note rows', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const note = ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === 'similarity_reports_header') + 2
    expect(sheet.getCell(`A${note}`).value).toBe('Generate Similarity Reports:')
    expect(sheet.getCell(`B${note}`).value).toBe(null)
  })

  it('writes the unlabelled value rows that sit under a checkbox', async () => {
    const sheet = (await readBack()).getWorksheet('CQ - Midterm')!
    const minutes = CLASSIC_QUIZ_TEMPLATE.rows.findIndex((r) => r.key === 'time_limit_minutes') + 2
    // The label is genuinely blank in the template — the value belongs to the "Time Limit"
    // checkbox above it — so column A round-trips as an empty string, not a missing cell.
    expect(sheet.getCell(`A${minutes}`).value).toBe('')
    expect(sheet.getCell(`B${minutes}`).value).toBe('45 minutes')
  })
})

describe('safeTabTitle', () => {
  it('fits Excel\'s 31-character worksheet limit', () => {
    const title = safeTabTitle('A - Reflective Essay on Professional Practice', new Set())
    expect(title.length).toBeLessThanOrEqual(31)
  })

  it('de-duplicates on the truncated name, not the full one', () => {
    // exceljs truncates to 31 characters and only then rejects duplicates, so two titles
    // differing after character 31 would otherwise collide and throw mid-export.
    const used = new Set<string>()
    const first = safeTabTitle('D - Week 1 Discussion Board About Ethics', used)
    const second = safeTabTitle('D - Week 1 Discussion Board About Policy', used)
    expect(second).not.toBe(first)
    expect(second.length).toBeLessThanOrEqual(31)
  })

  it('strips the characters Sheets and Excel reject, and edge apostrophes', () => {
    expect(safeTabTitle("'Quiz: Ethics/Law [v2]'", new Set())).toBe('Quiz Ethics Law v2')
  })

  it('never returns an empty name', () => {
    expect(safeTabTitle('///', new Set())).toBe('Untitled')
  })
})

describe('sheetRangeA1', () => {
  it("doubles apostrophes, which A1 notation requires inside a quoted sheet name", () => {
    // An unescaped apostrophe malforms the range and fails the whole values:batchUpdate,
    // leaving every tab in the spreadsheet empty. Canvas titles carry them constantly.
    expect(sheetRangeA1("D - What's Your Style", 12)).toBe("'D - What''s Your Style'!A1:B12")
  })

  it('leaves an ordinary name alone', () => {
    expect(sheetRangeA1('Course Settings', 20)).toBe("'Course Settings'!A1:B20")
  })
})

describe('validationRuns', () => {
  it('merges adjacent checkbox rows into one range', () => {
    const runs = validationRuns([
      { label: 'a', key: 'a', kind: 'checkbox', default: false },
      { label: 'b', key: 'b', kind: 'checkbox', default: false },
      { label: 'c', key: 'c', kind: 'checkbox', default: false },
    ])
    expect(runs).toEqual([{ startRowIndex: 1, endRowIndex: 4, kind: 'checkbox', options: undefined }])
  })

  it('breaks a run at a row that takes no validation', () => {
    const runs = validationRuns([
      { label: 'a', key: 'a', kind: 'checkbox', default: false },
      { label: 'n', key: 'n', kind: 'note', default: '' },
      { label: 'b', key: 'b', kind: 'checkbox', default: false },
    ])
    expect(runs.map((r) => [r.startRowIndex, r.endRowIndex])).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('only merges dropdowns offering the same choices', () => {
    const runs = validationRuns([
      { label: 'a', key: 'a', kind: 'dropdown', options: ['Yes', 'No'], default: '' },
      { label: 'b', key: 'b', kind: 'dropdown', options: ['Yes', 'No'], default: '' },
      { label: 'c', key: 'c', kind: 'dropdown', options: ['High', 'Low'], default: '' },
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({ startRowIndex: 1, endRowIndex: 3 })
    expect(runs[1]).toMatchObject({ startRowIndex: 3, endRowIndex: 4, options: ['High', 'Low'] })
  })

  it('cuts every real template down, and the whole set roughly in half', () => {
    // The point of the merge: a course's formatting has to fit in batched Sheets calls
    // without reaching the size where they answer with timeouts. Today the five templates
    // hold 104 validated rows and produce 52 runs; the ceiling below leaves room to edit a
    // template without failing, while catching a change that stops merging altogether.
    const templates = [
      COURSE_SETTINGS_TEMPLATE,
      ASSIGNMENT_TEMPLATE,
      DISCUSSION_TEMPLATE,
      CLASSIC_QUIZ_TEMPLATE,
      NEW_QUIZ_TEMPLATE,
    ]
    let rows = 0
    let runs = 0
    for (const template of templates) {
      const validated = template.rows.filter((r) => r.kind === 'checkbox' || r.kind === 'dropdown').length
      const merged = validationRuns(template.rows).length
      expect(merged, `${template.kind} did not merge`).toBeLessThan(validated)
      rows += validated
      runs += merged
    }
    expect(runs).toBeLessThanOrEqual(rows * 0.6)
  })
})

describe('apiNotEnabledMessage', () => {
  const body =
    '{ "error": { "code": 403, "message": "Google Sheets API has not been used in project ' +
    '123456789012 before or it is disabled. Enable it by visiting ' +
    'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456789012 ' +
    'then retry." } }'

  it('recognises the not-enabled 403 and keeps the console link intact', () => {
    const message = apiNotEnabledMessage(body)
    expect(message).toContain('Google Sheets API is not enabled')
    // The whole point: the actionable URL used to be cut off by truncation.
    expect(message).toContain(
      'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456789012',
    )
  })

  it('leaves other failures alone, so they keep their real detail', () => {
    expect(apiNotEnabledMessage('{ "error": { "code": 400, "message": "Invalid range" } }')).toBe(null)
  })
})

/**
 * Which listing owns an item, and therefore which template it gets.
 *
 * The case that motivated all of this: Canvas returns a classic quiz twice — once from
 * /quizzes and once from /assignments, where it looks like an ordinary online assignment —
 * and the export built a tab from each, so one quiz produced both a Classic Quiz table and an
 * Assignment table full of submission-type and Turnitin rows a quiz does not have.
 */
describe('resolveItems', () => {
  const asgn = (id: number, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, ...extra }) as never
  const disc = (id: number, title: string, extra: Record<string, unknown> = {}) =>
    ({ id, title, ...extra }) as never
  const quiz = (id: number, title: string, extra: Record<string, unknown> = {}) =>
    ({ id, title, ...extra }) as never

  it('gives a classic quiz one tab, not one per listing', () => {
    const items = resolveItems(
      [asgn(10, '1.01 Syllabus Quiz', { submission_types: ['online_quiz'] })],
      [],
      [quiz(500, '1.01 Syllabus Quiz', { quiz_type: 'assignment', assignment_id: 10 })],
    )

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('quiz')
  })

  it('gives a graded discussion one tab, not one per listing', () => {
    const items = resolveItems(
      [asgn(11, 'Week 1 Discussion', { submission_types: ['discussion_topic'] })],
      [disc(700, 'Week 1 Discussion', { assignment_id: 11 })],
      [],
    )

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('disc')
  })

  it('recognises a discussion that carries its assignment embedded rather than by id', () => {
    // Whether Canvas sends assignment_id, the whole embedded assignment, or both depends on
    // the include[] parameters, so neither one alone can be relied on.
    const items = resolveItems(
      [asgn(12, 'Week 2 Discussion', { submission_types: ['discussion_topic'] })],
      [disc(701, 'Week 2 Discussion', { assignment: { id: 12, points_possible: 10 } })],
      [],
    )

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('disc')
  })

  it('keeps a New Quiz that only the assignments listing returned', () => {
    // /quizzes omits New Quizzes entirely on some instances. Dropping quiz-shaped assignments
    // outright — rather than only when something else claimed them — would delete this item
    // from the picker with no sign it ever existed.
    const items = resolveItems(
      [asgn(13, '2.01 Unit Quiz', { is_quiz_lti_assignment: true })],
      [],
      [],
    )

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('newquiz')
  })

  it('pairs a New Quiz with its assignment record when both listings return it', () => {
    const items = resolveItems(
      [asgn(14, '2.02 Unit Quiz', { is_quiz_lti_assignment: true, points_possible: 25 })],
      [],
      [quiz(501, '2.02 Unit Quiz', { quiz_type: 'quizzes.next', assignment_id: 14 })],
    )

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('newquiz')
    // The mappable fields live on the assignment, so the pairing has to survive.
    expect(items[0].kind === 'newquiz' && items[0].assignment?.points_possible).toBe(25)
  })

  it('keeps an ungraded quiz, which has no assignment to be claimed by', () => {
    const items = resolveItems([], [], [quiz(502, 'Practice Quiz', { quiz_type: 'practice_quiz' })])

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('quiz')
  })

  it('leaves an ordinary assignment alone', () => {
    const items = resolveItems(
      [asgn(15, 'Essay 1', { submission_types: ['online_upload'] })],
      [],
      [],
    )

    expect(items.map((i) => i.kind)).toEqual(['asgn'])
  })

  it('keeps keys unique when an assignment id and a quiz id collide', () => {
    // Assignment ids and quiz ids are separate Canvas sequences, so the same number can name
    // one of each. Both of these resolve to a New Quiz, and a shared 'newquiz-55' key would
    // make selecting one in the picker select the other too.
    const items = resolveItems(
      [asgn(55, 'Unclaimed New Quiz', { is_quiz_lti_assignment: true })],
      [],
      [quiz(55, 'Paired New Quiz', { quiz_type: 'quizzes.next', assignment_id: 999 })],
    )

    expect(items).toHaveLength(2)
    expect(new Set(items.map((i) => i.key)).size).toBe(2)
  })

  it('produces one unique key per item across a mixed course', () => {
    const items = resolveItems(
      [
        asgn(10, '1.01 Syllabus Quiz', { submission_types: ['online_quiz'] }),
        asgn(11, 'Week 1 Discussion', { submission_types: ['discussion_topic'] }),
        asgn(12, 'Essay 1', { submission_types: ['online_upload'] }),
        asgn(13, '2.01 Unit Quiz', { is_quiz_lti_assignment: true }),
      ],
      [disc(700, 'Week 1 Discussion', { assignment_id: 11 })],
      [
        quiz(500, '1.01 Syllabus Quiz', { quiz_type: 'assignment', assignment_id: 10 }),
        quiz(501, '2.01 Unit Quiz', { quiz_type: 'quizzes.next', assignment_id: 13 }),
      ],
    )

    // Four real things in the course, four tabs — down from six before ownership was resolved.
    expect(items).toHaveLength(4)
    expect(new Set(items.map((i) => i.key)).size).toBe(4)
    expect(items.map((i) => i.kind).sort()).toEqual(['asgn', 'disc', 'newquiz', 'quiz'])
  })
})

/**
 * What lands in a cell the mappers never set. The template's own default is the blank design
 * document's starting state, and writing it out unchanged made an extracted tab assert things
 * nobody had read from Canvas.
 */
describe('cellValue for rows the extraction did not fill', () => {
  const rowFor = (template: typeof ASSIGNMENT_TEMPLATE, key: string) => {
    const row = template.rows.find((r) => r.key === key)
    if (!row) throw new Error(`no such row: ${key}`)
    return row
  }

  it('reports a mapped value, true or false', () => {
    const row = rowFor(ASSIGNMENT_TEMPLATE, 'Group Assignment')
    expect(cellValue(row, new Map<string, CellValue>([['Group Assignment', true]]))).toBe(true)
    expect(cellValue(row, new Map<string, CellValue>([['Group Assignment', false]]))).toBe(false)
  })

  it('does not tick a checkbox the template ships ticked', () => {
    // 'Index all submissions' has default: true in the workbook and no mapper behind it, so it
    // arrived ticked on every assignment tab — under a Turnitin block reported as switched off.
    const row = rowFor(ASSIGNMENT_TEMPLATE, 'Index all submissions')
    expect(row.default).toBe(true)
    expect(cellValue(row, new Map())).toBe(false)
  })

  it('does not answer a dropdown the template ships with a real answer', () => {
    // Submission Type defaults to 'Online'. For a classic quiz the mapper returns nothing —
    // 'online_quiz' is not one of the workbook's four options — and 'Online' stood there
    // looking extracted.
    const row = rowFor(ASSIGNMENT_TEMPLATE, 'Submission Type')
    expect(row.default).toBe('Online')
    expect(cellValue(row, new Map())).toBe(UNSET_DROPDOWN)
  })

  it('keeps a text row placeholder, which already reads as unfilled', () => {
    expect(cellValue(rowFor(ASSIGNMENT_TEMPLATE, 'Points'), new Map())).toBe('XX')
  })

  it('asserts nothing positive on any template when nothing was mapped', () => {
    const templates = [
      COURSE_SETTINGS_TEMPLATE,
      ASSIGNMENT_TEMPLATE,
      DISCUSSION_TEMPLATE,
      CLASSIC_QUIZ_TEMPLATE,
      NEW_QUIZ_TEMPLATE,
    ]

    for (const template of templates) {
      for (const row of template.rows) {
        if (row.kind === 'note') continue
        const value = cellValue(row, new Map())
        if (row.kind === 'checkbox') expect(value).toBe(false)
        if (row.kind === 'dropdown') expect(value).toBe(UNSET_DROPDOWN)
      }
    }
  })
})

/**
 * Formatting, read out of the eCampus workbook's own cell styles. What matters is that the
 * landmarks a reviewer knows from the template — the blue "finalized" bar, the grey primary
 * rows, purple for anything still unfilled — turn up in the same places on an extracted tab.
 */
describe('rowLayout', () => {
  const row = (key: string) => {
    const r = ASSIGNMENT_TEMPLATE.rows.find((r) => r.key === key)
    if (!r) throw new Error(`no such row: ${key}`)
    return r
  }
  const none = new Map<string, CellValue>()

  it('draws a primary setting bold on the pale grey fill, with a rule above it', () => {
    const l = rowLayout(row('Points'), none)
    expect(l.label.bold).toBe(true)
    expect(l.label.fill).toBe(PALETTE.primaryFill)
    expect(l.value.fill).toBe(PALETTE.primaryFill)
    expect(l.ruleAbove).toBe(true)
    expect(l.merged).toBe(false)
  })

  it('draws a sub-option plain, with no rule, so it boxes together with its parent', () => {
    const l = rowLayout(row('Text Entry'), none)
    expect(l.label.bold).toBe(false)
    expect(l.label.fill).toBeUndefined()
    expect(l.ruleAbove).toBe(false)
  })

  it('draws the finalized bar solid blue with white text', () => {
    const l = rowLayout(row('finalized'), none)
    expect(l.label.fill).toBe(PALETTE.finalizedFill)
    expect(l.label.color).toBe(PALETTE.white)
    expect(l.value.color).toBe(PALETTE.white)
    expect(l.label.bold).toBe(true)
  })

  it('merges and centres the group-set warning in red', () => {
    const l = rowLayout(row('group_note'), none)
    expect(l.merged).toBe(true)
    expect(l.label.align).toBe('center')
    expect(l.label.color).toBe(PALETTE.warning)
  })

  it('leaves a text placeholder purple, and turns an extracted value black', () => {
    expect(rowLayout(row('Points'), none).value.color).toBe(PALETTE.placeholder)
    expect(rowLayout(row('Points'), new Map([['Points', '50']])).value.color).toBe(PALETTE.black)
  })

  it('attaches the workbook hyperlink only while the placeholder is still showing', () => {
    const unfilled = rowLayout(row('link_to_rubric'), none)
    expect(unfilled.link).toBe(row('link_to_rubric').link)
    expect(unfilled.value.color).toBe(PALETTE.link)

    const filled = rowLayout(row('link_to_rubric'), new Map([['link_to_rubric', 'Essay rubric']]))
    expect(filled.link).toBeUndefined()
    expect(filled.value.color).toBe(PALETTE.black)
  })

  it('does not colour a dropdown placeholder — the workbook leaves those black', () => {
    expect(rowLayout(row('Display Grade as'), none).value.color).toBe(PALETTE.black)
  })

  it('rules between a setting and its first sub-option, but not between the sub-options', () => {
    const idx = (key: string) => ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === key) + 1
    const rules = ruleRows(ASSIGNMENT_TEMPLATE.rows, none)
    expect(rules).toContain(idx('Submission Type'))
    expect(rules).toContain(idx('Text Entry')) // directly beneath it
    expect(rules).not.toContain(idx('Website URL')) // beneath Text Entry
  })

  it('keeps a settled default black rather than treating it as a placeholder', () => {
    const settled = DISCUSSION_TEMPLATE.rows.find((r) => r.key === 'reply_submission_type')!
    expect(settled.fixed).toBe(true)
    expect(rowLayout(settled, none).value.color).toBe(PALETTE.black)
  })

  it('always rules off the first row from the title, whatever its own style', () => {
    // Classic Quiz's first row is 'Score', a bare bold label with no rule of its own.
    expect(CLASSIC_QUIZ_TEMPLATE.rows[0].style).toBe('label')
    expect(ruleRows(CLASSIC_QUIZ_TEMPLATE.rows, none)).toContain(1)
  })
})

describe('template style annotations', () => {
  const templates = [
    COURSE_SETTINGS_TEMPLATE,
    ASSIGNMENT_TEMPLATE,
    DISCUSSION_TEMPLATE,
    CLASSIC_QUIZ_TEMPLATE,
    NEW_QUIZ_TEMPLATE,
  ]

  it("marks every 'finalized' checkbox, and nothing else, as the blue bar", () => {
    for (const t of templates) {
      for (const r of t.rows) {
        expect(r.style === 'finalized', `${t.kind}: ${r.key}`).toBe(r.key.endsWith('finalized'))
      }
    }
  })

  it('only merges rows that carry no value of their own', () => {
    for (const t of templates) {
      for (const r of t.rows) {
        if (rowLayout(r, new Map()).merged) expect(r.kind, `${t.kind}: ${r.key}`).toBe('note')
      }
    }
  })

  it('only links rows whose placeholder is a document pointer', () => {
    for (const t of templates) {
      for (const r of t.rows) {
        if (r.link) {
          expect(r.kind, `${t.kind}: ${r.key}`).toBe('text')
          expect(r.link).toMatch(/^https:\/\/docs\.google\.com\//)
        }
      }
    }
  })
})

describe('sheetsFormatRequests', () => {
  const values = new Map<string, CellValue>([['Points', '50']])
  const requests = sheetsFormatRequests(7, ASSIGNMENT_TEMPLATE.rows, values) as Array<
    Record<string, { range?: { startRowIndex?: number }; rows?: unknown[]; top?: unknown }>
  >
  const of = (kind: string) => requests.filter((r) => kind in r).map((r) => r[kind])

  it('formats every row, title included, in one updateCells', () => {
    const [cells] = of('updateCells')
    expect(of('updateCells')).toHaveLength(1)
    expect(cells.rows).toHaveLength(ASSIGNMENT_TEMPLATE.rows.length + 1)
  })

  it('merges the title and each merged template row, nothing else', () => {
    const merged = of('mergeCells').map((m) => m.range!.startRowIndex)
    const expected = [
      0,
      ...ASSIGNMENT_TEMPLATE.rows.flatMap((r, i) => (rowLayout(r, values).merged ? [i + 1] : [])),
    ]
    expect(merged).toEqual(expected)
  })

  it('boxes the block, then rules above the rows rowLayout says', () => {
    const borders = of('updateBorders')
    const [box, ...rules] = borders
    expect(box.range!.startRowIndex).toBe(0)
    expect(rules.map((r) => r.range!.startRowIndex)).toEqual(ruleRows(ASSIGNMENT_TEMPLATE.rows, values))
    for (const r of rules) expect(r.top).toBeDefined()
  })

  it('never emits a formula — links go through textFormat, not =HYPERLINK', () => {
    expect(JSON.stringify(requests)).not.toContain('formulaValue')
    expect(JSON.stringify(requests)).not.toContain('HYPERLINK')
    expect(JSON.stringify(requests)).toContain('"link":{"uri":"https://docs.google.com/')
  })
})

describe('buildSettingsWorkbook formatting', () => {
  const rowOf = (key: string) => ASSIGNMENT_TEMPLATE.rows.findIndex((r) => r.key === key) + 2

  it('writes the title bold, blue, centred and merged across A:B', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const a1 = sheet.getCell('A1')
    expect(a1.font.bold).toBe(true)
    expect(a1.font.color?.argb).toBe(`FF${PALETTE.heading}`)
    expect(a1.alignment.horizontal).toBe('center')
    expect(a1.isMerged).toBe(true)
  })

  it('gives a primary row the bold label and grey fill on both cells', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const r = rowOf('Rubric')
    expect(sheet.getCell(`A${r}`).font.bold).toBe(true)
    expect(sheet.getCell(`A${r}`).fill).toMatchObject({ fgColor: { argb: `FF${PALETTE.primaryFill}` } })
    expect(sheet.getCell(`B${r}`).fill).toMatchObject({ fgColor: { argb: `FF${PALETTE.primaryFill}` } })
  })

  it('gives the finalized row its blue fill and white text', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    const r = rowOf('finalized')
    expect(sheet.getCell(`A${r}`).fill).toMatchObject({ fgColor: { argb: `FF${PALETTE.finalizedFill}` } })
    expect(sheet.getCell(`A${r}`).font.color?.argb).toBe(`FF${PALETTE.white}`)
  })

  it('colours an unfilled placeholder purple and an extracted value black', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    // 'Points' is in the fixture's values; 'External Tool URL' is not.
    expect(sheet.getCell(`B${rowOf('Points')}`).font.color?.argb).toBe(`FF${PALETTE.black}`)
    expect(sheet.getCell(`B${rowOf('External Tool URL')}`).font.color?.argb).toBe(`FF${PALETTE.placeholder}`)
  })

  it('uses Arial 11 throughout, as the workbook does', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    for (const addr of ['A1', `A${rowOf('Points')}`, `B${rowOf('Text Entry')}`]) {
      expect(sheet.getCell(addr).font.name, addr).toBe(FONT.family)
      expect(sheet.getCell(addr).font.size, addr).toBe(FONT.size)
    }
  })

  it('rules above primary rows but not between the sub-options beneath them', async () => {
    const sheet = (await readBack()).getWorksheet('A - Essay 1')!
    expect(sheet.getCell(`A${rowOf('Submission Type')}`).border.top?.style).toBe('thin')
    expect(sheet.getCell(`A${rowOf('Website URL')}`).border.top).toBeUndefined()
  })
})
