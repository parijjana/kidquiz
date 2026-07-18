/**
 * Text chunking for the generation pipeline. See ARCHITECTURE.md §6 step 1.
 *
 * Splits a body of text into chunks of at most ~1200 words, preferring paragraph
 * boundaries. A single paragraph that is larger than the limit is broken on sentence
 * boundaries. A tiny trailing chunk (<150 words) is merged back into the previous chunk
 * so the model is never asked to generate questions from a scrap of text.
 *
 * Pure and side-effect free — safe to unit test in isolation.
 */

/** Soft upper bound on words per chunk. */
export const MAX_CHUNK_WORDS = 1200

/** A final chunk smaller than this is merged into the previous chunk. */
export const MIN_TRAILING_WORDS = 150

/** Counts whitespace-delimited words in a string. */
export function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g)
  return matches === null ? 0 : matches.length
}

/**
 * Splits an oversized paragraph into pieces of at most {@link MAX_CHUNK_WORDS} words,
 * breaking on sentence boundaries. A single sentence longer than the limit becomes its
 * own (over-limit) piece — there is no finer boundary to fall back to.
 */
function splitParagraphBySentences(paragraph: string): string[] {
  const sentences =
    paragraph.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [paragraph]
  const pieces: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const raw of sentences) {
    const sentence = raw.trim()
    if (sentence.length === 0) continue
    const words = countWords(sentence)
    if (currentWords > 0 && currentWords + words > MAX_CHUNK_WORDS) {
      pieces.push(current.join(' '))
      current = []
      currentWords = 0
    }
    current.push(sentence)
    currentWords += words
  }
  if (current.length > 0) pieces.push(current.join(' '))
  return pieces
}

/**
 * Splits `text` into chunks of at most ~{@link MAX_CHUNK_WORDS} words on paragraph
 * boundaries (falling back to sentence boundaries for a single huge paragraph), then
 * merges a final chunk under {@link MIN_TRAILING_WORDS} words into the previous one.
 *
 * @returns An ordered list of chunk strings. Empty input yields an empty array.
 */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  const flush = (): void => {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'))
      current = []
      currentWords = 0
    }
  }

  for (const paragraph of paragraphs) {
    const words = countWords(paragraph)

    if (words > MAX_CHUNK_WORDS) {
      // Paragraph alone exceeds the limit: flush what we have, then split it by sentence.
      flush()
      for (const piece of splitParagraphBySentences(paragraph)) {
        chunks.push(piece)
      }
      continue
    }

    if (currentWords > 0 && currentWords + words > MAX_CHUNK_WORDS) {
      flush()
    }
    current.push(paragraph)
    currentWords += words
  }
  flush()

  // Merge a tiny trailing chunk into its predecessor (intentionally allowed to exceed
  // MAX_CHUNK_WORDS — a slightly large chunk beats a starved one).
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    if (countWords(last) < MIN_TRAILING_WORDS) {
      const previous = chunks[chunks.length - 2]
      chunks.splice(chunks.length - 2, 2, `${previous}\n\n${last}`)
    }
  }

  return chunks
}
