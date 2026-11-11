import { shell } from 'electron'
import { getAccessToken } from './googleAuth'
import { googleApiMessage, googleFetch } from './googleMessages'

const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink'

/**
 * Upload an HTML string to the user's Google Drive, converting it to a native Google Doc
 * (target mimeType application/vnd.google-apps.document). Returns the file id + view link.
 * Only touches files this app creates — the drive.file scope grants nothing more.
 */
export async function uploadHtmlAsDoc(
  html: string,
  name: string,
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getAccessToken()
  const boundary = `canvasextractor${Date.now()}`

  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document' }) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    html +
    `\r\n--${boundary}--`

  const res = await googleFetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(googleApiMessage('Drive', 'saving the file to Google Drive', res.status, detail))
  }

  return (await res.json()) as { id: string; webViewLink: string }
}

export async function openInBrowser(url: string): Promise<void> {
  await shell.openExternal(url)
}
