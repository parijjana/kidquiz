/**
 * Opens/initializes the better-sqlite3 database and exposes a singleton
 * accessor. See ARCHITECTURE.md §4 and §15 (v1 -> v2 migration).
 */

import Database from 'better-sqlite3'
import { dbPath } from '../paths'
import schemaSql from './schema.sql?raw'

let dbInstance: Database.Database | null = null

/**
 * v1 -> v2 migration (see ARCHITECTURE.md §15): adds chapters, chapter_id /
 * suggested_quiz_name on texts, chapter_id + the 'dynamic' kind on quizzes
 * (via table rebuild, since SQLite can't ALTER a CHECK constraint in place),
 * and attempt_answers. Existing rows must survive intact.
 */
const MIGRATION_V1_TO_V2_SQL = `
  CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  ALTER TABLE texts ADD COLUMN chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL;
  ALTER TABLE texts ADD COLUMN suggested_quiz_name TEXT;

  CREATE TABLE quizzes_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('single_text','consolidated','dynamic')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT INTO quizzes_new (id, subject_id, chapter_id, name, kind, created_at)
  SELECT id, subject_id, NULL, name, kind, created_at FROM quizzes;

  DROP TABLE quizzes;
  ALTER TABLE quizzes_new RENAME TO quizzes;

  CREATE TABLE attempt_answers (
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    chosen_index INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    PRIMARY KEY (attempt_id, position)
  );

  CREATE INDEX idx_chapters_subject_id ON chapters(subject_id);
  CREATE INDEX idx_texts_chapter_id ON texts(chapter_id);
  CREATE INDEX idx_quizzes_chapter_id ON quizzes(chapter_id);
  CREATE INDEX idx_attempt_answers_attempt_id ON attempt_answers(attempt_id);
`

function migrateV1ToV2(db: Database.Database): void {
  // PRAGMA foreign_keys is a no-op inside a transaction, so it must be
  // toggled off before BEGIN and back on after COMMIT.
  db.pragma('foreign_keys = OFF')

  const migrate = db.transaction(() => {
    db.exec(MIGRATION_V1_TO_V2_SQL)
    db.pragma('user_version = 2')
  })
  migrate()

  db.pragma('foreign_keys = ON')

  const violations = db.pragma('foreign_key_check') as unknown[]
  if (violations.length > 0) {
    throw new Error(
      `Schema migration v1 -> v2 left foreign key violations: ${JSON.stringify(violations)}`
    )
  }
}

function openDatabase(): Database.Database {
  const db = new Database(dbPath())

  // Foreign key enforcement is off by default in SQLite and must be set per
  // connection; WAL improves concurrent read/write behaviour for a desktop app.
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')

  const currentVersion = db.pragma('user_version', { simple: true }) as number

  if (currentVersion === 0) {
    db.exec(schemaSql)
    db.pragma('user_version = 2')
  } else if (currentVersion === 1) {
    migrateV1ToV2(db)
  }

  return db
}

/** The singleton database connection, opened and (on first run/upgrade) initialized lazily. */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDatabase()
  }
  return dbInstance
}
