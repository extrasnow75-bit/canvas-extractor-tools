import { IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'fs'
import {
  parseCourseUrl,
  canvasGet,
  canvasGetOne,
  CourseRef,
  PickerItem,
  CancelToken,
  ProgressReporter,
  throwIfCancelled,
  beginJob,
  endJob,
  isCancellation,
} from './canvasUtils'
import { FONT, htmlDocument, escapeHtml } from './blueprintFormat'
import { makeProgressReporter } from './canvasExport'

interface QuizExportArgs {
  courseUrl: string
  token: string
  savePath: string
  selectedIds?: string[]
  jobId?: string
}

interface CanvasCourse { id: number; name: string }

interface CanvasModule {
  id: number
  name: string
  items?: CanvasModuleItem[]
}

interface CanvasModuleItem {
  type: string
  content_id: number
}

interface CanvasQuiz {
  id: number
  title: string
  quiz_type: string
}

interface CanvasQuestion {
  id: number
  question_type: string
  question_text: string
  points_possible: number
  answers?: CanvasAnswer[]
}

interface CanvasAnswer {
  id: number
  text?: string
  html?: string
  weight: number
}

// Matches the set used by the existing quiz extractor
const SUPPORTED_TYPES = new Set([
  'multiple_choice_question',
  'true_false_question',
  'short_answer_question',
  'essay_question',
  'multiple_answers_question',
  'fill_in_multiple_blanks_question',
  'matching_question',
  'numerical_question',
])

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
}

function indexToLetter(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : String(i + 1)
}

function isSurvey(quizType: string): boolean {
  return quizType === 'survey' || quizType === 'graded_survey'
}

function allWeightsEqualAndAmbiguous(answers: CanvasAnswer[], questionType: string): boolean {
  if (questionType === 'multiple_answers_question') return false
  if (answers.length <= 1) return false
  const first = answers[0].weight
  return answers.every((a) => a.weight === first)
}

function answerText(answer: CanvasAnswer): string {
  if (answer.text?.trim()) return answer.text.trim()
  if (answer.html?.trim()) return stripHtml(answer.html)
  return ''
}

/** One line of quiz text as a tight paragraph (preserves internal line breaks). */
function line(text: string): string {
  const safe = escapeHtml(text).replace(/\n/g, '<br>')
  return `<p style="font-family:${FONT};font-size:12pt;margin:0;">${safe}</p>`
}

function spacer(): string {
  return '<p style="margin:0;">&nbsp;</p>'
}

/**
 * Formats one question exactly as the existing quiz extractor does:
 *   Type: E          ← essay only
 *   Points: N
 *   N) Question text
 *   *a) Correct      ← asterisk = correct
 *    b) Wrong
 */
function formatQuestion(
  question: CanvasQuestion,
  num: number,
  suppressCorrect: boolean,
): string[] {
  const out: string[] = []
  const qType = question.question_type
  const points = question.points_possible ?? 1
  const qText = stripHtml(question.question_text)

  if (qType === 'essay_question') out.push(line('Type: E'))
  out.push(line(`Points: ${points}`))
  out.push(line(`${num}) ${qText}`))

  if (qType !== 'essay_question') {
    const answers = question.answers ?? []
    const hideAsterisks = suppressCorrect || allWeightsEqualAndAmbiguous(answers, qType)
    answers.forEach((ans, idx) => {
      const letter = indexToLetter(idx)
      const text = answerText(ans)
      const correct = !hideAsterisks && ans.weight > 0
      out.push(line(`${correct ? '*' : ''}${letter}) ${text}`))
    })
  }

  return out
}

/** Build quizId → moduleName map (best-effort; swallows errors). */
async function buildModuleMap(ref: CourseRef): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const modules = await canvasGet<CanvasModule>(
      `/courses/${ref.courseId}/modules?include[]=items`,
      ref,
    )
    for (const mod of modules) {
      for (const item of mod.items ?? []) {
        if (item.type === 'Quiz') map.set(item.content_id, mod.name)
      }
    }
  } catch { /* module info is optional */ }
  return map
}

/** List every classic-or-not quiz in the course, for the picker UI. */
export async function listQuizItems(ref: CourseRef): Promise<PickerItem[]> {
  const quizzes = await canvasGet<CanvasQuiz>(`/courses/${ref.courseId}/quizzes`, ref)
  return quizzes.map((q) => ({ id: String(q.id), label: q.title }))
}

/**
 * Build the full "Quiz Questions" HTML for a course — one document, each quiz separated
 * by its title heading. Kept separate from the file-write so the Drive path can reuse it.
 * When `selectedIds` is provided, only matching quizzes are included.
 */
export async function buildQuizzesHtml(
  ref: CourseRef,
  selectedIds?: Set<string> | null,
  cancel?: CancelToken | null,
  progress?: ProgressReporter | null,
): Promise<{ html: string; courseName: string; classicCount: number; newQuizCount: number } | null> {
  const course = await canvasGetOne<CanvasCourse>(`/courses/${ref.courseId}`, ref)
  const allQuizzes = await canvasGet<CanvasQuiz>(`/courses/${ref.courseId}/quizzes`, ref)
  const quizzes = selectedIds
    ? allQuizzes.filter((q) => selectedIds.has(String(q.id)))
    : allQuizzes
  if (quizzes.length === 0) return null

  const moduleMap = await buildModuleMap(ref)
  const parts: string[] = []

  parts.push(`<h1 style="font-family:${FONT};">${escapeHtml(`${course.name} Quiz Questions`)}</h1>`)

  let classicCount = 0
  let newQuizCount = 0
  let done = 0
  progress?.(0, quizzes.length)

  for (const quiz of quizzes) {
    throwIfCancelled(cancel)
    parts.push(`<h2 style="font-family:${FONT};">${escapeHtml(quiz.title)}</h2>`)

    const moduleName = moduleMap.get(quiz.id)
    if (moduleName) {
      parts.push(`<h3 style="font-family:${FONT};">${escapeHtml(moduleName)}</h3>`)
    }

    if (quiz.quiz_type === 'quizzes.next') {
      newQuizCount++
      parts.push(
        `<p style="font-family:${FONT};font-size:12pt;color:#cc0000;font-style:italic;">` +
          'New Quizzes are not supported. Questions for this quiz could not be extracted.</p>',
      )
      parts.push(spacer())
      done++
      progress?.(done, quizzes.length)
      continue
    }

    classicCount++
    const questions = await canvasGet<CanvasQuestion>(
      `/courses/${ref.courseId}/quizzes/${quiz.id}/questions`,
      ref,
    )

    const supported = questions.filter((q) => SUPPORTED_TYPES.has(q.question_type))
    const skipped = questions.length - supported.length
    const suppressCorrect = isSurvey(quiz.quiz_type)

    if (supported.length === 0 && questions.length > 0) {
      parts.push(line('No supported question types found in this quiz.'))
    }

    supported.forEach((q, idx) => {
      parts.push(...formatQuestion(q, idx + 1, suppressCorrect))
      parts.push(spacer())
    })

    if (skipped > 0) {
      parts.push(
        `<p style="font-family:${FONT};font-size:11pt;color:#888888;font-style:italic;">` +
          `Note: ${skipped} question${skipped > 1 ? 's were' : ' was'} skipped (unsupported question type).</p>`,
      )
    }

    parts.push(spacer())
    done++
    progress?.(done, quizzes.length)
  }

  return {
    html: htmlDocument(`${course.name} Quiz Questions`, parts),
    courseName: course.name,
    classicCount,
    newQuizCount,
  }
}

export async function handleQuizExport(
  event: IpcMainInvokeEvent,
  args: QuizExportArgs,
): Promise<{ ok: boolean; message: string; cancelled?: boolean }> {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'Invalid Canvas course URL.' }

  const ref: CourseRef = { ...parsed, token: args.token }
  const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
  const cancel = beginJob(args.jobId)
  try {
    const result = await buildQuizzesHtml(
      ref,
      selectedIds,
      cancel,
      makeProgressReporter(event, args.jobId),
    )
    if (!result) return { ok: false, message: 'No quizzes found in this course.' }

    writeFileSync(args.savePath, result.html, 'utf-8')

    const { classicCount, newQuizCount } = result
    return {
      ok: true,
      message:
        `Exported ${classicCount} classic quiz${classicCount !== 1 ? 'zes' : ''}` +
        (newQuizCount > 0
          ? ` (${newQuizCount} New Quiz${newQuizCount !== 1 ? 'zes' : ''} noted but not extracted)`
          : '') +
        '.',
    }
  } catch (err) {
    if (isCancellation(err)) return { ok: false, message: 'Export cancelled.', cancelled: true }
    throw err
  } finally {
    endJob(args.jobId)
  }
}
