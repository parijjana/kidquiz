# KidQuiz

## What KidQuiz does

KidQuiz is an offline quiz maker for primary-school kids. Here's the workflow:

1. **Adults paste text** into the app (a page from a book, a news article, anything).
2. **A small AI model** running entirely on your computer reads the text and writes multiple-choice and true/false questions automatically — no account, no internet needed after the first model download.
3. **Adults review and approve** each question before kids ever see it.
4. **Kids play quizzes** in the app (with big buttons, instant feedback, and a friendly dino mascot) or on printed sheets.
5. **Questions build up by subject**, so you can later mix them into bigger quizzes that cover more ground.

Everything stays on your computer. Nothing leaves without your knowledge.

## Getting started as a grown-up

**First time using the app:**

1. Open KidQuiz.
2. You'll be prompted to download a model. The in-app list shows three options, sized roughly 1 GB, 3 GB, and 4.5 GB. Pick the recommended one unless your computer is low on memory — KidQuiz will suggest the best fit based on your machine.
3. Once the model is downloaded (this happens once and takes a few minutes), you're ready to create quizzes.

**Where does my data live?**

- If you're using the **Windows portable version** (the standalone `.exe`), your data lives in a folder called `kidquiz-data` right next to the app — no installation needed.
- If you're using the **installed version** or **macOS**, your data lives in your user data folder (the app will show you where if you ask).

**After setup:** Everything works offline. No more downloads needed, no internet required.

## Getting started as a developer

### Prerequisites

- Node.js 22 or later
- npm

### Setup and commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server with live reload
npm run typecheck    # Type-check TypeScript files
npm run build        # Build for distribution
npm run package      # Build and create installers (Windows & macOS)
```

### Tech stack

- **Electron** for the desktop app shell
- **React 18** + **TypeScript** for the UI
- **better-sqlite3** for local data storage
- **node-llama-cpp** for running the AI model
- **electron-builder** for packaging Windows and macOS installers

### Learn more

For a complete spec of the architecture, database schema, IPC contract, and conventions, read `ARCHITECTURE.md`.

### Releases

Releases are built automatically by GitHub Actions whenever a version tag is pushed. There's nothing to do manually.

## A note on quiz quality

The quality of generated questions depends on which model you choose. Faster models (1.5B parameters) are fine for simpler texts and younger kids, while larger models (7B parameters) handle complex material better.

**Important:** Every question is reviewed by an adult before kids see it. This isn't optional — it's by design. An adult always gets to approve, edit, or delete questions.

## License

This is a personal project. See `ARCHITECTURE.md` for more details on how to contribute or extend KidQuiz.
