/**
 * The list of courses a person can choose from, instead of pasting a course address.
 *
 * Only courses where the person is a teacher, TA or designer are offered: those are the ones
 * worth extracting, and a student cannot read most of what the tools need. Pure logic lives here
 * so it can be tested without Canvas; `listMyCourses` is the one function that talks to it.
 */
import { canvasGet, isAllowedCanvasHost, type CourseRef } from './canvasUtils'

export type CourseRole = 'teacher' | 'ta' | 'designer'

export interface CourseChoice {
  id: string
  name: string
  code: string
  role: CourseRole
  /** Term name, or NO_TERM for courses with none (and for Canvas's "Default Term"), such as masters. */
  term: string
  /** Start of the term, for ordering newest first. Null when Canvas has none. */
  termStart: string | null
  ended: boolean
  /** A Blueprint (master) course. False when Canvas does not say. */
  blueprint: boolean
}

interface RawCourse {
  id: number
  name?: string
  course_code?: string
  workflow_state?: string
  blueprint?: boolean
  end_at?: string | null
  term?: { name?: string; start_at?: string | null; end_at?: string | null } | null
  enrollments?: Array<{ type?: string }>
}

/** The group for masters and templates, which belong to no real term. */
// The picker adds "master and template courses" beside this name; src/components/courseFilter.ts
// holds the same word, since the screen cannot import from here.
export const NO_TERM = 'No term'

const isRealTerm = (name: string | undefined): boolean => Boolean(name?.trim()) && !/^default term$/i.test(name as string)

/** Canvas writes the same role as "teacher" in some places and "TeacherEnrollment" in others. */
export function roleOf(type: string | undefined): CourseRole | null {
  const t = (type ?? '').toLowerCase().replace(/enrollment$/, '')
  if (t === 'teacher') return 'teacher'
  if (t === 'ta') return 'ta'
  if (t === 'designer') return 'designer'
  return null
}

const PRIORITY: CourseRole[] = ['teacher', 'designer', 'ta']

/** Reduces Canvas's course records to the ones to offer, newest term first, then by name. */
export function chooseCourses(raw: RawCourse[], now = new Date()): CourseChoice[] {
  const seen = new Set<number>()
  const out: CourseChoice[] = []
  for (const c of raw) {
    if (seen.has(c.id)) continue
    const roles = (c.enrollments ?? []).map((e) => roleOf(e.type)).filter((r): r is CourseRole => r !== null)
    if (roles.length === 0) continue
    seen.add(c.id)
    const real = isRealTerm(c.term?.name)
    const endAt = real ? (c.term?.end_at ?? c.end_at ?? null) : null
    out.push({
      id: String(c.id),
      name: c.name?.trim() || `Course ${c.id}`,
      code: c.course_code?.trim() ?? '',
      role: PRIORITY.find((p) => roles.includes(p)) as CourseRole,
      term: real ? (c.term?.name as string).trim() : NO_TERM,
      termStart: real ? (c.term?.start_at ?? null) : null,
      // A course with no term is never "ended": masters stay in use, and the group is not labelled by it.
      ended: real && (c.workflow_state === 'completed' || (endAt !== null && Date.parse(endAt) < now.getTime())),
      blueprint: c.blueprint === true,
    })
  }
  return out.sort((a, b) => {
    // Masters and templates first, by name: for a designer they are the courses opened most.
    // Then terms, newest first, with a term name breaking ties between equal dates.
    if ((a.term === NO_TERM) !== (b.term === NO_TERM)) return a.term === NO_TERM ? -1 : 1
    const sa = a.termStart ? Date.parse(a.termStart) : -Infinity
    const sb = b.termStart ? Date.parse(b.termStart) : -Infinity
    return sb - sa || a.term.localeCompare(b.term) || a.name.localeCompare(b.name)
  })
}

/**
 * Turns whatever was typed for a Canvas site into its address, or null when it is not an
 * instructure.com site. "myschool.instructure.com", "https://myschool.instructure.com/" and a
 * full course address all give "https://myschool.instructure.com".
 */
export function normalizeSite(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== 'https:' || !isAllowedCanvasHost(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

const QUERY = 'include[]=term&state[]=available&state[]=unpublished'

/** Fetches the person's courses from one Canvas site. Past courses take a second request. */
export async function listMyCourses(baseUrl: string, token: string): Promise<CourseChoice[]> {
  const ref: CourseRef = { baseUrl, courseId: '', token }
  const current = await canvasGet<RawCourse>(`/courses?${QUERY}`, ref)
  let past: RawCourse[] = []
  try {
    past = await canvasGet<RawCourse>(`/courses?${QUERY}&state[]=completed&enrollment_state=completed`, ref)
  } catch {
    // The current list is still useful if the past one fails.
  }
  return chooseCourses([...current, ...past])
}
