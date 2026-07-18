/**
 * "gemini" IPC namespace — status / setKey / deleteKey. See ARCHITECTURE.md §5, §13.
 * Thin wiring over the encrypted key store; all behaviour lives in `llm/gemini/keyStore`.
 */

import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { GeminiStatus } from '@shared/types'
import { deleteKey, getStatus, setKey } from '../../llm/gemini/keyStore'

/** Registers the three `gemini:*` request/response handlers. */
export function registerGeminiHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.gemini.status, (): GeminiStatus => getStatus())

  ipcMain.handle(IPC.gemini.setKey, (_event, key: string): Promise<GeminiStatus> => setKey(key))

  ipcMain.handle(IPC.gemini.deleteKey, (): GeminiStatus => deleteKey())
}
