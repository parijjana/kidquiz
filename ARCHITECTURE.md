# KidQuiz — Architecture & Build Spec

**Read this fully before writing any code.** This is the single source of truth for
structure, contracts, and conventions. If anything you need is ambiguous or missing,
STOP and report back to the orchestrator — do not invent your own contract.

## 1. Product summary

Offline desktop app (Windows + macOS) for non-technical adults to turn a pasted body
of text into quizzes for primary-school kids. Local LLM inference only (no cloud APIs,
no Ollama): the app downloads a GGUF model via an in-app picker and runs it with
node-llama-cpp. Texts and generated questions accumulate in a local SQLite DB grouped
by **subject**, so quizzes can recirculate and consolidated quizzes can be built as a
subject grows.

Locked product decisions:
- Kid takes quizzes **in-app** (big buttons, instant feedback, dino mascot) AND quizzes
  are **printable** (quiz sheet + separate answer key).
- Question types v1: **MCQ (4 options)** and **True/False** only.
- Consolidation strategy: **hybrid** — questions are generated per text when the text is
  added; consolidated quizzes are built by sampling the subject's whole question bank
  (favouring less-recently-used questions). No cross-text regeneration in v1.
- Progress: **simple score history** — each attempt stores optional child name, score,
  total, timestamp. No profiles/avatars/streaks in v1.
- UI is **themeable via CSS custom properties**; single built-in theme "dino" in v1,
  architecture must allow adding themes later without touching component code.

## 2. Stack (locked — do not substitute)

| Concern | Choice |
|---|---|
| Shell | Electron (latest stable) |
| Build tooling | electron-vite (main / preload / renderer) |
| Renderer | React 18 + TypeScript, plain CSS Modules + CSS custom properties (no UI framework, no Tailwind) |
| Inference | node-llama-cpp v3 (in main process) |
| DB | better-sqlite3 (in main process) |
| Packaging | electron-builder — Windows `portable` + `nsis`, macOS `dmg` (arm64 + x64) |
| State (renderer) | React context + hooks (no Redux/zustand) |
| Language | TypeScript `strict: true` everywhere |

## 3. Directory layout

```
kidquiz/
  ARCHITECTURE.md
  package.json
  electron.vite.config.ts
  electron-builder.yml
  tsconfig.json / tsconfig.node.json / tsconfig.web.json
  src/
    main/                 # Electron main process
      index.ts            # app lifecycle, window creation
      paths.ts            # ALL filesystem locations resolved here (see §7)
      db/
        database.ts       # open/init/migrate better-sqlite3
        schema.sql        # full schema, executed on first run
        repositories/     # one file per table group: subjects.ts, texts.ts,
                          # questions.ts, quizzes.ts, attempts.ts, settings.ts
      llm/
        modelCatalog.ts   # curated model list (see §8)
        modelManager.ts   # download (resumable, progress events), list, delete, active model
        inference.ts      # load model, run generation with JSON-schema grammar
      generation/
        chunker.ts        # split text into ~1200-word chunks on paragraph boundaries
        prompts.ts        # prompt builders (age band, question mix)
        generator.ts      # orchestrates chunk -> LLM -> validated questions -> DB
        consolidate.ts    # hybrid sampling of subject question bank
      ipc/
        register.ts       # registers every ipcMain handler; one handler file per domain
        handlers/         # subjects.ts, texts.ts, generation.ts, quizzes.ts,
                          # attempts.ts, models.ts, settings.ts
    preload/
      index.ts            # contextBridge exposing typed `window.kidquiz` API
    renderer/
      index.html
      src/
        main.tsx
        App.tsx           # router: adult area vs kid player
        api.ts            # typed wrapper over window.kidquiz
        theme/
          ThemeProvider.tsx
          themes.ts       # registry; themes are objects of CSS var values + asset refs
          dino/           # dino theme assets (SVGs) + theme definition
        components/       # shared: Button, Card, Modal, ProgressBar, ...
        screens/
          adult/          # SubjectList, SubjectDetail (texts + bank), AddText,
                          # GenerationProgress, QuizPreviewEdit, ModelSetup, Settings, History
          kid/            # QuizPicker, QuizPlayer, ResultsScreen
        print/
          PrintQuiz.tsx   # print-friendly quiz sheet + answer key (see §10)
    shared/
      types.ts            # ALL cross-process types live here (see §5)
      ipcChannels.ts      # channel name constants — never inline channel strings
  resources/              # app icons
  .github/workflows/build.yml
```

## 4. Database schema (SQLite)

`schema.sql` — executed on first run; keep a `schema_version` pragma/user_version for
future migrations.

```sql
CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
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
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('single_text','consolidated')),
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

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Rules:
- Only **approved** questions are eligible for quizzes and consolidation.
- When a quiz is created, increment `times_used` and set `last_used_at` on its questions.
- Consolidation sampling (`consolidate.ts`): all approved questions of the subject,
  ordered by (`times_used` ASC, `last_used_at` ASC NULLS FIRST, random tiebreak), take N,
  but guarantee at least one question from every text of the subject when N ≥ text count.

## 5. Shared types & IPC contract

All cross-process types in `src/shared/types.ts`; all channel names as constants in
`src/shared/ipcChannels.ts`. Preload exposes a single typed object `window.kidquiz`.
Renderer never calls `ipcRenderer` directly outside preload.

Request/response channels (all `ipcMain.handle`):

| Namespace | Methods |
|---|---|
| subjects | `list()`, `create(name)`, `rename(id,name)`, `remove(id)` |
| texts | `add(subjectId,title,content)` → textId, `listBySubject(subjectId)`, `remove(id)` |
| generation | `start(textId, opts: {ageBand:'5-7'\|'8-9'\|'10-11', count:number})` → generationId, `cancel(generationId)` |
| questions | `listBySubject(subjectId)`, `listByText(textId)`, `update(id,patch)`, `setApproved(ids,approved)`, `remove(id)` |
| quizzes | `createFromQuestions(subjectId,name,kind,questionIds)`, `createConsolidated(subjectId,name,count)`, `list(subjectId?)`, `get(id)` (with questions), `remove(id)` |
| attempts | `record(quizId,childName,score,total)`, `list(quizId?)` |
| models | `catalog()`, `installed()`, `download(modelId)`, `cancelDownload(modelId)`, `remove(modelId)`, `setActive(modelId)`, `status()` (active model, loaded?, ram) |
| settings | `get(key)`, `set(key,value)` |
| system | `openDataFolder()`, `platformInfo()` (totalRamGB, platform) |

Push events (main → renderer, `webContents.send`):
- `generation:progress` `{generationId, phase:'loading_model'|'generating', chunkIndex, chunkCount, questionsSoFar}`
- `generation:done` `{generationId, textId, questionIds}` / `generation:error` `{generationId, message}`
- `model:downloadProgress` `{modelId, bytesDone, bytesTotal}` / `model:downloadDone` / `model:downloadError`

## 6. Generation pipeline

1. `chunker.ts`: split text into chunks of ≈1200 words max, breaking on paragraph
   boundaries; tiny final chunks (<150 words) merge into the previous chunk.
2. Per chunk, request `ceil(count * chunkWords/totalWords)` questions, minimum 2, with a
   mix of ~70% MCQ / 30% True/False.
3. `inference.ts`: one loaded model instance reused across calls. Generation MUST use
   node-llama-cpp's JSON-schema grammar
   (`llama.createGrammarForJsonSchema`) so output is structurally valid. Schema (per chunk):
   `{questions: [{type:'mcq'|'truefalse', prompt:string, options:string[], correctIndex:number, explanation:string}]}`.
4. `generator.ts` post-validates each question before insert: MCQ has exactly 4 non-empty
   distinct options; truefalse options are exactly ["True","False"]; correctIndex in range;
   prompt non-empty and not a duplicate (case-insensitive exact match) of an existing
   prompt for the same text. Invalid items are dropped silently (log to console), not retried.
5. Prompts (`prompts.ts`) must: state the reader is a primary-school child in the given
   age band, demand simple vocabulary, questions answerable ONLY from the given text,
   plausible same-category distractors, and one-sentence explanations. Temperature 0.7.
6. Newly generated questions are inserted with `approved = 0`; the adult approves in the
   preview/edit screen.

## 7. Filesystem locations — `paths.ts` is the only place that resolves these

- **Windows portable build**: electron-builder sets env `PORTABLE_EXECUTABLE_DIR` →
  data root is `<that dir>/kidquiz-data/`.
- **Windows installed / macOS**: data root is `app.getPath('userData')`.
- **Dev** (`!app.isPackaged`): data root is `<repo>/data/` (gitignored).
- Inside data root: `models/` (GGUF files), `kidquiz.db`.

## 8. Model catalog (`modelCatalog.ts`)

Curated, hardcoded list. Each entry: `id`, `displayName` (outcome-oriented label),
`description`, `fileSizeBytes` (approx), `minRamGB`, `hfUrl` (direct GGUF download URL),
`recommended: boolean`. v1 catalog:

| id | Label | Model file |
|---|---|---|
| `qwen2.5-1.5b-q4` | "Fast — for older or low-memory laptops" | Qwen2.5-1.5B-Instruct Q4_K_M GGUF (official Qwen HF repo) |
| `llama3.2-3b-q4` | "Recommended — good questions, works on most laptops" (recommended: true) | Llama-3.2-3B-Instruct Q4_K_M GGUF |
| `qwen2.5-7b-q4` | "Best questions — needs a newer laptop (8 GB+ free memory)" | Qwen2.5-7B-Instruct Q4_K_M GGUF |

Verify exact HF URLs resolve (HEAD request) at build time is NOT required; just use the
canonical `huggingface.co/<repo>/resolve/main/<file>` form. Downloads via node-llama-cpp
`createModelDownloader` (gives resume + progress). The app auto-suggests the best entry
whose `minRamGB` fits detected RAM.

## 9. Theming

- `themes.ts` registry: `Record<themeId, Theme>`; `Theme = {id, label, cssVars: Record<'--kq-*', string>, assets: {mascot, celebration, background, ...}}`.
- `ThemeProvider` sets CSS vars on `document.documentElement` and provides assets via context.
- Components use ONLY `var(--kq-*)` for colors/radii/fonts and theme assets via context —
  zero hardcoded colors in components/screens.
- Dino theme: friendly greens/oranges, rounded everything, large type; mascot = simple
  cute dino SVG (hand-drawn as inline SVG component, no binary assets), celebration =
  confetti + happy dino, gentle "try again" state (no red X wall — encouraging tone).
- Fonts: system font stack (no bundled/downloaded fonts in v1).

## 10. Printing

`PrintQuiz.tsx` renders a print-only route (quiz sheet: numbered questions, options with
empty checkboxes, name/date line at top; then answer key on its own page via
`page-break-before`). Black-on-white, no theme colors, ~12pt. Triggered from adult quiz
view via `window.print()` on that route.

## 11. Conventions

- TypeScript strict; no `any` except at true JSON boundaries (immediately validated).
- Errors from IPC handlers: throw `Error` with human-readable message; renderer surfaces
  them in a toast component.
- No stub/placeholder code left behind ("TODO: implement") — build only what your task
  says, completely.
- Run `npm run typecheck` (and `npm run build` when your task says so) before reporting done.
- Do not add dependencies beyond those named in this spec without orchestrator approval.
- Do not commit; the orchestrator handles git.

## 12. Agent protocol

You are one of several narrow-scope agents. Work ONLY on the files your task assigns.
If you hit any of: ambiguous spec, missing dependency, failing install, a contract that
seems wrong — STOP, and report the blocker plus your recommendation in your final
message. Never assume, never widen scope, never refactor files outside your task.
End your report with: files created/changed, commands run and their results, and any
deviations from this spec (deviations require justification).

## 13. Gemini provider (v1.1)

Optional cloud generation via the user's own free Gemini API key. NEVER mandatory: with
no key, the app behaves exactly as before (local models only). Files: `src/main/llm/gemini/`
(key store + client) and `src/main/llm/provider.ts` (routing).

- **Key storage**: encrypted with Electron `safeStorage` (DPAPI/Keychain), written to
  `<dataRoot()>/gemini-key.enc` — the folder next to the exe for the Windows portable
  build, so the user can see and delete the file themselves. Missing/corrupt/undecryptable
  file, or `safeStorage` unavailable → Gemini silently unavailable; NEVER a crash, and the
  UI shows the un-configured state. `gemini:deleteKey` deletes the file. The Settings UI
  must display the file path, say plainly that the key lives in that file, and that
  deleting the file removes the key.
- **Client**: REST `generateContent` on the current free-tier flash model, with JSON
  output constrained via the API's response-schema mechanism, mirroring the shape used by
  local generation. Client-side rate limiting sized to free-tier RPM (min-interval gate),
  honor `Retry-After` on 429 with bounded retries.
- **Routing** (`provider.ts`): exposes the same `generateStructured` contract as
  `inference.ts`. If a key is present → Gemini ("best model available" preference); on
  persistent 429 / network failure / invalid key → fall back to the local pipeline for the
  remainder of the run (if no local model is installed either, fail with a friendly
  message naming both options). `generator.ts` calls `provider.ts`, never `inference.ts`
  directly. Progress events carry `provider` so the UI can say which engine is working.
- **Privacy copy** (required, §14 guide screen): the app itself sends nothing over the
  internet; using Gemini sends the pasted text to Google's service, which is separate from
  KidQuiz and governed by its own terms and privacy policy.

## 14. Generation progress indicators (v1.1)

Local generation on old laptops takes minutes; the UI must always show visible liveness:
- `inference.generateStructured` accepts an optional `onToken` callback; `generator.ts`
  emits `generation:progress` at most every ~500 ms with cumulative `tokensSoFar` (local
  provider only) alongside the existing chunk/question counts.
- GenerationProgress screen: phase label, elapsed-time counter, chunk progress bar, live
  token/question activity ticker, provider badge ("Using Gemini" / "Using the on-device
  helper — this can take a few minutes on this computer"), mascot 'thinking'.
- Other slow operations get busy states: model load on `setActive` (spinner on the model
  card), consolidated-quiz creation (button spinner).

