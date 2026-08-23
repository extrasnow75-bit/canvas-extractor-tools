import { describe, it, expect } from 'vitest'
import { formatCanvasBody, escapeHtml, htmlDocument, LANDSCAPE_PAGE } from './blueprintFormat'

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
