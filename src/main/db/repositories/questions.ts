import { getDb } from '../database'
import type { Question, QuestionPatch, QuestionType } from '@shared/types'

interface QuestionRow {
  id: number
  subject_id: number
  text_id: number | null
  type: QuestionType
  prompt: string
  options_json: string
  correct_index: number
  explanation: string | null
  approved: number
  times_used: number
  last_used_at: string | null
  created_at: string
}

export function mapQuestionRow(row: QuestionRow): Question {
  return {
    id: row.id,
    subjectId: row.subject_id,
    textId: row.text_id,
    type: row.type,
    prompt: row.prompt,
    options: JSON.parse(row.options_json) as string[],
    correctIndex: row.correct_index,
    explanation: row.explanation,
    approved: row.approved === 1,
    timesUsed: row.times_used,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at
  }
}

export function getById(id: number): Question {
  const db = getDb()
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as
    | QuestionRow
    | undefined
  if (!row) throw new Error(`Question ${id} not found.`)
  return mapQuestionRow(row)
}

export function listBySubject(subjectId: number): Question[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM questions WHERE subject_id = ? ORDER BY created_at ASC')
    .all(subjectId) as QuestionRow[]
  return rows.map(mapQuestionRow)
}

export function listByText(textId: number): Question[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM questions WHERE text_id = ? ORDER BY created_at ASC')
    .all(textId) as QuestionRow[]
  return rows.map(mapQuestionRow)
}

/** Validates a would-be question shape per ARCHITECTURE.md §4; throws human-readable errors. */
function validateShape(
  type: QuestionType,
  prompt: string,
  options: string[],
  correctIndex: number
): void {
  if (!prompt.trim()) {
    throw new Error('Question prompt cannot be empty.')
  }

  if (type === 'mcq') {
    if (options.length !== 4) {
      throw new Error('MCQ questions must have exactly 4 options.')
    }
    if (options.some((option) => option.trim().length === 0)) {
      throw new Error('MCQ options cannot be empty.')
    }
    const normalized = options.map((option) => option.trim().toLowerCase())
    if (new Set(normalized).size !== normalized.length) {
      throw new Error('Answer options must all be different.')
    }
  } else {
    if (options.length !== 2 || options[0] !== 'True' || options[1] !== 'False') {
      throw new Error('True/False questions must have options exactly ["True", "False"].')
    }
  }

  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    throw new Error('correctIndex must be a valid index into options.')
  }
}

export function update(id: number, patch: QuestionPatch): Question {
  const current = getById(id)
  const next: Question = { ...current, ...patch }

  validateShape(next.type, next.prompt, next.options, next.correctIndex)

  const db = getDb()
  db.prepare(
    `UPDATE questions
     SET type = ?, prompt = ?, options_json = ?, correct_index = ?, explanation = ?
     WHERE id = ?`
  ).run(next.type, next.prompt, JSON.stringify(next.options), next.correctIndex, next.explanation, id)

  return getById(id)
}

/** Inserts a newly generated question; validated the same way `update` validates edits. */
export function insert(input: {
  subjectId: number
  textId: number
  type: QuestionType
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string | null
  approved?: boolean
}): number {
  validateShape(input.type, input.prompt, input.options, input.correctIndex)

  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO questions
         (subject_id, text_id, type, prompt, options_json, correct_index, explanation, approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.subjectId,
      input.textId,
      input.type,
      input.prompt,
      JSON.stringify(input.options),
      input.correctIndex,
      input.explanation,
      input.approved ? 1 : 0
    )
  return info.lastInsertRowid as number
}

export function setApproved(ids: number[], approved: boolean): void {
  if (ids.length === 0) return

  const db = getDb()
  const stmt = db.prepare('UPDATE questions SET approved = ? WHERE id = ?')
  const setApprovedTxn = db.transaction((idList: number[]) => {
    for (const id of idList) {
      stmt.run(approved ? 1 : 0, id)
    }
  })
  setApprovedTxn(ids)
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM questions WHERE id = ?').run(id)
}
