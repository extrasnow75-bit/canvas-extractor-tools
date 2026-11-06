/**
 * Published content that no module holds: pages, assignments, discussions and classic quizzes a
 * student can see in Canvas but only by following a link, such as a page linked from another page.
 *
 * It is offered as a last group in the content pickers and is never part of "Extract all", which
 * stays modules, home page and syllabus. Each item is shaped like a module item, so the same code
 * that fetches and renders a module's items handles these.
 */
import { canvasGet, CourseRef, isCancellation } from './canvasUtils'
import type { CanvasModuleItem } from './canvasExport'

/** The picker group, and the heading of the section in the document. Same words as src/components/pickerGroups.ts. */
export const LOOSE_GROUP = 'Published content not in a module'

const PREFIXES = ['pg-', 'as-', 'dt-', 'qz-']
export const isLooseKey = (key: string): boolean => PREFIXES.some((p) => key.startsWith(p))
export const hasLooseKey = (keys: Iterable<string>): boolean => {
  for (const k of keys) if (isLooseKey(k)) return true
  return false
}

interface RawPage { page_id?: number; url: string; title?: string; published?: boolean; front_page?: boolean }
interface RawAssignment {
  id: number
  name?: string
  published?: boolean
  submission_types?: string[]
  is_quiz_lti_assignment?: boolean
}
interface RawTopic { id: number; title?: string; published?: boolean }
interface RawQuiz { id: number; title?: string; published?: boolean }

export interface LooseSources {
  pages: RawPage[]
  assignments: RawAssignment[]
  discussions: RawTopic[]
  quizzes: RawQuiz[]
}

const byTitle = (a: CanvasModuleItem, b: CanvasModuleItem): number => a.title.localeCompare(b.title)

/** The published items that no module lists, pages first, then assignments, discussions and quizzes. */
export function pickLoose(moduleItems: CanvasModuleItem[], src: LooseSources): CanvasModuleItem[] {
  const used = { Page: new Set<string>(), Assignment: new Set<number>(), Discussion: new Set<number>(), Quiz: new Set<number>() }
  for (const it of moduleItems) {
    if (it.type === 'Page' && it.page_url) used.Page.add(it.page_url)
    else if (it.type === 'Assignment' && it.content_id !== undefined) used.Assignment.add(it.content_id)
    else if (it.type === 'Discussion' && it.content_id !== undefined) used.Discussion.add(it.content_id)
    else if (it.type === 'Quiz' && it.content_id !== undefined) used.Quiz.add(it.content_id)
  }
  const label = (title: string | undefined, fallback: string) => (title ?? '').trim() || fallback

  const pages = src.pages
    // The front page is the Home page entry, so it is not listed again.
    .filter((p) => p.published === true && !p.front_page && !used.Page.has(p.url))
    .map((p): CanvasModuleItem => ({ id: p.page_id ?? 0, key: `pg-${p.url}`, title: label(p.title, p.url), type: 'Page', page_url: p.url }))
    .sort(byTitle)
  const assignments = src.assignments
    // The assignment behind a graded discussion or a quiz is that discussion or quiz, listed below.
    .filter((a) => a.published === true && !used.Assignment.has(a.id) && !a.is_quiz_lti_assignment && !(a.submission_types ?? []).some((t) => t === 'discussion_topic' || t === 'online_quiz'))
    .map((a): CanvasModuleItem => ({ id: a.id, key: `as-${a.id}`, title: label(a.name, `Assignment ${a.id}`), type: 'Assignment', content_id: a.id }))
    .sort(byTitle)
  const discussions = src.discussions
    .filter((d) => d.published === true && !used.Discussion.has(d.id))
    .map((d): CanvasModuleItem => ({ id: d.id, key: `dt-${d.id}`, title: label(d.title, `Discussion ${d.id}`), type: 'Discussion', content_id: d.id }))
    .sort(byTitle)
  const quizzes = src.quizzes
    .filter((q) => q.published === true && !used.Quiz.has(q.id))
    .map((q): CanvasModuleItem => ({ id: q.id, key: `qz-${q.id}`, title: label(q.title, `Quiz ${q.id}`), type: 'Quiz', content_id: q.id }))
    .sort(byTitle)
  return [...pages, ...assignments, ...discussions, ...quizzes]
}

/** Reads the course's four lists. One that Canvas will not give (a disabled tab) counts as empty. */
export async function fetchLooseItems(ref: CourseRef, moduleItems: CanvasModuleItem[]): Promise<CanvasModuleItem[]> {
  const base = `/courses/${ref.courseId}`
  const read = async <T,>(path: string): Promise<T[]> => {
    try {
      return await canvasGet<T>(path, ref)
    } catch (err) {
      if (isCancellation(err)) throw err
      return []
    }
  }
  const [pages, assignments, discussions, quizzes] = await Promise.all([
    read<RawPage>(`${base}/pages?published=true`),
    read<RawAssignment>(`${base}/assignments`),
    read<RawTopic>(`${base}/discussion_topics`),
    read<RawQuiz>(`${base}/quizzes`),
  ])
  return pickLoose(moduleItems, { pages, assignments, discussions, quizzes })
}

/** For an extraction: the loose items the person ticked, or none. */
export async function selectedLooseItems(
  ref: CourseRef,
  moduleItems: CanvasModuleItem[],
  selectedIds: Set<string> | null | undefined,
): Promise<CanvasModuleItem[]> {
  if (!selectedIds || !hasLooseKey(selectedIds)) return []
  const all = await fetchLooseItems(ref, moduleItems)
  return all.filter((it) => it.key !== undefined && selectedIds.has(it.key))
}
