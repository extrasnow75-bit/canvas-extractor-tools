import { contextBridge, ipcRenderer } from 'electron'

// Expose a narrow, typed API to the renderer — no direct Node/Electron access
contextBridge.exposeInMainWorld('api', {
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    /** Resolves to null when up to date, offline, or the check fails. */
    checkUpdate: (): Promise<{ version: string } | null> => ipcRenderer.invoke('app:checkUpdate'),
    openReleases: (): Promise<void> => ipcRenderer.invoke('app:openReleases'),
  },
  credentials: {
    save: (creds: Record<string, string>) => ipcRenderer.invoke('credentials:save', creds),
    load: (): Promise<Record<string, string>> => ipcRenderer.invoke('credentials:load'),
    clear: () => ipcRenderer.invoke('credentials:clear'),
  },
  dialog: {
    saveFile: (opts: { defaultName: string; ext: string; label: string }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFile', opts),
  },
  canvas: {
    /** 'unknown' means the check itself failed (offline, Canvas down) — not a verdict. */
    verifyToken: (args: {
      token: string
      courseUrl?: string
    }): Promise<'valid' | 'expired' | 'unknown'> => ipcRenderer.invoke('canvas:verifyToken', args),
    exportContent: (args: unknown) => ipcRenderer.invoke('canvas:exportContent', args),
    exportQuizzes: (args: unknown) => ipcRenderer.invoke('canvas:exportQuizzes', args),
    exportRubrics: (args: unknown) => ipcRenderer.invoke('canvas:exportRubrics', args),
    exportToDrive: (args: unknown) => ipcRenderer.invoke('canvas:exportToDrive', args),
    getCourseName: (args: unknown) => ipcRenderer.invoke('canvas:getCourseName', args),
    listItems: (args: unknown) => ipcRenderer.invoke('canvas:listItems', args),
    cancelExport: (jobId: string): Promise<boolean> =>
      ipcRenderer.invoke('canvas:cancelExport', jobId),
    /** Subscribe to export progress. Returns an unsubscribe function. */
    onExportProgress: (
      callback: (data: { jobId: string; done: number; total: number }) => void,
    ): (() => void) => {
      const listener = (_e: unknown, data: { jobId: string; done: number; total: number }) =>
        callback(data)
      ipcRenderer.on('canvas:exportProgress', listener)
      return () => ipcRenderer.removeListener('canvas:exportProgress', listener)
    },
  },
  google: {
    signIn: (options?: {
      useAnotherAccount?: boolean
    }): Promise<{ signedIn: boolean; email?: string; name?: string; picture?: string }> =>
      ipcRenderer.invoke('google:signIn', options),
    signOut: () => ipcRenderer.invoke('google:signOut'),
    status: (): Promise<{ signedIn: boolean; email?: string; name?: string; picture?: string }> =>
      ipcRenderer.invoke('google:status'),
    /** Fires when a stored sign-in turns out to be dead. Returns an unsubscribe function. */
    onSignedOut: (callback: () => void): (() => void) => {
      const listener = () => callback()
      ipcRenderer.on('google:signedOut', listener)
      return () => ipcRenderer.removeListener('google:signedOut', listener)
    },
  },
})
