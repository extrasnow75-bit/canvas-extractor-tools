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

// Typed window.api bridge (mirrors preload.ts)
declare global {
  interface Window {
    api: {
      app: {
        version(): Promise<string>
        /** Resolves to null when up to date, offline, or the check fails. */
        checkUpdate(): Promise<{ version: string } | null>
        openReleases(): Promise<void>
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
      }
    }
  }
}
