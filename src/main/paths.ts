/**
 * ALL filesystem locations are resolved here — see ARCHITECTURE.md §7.
 *
 * - Windows portable build: electron-builder sets env PORTABLE_EXECUTABLE_DIR ->
 *   data root is `<that dir>/kidquiz-data/`.
 * - Windows installed / macOS: data root is `app.getPath('userData')`.
 * - Dev (!app.isPackaged): data root is `<repo>/data/` (gitignored).
 * - Inside data root: `models/` (GGUF files), `kidquiz.db`.
 */

import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

let cachedDataRoot: string | null = null

function resolveDataRoot(): string {
  if (cachedDataRoot) return cachedDataRoot

  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) {
    cachedDataRoot = join(portableDir, 'kidquiz-data')
  } else if (app.isPackaged) {
    cachedDataRoot = app.getPath('userData')
  } else {
    cachedDataRoot = join(app.getAppPath(), 'data')
  }

  return cachedDataRoot
}

/** Root data directory. Created on first access if missing. */
export function dataRoot(): string {
  return ensureDir(resolveDataRoot())
}

/** Directory holding downloaded GGUF model files. Created on first access if missing. */
export function modelsDir(): string {
  return ensureDir(join(resolveDataRoot(), 'models'))
}

/** Path to the SQLite database file (the file itself is created by better-sqlite3). */
export function dbPath(): string {
  ensureDir(resolveDataRoot())
  return join(resolveDataRoot(), 'kidquiz.db')
}
