/**
 * Hybrid sampling of a subject's whole approved question bank for consolidated
 * quizzes. See ARCHITECTURE.md §4.
 */

import { getDb } from '../db/database'

interface CandidateRow {
  id: number
  textId: number
  timesUsed: number
  lastUsedAt: string | null
}

/** Ascending "usage" order: fewer times used first, then least-recently used first (NULLs first). */
function compareByUsageAsc(a: CandidateRow, b: CandidateRow): number {
  if (a.timesUsed !== b.timesUsed) return a.timesUsed - b.timesUsed
  if (a.lastUsedAt === b.lastUsedAt) return 0
  if (a.lastUsedAt === null) return -1
  if (b.lastUsedAt === null) return 1
  return a.lastUsedAt < b.lastUsedAt ? -1 : 1
}

/**
 * Picks up to `count` approved question ids for a subject's consolidated quiz.
 *
 * Ordering favours less-used questions (times_used ASC, last_used_at ASC with
 * NULLs first, random tiebreak). When `count` is at least the number of texts
 * in the subject, guarantees at least one question from every text that has
 * an approved question, swapping in that text's least-used question in place
 * of the current pick's most-used duplicate-text entry.
 */
export function pickConsolidatedQuestions(subjectId: number, count: number): number[] {
  const db = getDb()

  const textIds = (
    db.prepare('SELECT id FROM texts WHERE subject_id = ?').all(subjectId) as { id: number }[]
  ).map((row) => row.id)

  const approved = db
    .prepare(
      `SELECT id, text_id as textId, times_used as timesUsed, last_used_at as lastUsedAt
       FROM questions
       WHERE subject_id = ? AND approved = 1
       ORDER BY times_used ASC, last_used_at ASC, RANDOM()`
    )
    .all(subjectId) as CandidateRow[]

  if (approved.length === 0) return []

  const n = Math.min(Math.max(count, 0), approved.length)
  const picks = approved.slice(0, n)

  if (count >= textIds.length) {
    for (const textId of textIds) {
      if (picks.some((p) => p.textId === textId)) continue

      const pickedIds = new Set(picks.map((p) => p.id))
      const candidate = approved
        .filter((q) => q.textId === textId && !pickedIds.has(q.id))
        .sort(compareByUsageAsc)[0]
      if (!candidate) continue // this text has no approved question; cannot guarantee it

      // Only drop picks whose text has more than one representative, so we never
      // un-represent a text we've already guaranteed earlier in this loop.
      const textCounts = new Map<number, number>()
      for (const p of picks) textCounts.set(p.textId, (textCounts.get(p.textId) ?? 0) + 1)

      const eligible = picks
        .map((_, idx) => idx)
        .filter((idx) => (textCounts.get(picks[idx].textId) ?? 0) > 1)
      const dropPool = eligible.length > 0 ? eligible : picks.map((_, idx) => idx)

      let dropIdx = dropPool[0]
      for (const idx of dropPool) {
        if (compareByUsageAsc(picks[idx], picks[dropIdx]) > 0) dropIdx = idx
      }

      picks.splice(dropIdx, 1)
      picks.push(candidate)
    }
  }

  return picks.map((p) => p.id)
}
