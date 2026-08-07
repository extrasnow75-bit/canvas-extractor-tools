import { app } from 'electron'

/**
 * Asks GitHub whether a newer release exists, so the app can tell the user rather than
 * leaving them on an old build indefinitely.
 *
 * This deliberately only *notifies*. It does not download or install anything. Full
 * auto-update would need code signing on macOS (an Apple Developer account), and on Windows
 * would still surface an install prompt because the build is unsigned. A banner works
 * identically on both platforms today and costs nothing.
 *
 * The releases API is public and unauthenticated — no token ships in the app.
 */

/**
 * Everything points at one constant so moving the repo (e.g. to the eCampus org) is a
 * one-line change. Note that installers already in the wild have the old address compiled
 * in; GitHub redirects transferred repositories, which is what would keep them working.
 */
const RELEASES_REPO = 'extrasnow75-bit/canvas-extractor-tools'

export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`
const LATEST_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`

/** Long enough for a slow connection, short enough that nothing waits on it visibly. */
const REQUEST_TIMEOUT_MS = 8000

export interface UpdateInfo {
  /** The newer version, without a leading "v". */
  version: string
}

interface ParsedVersion {
  nums: number[]
  pre: string
}

function parseVersion(v: string): ParsedVersion {
  const raw = v.trim().replace(/^v/i, '')
  const dash = raw.indexOf('-')
  const core = dash === -1 ? raw : raw.slice(0, dash)
  return {
    nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0),
    pre: dash === -1 ? '' : raw.slice(dash + 1),
  }
}

/**
 * Semver-ish comparison: positive when `a` is newer than `b`, negative when older, 0 when
 * equal. A pre-release sorts below the same version without one (1.2.0-rc.1 < 1.2.0), per
 * semver. Missing components count as zero, so "1.2" and "1.2.0" compare equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)

  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }

  if (pa.pre === pb.pre) return 0
  if (pa.pre === '') return 1 // a is the full release, b is a pre-release of it
  if (pb.pre === '') return -1
  return pa.pre < pb.pre ? -1 : 1
}

/** The newest published version, or null if GitHub could not be reached or parsed. */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(LATEST_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rejects API requests that do not identify themselves.
        'User-Agent': `CanvasExtractorTools/${app.getVersion()}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null

    // /releases/latest excludes pre-releases by definition, so a release candidate will
    // never be offered to users.
    const body = (await res.json()) as { tag_name?: string }
    if (!body.tag_name) return null

    return body.tag_name.replace(/^v/i, '')
  } catch {
    // Offline, rate-limited, GitHub down, DNS blocked on a campus network.
    return null
  }
}

async function performCheck(): Promise<UpdateInfo | null> {
  const latest = await fetchLatestVersion()
  if (latest === null) return null
  if (compareVersions(latest, app.getVersion()) <= 0) return null

  // Only the version travels to the renderer. The page it opens is a constant in the main
  // process, so the renderer never gets to choose a URL for shell.openExternal.
  return { version: latest }
}

/**
 * Result of a check the user asked for, as opposed to the silent one at launch.
 *
 * The launch check collapses "no update" and "could not reach GitHub" into the same `null`,
 * because both mean the same thing there: show no banner. A check the user pressed a button
 * for must tell those apart — reporting "you are up to date" when the request actually failed
 * is worse than saying nothing, since it converts an unknown into a false reassurance.
 */
export type ManualCheckResult =
  | { state: 'update-available'; current: string; latest: string }
  | { state: 'up-to-date'; current: string }
  | { state: 'check-failed'; current: string }

/** Always talks to GitHub — deliberately bypasses the per-launch cache. */
export async function checkNow(): Promise<ManualCheckResult> {
  const current = app.getVersion()
  const latest = await fetchLatestVersion()
  if (latest === null) return { state: 'check-failed', current }
  return compareVersions(latest, current) > 0
    ? { state: 'update-available', current, latest }
    : { state: 'up-to-date', current }
}

let cached: Promise<UpdateInfo | null> | null = null

/** Checks at most once per launch; later calls reuse the first result. */
export function checkForUpdate(): Promise<UpdateInfo | null> {
  if (cached === null) cached = performCheck()
  return cached
}
