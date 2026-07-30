import React from 'react'
import { X, ShieldCheck } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose(): void
}

const PlaceholderLink: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl">
    <span className="text-sm font-bold text-gray-500">{label}</span>
    <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide">Coming soon</span>
  </div>
)

export function HelpCenter({ isOpen, onClose }: Props) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } overflow-y-auto`}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Help Center</h2>
            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">eCampus</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Canvas setup */}
          <section>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Canvas setup</h3>
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
              <p className="text-xs text-gray-500">
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
          </section>

          {/* Resources & Training */}
          <section>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Resources &amp; training</h3>
            <div className="space-y-3">
              <PlaceholderLink label="Selected training documents" />
            </div>
          </section>

          {/* App Suggestions */}
          <section className="pt-8 border-t border-gray-100">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
              Find bugs? Have improvement requests?
            </h3>
            <PlaceholderLink label="App Suggestions document" />
          </section>

          {/* Security & privacy */}
          <section className="pt-4">
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
              <p className="text-sm font-black text-gray-900 flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-gray-500 shrink-0" />
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
        </div>
      </aside>
    </>
  )
}
