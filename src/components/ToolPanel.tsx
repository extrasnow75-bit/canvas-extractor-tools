import React, { useEffect, useRef, useState } from 'react'
import { Link2, CheckCircle2, Loader2 } from 'lucide-react'
import { ToolTile } from './ToolTile'

interface Props {
  token: string
}

/**
 * Kept in step with `isAllowedCanvasHost` in electron/ipc/canvasUtils.ts, which is the real
 * gate — the main process will not send the Canvas token anywhere outside instructure.com.
 * Matching here only so the field turns red immediately instead of after a round trip.
 */
const COURSE_URL_RE = /^https:\/\/[^/]*\binstructure\.com\/courses\/\d+/i

// Prefilled as real (fully editable) text rather than a placeholder: every Boise State
// course shares this prefix, so usually only the trailing id needs typing.
const DEFAULT_COURSE_URL = 'https://boisestatecanvas.instructure.com/courses/'

// Reuses the exact Canvas mark from the Rubric Creator app's Layout.tsx (CanvasLogo),
// rendered in white so it reads clearly on the red tile.
const CanvasIcon = () => (
  <svg width="25" height="25" viewBox="0 0 100 100" fill="#fff" aria-hidden="true" focusable="false">
    <g>
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(45,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(90,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(135,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(180,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(225,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(270,50,50)" />
      <path d="M 38 14 A 12 12 0 0 0 62 14 Z" transform="rotate(315,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(22.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(67.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(112.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(157.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(202.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(247.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(292.5,50,50)" />
      <circle cx="50" cy="28" r="5" transform="rotate(337.5,50,50)" />
    </g>
  </svg>
)

const QuizIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M13.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6" />
    <line x1="7.5" y1="9" x2="12.5" y2="9" />
    <line x1="7.5" y1="12.5" x2="11" y2="12.5" />
    <line x1="7.5" y1="16" x2="9.5" y2="16" />
    <path d="M17.7 3.3a1.6 1.6 0 0 1 2.3 2.3l-6 6-3 .8.8-3z" />
  </svg>
)

const RubricIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9.3" x2="21" y2="9.3" />
    <line x1="3" y1="14.7" x2="21" y2="14.7" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </svg>
)

const TOOLS = [
  {
    id: 'content' as const,
    label: 'Course content export',
    description: 'Modules, pages, assignments, discussions → Blueprint-formatted HTML',
    icon: <CanvasIcon />,
    tileBg: '#EA4335',
  },
  {
    id: 'quizzes' as const,
    label: 'Classic quiz export',
    description: 'All classic-quiz questions and answers, template-formatted HTML',
    icon: <QuizIcon />,
    tileBg: '#FBBC05',
  },
  {
    id: 'rubrics' as const,
    label: 'Rubric export',
    description: 'Every course rubric with criteria and rating levels, as a table',
    icon: <RubricIcon />,
    tileBg: '#34A853',
  },
]

export function ToolPanel({ token }: Props) {
  const [courseUrl, setCourseUrl] = useState(DEFAULT_COURSE_URL)
  const inputRef = useRef<HTMLInputElement>(null)
  const [courseName, setCourseName] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  // Bumped by "Start again": it is part of each tile's key, so the tiles remount with
  // completely fresh state rather than relying on this file knowing what they hold.
  const [resetKey, setResetKey] = useState(0)

  const urlValid = COURSE_URL_RE.test(courseUrl.trim())

  // Any previous result is stale the moment the URL changes — clear it so a name
  // from a different course can never linger next to a new URL.
  useEffect(() => {
    setCourseName(null)
    setNameError(null)
  }, [courseUrl])

  // Start with the caret after the prefix so the course id can be typed straight away.
  // Keyed on resetKey as well as mount, so "Start again" lands the caret in the same place.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [resetKey])

  /**
   * Return every tool to the state it had at launch, for the common case of exporting one
   * course and then moving on to the next.
   *
   * This is a convenience, not the safeguard: each tile already discards its own selection
   * when the course URL changes. Without that, this button would be load-bearing, and an
   * export would silently come out wrong whenever someone forgot to press it.
   */
  const startOver = () => {
    setCourseUrl(DEFAULT_COURSE_URL)
    setCourseName(null)
    setNameError(null)
    setResetKey((k) => k + 1)
  }

  const validateCourse = async () => {
    if (!urlValid || validating) return
    setValidating(true)
    setCourseName(null)
    setNameError(null)
    try {
      const res = await window.api.canvas.getCourseName({ courseUrl: courseUrl.trim(), token })
      if (res.ok && res.name) setCourseName(res.name)
      else setNameError(res.message ?? 'Could not load this course.')
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not load this course.')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-6 space-y-3.5">
      <div
        className={`rounded-2xl border-2 p-4 ${
          urlValid && courseName ? 'border-green-200 shadow-[0_0_0_3px_rgba(240,253,244,1)]' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="w-4 h-4 text-[#0033a0] flex-shrink-0" aria-hidden="true" />
          <span className="font-black text-[15px]">Canvas course</span>
          {urlValid && courseName && (
            <CheckCircle2
              className="w-[17px] h-[17px] text-green-500 ml-auto flex-shrink-0"
              aria-hidden="true"
            />
          )}
        </div>
        <p className="text-[13px] text-gray-600 mb-2.5">
          Paste the homepage URL of the course you want to export. All three tools below use it.
        </p>
        <div className="flex gap-2">
          {/* type="text" (not "url") so the caret can be positioned — setSelectionRange
              throws on url inputs — and so our own validation governs. */}
          <label htmlFor="course-url" className="sr-only">
            Canvas course URL
          </label>
          <input
            id="course-url"
            ref={inputRef}
            type="text"
            inputMode="url"
            spellCheck={false}
            value={courseUrl}
            onChange={(e) => setCourseUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void validateCourse()
            }}
            placeholder="https://boisestatecanvas.instructure.com/courses/12345"
            aria-invalid={!!courseUrl && !urlValid}
            aria-describedby={courseUrl && !urlValid ? 'course-url-error' : undefined}
            className="flex-1 min-w-0 border-2 border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#0033a0] focus:ring-2 focus:ring-blue-200 transition"
          />
          <button
            onClick={validateCourse}
            disabled={!urlValid || validating}
            className="flex-shrink-0 px-4 rounded-xl border-2 border-[#0033a0] text-[#0033a0] font-black text-sm hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent transition flex items-center gap-1.5"
          >
            {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {validating ? 'Checking…' : 'Validate'}
          </button>
        </div>
        {courseUrl && !urlValid && (
          <p id="course-url-error" className="text-xs text-red-700 mt-1.5">
            Enter the full course URL, e.g. https://boisestatecanvas.instructure.com/courses/12345
          </p>
        )}
        {/* The looked-up course name arrives asynchronously, so announce it rather than
            letting it appear silently for anyone not watching the card. */}
        {(courseName || nameError) && (
          <div className="mt-2.5 flex items-center gap-2 min-h-[1.25rem]" role="status" aria-live="polite">
            {courseName ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-black text-green-700">
                  <span className="sr-only">Course found: </span>
                  {courseName}
                </span>
              </>
            ) : (
              <span className="text-xs text-red-700">{nameError}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="text-[12px] text-gray-700 uppercase tracking-wide font-black">Export tools</h2>
        <button
          onClick={startOver}
          className="text-[12.5px] font-bold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
        >
          Start again with a new course
        </button>
      </div>
      <p className="text-xs text-gray-600 -mt-2 px-1">
        Each export becomes a Google Doc in your Drive. Not signed in to Google? Use "save a local copy" instead.
      </p>

      <div className="space-y-3">
        {TOOLS.map((t) => (
          <ToolTile
            key={`${t.id}-${resetKey}`}
            tool={t.id}
            label={t.label}
            description={t.description}
            icon={t.icon}
            tileBg={t.tileBg}
            courseUrl={courseUrl.trim()}
            token={token}
          />
        ))}
      </div>
    </div>
  )
}
