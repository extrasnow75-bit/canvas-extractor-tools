import React, { useCallback, useEffect, useRef, useState } from 'react'
import { HelpCircle, AlertCircle } from 'lucide-react'
import { SetupPanel } from './components/SetupPanel'
import { ToolPanel } from './components/ToolPanel'
import { HelpCenter } from './components/HelpCenter'
import { UpdateBanner } from './components/UpdateBanner'
import { ZoomControl } from './components/ZoomControl'
import { ErrorText, ErrorDetails, cleanErrorMessage } from './components/ErrorText'
import type { GoogleCheckState, GoogleStatus } from './types'
import { googleReady, googleSignedIn } from './components/googleView'

/**
 * Read once at module scope: the platform cannot change while the app is running.
 * Optional-chained so that loading the renderer without the preload bridge attached — opening
 * the dev server straight in a browser — degrades to the Windows layout instead of throwing
 * before the app can render at all.
 */
const isMac = window.api?.app?.platform === 'darwin'

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
  /**
   * What a check of the stored sign-in found. getStatus only says a sign-in is stored, and a
   * stored one can be long dead (Google ends them, a password changes), so a name is shown only
   * once this has come back 'valid'.
   */
  const [googleCheck, setGoogleCheck] = useState<GoogleCheckState>('none')
  /** Counts sign-in attempts, so a slow check cannot overwrite the result of a newer sign-in. */
  const googleEpoch = useRef(0)
  /** Asks the setup panel to open and take focus, from the line above the tools. */
  const [setupOpenRequest, setSetupOpenRequest] = useState(0)
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
        if (!status.signedIn) return
        // A sign-in is stored; whether it still works is a separate question.
        setGoogleCheck('checking')
        const epoch = ++googleEpoch.current
        // Started from a resolved promise so that even an immediate failure is caught here and
        // leaves the sign-in "could not be checked" rather than escaping unhandled.
        Promise.resolve()
          .then(() => window.api.google.verify())
          .catch(() => 'unknown' as const)
          .then((result) => {
            if (epoch === googleEpoch.current) setGoogleCheck(result)
          })
      })
      // Whatever happens, the loading screen has to end — it has no way out of itself.
      .finally(() => setLoading(false))

    // Both resolve quietly when offline; a failed update check must never block startup or
    // surface an error, so nothing here rejects into the UI.
    window.api.app.version().then(setAppVersion)
    window.api.app.checkUpdate().then(setUpdate)

    // A stored Google sign-in can die between launches — the person may remove the app in
    // their Google Account, or Google may revoke a token that has gone unused. When that
    // surfaces mid-extraction, stop showing the user as signed in.
    return window.api.google.onSignedOut(() => {
      googleEpoch.current++
      setGoogleCheck('expired')
      setGoogleStatus({ signedIn: false })
      // Said in full here, because the banner shows each message exactly as written: every message
      // carries its own advice, and a sentence added after them said the wrong thing for some.
      setGoogleError(
        'Your Google sign-in has expired. Open Initial setup below and choose Sign in with Google, ' +
          'or save files to your computer instead.',
      )
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
      googleEpoch.current++
      setGoogleStatus(status)
      setGoogleCheck('valid')
    } catch (err) {
      // Same Electron IPC wrapper as the extraction errors — strip it before it is shown.
      setGoogleError(err instanceof Error ? cleanErrorMessage(err.message) : 'Google sign-in failed.')
    } finally {
      setGoogleBusy(false)
    }
  }

  const googleSignOut = async () => {
    await window.api.google.signOut()
    googleEpoch.current++
    setGoogleStatus({ signedIn: false })
    setGoogleCheck('none')
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
        {/* Draggable title bar.
            On macOS the window keeps its traffic-light buttons, which sit at the left of this
            same strip (positioned in main.ts) — so the title is pushed clear of them there.
            Windows draws its caption buttons on the right, where nothing collides. */}
        <header
          className={`flex items-center justify-between pr-4 bg-[#0033a0] text-white flex-shrink-0 ${
            isMac ? 'pl-20' : 'pl-4'
          }`}
          style={{ height: 36, WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h1 className="text-sm font-black tracking-wide">Canvas Extractor Tools</h1>
        </header>

        {/* Ribbon. A labelled <nav>, not a bare <div>: the zoom buttons and the Help Center
            are app-wide controls, and outside a landmark they belonged to nothing and were
            skipped entirely by landmark navigation. */}
        <nav
          aria-label="App controls"
          className="flex items-center justify-between gap-4 px-4 min-h-11 py-1.5 bg-white border-b border-gray-200 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs text-gray-600">
            Extract Canvas course content, quizzes, rubrics, and settings
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
              <div className="min-w-0">
                <p>
                  <ErrorText message={googleError} />
                </p>
                <ErrorDetails message={googleError} />
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        {/* relative: hidden text for screen readers is positioned absolutely, and without a positioned
            parent it escaped this scroll area and made the whole window scroll too (two scroll bars). */}
        <main className="flex-1 overflow-auto relative">
          <div className="max-w-2xl mx-auto pt-4 px-6">
            <SetupPanel
              canvasToken={canvasToken}
              onSaveToken={saveToken}
              onRemoveToken={removeToken}
              googleStatus={googleStatus}
              googleCheck={googleCheck}
              openRequest={setupOpenRequest}
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
          {canvasToken && (googleSignedIn(googleCheck) || googleCheck === 'checking' || skippedGoogle) && (
            <ToolPanel
              token={canvasToken}
              googleCheck={googleCheck}
              googleWho={googleStatus.email ?? googleStatus.name ?? null}
              googleReady={googleReady(googleCheck)}
              onOpenSetup={() => setSetupOpenRequest((n) => n + 1)}
            />
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
