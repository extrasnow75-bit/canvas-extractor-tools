import { describe, it, expect } from 'vitest'
import { videoRef, oembedUrl, checkVideo, markDeadVideos } from './videoCheck'
import { BROKEN_LINK_HIGHLIGHT } from './brokenLinks'

const reply = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch

describe('videoRef', () => {
  it('recognises YouTube in its usual forms', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=FshUPVADcu4', 'https://youtube.com/watch?v=FshUPVADcu4&t=3', 'https://m.youtube.com/watch?v=FshUPVADcu4',
      'https://youtu.be/FshUPVADcu4', 'https://www.youtube.com/embed/FshUPVADcu4', 'https://www.youtube-nocookie.com/embed/FshUPVADcu4',
      'https://www.youtube.com/shorts/FshUPVADcu4', 'https://www.youtube.com/watch?v=FshUPVADcu4&amp;t=3',
    ]) expect(videoRef(u), u).toEqual({ provider: 'youtube', id: 'FshUPVADcu4' })
  })
  it('recognises Vimeo', () => {
    expect(videoRef('https://vimeo.com/123456789')).toEqual({ provider: 'vimeo', id: '123456789' })
    expect(videoRef('https://player.vimeo.com/video/123456789?h=abc')).toEqual({ provider: 'vimeo', id: '123456789' })
  })
  it('ignores everything else', () => {
    for (const u of ['https://example.org/watch?v=FshUPVADcu4', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/@channel', 'mailto:a@b.edu', 'not a url', 'https://vimeo.com/channels/staffpicks', 'javascript:alert(1)']) {
      expect(videoRef(u), u).toBeNull()
    }
  })
  it('asks only about the video address', () => {
    const u = oembedUrl({ provider: 'youtube', id: 'FshUPVADcu4' })
    expect(u).toBe('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DFshUPVADcu4')
    expect(oembedUrl({ provider: 'vimeo', id: '1234567' })).toBe('https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1234567')
  })
})

describe('checkVideo', () => {
  const ref = { provider: 'youtube' as const, id: 'FshUPVADcu4' }
  it('maps the answers', async () => {
    expect(await checkVideo(ref, { fetch: reply(200) })).toBe('found')
    expect(await checkVideo(ref, { fetch: reply(404) })).toBe('gone')
    expect(await checkVideo(ref, { fetch: reply(410) })).toBe('gone')
    expect(await checkVideo(ref, { fetch: reply(401) })).toBe('blocked')
    expect(await checkVideo(ref, { fetch: reply(403) })).toBe('blocked')
    expect(await checkVideo(ref, { fetch: reply(500) })).toBe('unknown')
    expect(await checkVideo(ref, { fetch: reply(429) })).toBe('unknown')
  })
  it('fails open on a network error and on a timeout', async () => {
    expect(await checkVideo(ref, { fetch: (async () => { throw new Error('offline') }) as unknown as typeof fetch })).toBe('unknown')
    const hang = ((_u: string, init: { signal: AbortSignal }) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    expect(await checkVideo(ref, { fetch: hang, timeoutMs: 20 })).toBe('unknown')
  })
  it('sends no cookies', async () => {
    let seen: RequestInit | undefined
    await checkVideo(ref, { fetch: (async (_u: string, init?: RequestInit) => { seen = init; return new Response('{}') }) as unknown as typeof fetch })
    expect(seen?.credentials).toBe('omit')
  })
})

describe('markDeadVideos', () => {
  const embed = '<b>Embed video:</b> <a href="https://www.youtube.com/watch?v=FshUPVADcu4" data-embed="1">YouTube video player</a>'
  const link = '<p>See <a href="https://www.youtube.com/watch?v=FshUPVADcu4">this video</a></p>'
  const hl = `background-color:${BROKEN_LINK_HIGHLIGHT};`

  it('highlights an embedded video the service says is gone', async () => {
    const out = await markDeadVideos(embed, { fetch: reply(404) })
    expect(out).toContain(`<span style="${hl}">YouTube video player</span>`)
  })
  it('highlights an embedded video that is private or not embeddable, but not a plain link', async () => {
    expect(await markDeadVideos(embed, { fetch: reply(401) })).toContain(hl)
    expect(await markDeadVideos(link, { fetch: reply(401) })).toBe(link)
  })
  it('highlights a plain link only when the video is gone', async () => {
    expect(await markDeadVideos(link, { fetch: reply(404) })).toContain(hl)
  })
  it('leaves working videos and unknown answers alone', async () => {
    expect(await markDeadVideos(embed, { fetch: reply(200) })).toBe(embed)
    expect(await markDeadVideos(embed, { fetch: reply(500) })).toBe(embed)
    expect(await markDeadVideos(embed, { fetch: (async () => { throw new Error('offline') }) as unknown as typeof fetch })).toBe(embed)
  })
  it('asks once per video, however many links name it', async () => {
    let calls = 0
    const f = (async () => { calls++; return new Response('{}', { status: 404 }) }) as unknown as typeof fetch
    const out = await markDeadVideos(embed + ' ' + link + ' ' + embed, { fetch: f })
    expect(calls).toBe(1)
    expect(out.split(hl).length - 1).toBe(3)
  })
  it('does not touch ordinary links, and makes no request when there are none', async () => {
    let calls = 0
    const f = (async () => { calls++; return new Response('{}', { status: 404 }) }) as unknown as typeof fetch
    const plain = '<a href="https://example.org/x">x</a> <a href="mailto:a@b.edu">m</a>'
    expect(await markDeadVideos(plain, { fetch: f })).toBe(plain)
    expect(calls).toBe(0)
  })
  it('stops asking when cancelled, and caps how many it asks about', async () => {
    let calls = 0
    const f = (async () => { calls++; return new Response('{}', { status: 404 }) }) as unknown as typeof fetch
    const many = Array.from({ length: 10 }, (_v, i) => `<a href="https://www.youtube.com/watch?v=${String(i).padStart(11, 'a')}">v${i}</a>`).join(' ')
    await markDeadVideos(many, { fetch: f, maxChecks: 3 })
    expect(calls).toBe(3)
    calls = 0
    await markDeadVideos(many, { fetch: f, isCancelled: () => true })
    expect(calls).toBe(0)
  })
  it('does not double-highlight', async () => {
    const already = `<a href="https://www.youtube.com/watch?v=FshUPVADcu4" data-embed="1"><span style="${hl}">x</span></a>`
    expect(await markDeadVideos(already, { fetch: reply(404) })).toBe(already)
  })
})
