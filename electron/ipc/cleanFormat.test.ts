import { describe, it, expect } from 'vitest'
import {
  activity,
  contentsList,
  datesText,
  drawTemplates,
  dueByText,
  formatCanvasDate,
  formatCleanBody,
  remapHeadings,
  unlinkCanvasLinks,
} from './cleanFormat'
import { formatCanvasBody } from './blueprintFormat'
import { planContentsLinks } from './docsContents'

// Snippets are the eCampus KB "HTML Templates", trimmed.
const CALLOUT_ASIDE =
  '<aside class="callout-left wide" style="background-color: #f6f7f9; color: #0033a0; padding: 15px; border-left: 15px solid #0033a0;" aria-labelledby="callout-heading-1">' +
  '<h2 id="callout-heading-1" style="color: #0033a0;">Example Heading</h2><p>Add callout box details here.</p></aside>'
const CALLOUT_NOTE =
  '<div class="callout-left wide" style="background-color: #f6f7f9; color: #0033a0; border-left: 15px solid #0033a0;" role="note"><p><strong>Important:</strong> Details.</p></div>'
const ALERT =
  '<div class="callout-warning" style="border-left: 6px solid #D64309; background-color: #fff3f0;" role="region" aria-label="Warning"><h2>Warning Heading</h2><p>Text.</p></div>'
const DETAILS =
  '<details style="margin-bottom: 1rem;"><summary style="cursor: pointer;">Dropdown Title</summary><div><p>Body text.</p></div></details>'
const NAV =
  '<nav style="background-color: #0033a0;" aria-label="Page Navigation"><a style="color:#fff" href="/courses/1/pages/next">Select <strong>Next</strong> to continue</a></nav>'
const QUOTE =
  '<figure style="border-left: 6px solid #0033a0; background-color: #f8f9fa;"><blockquote>“Quote”</blockquote><figcaption>— Author</figcaption></figure>'
const BRANDED =
  '<h2 style="border-left: 12px solid #D64309; background-color: #0033a0; color: #ffffff;">Text Here</h2>'
const STYLED_TABLE =
  '<table class="ic-Table ic-Table--striped" style="width:100%"><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>'
const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('QA extraction recognises the current templates', () => {
  const marked = (html: string) => text(formatCanvasBody(html))
  it.each([
    ['aside callout', CALLOUT_ASIDE, '[Callout Box]'],
    ['div callout', CALLOUT_NOTE, '[Callout Box]'],
    ['alert', ALERT, '[Alert Box]'],
    ['nav bar', NAV, '[Horizontal Bar]'],
    ['branded border', BRANDED, '[Branded Border]'],
    ['multi-step accordion', '<details style="border-radius: 6px;"><summary style="padding:10px">T</summary></details>', '[Styled Dropdown]'],
    ['plain accordion', DETAILS, '[Dropdown]'],
    ['lettered list', '<ol type="a"><li>x</li></ol>', '[Lettered List]'],
    ['horizontal definitions', '<dl><div><dt style="display: inline;">T</dt><dd>D</dd></div></dl>', '[Horizontal Definition List]'],
    ['styled border section', '<section style="border-radius: 16px; border: 3px solid #0033a0;"><p>x</p></section>', '[Styled Border]'],
  ])('%s', (_name, html, label) => {
    expect(marked(html)).toContain(label)
  })

  it('leaves a plain numbered list unmarked', () => {
    expect(marked('<ol type="1"><li>x</li></ol>')).not.toContain('[')
  })
})

describe('clean body: no QA markup', () => {
  it('prints no (H2) tags, no [markers], no link highlight', () => {
    const html =
      '<h2>Heading</h2>' + CALLOUT_NOTE + STYLED_TABLE + '<p><a href="/courses/1/pages/x">in canvas</a></p>'
    const out = formatCleanBody(html, { baseUrl: 'https://school.instructure.com' })
    expect(out).not.toMatch(/\(H\d\)/)
    expect(out).not.toContain('[Callout Box]')
    expect(out).not.toContain('[Styled Table]')
    expect(out).not.toContain('#00ffff')
  })

  it('gives a missing body a quiet note, not the purple QA warning', () => {
    expect(formatCleanBody('')).toContain('This item has no text.')
    expect(formatCleanBody(null)).not.toContain('purple')
  })
})

describe('headings', () => {
  it('maps content headings to Heading 3 and 4, below the activity title', () => {
    const out = remapHeadings('<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h6>E</h6>')
    expect(out.match(/<h3 /g)).toHaveLength(3)
    expect(out.match(/<h4 /g)).toHaveLength(2)
    expect(out).not.toMatch(/<h[12]\b/)
  })

  it('keeps a heading’s own colour', () => {
    expect(remapHeadings('<h2 style="color: #0033a0;">x</h2>')).toContain('color:#0033a0')
  })
})

describe('links', () => {
  const base = 'https://school.instructure.com'
  it('removes links back into Canvas but keeps their words', () => {
    const out = unlinkCanvasLinks('<a href="/courses/1/pages/x">the page</a>', base)
    expect(out).toBe('the page')
  })
  it('keeps external links', () => {
    const html = '<a href="https://example.com/a">site</a>'
    expect(unlinkCanvasLinks(html, base)).toBe(html)
  })
  it('keeps footnote links', () => {
    const html = '<a href="#fn-1">[1]</a>'
    expect(unlinkCanvasLinks(html, base)).toBe(html)
  })
})

describe('templates are drawn, not labelled', () => {
  it('callout becomes a shaded one-cell table with a blue edge', () => {
    const out = drawTemplates(CALLOUT_NOTE)
    expect(out).toMatch(/^<table/)
    expect(out).toContain('background-color:#f6f7f9')
    expect(out).toContain('border-left:12px solid #0033a0')
    expect(out).toContain('<strong>Important:</strong> Details.')
  })

  it('alert box uses the orange edge', () => {
    expect(drawTemplates(ALERT)).toContain('6px solid #D64309')
  })

  it('accordion becomes a titled two-row table with its body open', () => {
    const out = drawTemplates(DETAILS)
    expect(out).toContain('<strong>Dropdown Title</strong>')
    expect(out).toContain('Body text.')
    expect(out).not.toContain('<details')
    expect(out).not.toContain('<summary')
  })

  it('drops the Next-page navigation bar', () => {
    expect(drawTemplates(`<p>before</p>${NAV}<p>after</p>`)).toBe('<p>before</p><p>after</p>')
  })

  it('keeps the quote and its caption', () => {
    const out = drawTemplates(QUOTE)
    expect(out).toContain('6px solid #0033a0')
    expect(text(out)).toContain('“Quote”')
    expect(text(out)).toContain('— Author')
  })

  it('branded border keeps its white text on blue', () => {
    const out = formatCleanBody(BRANDED)
    expect(out).toContain('background-color:#0033a0')
    expect(text(out)).toBe('Text Here')
  })

  it('styled table keeps its cells and gains a border', () => {
    const out = drawTemplates(STYLED_TABLE)
    expect(out).toContain('<table border="1"')
    expect(out).toContain('<th scope="col">A</th>')
  })

  it('handles a template inside a template', () => {
    const out = drawTemplates(`<div class="callout-left" style="background-color:#f6f7f9">${DETAILS}</div>`)
    expect(out).not.toContain('<details')
    expect(out.match(/<table/g)).toHaveLength(2)
  })

  it('turns side-by-side images into one row of cells', () => {
    const html =
      '<section aria-label="Image gallery"><ul class="grid-row"><li><img src="a.png" alt="a"></li><li><img src="b.png" alt="b"></li></ul></section>'
    const out = drawTemplates(html)
    expect(out.match(/<td /g)).toHaveLength(2)
    expect(out).toContain('src="a.png"')
  })

  it('leaves ordinary markup alone', () => {
    const html = '<p>Hello <em>there</em></p><ul><li>x</li></ul>'
    expect(drawTemplates(html)).toBe(html)
  })

  it('does not hang on unterminated tags', () => {
    const start = Date.now()
    drawTemplates('<div class="callout-left" '.repeat(2000))
    expect(Date.now() - start).toBeLessThan(2000)
  })
})

describe('icons', () => {
  const img = '<img src="/courses/1/files/42/preview" data-api-endpoint="https://x.instructure.com/api/v1/courses/1/files/42" alt="">Learning Objectives'
  const names = new Map([['42', 'tip.svg']])

  it('shows the picture when it was fetched', () => {
    const out = formatCleanBody(img, {
      baseUrl: 'https://x.instructure.com',
      fileNames: names,
      iconData: new Map([['42', 'data:image/png;base64,AAAA']]),
    })
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).toContain('alt="Tip icon"')
    expect(out).not.toContain('[Tip Icon]')
  })

  it('falls back to the icon’s name when the picture could not be had', () => {
    const out = formatCleanBody(img, { baseUrl: 'https://x.instructure.com', fileNames: names })
    expect(text(out)).toBe('Tip: Learning Objectives')
    expect(out).not.toContain('[Tip Icon]')
  })
})

describe('dates', () => {
  it('shows a date in the course time zone', () => {
    // 2026-09-13T05:59:00Z is 11:59 PM the evening before in Denver (MDT, UTC-6).
    expect(formatCanvasDate('2026-09-13T05:59:00Z', 'America/Denver')).toBe(
      'Sat, Sep 12, 2026, 11:59 PM MDT',
    )
  })

  it('survives a bad zone name and a bad date', () => {
    expect(formatCanvasDate('2026-09-13T05:59:00Z', 'Not/AZone')).toContain('Sep 12, 2026')
    expect(formatCanvasDate('nonsense')).toBe('')
    expect(formatCanvasDate(null)).toBe('')
  })

  it('writes due and availability together, or whichever exist', () => {
    const all = datesText({
      due: '2026-09-13T05:59:00Z',
      unlock: '2026-09-08T06:00:00Z',
      lock: '2026-09-15T05:59:00Z',
    })
    expect(all).toMatch(/^Due: .* · {2}Available: .* – /)
    expect(datesText({ unlock: '2026-09-08T06:00:00Z' })).toMatch(/^Available from: /)
    expect(datesText({ lock: '2026-09-15T05:59:00Z' })).toMatch(/^Available until: /)
    expect(datesText({})).toBe('')
  })

  it('cleans decoration off a Due by header', () => {
    expect(dueByText('⬇️ Due by Friday, 11:59 PM MT')).toBe('Due by Friday, 11:59 PM MT')
  })
})

describe('activity block', () => {
  it('orders title, red tool, blue module text, grey dates, then body', () => {
    const html = activity({
      title: 'Intro & Welcome',
      id: 'act-1-1',
      tool: 'Discussion',
      dueBy: 'Due by Friday',
      dates: 'Due: Fri',
      body: '<p>BODY</p>',
      pageBreak: true,
    })
    const order = ['Intro &amp; Welcome', 'Discussion', 'Module schedule: Due by Friday', 'Due: Fri', 'BODY']
    const at = order.map((s) => html.indexOf(s))
    expect(at.every((n) => n >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).toContain('<h2 id="act-1-1"')
    expect(html).toContain('page-break-before:always')
    expect(html).toContain('color:#ff0000')
  })

  it('has no page break when told not to, and omits empty lines', () => {
    const html = activity({ title: 'T', id: 'a', tool: 'Page', pageBreak: false })
    expect(html).not.toContain('page-break')
    expect(html).not.toContain('Module schedule')
  })
})

describe('contents', () => {
  it('lists modules and activities as links to their headings', () => {
    const html = contentsList([
      { level: 1, text: 'Module 1', id: 'mod-1' },
      { level: 2, text: 'Welcome', id: 'act-1-1' },
    ])
    expect(html).toContain('href="#mod-1"')
    expect(html).toContain('href="#act-1-1"')
    expect(text(html).split('\n')).toEqual(['Contents', 'Module 1', 'Welcome'])
  })
})

describe('planContentsLinks', () => {
  const para = (start: number, end: number, t: string, style?: string, headingId?: string) => ({
    startIndex: start,
    endIndex: end,
    paragraph: {
      elements: [{ textRun: { content: t } }],
      paragraphStyle: { namedStyleType: style ?? 'NORMAL_TEXT', headingId },
    },
  })

  it('links each contents line to the heading of the same name, in order', () => {
    const doc = [
      para(1, 9, 'Contents\n'),
      para(9, 18, 'Module 1\n'),
      para(18, 26, 'Welcome\n'),
      para(26, 34, 'Welcome\n'),
      para(34, 43, 'Module 1\n', 'HEADING_1', 'h.m1'),
      para(43, 51, 'Welcome\n', 'HEADING_2', 'h.w1'),
    ]
    const reqs = planContentsLinks(doc) as Array<{
      updateTextStyle: { range: { startIndex: number; endIndex: number }; textStyle: { link: { headingId: string } } }
    }>
    // "Module 1" and the first "Welcome" match; the second "Welcome" has no heading left.
    expect(reqs).toHaveLength(2)
    expect(reqs[0].updateTextStyle.textStyle.link.headingId).toBe('h.m1')
    expect(reqs[0].updateTextStyle.range).toEqual({ startIndex: 9, endIndex: 17 })
    expect(reqs[1].updateTextStyle.textStyle.link.headingId).toBe('h.w1')
  })

  it('does nothing when the document has no contents list', () => {
    expect(planContentsLinks([para(1, 6, 'Hello\n')])).toEqual([])
  })
})
