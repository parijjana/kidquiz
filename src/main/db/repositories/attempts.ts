import { getDb } from '../database'
import type { Attempt } from '@shared/types'

interface AttemptRow {
  id: number
  quiz_id: number
  child_name: string | null
  score: number
  total: number
  taken_at: string
}

function mapRow(row: AttemptRow): Attempt {
  return {
    id: row.id,
    quizId: row.quiz_id,
    childName: row.child_name,
    score: row.score,
    total: row.total,
    takenAt: row.taken_at
  }
}

export function record(
  quizId: number,
  childName: string | null,
  score: number,
  total: number
): number {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('total must be a non-negative integer.')
  }
  if (!Number.isInteger(score) || score < 0 || score > total) {
    throw new Error('score must be a non-negative integer no greater than total.')
  }

  const db = getDb()
  const info = db
    .prepare('INSERT INTO attempts (quiz_id, child_name, score, total) VALUES (?, ?, ?, ?)')
    .run(quizId, childName, score, total)
  return info.lastInsertRowid as number
}

export function list(quizId?: number): Attempt[] {
  const db = getDb()
  const rows =
    quizId === undefined
      ? (db.prepare('SELECT * FROM attempts ORDER BY taken_at DESC').all() as AttemptRow[])
      : (db
          .prepare('SELECT * FROM attempts WHERE quiz_id = ? ORDER BY taken_at DESC')
          .all(quizId) as AttemptRow[])
  return rows.map(mapRow)
}
