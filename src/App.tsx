import React, { useCallback, useEffect, useRef, useState } from 'react'
import { HelpCircle, AlertCircle } from 'lucide-react'
import { SetupPanel } from './components/SetupPanel'
import { ToolPanel } from './components/ToolPanel'
import { HelpCenter } from './components/HelpCenter'
import { UpdateBanner } from './components/UpdateBanner'
import { ZoomControl } from './components/ZoomControl'
import { cleanErrorMessage } from './components/ErrorText'
import type { GoogleStatus } from './types'

export default function App() {
  const [canvasToken, setCanvasToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * Stable identity on purpose. HelpCenter's focus-trap effect depends on this callback, and
   * its cleanup returns focus to the button that opened the drawer. Passed inline, it was a
   * new function on every App render, so the effect tore down and re-ran — and focus jumped
   * out of the drawer — every time unrelated state landed. The update check resolving a
   * second or two after launch was enough to do it, which is exactly when someone is likely
   * to have the drawer open.
   */
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ signedIn: false })
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  /**
   * The user was asked whether to work without Drive and said yes.
   *
   * Deliberately not persisted: it is a decision about this session's work, and asking once
   * per launch is a light enough nudge that someone who meant to sign in gets another
   * chance without being nagged mid-extraction.
   */
  const [skippedGoogle, setSkippedGoogle] = useState(false)

  const [appVersion, setAppVersion] = useState('')
  const [update, setUpdate] = useState<{ version: string } | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  useEffect(() => {
    // Both resolved before the first render of SetupPanel: it decides whether to open
    // itself from the pair, and learning about the Google sign-in a beat later would make
    // an already-configured user watch the panel open and then shut again. The status call
    // is defended so a failure there cannot strand the app on "Loading…".
    Promise.all([
      window.api.credentials.load().catch(() => ({}) as { canvasToken?: string }),
      window.api.google.status().catch(() => ({ signedIn: false }) as GoogleStatus),
    ])
      .then(([raw, status]) => {
        setCanvasToken(raw.canvasToken ?? null)
        setGoogleStatus(status)
      })
      // Whatever happens, the loading screen has to end — it has no way out of itself.
      .finally(() => setLoading(false))

    // Both resolve quietly when offline; a failed update check must never block startup or
    // surface an error, so nothing here rejects into the UI.
    window.api.app.version().then(setAppVersion)
    window.api.app.checkUpdate().then(setUpdate)

    // A stored Google sign-in can die between launches — Google expires refresh tokens
    // after seven days while the OAuth consent screen is in Testing. When that surfaces
    // mid-extraction, stop showing the user as signed in.
    return window.api.google.onSignedOut(() => {
      setGoogleStatus({ signedIn: false })
      // No "please sign in again" here — the banner below already says where to do that,
      // and carrying it in both halves made the sentence say it twice.
      setGoogleError('Your Google sign-in has expired.')
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
      // Same Electron IPC wrapper as the extraction errors — strip it before it is shown.
      setGoogleError(err instanceof Error ? cleanErrorMessage(err.message) : 'Google sign-in failed.')
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

        {/* Ribbon. A labelled <nav>, not a bare <div>: the zoom buttons and the Help Center
            are app-wide controls, and outside a landmark they belonged to nothing and were
            skipped entirely by landmark navigation. */}
        <nav
          aria-label="App controls"
          className="flex items-center justify-between px-4 h-11 bg-white border-b border-gray-200 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs text-gray-600 truncate">
            Extract Canvas course content, quizzes, and rubrics
          </span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ZoomControl />
            {/* border-gray-500, matching ZoomControl beside it: the border is what marks this
                out as a control, and 1.4.11 wants 3:1 for that. gray-200 measured 1.24:1. */}
            <button
              ref={helpButtonRef}
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-500 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
            >
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" /> Help Center &amp; More
            </button>
          </div>
        </nav>

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
            collapses itself once setup is complete — the normal state. The message rendered
            there could never be seen: not by a screen reader, and not by anyone else
            either. */}
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
              skippedGoogle={skippedGoogle}
              onSkipGoogle={() => setSkippedGoogle(true)}
              onOpenHelp={() => setHelpOpen(true)}
            />
          </div>

          {/* Held back until the Google question has an answer. Revealing the extraction tools
              the moment a token was saved is what pulled attention past the sign-in card —
              the panel stayed open, but nobody was looking at it any more. */}
          {canvasToken && (googleStatus.signedIn || skippedGoogle) && (
            <ToolPanel token={canvasToken} />
          )}
        </main>
      </div>

      <HelpCenter
        isOpen={helpOpen}
        onClose={closeHelp}
        returnFocusTo={helpButtonRef}
        appVersion={appVersion}
      />
    </div>
  )
}
