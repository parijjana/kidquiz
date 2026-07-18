import { getDb } from '../database'
import type { TextEntry } from '@shared/types'

interface TextRow {
  id: number
  subject_id: number
  title: string
  content: string
  created_at: string
}

function mapRow(row: TextRow): TextEntry {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at
  }
}

export function getById(id: number): TextEntry {
  const db = getDb()
  const row = db.prepare('SELECT * FROM texts WHERE id = ?').get(id) as TextRow | undefined
  if (!row) throw new Error(`Text ${id} not found.`)
  return mapRow(row)
}

export function add(subjectId: number, title: string, content: string): number {
  const db = getDb()
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('Text title cannot be empty.')
  if (!content.trim()) throw new Error('Text content cannot be empty.')

  const info = db
    .prepare('INSERT INTO texts (subject_id, title, content) VALUES (?, ?, ?)')
    .run(subjectId, trimmedTitle, content)
  return info.lastInsertRowid as number
}

export function listBySubject(subjectId: number): TextEntry[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM texts WHERE subject_id = ? ORDER BY created_at ASC')
    .all(subjectId) as TextRow[]
  return rows.map(mapRow)
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM texts WHERE id = ?').run(id)
}
