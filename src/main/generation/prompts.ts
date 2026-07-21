/**
 * Prompt builders and the per-chunk output schemas for the generation pipeline.
 * See ARCHITECTURE.md §6 & §15.
 *
 * Two modes:
 * - 'generate' — write new questions from a reading text (uncapped: as many good questions as
 *   the text supports, bounded only by per-chunk schema ceilings).
 * - 'import' — the pasted text is already a set of questions; reformat the complete ones into
 *   bank questions, inventing plausible distractors only where missing.
 *
 * In both modes the ~70% MCQ / 30% True-False split is enforced BY CONSTRUCTION: the generator
 * makes one model call per type, each constrained to a schema whose `type` field is fixed to a
 * single value, so the model can't collapse everything into one type.
 */

import type { AgeBand, GenerationOptions } from '@shared/types'
import { countWords } from './chunker'

type GenerationMode = GenerationOptions['mode']

/** Reading guidance per age band, injected into the system prompt (see §6). */
const READING_GUIDANCE: Record<AgeBand, string> = {
  '5-7': 'very simple, short sentences using common everyday words',
  '8-9': 'simple, clear sentences',
  '10-11': 'plain language that can be a little richer, but still easy to read'
}

/**
 * Builds the system prompt: role, reading level for the age band, and the hard rules for the
 * mode. Shared by that mode's MCQ and True/False calls. The age band governs language
 * simplification in both modes.
 */
export function buildSystemPrompt(params: { ageBand: AgeBand; mode: GenerationMode }): string {
  const guidance = READING_GUIDANCE[params.ageBand]
  if (params.mode === 'import') {
    return [
      `You are a friendly teacher preparing quiz questions for a primary-school child aged ${params.ageBand}.`,
      'The text below is already a set of quiz questions (in any format — numbered lists, question/answer pairs, worksheet quizzes). Reformat the questions it contains.',
      `Write everything at this reading level: ${guidance}.`,
      'Follow these rules exactly:',
      '- Only reformat questions that actually appear in the text. NEVER invent new questions that are not there.',
      "- Preserve each original question's meaning, its correct answer, and its difficulty. Simplify only the wording to the reading level.",
      '- A question may be cut off at the very start or end of the text; ignore any incomplete fragment you cannot reformat faithfully.',
      '- Keep an encouraging, positive tone.',
      'Respond with ONLY the JSON described by the required schema — no extra text.'
    ].join('\n')
  }
  return [
    `You are a friendly teacher writing quiz questions for a primary-school child aged ${params.ageBand}.`,
    `Write everything at this reading level: ${guidance}.`,
    'Follow these rules exactly:',
    '- Use simple vocabulary the child can read on their own.',
    '- Every question must be answerable using ONLY the text provided. Never rely on outside knowledge or facts not stated in the text.',
    '- Each question must cover a DIFFERENT fact from the text. Never ask about the same fact twice or reword an earlier question.',
    '- Cover every distinct fact worth testing, but favour quality over quantity: stop when the facts run out rather than padding with trivial or repetitive questions.',
    '- Give every question a single short, kid-friendly sentence explaining why the answer is correct.',
    '- Keep an encouraging, positive tone.',
    'Respond with ONLY the JSON described by the required schema — no extra text.'
  ].join('\n')
}

/** Shared "here is the text" preamble for the user prompts. */
function textBlock(chunkText: string): string[] {
  return ['Here is the text:', '"""', chunkText, '"""', '']
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

/** Builds the user prompt for the 'generate' MCQ call. `maxItems` mirrors the schema ceiling. */
export function buildMcqUserPrompt(params: {
  chunkText: string
  maxItems: number
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `Write up to ${params.maxItems} good multiple-choice questions — as many as the text supports, covering every distinct fact worth testing, based only on the text above.`,
    'Quality over quantity: stop when the facts run out. Do not pad with trivial, obvious, or repetitive questions.',
    'For each question set "type" to "mcq" and give exactly 4 entries in "options": one correct answer plus three wrong but plausible distractors of the same kind or category as the correct answer.',
    'Set "correctIndex" (a number from 0 to 3) to the position of the correct option.',
    'Each question must be about a different fact from the text. Include a one-sentence "explanation" for every question.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/** Builds the user prompt for the 'generate' True/False call. `maxItems` mirrors the ceiling. */
export function buildTrueFalseUserPrompt(params: {
  chunkText: string
  maxItems: number
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `Write up to ${params.maxItems} good true/false statements — as many as the text supports, covering distinct facts a child can judge as True or False, based only on the text above.`,
    'Quality over quantity: stop when the facts run out. Do not pad with trivial, obvious, or repetitive statements.',
    'Make roughly half of the statements false by changing a detail so the statement disagrees with the text; the rest should be true.',
    'For each statement set "type" to "truefalse", set "prompt" to the statement, and set "correct" to true if the statement is true according to the text or false if it is not.',
    'Each statement must be about a different fact from the text. Include a one-sentence "explanation" for every statement.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/** Builds the user prompt for the 'import' MCQ call: reformat existing questions into MCQ. */
export function buildImportMcqUserPrompt(params: {
  chunkText: string
  maxItems: number
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `The text above already contains quiz questions. Turn each COMPLETE question that fits a multiple-choice shape into an "mcq" question (up to ${params.maxItems}).`,
    'A question that already lists options: keep its original correct answer; if it has fewer than 4 options, add plausible wrong distractors of the same kind until there are exactly 4.',
    'An open question with a single factual answer: use that answer as the correct option and invent three plausible same-category distractors.',
    'Set "type" to "mcq", give exactly 4 entries in "options", and set "correctIndex" (0 to 3) to the correct option.',
    'For "explanation", use the answer or explanation the source gives if any, otherwise write one simple sentence.',
    'Do NOT invent questions that are not in the text. Skip incomplete fragments at the start or end of the text.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/** Builds the user prompt for the 'import' True/False call: reformat true/false-style items. */
export function buildImportTrueFalseUserPrompt(params: {
  chunkText: string
  maxItems: number
  existingPrompts?: string[]
}): string {
  const lines = [
    ...textBlock(params.chunkText),
    `The text above already contains quiz questions. Turn each COMPLETE true/false-style statement into a "truefalse" question (up to ${params.maxItems}).`,
    'Set "type" to "truefalse", set "prompt" to the statement, and set "correct" to true for a true statement or false for a false one, matching the source\'s answer.',
    'For "explanation", use the answer or explanation the source gives if any, otherwise write one simple sentence.',
    'Only convert items that are genuinely true/false in the text. Do NOT invent questions. Skip incomplete fragments at the start or end of the text.'
  ]
  appendAvoidanceSection(lines, params.existingPrompts ?? [], params.chunkText)
  return lines.join('\n')
}

/**
 * Wraps a per-item schema in the `{questions: [...]}` envelope, bounded by `maxItems` (and
 * `minItems: 0`, since an information-thin chunk may legitimately yield few or none). The
 * grammar is created per call, so the caller passes a word-count-driven `maxItems` each time.
 * Everything stays in the plain JSON-Schema subset node-llama-cpp's GBNF grammar accepts:
 * object/array/string/integer/boolean types, `properties`/`required`, `minItems`/`maxItems`,
 * and single-value `enum`s. No `$ref`, no `oneOf`.
 */
function wrapQuestionsSchema(itemSchema: object, maxItems: number): object {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 0,
        maxItems,
        items: itemSchema
      }
    },
    required: ['questions']
  }
}

/**
 * MCQ output schema capped at `maxItems` questions for this chunk. The `options` array is
 * pinned to EXACTLY 4 strings (`minItems`/`maxItems`) — without this, small quantized models
 * take the shortest legal path and emit `"options": []`, which validation then drops (§6.3).
 */
export function mcqQuestionsSchema(maxItems: number): object {
  return wrapQuestionsSchema(
    {
      type: 'object',
      properties: {
        type: { enum: ['mcq'] },
        prompt: { type: 'string' },
        options: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: { type: 'string' }
        },
        correctIndex: { type: 'integer' },
        explanation: { type: 'string' }
      },
      required: ['type', 'prompt', 'options', 'correctIndex', 'explanation']
    },
    maxItems
  )
}

/**
 * True/False output schema capped at `maxItems` statements for this chunk. The model emits a
 * boolean `correct` and NO options/correctIndex — letting a small model free-type the two
 * option strings reliably produced non-"True"/"False" values that were then dropped (§6.3).
 * `generator.ts` supplies `options:["True","False"]` and `correctIndex = correct ? 0 : 1`.
 */
export function trueFalseQuestionsSchema(maxItems: number): object {
  return wrapQuestionsSchema(
    {
      type: 'object',
      properties: {
        type: { enum: ['truefalse'] },
        prompt: { type: 'string' },
        correct: { type: 'boolean' },
        explanation: { type: 'string' }
      },
      required: ['type', 'prompt', 'correct', 'explanation']
    },
    maxItems
  )
}

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
