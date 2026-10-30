import { describe, it, expect, vi, afterEach } from 'vitest'

// The icon loader draws SVGs in an Electron window; here it just hands back a picture.
vi.mock('./iconImages', () => ({
  loadIconDataUri: vi.fn(async (id: string) => (id === '42' ? 'data:image/png;base64,AAAA' : null)),
}))

import { buildCleanHtml } from './cleanExport'
import type { CourseRef } from './canvasUtils'

const BASE = 'https://school.instructure.com'
const ref: CourseRef = { baseUrl: BASE, courseId: '7', token: 't' }

const ICON_IMG =
  '<img src="/courses/7/files/42/preview" data-api-endpoint="https://school.instructure.com/api/v1/courses/7/files/42" alt="">'

/** A tiny fake Canvas: path (without /api/v1 and query) → JSON. */
const routes: Record<string, unknown> = {
  '/courses/7': { id: 7, name: 'SAMPLE 101', syllabus_body: '<p>Syllabus text</p>', time_zone: 'America/Denver' },
  '/courses/7/files': [{ id: 42, display_name: 'tip.svg' }],
  '/courses/7/front_page': { title: 'Home', body: `<h2>Welcome</h2><p>${ICON_IMG} Hi there</p>` },
  '/courses/7/modules': [
    { id: 1, name: 'Module 1: Getting Started' },
    { id: 2, name: 'Module 2: Practice' },
  ],
  '/courses/7/modules/1/items': [
    { id: 11, title: 'Due by Friday, 11:59 PM MT', type: 'SubHeader' },
    { id: 12, title: 'Welcome Page', type: 'Page', page_url: 'welcome' },
    { id: 13, title: 'Introduce Yourself', type: 'Discussion', content_id: 100 },
    { id: 14, title: 'Syllabus PDF', type: 'File', content_id: 5 },
    { id: 15, title: 'A Site', type: 'ExternalUrl', external_url: 'https://example.com/x' },
  ],
  '/courses/7/modules/2/items': [
    { id: 21, title: 'Reflection', type: 'Assignment', content_id: 200 },
  ],
  '/courses/7/pages/welcome': {
    title: 'Welcome Page',
    body:
      '<h2>Start here</h2>' +
      '<div class="callout-left" style="background-color:#f6f7f9;border-left:15px solid #0033a0"><p>Callout text</p></div>' +
      '<p><a href="/courses/7/pages/other">Canvas page</a></p>',
  },
  '/courses/7/discussion_topics/100': {
    title: 'Introduce Yourself',
    message: '<p>Post please</p>',
    delayed_post_at: '2026-09-08T06:00:00Z',
    lock_at: '2026-09-15T05:59:00Z',
    assignment: { due_at: '2026-09-13T05:59:00Z' },
  },
  '/courses/7/assignments/200': {
    name: 'Reflection',
    description: '<p>Write</p>',
    due_at: '2026-09-20T05:59:00Z',
    grading_type: 'points',
  },
}

function install() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace('/api/v1', '')
      if (!(path in routes)) {
        return { ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), json: async () => ({}), text: async () => 'nope' }
      }
      return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), json: async () => routes[path], text: async () => '' }
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('buildCleanHtml', () => {
  it('builds the document in order, with modules as Heading 1 and activities as Heading 2', async () => {
    install()
    const { html, courseName, moduleCount } = await buildCleanHtml(ref)
    expect(courseName).toBe('SAMPLE 101')
    expect(moduleCount).toBe(2)

    expect(html.match(/<h1 /g)).toHaveLength(4) // Home, Syllabus, two modules
    const h2s = [...html.matchAll(/<h2 [^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]))
    expect(h2s).toEqual(['Welcome Page', 'Introduce Yourself', 'Syllabus PDF', 'A Site', 'Reflection'])

    // Contents come before the first section and link by id.
    expect(html.indexOf('Contents')).toBeLessThan(html.indexOf('<h1 '))
    expect(html).toContain('href="#mod-1"')
    expect(html).toContain('href="#act-1-2"')
  })

  it('carries no QA markup', async () => {
    install()
    const { html } = await buildCleanHtml(ref)
    expect(html).not.toMatch(/\(H\d\)/)
    expect(html).not.toContain('Link to settings tab')
    expect(html).not.toContain('⏺')
    expect(html).not.toContain('[Callout Box]')
    expect(html).not.toContain('[Tip Icon]')
  })

  it('puts the real icon in, as a picture', async () => {
    install()
    const { html } = await buildCleanHtml(ref)
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('shows Canvas dates in grey and the module’s Due by text, on scheduled items only', async () => {
    install()
    const { html } = await buildCleanHtml(ref)
    expect(html).toContain('Due: Sat, Sep 12, 2026, 11:59 PM MDT')
    expect(html).toContain('Available: Tue, Sep 8, 2026, 12:00 AM MDT – Mon, Sep 14, 2026, 11:59 PM MDT')
    // The discussion is under the Friday header; the page, file and module 2's assignment are not.
    expect(html.match(/Module schedule: Due by Friday, 11:59 PM MT/g)).toHaveLength(1)
    // The header itself no longer prints as a heading.
    expect(html).not.toMatch(/<h3[^>]*>[^<]*<span[^>]*>Due by/)
  })

  it('starts activities on new pages, except the first in a module and compact items', async () => {
    install()
    const { html } = await buildCleanHtml(ref)
    const breaksIn = (title: string) => {
      const m = new RegExp(`<h2 [^>]*>(?:(?!</h2>)[\\s\\S])*${title}`).exec(html)
      return m ? m[0].includes('page-break-before') : null
    }
    expect(breaksIn('Welcome Page')).toBe(false) // module heading already breaks
    expect(breaksIn('Introduce Yourself')).toBe(true)
    expect(breaksIn('Syllabus PDF')).toBe(false) // file stays with the discussion
    expect(breaksIn('A Site')).toBe(false)
    expect(breaksIn('Reflection')).toBe(false) // first in module 2
  })

  it('can turn page breaks off for activities', async () => {
    install()
    const { html } = await buildCleanHtml(ref, null, null, null, { pageBreaks: false })
    expect(html.match(/<h2 [^>]*page-break-before/g)).toBeNull()
    // Modules still start pages.
    expect(html.match(/<h1 [^>]*page-break-before/g)?.length).toBe(4)
  })

  it('only includes selected items', async () => {
    install()
    const { html, moduleCount } = await buildCleanHtml(ref, new Set(['mi-21']))
    expect(moduleCount).toBe(1)
    expect(text(html)).toContain('Reflection')
    expect(text(html)).not.toContain('Introduce Yourself')
  })
})
