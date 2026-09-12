import { describe, it, expect } from 'vitest'
import {
  formatCanvasBody,
  escapeHtml,
  htmlDocument,
  LANDSCAPE_PAGE,
  CANVAS_LINK_HIGHLIGHT,
  highlightCanvasLinks,
  RED,
  SETTINGS_TAB_PHRASE,
  toolLabel,
} from './blueprintFormat'

/**
 * The Canvas tool line, as the Blueprint template now draws it (QA change, 2026-09): the
 * tool name, the black circle, and "Link to settings tab" — on every tool, Page included,
 * with no semicolon between marker and phrase.
 */
describe('toolLabel', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, '')

  it('reads "<Tool> ⏺ Link to settings tab", with no semicolon', () => {
    expect(text(toolLabel('Assignment'))).toBe(`Assignment ⏺ ${SETTINGS_TAB_PHRASE}`)
    expect(text(toolLabel('Assignment'))).not.toContain(';')
  })

  it('puts the phrase on Page, File and External Link too, not just tools with a settings table', () => {
    for (const tool of ['Page', 'File', 'External Link'] as const) {
      expect(text(toolLabel(tool)), tool).toBe(`${tool} ⏺ ${SETTINGS_TAB_PHRASE}`)
    }
  })

  it('sets the phrase in red bold Arial 11, and keeps the marker black', () => {
    const html = toolLabel('Discussion')
    const spans = [...html.matchAll(/<span style="([^"]*)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]])
    expect(spans).toHaveLength(3)
    const [name, marker, phrase] = spans
    for (const [style] of [name, phrase]) {
      expect(style).toContain('font-family:Arial')
      expect(style).toContain('font-size:11pt')
      expect(style).toContain('font-weight:bold')
      expect(style).toContain(`color:${RED}`)
    }
    expect(phrase[1]).toBe(SETTINGS_TAB_PHRASE)
    expect(marker[1].trim()).toBe('⏺')
    expect(marker[0]).toContain('color:#000000')
  })
})

describe('formatCanvasBody headings', () => {
  it('converts a heading to a marked paragraph', () => {
    const out = formatCanvasBody('<h2>Clean heading</h2>')
    expect(out).toContain('Clean heading')
    expect(out).toContain('(H2)')
    expect(out).not.toContain('<h2')
  })

  it('marks each level with its own number', () => {
    const out = formatCanvasBody('<h1>a</h1><h3>b</h3><h6>c</h6>')
    expect(out).toContain('(H1)')
    expect(out).toContain('(H3)')
    expect(out).toContain('(H6)')
  })

  // The opening tag used to be matched with `<hN[^>]*>`, which stops at the first `>` in the
  // source — including one inside an attribute value. The rest of the attribute was then
  // carried into the paragraph as visible body text. Course authors put `>` in title and
  // aria-label attributes routinely.
  describe('attribute values containing >', () => {
    it('does not leak from a double-quoted attribute', () => {
      const out = formatCanvasBody('<h2 title="a > b">Real Heading</h2>')
      expect(out).toContain('Real Heading')
      expect(out).toContain('(H2)')
      expect(out).not.toContain('b">')
      expect(out).not.toMatch(/b&quot;>/)
    })

    it('does not leak from a single-quoted attribute', () => {
      const out = formatCanvasBody("<h2 title='x > y'>Single quoted</h2>")
      expect(out).toContain('Single quoted')
      expect(out).not.toContain("y'>")
    })

    it('does not leak from the second of two attributes', () => {
      const out = formatCanvasBody('<h3 style="font-size:2em" data-x="5 > 3">Objectives</h3>')
      expect(out).toContain('Objectives')
      expect(out).toContain('(H3)')
      expect(out).not.toContain('3">')
    })

    it('does not leak from a heading that follows a clean one', () => {
      const out = formatCanvasBody('<h2>Outer</h2><h3 title="a>b">Inner</h3>')
      expect(out).toContain('Outer')
      expect(out).toContain('Inner')
      expect(out).not.toContain('b">')
    })
  })

  it('converts a closing tag with trailing whitespace', () => {
    // `</h2 >` is valid HTML and previously matched nothing, so the heading kept its tags.
    const out = formatCanvasBody('<h2>Spaced close</h2 >')
    expect(out).toContain('(H2)')
    expect(out).not.toContain('<h2')
  })

  it('leaves a tag that merely starts like a heading alone', () => {
    const out = formatCanvasBody('<h2x>Not a heading</h2x>')
    expect(out).not.toContain('(H2)')
  })

  it('preserves markup inside the heading', () => {
    expect(formatCanvasBody('<h2><strong>Bold</strong> heading</h2>')).toContain(
      '<strong>Bold</strong>',
    )
  })

  it('handles an unquoted attribute', () => {
    const out = formatCanvasBody('<h2 class=big>Unquoted attr</h2>')
    expect(out).toContain('Unquoted attr')
    expect(out).toContain('(H2)')
  })

  it('converts every heading in a body, not just the first', () => {
    const out = formatCanvasBody('<h2>One</h2><h2>Two</h2>')
    expect(out.match(/\(H2\)/g)).toHaveLength(2)
  })

  it('does not hang on unterminated heading tags', () => {
    // Six quote-aware passes over 176KB of these measured 3.4s before the ceiling.
    const started = Date.now()
    formatCanvasBody('<h2 title="'.repeat(20_000))
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('formatCanvasBody body handling', () => {
  it('flags an empty body rather than emitting nothing', () => {
    expect(formatCanvasBody('')).toContain('no text')
    expect(formatCanvasBody(null)).toContain('no text')
    expect(formatCanvasBody(undefined)).toContain('no text')
  })

  it('passes a body with no headings through', () => {
    expect(formatCanvasBody('<p>Just a paragraph</p>')).toContain('Just a paragraph')
  })
})

describe('escapeHtml', () => {
  it('escapes the four characters that matter, ampersand first', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  it('does not double-escape an already-escaped ampersand into a broken entity', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })
})

describe('htmlDocument', () => {
  it('omits a style block when no page CSS is given', () => {
    expect(htmlDocument('T', ['<p>x</p>'])).not.toContain('<style>')
  })

  it('includes page CSS when given', () => {
    const doc = htmlDocument('T', ['<p>x</p>'], LANDSCAPE_PAGE)
    expect(doc).toContain('<style>')
    expect(doc).toContain('@page')
    expect(doc).toContain('11in 8.5in')
  })

  it('escapes the title', () => {
    expect(htmlDocument('A & B', [])).toContain('<title>A &amp; B</title>')
  })
})

/**
 * Links back into Canvas — files, pages, discussions, anything on the course host — get the
 * cyan highlight, so an IDC can see which links QA/CAS will not be able to open without
 * clicking each one. External links do not; those work for everyone.
 */
describe('highlightCanvasLinks', () => {
  const base = 'https://boisestatecanvas.instructure.com'
  const mark = `<span style="background-color:${CANVAS_LINK_HIGHLIGHT};">`

  it('highlights a link into the course, relative or absolute, whatever it points at', () => {
    for (const href of [
      '/courses/123/files/456/download?download_frd=1',
      '/files/456/preview',
      '/courses/123/pages/welcome',
      '/courses/123/discussion_topics/77',
      '/courses/123/assignments/9',
      '/courses/123/modules',
      '/courses/123',
      `${base}/courses/123/files/456/download?verifier=abc&amp;wrap=1`,
      `${base}/courses/123/quizzes/5`,
    ]) {
      const html = `<p>See <a href="${href}">the thing</a>.</p>`
      expect(highlightCanvasLinks(html, base), href).toBe(
        `<p>See <a href="${href}">${mark}the thing</span></a>.</p>`,
      )
    }
  })

  it('leaves external links alone', () => {
    for (const href of [
      'https://www.youtube.com/watch?v=abc',
      'https://example.edu/files/handbook.pdf',
      'https://drive.google.com/file/d/xyz/view',
      'https://docs.google.com/document/d/1/edit',
      'mailto:someone@example.edu',
      '#top',
      '//evil.example/courses/1',
    ]) {
      const html = `<a href="${href}">watch</a>`
      expect(highlightCanvasLinks(html, base), href).toBe(html)
    }
  })

  it('highlights another Instructure-hosted Canvas, and a self-hosted one only when it is the course host', () => {
    const other = '<a href="https://old.instructure.com/courses/1/pages/x">old</a>'
    expect(highlightCanvasLinks(other, base)).toContain(mark)
    const own = '<a href="https://canvas.boisestate.edu/courses/1/files/2">own</a>'
    expect(highlightCanvasLinks(own, 'https://canvas.boisestate.edu')).toContain(mark)
    expect(highlightCanvasLinks(own, base)).toBe(own)
  })

  it('trusts the RCE stamp even when the href is unusual', () => {
    const html = '<a href="https://cdn.example/x" data-api-returntype="Page">page</a>'
    expect(highlightCanvasLinks(html, base)).toContain(mark)
  })

  it('keeps the anchor and its attributes exactly as they were', () => {
    const html =
      '<a class="instructure_file_link" title="a &gt; b" href=\'/files/1\' target="_blank"><img src="/files/2/preview"></a>'
    const out = highlightCanvasLinks(html, base)
    expect(out.startsWith('<a class="instructure_file_link" title="a &gt; b" href=\'/files/1\' target="_blank">')).toBe(true)
    expect(out).toContain(`${mark}<img src="/files/2/preview"></span></a>`)
  })

  it('leaves the template navigation buttons alone, however they are drawn', () => {
    for (const html of [
      '<a class="Button" href="/courses/1/pages/instructor-information">Instructor Information</a>',
      '<a class="btn btn-primary" href="/courses/1/modules/2">Course Resources</a>',
      '<a style="background-color: #0033a0; color: #fff; padding: 8px;" href="/courses/1/discussion_topics/3">Course Questions</a>',
      '<a href="/courses/1/pages/x" style="background: linear-gradient(#0033a0, #002060);">Go</a>',
    ]) {
      expect(highlightCanvasLinks(html, base), html).toBe(html)
    }
    // A body-text link that merely carries some other inline style is still a link.
    const styled = '<a style="font-weight: bold;" href="/courses/1/pages/x">read</a>'
    expect(highlightCanvasLinks(styled, base)).toContain(mark)
  })

  it('is applied by formatCanvasBody', () => {
    const out = formatCanvasBody('<p><a href="/courses/1/discussion_topics/2">f</a></p>', base)
    expect(out).toContain(mark)
  })
})
