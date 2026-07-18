/**
 * LLM inference — a process-wide singleton wrapping node-llama-cpp. See ARCHITECTURE.md §6.
 *
 * Responsibilities:
 * - Initialise the llama binding once (`getLlama`).
 * - Load the persisted active model on demand; unload/free it when switching or shutting down.
 * - Run structured generation whose output is guaranteed to be valid JSON via a JSON-schema
 *   grammar (`llama.createGrammarForJsonSchema` + `LlamaChatSession`).
 *
 * Calls to {@link generateStructured} are serialised: the single loaded context is reused
 * across calls (a fresh chat session per call, so calls don't share history), which keeps
 * memory bounded during multi-chunk generation.
 */

import type {
  GbnfJsonObjectSchema,
  Llama,
  LlamaContext,
  LlamaModel
} from 'node-llama-cpp'
import { nlc } from './nlc'
import { getActiveModelId, installedModelPath } from './modelManager'

/** Context window size. Ample for a ~1200-word chunk plus generated questions, and small
 * enough to keep RAM use modest on the low-memory catalog models. */
const CONTEXT_SIZE = 4096

let llamaPromise: Promise<Llama> | null = null
let loadedModelId: string | null = null
let model: LlamaModel | null = null
let context: LlamaContext | null = null

/** Serialises `generateStructured` calls (one shared context, one sequence at a time). */
let queue: Promise<unknown> = Promise.resolve()

async function getLlamaInstance(): Promise<Llama> {
  if (llamaPromise === null) {
    llamaPromise = (async () => {
      const { getLlama, LlamaLogLevel } = await nlc()
      return getLlama({ logLevel: LlamaLogLevel.warn })
    })()
  }
  return llamaPromise
}

/** Whether a model is currently loaded into memory. */
export function isLoaded(): boolean {
  return model !== null
}

/** The id of the currently loaded model, or `null` if none is loaded. */
export function getLoadedModelId(): string | null {
  return loadedModelId
}

/**
 * Ensure the persisted active model is loaded. If a different model is currently loaded it
 * is unloaded first (freeing its context). Idempotent when the active model is already loaded.
 *
 * @throws if no active model is selected or its file is not present on disk.
 */
export async function loadActiveModel(): Promise<void> {
  const activeModelId = getActiveModelId()
  if (activeModelId === null) {
    throw new Error('No active model selected. Download and select a model first.')
  }
  if (loadedModelId === activeModelId && model !== null) {
    return
  }
  if (loadedModelId !== null) {
    await unload()
  }

  const modelPath = installedModelPath(activeModelId)
  if (modelPath === null) {
    throw new Error(`Active model "${activeModelId}" is not installed.`)
  }

  const llama = await getLlamaInstance()
  model = await llama.loadModel({ modelPath })
  context = await model.createContext({ contextSize: CONTEXT_SIZE, sequences: 1 })
  loadedModelId = activeModelId
}

/** Unload the current model and free its context. Safe to call when nothing is loaded. */
export async function unload(): Promise<void> {
  if (context !== null) {
    await context.dispose()
    context = null
  }
  if (model !== null) {
    await model.dispose()
    model = null
  }
  loadedModelId = null
}

/**
 * Generate a structurally-valid JSON object from the model, constrained by a JSON schema.
 *
 * The active model is loaded on first use. Output is forced to conform to `jsonSchema` via
 * node-llama-cpp's JSON-schema grammar, then parsed — so the returned value always matches
 * the schema's shape. The generation pipeline (`generator.ts`) is the intended consumer and
 * is responsible for its own semantic validation of the parsed result.
 *
 * @param opts.systemPrompt  System prompt establishing role/constraints (e.g. age band, tone).
 * @param opts.userPrompt    The user turn — typically the source text plus the ask.
 * @param opts.jsonSchema    A GBNF-compatible JSON schema object describing the desired output.
 * @param opts.temperature   Sampling temperature (default 0.7, per §6).
 * @param opts.onToken       Optional liveness callback (§14): invoked with the cumulative count
 *                           of tokens generated so far, as they are produced.
 * @returns The parsed JSON value, guaranteed to conform to `jsonSchema`. Typed as `unknown`;
 *          the caller should narrow it against its own schema type.
 */
export async function generateStructured(opts: {
  systemPrompt: string
  userPrompt: string
  jsonSchema: object
  temperature?: number
  onToken?: (tokensSoFar: number) => void
}): Promise<unknown> {
  // Chain onto the queue so concurrent callers run one at a time on the shared context.
  const run = queue.then(() => runGenerateStructured(opts))
  // Keep the queue alive even if this call rejects.
  queue = run.catch(() => undefined)
  return run
}

async function runGenerateStructured(opts: {
  systemPrompt: string
  userPrompt: string
  jsonSchema: object
  temperature?: number
  onToken?: (tokensSoFar: number) => void
}): Promise<unknown> {
  await loadActiveModel()
  if (model === null || context === null) {
    throw new Error('Model failed to load.')
  }

  const { LlamaChatSession } = await nlc()
  const llama = await getLlamaInstance()
  // §6 always passes an object schema (`{questions: [...]}`); cast to that concrete branch
  // so node-llama-cpp's generic infers a usable type. Output is validated by `grammar.parse`.
  const grammar = await llama.createGrammarForJsonSchema(opts.jsonSchema as GbnfJsonObjectSchema)

  const sequence = context.getSequence()
  const session = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt: opts.systemPrompt,
    autoDisposeSequence: true
  })

  try {
    let tokensSoFar = 0
    const onToken = opts.onToken
    const responseText = await session.prompt(opts.userPrompt, {
      grammar,
      temperature: opts.temperature ?? 0.7,
      // §14 liveness: `onToken` yields batches of generated tokens; report a cumulative count.
      onToken: onToken
        ? (tokens) => {
            tokensSoFar += tokens.length
            onToken(tokensSoFar)
          }
        : undefined
    })
    return grammar.parse(responseText)
  } finally {
    // Frees the session and, via autoDisposeSequence, the sequence — so the next call
    // gets a clean sequence from the reused context.
    session.dispose()
  }
}
