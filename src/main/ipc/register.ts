import type { BrowserWindow } from 'electron'
import { registerSystemHandlers } from './handlers/system'
import { registerSubjectsHandlers } from './handlers/subjects'
import { registerTextsHandlers } from './handlers/texts'
import { registerChaptersHandlers } from './handlers/chapters'
import { registerQuestionsHandlers } from './handlers/questions'
import { registerQuizzesHandlers } from './handlers/quizzes'
import { registerAttemptsHandlers } from './handlers/attempts'
import { registerSettingsHandlers } from './handlers/settings'
import { registerGenerationHandlers } from './handlers/generation'
import { registerModelHandlers } from './handlers/models'
import { registerGeminiHandlers } from './handlers/gemini'

/**
 * Registers every ipcMain handler. One handler file per domain under ./handlers.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerSystemHandlers(mainWindow)
  registerSubjectsHandlers(mainWindow)
  registerTextsHandlers(mainWindow)
  registerChaptersHandlers(mainWindow)
  registerQuestionsHandlers(mainWindow)
  registerQuizzesHandlers(mainWindow)
  registerAttemptsHandlers(mainWindow)
  registerSettingsHandlers(mainWindow)
  registerGenerationHandlers(mainWindow)
  registerModelHandlers(mainWindow)
  registerGeminiHandlers(mainWindow)
}
