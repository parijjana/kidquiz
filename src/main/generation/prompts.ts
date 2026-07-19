/**
 * Prompt builders and the per-chunk output schemas for the generation pipeline.
 * See ARCHITECTURE.md §6 steps 3 & 5.
 *
 * The type mix (~70% MCQ / 30% True-False) is enforced BY CONSTRUCTION: the generator makes
 * one model call per type, each constrained to a schema whose `type` field is fixed to a
 * single value. This prevents the model from returning every item as an MCQ (which it did
 * when a single schema permitted either type on every item).
 */

import type { AgeBand } from '@shared/types'
import { countWords } from './chunker'

/** Reading guidance per age band, injected into the system prompt (see §6). */
const READING_GUIDANCE: Record<AgeBand, string> = {
  '5-7': 'very simple, short sentences using common everyday words',
  '8-9': 'simple, clear sentences',
  '10-11': 'plain language that can be a little richer, but still easy to read'
}

/**
 * Builds the system prompt: role, reading level for the age band, and the hard rules
 * every question must follow (shared by both the MCQ and True/False calls).
 */
export function buildSystemPrompt(params: { ageBand: AgeBand }): string {
  const guidance = READING_GUIDANCE[params.ageBand]
  return [
    `You are a friendly teacher writing quiz questions for a primary-school child aged ${params.ageBand}.`,
    `Write everything at this reading level: ${guidance}.`,
    'Follow these rules exactly:',
    '- Use simple vocabulary the child can read on their own.',
    '- Every question must be answerable using ONLY the text provided. Never rely on outside knowledge or facts not stated in the text.',
    '- Each question must cover a DIFFERENT fact from the text. Never ask about the same fact twice or reword an earlier question.',
    '- Give every question a single short, kid-friendly sentence explaining why the answer is correct.',
    '- Keep an encouraging, positive tone.',
    'Respond with ONLY the JSON described by the required schema — no extra text.'
  ].join('\n')
}

/** Renders a "<n> <noun>" phrase with correct pluralisation. */
function countPhrase(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

/** Shared "here is the text" preamble for the user prompts. */
function textBlock(chunkText: string): string[] {
  return ['Here is the text to base the questions on:', '"""', chunkText, '"""', '']
}

/** Max existing prompts to list, and per-prompt character cap, in the avoidance section. */
const MAX_AVOIDANCE_ITEMS = 20
const AVOIDANCE_ITEM_CHARS = 80

/** Trims and hard-caps a prompt to `n` chars for the avoidance list. */
function truncateTo(text: string, n: number): string {
  const trimmed = text.trim()
  return trimmed.length <= n ? trimmed : trimmed.slice(0, n).trimEnd()
}

/**
 * Word budget for the avoidance list. ~350 words normally, shrinking as the chunk approaches
 * the ~1200-word cap so the combined prompt still fits the 4096-token context — near-max
 * chunks get a much shorter list rather than overflowing.
 */
function avoidanceWordBudget(chunkWords: number): number {
  return Math.max(60, 350 - Math.max(0, chunkWords - 850))
}

/**
 * Appends a "do not repeat these" section listing existing prompts (newest first, each
 * truncated to 80 chars, up to 20 and within the word budget). No-op when there are none.
 */
function appendAvoidanceSection(
  lines: string[],
  existingPrompts: string[],
  chunkText: string
): void {
  if (existingPrompts.length === 0) return
  const budget = avoidanceWordBudget(countWords(chunkText))
  const items: string[] = []
  let words = 0
  // newest first
  for (let i = existingPrompts.length - 1; i >= 0; i--) {
    if (items.length >= MAX_AVOIDANCE_ITEMS) break
    const item = truncateTo(existingPrompts[i], AVOIDANCE_ITEM_CHARS)
    if (item.length === 0) continue
    const itemWords = countWords(item)
    if (items.length > 0 && words + itemWords > budget) break
    items.push(`- ${item}`)
    words += itemWords
  }
  if (items.length === 0) return
  lines.push(
    '',
    'Do not repeat these questions — every new question must ask about a different fact:',
    ...items
  )
}

/** Builds the user prompt for the MCQ call. */
export function buildMcqUserPrompt(params: {
  count: number
  chunkText: string
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `Write ${countPhrase(params.count, 'multiple-choice question')}, based only on the text above.`,
    'For each question set "type" to "mcq" and give exactly 4 entries in "options": one correct answer plus three wrong but plausible distractors of the same kind or category as the correct answer.',
    'Set "correctIndex" (a number from 0 to 3) to the position of the correct option.',
    'Each question must be about a different fact from the text. Include a one-sentence "explanation" for every question.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/** Builds the user prompt for the True/False call. */
export function buildTrueFalseUserPrompt(params: {
  count: number
  chunkText: string
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `Write ${countPhrase(params.count, 'true/false statement')} that a child can judge as True or False, based only on the text above.`,
    'Make roughly half of the statements false by changing a detail so the statement disagrees with the text; the rest should be true.',
    'For each statement set "type" to "truefalse", set "options" to exactly ["True", "False"], and set "correctIndex" to 0 if the statement is true or 1 if it is false.',
    'Each statement must be about a different fact from the text. Include a one-sentence "explanation" for every statement.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/**
 * Builds a per-chunk output schema whose questions are all of a single `type`. Expressed in
 * the plain JSON-Schema subset node-llama-cpp's GBNF grammar accepts: object/array/string/
 * integer types, `properties`/`required`, and a single-value `enum` to pin the type. No
 * `$ref`, no `oneOf`.
 */
function buildQuestionsSchema(typeValue: 'mcq' | 'truefalse'): object {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { enum: [typeValue] },
            prompt: { type: 'string' },
            options: {
              type: 'array',
              items: { type: 'string' }
            },
            correctIndex: { type: 'integer' },
            explanation: { type: 'string' }
          },
          required: ['type', 'prompt', 'options', 'correctIndex', 'explanation']
        }
      }
    },
    required: ['questions']
  }
}

/** Schema constraining every item to an MCQ question. */
export const mcqQuestionsSchema = buildQuestionsSchema('mcq')

/** Schema constraining every item to a True/False question. */
export const trueFalseQuestionsSchema = buildQuestionsSchema('truefalse')

/** Tiny schema for the suggested quiz-title call (ARCHITECTURE.md §16). */
export const titleSchema: object = {
  type: 'object',
  properties: {
    title: { type: 'string' }
  },
  required: ['title']
}

/**
 * Builds the prompt asking for a short, fun, kid-friendly quiz title for this text (§16).
 * Used for the one tiny extra generation call per run; its failure is non-fatal.
 */
export function buildTitlePrompt(chunkText: string): string {
  return [
    'Here is the text a quiz will be based on:',
    '"""',
    chunkText,
    '"""',
    '',
    'Suggest one short, fun, kid-friendly title for this quiz.',
    'Use at most 6 words. Do not use quotation marks or emoji. Put it in the "title" field.'
  ].join('\n')
}
