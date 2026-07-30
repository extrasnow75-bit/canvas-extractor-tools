import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { handleCanvasExport, buildContentHtml, makeProgressReporter } from './ipc/canvasExport'
import { handleQuizExport, buildQuizzesHtml } from './ipc/quizExport'
import { handleRubricExport, buildRubricsHtml } from './ipc/rubricExport'
import {
  parseCourseUrl,
  canvasGetOne,
  CourseRef,
  beginJob,
  endJob,
  cancelJob,
  isCancellation,
} from './ipc/canvasUtils'
import { signIn, getStatus, clearTokens } from './ipc/googleAuth'
import { uploadHtmlAsDoc, openInBrowser } from './ipc/googleDrive'
import { applyDueHeaderBorders } from './ipc/googleDocs'
import { listItemsForTool, PickerTool } from './ipc/listItems'

const CREDS_PATH = join(app.getPath('userData'), 'credentials.enc')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 550,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0033a0',
      symbolColor: '#ffffff',
      height: 36,
    },
    backgroundColor: '#f8fafc',
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ─── Credential storage (safeStorage = Windows Credential Manager) ────────────

ipcMain.handle('credentials:save', (_e, creds: Record<string, string>) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain not available')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(creds))
  writeFileSync(CREDS_PATH, encrypted)
})

ipcMain.handle('credentials:load', () => {
  if (!existsSync(CREDS_PATH)) return {}
  if (!safeStorage.isEncryptionAvailable()) return {}
  try {
    const encrypted = readFileSync(CREDS_PATH)
    return JSON.parse(safeStorage.decryptString(encrypted))
  } catch {
    return {}
  }
})

ipcMain.handle('credentials:clear', () => {
  if (existsSync(CREDS_PATH)) {
    writeFileSync(CREDS_PATH, Buffer.alloc(0))
  }
})

// ─── File save dialog ─────────────────────────────────────────────────────────

ipcMain.handle('dialog:saveFile', async (_e, opts: { defaultName: string; ext: string; label: string }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: opts.defaultName,
    filters: [{ name: opts.label, extensions: [opts.ext] }],
  })
  return filePath ?? null
})

// ─── Canvas feature handlers ──────────────────────────────────────────────────

ipcMain.handle('canvas:exportContent', handleCanvasExport)
ipcMain.handle('canvas:exportQuizzes', handleQuizExport)
ipcMain.handle('canvas:exportRubrics', handleRubricExport)

// Stop a running export. Cancellation is cooperative: the builders check between
// items, so the export ends at its next checkpoint rather than instantly.
ipcMain.handle('canvas:cancelExport', (_e, jobId: string) => cancelJob(jobId))

// ─── Course lookup (for the shared Canvas-course card) ────────────────────────

ipcMain.handle('canvas:getCourseName', async (_e, args: { courseUrl: string; token: string }) => {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'Invalid Canvas course URL.' }
  const ref: CourseRef = { ...parsed, token: args.token }
  try {
    const course = await canvasGetOne<{ name: string }>(`/courses/${ref.courseId}`, ref)
    return { ok: true, name: course.name }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not load course.' }
  }
})

// ─── Picker item listing (for "choose specific items" on each export tool) ────

ipcMain.handle(
  'canvas:listItems',
  async (_e, args: { tool: PickerTool; courseUrl: string; token: string }) => {
    const parsed = parseCourseUrl(args.courseUrl)
    if (!parsed) return { ok: false, message: 'Invalid Canvas course URL.' }
    const ref: CourseRef = { ...parsed, token: args.token }
    try {
      const items = await listItemsForTool(args.tool, ref)
      return { ok: true, items }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not load items.' }
    }
  },
)

// ─── Google sign-in ───────────────────────────────────────────────────────────

ipcMain.handle('google:signIn', (_e, options?: { useAnotherAccount?: boolean }) => signIn(options))
ipcMain.handle('google:status', () => getStatus())
ipcMain.handle('google:signOut', () => clearTokens())

// ─── Export to Google Drive (build HTML → upload as Google Doc → open) ─────────

ipcMain.handle(
  'canvas:exportToDrive',
  async (
    e,
    args: {
      tool: 'content' | 'quizzes' | 'rubrics'
      courseUrl: string
      token: string
      selectedIds?: string[]
      jobId?: string
    },
  ) => {
    const parsed = parseCourseUrl(args.courseUrl)
    if (!parsed) return { ok: false, message: 'Invalid Canvas course URL.' }
    const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
    const cancel = beginJob(args.jobId)
    const ref: CourseRef = { ...parsed, token: args.token, cancel }
    const progress = makeProgressReporter(e, args.jobId)

    let html: string
    let docName: string

    try {
      if (args.tool === 'content') {
        const built = await buildContentHtml(ref, selectedIds, cancel, progress)
        html = built.html
        docName = `${built.courseName} — Course Content`
      } else if (args.tool === 'quizzes') {
        const built = await buildQuizzesHtml(ref, selectedIds, cancel, progress)
        if (!built) return { ok: false, message: 'No quizzes found in this course.' }
        html = built.html
        docName = `${built.courseName} Quiz Questions`
      } else {
        const built = await buildRubricsHtml(ref, selectedIds, cancel, progress)
        if (!built) return { ok: false, message: 'No rubrics found in this course.' }
        html = built.html
        docName = `${built.courseName} Rubrics`
      }
    } catch (err) {
      if (isCancellation(err)) {
        return { ok: false, message: 'Export cancelled — nothing was uploaded.', cancelled: true }
      }
      throw err
    } finally {
      endJob(args.jobId)
    }

    const { id, webViewLink } = await uploadHtmlAsDoc(html, docName)

    // Draw the blue rules above/below each "Due by …" header via the Docs API — the one
    // part of the Blueprint spec the HTML importer can drop. Purely cosmetic, and the
    // document is already saved, so a failure here must not fail the whole export.
    let borderNote = ''
    if (args.tool === 'content') {
      try {
        await applyDueHeaderBorders(id)
      } catch (e) {
        borderNote =
          ' Note: the blue due-date rules could not be applied — ' +
          'check that the Google Docs API is enabled for this project. ' +
          (e instanceof Error ? e.message : '')
      }
    }

    await openInBrowser(webViewLink)
    return {
      ok: true,
      message: 'Created in your Google Drive and opened in your browser.' + borderNote,
      webViewLink,
    }
  },
)

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
