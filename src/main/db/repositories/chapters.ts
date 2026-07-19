import { getDb } from '../database'
import type { Chapter } from '@shared/types'

interface ChapterRow {
  id: number
  subject_id: number
  name: string
  created_at: string
}

function mapRow(row: ChapterRow): Chapter {
  return { id: row.id, subjectId: row.subject_id, name: row.name, createdAt: row.created_at }
}

export function getById(id: number): Chapter {
  const db = getDb()
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as ChapterRow | undefined
  if (!row) throw new Error(`Chapter ${id} not found.`)
  return mapRow(row)
}

export function list(subjectId: number): Chapter[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM chapters WHERE subject_id = ? ORDER BY name COLLATE NOCASE ASC')
    .all(subjectId) as ChapterRow[]
  return rows.map(mapRow)
}

export function create(subjectId: number, name: string): Chapter {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Chapter name cannot be empty.')

  const db = getDb()
  const info = db
    .prepare('INSERT INTO chapters (subject_id, name) VALUES (?, ?)')
    .run(subjectId, trimmed)
  return getById(info.lastInsertRowid as number)
}

export function rename(id: number, name: string): Chapter {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Chapter name cannot be empty.')

  const db = getDb()
  const info = db.prepare('UPDATE chapters SET name = ? WHERE id = ?').run(trimmed, id)
  if (info.changes === 0) throw new Error(`Chapter ${id} not found.`)
  return getById(id)
}

/** Removal relies on ON DELETE SET NULL: texts/quizzes in this chapter fall back to "no chapter". */
export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM chapters WHERE id = ?').run(id)
}
