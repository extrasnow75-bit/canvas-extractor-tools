import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron'
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
  verifyToken,
} from './ipc/canvasUtils'
import { signIn, getStatus, clearTokens } from './ipc/googleAuth'
import { uploadHtmlAsDoc, openInBrowser } from './ipc/googleDrive'
import { applyDueHeaderBorders } from './ipc/googleDocs'
import { listItemsForTool, PickerTool } from './ipc/listItems'
import { checkForUpdate, RELEASES_PAGE } from './ipc/updateCheck'
import { rememberSavePath } from './ipc/savePaths'
import {
  applyZoomLevel,
  getSavedZoomLevel,
  registerZoomShortcuts,
  stepZoom,
  MIN_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
} from './ipc/zoom'

const CREDS_PATH = join(app.getPath('userData'), 'credentials.enc')

/**
 * True only for a navigation back to the page this window already shows.
 *
 * Deliberately not an origin comparison. Every `file://` URL has the origin `"null"`, so in
 * the packaged build — which loads the UI with `loadFile` — comparing origins matches *any*
 * local file and waves it through. That would let a navigation to, say, a downloaded HTML
 * file run inside this window, where the preload bridge is attached and hands it the whole
 * `window.api` surface. Under `file://` we therefore require the exact same document, and
 * only the dev server (a real http origin, which reloads itself for HMR) gets origin
 * treatment.
 */
function isOwnPage(win: BrowserWindow, url: string): boolean {
  const current = win.webContents.getURL()
  if (!current) return false
  try {
    const target = new URL(url)
    const here = new URL(current)
    if (here.origin === 'null' || target.origin === 'null') {
      return target.protocol === here.protocol && target.pathname === here.pathname
    }
    return target.origin === here.origin
  } catch {
    return false
  }
}

/**
 * Hand a URL to the OS browser — but only if it is one the OS should treat as a web page.
 *
 * `shell.openExternal` launches whatever the platform has registered for the scheme, so an
 * unfiltered call is a general "run something" primitive: `file://` opens a local (or UNC)
 * executable, and Windows protocol handlers have a long history of turning this into remote
 * code execution. Everything this app legitimately opens — the Google consent screen, the
 * finished Doc, the releases page, Canvas help — is http(s).
 */
async function openExternalSafely(url: string): Promise<void> {
  let scheme: string
  try {
    scheme = new URL(url).protocol
  } catch {
    return
  }
  if (scheme !== 'http:' && scheme !== 'https:') return
  await shell.openExternal(url)
}

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

  // This window only ever shows our own bundled UI. Everything external — the Google consent
  // screen, the finished Doc, the Canvas help article — is opened in the user's real browser
  // via shell.openExternal. So refuse both routes by which remote content could end up
  // rendering inside the app instead: window.open, and navigation away from our own page.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isOwnPage(win, url)) return
    event.preventDefault()
    void openExternalSafely(url)
  })

  registerZoomShortcuts(win)

  // Restore the saved zoom once the page exists. Setting it earlier has no effect: Electron
  // resets the zoom level for each new document.
  win.webContents.on('did-finish-load', () => {
    applyZoomLevel(win, getSavedZoomLevel())
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** The window a renderer message came from, so zoom applies to the right one. */
function windowFor(e: { sender: Electron.WebContents }): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
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
  if (!filePath) return null
  // The export handlers will only write to a path this dialog issued; see savePaths.ts.
  rememberSavePath(filePath)
  return filePath
})

// ─── Update check ─────────────────────────────────────────────────────────────

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:checkUpdate', () => checkForUpdate())

// Takes no URL on purpose: the destination is a constant here, so the renderer cannot use
// this as a general "open any link in the browser" capability.
ipcMain.handle('app:openReleases', () => shell.openExternal(RELEASES_PAGE))

// ─── Interface zoom ───────────────────────────────────────────────────────────

ipcMain.handle('app:getZoom', (e) => {
  const win = windowFor(e)
  return {
    level: win ? win.webContents.getZoomLevel() : 0,
    min: MIN_ZOOM_LEVEL,
    max: MAX_ZOOM_LEVEL,
  }
})

ipcMain.handle('app:stepZoom', (e, delta: number) => {
  const win = windowFor(e)
  // Only ever ±1 from the renderer; the size of a step is not the renderer's decision.
  return win ? stepZoom(win, delta > 0 ? 1 : -1) : 0
})

ipcMain.handle('app:resetZoom', (e) => {
  const win = windowFor(e)
  return win ? applyZoomLevel(win, 0) : 0
})

// ─── Canvas feature handlers ──────────────────────────────────────────────────

ipcMain.handle('canvas:verifyToken', (_e, args: { token: string; courseUrl?: string }) => {
  const parsed = args.courseUrl ? parseCourseUrl(args.courseUrl) : null
  return verifyToken(args.token, parsed?.baseUrl)
})

ipcMain.handle('canvas:exportContent', handleCanvasExport)
ipcMain.handle('canvas:exportQuizzes', handleQuizExport)
ipcMain.handle('canvas:exportRubrics', handleRubricExport)

// Stop a running export. Cancellation is cooperative: the builders check between
// items, so the export ends at its next checkpoint rather than instantly.
ipcMain.handle('canvas:cancelExport', (_e, jobId: string) => cancelJob(jobId))

// ─── Course lookup (for the shared Canvas-course card) ────────────────────────

ipcMain.handle('canvas:getCourseName', async (_e, args: { courseUrl: string; token: string }) => {
  const parsed = parseCourseUrl(args.courseUrl)
  if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }
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
    if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }
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
    if (!parsed) return { ok: false, message: 'That is not a recognised Canvas course URL. It must look like https://yourschool.instructure.com/courses/12345' }
    const selectedIds = args.selectedIds ? new Set(args.selectedIds) : null
    const cancel = beginJob(args.jobId)
    const ref: CourseRef = { ...parsed, token: args.token, cancel }
    const progress = makeProgressReporter(e, args.jobId)

    let html: string
    let docName: string

    try {
      if (args.tool === 'content') {
        // cssBorders: false — the Docs importer turns the due-header border CSS into grey
        // rules of its own; applyDueHeaderBorders below is what draws the blue ones.
        const built = await buildContentHtml(ref, selectedIds, cancel, progress, false)
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
