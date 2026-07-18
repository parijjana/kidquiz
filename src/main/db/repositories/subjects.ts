import { getDb } from '../database'
import type { Subject } from '@shared/types'

interface SubjectRow {
  id: number
  name: string
  created_at: string
}

function mapRow(row: SubjectRow): Subject {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed')
}

export function getById(id: number): Subject {
  const db = getDb()
  const row = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as SubjectRow | undefined
  if (!row) throw new Error(`Subject ${id} not found.`)
  return mapRow(row)
}

export function list(): Subject[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM subjects ORDER BY name COLLATE NOCASE ASC')
    .all() as SubjectRow[]
  return rows.map(mapRow)
}

export function create(name: string): Subject {
  const db = getDb()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Subject name cannot be empty.')

  try {
    const info = db.prepare('INSERT INTO subjects (name) VALUES (?)').run(trimmed)
    return getById(info.lastInsertRowid as number)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error(`A subject named "${trimmed}" already exists.`)
    }
    throw err
  }
}

export function rename(id: number, name: string): Subject {
  const db = getDb()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Subject name cannot be empty.')

  try {
    const info = db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(trimmed, id)
    if (info.changes === 0) throw new Error(`Subject ${id} not found.`)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error(`A subject named "${trimmed}" already exists.`)
    }
    throw err
  }
  return getById(id)
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id)
}
