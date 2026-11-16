import { describe, it, expect } from 'vitest'
import { isBrokenHref, highlightBrokenLinks, unlinkBareEmails, isBareEmailHref, BROKEN_LINK_HIGHLIGHT } from './brokenLinks'
import { replaceEmbeddedMedia } from './embeddedMedia'
import { formatCanvasBody } from './blueprintFormat'
import { formatCleanBody } from './cleanFormat'

describe('isBrokenHref', () => {
  it('flags an empty address, javascript:, and a space inside the host', () => {
    for (const h of ['', '   ', 'javascript:void(0)', 'JavaScript:alert(1)', 'https://exa mple.com/a']) expect(isBrokenHref(h), h).toBe(true)
  })
  it('flags near-miss schemes', () => {
    for (const h of ['htp://example.com', 'http//example.com', 'https//example.com', 'https:/example.com', 'httpss://example.com', 'htps://example.com']) {
      expect(isBrokenHref(h), h).toBe(true)
    }
  })
  it('flags a web address typed without https://, which Canvas reads as a page in the course', () => {
    for (const h of ['www.youtube.com/watch?v=abc', 'docs.google.com/document/d/1', 'boisestate.edu', 'youtu.be/abc', 'example.io/x']) expect(isBrokenHref(h), h).toBe(true)
  })
  it('flags about:blank', () => {
    expect(isBrokenHref('about:blank')).toBe(true)
  })
  it('flags an http address with no real host', () => {
    expect(isBrokenHref('https://')).toBe(true)
    expect(isBrokenHref('https://intranet/page')).toBe(true)
  })
  it('leaves good links alone', () => {
    for (const h of [
      'https://www.youtube.com/watch?v=abc', 'http://example.org', 'HTTPS://EXAMPLE.ORG/x', '/courses/5/pages/intro', '#section', '#', '?x=1',
      'mailto:a@b.edu', 'tel:+12085551212', 'page-name', 'files/notes.pdf', '../up', 'https://boisestatecanvas.instructure.com/courses/5',
      'https://localhost:3000/a', 'ftp://files.example.org/a', 'https://example.org/a?x=1&amp;y=2',
      'https://a.com/a b', '/courses/1/pages/a b', 'files/my notes.pdf', 'notes.co', 'intro.me', 'lecture.tv', 'report.us',
    ]) expect(isBrokenHref(h), h).toBe(false)
  })
})

describe('highlightBrokenLinks', () => {
  it('wraps the text of a broken link and keeps the anchor as it was', () => {
    expect(highlightBrokenLinks('<p><a href="www.example.com/x" target="_blank">Read this</a></p>')).toBe(
      `<p><a href="www.example.com/x" target="_blank"><span style="background-color:${BROKEN_LINK_HIGHLIGHT};">Read this</span></a></p>`,
    )
  })
  it('leaves working links, named anchors and plain text alone', () => {
    const ok = '<a href="https://example.org">fine</a> <a name="top"></a> text <a href="#x">jump</a>'
    expect(highlightBrokenLinks(ok)).toBe(ok)
  })
  it('handles single quotes, unquoted values and an empty href', () => {
    expect(highlightBrokenLinks("<a href='javascript:void(0)'>a</a>")).toContain(BROKEN_LINK_HIGHLIGHT)
    expect(highlightBrokenLinks('<a href=htp://x.org>a</a>')).toContain(BROKEN_LINK_HIGHLIGHT)
    expect(highlightBrokenLinks('<a href="">a</a>')).toContain(BROKEN_LINK_HIGHLIGHT)
  })
  it('does nothing to a body over the size ceiling', () => {
    const big = '<a href="">a</a>' + 'x'.repeat(100_001)
    expect(highlightBrokenLinks(big)).toBe(big)
  })
})

describe('an embedded player with no usable address', () => {
  const o = { renderLabel: (t: string) => `<b>${t}:</b>`, baseUrl: 'https://x.instructure.com' }
  it('shows its name in light red, with no link', () => {
    const out = replaceEmbeddedMedia('<iframe src="javascript:alert(1)" title="Lecture"></iframe>', o)
    expect(out).toBe(`<b>Embed content:</b> <span style="background-color:${BROKEN_LINK_HIGHLIGHT};">Lecture</span>`)
  })
  it('says there is no address when it has no name either', () => {
    expect(replaceEmbeddedMedia('<iframe></iframe>', o)).toContain('no web address found')
  })
  it('does not highlight a player that has an address', () => {
    expect(replaceEmbeddedMedia('<iframe src="https://www.youtube.com/embed/abc" title="T"></iframe>', o)).not.toContain(BROKEN_LINK_HIGHLIGHT)
  })
})

describe('in the two documents', () => {
  const body = '<p><a href="www.example.com">Broken</a> and <a href="https://example.org">fine</a></p>'
  it('the QA extraction highlights the broken one only', () => {
    const out = formatCanvasBody(body, 'https://x.instructure.com')
    expect(out).toContain(`background-color:${BROKEN_LINK_HIGHLIGHT};">Broken`)
    expect(out).not.toContain(`${BROKEN_LINK_HIGHLIGHT};">fine`)
  })
  it('the clean document does too', () => {
    const out = formatCleanBody(body, { baseUrl: 'https://x.instructure.com' })
    expect(out).toContain(`background-color:${BROKEN_LINK_HIGHLIGHT};">Broken`)
    expect(out).not.toContain(`${BROKEN_LINK_HIGHLIGHT};">fine`)
  })
  it('a link into Canvas keeps its cyan and is not called broken', () => {
    const out = formatCanvasBody('<a href="/courses/5/pages/intro">Page</a>', 'https://x.instructure.com')
    expect(out).toContain('#00ffff')
    expect(out).not.toContain(BROKEN_LINK_HIGHLIGHT)
  })
})

describe('performance and structure', () => {
  const big = (unit: string) => unit.repeat(Math.floor(99_000 / unit.length))
  it('stays fast on a body of unterminated tags', async () => {
    const { replaceEmbeddedMedia } = await import('./embeddedMedia')
    const o = { renderLabel: (t: string) => t, baseUrl: 'https://x.org' }
    for (const unit of ['<a href="', '<iframe ', '<iframe "', '<audio ', '<video>', '<a href="x">', '<iframe src="x">']) {
      const t0 = Date.now()
      highlightBrokenLinks(big(unit))
      replaceEmbeddedMedia(big(unit), o)
      expect(Date.now() - t0, unit).toBeLessThan(400)
    }
  })
  it('does not double-highlight a link whose text already has a background', () => {
    const html = '<a href="/courses/1/pages/a b"><span style="background-color:#00ffff;">x</span></a>'
    expect(highlightBrokenLinks(html)).toBe(html)
    expect(highlightBrokenLinks('<a href="">x</a>')).toContain(BROKEN_LINK_HIGHLIGHT)
  })
  it('keeps text between links, finds tags in any letter case, and ignores <abbr>', () => {
    const out = highlightBrokenLinks('a <A HREF="">x</A> b <abbr title="t">y</abbr> c <a href="https://ok.org">z</a> d')
    expect(out).toBe(`a <a HREF=""><span style="background-color:${BROKEN_LINK_HIGHLIGHT};">x</span></a> b <abbr title="t">y</abbr> c <a href="https://ok.org">z</a> d`)
  })
})

describe('email addresses', () => {
  it('recognises an email address used as a link destination', () => {
    for (const h of ['helpdesk@boisestate.edu', 'helpdesk@boisestate.edu)', 'Jane.Doe@mail.boisestate.edu']) expect(isBareEmailHref(h), h).toBe(true)
    for (const h of ['mailto:helpdesk@boisestate.edu', 'https://example.org/a@b.edu', 'https://boisestate.edu', '/courses/1/pages/x', '']) expect(isBareEmailHref(h), h).toBe(false)
  })
  it('turns a bare-email link into plain text, with no highlight and no mailto', () => {
    const out = unlinkBareEmails('<p>Write to <a href="helpdesk@boisestate.edu" target="_blank">helpdesk@boisestate.edu</a>.</p>')
    expect(out).toBe('<p>Write to helpdesk@boisestate.edu.</p>')
  })
  it('leaves a working mailto link and other links alone', () => {
    const ok = '<a href="mailto:helpdesk@boisestate.edu">email</a> <a href="https://example.org">site</a>'
    expect(unlinkBareEmails(ok)).toBe(ok)
  })
  it('in both documents the email is plain text and nothing is marked', () => {
    const body = '<p><a href="helpdesk@boisestate.edu">helpdesk@boisestate.edu</a></p>'
    for (const out of [formatCanvasBody(body, 'https://x.instructure.com'), formatCleanBody(body, { baseUrl: 'https://x.instructure.com' })]) {
      expect(out).toContain('helpdesk@boisestate.edu')
      expect(out).not.toContain('<a ')
      expect(out).not.toContain(BROKEN_LINK_HIGHLIGHT)
      expect(out).not.toContain('mailto')
    }
  })
})
