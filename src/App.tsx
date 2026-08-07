import React, { useEffect, useRef, useState } from 'react'
import { HelpCircle, AlertCircle } from 'lucide-react'
import { SetupPanel } from './components/SetupPanel'
import { ToolPanel } from './components/ToolPanel'
import { HelpCenter } from './components/HelpCenter'
import { UpdateBanner } from './components/UpdateBanner'
import type { GoogleStatus } from './types'

export default function App() {
  const [canvasToken, setCanvasToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)

  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ signedIn: false })
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const [appVersion, setAppVersion] = useState('')
  const [update, setUpdate] = useState<{ version: string } | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  useEffect(() => {
    window.api.credentials.load().then((raw) => {
      setCanvasToken(raw.canvasToken ?? null)
      setLoading(false)
    })
    window.api.google.status().then(setGoogleStatus)

    // Both resolve quietly when offline; a failed update check must never block startup or
    // surface an error, so nothing here rejects into the UI.
    window.api.app.version().then(setAppVersion)
    window.api.app.checkUpdate().then(setUpdate)

    // A stored Google sign-in can die between launches — Google expires refresh tokens
    // after seven days while the OAuth consent screen is in Testing. When that surfaces
    // mid-export, stop showing the user as signed in.
    return window.api.google.onSignedOut(() => {
      setGoogleStatus({ signedIn: false })
      setGoogleError('Your Google sign-in expired. Please sign in again.')
    })
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
      {/* Everything except the Help drawer, so the drawer can mark it inert while open. */}
      <div id="app-shell" className="flex flex-col flex-1 min-h-0">
        {/* Draggable title bar */}
        <header
          className="flex items-center justify-between px-4 bg-[#0033a0] text-white flex-shrink-0"
          style={{ height: 36, WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h1 className="text-sm font-black tracking-wide">Canvas Extractor Tools</h1>
        </header>

        {/* Ribbon */}
        <div
          className="flex items-center justify-between px-4 h-11 bg-white border-b border-gray-200 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs text-gray-600">
            Export Canvas course content, quizzes, and rubrics
          </span>
          <button
            ref={helpButtonRef}
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" /> Help Center &amp; More
          </button>
        </div>

        {/* Announcers, mounted for the life of the app. A live region that enters the DOM
            already holding its text is announced unreliably across screen readers, so these
            stay put and only their contents change. */}
        <div role="status" aria-live="polite" className="sr-only">
          {update && !updateDismissed ? `Version ${update.version} is available.` : ''}
        </div>

        {update && !updateDismissed && (
          <UpdateBanner
            version={update.version}
            currentVersion={appVersion}
            onDismiss={() => setUpdateDismissed(true)}
          />
        )}

        {/* A dropped Google sign-in is reported here rather than inside SetupPanel, which
            collapses itself as soon as a working Canvas token exists — the normal state. The
            message rendered there could never be seen: not by a screen reader, and not by
            anyone else either. */}
        <div role="alert" className={googleError ? 'px-6 pt-3' : 'sr-only'}>
          {googleError && (
            <div className="max-w-2xl mx-auto flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-[12.5px] text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-700" aria-hidden="true" />
              <p>
                {googleError} Open <span className="font-bold">Initial setup</span> below to sign
                in again.
              </p>
            </div>
          )}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
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
        </main>
      </div>

      <HelpCenter
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        returnFocusTo={helpButtonRef}
      />
    </div>
  )
}
