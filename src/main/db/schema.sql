-- KidQuiz SQLite schema (v2) — see ARCHITECTURE.md §4 and §15. Executed once,
-- in full, on first run. Existing v1 databases are migrated in database.ts.

CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  suggested_quiz_name TEXT,        -- model-suggested quiz title (§16), nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,  -- NULL never happens in v1
  type TEXT NOT NULL CHECK (type IN ('mcq','truefalse')),
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL,      -- MCQ: ["A","B","C","D"]; T/F: ["True","False"]
  correct_index INTEGER NOT NULL,  -- index into options_json
  explanation TEXT,                -- one kid-friendly sentence, optional
  approved INTEGER NOT NULL DEFAULT 0,  -- adult ticked it in preview (1) or not (0)
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('single_text','consolidated','dynamic')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE quiz_questions (
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (quiz_id, question_id)
);

CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  child_name TEXT,                 -- optional, free text
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  taken_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE attempt_answers (
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  chosen_index INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, position)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes for common lookups / joins.
CREATE INDEX idx_chapters_subject_id ON chapters(subject_id);
CREATE INDEX idx_texts_subject_id ON texts(subject_id);
CREATE INDEX idx_texts_chapter_id ON texts(chapter_id);
CREATE INDEX idx_questions_subject_id ON questions(subject_id);
CREATE INDEX idx_questions_text_id ON questions(text_id);
CREATE INDEX idx_quizzes_chapter_id ON quizzes(chapter_id);
CREATE INDEX idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX idx_attempts_quiz_id ON attempts(quiz_id);
CREATE INDEX idx_attempt_answers_attempt_id ON attempt_answers(attempt_id);
