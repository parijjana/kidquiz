/**
 * All cross-process (main <-> preload <-> renderer) types live here.
 * See ARCHITECTURE.md §4 (DB schema) and §5 (shared types & IPC contract).
 */

// ---------------------------------------------------------------------------
// Entities (mirror the SQLite schema in §4, camelCased for TS use)
// ---------------------------------------------------------------------------

export interface Subject {
  id: number
  name: string
  createdAt: string
}

export interface Chapter {
  id: number
  subjectId: number
  name: string
  createdAt: string
}

export interface TextEntry {
  id: number
  subjectId: number
  /** Optional chapter this text belongs to (see §15). */
  chapterId: number | null
  title: string
  content: string
  /** Model-suggested quiz title from generation (§16); user override always wins. */
  suggestedQuizName: string | null
  createdAt: string
}

export type QuestionType = 'mcq' | 'truefalse'

export interface Question {
  id: number
  subjectId: number
  textId: number | null
  type: QuestionType
  prompt: string
  /** MCQ: 4 options. True/False: exactly ["True", "False"]. */
  options: string[]
  /** Index into `options`. */
  correctIndex: number
  explanation: string | null
  approved: boolean
  timesUsed: number
  lastUsedAt: string | null
  createdAt: string
}

/** Editable fields for `questions.update`. Approval is handled via `setApproved`. */
export type QuestionPatch = Partial<
  Pick<Question, 'prompt' | 'options' | 'correctIndex' | 'explanation' | 'type'>
>

export type QuizKind = 'single_text' | 'consolidated' | 'dynamic'

export interface Quiz {
  id: number
  subjectId: number
  /** Optional chapter assignment (drag-to-reassign in the UI, see §15). */
  chapterId: number | null
  name: string
  kind: QuizKind
  createdAt: string
}

/** A quiz together with its questions, ordered by `quiz_questions.position`. */
export interface QuizWithQuestions extends Quiz {
  questions: Question[]
}

export interface Attempt {
  id: number
  quizId: number
  childName: string | null
  score: number
  total: number
  takenAt: string
}

/** One answered question within an attempt, as supplied when recording (position = array order). */
export interface AttemptAnswerInput {
  questionId: number
  /** Index into the question's options that the child chose. */
  chosenIndex: number
  correct: boolean
}

/** One answered question within a stored attempt (see §15 attempt_answers). */
export interface AttemptAnswer extends AttemptAnswerInput {
  attemptId: number
  position: number
}

// ---------------------------------------------------------------------------
// Models (see §8)
// ---------------------------------------------------------------------------

export interface ModelCatalogEntry {
  id: string
  /** Outcome-oriented label, e.g. "Recommended — good questions, works on most laptops". */
  displayName: string
  description: string
  fileSizeBytes: number
  minRamGB: number
  /** Canonical huggingface.co/<repo>/resolve/main/<file> URL. */
  hfUrl: string
  recommended: boolean
}

export interface InstalledModel {
  id: string
  displayName: string
  fileSizeBytes: number
  filePath: string
  active: boolean
}

export interface ModelStatus {
  activeModelId: string | null
  loaded: boolean
  totalRamGB: number
}

// ---------------------------------------------------------------------------
// Gemini provider (see §13)
// ---------------------------------------------------------------------------

/** Which engine produced/will produce the questions for a generation run. */
export type GenerationProvider = 'gemini' | 'local'

export interface GeminiStatus {
  /** True when an encrypted key file exists and can be decrypted. */
  keyPresent: boolean
  /** Absolute path of the encrypted key file (shown to the user; deleting it removes the key). */
  keyFilePath: string
  /** False when OS-level encryption (Electron safeStorage) is unavailable; key cannot be saved. */
  encryptionAvailable: boolean
}

// ---------------------------------------------------------------------------
// Generation (see §6)
// ---------------------------------------------------------------------------

export type AgeBand = '5-7' | '8-9' | '10-11'

/**
 * Options for a generation run. There is deliberately NO question count: the model
 * extracts as many good questions as the text supports (the bank is the reservoir;
 * quiz length is chosen separately at quiz time, see §15).
 */
export interface GenerationOptions {
  ageBand: AgeBand
  /**
   * 'generate' — write new questions from a reading text.
   * 'import' — the pasted text already contains questions; reformat them into bank
   * questions (MCQ/True-False), inventing plausible distractors only where missing.
   */
  mode: 'generate' | 'import'
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export interface PlatformInfo {
  totalRamGB: number
  platform: NodeJS.Platform
}

// ---------------------------------------------------------------------------
// Push events (main -> renderer, see §5 "Push events")
// ---------------------------------------------------------------------------

export interface GenerationProgressEvent {
  generationId: string
  phase: 'loading_model' | 'generating'
  chunkIndex: number
  chunkCount: number
  questionsSoFar: number
  /** Engine handling this run. Absent from events emitted before provider routing existed. */
  provider?: GenerationProvider
  /** Cumulative tokens generated (local provider only; throttled). Absent for Gemini. */
  tokensSoFar?: number
}

export interface GenerationDoneEvent {
  generationId: string
  textId: number
  questionIds: number[]
  /** Candidates rejected as near-duplicates of existing/banked questions this run (§16). */
  droppedDuplicates?: number
}

export interface GenerationErrorEvent {
  generationId: string
  message: string
}

export interface ModelDownloadProgressEvent {
  modelId: string
  bytesDone: number
  bytesTotal: number
}

export interface ModelDownloadDoneEvent {
  modelId: string
}

export interface ModelDownloadErrorEvent {
  modelId: string
  message: string
}

/** Maps each push-event channel name to its payload type. Keys mirror `IPC_EVENTS` values. */
export interface KidquizEventPayloadMap {
  'generation:progress': GenerationProgressEvent
  'generation:done': GenerationDoneEvent
  'generation:error': GenerationErrorEvent
  'model:downloadProgress': ModelDownloadProgressEvent
  'model:downloadDone': ModelDownloadDoneEvent
  'model:downloadError': ModelDownloadErrorEvent
}

export type KidquizEventName = keyof KidquizEventPayloadMap
