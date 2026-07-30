export interface CourseRef {
  baseUrl: string
  courseId: string
  token: string
  /**
   * The running export's cancel token, if any. It rides along on the ref so that the fetch
   * helpers can abandon a rate-limit backoff the moment Stop is pressed, without every one
   * of their ~25 call sites having to pass it explicitly.
   */
  cancel?: CancelToken | null
}

/**
 * Minimal shape of the global `fetch` response we rely on. Annotating explicitly
 * (rather than letting TS infer it) sidesteps a self-referential quirk in
 * @types/node's conditional fetch typings under this project's tsconfig.
 */
interface FetchResponseLike {
  ok: boolean
  status: number
  statusText: string
  json(): Promise<unknown>
  text(): Promise<string>
  headers: { get(name: string): string | null }
}

/** One selectable row in an export "choose specific items" picker. */
export interface PickerItem {
  id: string
  label: string
  group?: string
}

/**
 * Cooperative cancellation for long exports. An export is a long sequence of Canvas
 * requests, so it cannot be aborted outright — instead the builders check this flag
 * between items and bail out early when the user presses Stop.
 */
export interface CancelToken {
  cancelled: boolean
}

/**
 * Reports export progress so the UI can show elapsed time and a remaining-time estimate.
 * The estimate is derived from measured throughput, so `total` must be known up front.
 */
export type ProgressReporter = (done: number, total: number) => void

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.')
    this.name = 'ExportCancelledError'
  }
}

export function throwIfCancelled(token?: CancelToken | null): void {
  if (token?.cancelled) throw new ExportCancelledError()
}

/** Registry of in-flight exports, keyed by a renderer-supplied job id. */
const activeJobs = new Map<string, CancelToken>()

export function beginJob(jobId?: string): CancelToken | null {
  if (!jobId) return null
  const token: CancelToken = { cancelled: false }
  activeJobs.set(jobId, token)
  return token
}

export function endJob(jobId?: string): void {
  if (jobId) activeJobs.delete(jobId)
}

/** Flag a running export as cancelled; it stops at its next checkpoint. */
export function cancelJob(jobId: string): boolean {
  const token = activeJobs.get(jobId)
  if (!token) return false
  token.cancelled = true
  return true
}

export function isCancellation(err: unknown): boolean {
  return err instanceof ExportCancelledError
}

/**
 * Hosts this app is willing to send a Canvas token to.
 *
 * Every Canvas request carries the user's token as a Bearer credential, and this function is
 * the only thing deciding where those requests go. Without a host check, any
 * `https://<anything>/courses/<digits>` parsed happily — so a course link pasted from a
 * phishing message would hand the token to whoever sent it.
 *
 * Canvas cloud instances all sit under instructure.com. If eCampus ever moves to a
 * self-hosted Canvas on a boisestate.edu domain, add it here — this is deliberately a
 * short, explicit list rather than a pattern that tries to guess what "looks like" Canvas.
 */
const ALLOWED_CANVAS_HOSTS = [/(^|\.)instructure\.com$/i]

export function isAllowedCanvasHost(hostname: string): boolean {
  return ALLOWED_CANVAS_HOSTS.some((re) => re.test(hostname))
}

export function parseCourseUrl(raw: string): { baseUrl: string; courseId: string } | null {
  const match = raw.trim().match(/^(https:\/\/[^/]+)\/courses\/(\d+)/)
  if (!match) return null

  let hostname: string
  try {
    hostname = new URL(match[1]).hostname
  } catch {
    return null
  }
  if (!isAllowedCanvasHost(hostname)) return null

  return { baseUrl: match[1], courseId: match[2] }
}

/**
 * Waits before each successive retry after Canvas reports its request bucket empty.
 * Four attempts, ~37s of patience in total — enough for a leaky bucket to refill, short
 * enough that a genuinely stuck export still fails rather than hanging indefinitely.
 */
const RATE_LIMIT_BACKOFF_MS = [2000, 5000, 10000, 20000]

/**
 * True when a response is Canvas throttling us rather than refusing us.
 *
 * Canvas signals an exhausted request bucket with **403**, not the 429 you would expect,
 * and the body is the bare string "403 Forbidden (Rate Limit Exceeded)". A permissions
 * failure carries the same 403, so status alone cannot tell them apart — retrying a real
 * permission error would just stall the export behind pointless waiting. Hence the body
 * and the remaining-quota header, either of which is conclusive.
 */
function isRateLimited(status: number, body: string, remaining: string | null): boolean {
  if (status !== 403) return false
  if (/rate limit/i.test(body)) return true
  const left = remaining === null ? NaN : Number(remaining)
  return Number.isFinite(left) && left <= 0
}

/** Pull a human-readable message out of a Canvas error body, which may or may not be JSON. */
function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }> }
    const message = parsed?.errors?.[0]?.message
    if (message) return message
  } catch { /* not JSON — fall through and use the raw text */ }
  return body.trim().slice(0, 200)
}

/** Sleep in slices, so a Stop press is noticed *during* a long backoff rather than after it. */
async function sleepCancellable(ms: number, cancel?: CancelToken | null): Promise<void> {
  const SLICE_MS = 250
  for (let waited = 0; waited < ms; waited += SLICE_MS) {
    throwIfCancelled(cancel)
    await new Promise((resolve) => setTimeout(resolve, Math.min(SLICE_MS, ms - waited)))
  }
  throwIfCancelled(cancel)
}

/**
 * One authenticated Canvas GET, retried while Canvas is throttling us.
 *
 * Exporting a large course is hundreds of sequential requests, which is enough to drain
 * Canvas's leaky bucket. Before this retried, one 403 discarded an export that had already
 * been running for minutes and the user had no recourse but to start over.
 */
async function canvasFetch(url: string, ref: CourseRef): Promise<FetchResponseLike> {
  for (let attempt = 0; ; attempt++) {
    throwIfCancelled(ref.cancel)

    const response: FetchResponseLike = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ref.token}`,
        Accept: 'application/json',
      },
    })
    if (response.ok) return response

    // Reading the body consumes it, so this only happens on the failure path where the
    // body is wanted anyway — either to recognise throttling or to explain the error.
    const body = await response.text().catch(() => '')
    const throttled = isRateLimited(
      response.status,
      body,
      response.headers.get('x-rate-limit-remaining'),
    )

    if (throttled && attempt < RATE_LIMIT_BACKOFF_MS.length) {
      await sleepCancellable(RATE_LIMIT_BACKOFF_MS[attempt], ref.cancel)
      continue
    }

    const detail = throttled
      ? 'Canvas is rate limiting this account. Wait a few minutes and try again.'
      : errorDetail(body)
    throw new Error(
      `Canvas API error ${response.status}${detail ? `: ${detail}` : ` (${response.statusText})`}`,
    )
  }
}

/** True when two URLs share scheme, host and port. Malformed input is treated as not matching. */
function isSameOrigin(candidate: string, expected: string): boolean {
  try {
    return new URL(candidate).origin === new URL(expected).origin
  } catch {
    return false
  }
}

/**
 * GET a Canvas API endpoint, following pagination automatically.
 */
export async function canvasGet<T>(
  path: string,
  ref: CourseRef,
  perPage = 100,
): Promise<T[]> {
  const all: T[] = []
  let url: string | null =
    `${ref.baseUrl}/api/v1${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}`

  while (url) {
    const response = await canvasFetch(url, ref)

    const data = await response.json()
    if (Array.isArray(data)) {
      all.push(...(data as T[]))
    } else {
      return [data as T]
    }

    // Follow the Link: <url>; rel="next" pagination header.
    //
    // The next-page URL is chosen by the server and refetched with the Authorization header
    // still attached, so a host that returned `Link: <https://elsewhere/…>; rel="next"` could
    // walk the user's Canvas token off to another origin. Only follow it if it stays on the
    // origin we were configured to talk to; a cross-origin hop ends pagination instead.
    const link: string = response.headers.get('link') ?? ''
    const next: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/)
    url = next && isSameOrigin(next[1], ref.baseUrl) ? next[1] : null
  }

  return all
}

export async function canvasGetOne<T>(path: string, ref: CourseRef): Promise<T> {
  const response = await canvasFetch(`${ref.baseUrl}/api/v1${path}`, ref)
  return response.json() as Promise<T>
}
