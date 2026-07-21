/**
 * Model management — download (resumable, with progress events), cancel, delete, list
 * installed, and active-model selection. See ARCHITECTURE.md §8.
 *
 * Downloads use node-llama-cpp's `createModelDownloader` (built on `ipull`), which gives
 * parallel connections, progress callbacks, and resume: an interrupted download leaves a
 * temp file that a subsequent `downloadModel` call for the same id picks up where it left
 * off (skipping the completed file entirely once present).
 *
 * ORCHESTRATOR-SANCTIONED DEVIATION: active-model selection is persisted to
 * `<dataRoot()>/active-model.json` rather than the SQLite `settings` table. This keeps
 * this subsystem decoupled from the DB agent working in parallel. See the task brief.
 */

import type { WebContents } from 'electron'
import type { ModelDownloader } from 'node-llama-cpp'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_EVENTS } from '@shared/ipcChannels'
import type { InstalledModel } from '@shared/types'
import { dataRoot, modelsDir } from '../paths'
import { nlc } from './nlc'
import { MODEL_CATALOG, getCatalogEntry, modelFileName } from './modelCatalog'

const ACTIVE_MODEL_FILE = 'active-model.json'

interface ActiveModelState {
  activeModelId: string | null
}

interface DownloadHandle {
  downloader: ModelDownloader
  abortController: AbortController
}

/** In-flight downloads keyed by model id, so they can be cancelled. */
const activeDownloads = new Map<string, DownloadHandle>()

// ---------------------------------------------------------------------------
// Active-model persistence (<dataRoot>/active-model.json)
// ---------------------------------------------------------------------------

function activeModelPath(): string {
  return join(dataRoot(), ACTIVE_MODEL_FILE)
}

export function getActiveModelId(): string | null {
  const path = activeModelPath()
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ActiveModelState>
    // Migrate away from an id that is no longer in the catalog (e.g. the removed
    // `llama3.2-3b-q4`): treat it as unset so callers fall back to picking/downloading a
    // current model. The user's downloaded file is left on disk, just no longer offered.
    if (typeof parsed.activeModelId === 'string' && getCatalogEntry(parsed.activeModelId)) {
      return parsed.activeModelId
    }
    return null
  } catch {
    // Corrupt file — treat as "no active model" rather than crashing.
    return null
  }
}

/** Persist the active model id. Throws if the id is not a known catalog entry. */
export function setActiveModelId(modelId: string): void {
  if (!getCatalogEntry(modelId)) {
    throw new Error(`Unknown model id: ${modelId}`)
  }
  const state: ActiveModelState = { activeModelId: modelId }
  writeFileSync(activeModelPath(), JSON.stringify(state, null, 2), 'utf8')
}

/** Clear the active-model selection (e.g. after the active model is deleted). */
export function clearActiveModelId(): void {
  const state: ActiveModelState = { activeModelId: null }
  writeFileSync(activeModelPath(), JSON.stringify(state, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// Installed models (scan modelsDir for catalog filenames)
// ---------------------------------------------------------------------------

/**
 * The on-disk file(s) for a catalog entry that currently exist in `modelsDir`.
 * For split-GGUF entries this returns every present part; for single-file entries it
 * returns the one file (or an empty array if not downloaded).
 */
function existingFilesForEntry(fileName: string): string[] {
  const dir = modelsDir()
  const splitMatch = fileName.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/)
  if (splitMatch) {
    const prefix = splitMatch[1]
    const total = splitMatch[3]
    const suffix = `-of-${total}.gguf`
    return readdirSync(dir)
      .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(suffix))
      .map((name) => join(dir, name))
  }
  const single = join(dir, fileName)
  return existsSync(single) ? [single] : []
}

/** True if the entrypoint file for a model id is present on disk. */
export function isInstalled(modelId: string): boolean {
  const entry = getCatalogEntry(modelId)
  if (!entry) return false
  return existsSync(join(modelsDir(), modelFileName(entry)))
}

/** Absolute path to the entrypoint GGUF file used to load a model, if installed. */
export function installedModelPath(modelId: string): string | null {
  const entry = getCatalogEntry(modelId)
  if (!entry) return null
  const path = join(modelsDir(), modelFileName(entry))
  return existsSync(path) ? path : null
}

/** List catalog models that are present on disk. */
export function listInstalled(): InstalledModel[] {
  const activeId = getActiveModelId()
  const installed: InstalledModel[] = []
  for (const entry of MODEL_CATALOG) {
    const fileName = modelFileName(entry)
    const files = existingFilesForEntry(fileName)
    if (files.length === 0) continue
    const fileSizeBytes = files.reduce((sum, file) => sum + statSync(file).size, 0)
    installed.push({
      id: entry.id,
      displayName: entry.displayName,
      fileSizeBytes,
      filePath: join(modelsDir(), fileName),
      active: entry.id === activeId
    })
  }
  return installed
}

// ---------------------------------------------------------------------------
// Download / cancel / remove
// ---------------------------------------------------------------------------

/**
 * Start (or resume) downloading a model. Resolves once the download is complete, and
 * emits `model:downloadProgress` throughout plus `model:downloadDone` / `model:downloadError`
 * on the given `sender`. Cancellation is available via {@link cancelDownload}.
 *
 * If no active model is selected yet, the first successfully downloaded model becomes the
 * active model automatically (so the app has something to run without an extra step).
 */
export async function downloadModel(modelId: string, sender: WebContents): Promise<void> {
  const entry = getCatalogEntry(modelId)
  if (!entry) {
    throw new Error(`Unknown model id: ${modelId}`)
  }
  if (activeDownloads.has(modelId)) {
    throw new Error(`Model "${modelId}" is already downloading`)
  }

  const abortController = new AbortController()
  const send = (channel: string, payload: unknown): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }

  try {
    const { createModelDownloader } = await nlc()
    const downloader = await createModelDownloader({
      modelUri: entry.hfUrl,
      dirPath: modelsDir(),
      fileName: modelFileName(entry),
      skipExisting: true,
      onProgress: ({ totalSize, downloadedSize }) => {
        send(IPC_EVENTS.modelDownloadProgress, {
          modelId,
          bytesDone: downloadedSize,
          bytesTotal: totalSize
        })
      }
    })
    activeDownloads.set(modelId, { downloader, abortController })

    await downloader.download({ signal: abortController.signal })

    if (getActiveModelId() === null) {
      setActiveModelId(modelId)
    }
    send(IPC_EVENTS.modelDownloadDone, { modelId })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(IPC_EVENTS.modelDownloadError, { modelId, message })
    throw new Error(`Failed to download model "${modelId}": ${message}`)
  } finally {
    activeDownloads.delete(modelId)
  }
}

/** Cancel an in-flight download, deleting the partial temp file. No-op if not downloading. */
export async function cancelDownload(modelId: string): Promise<void> {
  const handle = activeDownloads.get(modelId)
  if (!handle) return
  handle.abortController.abort()
  await handle.downloader.cancel()
  activeDownloads.delete(modelId)
}

/**
 * Delete a downloaded model's file(s) from disk. If it is the active model, the caller is
 * responsible for unloading it first; this clears the active selection when appropriate.
 */
export async function removeModel(modelId: string): Promise<void> {
  const entry = getCatalogEntry(modelId)
  if (!entry) {
    throw new Error(`Unknown model id: ${modelId}`)
  }
  const files = existingFilesForEntry(modelFileName(entry))
  for (const file of files) {
    rmSync(file, { force: true })
  }
  if (getActiveModelId() === modelId) {
    clearActiveModelId()
  }
}
