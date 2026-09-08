import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildSettingsWorkbook, safeTabTitle, SettingsData } from './settingsExport'
import { sheetRangeA1, validationRuns } from './sheetsLayout'
import { apiNotEnabledMessage } from './googleSheetsErrors'
import {
  ASSIGNMENT_TEMPLATE,
  CLASSIC_QUIZ_TEMPLATE,
  COURSE_SETTINGS_TEMPLATE,
  DISCUSSION_TEMPLATE,
  NEW_QUIZ_TEMPLATE,
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
    expect(sheet.getCell(`B${linkToRubric}`).value).toBe('Template Rubrics')
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
