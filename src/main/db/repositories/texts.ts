import { getDb } from '../database'
import type { TextEntry } from '@shared/types'

interface TextRow {
  id: number
  subject_id: number
  chapter_id: number | null
  title: string
  content: string
  suggested_quiz_name: string | null
  created_at: string
}

function mapRow(row: TextRow): TextEntry {
  return {
    id: row.id,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    title: row.title,
    content: row.content,
    suggestedQuizName: row.suggested_quiz_name,
    createdAt: row.created_at
  }
}

/** Throws if `chapterId` doesn't exist or belongs to a different subject. */
function assertChapterBelongsToSubject(chapterId: number, subjectId: number): void {
  const db = getDb()
  const row = db.prepare('SELECT subject_id FROM chapters WHERE id = ?').get(chapterId) as
    | { subject_id: number }
    | undefined
  if (!row) throw new Error(`Chapter ${chapterId} not found.`)
  if (row.subject_id !== subjectId) {
    throw new Error('Chapter does not belong to this subject.')
  }
}

export function getById(id: number): TextEntry {
  const db = getDb()
  const row = db.prepare('SELECT * FROM texts WHERE id = ?').get(id) as TextRow | undefined
  if (!row) throw new Error(`Text ${id} not found.`)
  return mapRow(row)
}

export function add(
  subjectId: number,
  title: string,
  content: string,
  chapterId: number | null = null
): number {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('Text title cannot be empty.')
  if (!content.trim()) throw new Error('Text content cannot be empty.')
  if (chapterId !== null) assertChapterBelongsToSubject(chapterId, subjectId)

  const db = getDb()
  const info = db
    .prepare('INSERT INTO texts (subject_id, chapter_id, title, content) VALUES (?, ?, ?, ?)')
    .run(subjectId, chapterId, trimmedTitle, content)
  return info.lastInsertRowid as number
}

export function listBySubject(subjectId: number): TextEntry[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM texts WHERE subject_id = ? ORDER BY created_at ASC')
    .all(subjectId) as TextRow[]
  return rows.map(mapRow)
}

export function setChapter(id: number, chapterId: number | null): void {
  const text = getById(id)
  if (chapterId !== null) assertChapterBelongsToSubject(chapterId, text.subjectId)

  const db = getDb()
  db.prepare('UPDATE texts SET chapter_id = ? WHERE id = ?').run(chapterId, id)
}

/**
 * Stores the model-suggested quiz title from generation (§16). NOT part of the
 * IPC contract — main-process-internal, called by the generation pipeline.
 */
export function setSuggestedQuizName(id: number, name: string): void {
  const db = getDb()
  db.prepare('UPDATE texts SET suggested_quiz_name = ? WHERE id = ?').run(name, id)
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM texts WHERE id = ?').run(id)
}
