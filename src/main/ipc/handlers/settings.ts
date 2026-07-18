import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import * as settingsRepo from '../../db/repositories/settings'

/** Registers the "settings" IPC namespace: get, set (see §5). */
export function registerSettingsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.settings.get, (_event, key: string): string | null =>
    settingsRepo.get(key)
  )

  ipcMain.handle(IPC.settings.set, (_event, key: string, value: string): void =>
    settingsRepo.set(key, value)
  )
}
