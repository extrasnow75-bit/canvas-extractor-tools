import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Square,
} from 'lucide-react'
import type { PickerItem, Tool } from '../types'
import { ErrorText, cleanErrorMessage } from './ErrorText'

interface Props {
  tool: Tool
  label: string
  description: string
  icon: React.ReactNode
  tileBg: string
  courseUrl: string
  /** "RESPCARE 560", or null when the course has no code of that shape. Prefixes saved files. */
  courseCode: string | null
  token: string
  /**
   * Reports this tile's status upward, so the panel can decide when to offer "Start again":
   * only once something has actually been extracted, and not while one is still going.
   */
  onStatusChange?(tool: Tool, status: Status): void
}

type Status = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

/** Module name → id fragment, so a group heading can be referenced by `aria-labelledby`. */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group'
}

/** "1:05" / "12s" — compact, for elapsed and remaining times. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const LOCAL_FILE_NAMES: Record<Tool, string> = {
  content: 'course_content_extraction.html',
  quizzes: 'quiz_questions.html',
  rubrics: 'course_rubrics.html',
}

/**
 * "RESPCARE_560_quiz_questions.html" — the course's department and number in front of the
 * plain name, so a folder of extractions from several courses can be told apart at a glance.
 *
 * Anything outside [A-Za-z0-9] becomes an underscore before it reaches the save dialog:
 * the label is derived from an institution-set course code, and a stray slash or colon in
 * it would be rejected by Windows or, worse, read as a path. Falls back to the plain name
 * when there is no code, and when sanitising leaves nothing behind.
 */
function localFileName(tool: Tool, courseCode: string | null): string {
  const base = LOCAL_FILE_NAMES[tool]
  if (!courseCode) return base
  const prefix = courseCode.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return prefix ? `${prefix}_${base}` : base
}

const LOCAL_HANDLERS: Record<
  Tool,
  (args: {
    courseUrl: string
    token: string
    savePath: string
    selectedIds?: string[]
    jobId?: string
  }) => Promise<{ ok: boolean; message: string; cancelled?: boolean }>
> = {
  content: (args) => window.api.canvas.exportContent(args),
  quizzes: (args) => window.api.canvas.exportQuizzes(args),
  rubrics: (args) => window.api.canvas.exportRubrics(args),
}

export function ToolTile({
  tool,
  label,
  description,
  icon,
  tileBg,
  courseUrl,
  courseCode,
  token,
  onStatusChange,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [webViewLink, setWebViewLink] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Publish status upward on every change, including the 'idle' a fresh mount starts from,
  // so the panel's view resets along with the tiles rather than drifting out of step.
  useEffect(() => {
    onStatusChange?.(tool, status)
  }, [tool, status, onStatusChange])

  // Tick the elapsed clock once a second while an extraction is running.
  useEffect(() => {
    if (startedAt === null) return
    setElapsed((Date.now() - startedAt) / 1000)
    const t = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  // Progress events are broadcast to the window, so ignore any not from this tile's job.
  useEffect(() => {
    if (!jobId) return
    return window.api.canvas.onExportProgress((data) => {
      if (data.jobId === jobId) setProgress({ done: data.done, total: data.total })
    })
  }, [jobId])

  // Estimate from measured throughput; needs a couple of completed items to be meaningful.
  const remaining =
    progress && progress.done >= 2 && progress.total > progress.done && elapsed > 0
      ? (elapsed / progress.done) * (progress.total - progress.done)
      : null

  const [pickerOpen, setPickerOpen] = useState(false)
  const [items, setItems] = useState<PickerItem[] | null>(null)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /**
   * A selection belongs to the course it was made in. Without this, picking items in one
   * course and then switching to another sent the first course's item ids as the filter for
   * the second: nothing matched, every module was skipped, and the extraction silently
   * produced a document containing only the home page and syllabus — which are emitted before
   * the module loop and so escape the filter. It looked like a working run, which is worse
   * than an error.
   *
   * Clearing `items` also matters on its own: `openPicker` returns early when items are
   * already loaded, so a stale list would otherwise be shown for the new course too.
   */
  useEffect(() => {
    setPickerOpen(false)
    setItems(null)
    setItemsError(null)
    setSelected(new Set())
  }, [courseUrl])

  // A finished extraction's result refers to the course it ran against, so it is stale too.
  // A running one is left alone: its progress and Stop button must survive an edit to
  // the URL field, and its own completion will overwrite this.
  useEffect(() => {
    setStatus((s) => (s === 'running' ? s : 'idle'))
  }, [courseUrl])

  const grouped = useMemo(() => {
    if (!items) return []
    const order: string[] = []
    const map = new Map<string, PickerItem[]>()
    for (const it of items) {
      const key = it.group ?? ''
      if (!map.has(key)) {
        order.push(key)
        map.set(key, [])
      }
      map.get(key)!.push(it)
    }
    return order.map((key) => ({ group: key || null, rows: map.get(key)! }))
  }, [items])

  async function openPicker() {
    if (pickerOpen) {
      setPickerOpen(false)
      return
    }
    setPickerOpen(true)
    if (items || loadingItems) return
    setLoadingItems(true)
    setItemsError(null)
    const res = await window.api.canvas.listItems({ tool, courseUrl, token })
    setLoadingItems(false)
    if (res.ok && res.items) {
      setItems(res.items)
      setSelected(new Set(res.items.map((i) => i.id)))
    } else {
      setItemsError(res.message ?? 'Could not load items.')
    }
  }

  function toggleAll() {
    if (!items) return
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runDriveExport(selectedIds?: string[]) {
    const id = crypto.randomUUID()
    setJobId(id)
    setStopping(false)
    setStartedAt(Date.now())
    setElapsed(0)
    setProgress(null)
    setStatus('running')
    setMessage('')
    setWebViewLink(null)
    try {
      const result = await window.api.canvas.exportToDrive({
        tool,
        courseUrl,
        token,
        selectedIds,
        jobId: id,
      })
      if (result.ok) {
        setStatus('success')
        setMessage(result.message)
        setWebViewLink(result.webViewLink ?? null)
        setPickerOpen(false)
      } else {
        // Cancelling used to drop straight back to 'idle', which reverted the UI with no
        // confirmation — indistinguishable from a crash, for everyone.
        setStatus(result.cancelled ? 'cancelled' : 'error')
        setMessage(result.cancelled ? '' : result.message)
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Extraction failed.')
    } finally {
      setJobId(null)
      setStopping(false)
      setStartedAt(null)
    }
  }

  async function stopExport() {
    if (!jobId) return
    setStopping(true)
    await window.api.canvas.cancelExport(jobId)
  }

  /**
   * Shown once before the first local save of a content extraction.
   *
   * The file is written for Google Docs, since that is where it is going — so the blue
   * due-header rules are absent, and someone comparing this against a Drive extraction needs
   * to know that before they spend minutes on it rather than after. Only the content
   * extraction has due headers, so quizzes and rubrics save straight away.
   */
  /** True only while the course code is being looked up to name the file; see runLocalSave. */
  const [preparingSave, setPreparingSave] = useState(false)
  const [localNoticeOpen, setLocalNoticeOpen] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const pendingLocalSave = useRef<string[] | undefined>(undefined)
  const noticeApplies = tool === 'content'

  // The notice appears below the button that was just pressed, so focus has to be moved into
  // it — otherwise it is silent to a screen reader and easy to miss with the keyboard.
  const noticeConfirmRef = useRef<HTMLButtonElement>(null)
  const localSaveRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (localNoticeOpen) noticeConfirmRef.current?.focus()
  }, [localNoticeOpen])

  /**
   * Dismissing put focus on <body>, because the element holding it unmounted with the notice.
   * Send it back where it came from — the button that opened this — which is both where the
   * user was and the thing they are most likely to press next.
   *
   * Confirming does not need the same treatment: it starts a run, and the status effect moves
   * focus to Stop.
   */
  function cancelLocalNotice() {
    setLocalNoticeOpen(false)
    localSaveRef.current?.focus()
  }

  async function requestLocalSave(selectedIds?: string[]) {
    if (!noticeApplies || (await window.api.app.getHideLocalSaveNotice().catch(() => false))) {
      return runLocalSave(selectedIds)
    }
    pendingLocalSave.current = selectedIds
    setDontAskAgain(false)
    setLocalNoticeOpen(true)
  }

  async function confirmLocalSave() {
    setLocalNoticeOpen(false)
    if (dontAskAgain) await window.api.app.setHideLocalSaveNotice(true).catch(() => undefined)
    await runLocalSave(pendingLocalSave.current)
  }

  /**
   * The code arrives with the course lookup, which is a button the user is free to skip —
   * so fetch it here when it is missing rather than letting the file name quietly lose its
   * prefix for anyone who pastes a URL and extracts straight away. One small request, and a
   * failure just means the plain name.
   */
  async function resolveCourseCode(): Promise<string | null> {
    if (courseCode) return courseCode
    const res = await window.api.canvas.getCourseName({ courseUrl, token }).catch(() => null)
    return res?.ok ? (res.code ?? null) : null
  }

  async function runLocalSave(selectedIds?: string[]) {
    // Naming the file can mean a Canvas round-trip when Validate was skipped, and until the
    // save dialog appears there is nothing on screen at all — on a slow link the button looked
    // like it had done nothing. Announced rather than shown: it is normally instant, and a
    // spinner that flashes for 40ms is worse than none.
    setPreparingSave(true)
    const defaultName = localFileName(tool, await resolveCourseCode())
    setPreparingSave(false)

    const savePath = await window.api.dialog.saveFile({
      defaultName,
      ext: 'html',
      label: 'HTML File',
    })
    if (!savePath) return

    const id = crypto.randomUUID()
    setJobId(id)
    setStopping(false)
    setStartedAt(Date.now())
    setElapsed(0)
    setProgress(null)
    setStatus('running')
    setMessage('')
    setWebViewLink(null)
    try {
      const result = await LOCAL_HANDLERS[tool]({ courseUrl, token, savePath, selectedIds, jobId: id })
      if (result.cancelled) {
        setStatus('cancelled')
        setMessage('')
      } else {
        setStatus(result.ok ? 'success' : 'error')
        setMessage(result.ok ? 'Saved a local copy.' : result.message)
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Extraction failed.')
    } finally {
      setJobId(null)
      setStopping(false)
      setStartedAt(null)
    }
  }

  const busy = status === 'running'

  /**
   * One permanently-mounted announcer per tile, rather than `role="status"` on the result
   * blocks. Those mount with their text already in place, which screen readers announce
   * unreliably; this element never moves and only its contents change. It also covers the
   * moments that had no announcement at all: starting, pressing Stop, and the run ending.
   *
   * The start message names the Stop button because focus has just been moved onto it —
   * hearing "Stop, button" with no explanation would otherwise be the first thing announced.
   *
   * Recomputed every second by the elapsed-time tick, but the string is identical each time,
   * so React leaves the text node alone and nothing is re-announced.
   */
  const announcement = preparingSave
    ? 'Preparing the file name…'
    : status === 'running'
      ? stopping
        ? `Stopping ${label}…`
        : `${label} started. Focus is on the Stop button.`
      : status === 'cancelled'
        ? `${label} stopped. Nothing was saved.`
        : status === 'success'
          ? `${label} done. ${message}`
          : status === 'error'
            ? // Announced as plain text, so it needs the same tidying the visible copy gets.
              `${label} failed. ${cleanErrorMessage(message)}`
            : ''

  /**
   * Both ends of a run replace the control the user was standing on, so focus has to be
   * placed deliberately at each.
   *
   * Starting: the button that was just pressed unmounts when `busy` swaps the whole block for
   * the progress pill, and focus falls to <body>. On a run that lasts minutes that means
   * tabbing the entire app to reach Stop. Send it to Stop, which is the only thing there is
   * to do next.
   *
   * Ending: Stop unmounts in its turn, so send focus to the result — where the outcome is.
   */
  const resultRef = useRef<HTMLDivElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const prevStatus = useRef<Status>('idle')
  useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = status
    if (status === 'running') {
      if (was !== 'running') stopRef.current?.focus()
    } else if (was === 'running') {
      resultRef.current?.focus()
    }
  }, [status])

  // Once the picker has loaded, the main button follows the selection: it extracts exactly
  // what is ticked. Without this the label could read "Extract all" while items were
  // deselected — and, worse, it would actually extract them.
  const hasSelection = items !== null
  const isSubset = hasSelection && selected.size < items.length
  const nothingSelected = hasSelection && selected.size === 0
  const selectionArgs = hasSelection ? Array.from(selected) : undefined
  const extractLabel = isSubset ? 'Extract selected to a Google Doc' : 'Extract all to a Google Doc'

  return (
    /* A section with its own heading, so each tile is a stop in heading navigation. The tile
       titles were <p> elements, which left the whole working area of the window invisible to
       the way screen-reader users actually move through a page: h1 in the title bar, one h2
       for "Extraction tools", and then nothing. */
    <section
      aria-labelledby={`${tool}-tile-heading`}
      className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0 text-white"
          style={{ background: tileBg }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 id={`${tool}-tile-heading`} className="font-black text-[14.5px] text-gray-900">
            {label}
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">{description}</p>
        </div>
        <span className="text-[10px] font-black tracking-wide px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
          GOOGLE DOC
        </span>
      </div>

      {busy ? (
        <>
          <div className="flex gap-2 mt-3.5">
            {/* #4f68a4 rather than #6b83b8: this sits on screen for the whole run, and
                the old value carried white 13px bold at 3.77:1. */}
            <div className="flex-1 rounded-xl bg-[#4f68a4] text-white font-black text-[13px] py-2.5 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {stopping ? 'Stopping…' : 'Extracting…'}
            </div>
            {/* aria-disabled, not disabled: this is the element focus was just moved to, and
                Chromium blurs a focused element the instant it becomes truly disabled — so
                pressing Stop would drop focus to <body>, which is the problem the focus move
                exists to solve. Staying focusable also lets it announce its own state. */}
            <button
              ref={stopRef}
              onClick={() => {
                if (!stopping) void stopExport()
              }}
              aria-disabled={stopping}
              className={`flex-shrink-0 px-4 rounded-xl border-2 font-black text-[13px] transition flex items-center gap-1.5 ${
                stopping
                  ? 'border-gray-400 text-gray-600 cursor-not-allowed'
                  : 'border-red-500 text-red-600 hover:bg-red-50'
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              Stop
            </button>
          </div>

          {/* Progress bar — only once a total is known.
              Deliberately a progressbar rather than an aria-live region: the count changes
              once per item, and announcing every change would talk over the user for the
              whole extraction. A progressbar is read on demand instead. Completion and failure
              below are what actually get announced. */}
          {progress && progress.total > 0 && (
            <div
              role="progressbar"
              aria-label={`${label} progress`}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-valuetext={`${progress.done} of ${progress.total} items`}
              className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-[#0033a0] transition-all duration-300"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-600 tabular-nums">
            <span>
              {progress && progress.total > 0
                ? `${progress.done} of ${progress.total} items`
                : 'Preparing…'}
            </span>
            <span>
              {formatDuration(elapsed)} elapsed
              {remaining !== null && ` · about ${formatDuration(remaining)} left`}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-[2px] mt-3.5">
            {/* aria-disabled rather than disabled. A `disabled` button is not focusable, so
                its `title` — which held the only explanation of how to recover — could never
                be read by keyboard or screen reader. This stays reachable and announces its
                own state, and the reason is rendered as real text below. */}
            <button
              onClick={() => {
                if (!nothingSelected) runDriveExport(selectionArgs)
              }}
              aria-disabled={nothingSelected}
              aria-describedby={nothingSelected ? `${tool}-nothing-selected` : undefined}
              className={`flex-1 rounded-l-xl font-black text-[13px] py-2.5 flex items-center justify-center gap-2 transition ${
                nothingSelected
                  ? 'bg-gray-200 text-gray-700 cursor-not-allowed'
                  : 'bg-[#0033a0] hover:bg-[#002d8f] text-white'
              }`}
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {nothingSelected ? 'Nothing selected' : extractLabel}
            </button>
            <button
              onClick={openPicker}
              aria-label="Choose specific items"
              aria-expanded={pickerOpen}
              aria-controls={`${tool}-item-picker`}
              className="rounded-r-xl bg-[#0033a0] hover:bg-[#002d8f] text-white px-3 border-l border-white/25 transition"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {nothingSelected && (
            <p id={`${tool}-nothing-selected`} className="text-xs text-gray-700 mt-2 text-center">
              Select at least one item below to extract.
            </p>
          )}

          {/* Both branches used to render text-gray-600 at the same weight, so the only
              unavailable cue was `cursor: not-allowed` — hover-only, and therefore invisible
              to touch and keyboard (1.4.1). The underline is what marks it as a control when
              it is live, and dropping the underline plus lightening to gray-500 is what marks
              it as unavailable; gray-500 is the permitted case for genuinely inactive UI. */}
          <button
            ref={localSaveRef}
            onClick={() => {
              if (!nothingSelected) void requestLocalSave(selectionArgs)
            }}
            aria-disabled={nothingSelected}
            aria-describedby={nothingSelected ? `${tool}-nothing-selected` : undefined}
            className={`w-full text-center text-xs font-bold mt-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0] ${
              nothingSelected
                ? 'text-gray-500 cursor-not-allowed'
                : 'text-gray-600 underline underline-offset-2 hover:text-gray-900'
            }`}
          >
            or save a local copy (.html)
          </button>

          {localNoticeOpen && (
            /* role="dialog" rather than "group", and aria-describedby pointing at the body
               text. Under "group" a screen reader announced the name and then "Save the file,
               button" — the two paragraphs that are the entire point of the notice were never
               spoken and had to be hunted for with a review cursor. Escape closes it, matching
               the Help Center drawer and ordinary expectation for something asking a
               question. */
            <div
              role="dialog"
              aria-labelledby={`${tool}-local-notice-heading`}
              aria-describedby={`${tool}-local-notice-body`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  cancelLocalNotice()
                }
              }}
              className="mt-2.5 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p
                    id={`${tool}-local-notice-heading`}
                    className="font-black text-[13px] text-gray-900"
                  >
                    Saving a local copy? One difference to expect
                  </p>
                  <div id={`${tool}-local-notice-body`}>
                    <p className="text-[12.5px] text-gray-700 mt-1">
                      A local file will not have the blue lines above and below each{' '}
                      <span className="font-bold">Due by</span> heading. Everything else — the
                      headings, the red tool labels, the colours — comes across as normal.
                    </p>
                    <p className="text-[12.5px] text-gray-700 mt-1.5">
                      To use it: upload the .html file to Google Drive, then right-click it and
                      choose <span className="font-bold">Open with → Google Docs</span>. There
                      are fuller instructions in the Help Center.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 mt-2.5 text-[12.5px] text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dontAskAgain}
                      onChange={(e) => setDontAskAgain(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#0033a0]"
                    />
                    Don&apos;t show this again
                  </label>

                  <div className="flex gap-2 mt-2.5">
                    <button
                      ref={noticeConfirmRef}
                      onClick={() => void confirmLocalSave()}
                      className="flex-1 py-2 rounded-lg bg-[#0033a0] hover:bg-[#002d8f] text-white font-black text-xs transition"
                    >
                      Save the file
                    </button>
                    <button
                      onClick={cancelLocalNotice}
                      className="flex-shrink-0 px-4 py-2 rounded-lg border border-gray-600 text-gray-800 font-bold text-xs hover:bg-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Kept mounted and hidden rather than unmounted, so the `aria-controls` on the caret
          button above always resolves to a real element. Same pattern, and same reason, as
          the collapsible sections in HelpCenter. */}
      <div
        id={`${tool}-item-picker`}
        hidden={!pickerOpen}
        className="mt-2.5 border border-gray-200 rounded-xl p-3 bg-white"
      >
        {/* Both of these are permanently mounted for the reason the tile announcer is: a
            live region that mounts with its text already in place is announced unreliably,
            so a failure to load the item list could go unannounced entirely. */}
        <p
          role="status"
          className={`text-xs text-gray-600 items-center gap-2 ${loadingItems ? 'flex' : 'sr-only'}`}
        >
          {loadingItems && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading…
            </>
          )}
        </p>
        <p role="alert" className={itemsError ? 'text-xs text-red-700' : 'sr-only'}>
          {itemsError}
        </p>
        {items && (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span
                id={`${tool}-picker-label`}
                className="text-[10px] font-black uppercase tracking-wide text-gray-600"
              >
                Choose items to extract
              </span>
              {/* Ticking a box, and above all "Toggle all", used to change nothing a screen
                  reader could hear — while silently flipping the primary button to
                  "Nothing selected". The count is the announcement, and it is worth having
                  on screen regardless. */}
              <span role="status" className="text-[11px] text-gray-600 tabular-nums ml-auto mr-2">
                {selected.size} of {items.length} selected
              </span>
              <button
                onClick={toggleAll}
                className="text-xs font-bold text-blue-600 underline hover:text-blue-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
              >
                Toggle all
              </button>
            </div>
            {/* role="group" ties the label above to the checkboxes; without it the label was
                merely adjacent text. Nested groups per module do the same for the module
                headings, which were plain <p> elements with nothing pointing at them — so a
                40-item list read as forty unrelated checkboxes with no module context. */}
            <div role="group" aria-labelledby={`${tool}-picker-label`} className="max-h-52 overflow-y-auto">
              {grouped.map(({ group, rows }) => (
                <div
                  key={group ?? '__flat__'}
                  role={group ? 'group' : undefined}
                  aria-labelledby={group ? `${tool}-grp-${slugify(group)}` : undefined}
                >
                  {group && (
                    <p
                      id={`${tool}-grp-${slugify(group)}`}
                      className="text-[10px] font-black uppercase tracking-wide text-gray-600 mt-2 mb-0.5 px-1"
                    >
                      {group}
                    </p>
                  )}
                  {rows.map((row) => (
                    <label
                      key={row.id}
                      className="flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-gray-50 text-[13px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        className="w-3.5 h-3.5 accent-[#0033a0]"
                      />
                      <span className="truncate">{row.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {/* aria-disabled, matching the primary button above it. This one had real
                `disabled`, so with nothing ticked it left the tab order entirely — directly
                beneath the checkboxes the user had just cleared — and carried no pointer to
                the explanation of why. */}
            <button
              onClick={() => {
                if (!busy && selected.size > 0) runDriveExport(Array.from(selected))
              }}
              aria-disabled={busy || selected.size === 0}
              aria-describedby={!busy && selected.size === 0 ? `${tool}-nothing-selected` : undefined}
              className={`w-full mt-2.5 py-2 rounded-lg font-black text-xs transition ${
                busy || selected.size === 0
                  ? 'bg-gray-200 text-gray-700 cursor-not-allowed'
                  : 'bg-[#0033a0] hover:bg-[#002d8f] text-white'
              }`}
            >
              Extract selected to a Google Doc
            </button>
          </>
        )}
      </div>

      {/* The tile's announcer. Never unmounts; only its text changes. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Focus lands here when an extraction ends, so the result is where the user already is. */}
      {/* Not keyboard-reachable, so 2.4.7 does not strictly apply — but focus lands here when
          a run ends, and `focus:outline-none` alone meant a sighted keyboard user watched the
          caret vanish with nothing on screen saying where it went. A ring on the result block
          answers that. */}
      <div
        ref={resultRef}
        tabIndex={-1}
        className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0] focus-visible:ring-offset-2"
      >
      {status === 'cancelled' && (
        <div className="mt-2.5 flex items-start gap-2.5 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[12.5px] text-gray-800">
          <Square className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600" aria-hidden="true" />
          <div>
            <p className="font-black">{label} stopped</p>
            <p className="text-gray-700 mt-0.5">Nothing was saved.</p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div
          className="mt-2.5 flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-xl text-[12.5px] text-green-800"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" aria-hidden="true" />
          <div className="flex-1">
            {/* `label` already ends in "extraction" ("Course content extraction"), so no extra noun. */}
            <p className="font-black">{label} done</p>
            <p className="text-gray-700 mt-0.5">{message}</p>
            {webViewLink && (
              <button
                onClick={() => window.open(webViewLink, '_blank')}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open again
              </button>
            )}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-2.5 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-[12.5px] text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="font-black">{label} failed</p>
            <p className="text-gray-700 mt-0.5">
              <ErrorText message={message} />
            </p>
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
