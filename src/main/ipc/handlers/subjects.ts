import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Subject } from '@shared/types'
import * as subjectsRepo from '../../db/repositories/subjects'

/** Registers the "subjects" IPC namespace: list, create, rename, remove (see §5). */
export function registerSubjectsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.subjects.list, (): Subject[] => subjectsRepo.list())

  ipcMain.handle(IPC.subjects.create, (_event, name: string): Subject =>
    subjectsRepo.create(name)
  )

  ipcMain.handle(IPC.subjects.rename, (_event, id: number, name: string): Subject =>
    subjectsRepo.rename(id, name)
  )

  ipcMain.handle(IPC.subjects.remove, (_event, id: number): void => subjectsRepo.remove(id))
}
