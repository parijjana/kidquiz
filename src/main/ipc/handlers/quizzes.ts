import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { Quiz, QuizKind, QuizWithQuestions } from '@shared/types'
import * as quizzesRepo from '../../db/repositories/quizzes'

/**
 * Registers the "quizzes" IPC namespace: createFromQuestions, createConsolidated,
 * createDynamic, setChapter, updateName, setQuestions, list, get, remove (see §5, §15).
 */
export function registerQuizzesHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC.quizzes.createFromQuestions,
    (
      _event,
      subjectId: number,
      name: string,
      kind: QuizKind,
      questionIds: number[]
    ): number => quizzesRepo.createFromQuestions(subjectId, name, kind, questionIds)
  )

  ipcMain.handle(
    IPC.quizzes.createConsolidated,
    (_event, subjectId: number, name: string, count: number): number =>
      quizzesRepo.createConsolidated(subjectId, name, count)
  )

  ipcMain.handle(
    IPC.quizzes.createDynamic,
    (
      _event,
      subjectId: number,
      chapterId: number | null,
      count: number,
      name?: string
    ): number => quizzesRepo.createDynamic(subjectId, chapterId, count, name)
  )

  ipcMain.handle(
    IPC.quizzes.setChapter,
    (_event, quizId: number, chapterId: number | null): void =>
      quizzesRepo.setChapter(quizId, chapterId)
  )

  ipcMain.handle(IPC.quizzes.updateName, (_event, quizId: number, name: string): Quiz =>
    quizzesRepo.updateName(quizId, name)
  )

  ipcMain.handle(
    IPC.quizzes.setQuestions,
    (_event, quizId: number, questionIds: number[]): void =>
      quizzesRepo.setQuestions(quizId, questionIds)
  )

  ipcMain.handle(IPC.quizzes.list, (_event, subjectId?: number): Quiz[] =>
    quizzesRepo.list(subjectId)
  )

  ipcMain.handle(IPC.quizzes.get, (_event, id: number): QuizWithQuestions => quizzesRepo.get(id))

  ipcMain.handle(IPC.quizzes.remove, (_event, id: number): void => quizzesRepo.remove(id))
}
