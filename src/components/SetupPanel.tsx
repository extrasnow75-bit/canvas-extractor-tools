import React, { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, LogOut, SlidersHorizontal, ChevronDown, KeyRound, Shield } from 'lucide-react'
import type { GoogleStatus } from '../types'

interface Props {
  canvasToken: string | null
  onSaveToken(token: string): void
  onRemoveToken(): void
  googleStatus: GoogleStatus
  onGoogleSignIn(useAnotherAccount?: boolean): Promise<void>
  onGoogleSignOut(): void
  googleBusy: boolean
  googleError: string | null
  onOpenHelp(): void
}

/**
 * Google avatar with a graceful fallback. lh3.googleusercontent.com rejects requests
 * that carry an unexpected referrer (403), and accounts with no photo set can return a
 * URL that fails outright — so drop the referrer and fall back to initials on error.
 */
function Avatar({ picture, name, email }: { picture?: string; name?: string; email?: string }) {
  const [failed, setFailed] = useState(false)
  const initials = (name ?? email ?? '?').slice(0, 2).toUpperCase()

  if (!picture || failed) {
    return (
      <div className="w-9 h-9 rounded-full bg-[#0033a0] text-white flex items-center justify-center font-black text-xs flex-shrink-0">
        {initials}
      </div>
    )
  }

  return (
    <img
      src={picture}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-9 h-9 rounded-full border border-green-200 flex-shrink-0"
    />
  )
}

const GoogleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

export function SetupPanel({
  canvasToken,
  onSaveToken,
  onRemoveToken,
  googleStatus,
  onGoogleSignIn,
  onGoogleSignOut,
  googleBusy,
  googleError,
  onOpenHelp,
}: Props) {
  const tokenPresent = !!canvasToken
  // Open on launch unless setup is already done. App resolves the Google status before it
  // renders this, so the initial value is the real one and the panel does not flick shut.
  const [isOpen, setIsOpen] = useState(!(tokenPresent && googleStatus.signedIn))
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)

  // A saved token is not a working token: Canvas expires them on a schedule. Until this
  // resolves we say "saved" rather than claiming either way.
  const [tokenState, setTokenState] = useState<'checking' | 'valid' | 'expired' | 'unknown'>(
    'checking',
  )

  useEffect(() => {
    if (!canvasToken) {
      setTokenState('unknown')
      return
    }
    let cancelled = false
    setTokenState('checking')
    window.api.canvas
      .verifyToken({ token: canvasToken })
      // A rejection would leave this on 'checking' forever, which now also means the panel
      // never resolves its open/closed state and the header reads "Checking…" for good.
      .catch(() => 'unknown' as const)
      .then((state) => {
        if (!cancelled) setTokenState(state)
      })
    return () => {
      cancelled = true
    }
  }, [canvasToken])

  const tokenExpired = tokenPresent && tokenState === 'expired'

  /**
   * Setup is complete only when Canvas has confirmed the token *and* Google is signed in.
   *
   * "Valid" is deliberately stricter than "saved": `tokenState` is 'valid' only when Canvas
   * answered for it. A token that is merely present might be revoked, and a panel that
   * collapses on a dead credential hides the one place it can be replaced.
   */
  const tokenValid = tokenPresent && tokenState === 'valid'
  const setupComplete = tokenValid && googleStatus.signedIn

  /**
   * Nothing is decided while the token check is still in flight. Acting on 'checking' would
   * open the panel for the moment the request takes and then shut it again, which reads as
   * a glitch on every launch for a user whose setup is fine.
   */
  const tokenChecked = !tokenPresent || tokenState !== 'checking'

  const headerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Collapse when both items are done; open whenever they are not. Only fires when
  // completeness actually changes, so the header button still works as a manual toggle.
  //
  // Completing Google sign-in is what closes this, and the button that was pressed to start
  // it lives inside the part being unmounted — so focus has to be moved somewhere sensible
  // first. Chromium has usually already dropped it to <body> by then, because the button is
  // disabled while the sign-in is in flight; both cases are covered.
  useEffect(() => {
    if (!tokenChecked) return
    const focusWasInside =
      document.activeElement === document.body ||
      !!panelRef.current?.contains(document.activeElement)
    setIsOpen(!setupComplete)
    if (setupComplete && focusWasInside) headerRef.current?.focus()
  }, [tokenChecked, setupComplete])

  // Same reasoning for a dropped Google sign-in: the "Sign in with Google" button is in
  // here, so collapsing the panel would hide the only way to act on the error. App renders
  // the message itself, above this panel, where it is visible either way.
  useEffect(() => {
    if (googleError) setIsOpen(true)
  }, [googleError])

  // Removing the token unmounts the button that was focused, which would otherwise drop
  // focus to <body>. Send it to the field the user now has to fill.
  const tokenInputRef = useRef<HTMLInputElement>(null)
  const [returnFocusToInput, setReturnFocusToInput] = useState(false)
  useEffect(() => {
    if (returnFocusToInput && !tokenPresent) {
      tokenInputRef.current?.focus()
      setReturnFocusToInput(false)
    }
  }, [returnFocusToInput, tokenPresent])

  // Counts the same two things the collapse rule does, so the header can never read
  // "Complete" over a panel that has stayed open.
  const remaining = (tokenValid ? 0 : 1) + (googleStatus.signedIn ? 0 : 1)
  const statusText = tokenExpired
    ? 'Action needed'
    : !tokenChecked
      ? 'Checking…'
      : remaining === 0
        ? 'Complete'
        : `${remaining} required item${remaining === 1 ? '' : 's'}`

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      {/* Mounted always, so the announcement fires when the text arrives rather than
          depending on a region that appears already populated. */}
      <div role="alert" className="sr-only">
        {tokenExpired ? 'Canvas token expired. Initial setup needs attention.' : ''}
      </div>

      {/* The header's status text sits inside the button, so it is only ever read when that
          button has focus — which it does not after "Save token" unmounts itself. This says
          which item is outstanding rather than how many, since the count alone leaves a
          screen reader user to work out which of the two it means. */}
      <div role="status" aria-live="polite" className="sr-only">
        {!tokenChecked
          ? ''
          : setupComplete
            ? 'Initial setup complete.'
            : `Initial setup still needs ${[
                tokenValid ? null : 'a valid Canvas token',
                googleStatus.signedIn ? null : 'Google sign-in',
              ]
                .filter(Boolean)
                .join(' and ')}.`}
      </div>

      <button
        ref={headerRef}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="initial-setup-panel"
        className="w-full bg-[#0033a0] hover:bg-[#002d8f] text-white px-4 py-3.5 flex items-center gap-3 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
      >
        <SlidersHorizontal className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
        <span className="font-black text-[15px]">Initial setup</span>
        <div className="ml-auto flex items-center gap-3">
          {/* The dots carry state by colour alone, so each pairs with visually hidden text. */}
          <div className="flex items-center gap-1.5">
            {/* Green means confirmed by Canvas, matching the collapse rule — a token that is
                only saved stays neutral rather than claiming to be working. */}
            <span
              className={`w-2 h-2 rounded-full ${
                tokenExpired ? 'bg-amber-300' : tokenValid ? 'bg-green-400' : 'bg-white/70'
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">
              {/* "saved" alone contradicted the header, which counts an unverified token as
                  still outstanding — Canvas being unreachable is not the same as a token
                  that works. */}
              Canvas token{' '}
              {tokenExpired
                ? 'expired'
                : tokenValid
                  ? 'valid'
                  : tokenPresent
                    ? 'saved but not verified'
                    : 'not set'}
              .
            </span>
            <span
              className={`w-2 h-2 rounded-full ${googleStatus.signedIn ? 'bg-green-400' : 'bg-white/70'}`}
              aria-hidden="true"
            />
            {/* Matches what sighted users see: the "Optional" badge was removed from the card,
                so it should not be announced here either. */}
            <span className="sr-only">
              Google sign-in {googleStatus.signedIn ? 'complete' : 'not signed in'}.
            </span>
          </div>
          <span className="text-[11px] font-bold">{statusText}</span>
          <ChevronDown
            className={`w-[18px] h-[18px] transition-transform ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {isOpen && (
        <div ref={panelRef} id="initial-setup-panel" className="bg-white border border-gray-200 border-t-0 rounded-b-2xl p-3.5 space-y-3">
          {/* Canvas token */}
          <div className={`rounded-2xl border-2 p-4 ${tokenExpired ? 'border-amber-300 shadow-[0_0_0_3px_rgba(255,251,235,1)]' : tokenPresent ? 'border-green-200 shadow-[0_0_0_3px_rgba(240,253,244,1)]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-red-600 flex-shrink-0" aria-hidden="true" />
              <span className="font-black text-[15px]">
                Canvas API token <span className="text-red-700" aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </span>
            </div>

            {/* Says what the credential is for. Shown in both states — someone returning to
                this panel with a token already saved has the same question as a first-time
                user, and previously only the empty state explained anything. */}
            <p id="canvas-token-purpose" className="text-[13px] text-gray-600 mb-2.5">
              This allows the app to connect to Canvas.
            </p>

            {tokenPresent ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      tokenExpired
                        ? 'bg-amber-500'
                        : tokenState === 'valid'
                          ? 'bg-green-500'
                          : 'bg-gray-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-[13px] font-bold ${
                      tokenExpired ? 'text-amber-800' : tokenState === 'valid' ? 'text-green-700' : 'text-gray-700'
                    }`}
                  >
                    {tokenExpired
                      ? 'Token expired'
                      : tokenState === 'valid'
                        ? 'Token valid'
                        : tokenState === 'checking'
                          ? 'Checking token…'
                          : 'Token saved'}
                  </span>
                </div>

                {tokenExpired && (
                  <p className="text-xs text-amber-900 mb-2">
                    Canvas is no longer accepting this token. Generate a new one in Canvas under{' '}
                    <span className="font-bold">Account → Settings → New Access Token</span>, then
                    remove this one and paste the new one in.
                  </p>
                )}
                <p className="text-xs font-mono text-gray-600 mb-3 break-all">
                  <span className="sr-only">Saved token, partially hidden: </span>
                  {canvasToken.slice(0, 8)}··············{canvasToken.slice(-4)}
                </p>
                <button
                  onClick={() => {
                    setReturnFocusToInput(true)
                    onRemoveToken()
                  }}
                  className="w-full text-sm font-bold text-gray-700 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" /> Remove token
                </button>
              </div>
            ) : (
              <div>
                <p id="canvas-token-help" className="text-[13px] text-gray-600 mb-2.5">
                  Paste your Canvas token here. It's stored encrypted on this computer only.
                </p>
                <div className="relative mb-2.5">
                  <label htmlFor="canvas-token" className="sr-only">
                    Canvas API token
                  </label>
                  <input
                    id="canvas-token"
                    ref={tokenInputRef}
                    type={showToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste your Canvas API token"
                    autoComplete="off"
                    spellCheck={false}
                    aria-required="true"
                    aria-describedby="canvas-token-purpose canvas-token-help"
                    /* border-gray-500 rather than -200: the border is the only thing marking
                       this out as a field, and 1.4.11 wants 3:1 for that. */
                    className="w-full border-2 border-gray-500 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-[#0033a0] focus:ring-2 focus:ring-blue-200 transition"
                  />
                  {/* Previously tabIndex={-1}, which left keyboard-only users unable to check
                      what they had pasted into a masked field. */}
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    aria-pressed={showToken}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    {showToken ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (tokenInput.trim()) {
                      onSaveToken(tokenInput.trim())
                      setTokenInput('')
                    }
                  }}
                  disabled={!tokenInput.trim()}
                  /* An explicit disabled palette rather than opacity: opacity-40 over this
                     blue lands at 2.25:1, which is unreadable even as an inactive control. */
                  className="w-full py-2.5 bg-[#0033a0] text-white rounded-xl text-sm font-black hover:bg-[#002d8f] disabled:bg-gray-200 disabled:text-gray-700 transition"
                >
                  Save token
                </button>
                <button
                  onClick={onOpenHelp}
                  className="w-full mt-2 text-center text-[12.5px] font-bold text-blue-600 hover:underline"
                >
                  How do I get a Canvas token?
                </button>
              </div>
            )}
          </div>

          {/* Google sign-in */}
          <div className={`rounded-2xl border-2 p-4 ${googleStatus.signedIn ? 'border-green-200 shadow-[0_0_0_3px_rgba(240,253,244,1)]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <GoogleIcon />
              {/* Marked required to match the header count, which now waits on this card
                  before it reports setup complete. */}
              <span className="font-black text-[15px]">
                Google sign-in <span className="text-red-700" aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </span>
            </div>

            <p className="text-[13px] text-gray-600 mb-2.5">
              This allows the export files to open in your Google Drive.
            </p>

            {googleStatus.signedIn ? (
              <div>
              <div className="flex items-center gap-3">
                <Avatar
                  key={googleStatus.picture ?? 'no-picture'}
                  picture={googleStatus.picture}
                  name={googleStatus.name}
                  email={googleStatus.email}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate">{googleStatus.name ?? googleStatus.email}</p>
                  {googleStatus.email && <p className="text-xs text-gray-600 truncate">{googleStatus.email}</p>}
                </div>
                <button
                  onClick={onGoogleSignOut}
                  className="text-xs font-bold text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition flex-shrink-0"
                >
                  Sign out
                </button>
              </div>
              <button
                onClick={() => onGoogleSignIn(true)}
                disabled={googleBusy}
                className="mt-2.5 text-[12.5px] font-bold text-blue-600 hover:underline disabled:text-gray-600 disabled:no-underline"
              >
                {googleBusy ? 'Opening Google…' : 'Use a different account'}
              </button>
              </div>
            ) : (
              <div>
                {/* The purpose line above already says what signing in is for, so this keeps
                    only the part it does not cover. */}
                <p className="text-[13px] text-gray-600 mb-2.5">
                  The app can only see files it creates — never the rest of your Drive.
                </p>
                <button
                  onClick={() => onGoogleSignIn(false)}
                  disabled={googleBusy}
                  className="w-full flex items-center justify-center gap-2 border-2 border-blue-400 text-blue-600 rounded-xl py-2.5 font-black text-sm hover:bg-blue-50 disabled:text-gray-600 disabled:no-underline transition"
                >
                  {googleBusy ? 'Signing in…' : (<><GoogleIcon /> Sign in with Google</>)}
                </button>
                <button
                  onClick={() => onGoogleSignIn(true)}
                  disabled={googleBusy}
                  className="w-full mt-2 text-center text-[12.5px] font-bold text-blue-600 hover:underline disabled:text-gray-600 disabled:no-underline"
                >
                  Use a different account
                </button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-gray-600 px-1">
            <Shield className="w-[13px] h-[13px] mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>
              Tokens stored encrypted in your OS keychain — never written to disk in plain text. Google
              uses least-privilege access (files this app creates only).
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
