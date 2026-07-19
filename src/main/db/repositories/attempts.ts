import { getDb } from '../database'
import type { Attempt, AttemptAnswer, AttemptAnswerInput } from '@shared/types'

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

interface AttemptAnswerRow {
  attempt_id: number
  question_id: number
  position: number
  chosen_index: number
  correct: number
}

function mapAnswerRow(row: AttemptAnswerRow): AttemptAnswer {
  return {
    attemptId: row.attempt_id,
    questionId: row.question_id,
    position: row.position,
    chosenIndex: row.chosen_index,
    correct: row.correct === 1
  }
}

/**
 * Records an attempt plus its per-question answers (§15 attempt_answers) in
 * one transaction; position = array order.
 */
export function record(
  quizId: number,
  childName: string | null,
  score: number,
  total: number,
  answers: AttemptAnswerInput[]
): number {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('total must be a non-negative integer.')
  }
  if (!Number.isInteger(score) || score < 0 || score > total) {
    throw new Error('score must be a non-negative integer no greater than total.')
  }
  if (answers.length !== total) {
    throw new Error('answers length must equal total.')
  }

  const db = getDb()
  const insertAttemptStmt = db.prepare(
    'INSERT INTO attempts (quiz_id, child_name, score, total) VALUES (?, ?, ?, ?)'
  )
  const insertAnswerStmt = db.prepare(
    `INSERT INTO attempt_answers (attempt_id, question_id, position, chosen_index, correct)
     VALUES (?, ?, ?, ?, ?)`
  )

  const recordTxn = db.transaction((answerList: AttemptAnswerInput[]): number => {
    const info = insertAttemptStmt.run(quizId, childName, score, total)
    const attemptId = info.lastInsertRowid as number
    answerList.forEach((answer, position) => {
      insertAnswerStmt.run(
        attemptId,
        answer.questionId,
        position,
        answer.chosenIndex,
        answer.correct ? 1 : 0
      )
    })
    return attemptId
  })

  return recordTxn(answers)
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

export function answers(attemptId: number): AttemptAnswer[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY position ASC')
    .all(attemptId) as AttemptAnswerRow[]
  return rows.map(mapAnswerRow)
}
