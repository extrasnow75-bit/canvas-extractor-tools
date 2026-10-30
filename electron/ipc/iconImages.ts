import { BrowserWindow } from 'electron'
import { CourseRef, canvasGetOne, isCancellation } from './canvasUtils'

/**
 * Fetches a Blueprint icon from Canvas as a picture that can be embedded in the document.
 *
 * Embedded as a data: URI rather than linked: Canvas file links need a login that Google's
 * importer does not have, which is how images used to go missing from extractions. The same
 * dozen icons repeat all through a course, so the caller fetches each file id once.
 *
 * The icons are usually SVG, which Google Docs cannot display, so those are drawn to a PNG
 * first. Anything that goes wrong returns null and the caller shows the icon's name as text
 * instead — an icon is never worth failing an extraction over.
 */

interface CanvasFileInfo {
  url?: string
  filename?: string
  'content-type'?: string
}

const MAX_ICON_BYTES = 2_000_000
const RASTER_PX = 96
const RASTER_TIMEOUT_MS = 10_000
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function dataUri(bytes: Buffer, type: string): string {
  return `data:${type};base64,${bytes.toString('base64')}`
}

/**
 * Draw an SVG to PNG in a hidden window. The SVG is loaded as an <img> in a window with
 * JavaScript off, so a script embedded in a course author's file cannot run.
 */
async function svgToPng(svg: Buffer): Promise<Buffer | null> {
  const win = new BrowserWindow({
    show: false,
    width: RASTER_PX,
    height: RASTER_PX,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  try {
    const page =
      '<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">' +
      `<img width="${RASTER_PX}" height="${RASTER_PX}" src="${dataUri(svg, 'image/svg+xml')}">` +
      '</body></html>'
    const work = (async () => {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
      // The load event can fire before the image has painted.
      await new Promise((r) => setTimeout(r, 150))
      const shot = await win.webContents.capturePage({ x: 0, y: 0, width: RASTER_PX, height: RASTER_PX })
      return shot.isEmpty() ? null : shot.toPNG()
    })()
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), RASTER_TIMEOUT_MS))
    return await Promise.race([work, timeout])
  } catch {
    return null
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** The icon with this Canvas file id as a data: URI, or null if it could not be had. */
export async function loadIconDataUri(fileId: string, ref: CourseRef): Promise<string | null> {
  try {
    const file = await canvasGetOne<CanvasFileInfo>(`/files/${fileId}`, ref)
    // https only. The file URL carries its own short-lived token, so no Canvas credential is
    // sent with this request.
    if (!file.url || !/^https:\/\//i.test(file.url)) return null
    const res = await fetch(file.url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null

    const type = (res.headers.get('content-type') ?? file['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (type === 'image/svg+xml' || /\.svg$/i.test(file.filename ?? '')) {
      const png = await svgToPng(bytes)
      return png ? dataUri(png, 'image/png') : null
    }
    return PICTURE_TYPES.has(type) ? dataUri(bytes, type) : null
  } catch (err) {
    // Stop must still stop the extraction.
    if (isCancellation(err)) throw err
    return null
  }
}
