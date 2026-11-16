import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MSG_NOT_SIGNED_IN, MSG_SIGN_IN_EXPIRED } from './googleMessages'

// googleAuth keeps its tokens in a file under the app's data folder, encrypted by the operating
// system. Both are replaced here: a temporary folder, and "encryption" that is a plain copy.
const dir = mkdtempSync(join(tmpdir(), 'google-auth-'))
process.env.GOOGLE_AUTH_TEST_DIR = dir
const sent = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: () => process.env.GOOGLE_AUTH_TEST_DIR },
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: (...a: unknown[]) => sent(...a) } }] },
}))

const TOKEN_FILE = join(dir, 'google-tokens.enc')
let auth: typeof import('./googleAuth')

beforeAll(async () => {
  auth = await import('./googleAuth')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  sent.mockClear()
  rmSync(TOKEN_FILE, { force: true })
})

function store(over: Record<string, unknown> = {}) {
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ refreshToken: 'refresh', accessToken: 'access', expiry: Date.now() - 1000, email: 'a@b.edu', ...over }),
  )
}

/** Stand-in for Google's token server. */
function google(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const stored = () => (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8') : '')

describe('verifySignIn', () => {
  it('says none when nothing is stored', async () => {
    expect(await auth.verifySignIn()).toBe('none')
  })

  it('says none when the stored sign-in was cleared', async () => {
    writeFileSync(TOKEN_FILE, Buffer.alloc(0))
    expect(await auth.verifySignIn()).toBe('none')
  })

  it('says valid without asking Google while the access is still fresh', async () => {
    store({ expiry: Date.now() + 30 * 60_000 })
    const fetchMock = google(500)
    expect(await auth.verifySignIn()).toBe('valid')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says valid, and keeps the new access, when Google accepts the refresh', async () => {
    store()
    google(200, { access_token: 'fresh', expires_in: 3600 })
    expect(await auth.verifySignIn()).toBe('valid')
    expect(JSON.parse(stored()).accessToken).toBe('fresh')
    expect(JSON.parse(stored()).refreshToken).toBe('refresh')
  })

  it.each([400, 401])('says expired, clears the sign-in and tells the window, when Google answers %i', async (status) => {
    store()
    google(status, { error: 'invalid_grant' })
    expect(await auth.verifySignIn()).toBe('expired')
    expect(stored()).toBe('')
    expect(sent).toHaveBeenCalledWith('google:signedOut')
  })

  it.each([429, 500, 503])('says unknown, and signs nobody out, when Google answers %i', async (status) => {
    store()
    google(status)
    expect(await auth.verifySignIn()).toBe('unknown')
    expect(JSON.parse(stored()).refreshToken).toBe('refresh')
    expect(sent).not.toHaveBeenCalled()
  })

  it('says unknown, and signs nobody out, when Google cannot be reached at all', async () => {
    store()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    expect(await auth.verifySignIn()).toBe('unknown')
    expect(JSON.parse(stored()).refreshToken).toBe('refresh')
    expect(sent).not.toHaveBeenCalled()
  })
})

describe('getAccessToken', () => {
  it('asks for a sign-in, in plain words, when none is stored', async () => {
    await expect(auth.getAccessToken()).rejects.toThrow(MSG_NOT_SIGNED_IN)
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(auth.SignInRequiredError)
  })

  it('reports an expired sign-in as one', async () => {
    store()
    google(400)
    await expect(auth.getAccessToken()).rejects.toThrow(MSG_SIGN_IN_EXPIRED)
  })

  it('reports Google being down as Google being down, not as a dead sign-in', async () => {
    store()
    google(503)
    const err = await auth.getAccessToken().catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(auth.SignInRequiredError)
    expect((err as Error).message).toMatch(/Google is having a problem/)
  })

  it('reports no connection in plain words', async () => {
    store()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    await expect(auth.getAccessToken()).rejects.toThrow(/could not reach Google/)
  })
})
