import React, { useEffect, useMemo, useState } from 'react'
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

interface Props {
  tool: Tool
  label: string
  description: string
  icon: React.ReactNode
  tileBg: string
  courseUrl: string
  token: string
}

type Status = 'idle' | 'running' | 'success' | 'error'

/** "1:05" / "12s" — compact, for elapsed and remaining times. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const LOCAL_FILE_NAMES: Record<Tool, string> = {
  content: 'course_content_export.html',
  quizzes: 'quiz_questions.html',
  rubrics: 'course_rubrics.html',
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

export function ToolTile({ tool, label, description, icon, tileBg, courseUrl, token }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [webViewLink, setWebViewLink] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Tick the elapsed clock once a second while an export is running.
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
   * the second: nothing matched, every module was skipped, and the export silently produced
   * a document containing only the home page and syllabus — which are emitted before the
   * module loop and so escape the filter. It looked like a working export, which is worse
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

  // A finished export's result refers to the course it ran against, so it is stale too.
  // A running export is left alone: its progress and Stop button must survive an edit to
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
        setStatus(result.cancelled ? 'idle' : 'error')
        setMessage(result.cancelled ? '' : result.message)
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Export failed.')
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

  async function runLocalSave(selectedIds?: string[]) {
    const savePath = await window.api.dialog.saveFile({
      defaultName: LOCAL_FILE_NAMES[tool],
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
        setStatus('idle')
        setMessage('')
      } else {
        setStatus(result.ok ? 'success' : 'error')
        setMessage(result.ok ? 'Saved a local copy.' : result.message)
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setJobId(null)
      setStopping(false)
      setStartedAt(null)
    }
  }

  const busy = status === 'running'

  // Once the picker has loaded, the main button follows the selection: it exports exactly
  // what is ticked. Without this the label could read "Export all" while items were
  // deselected — and, worse, it would actually export them.
  const hasSelection = items !== null
  const isSubset = hasSelection && selected.size < items.length
  const nothingSelected = hasSelection && selected.size === 0
  const selectionArgs = hasSelection ? Array.from(selected) : undefined
  const exportLabel = isSubset ? 'Export selected as a Google Doc' : 'Export all as a Google Doc'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-300 hover:shadow-sm transition">
      <div className="flex items-center gap-3">
        <div
          className="w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0 text-white"
          style={{ background: tileBg }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-[14.5px] text-gray-900">{label}</p>
          <p className="text-xs text-gray-600 mt-0.5">{description}</p>
        </div>
        <span className="text-[10px] font-black tracking-wide px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
          GOOGLE DOC
        </span>
      </div>

      {busy ? (
        <>
          <div className="flex gap-2 mt-3.5">
            <div className="flex-1 rounded-xl bg-[#6b83b8] text-white font-black text-[13px] py-2.5 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {stopping ? 'Stopping…' : 'Exporting…'}
            </div>
            <button
              onClick={stopExport}
              disabled={stopping}
              className="flex-shrink-0 px-4 rounded-xl border-2 border-red-500 text-red-600 font-black text-[13px] hover:bg-red-50 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          </div>

          {/* Progress bar — only once a total is known.
              Deliberately a progressbar rather than an aria-live region: the count changes
              once per item, and announcing every change would talk over the user for the
              whole export. A progressbar is read on demand instead. Completion and failure
              below are what actually get announced. */}
          {progress && progress.total > 0 && (
            <div
              role="progressbar"
              aria-label={`${label} export progress`}
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
            <button
              onClick={() => runDriveExport(selectionArgs)}
              disabled={nothingSelected}
              title={nothingSelected ? 'Select at least one item to export' : undefined}
              className="flex-1 rounded-l-xl bg-[#0033a0] hover:bg-[#002d8f] disabled:opacity-40 disabled:hover:bg-[#0033a0] text-white font-black text-[13px] py-2.5 flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {nothingSelected ? 'Nothing selected' : exportLabel}
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

          <button
            onClick={() => runLocalSave(selectionArgs)}
            disabled={nothingSelected}
            className="w-full text-center text-xs font-bold text-gray-600 hover:text-gray-900 mt-2 disabled:opacity-50"
          >
            or save a local copy (.html)
          </button>
        </>
      )}

      {pickerOpen && (
        <div id={`${tool}-item-picker`} className="mt-2.5 border border-gray-200 rounded-xl p-3 bg-white">
          {loadingItems && (
            <p className="text-xs text-gray-600 flex items-center gap-2" role="status">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading…
            </p>
          )}
          {itemsError && <p role="alert" className="text-xs text-red-700">{itemsError}</p>}
          {items && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-gray-600">
                  Choose items to export
                </span>
                <button onClick={toggleAll} className="text-xs font-bold text-blue-600 hover:underline">
                  Toggle all
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {grouped.map(({ group, rows }) => (
                  <div key={group ?? '__flat__'}>
                    {group && (
                      <p className="text-[10px] font-black uppercase tracking-wide text-gray-600 mt-2 mb-0.5 px-1">
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
              <button
                onClick={() => runDriveExport(Array.from(selected))}
                disabled={busy || selected.size === 0}
                className="w-full mt-2.5 py-2 rounded-lg bg-[#0033a0] hover:bg-[#002d8f] disabled:opacity-40 text-white font-black text-xs transition"
              >
                Export selected as a Google Doc
              </button>
            </>
          )}
        </div>
      )}

      {/* An export runs for minutes, so its outcome must be announced — a sighted user sees
          this block appear, a screen reader user otherwise gets nothing at all. */}
      {status === 'success' && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2.5 flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-xl text-[12.5px] text-green-800"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" aria-hidden="true" />
          <div className="flex-1">
            {/* `label` already ends in "export" ("Course content export"), so no extra noun. */}
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

      {/* role="alert" rather than status: a failure should interrupt, not queue politely. */}
      {status === 'error' && (
        <div
          role="alert"
          className="mt-2.5 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-[12.5px] text-red-800"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="font-black">{label} failed</p>
            <p className="text-gray-700 mt-0.5">{message}</p>
          </div>
        </div>
      )}
    </div>
  )
}
