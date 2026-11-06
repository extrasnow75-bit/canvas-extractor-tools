/**
 * Default names for the files a person saves, so a folder of extractions from several courses
 * can be told apart at a glance.
 *
 * The course code after the plain name when it has a department and number ("course_rubrics_respcare_560.html").
 * When it does not, the first few meaningful words of the course title instead
 * ("course_content_extraction_ecampus_demo.html"). Neither is available only for a title with no
 * Latin letters or digits, and that falls back to the plain name.
 *
 * Everything outside letters and digits becomes an underscore before the name reaches the save
 * dialog: both the code and the title are set by the institution, and a stray slash or colon in
 * one would be refused by Windows or, worse, read as a path.
 */

/** Words that say nothing about which course it is. */
const FILLER = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'course', 'class'])

const MAX_WORDS = 3
const MAX_CHARS = 30

/** Letters and digits only, in underscore-separated words; accents are dropped, not the letters. */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

/** "Advanced Respiratory Care Practicum II" -> "Advanced_Respiratory_Care". */
export function titleKeywords(title: string | null | undefined): string {
  if (!title) return ''
  const kept = words(title)
    .filter((w) => !FILLER.has(w.toLowerCase()))
    .slice(0, MAX_WORDS)
  // Shorten from the end, a whole word at a time, so the name never ends mid-word.
  while (kept.length > 1 && kept.join('_').length > MAX_CHARS) kept.pop()
  return kept.join('_').slice(0, MAX_CHARS).replace(/_+$/, '')
}

/** What goes after the plain name: the course code if there is one, else the title's keywords. Lower case. */
export function courseFileSuffix(code: string | null | undefined, title: string | null | undefined): string {
  const fromCode = code ? words(code).join('_') : ''
  return (fromCode || titleKeywords(title)).toLowerCase()
}

/**
 * The suggested name for a saved file. The course part goes before any extension on `base`, so
 * "course_rubrics.html" becomes "course_rubrics_cs_321.html", not "course_rubrics.html_cs_321".
 */
export function localFileName(base: string, code: string | null | undefined, title: string | null | undefined): string {
  const suffix = courseFileSuffix(code, title)
  if (!suffix) return base
  const dot = base.match(/\.[A-Za-z0-9]{2,5}$/)
  return dot ? `${base.slice(0, -dot[0].length)}_${suffix}${dot[0]}` : `${base}_${suffix}`
}
