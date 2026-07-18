import { getDb } from '../database'

interface SettingRow {
  value: string
}

export function get(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | SettingRow
    | undefined
  return row ? row.value : null
}

export function set(key: string, value: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}
