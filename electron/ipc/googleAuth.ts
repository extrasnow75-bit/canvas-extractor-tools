import { app, shell, safeStorage, BrowserWindow } from 'electron'
import { createServer } from 'http'
import { createHash, randomBytes } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_SCOPES,
  isGoogleConfigured,
  isGoogleSecretConfigured,
} from './googleConfig'
import {
  GoogleCheck,
  MSG_KEYCHAIN,
  MSG_NOT_SET_UP,
  notSetUpMessage,
  MSG_NOT_SIGNED_IN,
  MSG_NO_REFRESH_TOKEN,
  MSG_SIGN_IN_EXPIRED,
  MSG_SIGN_IN_TIMEOUT,
  MSG_STATE_MISMATCH,
  MSG_UNREACHABLE,
  classifyRefreshFailure,
  googleApiMessage,
  signInCancelledMessage,
  tokenExchangeMessage,
} from './googleMessages'

const TOKEN_PATH = join(app.getPath('userData'), 'google-tokens.enc')
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

interface StoredTokens {
  refreshToken: string
  accessToken: string
  expiry: number // epoch ms
  email?: string
  name?: string
  picture?: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

export interface GoogleStatus {
  signedIn: boolean
  email?: string
  name?: string
  picture?: string
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function loadTokens(): StoredTokens | null {
  if (!existsSync(TOKEN_PATH) || !safeStorage.isEncryptionAvailable()) return null
  try {
    const raw = readFileSync(TOKEN_PATH)
    if (raw.length === 0) return null
    return JSON.parse(safeStorage.decryptString(raw)) as StoredTokens
  } catch {
    return null
  }
}

function saveTokens(t: StoredTokens): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(MSG_KEYCHAIN)
  writeFileSync(TOKEN_PATH, safeStorage.encryptString(JSON.stringify(t)))
}

export function clearTokens(): void {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, Buffer.alloc(0))
}

/**
 * Tells the UI the stored sign-in is gone, so the setup panel stops showing a signed-in user
 * whose credentials no longer work. Without this the renderer only learns the truth on the
 * next relaunch, having shown a name and email the whole time.
 */
function notifySignedOut(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('google:signedOut')
  }
}

/** Decode the JWT id_token payload for the user's email/name/picture (display only). */
function decodeIdToken(idToken?: string): { email?: string; name?: string; picture?: string } {
  if (!idToken) return {}
  try {
    const payload = idToken.split('.')[1]
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const p = JSON.parse(json) as { email?: string; name?: string; picture?: string }
    return { email: p.email, name: p.name, picture: p.picture }
  } catch {
    return {}
  }
}

export function getStatus(): GoogleStatus {
  const t = loadTokens()
  if (!t?.refreshToken) return { signedIn: false }
  return { signedIn: true, email: t.email, name: t.name, picture: t.picture }
}

/**
 * The page the browser lands on once Google redirects back to the loopback listener.
 *
 * It asks the tab to close itself. Browsers only honour `window.close()` for windows a
 * script opened, and this tab was opened by the OS handing a URL to the browser — so on
 * Chrome and Firefox the call is ignored and nothing happens. It costs nothing to try, it
 * does work in some browsers and configurations, and the visible text falls back to the
 * close-it-yourself wording a moment later so the page never sits there claiming it is
 * about to disappear.
 *
 * `focusAppWindow()` below is the part that reliably fixes the underlying annoyance: the
 * app pulls itself back to the front rather than waiting behind the browser.
 */
const COMPLETION_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Canvas Extractor Tools</title>' +
  '<body style="font-family:sans-serif;text-align:center;padding-top:60px">' +
  '<h2>Canvas Extractor Tools</h2>' +
  '<p id="msg">Sign-in complete — returning you to the app…</p>' +
  '<script>' +
  'function bye(){try{window.close()}catch(e){}}' +
  'bye();' +
  'setTimeout(function(){bye();' +
  "document.getElementById('msg').textContent=" +
  "'Sign-in complete — you can close this tab and return to the app.'},1200);" +
  '</script></body>'

/**
 * Bring the app forward once the browser hands sign-in back. Without it the user is left
 * looking at a browser tab and has to hunt for the window they started in.
 */
function focusAppWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Interactive sign-in via the system browser + PKCE + a short-lived loopback listener.
 * The listener runs only for the duration of the auth window, then shuts down.
 */
export async function signIn(options?: { useAnotherAccount?: boolean }): Promise<GoogleStatus> {
  // Both mean this copy of the app was built without Google sign-in. That is not something the
  // person can fix, so they are told what still works rather than how to configure a build.
  if (!isGoogleConfigured()) throw new Error(notSetUpMessage('client ID'))
  if (!isGoogleSecretConfigured()) throw new Error(notSetUpMessage('client secret'))

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      let redirectUri = ''
      let settled = false
      const finish = (fn: () => void): void => {
        if (!settled) {
          settled = true
          fn()
        }
      }

      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', redirectUri || 'http://127.0.0.1')
        const returnedCode = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        const returnedState = url.searchParams.get('state')

        if (!returnedCode && !error) {
          res.writeHead(204)
          res.end()
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(COMPLETION_PAGE)
        server.close()
        focusAppWindow()

        // The state check comes first: a request that cannot prove it belongs to this sign-in must
        // not be able to put its own error text in front of the person.
        if (returnedState !== state) {
          return finish(() => reject(new Error(MSG_STATE_MISMATCH)))
        }
        if (error) return finish(() => reject(new Error(signInCancelledMessage(error))))
        finish(() => resolve({ code: returnedCode!, redirectUri }))
      })

      // Close on the error path too. A server that failed while listening can still hold the
      // socket, and this was the one exit that left it open — every other path closes.
      server.on('error', (e) =>
        finish(() => {
          try {
            server.close()
          } catch {
            /* never started, or already closed */
          }
          reject(e)
        }),
      )

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        redirectUri = `http://127.0.0.1:${port}`
        const authUrl =
          `${AUTH_ENDPOINT}?` +
          new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: GOOGLE_SCOPES,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            access_type: 'offline',
            // `select_account` asks for the account chooser; `consent` is what guarantees
            // a refresh_token. Note that when the browser has exactly one signed-in
            // Google session, Google may satisfy `select_account` by auto-selecting it —
            // which is why the "Use a different account" path below exists.
            prompt: 'select_account consent',
          }).toString()

        // "Use a different account": route through Google's AddSession screen, which
        // presents the "Email or phone" form and then continues into the OAuth flow.
        // Needed because the app cannot clear the system browser's Google cookie —
        // signing out here leaves the browser session intact, so a plain auth URL can
        // land straight on consent for an account the user did not want.
        const target = options?.useAnotherAccount
          ? 'https://accounts.google.com/AddSession?' +
            new URLSearchParams({ continue: authUrl, service: 'lso' }).toString()
          : authUrl

        void shell.openExternal(target)
      })

      // Safety timeout: close the listener if the user never completes sign-in.
      setTimeout(
        () =>
          finish(() => {
            try {
              server.close()
            } catch {
              /* already closed */
            }
            reject(new Error(MSG_SIGN_IN_TIMEOUT))
          }),
        180_000,
      )
    },
  )

  // Exchange the authorization code for tokens (PKCE — no client secret).
  let tokenRes: Response
  try {
    tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    })
  } catch {
    throw new Error(MSG_UNREACHABLE)
  }
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    throw new Error(tokenExchangeMessage(tokenRes.status, detail))
  }

  const data = (await tokenRes.json()) as TokenResponse
  if (!data.refresh_token) {
    throw new Error(MSG_NO_REFRESH_TOKEN)
  }
  const profile = decodeIdToken(data.id_token)
  const tokens: StoredTokens = {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    ...profile,
  }
  saveTokens(tokens)
  return { signedIn: true, email: tokens.email, name: tokens.name, picture: tokens.picture }
}

/**
 * Thrown when the stored Google sign-in is gone or no longer accepted. A distinct type so that
 * "sign in again" is never confused with "Google was briefly unavailable", which is a different
 * problem needing a different answer.
 */
export class SignInRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInRequiredError'
  }
}

/** Return a valid access token, refreshing it if it has expired (or is about to). */
export async function getAccessToken(): Promise<string> {
  const t = loadTokens()
  if (!t?.refreshToken) throw new SignInRequiredError(MSG_NOT_SIGNED_IN)
  if (t.accessToken && Date.now() < t.expiry - 60_000) return t.accessToken

  let res: Response
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: t.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })
  } catch {
    // No connection says nothing about the sign-in, so it is left alone.
    throw new Error(MSG_UNREACHABLE)
  }
  if (!res.ok) {
    // 400 invalid_grant means the refresh token is dead, not that the network hiccuped:
    // revoked, the password changed, or the seven-day expiry Google applies to apps still in
    // Testing. Only that ends the sign-in. Anything else (Google busy, a 5xx) is Google's
    // trouble, and signing people out for it would make them repeat the whole sign-in.
    //
    // Dead tokens are dropped. Leaving them on disk is what made this confusing: getStatus()
    // only checks that a token exists, so the panel kept showing the user signed in while
    // every Drive call failed.
    if (classifyRefreshFailure(res.status) === 'expired') {
      clearTokens()
      notifySignedOut()
      throw new SignInRequiredError(MSG_SIGN_IN_EXPIRED)
    }
    throw new Error(googleApiMessage('Google sign-in', 'checking your Google sign-in', res.status, await res.text().catch(() => '')))
  }

  const data = (await res.json()) as TokenResponse
  const updated: StoredTokens = {
    ...t,
    accessToken: data.access_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  saveTokens(updated)
  return updated.accessToken
}

/**
 * Whether the stored sign-in actually works, which getStatus() does not say: it only reports
 * that something is stored. 'none' means nothing is stored, 'expired' that Google refused it
 * (and it has been cleared), and 'unknown' that Google could not be asked, so the sign-in is
 * neither confirmed nor ruled out.
 */
export async function verifySignIn(): Promise<GoogleCheck> {
  if (!loadTokens()?.refreshToken) return 'none'
  try {
    await getAccessToken()
    return 'valid'
  } catch (err) {
    return err instanceof SignInRequiredError ? 'expired' : 'unknown'
  }
}
