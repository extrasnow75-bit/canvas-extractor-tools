import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

/**
 * Text-size control for the ribbon.
 *
 * Electron's zoom level is logarithmic (factor = 1.2 ** level), so the percentage shown is
 * derived rather than stored — it is what the user actually perceives, and "125%" means more
 * to them than "level 1".
 *
 * The buttons exist because the keyboard shortcuts are invisible: the window has no menu bar,
 * so there is nothing to discover Ctrl+= from. Both routes drive the same main-process state
 * and this control follows along via onZoomChanged, so the readout stays correct no matter
 * which one the user reaches for.
 */
export function ZoomControl() {
  const [level, setLevel] = useState(0)
  const [range, setRange] = useState({ min: -2, max: 5 })

  useEffect(() => {
    window.api.app.getZoom().then(({ level, min, max }) => {
      setLevel(level)
      setRange({ min, max })
    })
    return window.api.app.onZoomChanged(setLevel)
  }, [])

  const percent = Math.round(1.2 ** level * 100)
  const atMin = level <= range.min
  const atMax = level >= range.max

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-600 mr-0.5">Text size</span>

      <button
        onClick={() => void window.api.app.stepZoom(-1)}
        disabled={atMin}
        aria-label="Decrease text size"
        className="rounded-lg border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
      >
        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {/* Doubles as the reset control — clicking the percentage returns it to 100%. */}
      <button
        onClick={() => void window.api.app.resetZoom()}
        aria-label={`Text size ${percent} percent. Reset to 100 percent.`}
        className="min-w-[3.25rem] rounded-lg border border-gray-300 px-1.5 py-1 text-xs font-bold tabular-nums text-gray-700 hover:bg-gray-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
      >
        {percent}%
      </button>

      <button
        onClick={() => void window.api.app.stepZoom(1)}
        disabled={atMax}
        aria-label="Increase text size"
        className="rounded-lg border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {/* The percentage button is announced on focus, but a change made with Ctrl+= while
          focus is elsewhere would otherwise be silent. */}
      <span role="status" aria-live="polite" className="sr-only">
        Text size {percent} percent
      </span>
    </div>
  )
}
