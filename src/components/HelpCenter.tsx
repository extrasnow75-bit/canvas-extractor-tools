import React, { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, ExternalLink, RefreshCw } from 'lucide-react'
import type { ManualCheckResult } from '../types'

interface Props {
  isOpen: boolean
  onClose(): void
  /** Control to hand focus back to on close — normally the button that opened the drawer. */
  returnFocusTo?: React.RefObject<HTMLElement>
  /** Shown at the foot of the drawer, so a user reporting a bug can say which build. */
  appVersion?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A link out to a Google Doc. Opens in the user's real browser rather than in the app:
 * the window's setWindowOpenHandler denies the navigation and hands the URL to
 * openExternalSafely, which only permits http(s).
 */
const ResourceLink: React.FC<{ label: string; href: string }> = ({ label, href }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center justify-between gap-3 p-4 bg-gray-50 border border-gray-200 rounded-2xl hover:bg-gray-100 hover:border-gray-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
  >
    <span className="text-sm font-bold text-gray-700">{label}</span>
    <ExternalLink className="w-4 h-4 text-gray-600 flex-shrink-0" aria-hidden="true" />
    <span className="sr-only">(opens in your browser)</span>
  </a>
)

export function HelpCenter({ isOpen, onClose, returnFocusTo, appVersion }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<ManualCheckResult | null>(null)

  async function runCheck() {
    setChecking(true)
    setCheckResult(null)
    try {
      setCheckResult(await window.api.app.checkUpdateNow())
    } catch {
      // checkNow resolves rather than rejects for network trouble, so reaching here means
      // something unexpected — report it the same way, since the user's next step is identical.
      setCheckResult({ state: 'check-failed', current: appVersion ?? '' })
    } finally {
      setChecking(false)
    }
  }

  /**
   * The panel stays mounted so it can slide in and out, which means that when it is closed
   * its buttons and links are still in the tab order — keyboard users would tab off the end
   * of the page into an invisible drawer. `inert` removes the whole subtree from focus and
   * from assistive tech without disturbing the transition.
   */
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    if (isOpen) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [isOpen])

  /**
   * The rest of the app is marked inert while the drawer is open. `aria-modal="true"` already
   * tells assistive tech that everything outside is unavailable; without a matching change to
   * real focus, the AT's virtual cursor and the focus ring end up in different places, and
   * Tab from the last link walks straight out into content the user was told is hidden.
   */
  useEffect(() => {
    const shell = document.getElementById('app-shell')
    if (!shell) return
    if (isOpen) shell.setAttribute('inert', '')
    else shell.removeAttribute('inert')
    return () => shell.removeAttribute('inert')
  }, [isOpen])

  // Move focus into the panel when it opens, keep Tab inside it, let Escape close it, and
  // hand focus back to whatever opened it — otherwise closing drops focus to <body>.
  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocusTo?.current?.focus()
    }
  }, [isOpen, onClose, returnFocusTo])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help Center"
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } overflow-y-auto`}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Help Center</h2>
            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
              Canvas Extractor Tools
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close Help Center"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600 hover:text-gray-900"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Canvas setup */}
          <section>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-3">Canvas setup</h3>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-3">
              <p className="text-sm font-black text-gray-900">How to generate a Canvas access token</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Log into Canvas.</li>
                <li>Go to <span className="font-bold">Account → Settings</span>.</li>
                <li>Scroll to <span className="font-bold">Approved Integrations</span>.</li>
                <li>Click <span className="font-bold">+ New Access Token</span>.</li>
                <li>Give it a name (and an expiry), then click <span className="font-bold">Generate Token</span>.</li>
                <li>Copy the token and paste it into the app.</li>
              </ol>
              <p className="text-xs text-gray-600">
                Source:{' '}
                <a
                  href="https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  How do I manage API access tokens in my user account?
                </a>
              </p>
            </div>

            <div className="mt-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-2">
              <p className="text-sm font-black text-gray-900">How to find your course URL</p>
              <p className="text-sm text-gray-600">
                Navigate to your Canvas course, then copy the URL from your browser's address
                bar. It should look like:
              </p>
              <p className="text-xs font-mono text-gray-700 break-all bg-white border border-gray-200 rounded-lg px-2.5 py-2">
                https://yourschool.instructure.com/courses/12345
              </p>
            </div>
          </section>

          {/* Quiz extraction */}
          <section>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-3">
              Quiz extraction
            </h3>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-3">
              <div>
                <p className="text-sm font-black text-gray-900 mb-2">Supported question types</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                  <li>Multiple Choice</li>
                  <li>Multiple Answer (select all that apply)</li>
                  <li>True / False</li>
                  <li>Essay</li>
                  <li>Short Answer</li>
                  <li>Fill in Multiple Blanks</li>
                  <li>Matching</li>
                  <li>Numerical</li>
                </ul>
                <p className="text-sm text-gray-600 mt-2">
                  All other question types are skipped, and a note at the end of each quiz says
                  how many were left out.
                </p>
              </div>

              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm font-black text-gray-900 mb-1">New Quizzes</p>
                <p className="text-sm text-gray-600">
                  Quizzes built with Canvas's New Quizzes engine cannot be extracted — Canvas
                  provides no public API for their question content. These quizzes still appear
                  in the document, flagged as unsupported, so nothing goes missing without
                  saying so.
                </p>
              </div>
            </div>
          </section>

          {/* Resources & Training */}
          <section>
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-4">Resources &amp; training</h3>

            <h4 className="text-sm font-black text-gray-900 mb-2">Resources</h4>
            <div className="space-y-3">
              <ResourceLink
                label="Canvas Extractor Tools KB Article"
                href="https://docs.google.com/document/d/1h9eFqxroCyIkHov5Dk4jmISU0qg33p5sOMUW6zaReOI/edit?tab=t.dt1zwyxe9p6f#heading=h.3ilum53tbdk5"
              />
            </div>

            <h4 className="text-sm font-black text-gray-900 mt-5 mb-2">Training</h4>
            <div className="space-y-3">
              <ResourceLink
                label="Rubric Example Point Ranges (MS Word version)"
                href="https://docs.google.com/document/d/1YAs6TdSfRIpRXyKyQWSFc-VtgZ39gbYgnWdVtHZBDT4/edit?tab=t.0#heading=h.4v5p1vp9zrcz"
              />
              <ResourceLink
                label="Template Blueprint 5.0"
                href="https://docs.google.com/document/d/1FONxZaZr2HEIM3sc7GNBcLtsB6U-KtCVJ5S2K3uiEtE/edit?usp=drivesdk"
              />
              <ResourceLink
                label="Quiz Questions Extraction Template"
                href="https://docs.google.com/document/d/1zm9yRGtg4u9C3ddOVX7iNGrGp8gxDCrj9rbFY4GUtDM/edit?tab=t.0#heading=h.qet84pprm5t9"
              />
              <ResourceLink
                label="Required Formatting for Quiz Questions"
                href="https://docs.google.com/document/d/1SrLp9OKCKJJm86jJEFGnClhvS86MI6qp1YqhI1jHA4M/edit?usp=drivesdk"
              />
            </div>
          </section>

          {/* App Suggestions */}
          <section className="pt-8 border-t border-gray-100">
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-4">
              Find bugs? Have improvement requests?
            </h3>
            <ResourceLink
              label="Canvas Extractor Tools: App Suggestions Document"
              href="https://docs.google.com/document/d/1-ib0yAB_88SBk2aWnOflGNH8OFe3LQefaHYJSKjea0E/edit?tab=t.0#heading=h.bz7nzkw7vn22"
            />
          </section>

          {/* AI use */}
          <section className="pt-4">
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-3">
              Google Gemini &amp; AI use
            </h3>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-2">
              <p className="text-sm font-black text-gray-900">This app does not use AI.</p>
              <p className="text-sm text-gray-600">
                No part of your course content is sent to Gemini, ChatGPT, or any other AI
                service. Nothing is analysed, summarised, or generated by a model. The app reads
                your course through Canvas's own API and rewrites it into Blueprint formatting
                with ordinary code — the same output every time, for the same course.
              </p>
              <p className="text-sm text-gray-600">
                It is written in <span className="font-bold">TypeScript</span> and runs on
                Electron, the same engine behind apps like Slack and VS Code. (A small
                <span className="font-bold"> Python</span> script generates the app icon during
                development; it is not part of the installed app.)
              </p>
            </div>
          </section>

          {/* Security & privacy */}
          <section className="pt-4">
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
              <p className="text-sm font-black text-gray-900 flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-gray-600 shrink-0" aria-hidden="true" />
                Security &amp; privacy
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-bold text-gray-700">Canvas token</span> — stored encrypted in your
                  OS keychain, on this computer only. Used solely to call Canvas over HTTPS; never sent
                  anywhere else.
                </li>
                <li>
                  <span className="font-bold text-gray-700">Google access</span> — least-privilege: the app
                  can only see files it creates, never the rest of your Drive.
                </li>
                <li>
                  <span className="font-bold text-gray-700">Set an expiry</span> on your Canvas token when
                  you generate it, so a lost token can't live forever.
                </li>
                <li>
                  <span className="font-bold text-gray-700">Revoke anytime</span> in Canvas → Account →
                  Settings → Approved Integrations. "Remove token" in the app clears the local copy.
                </li>
              </ul>
            </div>
          </section>

          {/* Updates */}
          <section className="pt-4">
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-[0.2em] mb-3">
              Updates
            </h3>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-2">
              <p className="text-sm text-gray-600">
                The app checks for a newer version each time it starts, and shows a bar at the
                top of the window if one exists. Updates are never installed automatically — you
                download and run them yourself.
              </p>
              {/* The automatic check goes quiet when it cannot reach GitHub — a blocked
                  network, a rate limit, no connection. That looks exactly like being up to
                  date, so there needs to be a way to go and see for yourself. */}
              <p className="text-sm text-gray-600">
                If your network blocks GitHub the check cannot run, and no bar appears — which
                looks the same as being up to date. To be sure, check the releases page.
              </p>
              <div className="flex flex-col items-start gap-2 pt-1">
                <button
                  onClick={runCheck}
                  disabled={checking}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0033a0] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#002d8f] disabled:bg-gray-200 disabled:text-gray-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0] focus-visible:ring-offset-1"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {checking ? 'Checking…' : 'Check for updates'}
                </button>

                <button
                  onClick={() => void window.api.app.openReleases()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0]"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  View all versions on GitHub
                  <span className="sr-only">(opens in your browser)</span>
                </button>
              </div>

              {/* Mounted always so the result is announced when it arrives, rather than the
                  region appearing with its text already in place. */}
              <div role="status" aria-live="polite" className={checkResult ? 'pt-1' : 'sr-only'}>
                {checkResult?.state === 'up-to-date' && (
                  <p className="text-sm font-bold text-green-800">
                    You're up to date — v{checkResult.current} is the latest version.
                  </p>
                )}
                {checkResult?.state === 'update-available' && (
                  <p className="text-sm font-bold text-blue-900">
                    Version {checkResult.latest} is available. You're running v
                    {checkResult.current} — use the button below to download it.
                  </p>
                )}
                {checkResult?.state === 'check-failed' && (
                  <p className="text-sm font-bold text-amber-900">
                    Couldn't reach GitHub, so this could not be checked. You may be on the
                    latest version or you may not — try again, or check the releases page.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Build identity. Worth having somewhere a user can read it out: the first useful
              question about any bug report is which version it came from. */}
          <section className="pt-2 pb-2 text-center">
            <p className="text-xs text-gray-600">
              Canvas Extractor Tools{' '}
              <span className="font-bold tabular-nums">
                {appVersion ? `v${appVersion}` : 'version unavailable'}
              </span>
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">Boise State University eCampus Center</p>
          </section>
        </div>
      </aside>
    </>
  )
}
