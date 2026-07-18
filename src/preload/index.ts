import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  Attempt,
  GeminiStatus,
  GenerationOptions,
  InstalledModel,
  KidquizEventName,
  KidquizEventPayloadMap,
  ModelCatalogEntry,
  ModelStatus,
  PlatformInfo,
  Question,
  QuestionPatch,
  Quiz,
  QuizKind,
  QuizWithQuestions,
  Subject,
  TextEntry
} from '@shared/types'

type AnyEventHandler = (payload: KidquizEventPayloadMap[KidquizEventName]) => void
type AnyEventListener = (
  event: Electron.IpcRendererEvent,
  payload: KidquizEventPayloadMap[KidquizEventName]
) => void

// Maps a caller-supplied handler to the wrapped ipcRenderer listener it was
// registered with, so `off` can remove the exact listener `on` attached.
const listenerRegistry = new WeakMap<AnyEventHandler, AnyEventListener>()

const kidquiz = {
  subjects: {
    list: (): Promise<Subject[]> => ipcRenderer.invoke(IPC.subjects.list),
    create: (name: string): Promise<Subject> => ipcRenderer.invoke(IPC.subjects.create, name),
    rename: (id: number, name: string): Promise<Subject> =>
      ipcRenderer.invoke(IPC.subjects.rename, id, name),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.subjects.remove, id)
  },

  texts: {
    add: (subjectId: number, title: string, content: string): Promise<number> =>
      ipcRenderer.invoke(IPC.texts.add, subjectId, title, content),
    listBySubject: (subjectId: number): Promise<TextEntry[]> =>
      ipcRenderer.invoke(IPC.texts.listBySubject, subjectId),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.texts.remove, id)
  },

  generation: {
    start: (textId: number, opts: GenerationOptions): Promise<string> =>
      ipcRenderer.invoke(IPC.generation.start, textId, opts),
    cancel: (generationId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.generation.cancel, generationId)
  },

  questions: {
    listBySubject: (subjectId: number): Promise<Question[]> =>
      ipcRenderer.invoke(IPC.questions.listBySubject, subjectId),
    listByText: (textId: number): Promise<Question[]> =>
      ipcRenderer.invoke(IPC.questions.listByText, textId),
    update: (id: number, patch: QuestionPatch): Promise<Question> =>
      ipcRenderer.invoke(IPC.questions.update, id, patch),
    setApproved: (ids: number[], approved: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.questions.setApproved, ids, approved),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.questions.remove, id)
  },

  quizzes: {
    createFromQuestions: (
      subjectId: number,
      name: string,
      kind: QuizKind,
      questionIds: number[]
    ): Promise<number> =>
      ipcRenderer.invoke(IPC.quizzes.createFromQuestions, subjectId, name, kind, questionIds),
    createConsolidated: (subjectId: number, name: string, count: number): Promise<number> =>
      ipcRenderer.invoke(IPC.quizzes.createConsolidated, subjectId, name, count),
    list: (subjectId?: number): Promise<Quiz[]> =>
      ipcRenderer.invoke(IPC.quizzes.list, subjectId),
    get: (id: number): Promise<QuizWithQuestions> => ipcRenderer.invoke(IPC.quizzes.get, id),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.quizzes.remove, id)
  },

  attempts: {
    record: (
      quizId: number,
      childName: string | null,
      score: number,
      total: number
    ): Promise<number> =>
      ipcRenderer.invoke(IPC.attempts.record, quizId, childName, score, total),
    list: (quizId?: number): Promise<Attempt[]> => ipcRenderer.invoke(IPC.attempts.list, quizId)
  },

  models: {
    catalog: (): Promise<ModelCatalogEntry[]> => ipcRenderer.invoke(IPC.models.catalog),
    installed: (): Promise<InstalledModel[]> => ipcRenderer.invoke(IPC.models.installed),
    download: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.models.download, modelId),
    cancelDownload: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.models.cancelDownload, modelId),
    remove: (modelId: string): Promise<void> => ipcRenderer.invoke(IPC.models.remove, modelId),
    setActive: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.models.setActive, modelId),
    status: (): Promise<ModelStatus> => ipcRenderer.invoke(IPC.models.status)
  },

  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke(IPC.settings.get, key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.settings.set, key, value)
  },

  gemini: {
    status: (): Promise<GeminiStatus> => ipcRenderer.invoke(IPC.gemini.status),
    setKey: (key: string): Promise<GeminiStatus> => ipcRenderer.invoke(IPC.gemini.setKey, key),
    deleteKey: (): Promise<GeminiStatus> => ipcRenderer.invoke(IPC.gemini.deleteKey)
  },

  system: {
    openDataFolder: (): Promise<void> => ipcRenderer.invoke(IPC.system.openDataFolder),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openExternal, url),
    platformInfo: (): Promise<PlatformInfo> => ipcRenderer.invoke(IPC.system.platformInfo)
  },

  /** Subscribe to a push event from the main process. */
  on<K extends KidquizEventName>(
    event: K,
    handler: (payload: KidquizEventPayloadMap[K]) => void
  ): void {
    const listener: AnyEventListener = (_event, payload) =>
      handler(payload as KidquizEventPayloadMap[K])
    listenerRegistry.set(handler as AnyEventHandler, listener)
    ipcRenderer.on(event, listener)
  },

  /** Unsubscribe a handler previously passed to `on` for the same event. */
  off<K extends KidquizEventName>(
    event: K,
    handler: (payload: KidquizEventPayloadMap[K]) => void
  ): void {
    const listener = listenerRegistry.get(handler as AnyEventHandler)
    if (listener) {
      ipcRenderer.removeListener(event, listener)
      listenerRegistry.delete(handler as AnyEventHandler)
    }
  }
}

export type KidquizApi = typeof kidquiz

// This app always creates its BrowserWindow with contextIsolation: true (see
// src/main/index.ts), so context bridging is the only supported path.
if (!process.contextIsolated) {
  throw new Error('KidQuiz preload requires contextIsolation to be enabled')
}
contextBridge.exposeInMainWorld('kidquiz', kidquiz)
