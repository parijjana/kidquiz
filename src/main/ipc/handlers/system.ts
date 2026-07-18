import type { BrowserWindow } from 'electron'
import { ipcMain, shell } from 'electron'
import * as os from 'node:os'
import { IPC } from '@shared/ipcChannels'
import type { PlatformInfo } from '@shared/types'
import { dataRoot } from '../../paths'

/** Registers the "system" IPC namespace: openDataFolder, platformInfo (see §5). */
export function registerSystemHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.system.openDataFolder, async (): Promise<void> => {
    const errorMessage = await shell.openPath(dataRoot())
    if (errorMessage) {
      throw new Error(`Failed to open data folder: ${errorMessage}`)
    }
  })

  ipcMain.handle(IPC.system.openExternal, async (_event, url: string): Promise<void> => {
    // Only https links may leave the app (the renderer passes fixed, known URLs).
    if (!/^https:\/\//.test(url)) {
      throw new Error('Only https links can be opened.')
    }
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.system.platformInfo, (): PlatformInfo => {
    return {
      totalRamGB: os.totalmem() / 1024 ** 3,
      platform: process.platform
    }
  })
}
