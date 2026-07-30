import React, { useEffect, useState } from 'react'
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
  <svg width="17" height="17" viewBox="0 0 24 24">
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
  const tokenValid = !!canvasToken
  const [isOpen, setIsOpen] = useState(!tokenValid)
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)

  // Auto-collapse once the required item (Canvas token) is set.
  useEffect(() => {
    if (tokenValid) setIsOpen(false)
  }, [tokenValid])

  const statusText = tokenValid ? 'Complete' : '1 required item'

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full bg-[#0033a0] hover:bg-[#002d8f] text-white px-4 py-3.5 flex items-center gap-3 transition-colors text-left"
      >
        <SlidersHorizontal className="w-[18px] h-[18px] flex-shrink-0" />
        <span className="font-black text-[15px]">Initial setup</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              title="Canvas token"
              className={`w-2 h-2 rounded-full ${tokenValid ? 'bg-green-400' : 'bg-white/30'}`}
            />
            <span
              title="Google sign-in (optional)"
              className={`w-2 h-2 rounded-full ${googleStatus.signedIn ? 'bg-green-400' : 'bg-white/30'}`}
            />
          </div>
          <span className="text-[11px] font-bold">{statusText}</span>
          <ChevronDown className={`w-[18px] h-[18px] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-2xl p-3.5 space-y-3">
          {/* Canvas token */}
          <div className={`rounded-2xl border-2 p-4 ${tokenValid ? 'border-green-200 shadow-[0_0_0_3px_rgba(240,253,244,1)]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="font-black text-[15px]">
                Canvas API token <span className="text-red-500">*</span>
              </span>
            </div>

            {tokenValid ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[13px] font-bold text-green-700">Token saved</span>
                </div>
                <p className="text-xs font-mono text-gray-400 mb-3 break-all">
                  {canvasToken.slice(0, 8)}··············{canvasToken.slice(-4)}
                </p>
                <button
                  onClick={onRemoveToken}
                  className="w-full text-sm font-bold text-gray-600 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Remove token
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[13px] text-gray-600 mb-2.5">
                  Paste your Canvas token here. It's stored encrypted on this computer only.
                </p>
                <div className="relative mb-2.5">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste your Canvas API token"
                    className="w-full border-2 border-gray-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-red-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  className="w-full py-2.5 bg-[#0033a0] text-white rounded-xl text-sm font-black hover:bg-[#002d8f] disabled:opacity-40 transition"
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

          {/* Google sign-in (optional) */}
          <div className={`rounded-2xl border-2 p-4 ${googleStatus.signedIn ? 'border-green-200 shadow-[0_0_0_3px_rgba(240,253,244,1)]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <GoogleIcon />
              <span className="font-black text-[15px]">Google sign-in</span>
              <span className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Optional
              </span>
            </div>

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
                  {googleStatus.email && <p className="text-xs text-gray-500 truncate">{googleStatus.email}</p>}
                </div>
                <button
                  onClick={onGoogleSignOut}
                  className="text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition flex-shrink-0"
                >
                  Sign out
                </button>
              </div>
              <button
                onClick={() => onGoogleSignIn(true)}
                disabled={googleBusy}
                className="mt-2.5 text-[12.5px] font-bold text-blue-600 hover:underline disabled:opacity-50"
              >
                {googleBusy ? 'Opening Google…' : 'Use a different account'}
              </button>
              {googleError && <p className="text-xs text-red-600 mt-2">{googleError}</p>}
              </div>
            ) : (
              <div>
                <p className="text-[13px] text-gray-600 mb-2.5">
                  Sign in to open your exports directly in Google Drive as Google Docs. The app can only
                  see files it creates — never the rest of your Drive.
                </p>
                <button
                  onClick={() => onGoogleSignIn(false)}
                  disabled={googleBusy}
                  className="w-full flex items-center justify-center gap-2 border-2 border-blue-400 text-blue-600 rounded-xl py-2.5 font-black text-sm hover:bg-blue-50 disabled:opacity-50 transition"
                >
                  {googleBusy ? 'Signing in…' : (<><GoogleIcon /> Sign in with Google</>)}
                </button>
                <button
                  onClick={() => onGoogleSignIn(true)}
                  disabled={googleBusy}
                  className="w-full mt-2 text-center text-[12.5px] font-bold text-blue-600 hover:underline disabled:opacity-50"
                >
                  Use a different account
                </button>
                {googleError && <p className="text-xs text-red-600 mt-2">{googleError}</p>}
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-gray-400 px-1">
            <Shield className="w-[13px] h-[13px] mt-0.5 flex-shrink-0" />
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
