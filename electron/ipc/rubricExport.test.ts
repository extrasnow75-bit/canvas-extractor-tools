import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildRubricTableHtml, richTextToHtml, decodeEntities } from './rubricExport'

/**
 * These cover the pure rendering functions. The IPC handler and buildRubricsHtml are not
 * tested here — they need a live Canvas — but everything they depend on to turn a rubric
 * into a document is below, and that is where every defect so far has been.
 */

const fixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'rubrics-list-response.json'), 'utf-8'),
) as Array<{ id: number; title: string; points_possible: number; data: unknown[] }>

const byTitle = (t: string) => {
  const found = fixture.find((r) => r.title === t)
  if (!found) throw new Error(`fixture missing rubric: ${t}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return found as any
}

describe('decodeEntities', () => {
  it('decodes the named entities Canvas emits', () => {
    expect(decodeEntities('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;')).toBe(
      `a & b < c > d "e" 'f'`,
    )
  })

  it('decodes decimal and hex numeric references', () => {
    expect(decodeEntities('&#65;&#x42;&#X43;')).toBe('ABC')
  })

  it('does not throw on numeric references above the Unicode range', () => {
    // String.fromCodePoint throws RangeError above 0x10FFFF. That throw used to escape the
    // per-rubric error handling and abort extraction of an entire course.
    for (const bad of ['&#99999999;', '&#1114112;', '&#99999999999999999999;']) {
      expect(() => decodeEntities(bad)).not.toThrow()
      expect(decodeEntities(bad)).toBe(bad)
    }
  })

  it('rejects lone surrogates rather than writing U+FFFD to the file', () => {
    expect(decodeEntities('&#55296;')).toBe('&#55296;')
  })

  it('rejects control characters', () => {
    expect(decodeEntities('&#0;&#31;')).toBe('&#0;&#31;')
  })

  it('does not re-scan its own output', () => {
    // &#38; is '&'. A second pass would combine that '&' with the following 'lt;' and yield
    // '<', changing what the rubric said. One scan resumes past each match instead.
    expect(decodeEntities('&#38;lt;')).toBe('&lt;')
    expect(decodeEntities('&#38;nbsp;')).toBe('&nbsp;')
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
  })
})

describe('richTextToHtml', () => {
  it('escapes plain text', () => {
    expect(richTextToHtml('5 < 6 & "quoted"')).toBe('5 &lt; 6 &amp; &quot;quoted&quot;')
  })

  it('turns newlines in plain text into line breaks', () => {
    expect(richTextToHtml('First line.\nSecond line.')).toBe('First line.<br>Second line.')
  })

  it('flattens block boundaries in HTML input', () => {
    expect(richTextToHtml('<p>One.</p><p>Two.</p>')).toBe('One.<br>Two.')
  })

  it('renders list items as bullets', () => {
    expect(richTextToHtml('<ul><li>Depth &amp; rigour</li><li>Clarity</li></ul>')).toBe(
      '• Depth &amp; rigour<br>• Clarity',
    )
  })

  it('never emits a tag from the source', () => {
    const out = richTextToHtml('<p onclick="x">text<script>alert(1)</script></p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
    // The only markup it may produce is its own <br>.
    expect(out.replace(/<br>/g, '')).not.toContain('<')
  })

  it('escapes after stripping, so malformed tags cannot survive', () => {
    const out = richTextToHtml('<p title="<b>">a<<script>b</p>')
    expect(out.replace(/<br>/g, '')).not.toContain('<')
  })

  it('preserves entity-escaped angle brackets as text', () => {
    expect(richTextToHtml('<p>No exceptions &lt;see policy&gt;.</p>')).toBe(
      'No exceptions &lt;see policy&gt;.',
    )
  })

  it('drops empty lines rather than emitting stacked breaks', () => {
    expect(richTextToHtml('<p>One.</p><p></p><p>Two.</p>')).toBe('One.<br>Two.')
  })

  it('does not hang on unterminated tags', () => {
    // `<[^>]*>` restarts at every `<` and scans to end-of-string when no `>` follows.
    // Measured 3.5s at 100KB before the ceiling; the ceiling sends this down the plain path.
    const started = Date.now()
    richTextToHtml('<a'.repeat(120_000))
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('buildRubricTableHtml', () => {
  describe('point ranges', () => {
    const html = buildRubricTableHtml(byTitle('Discussion Board Rubric'))

    it('renders a range when the criterion bands its scores', () => {
      expect(html).toContain('4 to &gt;3 points')
      expect(html).toContain('3 to &gt;1 points')
    })

    it('floors the lowest range at zero', () => {
      expect(html).toContain('1 to &gt;0 points')
    })

    it('does not pad fractional points', () => {
      expect(html).toContain('2 to &gt;1 points')
      expect(html).toContain('1 to &gt;0.5 points')
      expect(html).not.toContain('0.50')
    })

    it('renders a plain value when criterion_use_range is null', () => {
      const plain = buildRubricTableHtml(byTitle('Project Rubric - Final Dashboard'))
      expect(plain).toContain('3 points')
      expect(plain).not.toContain(' to &gt;')
    })

    it('does not invent a range for a zero-point floor', () => {
      const zero = buildRubricTableHtml(byTitle('Perusall Annotations'))
      expect(zero).toContain('0 points')
      expect(zero).not.toContain('0 to &gt;0')
    })

    it('says "points" everywhere, never Canvas\'s "pts"', () => {
      // The rating cells, the Points column and the Total row all have to agree; a row reading
      // "3 to >2.5 points" next to a column reading "3 pts" was the inconsistency this fixed.
      expect(html).not.toMatch(/\bpts\b/)
    })

    it('keeps the exclusive lower bound rather than the template\'s hyphen form', () => {
      // "3-2.5" would claim 2.5 scores in this band. It does not — the bound is exclusive.
      expect(html).toContain('to &gt;')
    })
  })

  describe('rating cells', () => {
    const html = buildRubricTableHtml(byTitle('Discussion Board Rubric'))

    it('includes the rating long description', () => {
      expect(html).toContain('identifies where in the readings they are mentioned')
    })

    it('puts the points above the description, not below it', () => {
      // Canvas puts them last and right-aligned. In a printed table that stranded the number
      // at the foot of a long paragraph; the eCampus template heads each cell with it instead.
      const cell = html.slice(html.indexOf('4 to &gt;3 points'))
      const points = cell.indexOf('4 to &gt;3 points')
      const description = cell.indexOf('identifies where in the readings they are mentioned')
      expect(points).toBeGreaterThan(-1)
      expect(description).toBeGreaterThan(points)
    })

    it('centres and bolds the points caption', () => {
      expect(html).toContain('text-align:center;font-weight:bold;')
    })

    it('leaves the points caption to inherit Arial 11pt from the cell', () => {
      // Declaring the font twice is two places to drift apart. CELL is the one that decides.
      expect(html).toContain('font-family:Arial;font-size:11pt;')
      expect(html).not.toMatch(/font-weight:bold;[^"]*font-family/)
    })

    it('uses the level names as column headers', () => {
      expect(html).toContain('>Partially Met</th>')
    })

    it('does not repeat the level name inside every cell', () => {
      expect(html).not.toContain('<strong>Met</strong>')
    })

    it('does show the level name when a criterion names its levels differently', () => {
      const odd = {
        id: 1,
        title: 'x',
        points_possible: 2,
        data: [
          {
            id: 'c',
            description: 'd',
            points: 2,
            criterion_use_range: false,
            ratings: [
              { description: 'Met', long_description: 'body', points: 2, id: 'a' },
              { description: 'Levels differ here', long_description: '', points: 1, id: 'b' },
            ],
          },
        ],
      }
      expect(buildRubricTableHtml(odd)).toContain('<strong>Levels differ here</strong>')
    })

    it('ignores a trailing space when comparing a level name to its header', () => {
      // A trailing space is routine in copy-pasted rubrics. Untrimmed, it made every
      // comparison unequal and repeated the name in every cell of the column.
      const spaced = {
        id: 1,
        title: 'x',
        points_possible: 1,
        data: [
          {
            id: 'c',
            description: 'd',
            points: 1,
            criterion_use_range: false,
            ratings: [{ description: 'Exemplary ', long_description: 'body', points: 1, id: 'a' }],
          },
        ],
      }
      expect(buildRubricTableHtml(spaced)).not.toContain('<strong>Exemplary</strong>')
    })
  })

  describe('table structure', () => {
    const html = buildRubricTableHtml(byTitle('Discussion Board Rubric'))

    it('declares one <col> per real column', () => {
      // Criteria + three levels + Points.
      expect(html.match(/<col /g)).toHaveLength(5)
    })

    it('uses a single header row with one cell per column', () => {
      const firstRow = html.split('</tr>')[0]
      expect(firstRow.match(/<th /g)).toHaveLength(5)
    })

    it('uses no rowspan', () => {
      // Google Docs takes column widths from the first row without expanding spans, so a
      // spanned header left the trailing columns with no width and collapsed them.
      expect(html).not.toContain('rowspan')
    })

    it('uses colspan only in the total row', () => {
      expect(html.match(/colspan/g)).toHaveLength(1)
    })
  })

  describe('degenerate input', () => {
    it('survives a criterion with no ratings array', () => {
      expect(() =>
        buildRubricTableHtml({
          id: 1,
          title: 'x',
          points_possible: 0,
          data: [{ id: 'a', description: 'd', points: 0 }],
        }),
      ).not.toThrow()
    })

    it('survives a rubric with no criteria at all', () => {
      expect(() =>
        buildRubricTableHtml({ id: 1, title: 'x', points_possible: 0, data: [] }),
      ).not.toThrow()
    })

    it('escapes the points values, which are typed number but arrive as untrusted JSON', () => {
      // `points` and `points_possible` are declared number, but that is a cast over a Canvas
      // response, not a guarantee. Every other value in the table is escaped on the way in.
      const hostile = {
        id: 1,
        title: 'x',
        points_possible: '<script>alert(1)</script>',
        data: [
          {
            id: 'c',
            description: 'd',
            points: '<img src=x onerror=alert(1)>',
            criterion_use_range: false,
            ratings: [{ description: 'Met', long_description: 'body', points: 1, id: 'a' }],
          },
        ],
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html = buildRubricTableHtml(hostile as any)
      // What matters is that neither value can open a tag. The words themselves surviving as
      // inert text inside an escaped string is correct — "onerror" with its angle brackets
      // escaped is a sentence, not an attribute.
      expect(html).not.toContain('<script')
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('does not crash on an out-of-range entity in a description', () => {
      const bad = {
        id: 1,
        title: 'x',
        points_possible: 1,
        data: [
          {
            id: 'c',
            description: 'd',
            points: 1,
            criterion_use_range: false,
            ratings: [
              { description: 'Met', long_description: '<p>&#99999999;</p>', points: 1, id: 'a' },
            ],
          },
        ],
      }
      expect(() => buildRubricTableHtml(bad)).not.toThrow()
    })
  })
})

describe('the captured Canvas response', () => {
  it('carries full criteria on the list endpoint', () => {
    // This is the evidence for dropping the per-rubric detail fetch in buildRubricsHtml,
    // which still issues one request per rubric on the belief that it does not.
    for (const rubric of fixture) {
      expect(Array.isArray(rubric.data)).toBe(true)
      expect(rubric.data.length).toBeGreaterThan(0)
    }
  })

  it('sends criterion_use_range as null rather than false', () => {
    const criterion = byTitle('Project Rubric - Final Dashboard').data[0]
    expect(criterion.criterion_use_range).toBeNull()
  })

  it('renders every rubric from the list response alone, with no detail fetch', () => {
    // buildRubricsHtml needs a live Canvas, so this exercises what it now does per rubric:
    // take the object straight out of the list response and render it. If the list response
    // were ever insufficient, this is what would fail.
    for (const rubric of fixture) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html = buildRubricTableHtml(rubric as any)
      expect(html).toContain('<table')
      expect(html).toContain('points')
      // Every criterion's description reached the table.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const criterion of rubric.data as any[]) {
        expect(html).toContain(criterion.description.slice(0, 40).replace(/&/g, '&amp;'))
      }
    }
  })
})
