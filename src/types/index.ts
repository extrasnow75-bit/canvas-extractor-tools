export interface Credentials {
  canvasToken: string
}

export type Tool = 'content' | 'quizzes' | 'rubrics'

export interface ExportResult {
  ok: boolean
  message: string
  webViewLink?: string
  cancelled?: boolean
}

export interface GoogleStatus {
  signedIn: boolean
  email?: string
  name?: string
  picture?: string
}

export interface PickerItem {
  id: string
  label: string
  group?: string
}

export interface ListItemsResult {
  ok: boolean
  items?: PickerItem[]
  message?: string
}

export interface CourseNameResult {
  ok: boolean
  name?: string
  message?: string
}

/**
 * Outcome of a check the user asked for. 'check-failed' is kept distinct from 'up-to-date'
 * on purpose: telling someone they are current when the request never reached GitHub turns
 * an unknown into a false reassurance.
 */
export type ManualCheckResult =
  | { state: 'update-available'; current: string; latest: string }
  | { state: 'up-to-date'; current: string }
  | { state: 'check-failed'; current: string }

// Typed window.api bridge (mirrors preload.ts)
declare global {
  interface Window {
    api: {
      app: {
        version(): Promise<string>
        /** Resolves to null when up to date, offline, or the check fails. */
        checkUpdate(): Promise<{ version: string } | null>
        /** User-initiated check. Always hits the network, and distinguishes a failed check. */
        checkUpdateNow(): Promise<ManualCheckResult>
        openReleases(): Promise<void>
        getZoom(): Promise<{ level: number; min: number; max: number }>
        stepZoom(delta: number): Promise<number>
        resetZoom(): Promise<number>
        onZoomChanged(callback: (level: number) => void): () => void
      }
      credentials: {
        save(creds: Record<string, string>): Promise<void>
        load(): Promise<Record<string, string>>
        clear(): Promise<void>
      }
      dialog: {
        saveFile(opts: { defaultName: string; ext: string; label: string }): Promise<string | null>
      }
      canvas: {
        /** 'unknown' means the check itself failed (offline, Canvas down) — not a verdict. */
        verifyToken(args: {
          token: string
          courseUrl?: string
        }): Promise<'valid' | 'expired' | 'unknown'>
        exportContent(args: {
          courseUrl: string
          token: string
          savePath: string
          selectedIds?: string[]
          jobId?: string
        }): Promise<ExportResult>
        exportQuizzes(args: {
          courseUrl: string
          token: string
          savePath: string
          selectedIds?: string[]
          jobId?: string
        }): Promise<ExportResult>
        exportRubrics(args: {
          courseUrl: string
          token: string
          savePath: string
          selectedIds?: string[]
          jobId?: string
        }): Promise<ExportResult>
        exportToDrive(args: {
          tool: Tool
          courseUrl: string
          token: string
          selectedIds?: string[]
          jobId?: string
        }): Promise<ExportResult>
        cancelExport(jobId: string): Promise<boolean>
        onExportProgress(
          callback: (data: { jobId: string; done: number; total: number }) => void,
        ): () => void
        getCourseName(args: { courseUrl: string; token: string }): Promise<CourseNameResult>
        listItems(args: { tool: Tool; courseUrl: string; token: string }): Promise<ListItemsResult>
      }
      google: {
        signIn(options?: { useAnotherAccount?: boolean }): Promise<GoogleStatus>
        signOut(): Promise<void>
        status(): Promise<GoogleStatus>
        /** Fires when a stored sign-in turns out to be dead. Returns an unsubscribe function. */
        onSignedOut(callback: () => void): () => void
      }
    }
  }
}
