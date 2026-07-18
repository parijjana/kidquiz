/**
 * Generation provider routing — see ARCHITECTURE.md §13.
 *
 * `generator.ts` creates one session per generation run via {@link createGenerationSession} and
 * calls its `generateStructured` (never `inference.ts` directly). A session prefers Gemini when
 * a key is present ("best model available"); on a Gemini quota / network / invalid-key failure it
 * flips PERMANENTLY to local for the rest of the run and retries that same request locally. If no
 * local model is installed either, it throws a friendly error naming both options.
 *
 * `onToken` (cumulative token count for §14 progress) is forwarded to local inference only —
 * Gemini isn't streamed here, so it simply ignores it.
 */

import type { GenerationProvider } from '@shared/types'
import { getKey } from './gemini/keyStore'
import {
  GeminiAuthError,
  GeminiNetworkError,
  GeminiQuotaError,
  geminiGenerateStructured
} from './gemini/client'
import * as inference from './inference'
import { getActiveModelId, installedModelPath } from './modelManager'

export interface GenerationRequest {
  systemPrompt: string
  userPrompt: string
  jsonSchema: object
  temperature?: number
  /** Cumulative-token progress callback (local provider only; ignored by Gemini). */
  onToken?: (tokensSoFar: number) => void
}

export interface GenerationSession {
  /** The provider the next request will use — starts 'gemini' if a key is present, else 'local'. */
  current(): GenerationProvider
  generateStructured(request: GenerationRequest): Promise<unknown>
}

/** Create a per-run generation session. Provider selection is resolved lazily per request. */
export function createGenerationSession(): GenerationSession {
  // Snapshot the key at session start; a run uses a consistent provider decision.
  const apiKey = getKey()
  let provider: GenerationProvider = apiKey !== null ? 'gemini' : 'local'

  function localAvailable(): boolean {
    const active = getActiveModelId()
    return active !== null && installedModelPath(active) !== null
  }

  async function runLocal(request: GenerationRequest): Promise<unknown> {
    if (!localAvailable()) {
      if (apiKey !== null) {
        throw new Error(
          'Gemini is busy and no on-device model is downloaded — try again in a minute, or download a model in Settings.'
        )
      }
      throw new Error(
        'No on-device model is downloaded yet — download a model in Settings to generate quizzes.'
      )
    }
    return inference.generateStructured({
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      jsonSchema: request.jsonSchema,
      temperature: request.temperature,
      onToken: request.onToken
    })
  }

  return {
    current(): GenerationProvider {
      return provider
    },

    async generateStructured(request: GenerationRequest): Promise<unknown> {
      if (provider === 'gemini' && apiKey !== null) {
        try {
          return await geminiGenerateStructured({
            apiKey,
            systemPrompt: request.systemPrompt,
            userPrompt: request.userPrompt,
            jsonSchema: request.jsonSchema,
            temperature: request.temperature
          })
        } catch (error) {
          if (
            error instanceof GeminiQuotaError ||
            error instanceof GeminiNetworkError ||
            error instanceof GeminiAuthError
          ) {
            // Permanent flip to local for the remainder of the run, then retry locally.
            console.warn(
              `[provider] Gemini unavailable (${error.name}); falling back to on-device model: ${error.message}`
            )
            provider = 'local'
            return runLocal(request)
          }
          // Anything else (blocked content, malformed output) surfaces to the caller.
          throw error
        }
      }
      return runLocal(request)
    }
  }
}
