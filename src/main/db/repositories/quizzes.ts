import type Database from 'better-sqlite3'
import { getDb } from '../database'
import { mapQuestionRow } from './questions'
import { pickConsolidatedQuestions } from '../../generation/consolidate'
import type { Quiz, QuizKind, QuizWithQuestions } from '@shared/types'

interface QuizRow {
  id: number
  subject_id: number
  chapter_id: number | null
  name: string
  kind: QuizKind
  created_at: string
}

function mapQuizRow(row: QuizRow): Quiz {
  return {
    id: row.id,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at
  }
}

function getQuizRow(db: Database.Database, id: number): QuizRow {
  const row = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) as QuizRow | undefined
  if (!row) throw new Error(`Quiz ${id} not found.`)
  return row
}

/**
 * Resolves quiz-name collisions within a subject (§15): "Name", "Name (2)",
 * "Name (3)"... `excludeQuizId` lets a rename ignore the quiz's own current row.
 */
function resolveUniqueQuizName(
  db: Database.Database,
  subjectId: number,
  desiredName: string,
  excludeQuizId?: number
): string {
  const rows = (
    excludeQuizId === undefined
      ? db.prepare('SELECT name FROM quizzes WHERE subject_id = ?').all(subjectId)
      : db
          .prepare('SELECT name FROM quizzes WHERE subject_id = ? AND id != ?')
          .all(subjectId, excludeQuizId)
  ) as { name: string }[]

  const existingNames = new Set(rows.map((r) => r.name))
  if (!existingNames.has(desiredName)) return desiredName

  let suffix = 2
  while (existingNames.has(`${desiredName} (${suffix})`)) suffix++
  return `${desiredName} (${suffix})`
}

function defaultDynamicQuizName(
  db: Database.Database,
  subjectId: number,
  chapterId: number | null
): string {
  if (chapterId !== null) {
    const chapterRow = db.prepare('SELECT name FROM chapters WHERE id = ?').get(chapterId) as
      | { name: string }
      | undefined
    if (chapterRow) return `${chapterRow.name} quiz`
  }
  const subjectRow = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as
    | { name: string }
    | undefined
  return `${subjectRow ? subjectRow.name : 'Quiz'} quiz`
}

function assertChapterBelongsToSubject(
  db: Database.Database,
  chapterId: number,
  subjectId: number
): void {
  const row = db.prepare('SELECT subject_id FROM chapters WHERE id = ?').get(chapterId) as
    | { subject_id: number }
    | undefined
  if (!row) throw new Error(`Chapter ${chapterId} not found.`)
  if (row.subject_id !== subjectId) {
    throw new Error("Chapter does not belong to this quiz's subject.")
  }
}

/**
 * Inserts a quiz (auto-suffixing its name on collision, §15) with the given
 * questions (in order), and — per ARCHITECTURE.md §4 — increments times_used
 * and sets last_used_at on every question placed in it. All in one transaction.
 */
function insertQuiz(
  db: Database.Database,
  subjectId: number,
  chapterId: number | null,
  name: string,
  kind: QuizKind,
  questionIds: number[]
): number {
  const finalName = resolveUniqueQuizName(db, subjectId, name)

  const insertQuizStmt = db.prepare(
    'INSERT INTO quizzes (subject_id, chapter_id, name, kind) VALUES (?, ?, ?, ?)'
  )
  const insertQuizQuestionStmt = db.prepare(
    'INSERT INTO quiz_questions (quiz_id, question_id, position) VALUES (?, ?, ?)'
  )
  const touchQuestionStmt = db.prepare(
    "UPDATE questions SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?"
  )

  const createTxn = db.transaction((ids: number[]): number => {
    const info = insertQuizStmt.run(subjectId, chapterId, finalName, kind)
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

  return insertQuiz(db, subjectId, null, name, kind, questionIds)
}

export function createConsolidated(subjectId: number, name: string, count: number): number {
  const questionIds = pickConsolidatedQuestions(subjectId, count)
  if (questionIds.length === 0) {
    throw new Error('No approved questions are available for this subject yet.')
  }

  const db = getDb()
  return insertQuiz(db, subjectId, null, name, 'consolidated', questionIds)
}

/**
 * Samples `count` approved questions from the subject's bank (or, when
 * `chapterId` is given, from that chapter's texts only) and materializes them
 * as a new quiz (§15). "The bank is not the quiz" — the same bank can back
 * many dynamic quizzes of different lengths.
 */
export function createDynamic(
  subjectId: number,
  chapterId: number | null,
  count: number,
  name?: string
): number {
  const db = getDb()

  if (chapterId !== null) {
    assertChapterBelongsToSubject(db, chapterId, subjectId)
  }

  const questionIds = pickConsolidatedQuestions(subjectId, count, chapterId ?? undefined)
  if (questionIds.length === 0) {
    throw new Error('No approved questions are available for this selection yet.')
  }

  const trimmedName = name?.trim()
  const finalName = trimmedName ? trimmedName : defaultDynamicQuizName(db, subjectId, chapterId)

  return insertQuiz(db, subjectId, chapterId, finalName, 'dynamic', questionIds)
}

/** Reassigns a saved quiz to a (possibly null) chapter of the same subject; supports drag-to-reassign. */
export function setChapter(quizId: number, chapterId: number | null): void {
  const db = getDb()
  const quiz = getQuizRow(db, quizId)

  if (chapterId !== null) {
    assertChapterBelongsToSubject(db, chapterId, quiz.subject_id)
  }

  db.prepare('UPDATE quizzes SET chapter_id = ? WHERE id = ?').run(chapterId, quizId)
}

/** Renames a saved quiz, applying the same collision-suffix rule as quiz creation (§15). */
export function updateName(quizId: number, name: string): Quiz {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Quiz name cannot be empty.')

  const db = getDb()
  const quiz = getQuizRow(db, quizId)
  const finalName = resolveUniqueQuizName(db, quiz.subject_id, trimmed, quizId)

  db.prepare('UPDATE quizzes SET name = ? WHERE id = ?').run(finalName, quizId)
  return mapQuizRow(getQuizRow(db, quizId))
}

/**
 * Full replacement of a saved quiz's questions (§15 quiz editing): positions
 * follow array order, every id must be approved, and — unlike creation — this
 * does NOT bump times_used/last_used_at.
 */
export function setQuestions(quizId: number, questionIds: number[]): void {
  if (questionIds.length === 0) {
    throw new Error('A quiz must have at least one question.')
  }

  const db = getDb()
  getQuizRow(db, quizId)

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

  const deleteStmt = db.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?')
  const insertStmt = db.prepare(
    'INSERT INTO quiz_questions (quiz_id, question_id, position) VALUES (?, ?, ?)'
  )

  const replaceTxn = db.transaction((ids: number[]) => {
    deleteStmt.run(quizId)
    ids.forEach((questionId, position) => {
      insertStmt.run(quizId, questionId, position)
    })
  })

  replaceTxn(questionIds)
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
  const quizRow = getQuizRow(db, id)

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
