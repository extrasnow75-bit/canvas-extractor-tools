import { TemplateRow, UNSET_DROPDOWN } from './settingsTemplates'
import { CellValue } from './settingsMapping'

/**
 * Pure layout logic shared by the two settings-table renderers — the Google Sheets writer in
 * googleSheets.ts and the local .xlsx writer in settingsExport.ts.
 *
 * Separate from both so it can be unit tested: googleSheets.ts reaches googleAuth.ts, which
 * reads `app.getPath` at module scope and therefore cannot be imported outside Electron.
 */

/**
 * The value actually written to a row's cell.
 *
 * A row the mappers set is reported as Canvas has it. A row they did not set is the
 * interesting case, because the extraction has nothing to say about it and the cell still has
 * to contain something.
 *
 * It must not contain the template's own default. Those defaults are the *blank design
 * document's* starting state — right when a designer fills the table in by hand, wrong here,
 * because nothing distinguishes a default nobody checked from a fact read out of Canvas.
 * Three of them assert something positive: `Index all submissions` and `Immediately and on
 * due date` ship ticked, and `Submission Type` ships as `Online`. Those appeared on every
 * assignment tab looking exactly like extracted values, and the two ticked ones sat under a
 * Turnitin block the extraction had reported as switched off.
 *
 * So an unmapped row falls back to the template's own "not filled in yet" convention instead:
 * an empty checkbox, or the placeholder the dropdown rows already use. Text rows keep their
 * default, which is placeholder-shaped already (`XX`, `Assignment Group XX`), and notes are
 * static prose.
 *
 * The template constants stay faithful to the eCampus workbook they were transcribed from —
 * they document the source — so the rule lives here rather than being baked into them.
 */
export function cellValue(row: TemplateRow, values: Map<string, CellValue>): boolean | string {
  const found = values.get(row.key)
  if (found !== undefined) return found

  if (row.kind === 'checkbox') return false
  if (row.kind === 'dropdown') return UNSET_DROPDOWN
  return row.default
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
      // Dropdowns only merge when they offer exactly the same choices. Compared as JSON
      // rather than a joined string, because joining loses where each option ended:
      // ['A', 'B C'] and ['A B', 'C'] join identically and would merge two different rules.
      // No template has adjacent dropdown rows today, so this is a guard for the next edit.
      (row.kind === 'checkbox' || JSON.stringify(last.options ?? []) === JSON.stringify(row.options ?? []))

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

/**
 * ─── Formatting ────────────────────────────────────────────────────────────────
 *
 * Everything below reproduces how the eCampus workbook draws a tab, read out of the source
 * file's cell styles rather than approximated from a screenshot. The point is that a reviewer
 * who knows the template finds the same visual landmarks in an extracted tab: the blue
 * "finalized" bar, the pale grey primary settings with their sub-options boxed beneath them,
 * purple wherever a human still has to fill something in.
 *
 * Two renderers consume this — the Google Sheets writer and the local .xlsx writer — and
 * neither decides any of it for itself.
 */

/** The workbook's colours, as 6-digit hex without the '#'. */
export const PALETTE = {
  black: '000000',
  white: 'FFFFFF',
  /** A value nobody has filled in yet. */
  placeholder: '9900FF',
  /** Tab titles and the Discussion tab's sub-table heading. */
  heading: '0000FF',
  /** The "groups are not built in master courses" warning. */
  warning: 'FF0000',
  link: '1155CC',
  muted: '666666',
  primaryFill: 'F8F8F8',
  sectionFill: 'D9D9D9',
  finalizedFill: '0000FF',
} as const

export const FONT = { family: 'Arial', size: 11 } as const

/** Column widths in pixels. The workbook's A is 38–46 characters wide, B 36–42. */
export const COLUMN_WIDTH_PX = { label: 320, value: 290 } as const

export interface CellStyle {
  bold: boolean
  /** Text colour, hex. */
  color: string
  /** Background, hex; absent for none. */
  fill?: string
  align: 'left' | 'center'
}

export interface RowLayout {
  label: CellStyle
  value: CellStyle
  /** A and B merged into one cell spanning the row; the value column carries nothing. */
  merged: boolean
  /**
   * A horizontal rule along the top edge. Primary settings get one and their sub-options do
   * not, which is what boxes each setting together with the options beneath it.
   */
  ruleAbove: boolean
  /** A hyperlink to attach to the value cell. Only ever set while the cell shows a placeholder. */
  link?: string
}

const plain = (align: CellStyle['align']): CellStyle => ({ bold: false, color: PALETTE.black, align })

/** The A1 title row: merged across both columns, bold, centred, in the workbook's heading blue. */
export function titleLayout(): RowLayout {
  const style: CellStyle = { bold: true, color: PALETTE.heading, align: 'center' }
  return { label: style, value: style, merged: true, ruleAbove: true }
}

/**
 * How one template row is drawn, given the values the extraction produced for the tab.
 *
 * Text placeholders stay purple only while they are still placeholders: the workbook uses
 * that colour to mean "a person has to fill this in", and an extracted value is by definition
 * filled in. So on a finished tab, purple is exactly the set of cells the extractor could
 * not answer — which is the thing a reviewer most wants to be able to see at a glance.
 */
export function rowLayout(row: TemplateRow, values: Map<string, CellValue>): RowLayout {
  const label = plain('left')
  const value = plain('center')
  let merged = false
  let ruleAbove = false

  switch (row.style) {
    case 'primary':
      label.bold = true
      label.fill = value.fill = PALETTE.primaryFill
      ruleAbove = true
      break
    case 'finalized':
      label.bold = true
      label.color = value.color = PALETTE.white
      label.fill = value.fill = PALETTE.finalizedFill
      ruleAbove = true
      break
    case 'section':
      label.bold = true
      label.align = 'center'
      label.fill = value.fill = PALETTE.sectionFill
      merged = ruleAbove = true
      break
    case 'subheading':
      label.bold = true
      label.align = 'center'
      label.color = PALETTE.heading
      merged = ruleAbove = true
      break
    case 'note':
      label.align = 'center'
      label.color = PALETTE.warning
      merged = ruleAbove = true
      break
    case 'label':
      label.bold = true
      break
    case 'muted':
      label.color = PALETTE.muted
      break
  }

  const layout: RowLayout = { label, value, merged, ruleAbove }

  const isPlaceholder = row.kind === 'text' && !row.fixed && !values.has(row.key)
  if (isPlaceholder) {
    value.color = row.link ? PALETTE.link : PALETTE.placeholder
    if (row.link) layout.link = row.link
  }

  return layout
}

/**
 * Row indexes (0-based, title row included) that carry a rule along their top edge.
 *
 * A rule sits above every row whose layout asks for one, and also *below* every primary or
 * finalized row — the workbook separates a setting from the sub-options under it, then boxes
 * those sub-options together. The first row always closes off the title above it.
 */
export function ruleRows(rows: TemplateRow[], values: Map<string, CellValue>): number[] {
  const out: number[] = []
  rows.forEach((row, i) => {
    const prev = i > 0 ? rows[i - 1].style : undefined
    const afterSetting = prev === 'primary' || prev === 'finalized'
    if (i === 0 || afterSetting || rowLayout(row, values).ruleAbove) out.push(i + 1)
  })
  return out
}

/**
 * ─── Google Sheets API requests ─────────────────────────────────────────────────
 *
 * The batchUpdate requests that lay one tab out. Built here, away from the network code in
 * googleSheets.ts, so the exact requests can be asserted in tests.
 */

function apiColor(hex: string): { red: number; green: number; blue: number } {
  return {
    red: parseInt(hex.slice(0, 2), 16) / 255,
    green: parseInt(hex.slice(2, 4), 16) / 255,
    blue: parseInt(hex.slice(4, 6), 16) / 255,
  }
}

const THIN_BORDER = { style: 'SOLID', width: 1, color: apiColor(PALETTE.black) }

function apiCell(style: CellStyle, link?: string): unknown {
  return {
    userEnteredFormat: {
      backgroundColor: apiColor(style.fill ?? PALETTE.white),
      horizontalAlignment: style.align.toUpperCase(),
      verticalAlignment: 'MIDDLE',
      wrapStrategy: 'WRAP',
      textFormat: {
        fontFamily: FONT.family,
        fontSize: FONT.size,
        bold: style.bold,
        foregroundColor: apiColor(style.color),
        ...(link ? { link: { uri: link }, underline: true } : {}),
      },
    },
  }
}

/**
 * Formatting for one tab: column widths, every cell's font/fill/alignment in a single
 * updateCells, the merges, and the borders. Values are written separately (see
 * googleSheets.ts, and why it insists on RAW input); nothing here touches them.
 */
export function sheetsFormatRequests(
  sheetId: number,
  rows: TemplateRow[],
  values: Map<string, CellValue>,
): unknown[] {
  const rowCount = rows.length + 1
  const layouts = [titleLayout(), ...rows.map((row) => rowLayout(row, values))]
  const block = { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 2 }
  const rowRange = (i: number) => ({ ...block, startRowIndex: i, endRowIndex: i + 1 })

  const requests: unknown[] = [
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: COLUMN_WIDTH_PX.label },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: COLUMN_WIDTH_PX.value },
        fields: 'pixelSize',
      },
    },
    {
      updateCells: {
        range: block,
        rows: layouts.map((l) => ({ values: [apiCell(l.label), apiCell(l.value, l.link)] })),
        fields:
          'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
      },
    },
    {
      updateBorders: {
        range: block,
        top: THIN_BORDER,
        bottom: THIN_BORDER,
        left: THIN_BORDER,
        right: THIN_BORDER,
        innerVertical: THIN_BORDER,
      },
    },
  ]

  layouts.forEach((l, i) => {
    if (l.merged) requests.push({ mergeCells: { range: rowRange(i), mergeType: 'MERGE_ALL' } })
  })
  for (const i of ruleRows(rows, values)) {
    requests.push({ updateBorders: { range: rowRange(i), top: THIN_BORDER } })
  }

  return requests
}
