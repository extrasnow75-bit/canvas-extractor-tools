import { describe, it, expect, vi, afterEach } from 'vitest'

// The clean tool draws icons in an Electron window; none of these pages has one.
vi.mock('./iconImages', () => ({ loadIconDataUri: vi.fn(async () => null) }))

import {
  buildContentHtml,
  listContentItems,
  HOME_ITEM_ID,
  SYLLABUS_ITEM_ID,
  includesHome,
  includesSyllabus,
} from './canvasExport'
import { buildCleanHtml } from './cleanExport'
import type { CourseRef } from './canvasUtils'

const BASE = 'https://school.instructure.com'
const ref: CourseRef = { baseUrl: BASE, courseId: '7', token: 't' }

const course = { id: 7, name: 'SAMPLE 101', syllabus_body: '<p>Syllabus words</p>', time_zone: 'America/Denver' }
const routes: Record<string, unknown> = {
  '/courses/7': course,
  '/courses/7/files': [],
  '/courses/7/front_page': { title: 'Home', body: '<p>Welcome home words</p>' },
  '/courses/7/modules': [{ id: 1, name: 'Module 1' }],
  '/courses/7/modules/1/items': [{ id: 12, title: 'Welcome Page', type: 'Page', page_url: 'welcome' }],
  '/courses/7/pages/welcome': { title: 'Welcome Page', body: '<p>Page words</p>' },
}

let requested: string[] = []
/** `status` makes a path fail with that HTTP status; `data` replaces what a path returns. */
function install(status: Record<string, number> = {}, data: Record<string, unknown> = {}) {
  requested = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace('/api/v1', '')
      requested.push(path)
      const code = status[path] ?? (path in data || path in routes ? 200 : 404)
      if (code !== 200) {
        return { ok: false, status: code, statusText: 'x', headers: new Headers(), json: async () => ({}), text: async () => 'nope' }
      }
      const body = path in data ? data[path] : routes[path]
      return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), json: async () => body, text: async () => '' }
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())

const text = (html: string) => html.replace(/<[^>]+>/g, ' ')
const withoutSyllabus = (body: unknown) => ({ '/courses/7': { ...course, syllabus_body: body } })

describe('what each choice means', () => {
  it('both are wanted when nothing was selected at all, and otherwise follow the selection', () => {
    for (const none of [null, undefined]) {
      expect(includesHome(none)).toBe(true)
      expect(includesSyllabus(none)).toBe(true)
    }
    const homeOnly = new Set([HOME_ITEM_ID, 'mi-1'])
    expect(includesHome(homeOnly)).toBe(true)
    expect(includesSyllabus(homeOnly)).toBe(false)
    const syllabusOnly = new Set([SYLLABUS_ITEM_ID])
    expect(includesHome(syllabusOnly)).toBe(false)
    expect(includesSyllabus(syllabusOnly)).toBe(true)
    expect(includesHome(new Set())).toBe(false)
    expect(includesSyllabus(new Set())).toBe(false)
  })

  it('have ids no module item can have, and different from each other', () => {
    expect(HOME_ITEM_ID.startsWith('mi-')).toBe(false)
    expect(SYLLABUS_ITEM_ID.startsWith('mi-')).toBe(false)
    expect(HOME_ITEM_ID).not.toBe(SYLLABUS_ITEM_ID)
  })
})

describe('the picker list', () => {
  it('offers the home page, then the syllabus, then the modules', async () => {
    install()
    const items = await listContentItems(ref)
    expect(items.map((i) => i.id)).toEqual(['home', 'syllabus', 'mi-12'])
    expect(items[0]).toEqual({ id: 'home', label: 'Home page' })
    expect(items[1]).toEqual({ id: 'syllabus', label: 'Syllabus' })
    expect(items[0].group).toBeUndefined()
    expect(items[1].group).toBeUndefined()
    expect(items[2]).toMatchObject({ label: 'Welcome Page', group: 'Module 1' })
  })

  it('leaves out the home page when Canvas says there is none', async () => {
    install({ '/courses/7/front_page': 404 })
    expect((await listContentItems(ref)).map((i) => i.id)).toEqual(['syllabus', 'mi-12'])
  })

  it.each([['empty', ''], ['blank', '  \n '], ['null', null]])('leaves out the syllabus when it is %s', async (_n, body) => {
    install({}, withoutSyllabus(body))
    expect((await listContentItems(ref)).map((i) => i.id)).toEqual(['home', 'mi-12'])
  })

  it('keeps each choice when Canvas could not say, rather than dropping content by accident', async () => {
    install({ '/courses/7/front_page': 500, '/courses/7': 500 })
    expect((await listContentItems(ref)).map((i) => i.id)).toEqual(['home', 'syllabus', 'mi-12'])
  })
})

describe('the content tool', () => {
  it('includes both when there is no selection', async () => {
    install()
    const { html } = await buildContentHtml(ref)
    expect(text(html)).toContain('Welcome home words')
    expect(text(html)).toContain('Syllabus words')
    expect(html).toContain('Home Page')
  })

  it('includes both, and the items, when all are ticked', async () => {
    install()
    const { html } = await buildContentHtml(ref, new Set(['home', 'syllabus', 'mi-12']))
    for (const words of ['Welcome home words', 'Syllabus words', 'Page words']) expect(text(html)).toContain(words)
  })

  it('leaves the home page out, and does not fetch it, when it is not ticked', async () => {
    install()
    const { html } = await buildContentHtml(ref, new Set(['syllabus', 'mi-12']))
    expect(html).not.toContain('Home Page')
    expect(text(html)).not.toContain('Welcome home words')
    expect(text(html)).toContain('Syllabus words')
    expect(requested).not.toContain('/courses/7/front_page')
  })

  it('leaves the syllabus out when it is not ticked', async () => {
    install()
    const { html } = await buildContentHtml(ref, new Set(['home', 'mi-12']))
    expect(html).not.toMatch(/<h2[^>]*>Syllabus<\/h2>/)
    expect(text(html)).not.toContain('Syllabus words')
    expect(text(html)).toContain('Welcome home words')
    expect(text(html)).toContain('Page words')
  })

  it('writes only the home page when only it is ticked', async () => {
    install()
    const { html, moduleCount } = await buildContentHtml(ref, new Set(['home']))
    expect(moduleCount).toBe(0)
    expect(text(html)).toContain('Welcome home words')
    expect(text(html)).not.toContain('Syllabus words')
    expect(text(html)).not.toContain('Page words')
  })

  it('writes only the syllabus when only it is ticked', async () => {
    install()
    const { html, moduleCount } = await buildContentHtml(ref, new Set(['syllabus']))
    expect(moduleCount).toBe(0)
    expect(text(html)).toContain('Syllabus words')
    expect(text(html)).not.toContain('Welcome home words')
  })

  it('writes just the modules when neither is ticked', async () => {
    install()
    const { html } = await buildContentHtml(ref, new Set(['mi-12']))
    expect(text(html)).toContain('Page words')
    expect(text(html)).not.toContain('Welcome home words')
    expect(text(html)).not.toContain('Syllabus words')
  })
})

describe('the clean tool', () => {
  it('includes both when there is no selection, and lists them in the contents', async () => {
    install()
    const { html } = await buildCleanHtml(ref)
    expect(text(html)).toContain('Welcome home words')
    expect(text(html)).toContain('Syllabus words')
    expect(text(html)).toContain('Home Page')
  })

  it('leaves the home page out, and does not fetch it, when it is not ticked', async () => {
    install()
    const { html } = await buildCleanHtml(ref, new Set(['syllabus', 'mi-12']))
    expect(text(html)).not.toContain('Welcome home words')
    expect(text(html)).not.toContain('Home Page')
    expect(text(html)).toContain('Syllabus words')
    expect(text(html)).toContain('Page words')
    expect(requested).not.toContain('/courses/7/front_page')
  })

  it('leaves the syllabus out of the document and of the contents when it is not ticked', async () => {
    install()
    const { html } = await buildCleanHtml(ref, new Set(['home', 'mi-12']))
    expect(text(html)).not.toContain('Syllabus words')
    expect(html).not.toContain('sec-syllabus')
    expect(text(html)).toContain('Welcome home words')
    expect(text(html)).toContain('Page words')
  })

  it('writes just the modules when neither is ticked', async () => {
    install()
    const { html } = await buildCleanHtml(ref, new Set(['mi-12']))
    expect(text(html)).toContain('Page words')
    expect(text(html)).not.toContain('Welcome home words')
    expect(text(html)).not.toContain('Syllabus words')
  })

  it('keeps the progress bar honest in every combination: it ends at its total', async () => {
    const selections: Array<Set<string> | null> = [
      null,
      new Set(['home', 'syllabus', 'mi-12']),
      new Set(['syllabus', 'mi-12']),
      new Set(['home', 'mi-12']),
      new Set(['mi-12']),
      new Set(['home']),
      new Set(['syllabus']),
    ]
    for (const selection of selections) {
      install()
      const seen: Array<[number, number]> = []
      await buildCleanHtml(ref, selection, null, (done, total) => seen.push([done, total]))
      const [done, total] = seen[seen.length - 1]
      expect(done, JSON.stringify(selection && [...selection])).toBe(total)
    }
  })
})
