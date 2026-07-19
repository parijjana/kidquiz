/**
 * Generation orchestrator. See ARCHITECTURE.md §6.
 *
 * `startGeneration` returns a generation id immediately and runs the pipeline
 * asynchronously: load the text, chunk it, ask the model for a proportional mix of
 * questions per chunk, post-validate every returned question, and insert the valid ones
 * with `approved = 0`. Progress, completion, and errors are pushed to the renderer via the
 * §5 push events. Only one generation may run at a time.
 */

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { IPC_EVENTS } from '@shared/ipcChannels'
import type {
  AgeBand,
  GenerationOptions,
  GenerationProgressEvent,
  KidquizEventName,
  KidquizEventPayloadMap,
  QuestionType
} from '@shared/types'
import { loadActiveModel } from '../llm/inference'
import { createGenerationSession, type GenerationSession } from '../llm/provider'
import * as questionsRepo from '../db/repositories/questions'
import * as textsRepo from '../db/repositories/texts'
import { chunkText, countWords } from './chunker'
import {
  buildMcqUserPrompt,
  buildSystemPrompt,
  buildTitlePrompt,
  buildTrueFalseUserPrompt,
  mcqQuestionsSchema,
  titleSchema,
  trueFalseQuestionsSchema
} from './prompts'
import { isDuplicatePrompt } from './similarity'

/** Sampling temperature for question generation (ARCHITECTURE.md §6 step 5). */
const TEMPERATURE = 0.7

interface GenerationState {
  id: string
  cancelled: boolean
}

/** The single in-flight generation, or `null` when idle. Only one may run at a time. */
let activeGeneration: GenerationState | null = null

/** Sends a push event to the renderer, skipping a destroyed WebContents. */
function send<K extends KidquizEventName>(
  sender: WebContents,
  channel: K,
  payload: KidquizEventPayloadMap[K]
): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload)
  }
}

/**
 * Computes the question mix for a chunk: `ceil(count * chunkWords / totalWords)` questions,
 * at least 2, split ~70% MCQ / ~30% True-False (both at least 1).
 */
function distributeCounts(
  count: number,
  chunkWords: number,
  totalWords: number
): { mcqCount: number; tfCount: number } {
  const proportional = Math.ceil((count * chunkWords) / totalWords)
  const chunkTotal = Math.max(2, proportional)
  const tfCount = Math.max(1, Math.round(chunkTotal * 0.3))
  const mcqCount = Math.max(1, chunkTotal - tfCount)
  return { mcqCount, tfCount }
}

interface ValidQuestion {
  type: QuestionType
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string | null
}

/** Narrows the parsed model output to the array of raw question items. */
function extractQuestions(parsed: unknown): unknown[] {
  if (parsed !== null && typeof parsed === 'object' && 'questions' in parsed) {
    const questions = (parsed as { questions: unknown }).questions
    if (Array.isArray(questions)) return questions
  }
  return []
}

/**
 * Post-validates the SHAPE of a single raw question per §6. Returns a normalised question, or
 * `null` (dropping it) if it fails any structural rule. Duplicate detection is handled
 * separately in the accept path (see {@link isDuplicatePrompt}).
 */
function validateQuestion(raw: unknown): ValidQuestion | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const { type, prompt, options, correctIndex, explanation } = record

  if (type !== 'mcq' && type !== 'truefalse') return null
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return null
  if (!Array.isArray(options) || options.some((option) => typeof option !== 'string')) return null
  if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex)) return null

  const opts = options as string[]

  if (type === 'mcq') {
    if (opts.length !== 4) return null
    if (opts.some((option) => option.trim().length === 0)) return null
    const distinct = new Set(opts.map((option) => option.trim().toLowerCase()))
    if (distinct.size !== 4) return null
  } else {
    if (opts.length !== 2 || opts[0] !== 'True' || opts[1] !== 'False') return null
  }

  if (correctIndex < 0 || correctIndex >= opts.length) return null

  const cleanedExplanation =
    typeof explanation === 'string' && explanation.trim().length > 0 ? explanation.trim() : null

  return {
    type,
    prompt: prompt.trim(),
    options: opts,
    correctIndex,
    explanation: cleanedExplanation
  }
}

/**
 * Runs one type-constrained model call through the run's provider session and returns its raw
 * question items. `onToken` receives the provider's cumulative-within-this-call token count
 * (local provider only; Gemini never invokes it). A failure is logged and yields an empty
 * array so the rest of the run can continue.
 */
async function generateForType(
  session: GenerationSession,
  questionType: QuestionType,
  count: number,
  chunk: string,
  ageBand: AgeBand,
  chunkLabel: string,
  onToken: (tokensSoFarInCall: number) => void
): Promise<unknown[]> {
  try {
    const parsed = await session.generateStructured({
      systemPrompt: buildSystemPrompt({ ageBand }),
      userPrompt:
        questionType === 'mcq'
          ? buildMcqUserPrompt({ count, chunkText: chunk })
          : buildTrueFalseUserPrompt({ count, chunkText: chunk }),
      jsonSchema: questionType === 'mcq' ? mcqQuestionsSchema : trueFalseQuestionsSchema,
      temperature: TEMPERATURE,
      onToken
    })
    return extractQuestions(parsed)
  } catch (error) {
    console.warn(`[generation] ${chunkLabel} ${questionType} generation failed:`, error)
    return []
  }
}

/** Reads the `title` string out of the title-call result, or '' if absent/malformed. */
function extractTitle(parsed: unknown): string {
  if (parsed !== null && typeof parsed === 'object' && 'title' in parsed) {
    const title = (parsed as { title: unknown }).title
    if (typeof title === 'string') return title
  }
  return ''
}

/**
 * Asks the model (one tiny extra call) for a short kid-friendly quiz title based on the first
 * chunk, and stores it as the text's suggested quiz name. Strictly non-fatal (§16): any
 * failure is logged and swallowed.
 */
async function suggestQuizTitle(
  session: GenerationSession,
  textId: number,
  firstChunk: string
): Promise<void> {
  try {
    const parsed = await session.generateStructured({
      systemPrompt: 'You write short, fun, kid-friendly quiz titles.',
      userPrompt: buildTitlePrompt(firstChunk),
      jsonSchema: titleSchema,
      temperature: TEMPERATURE
    })
    const title = extractTitle(parsed).trim().slice(0, 60).trim()
    if (title.length > 0) {
      textsRepo.setSuggestedQuizName(textId, title)
    }
  } catch (error) {
    console.warn('[generation] quiz-title suggestion failed (non-fatal):', error)
  }
}

/** Runs the full pipeline for a generation, emitting progress/done/error events. */
async function runGeneration(
  state: GenerationState,
  textId: number,
  opts: GenerationOptions,
  sender: WebContents
): Promise<void> {
  try {
    const text = textsRepo.getById(textId)
    const chunks = chunkText(text.content)
    const chunkCount = chunks.length
    const totalWords = chunks.reduce((sum, chunk) => sum + countWords(chunk), 0) || 1

    // One provider session per run: prefers Gemini when a key is present, else local. It can
    // flip permanently to local mid-run on a Gemini failure, so `session.current()` is read
    // fresh at every emit.
    const session = createGenerationSession()

    // Run-cumulative token accounting. `onToken` reports a count cumulative WITHIN a single
    // call (resetting to 0 each call), so the run total is the sum of finished calls'
    // final counts plus the current call's running count.
    let completedTokens = 0
    let currentCallTokens = 0

    // Progress bookkeeping shared with the throttled emitter.
    const questionIds: number[] = []
    let questionsSoFar = 0
    let currentChunkIndex = 0
    let lastProgressAt = Date.now()

    const buildGeneratingPayload = (): GenerationProgressEvent => {
      const provider = session.current()
      const payload: GenerationProgressEvent = {
        generationId: state.id,
        phase: 'generating',
        chunkIndex: currentChunkIndex,
        chunkCount,
        questionsSoFar,
        provider
      }
      // Tokens are a local-provider signal only (Gemini isn't streamed here).
      if (provider === 'local') {
        payload.tokensSoFar = completedTokens + currentCallTokens
      }
      return payload
    }

    const emitGenerating = (): void => {
      send(sender, IPC_EVENTS.generationProgress, buildGeneratingPayload())
      lastProgressAt = Date.now()
    }

    // Called from local inference as tokens stream; emits at most once per ~500 ms (§14) so
    // the UI ticks during a long chunk, not only between chunks.
    const onToken = (tokensSoFarInCall: number): void => {
      currentCallTokens = tokensSoFarInCall
      if (Date.now() - lastProgressAt >= 500) {
        emitGenerating()
      }
    }

    // 'loading_model' phase applies only to a locally-started session — there is a GGUF to
    // load into memory. A Gemini-started session has nothing to load (and any mid-run
    // fallback lazy-loads the local model itself), so skip it entirely.
    if (session.current() === 'local') {
      send(sender, IPC_EVENTS.generationProgress, {
        generationId: state.id,
        phase: 'loading_model',
        chunkIndex: 0,
        chunkCount,
        questionsSoFar: 0,
        provider: session.current()
      })
      await loadActiveModel()
      lastProgressAt = Date.now()
    }

    // Prompts already used for this text (existing + accepted this run). Duplicate and
    // near-duplicate candidates are rejected against this growing list.
    const seenPrompts: string[] = questionsRepo
      .listByText(textId)
      .map((question) => question.prompt)

    for (let index = 0; index < chunks.length; index++) {
      // Cancellation is checked between chunks: the current chunk always finishes.
      if (state.cancelled) break

      currentChunkIndex = index + 1
      const chunk = chunks[index]
      const chunkLabel = `chunk ${currentChunkIndex}/${chunkCount}`
      const { mcqCount, tfCount } = distributeCounts(
        opts.count,
        countWords(chunk),
        totalWords
      )

      // One model call per type enforces the ~70/30 mix by construction. Skip a call whose
      // count is 0. After each call, fold its final token count into the run total.
      const rawQuestions: unknown[] = []
      if (mcqCount > 0) {
        rawQuestions.push(
          ...(await generateForType(session, 'mcq', mcqCount, chunk, opts.ageBand, chunkLabel, onToken))
        )
        completedTokens += currentCallTokens
        currentCallTokens = 0
      }
      if (tfCount > 0) {
        rawQuestions.push(
          ...(await generateForType(session, 'truefalse', tfCount, chunk, opts.ageBand, chunkLabel, onToken))
        )
        completedTokens += currentCallTokens
        currentCallTokens = 0
      }

      // Once per run, right after the first chunk's batches: suggest a quiz title from that
      // chunk. Non-fatal and emits no extra progress events (§16).
      if (index === 0) {
        await suggestQuizTitle(session, textId, chunk)
      }

      for (const rawQuestion of rawQuestions) {
        const valid = validateQuestion(rawQuestion)
        if (valid === null) {
          console.warn('[generation] dropped invalid question:', JSON.stringify(rawQuestion))
          continue
        }
        if (isDuplicatePrompt(valid.prompt, seenPrompts)) {
          console.warn('[generation] dropped near-duplicate question:', valid.prompt)
          continue
        }
        const id = questionsRepo.insert({
          subjectId: text.subjectId,
          textId,
          type: valid.type,
          prompt: valid.prompt,
          options: valid.options,
          correctIndex: valid.correctIndex,
          explanation: valid.explanation,
          approved: false
        })
        questionIds.push(id)
        seenPrompts.push(valid.prompt)
        questionsSoFar++
      }

      // One progress event per chunk, after both type calls complete.
      emitGenerating()
    }

    send(sender, IPC_EVENTS.generationDone, {
      generationId: state.id,
      textId,
      questionIds
    })
  } catch (error) {
    send(sender, IPC_EVENTS.generationError, {
      generationId: state.id,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Starts a generation for `textId`. Returns a generation id immediately; the pipeline runs
 * asynchronously and reports via push events.
 *
 * @throws if a generation is already running.
 */
export function startGeneration(
  textId: number,
  opts: GenerationOptions,
  sender: WebContents
): string {
  if (activeGeneration !== null) {
    throw new Error('A quiz is already being generated. Please wait for it to finish.')
  }
  const state: GenerationState = { id: randomUUID(), cancelled: false }
  activeGeneration = state
  void runGeneration(state, textId, opts, sender).finally(() => {
    activeGeneration = null
  })
  return state.id
}

/**
 * Requests cancellation of the given generation. The flag is checked between chunks, so the
 * run stops after the current chunk finishes and emits `generation:done` with whatever was
 * inserted so far. No-op if that generation is not the active one.
 */
export function cancelGeneration(generationId: string): void {
  if (activeGeneration !== null && activeGeneration.id === generationId) {
    activeGeneration.cancelled = true
  }
}
