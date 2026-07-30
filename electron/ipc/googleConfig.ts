/**
 * Google OAuth configuration for the Canvas Extractor Tools desktop app.
 *
 * The client ID is a PUBLIC identifier — the PKCE desktop-app flow (RFC 8252) uses no
 * client secret, so it is safe to commit. To create it:
 *   1. Google Cloud Console → APIs & Services → Enable the "Google Drive API".
 *   2. OAuth consent screen → External → add your ~14 users as Test users
 *      (or publish the app). Scopes: .../auth/drive.file, openid, email, profile.
 *   3. Credentials → Create OAuth client ID → Application type: "Desktop app".
 *   4. Paste the client ID below (or set the GOOGLE_CLIENT_ID env var for local dev).
 */
export const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ??
  '535784275591-aqligu9lugvh2fe9rhi4jo7js74a7ajn.apps.googleusercontent.com'

/**
 * Google requires a client_secret on the token exchange even for "Desktop app"
 * clients using PKCE. Google's own docs note it is not a true secret in this
 * context (it ships inside the installed app), but it must be sent.
 *
 * It is deliberately NOT hardcoded here: this repo is public, and GitHub secret
 * scanning auto-reports Google client secrets, after which Google revokes them.
 * Provide it locally instead, via either:
 *   - a `.env.local` file in the project root:  MAIN_VITE_GOOGLE_CLIENT_SECRET=GOCSPX-...
 *   - or a GOOGLE_CLIENT_SECRET environment variable
 * `.env.local` is already covered by .gitignore (`*.local`).
 *
 * For packaged release builds, inject it at build time from a CI secret rather
 * than committing it.
 */
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env

export const GOOGLE_CLIENT_SECRET: string =
  viteEnv?.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? ''

export function isGoogleSecretConfigured(): boolean {
  return GOOGLE_CLIENT_SECRET.length > 0
}

/** Least-privilege: drive.file = only files this app creates. Plus identity for the UI. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
  'profile',
].join(' ')

export function isGoogleConfigured(): boolean {
  return !GOOGLE_CLIENT_ID.startsWith('REPLACE_WITH')
}
