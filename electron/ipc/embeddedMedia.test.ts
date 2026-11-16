import { describe, it, expect } from 'vitest'
import { replaceEmbeddedMedia, recognise } from './embeddedMedia'
import { formatCanvasBody } from './blueprintFormat'
import { formatCleanBody } from './cleanFormat'

const plain = { renderLabel: (t: string) => `<b>${t}:</b>`, baseUrl: 'https://boisestatecanvas.instructure.com' }

describe('replaceEmbeddedMedia', () => {
  it('turns a YouTube embed into a label and a watch link', () => {
    const out = replaceEmbeddedMedia('<p><iframe width="560" src="https://www.youtube.com/embed/abc123" title="Intro video" allowfullscreen></iframe></p>', plain)
    expect(out).toBe('<p><b>Embed video:</b> <a href="https://www.youtube.com/watch?v=abc123" data-embed="1">Intro video</a></p>')
  })
  it('turns a Panopto embed into its viewer address', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://boisestate.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=xyz&amp;autoplay=false" title="Lecture 1"></iframe>', plain)
    expect(out).toContain('<b>Embed video:</b>')
    expect(out).not.toContain('Panopto)')
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
    expect(out).toBe('<b>Embed content:</b> <a href="https://example.org/widget?a=1&amp;b=2" data-embed="1">Poll</a>')
  })
  it('resolves a host-relative Canvas source', () => {
    const out = replaceEmbeddedMedia('<iframe src="/media_objects_iframe/m-1?type=video" title="Canvas clip"></iframe>', plain)
    expect(out).toContain('href="https://boisestatecanvas.instructure.com/media_objects_iframe/m-1?type=video"')
  })
  it('handles <video> and <audio>, with the address on a <source> tag', () => {
    expect(replaceEmbeddedMedia('<video controls><source src="https://x.org/a.mp4" type="video/mp4">Your browser</video>', plain)).toBe('<b>Embed video:</b> <a href="https://x.org/a.mp4" data-embed="1">x.org</a>')
    expect(replaceEmbeddedMedia('<audio src="https://x.org/a.mp3" title="Podcast"></audio>', plain)).toBe('<b>Embed audio:</b> <a href="https://x.org/a.mp3" data-embed="1">Podcast</a>')
  })
  it('never links a javascript: or data: source, and keeps the label', () => {
    const out = replaceEmbeddedMedia('<iframe src="javascript:alert(1)" title="Bad"></iframe>', plain)
    expect(out).not.toContain('href')
    expect(out).toContain('Embed content')
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
    expect(out).toContain('>Embed video:</span>')
    expect(out).not.toContain('YouTube')
    expect(out).toContain('color:#ff0000')
    expect(out).toContain('href="https://www.youtube.com/watch?v=abc"')
    expect(out).not.toContain('<iframe')
  })
  it('the clean document shows a video card with the title as a link', () => {
    const out = formatCleanBody(body, { baseUrl: 'https://boisestatecanvas.instructure.com' })
    expect(out).toContain('▶ VIDEO')
    expect(out).toContain('>Intro</a>')
    expect(out).toContain('www.youtube.com</p>')
    expect(out).toContain('<table')
    expect(out).not.toContain('Embed video')
    expect(out).not.toContain('(YouTube)')
    expect(out).toContain('href="https://www.youtube.com/watch?v=abc"')
    expect(out).not.toContain('<iframe')
  })
})

describe('player edge cases', () => {
  const o = { renderLabel: (t: string) => `<b>${t}:</b>`, baseUrl: 'https://x.instructure.com' }
  it('reads an unquoted src and title', () => {
    expect(replaceEmbeddedMedia('<iframe src=https://www.youtube.com/embed/abc title=Intro></iframe>', o)).toContain('href="https://www.youtube.com/watch?v=abc" data-embed="1">Intro</a>')
  })
  it('removes the fallback content inside an iframe along with it', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://x.org/v" title="V"><p>Your browser cannot show this</p></iframe>after', o)
    expect(out).not.toContain('Your browser')
    expect(out.endsWith('after')).toBe(true)
  })
  it('handles several players in one body, in order', () => {
    const out = replaceEmbeddedMedia('<iframe src="https://x.org/1" title="One"></iframe> mid <iframe src="https://x.org/2" title="Two"></iframe>', o)
    expect(out.indexOf('One')).toBeLessThan(out.indexOf('mid'))
    expect(out.indexOf('mid')).toBeLessThan(out.indexOf('Two'))
  })
  it('leaves an unterminated <video> as it is', () => {
    expect(replaceEmbeddedMedia('<p>a</p><video src="https://x.org/a.mp4">no end', o)).toBe('<p>a</p><video src="https://x.org/a.mp4">no end')
  })
})

import { embedCard } from './cleanFormat'

describe('the video card in the clean document', () => {
  const card = (over: object = {}) => embedCard({ kind: 'video', label: 'Embed video', name: 'Welcome to Ornithology', host: 'www.youtube.com', href: 'https://www.youtube.com/watch?v=abc', ...over })
  it('has a label, the title as a link marked as a player, and the website in dark grey', () => {
    const out = card()
    expect(out).toContain('▶ VIDEO')
    expect(out).toContain('<a href="https://www.youtube.com/watch?v=abc" data-embed="1">Welcome to Ornithology</a>')
    expect(out).toContain('color:#3C4043')
    expect(out).toContain('www.youtube.com')
    expect(out).toContain('border-left:4px solid #0033a0')
  })
  it('names audio and other players for what they are', () => {
    expect(card({ kind: 'audio' })).toContain('♪ AUDIO')
    expect(card({ kind: 'content', host: 'open.spotify.com' })).toContain('EMBEDDED CONTENT')
  })
  it('marks a player with no usable address in light red, with no link', () => {
    const out = card({ href: null, name: 'Lecture' })
    expect(out).not.toContain('<a ')
    expect(out).toContain('background-color:#f4cccc;">Lecture</span>')
  })
  it('escapes a title with markup in it', () => {
    expect(card({ name: 'a <b> & "c"' })).toContain('a &lt;b&gt; &amp; &quot;c&quot;')
  })
})

describe('a video embedded through Canvas\'s external-tool address', () => {
  const o = { renderLabel: (t: string) => `<b>${t}:</b>`, baseUrl: 'https://boisestatecanvas.instructure.com' }
  const src = '/courses/5/external_tools/retrieve?display=borderless&amp;url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DFshUPVADcu4'
  it('uses the video\'s own address, so it can be opened and checked', () => {
    const out = replaceEmbeddedMedia(`<iframe class="lti-embed" title="National Geographic" src="${src}"></iframe>`, o)
    expect(out).toBe('<b>Embed video:</b> <a href="https://www.youtube.com/watch?v=FshUPVADcu4" data-embed="1">National Geographic</a>')
  })
  it('shows the video\'s website, not Canvas, in the clean card', () => {
    const out = formatCleanBody(`<iframe title="Flood" src="${src}"></iframe>`, { baseUrl: o.baseUrl })
    expect(out).toContain('▶ VIDEO')
    expect(out).toContain('href="https://www.youtube.com/watch?v=FshUPVADcu4"')
    expect(out).toContain('www.youtube.com</p>')
    expect(out).not.toContain('instructure.com')
  })
  it('leaves a wrapper with no usable video address as a Canvas address', () => {
    const out = replaceEmbeddedMedia('<iframe title="x" src="/courses/5/external_tools/retrieve?display=borderless"></iframe>', o)
    expect(out).toContain('/courses/5/external_tools/retrieve')
  })
})

describe('the card when the title is only the website', () => {
  it('shows the website once', () => {
    const out = embedCard({ kind: 'content', label: 'Embed content', name: 'open.spotify.com', host: 'open.spotify.com', href: 'https://open.spotify.com/embed/episode/abc' })
    expect(out.split('open.spotify.com').length - 1).toBe(2) // once in the address, once as the title
    expect(out).not.toContain('#3C4043')
  })
})
