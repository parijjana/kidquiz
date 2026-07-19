/**
 * Hybrid sampling of a subject's (optionally chapter-scoped) approved question
 * bank for consolidated / dynamic quizzes. See ARCHITECTURE.md §4 and §15.
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
 * Picks up to `count` approved question ids for a subject's consolidated or
 * dynamic quiz. When `chapterId` is given, candidates are restricted to
 * questions whose text belongs to that chapter, and the guarantee below is
 * scoped to that chapter's texts only.
 *
 * Ordering favours less-used questions (times_used ASC, last_used_at ASC with
 * NULLs first, random tiebreak). When `count` is at least the number of
 * (chapter-scoped) texts, guarantees at least one question from every such
 * text that has an approved question, swapping in that text's least-used
 * question in place of the current pick's most-used duplicate-text entry.
 */
export function pickConsolidatedQuestions(
  subjectId: number,
  count: number,
  chapterId?: number
): number[] {
  const db = getDb()

  const textIdRows = (
    chapterId === undefined
      ? db.prepare('SELECT id FROM texts WHERE subject_id = ?').all(subjectId)
      : db
          .prepare('SELECT id FROM texts WHERE subject_id = ? AND chapter_id = ?')
          .all(subjectId, chapterId)
  ) as { id: number }[]
  const textIds = textIdRows.map((row) => row.id)

  const approved = (
    chapterId === undefined
      ? db
          .prepare(
            `SELECT id, text_id as textId, times_used as timesUsed, last_used_at as lastUsedAt
             FROM questions
             WHERE subject_id = ? AND approved = 1
             ORDER BY times_used ASC, last_used_at ASC, RANDOM()`
          )
          .all(subjectId)
      : db
          .prepare(
            `SELECT q.id, q.text_id as textId, q.times_used as timesUsed, q.last_used_at as lastUsedAt
             FROM questions q
             JOIN texts t ON t.id = q.text_id
             WHERE q.subject_id = ? AND q.approved = 1 AND t.chapter_id = ?
             ORDER BY q.times_used ASC, q.last_used_at ASC, RANDOM()`
          )
          .all(subjectId, chapterId)
  ) as CandidateRow[]

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
