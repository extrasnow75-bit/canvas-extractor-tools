export interface CourseRef {
  baseUrl: string
  courseId: string
  token: string
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

export function parseCourseUrl(raw: string): { baseUrl: string; courseId: string } | null {
  const match = raw.trim().match(/^(https:\/\/[^/]+)\/courses\/(\d+)/)
  return match ? { baseUrl: match[1], courseId: match[2] } : null
}

/**
 * GET a Canvas API endpoint, following pagination automatically.
 * Uses Electron's net module (no CORS — runs in main process).
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
    const response: FetchResponseLike = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ref.token}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      let detail = ''
      try {
        const body = (await response.json()) as { errors?: Array<{ message: string }> }
        detail = body?.errors?.[0]?.message ?? ''
      } catch { /* ignore */ }
      throw new Error(
        `Canvas API error ${response.status}${detail ? `: ${detail}` : ` (${response.statusText})`}`,
      )
    }

    const data = await response.json()
    if (Array.isArray(data)) {
      all.push(...(data as T[]))
    } else {
      return [data as T]
    }

    // Follow the Link: <url>; rel="next" pagination header
    const link: string = response.headers.get('link') ?? ''
    const next: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }

  return all
}

export async function canvasGetOne<T>(path: string, ref: CourseRef): Promise<T> {
  const response: FetchResponseLike = await fetch(`${ref.baseUrl}/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${ref.token}`,
      Accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`Canvas API error ${response.status}`)
  return response.json() as Promise<T>
}
