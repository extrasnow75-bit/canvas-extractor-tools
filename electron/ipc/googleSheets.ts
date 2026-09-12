import { getAccessToken } from './googleAuth'
import { SettingsData } from './settingsExport'
import { cellValue, sheetRangeA1, sheetsFormatRequests, validationRuns } from './sheetsLayout'
import { apiNotEnabledMessage } from './googleSheetsErrors'

/**
 * Builds a Google Sheet from a course's extracted settings data — one tab per item, laid
 * out as the eCampus "Settings Table" template: column A holds the label, column B the
 * value, with real tickable checkboxes and dropdown validation on the rows that call for
 * them.
 *
 * Unlike the Docs path (upload HTML, let Drive convert it), there is no template file this
 * app copies — every tab is built from settingsTemplates.ts, the same source of truth the
 * local .xlsx export in settingsExport.ts uses. That keeps the two output formats from
 * silently drifting apart, and needs no template asset shipped with the app.
 *
 * Scope note: like the Docs and Drive-upload paths, the Sheets API accepts `drive.file` for
 * a spreadsheet this app itself created, so no extra OAuth scope is needed.
 */

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

/**
 * How many requests to put in one spreadsheets:batchUpdate call.
 *
 * A whole course's formatting used to go in a single call. With ~25 validation rows per tab
 * plus five formatting requests, a forty-item course reached well over a thousand nested
 * requests in one HTTP call — the size at which Sheets starts answering with timeouts and
 * 500s rather than doing the work. Chunking also scopes a failure to one batch instead of
 * losing every tab's formatting at once.
 */
const BATCH_CHUNK = 200

interface SheetsApiSheet {
  properties: { sheetId: number; title: string }
}

async function sheetsFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const friendly = apiNotEnabledMessage(detail)
    if (friendly) throw new Error(friendly)
    // 400 is the length that keeps a Sheets validation complaint readable; the old 200 cut
    // most of them off mid-sentence.
    throw new Error(`Sheets API request failed (${res.status}). ${detail.slice(0, 400)}`)
  }
  return res.json()
}

export async function createSettingsSpreadsheet(
  data: SettingsData,
  title: string,
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getAccessToken()

  const created = (await sheetsFetch(SHEETS_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: data.tabs.map((tab) => ({ properties: { title: tab.title } })),
    }),
  })) as { spreadsheetId: string; spreadsheetUrl: string; sheets: SheetsApiSheet[] }

  const spreadsheetId = created.spreadsheetId
  const formatRequests: unknown[] = []
  const valueRanges: Array<{ range: string; values: (string | boolean)[][] }> = []

  data.tabs.forEach((tab, i) => {
    const sheetId = created.sheets[i].properties.sheetId

    formatRequests.push(...sheetsFormatRequests(sheetId, tab.template.rows, tab.values))

    for (const run of validationRuns(tab.template.rows)) {
      const range = {
        sheetId,
        startRowIndex: run.startRowIndex,
        endRowIndex: run.endRowIndex,
        startColumnIndex: 1,
        endColumnIndex: 2,
      }
      formatRequests.push({
        setDataValidation: {
          range,
          rule:
            run.kind === 'checkbox'
              ? { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true }
              : {
                  condition: {
                    type: 'ONE_OF_LIST',
                    values: ['Choose from dropdown', ...(run.options ?? [])].map((v) => ({
                      userEnteredValue: v,
                    })),
                  },
                  strict: false,
                  showCustomUi: true,
                },
        },
      })
    }

    const grid: (string | boolean)[][] = [[tab.heading, '']]
    for (const row of tab.template.rows) {
      grid.push(row.kind === 'note' ? [row.label, ''] : [row.label, cellValue(row, tab.values)])
    }
    valueRanges.push({ range: sheetRangeA1(tab.title, grid.length), values: grid })
  })

  for (let i = 0; i < formatRequests.length; i += BATCH_CHUNK) {
    await sheetsFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ requests: formatRequests.slice(i, i + BATCH_CHUNK) }),
    })
  }

  // RAW, deliberately, not USER_ENTERED.
  //
  // USER_ENTERED parses every string cell as though a person had typed it, so a leading =, +,
  // - or @ starts a formula. Half the values here are Canvas free text a course author
  // controls — item titles (which become the tab heading), assignment group names, the quiz
  // access code — so an assignment named `=HYPERLINK(…)` or `=IMPORTXML(…)` would run the
  // moment a reviewer opened the sheet: a spoofed link, or a way to read other cells back out
  // to another host. These files are made to be passed round for QA, which is exactly the
  // audience that would trust them.
  //
  // Nothing here needs Sheets to parse anything. Checkbox rows send real JSON booleans, which
  // are stored as booleans under RAW too and still render as tick boxes via the BOOLEAN
  // validation set above; the cost is only that a number like "50" is stored as text.
  await sheetsFetch(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges }),
  })

  return { id: spreadsheetId, webViewLink: created.spreadsheetUrl }
}
