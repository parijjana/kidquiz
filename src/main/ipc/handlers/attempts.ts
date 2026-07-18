import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Attempt } from '@shared/types'
import * as attemptsRepo from '../../db/repositories/attempts'

/** Registers the "attempts" IPC namespace: record, list (see §5). */
export function registerAttemptsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.attempts.record,
    (
      _event,
      quizId: number,
      childName: string | null,
      score: number,
      total: number
    ): number => attemptsRepo.record(quizId, childName, score, total)
  )

  ipcMain.handle(IPC.attempts.list, (_event, quizId?: number): Attempt[] =>
    attemptsRepo.list(quizId)
  )
}
