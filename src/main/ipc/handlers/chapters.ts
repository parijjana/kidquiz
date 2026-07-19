import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Chapter } from '@shared/types'
import * as chaptersRepo from '../../db/repositories/chapters'

/** Registers the "chapters" IPC namespace: list, create, rename, remove (see §15). */
export function registerChaptersHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.chapters.list, (_event, subjectId: number): Chapter[] =>
    chaptersRepo.list(subjectId)
  )

  ipcMain.handle(IPC.chapters.create, (_event, subjectId: number, name: string): Chapter =>
    chaptersRepo.create(subjectId, name)
  )

  ipcMain.handle(IPC.chapters.rename, (_event, id: number, name: string): Chapter =>
    chaptersRepo.rename(id, name)
  )

  ipcMain.handle(IPC.chapters.remove, (_event, id: number): void => chaptersRepo.remove(id))
}
