import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { TextEntry } from '@shared/types'
import * as textsRepo from '../../db/repositories/texts'

/** Registers the "texts" IPC namespace: add, listBySubject, setChapter, remove (see §5, §15). */
export function registerTextsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.texts.add,
    (
      _event,
      subjectId: number,
      title: string,
      content: string,
      chapterId: number | null
    ): number => textsRepo.add(subjectId, title, content, chapterId)
  )

  ipcMain.handle(IPC.texts.listBySubject, (_event, subjectId: number): TextEntry[] =>
    textsRepo.listBySubject(subjectId)
  )

  ipcMain.handle(IPC.texts.setChapter, (_event, id: number, chapterId: number | null): void =>
    textsRepo.setChapter(id, chapterId)
  )

  ipcMain.handle(IPC.texts.remove, (_event, id: number): void => textsRepo.remove(id))
}
