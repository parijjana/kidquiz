/**
 * Channel name constants. Never inline channel strings — import from here on
 * both sides of the bridge (main handlers + preload).
 * See ARCHITECTURE.md §5.
 */

/** Request/response channels, one per `ipcMain.handle` registration. */
export const IPC = {
  subjects: {
    list: 'subjects:list',
    create: 'subjects:create',
    rename: 'subjects:rename',
    remove: 'subjects:remove'
  },
  texts: {
    add: 'texts:add',
    listBySubject: 'texts:listBySubject',
    setChapter: 'texts:setChapter',
    remove: 'texts:remove'
  },
  chapters: {
    list: 'chapters:list',
    create: 'chapters:create',
    rename: 'chapters:rename',
    remove: 'chapters:remove'
  },
  generation: {
    start: 'generation:start',
    cancel: 'generation:cancel'
  },
  questions: {
    listBySubject: 'questions:listBySubject',
    listByText: 'questions:listByText',
    update: 'questions:update',
    setApproved: 'questions:setApproved',
    remove: 'questions:remove'
  },
  quizzes: {
    createFromQuestions: 'quizzes:createFromQuestions',
    createConsolidated: 'quizzes:createConsolidated',
    createDynamic: 'quizzes:createDynamic',
    setChapter: 'quizzes:setChapter',
    updateName: 'quizzes:updateName',
    setQuestions: 'quizzes:setQuestions',
    list: 'quizzes:list',
    get: 'quizzes:get',
    remove: 'quizzes:remove'
  },
  attempts: {
    record: 'attempts:record',
    list: 'attempts:list',
    answers: 'attempts:answers'
  },
  models: {
    catalog: 'models:catalog',
    installed: 'models:installed',
    download: 'models:download',
    cancelDownload: 'models:cancelDownload',
    remove: 'models:remove',
    setActive: 'models:setActive',
    status: 'models:status'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  gemini: {
    status: 'gemini:status',
    setKey: 'gemini:setKey',
    deleteKey: 'gemini:deleteKey'
  },
  system: {
    openDataFolder: 'system:openDataFolder',
    openExternal: 'system:openExternal',
    platformInfo: 'system:platformInfo'
  }
} as const

/** Push-event channels (main -> renderer via `webContents.send`). */
export const IPC_EVENTS = {
  generationProgress: 'generation:progress',
  generationDone: 'generation:done',
  generationError: 'generation:error',
  modelDownloadProgress: 'model:downloadProgress',
  modelDownloadDone: 'model:downloadDone',
  modelDownloadError: 'model:downloadError'
} as const
