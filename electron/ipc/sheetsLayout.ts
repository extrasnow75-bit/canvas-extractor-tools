import { TemplateRow } from './settingsTemplates'
import { CellValue } from './settingsMapping'

/**
 * Pure layout logic shared by the two settings-table renderers — the Google Sheets writer in
 * googleSheets.ts and the local .xlsx writer in settingsExport.ts.
 *
 * Separate from both so it can be unit tested: googleSheets.ts reaches googleAuth.ts, which
 * reads `app.getPath` at module scope and therefore cannot be imported outside Electron.
 */

/** The value actually written to a row's cell: a Canvas-sourced override, or the template default. */
export function cellValue(row: TemplateRow, values: Map<string, CellValue>): boolean | string {
  const found = values.get(row.key)
  return found === undefined ? row.default : found
}

/**
 * A1 notation for a whole tab's used range.
 *
 * The sheet name is quoted, so a single quote inside it has to be doubled — A1 notation's
 * own escape. Canvas item titles carry apostrophes constantly ("What's Your Learning
 * Style?"), and an unescaped one makes the range malformed, which fails the *entire*
 * values:batchUpdate: every tab would be created and formatted, and then left empty.
 */
export function sheetRangeA1(sheetName: string, rowCount: number): string {
  return `'${sheetName.replace(/'/g, "''")}'!A1:B${rowCount}`
}

export interface ValidationRun {
  /** 0-based sheet row of the first row in the run (row 0 is the tab's heading). */
  startRowIndex: number
  /** Exclusive, as the Sheets API wants it. */
  endRowIndex: number
  kind: 'checkbox' | 'dropdown'
  options?: string[]
}

/**
 * Collapse a template's per-row validation into runs of adjacent rows sharing one rule.
 *
 * Every checkbox row takes the identical BOOLEAN rule, and these templates put checkboxes in
 * long consecutive blocks, so this turns roughly twenty-five requests per tab into a
 * handful. That is the difference between a batch Sheets accepts and one large enough to
 * come back as a timeout or a 500 on a course with a few dozen items.
 */
export function validationRuns(rows: TemplateRow[]): ValidationRun[] {
  const runs: ValidationRun[] = []
  rows.forEach((row, i) => {
    if (row.kind !== 'checkbox' && row.kind !== 'dropdown') return
    const sheetRow = i + 1 // row 0 is the heading
    const last = runs[runs.length - 1]
    const sameRule =
      last !== undefined &&
      last.endRowIndex === sheetRow &&
      last.kind === row.kind &&
      // Dropdowns only merge when they offer exactly the same choices.
      (row.kind === 'checkbox' || (last.options ?? []).join(' ') === (row.options ?? []).join(' '))

    if (sameRule) {
      last.endRowIndex = sheetRow + 1
      return
    }
    runs.push({
      startRowIndex: sheetRow,
      endRowIndex: sheetRow + 1,
      kind: row.kind,
      options: row.options,
    })
  })
  return runs
}
