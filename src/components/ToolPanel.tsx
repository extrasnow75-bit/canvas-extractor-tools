import { ErrorText, ErrorDetails } from './ErrorText'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { ToolTile } from './ToolTile'
import { CoursePicker } from './CoursePicker'
import { googleLine } from './googleView'
import type { GoogleCheckState } from '../types'

interface Props {
  token: string
  /** What a check of the stored Google sign-in found. */
  googleCheck: GoogleCheckState
  /** The signed-in account, shown only once the check has confirmed it. */
  googleWho: string | null
  /** Whether the tools should offer saving to Google Drive. */
  googleReady: boolean
  /** Opens the Initial setup panel, where signing in happens. */
  onOpenSetup(): void
}

/**
 * One line, above the tools, saying whether Google is signed in and what that means for where
 * files go. Said here rather than only in the setup panel, because that panel is collapsed once
 * setup is done, which is when someone is about to extract and needs to know.
 */
function GoogleStatusLine({ state, who, onSignIn }: { state: GoogleCheckState; who: string | null; onSignIn(): void }) {
  const line = googleLine(state, who)
  const box =
    line.tone === 'good'
      ? 'bg-green-50 border-green-200 text-green-900'
      : line.tone === 'warn'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-gray-50 border-gray-200 text-gray-800'
  const dot = line.tone === 'good' ? 'bg-green-500' : line.tone === 'warn' ? 'bg-amber-500' : 'bg-gray-400'
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px] ${box}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
      <span className="flex-1">{line.text}</span>
      {line.offerSignIn && (
        <button
          onClick={onSignIn}
          className="flex-shrink-0 font-black underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
        >
          Sign in
        </button>
      )}
    </div>
  )
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
const DEFAULT_SITE = 'https://boisestatecanvas.instructure.com'

/** The Canvas site of the address typed so far, if it has one; otherwise Boise State's. */
function siteOf(courseUrl: string): string {
  const m = courseUrl.trim().match(/^(https:\/\/[^/]*\binstructure\.com)(\/|$)/i)
  return m ? m[1] : DEFAULT_SITE
}

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

// The Canvas mark with a star in the corner, marking the reader's version of the content
// extraction. The star is a placeholder shape until the Rubric Creator app's "edit existing
// rubrics" star is copied in.
const CleanIcon = () => (
  <div className="relative">
    <CanvasIcon />
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="absolute -right-2.5 -bottom-2.5"
    >
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"
        fill="#FBBC05"
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  </div>
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

const SettingsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9.3" x2="21" y2="9.3" />
    <line x1="3" y1="14.7" x2="21" y2="14.7" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <path d="M13.2 11.2h4.4l-.5 1 .5 1h-4.4l.5-1z" fill="#fff" stroke="none" />
    <circle cx="6" cy="6.65" r="0.9" fill="#fff" stroke="none" />
  </svg>
)

const TOOLS = [
  {
    id: 'content' as const,
    label: 'Course content extraction',
    description: 'Modules, pages, assignments, discussions → Blueprint-formatted HTML',
    icon: <CanvasIcon />,
    tileBg: '#EA4335',
  },
  {
    id: 'clean' as const,
    label: 'Clean course document',
    description: 'Course content without Blueprint markup → readable Google Doc',
    icon: <CleanIcon />,
    // A darker red than the content tile it is a variant of.
    tileBg: '#C5221F',
  },
  {
    id: 'quizzes' as const,
    label: 'Classic quiz extraction',
    description: 'All classic-quiz questions and answers, template-formatted HTML',
    icon: <QuizIcon />,
    tileBg: '#FBBC05',
  },
  {
    id: 'rubrics' as const,
    label: 'Rubric extraction',
    description: 'Every course rubric with criteria and rating levels, as a table',
    icon: <RubricIcon />,
    // Google Docs blue — this tool's output is a Google Doc, matching the other Docs-based
    // tiles' Google-brand-color scheme (red/yellow used above). Was green, which is Sheets'
    // color and belonged to the settings tool below instead.
    tileBg: '#4285F4',
  },
  {
    id: 'settings' as const,
    label: 'Settings tables extraction',
    description: 'Assignment, discussion, and quiz settings → Google Sheets template',
    icon: <SettingsIcon />,
    // Google Sheets green — this tool's output is a Google Sheet, freed up from Rubric
    // extraction above when that tile moved to Docs blue.
    tileBg: '#34A853',
  },
]

export function ToolPanel({ token, googleCheck, googleWho, googleReady, onOpenSetup }: Props) {
  const [courseUrl, setCourseUrl] = useState(DEFAULT_COURSE_URL)
  const inputRef = useRef<HTMLInputElement>(null)
  const [courseName, setCourseName] = useState<string | null>(null)
  // "RESPCARE 560" — prefixes the default save-dialog file name. Null when the course code
  // has no recognisable department + number, in which case the plain names are used.
  const [courseCode, setCourseCode] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  // Bumped by "Start again": it is part of each tile's key, so the tiles remount with
  // completely fresh state rather than relying on this file knowing what they hold.
  const [resetKey, setResetKey] = useState(0)

  // Each tile's latest status, so "Start again" can appear only when it is useful.
  const [toolStatus, setToolStatus] = useState<Record<string, string>>({})
  const handleStatusChange = useCallback((tool: string, status: string) => {
    setToolStatus((prev) => (prev[tool] === status ? prev : { ...prev, [tool]: status }))
  }, [])

  const anyRunning = Object.values(toolStatus).some((s) => s === 'running')
  const anyFinished = Object.values(toolStatus).some((s) => s === 'success' || s === 'error')
  // Hidden until an extraction has actually finished — there is nothing to start again from
  // before that — and hidden again while one is running, because resetting mid-run would
  // remount the tile and orphan a job that is still going.
  const showStartOver = anyFinished && !anyRunning

  const urlValid = COURSE_URL_RE.test(courseUrl.trim())

  // Any previous result is stale the moment the URL changes — clear it so a name
  // from a different course can never linger next to a new URL.
  useEffect(() => {
    setCourseName(null)
    setCourseCode(null)
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
   * Return every tool to the state it had at launch, for the common case of extracting one
   * course and then moving on to the next.
   *
   * This is a convenience, not the safeguard: each tile already discards its own selection
   * when the course URL changes. Without that, this button would be load-bearing, and an
   * extraction would silently come out wrong whenever someone forgot to press it.
   */
  const startOver = () => {
    setCourseUrl(DEFAULT_COURSE_URL)
    setCourseName(null)
    setCourseCode(null)
    setNameError(null)
    setToolStatus({})
    setResetKey((k) => k + 1)
  }

  const validateCourse = async (url = courseUrl) => {
    if (!COURSE_URL_RE.test(url.trim()) || validating) return
    setValidating(true)
    setCourseName(null)
    setCourseCode(null)
    setNameError(null)
    try {
      const res = await window.api.canvas.getCourseName({ courseUrl: url.trim(), token })
      if (res.ok && res.name) {
        setCourseName(res.name)
        setCourseCode(res.code ?? null)
      } else setNameError(res.message ?? 'Could not load this course.')
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
          {/* A real heading, so this card is a stop in heading navigation like the setup
              panel and the tiles. It was a <span>. */}
          <h2 className="font-black text-[15px] m-0">Canvas course</h2>
          {urlValid && courseName && (
            <CheckCircle2
              className="w-[17px] h-[17px] text-green-500 ml-auto flex-shrink-0"
              aria-hidden="true"
            />
          )}
        </div>
        <p className="text-[13px] text-gray-600 mb-2.5">
          Choose the course you want to extract. All the tools below use it.
        </p>
        <CoursePicker
          token={token}
          defaultSite={siteOf(courseUrl)}
          onChoose={(url) => {
            setCourseUrl(url)
            // The address change clears the name (effect below); look it up after that has run.
            setTimeout(() => void validateCourse(url), 0)
          }}
        />
        <div className="flex items-center gap-3 my-3 text-xs text-gray-600" aria-hidden="true">
          <span className="flex-1 border-t border-gray-200" />
          or paste a course address
          <span className="flex-1 border-t border-gray-200" />
        </div>
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
            aria-invalid={!!nameError || !!(courseUrl && !urlValid)}
            aria-describedby={
              [courseUrl && !urlValid ? 'course-url-hint' : null, nameError ? 'course-url-error' : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className="flex-1 min-w-0 border-2 border-gray-500 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#0033a0] focus:ring-2 focus:ring-blue-200 transition"
          />
          {/* aria-disabled, not disabled: pressing this made it disabled while `validating`,
              which blurs it to <body> in Chromium — so the user lost their place for the whole
              lookup. The reason it is unavailable when the URL is malformed lives in
              course-url-hint, which this now points at; before, that hint was tied only to the
              input and a keyboard user on this button had no way to reach it. */}
          <button
            onClick={() => {
              if (urlValid && !validating) void validateCourse()
            }}
            aria-disabled={!urlValid || validating}
            /* Condition matches the hint's own render condition exactly, so this never points
               at an element that is not there. */
            aria-describedby={courseUrl && !urlValid ? 'course-url-hint' : undefined}
            className={`flex-shrink-0 px-4 rounded-xl border-2 font-black text-sm transition flex items-center gap-1.5 ${
              !urlValid || validating
                ? 'border-gray-400 text-gray-600 cursor-not-allowed'
                : 'border-[#0033a0] text-[#0033a0] hover:bg-blue-50'
            }`}
          >
            {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {validating ? 'Checking…' : 'Validate'}
          </button>
        </div>
        {/* Guidance on the expected format, not a failure — the user has usually just not
            finished typing yet, so this stays neutral grey rather than error red. */}
        {courseUrl && !urlValid && (
          <p id="course-url-hint" className="text-xs text-gray-600 mt-1.5">
            Enter the full course URL, e.g. https://boisestatecanvas.instructure.com/courses/12345
          </p>
        )}
        {/* The looked-up course name arrives asynchronously, so announce it rather than
            letting it appear silently for anyone not watching the card. */}
        {/* Mounted unconditionally — a live region that appears with its text already in it
            is announced unreliably. Collapsed to sr-only rather than removed when empty. */}
        <div
          className={
            courseName || nameError
              ? 'mt-2.5 flex items-center gap-2 min-h-[1.25rem]'
              : 'sr-only'
          }
          role="status"
          aria-live="polite"
        >
          {courseName ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-black text-green-700">
                <span className="sr-only">Course found: </span>
                {courseName}
              </span>
            </>
          ) : nameError ? (
            <span id="course-url-error" className="text-xs text-red-700">
              <ErrorText message={nameError} />
              <ErrorDetails message={nameError} />
            </span>
          ) : null}
        </div>

        {/* Appears only once an extraction has finished. White on green-800 (#166534) measures
            6.6:1, comfortably past the 4.5:1 needed for normal text — green-600 and
            green-700 are both too light to carry white text at this size. */}
        {showStartOver && (
          <button
            onClick={startOver}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-green-800 hover:bg-green-900 px-3 py-2 text-[12.5px] font-black text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Start again with a new course
          </button>
        )}
      </div>

      <h2 className="text-[12px] text-gray-700 uppercase tracking-wide font-black px-1 pt-1">Extraction tools</h2>

      <GoogleStatusLine state={googleCheck} who={googleWho} onSignIn={onOpenSetup} />

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
            courseCode={courseCode}
            courseName={courseName}
            token={token}
            googleReady={googleReady}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  )
}
