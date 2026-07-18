import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { GenerationOptions } from '@shared/types'
import { cancelGeneration, startGeneration } from '../../generation/generator'

/**
 * Registers the "generation" IPC namespace: start, cancel (see §5). The invoking
 * WebContents is used as the target for the pipeline's push events.
 */
export function registerGenerationHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.generation.start,
    (event, textId: number, opts: GenerationOptions): string =>
      startGeneration(textId, opts, event.sender)
  )

  ipcMain.handle(IPC.generation.cancel, (_event, generationId: string): void =>
    cancelGeneration(generationId)
  )
}
