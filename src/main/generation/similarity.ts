/**
 * Near-duplicate prompt detection for the generation pipeline (ARCHITECTURE.md §6 step 4).
 *
 * Exact-match dedup cannot catch semantic paraphrases such as
 *   "Which of the following is NOT one of the main types of rainforest?"
 *   "Which of the following is NOT described as a type of rainforest?"
 *   "Which of the following is NOT a type of rainforest?"
 * These collapse to the same handful of content words, so we compare prompts on their
 * normalised content-word sets using the OVERLAP COEFFICIENT (|A∩B| / min(|A|,|B|)).
 *
 * The overlap coefficient (not Jaccard) is deliberate: it treats a short prompt whose
 * words are a subset of a longer one as a near-duplicate — which is exactly the trio
 * above ({type,rainforest} ⊂ {main,type,rainforest} → 1.0) — while legitimate sibling
 * questions that swap a single distinguishing word ("tropical" vs "temperate") stay at
 * 0.8 and are kept. Jaccard would score the trio ~0.58 and miss it.
 *
 * All functions are pure and side-effect free.
 */

/** Near-duplicate when the overlap coefficient reaches this. */
export const NEAR_DUPLICATE_THRESHOLD = 0.9

/**
 * Small English stopword list plus quiz-scaffolding words ("following", "one",
 * "described", "most") that carry no distinguishing meaning in a question prompt.
 */
const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'of', 'is', 'are', 'was', 'were', 'in', 'on', 'to', 'for',
  'and', 'or', 'which', 'what', 'who', 'where', 'when', 'how', 'does', 'do', 'it',
  'its', 'one', 'not', 'following', 'as', 'that', 'this', 'with', 'by', 'from',
  'described', 'most'
])

/** Lower-cases, strips punctuation, and collapses whitespace — keeping every word. */
export function normalizeFullPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Crude stem: drop a trailing "s" from words of length >= 4 (types -> type). */
function stem(word: string): string {
  return word.length >= 4 && word.endsWith('s') ? word.slice(0, -1) : word
}

/**
 * Reduces a prompt to its set of content words: lower-cased, punctuation-stripped,
 * whitespace-collapsed, with stopwords removed and a crude stem applied.
 */
export function normalizePromptWords(prompt: string): Set<string> {
  const content = new Set<string>()
  for (const word of normalizeFullPrompt(prompt).split(' ')) {
    if (word.length === 0 || STOPWORDS.has(word)) continue
    content.add(stem(word))
  }
  return content
}

/**
 * True when two prompts are near-duplicates: overlap coefficient of their content-word
 * sets >= {@link NEAR_DUPLICATE_THRESHOLD}. When either set is empty (a prompt made only
 * of stopwords), falls back to comparing the fully-normalised strings.
 */
export function arePromptsNearDuplicates(a: string, b: string): boolean {
  const setA = normalizePromptWords(a)
  const setB = normalizePromptWords(b)

  if (setA.size === 0 || setB.size === 0) {
    return normalizeFullPrompt(a) === normalizeFullPrompt(b)
  }

  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection += 1
  }
  const overlap = intersection / Math.min(setA.size, setB.size)
  return overlap >= NEAR_DUPLICATE_THRESHOLD
}

/**
 * The accept/reject core (pure, unit-testable). A candidate prompt is a duplicate if it is
 * an exact-normalised match OR a near-duplicate of any prompt in `existing` (existing
 * prompts for the text plus prompts accepted earlier in the same run).
 */
export function isDuplicatePrompt(candidate: string, existing: Iterable<string>): boolean {
  const candidateFull = normalizeFullPrompt(candidate)
  for (const prompt of existing) {
    if (normalizeFullPrompt(prompt) === candidateFull) return true
    if (arePromptsNearDuplicates(candidate, prompt)) return true
  }
  return false
}
