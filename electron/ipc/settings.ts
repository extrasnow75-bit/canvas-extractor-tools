/**
 * Plain user preferences, persisted across launches.
 *
 * No credentials live here — those go through safeStorage — so this is ordinary JSON. Read
 * and write go through one module so that two features storing different keys in the same
 * file cannot clobber each other: every write is a read-modify-write of the whole object.
 */
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

export interface Settings {
  zoomLevel?: number
  /** The user ticked "Don't show this again" on the local-save notice. */
  hideLocalSaveNotice?: boolean
}

export function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) as Settings
  } catch {
    return {}
  }
}

/** Merge `patch` into the stored settings. */
export function updateSettings(patch: Settings): void {
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify({ ...readSettings(), ...patch }), 'utf-8')
  } catch {
    // A preference that cannot be saved is not worth failing anything over.
  }
}
