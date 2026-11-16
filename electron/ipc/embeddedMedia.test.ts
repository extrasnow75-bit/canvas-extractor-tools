import { describe, it, expect } from 'vitest'
import { replaceEmbeddedMedia, recognise } from './embeddedMedia'
import { formatCanvasBody } from './blueprintFormat'
import { formatCleanBody } from './cleanFormat'

const plain = { renderLabel: (t: string) => `<b>${t}:</b>`, baseUrl: 'https://boisestatecanvas.instructure.com' }

describe('replaceEmbeddedMedia', () => {
  it('turns a YouTube embed into a label and a watch link', () => {
    const out = replaceEmbeddedMedia('<p><iframe width="560" src="https://www.youtube.com/embed/abc123" title="Intro video" allowfullscreen></iframe></p>', plain)
    expect(out).toBe('<p><b>Embedded video (YouTube):</b> <a href="https://www.youtube.com/watch?v=abc123">Intro video</a></p>')
  })
  it('turns a Panopto embed into its viewer address', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://boisestate.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=xyz&amp;autoplay=false" title="Lecture 1"></iframe>', plain)
    expect(out).toContain('(Panopto)')
    expect(out).toContain('href="https://boisestate.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=xyz"')
    expect(out).toContain('>Lecture 1</a>')
  })
  it('handles Vimeo, a protocol-relative source and a missing title', () => {
    const out = replaceEmbeddedMedia('<iframe src="//player.vimeo.com/video/12345"></iframe>', plain)
    expect(out).toContain('href="https://vimeo.com/12345"')
    expect(out).toContain('>player.vimeo.com</a>')
  })
  it('labels an unknown player as embedded content and keeps its address', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://example.org/widget?a=1&b=2" title="Poll"></iframe>', plain)
    expect(out).toBe('<b>Embedded content:</b> <a href="https://example.org/widget?a=1&amp;b=2">Poll</a>')
  })
  it('resolves a host-relative Canvas source', () => {
    const out = replaceEmbeddedMedia('<iframe src="/media_objects_iframe/m-1?type=video" title="Canvas clip"></iframe>', plain)
    expect(out).toContain('href="https://boisestatecanvas.instructure.com/media_objects_iframe/m-1?type=video"')
  })
  it('handles <video> and <audio>, with the address on a <source> tag', () => {
    expect(replaceEmbeddedMedia('<video controls><source src="https://x.org/a.mp4" type="video/mp4">Your browser</video>', plain)).toBe('<b>Embedded video:</b> <a href="https://x.org/a.mp4">x.org</a>')
    expect(replaceEmbeddedMedia('<audio src="https://x.org/a.mp3" title="Podcast"></audio>', plain)).toBe('<b>Embedded audio:</b> <a href="https://x.org/a.mp3">Podcast</a>')
  })
  it('never links a javascript: or data: source, and keeps the label', () => {
    const out = replaceEmbeddedMedia('<iframe src="javascript:alert(1)" title="Bad"></iframe>', plain)
    expect(out).not.toContain('href')
    expect(out).toContain('Embedded content')
    expect(replaceEmbeddedMedia('<iframe src="data:text/html,hi"></iframe>', plain)).not.toContain('href')
  })
  it('escapes a title that contains markup', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://example.org/x" title="a &lt;b&gt; &quot;c&quot;"></iframe>', plain)
    expect(out).not.toContain('<b>c')
    expect(out).toContain('a &lt;b&gt; &quot;c&quot;')
  })
  it('does not stop at a > inside an attribute', () => {
    const out = replaceEmbeddedMedia('<iframe title="a > b" src="https://example.org/x"></iframe>after', plain)
    expect(out.endsWith('after')).toBe(true)
    expect(out).toContain('>a &gt; b</a>')
  })
  it('leaves text without players untouched, and does nothing to oversized bodies', () => {
    expect(replaceEmbeddedMedia('<p>Hello</p>', plain)).toBe('<p>Hello</p>')
    const big = '<iframe src="https://x.org/a"></iframe>' + 'x'.repeat(100_001)
    expect(replaceEmbeddedMedia(big, plain)).toBe(big)
  })
})

describe('recognise', () => {
  it('knows the common providers', () => {
    expect(recognise(new URL('https://youtu.be/abc'))).toMatchObject({ provider: 'YouTube', watch: 'https://www.youtube.com/watch?v=abc' })
    expect(recognise(new URL('https://www.youtube-nocookie.com/embed/abc'))?.provider).toBe('YouTube')
    expect(recognise(new URL('https://example.org/'))).toBeNull()
  })
})

describe('in the two documents', () => {
  const body = '<p>Watch:</p><iframe src="https://www.youtube.com/embed/abc" title="Intro"></iframe>'
  it('the QA extraction shows a red bold marker and the link', () => {
    const out = formatCanvasBody(body, 'https://boisestatecanvas.instructure.com')
    expect(out).toContain('[Embedded video (YouTube)]')
    expect(out).toContain('color:#ff0000')
    expect(out).toContain('href="https://www.youtube.com/watch?v=abc"')
    expect(out).not.toContain('<iframe')
  })
  it('the clean document shows plain wording and the link', () => {
    const out = formatCleanBody(body, { baseUrl: 'https://boisestatecanvas.instructure.com' })
    expect(out).toContain('<strong>Embedded video (YouTube):</strong>')
    expect(out).toContain('href="https://www.youtube.com/watch?v=abc"')
    expect(out).not.toContain('<iframe')
  })
})
