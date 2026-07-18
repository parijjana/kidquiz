import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { TextEntry } from '@shared/types'
import * as textsRepo from '../../db/repositories/texts'

/** Registers the "texts" IPC namespace: add, listBySubject, remove (see §5). */
export function registerTextsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.texts.add,
    (_event, subjectId: number, title: string, content: string): number =>
      textsRepo.add(subjectId, title, content)
  )

  ipcMain.handle(IPC.texts.listBySubject, (_event, subjectId: number): TextEntry[] =>
    textsRepo.listBySubject(subjectId)
  )

  ipcMain.handle(IPC.texts.remove, (_event, id: number): void => textsRepo.remove(id))
}
