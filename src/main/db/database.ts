/**
 * Opens/initializes the better-sqlite3 database and exposes a singleton
 * accessor. See ARCHITECTURE.md §4.
 */

import Database from 'better-sqlite3'
import { dbPath } from '../paths'
import schemaSql from './schema.sql?raw'

let dbInstance: Database.Database | null = null

function openDatabase(): Database.Database {
  const db = new Database(dbPath())

  // Foreign key enforcement is off by default in SQLite and must be set per
  // connection; WAL improves concurrent read/write behaviour for a desktop app.
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')

  const currentVersion = db.pragma('user_version', { simple: true }) as number
  if (currentVersion === 0) {
    db.exec(schemaSql)
    db.pragma('user_version = 1')
  }

  return db
}

/** The singleton database connection, opened and (on first run) initialized lazily. */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDatabase()
  }
  return dbInstance
}
