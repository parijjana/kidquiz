import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Attempt, AttemptAnswer, AttemptAnswerInput } from '@shared/types'
import * as attemptsRepo from '../../db/repositories/attempts'

/** Registers the "attempts" IPC namespace: record, list, answers (see §5, §15). */
export function registerAttemptsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.attempts.record,
    (
      _event,
      quizId: number,
      childName: string | null,
      score: number,
      total: number,
      answers: AttemptAnswerInput[]
    ): number => attemptsRepo.record(quizId, childName, score, total, answers)
  )

  ipcMain.handle(IPC.attempts.list, (_event, quizId?: number): Attempt[] =>
    attemptsRepo.list(quizId)
  )

  ipcMain.handle(IPC.attempts.answers, (_event, attemptId: number): AttemptAnswer[] =>
    attemptsRepo.answers(attemptId)
  )
}
