import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Question, QuestionPatch } from '@shared/types'
import * as questionsRepo from '../../db/repositories/questions'

/**
 * Registers the "questions" IPC namespace: listBySubject, listByText, update,
 * setApproved, remove (see §5).
 */
export function registerQuestionsHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.questions.listBySubject, (_event, subjectId: number): Question[] =>
    questionsRepo.listBySubject(subjectId)
  )

  ipcMain.handle(IPC.questions.listByText, (_event, textId: number): Question[] =>
    questionsRepo.listByText(textId)
  )

  ipcMain.handle(IPC.questions.update, (_event, id: number, patch: QuestionPatch): Question =>
    questionsRepo.update(id, patch)
  )

  ipcMain.handle(
    IPC.questions.setApproved,
    (_event, ids: number[], approved: boolean): void =>
      questionsRepo.setApproved(ids, approved)
  )

  ipcMain.handle(IPC.questions.remove, (_event, id: number): void => questionsRepo.remove(id))
}
