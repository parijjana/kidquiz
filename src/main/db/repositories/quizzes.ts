import type Database from 'better-sqlite3'
import { getDb } from '../database'
import { mapQuestionRow } from './questions'
import { pickConsolidatedQuestions } from '../../generation/consolidate'
import type { Quiz, QuizKind, QuizWithQuestions } from '@shared/types'

interface QuizRow {
  id: number
  subject_id: number
  name: string
  kind: QuizKind
  created_at: string
}

function mapQuizRow(row: QuizRow): Quiz {
  return {
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at
  }
}

/**
 * Inserts a quiz with the given questions (in order), and — per ARCHITECTURE.md
 * §4 — increments times_used and sets last_used_at on every question placed in
 * it. All in one transaction.
 */
function insertQuiz(
  db: Database.Database,
  subjectId: number,
  name: string,
  kind: QuizKind,
  questionIds: number[]
): number {
  const insertQuizStmt = db.prepare('INSERT INTO quizzes (subject_id, name, kind) VALUES (?, ?, ?)')
  const insertQuizQuestionStmt = db.prepare(
    'INSERT INTO quiz_questions (quiz_id, question_id, position) VALUES (?, ?, ?)'
  )
  const touchQuestionStmt = db.prepare(
    "UPDATE questions SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?"
  )

  const createTxn = db.transaction((ids: number[]): number => {
    const info = insertQuizStmt.run(subjectId, name, kind)
    const quizId = info.lastInsertRowid as number
    ids.forEach((questionId, position) => {
      insertQuizQuestionStmt.run(quizId, questionId, position)
      touchQuestionStmt.run(questionId)
    })
    return quizId
  })

  return createTxn(questionIds)
}

export function createFromQuestions(
  subjectId: number,
  name: string,
  kind: QuizKind,
  questionIds: number[]
): number {
  if (questionIds.length === 0) {
    throw new Error('Cannot create a quiz with no questions.')
  }

  const db = getDb()
  const placeholders = questionIds.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, approved FROM questions WHERE id IN (${placeholders})`)
    .all(...questionIds) as { id: number; approved: number }[]

  const foundIds = new Set(rows.map((r) => r.id))
  const missing = questionIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Question(s) not found: ${missing.join(', ')}`)
  }

  const unapproved = rows.filter((r) => r.approved === 0).map((r) => r.id)
  if (unapproved.length > 0) {
    throw new Error(`Cannot add unapproved question(s) to a quiz: ${unapproved.join(', ')}`)
  }

  return insertQuiz(db, subjectId, name, kind, questionIds)
}

export function createConsolidated(subjectId: number, name: string, count: number): number {
  const questionIds = pickConsolidatedQuestions(subjectId, count)
  if (questionIds.length === 0) {
    throw new Error('No approved questions are available for this subject yet.')
  }

  const db = getDb()
  return insertQuiz(db, subjectId, name, 'consolidated', questionIds)
}

export function list(subjectId?: number): Quiz[] {
  const db = getDb()
  const rows =
    subjectId === undefined
      ? (db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all() as QuizRow[])
      : (db
          .prepare('SELECT * FROM quizzes WHERE subject_id = ? ORDER BY created_at DESC')
          .all(subjectId) as QuizRow[])
  return rows.map(mapQuizRow)
}

export function get(id: number): QuizWithQuestions {
  const db = getDb()
  const quizRow = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) as QuizRow | undefined
  if (!quizRow) throw new Error(`Quiz ${id} not found.`)

  const questionRows = db
    .prepare(
      `SELECT q.*
       FROM questions q
       JOIN quiz_questions qq ON qq.question_id = q.id
       WHERE qq.quiz_id = ?
       ORDER BY qq.position ASC`
    )
    .all(id) as Parameters<typeof mapQuestionRow>[0][]

  return { ...mapQuizRow(quizRow), questions: questionRows.map(mapQuestionRow) }
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(id)
}
