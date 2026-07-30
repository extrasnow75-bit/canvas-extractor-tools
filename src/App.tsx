import React, { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { SetupPanel } from './components/SetupPanel'
import { ToolPanel } from './components/ToolPanel'
import { HelpCenter } from './components/HelpCenter'
import type { GoogleStatus } from './types'

export default function App() {
  const [canvasToken, setCanvasToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ signedIn: false })
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  useEffect(() => {
    window.api.credentials.load().then((raw) => {
      setCanvasToken(raw.canvasToken ?? null)
      setLoading(false)
    })
    window.api.google.status().then(setGoogleStatus)
  }, [])

  const saveToken = async (token: string) => {
    await window.api.credentials.save({ canvasToken: token })
    setCanvasToken(token)
  }

  const removeToken = async () => {
    await window.api.credentials.clear()
    setCanvasToken(null)
  }

  const googleSignIn = async (useAnotherAccount = false) => {
    setGoogleBusy(true)
    setGoogleError(null)
    try {
      const status = await window.api.google.signIn({ useAnotherAccount })
      setGoogleStatus(status)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in failed.')
    } finally {
      setGoogleBusy(false)
    }
  }

  const googleSignOut = async () => {
    await window.api.google.signOut()
    setGoogleStatus({ signedIn: false })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <p className="text-gray-600 text-sm" role="status">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Draggable title bar */}
      <div
        className="flex items-center justify-between px-4 bg-[#0033a0] text-white flex-shrink-0"
        style={{ height: 36, WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-black tracking-wide">Canvas Extractor Tools</span>
      </div>

      {/* Ribbon */}
      <div
        className="flex items-center justify-between px-4 h-11 bg-white border-b border-gray-200 flex-shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-xs text-gray-600">
          Export Canvas course content, quizzes, and rubrics
        </span>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
        >
          <HelpCircle className="w-3.5 h-3.5" /> Help Center &amp; More
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto pt-4 px-6">
          <SetupPanel
            canvasToken={canvasToken}
            onSaveToken={saveToken}
            onRemoveToken={removeToken}
            googleStatus={googleStatus}
            onGoogleSignIn={googleSignIn}
            onGoogleSignOut={googleSignOut}
            googleBusy={googleBusy}
            googleError={googleError}
            onOpenHelp={() => setHelpOpen(true)}
          />
        </div>

        {canvasToken && <ToolPanel token={canvasToken} />}
      </div>

      <HelpCenter isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
