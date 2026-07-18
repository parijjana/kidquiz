/**
 * "models" IPC namespace — catalog, installed, download, cancelDownload, remove, setActive,
 * status. See ARCHITECTURE.md §5. Download progress/done/error are pushed to the renderer as
 * `model:download*` events by the model manager, using this window's `webContents`.
 */

import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import * as os from 'node:os'
import { IPC } from '@shared/ipcChannels'
import type { InstalledModel, ModelCatalogEntry, ModelStatus } from '@shared/types'
import { MODEL_CATALOG } from '../../llm/modelCatalog'
import {
  cancelDownload,
  clearActiveModelId,
  downloadModel,
  getActiveModelId,
  isInstalled,
  listInstalled,
  removeModel,
  setActiveModelId
} from '../../llm/modelManager'
import { isLoaded, loadActiveModel, unload } from '../../llm/inference'

/** Registers the seven `models:*` request/response handlers (see §5). */
export function registerModelHandlers(mainWindow: BrowserWindow): void {
  const sender = mainWindow.webContents

  ipcMain.handle(IPC.models.catalog, (): ModelCatalogEntry[] => MODEL_CATALOG)

  ipcMain.handle(IPC.models.installed, (): InstalledModel[] => listInstalled())

  ipcMain.handle(IPC.models.download, async (_event, modelId: string): Promise<void> => {
    await downloadModel(modelId, sender)
  })

  ipcMain.handle(IPC.models.cancelDownload, async (_event, modelId: string): Promise<void> => {
    await cancelDownload(modelId)
  })

  ipcMain.handle(IPC.models.remove, async (_event, modelId: string): Promise<void> => {
    // If we're deleting the active (possibly loaded) model, free it first.
    if (getActiveModelId() === modelId) {
      await unload()
    }
    await removeModel(modelId)
  })

  ipcMain.handle(IPC.models.setActive, async (_event, modelId: string): Promise<void> => {
    if (!isInstalled(modelId)) {
      throw new Error(`Model "${modelId}" is not installed.`)
    }
    setActiveModelId(modelId)
    // Free any previously loaded model; the new active model loads lazily on next generation.
    await unload()
    // Fail fast if the newly selected model can't be loaded at all.
    await loadActiveModel()
  })

  ipcMain.handle(IPC.models.status, (): ModelStatus => {
    const activeModelId = getActiveModelId()
    // If the active selection points at a model whose files are gone, report it cleared.
    if (activeModelId !== null && !isInstalled(activeModelId)) {
      clearActiveModelId()
      return { activeModelId: null, loaded: false, totalRamGB: os.totalmem() / 1024 ** 3 }
    }
    return {
      activeModelId,
      loaded: isLoaded(),
      totalRamGB: os.totalmem() / 1024 ** 3
    }
  })
}
