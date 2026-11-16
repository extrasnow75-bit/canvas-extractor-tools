import type { CourseChoice } from '../types'

/** Same word as NO_TERM in electron/ipc/courseList.ts: the group of masters and templates. */
export const NO_TERM_GROUP = 'No term'

export interface CourseGroup {
  term: string
  ended: boolean
  courses: CourseChoice[]
}

/**
 * The rows to show: every course matching all the words typed in the search box (against name and
 * course code). Order from the main process is kept, so groups come out masters first, then newest term first.
 */
export function visibleGroups(courses: CourseChoice[], query: string): CourseGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const groups: CourseGroup[] = []
  for (const c of courses) {
    const hay = `${c.name} ${c.code}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    const last = groups[groups.length - 1]
    if (last && last.term === c.term) last.courses.push(c)
    else groups.push({ term: c.term, ended: c.ended, courses: [c] })
  }
  return groups
}

export const countCourses = (groups: CourseGroup[]): number => groups.reduce((n, g) => n + g.courses.length, 0)

export function siteHost(site: string): string {
  try {
    return new URL(site).host
  } catch {
    return site
  }
}
