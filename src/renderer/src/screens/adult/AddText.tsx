import { useEffect, useState } from 'react'
import type { AgeBand, Chapter } from '@shared/types'
import { api } from '../../api'
import { Button, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './AddText.module.css'

export interface AddTextProps {
  subjectId: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const AGE_BANDS: { id: AgeBand; label: string; description: string }[] = [
  { id: '5-7', label: 'Ages 5–7', description: 'Very simple words, short sentences.' },
  { id: '8-9', label: 'Ages 8–9', description: 'Simple vocabulary, a little more detail.' },
  { id: '10-11', label: 'Ages 10–11', description: 'More advanced vocabulary and ideas.' }
]

type GenerationMode = 'generate' | 'import'

const MODE_OPTIONS: { id: GenerationMode; label: string; description: string }[] = [
  { id: 'generate', label: 'A reading text', description: 'Write new questions from it.' },
  {
    id: 'import',
    label: 'Ready-made questions',
    description: 'Tidy them up and add them to the bank.'
  }
]

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function AddText({ subjectId }: AddTextProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<GenerationMode>('generate')
  const [ageBand, setAgeBand] = useState<AgeBand>('8-9')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelIssue, setModelIssue] = useState(false)

  // Tracks a text that was already saved on a failed generation attempt, so
  // retrying doesn't create a duplicate text row.
  const [savedTextId, setSavedTextId] = useState<number | null>(null)

  // §15 chapter picker, with inline "New chapter…" creation.
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chapterId, setChapterId] = useState<number | null>(null)
  const [creatingChapterInline, setCreatingChapterInline] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [creatingChapter, setCreatingChapter] = useState(false)

  useEffect(() => {
    api.chapters
      .list(subjectId)
      .then(setChapters)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  const handleCreateChapterInline = (): void => {
    const trimmed = newChapterName.trim()
    if (!trimmed) return
    setCreatingChapter(true)
    api.chapters
      .create(subjectId, trimmed)
      .then((chapter) => {
        setChapters((current) => [...current, chapter])
        setChapterId(chapter.id)
        setCreatingChapterInline(false)
        setNewChapterName('')
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setCreatingChapter(false))
  }

  // §13 engine hint — best-effort; the Gemini handlers may not exist yet, in
  // which case we silently assume the on-device helper (never crash/toast).
  const [engineHint, setEngineHint] = useState<'gemini' | 'local'>('local')
  useEffect(() => {
    api.gemini
      .status()
      .then((status) => setEngineHint(status.keyPresent ? 'gemini' : 'local'))
      .catch(() => setEngineHint('local'))
  }, [])

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setModelIssue(false)
    try {
      const textId =
        savedTextId ?? (await api.texts.add(subjectId, title.trim(), content, chapterId))
      setSavedTextId(textId)
      const generationId = await api.generation.start(textId, { ageBand, mode })
      navigate({ area: 'adult', screen: 'generation-progress', subjectId, textId, generationId })
    } catch (err) {
      const message = errMessage(err)
      setError(message)
      setModelIssue(message.toLowerCase().includes('model'))
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Add a text</h1>
          <p className={shared.subtitle}>
            Paste in something to read, then KidQuiz will make quiz questions from it.
          </p>
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>What are you pasting?</h2>
        <div className={shared.choiceGrid}>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`${shared.choiceCard} ${mode === option.id ? shared.choiceCardSelected : ''}`}
            >
              <input
                type="radio"
                name="generation-mode"
                className={shared.srOnly}
                checked={mode === option.id}
                onChange={() => setMode(option.id)}
              />
              <span className={shared.choiceCardBody}>
                <span className={shared.choiceCardTitle}>{option.label}</span>
                <span className={shared.choiceCardMeta}>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className={shared.section}>
        <div className={shared.formGroup}>
          <label className={shared.label} htmlFor="text-title">
            Title
          </label>
          <input
            id="text-title"
            className={shared.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. All About the Solar System"
          />
        </div>

        <div className={shared.formGroup}>
          <label className={shared.label} htmlFor="text-content">
            Text
          </label>
          <textarea
            id="text-content"
            className={shared.textarea}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste the passage, story, or article here…"
            rows={12}
          />
          <span className={shared.hint}>{wordCount(content)} words</span>
        </div>

        <div className={shared.formGroup}>
          <label className={shared.label} htmlFor="text-chapter">
            Chapter (optional)
          </label>
          {!creatingChapterInline ? (
            <select
              id="text-chapter"
              className={shared.select}
              value={chapterId === null ? '' : String(chapterId)}
              onChange={(event) => {
                if (event.target.value === '__new__') {
                  setCreatingChapterInline(true)
                  return
                }
                setChapterId(event.target.value === '' ? null : Number(event.target.value))
              }}
            >
              <option value="">No chapter</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.name}
                </option>
              ))}
              <option value="__new__">+ New chapter…</option>
            </select>
          ) : (
            <div className={styles.newChapterRow}>
              <input
                className={shared.input}
                value={newChapterName}
                onChange={(event) => setNewChapterName(event.target.value)}
                placeholder="New chapter name"
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCreateChapterInline}
                disabled={!newChapterName.trim() || creatingChapter}
              >
                {creatingChapter ? 'Adding…' : 'Add'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatingChapterInline(false)
                  setNewChapterName('')
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>How old is the reader?</h2>
        <div className={shared.choiceGrid}>
          {AGE_BANDS.map((band) => (
            <label
              key={band.id}
              className={`${shared.choiceCard} ${ageBand === band.id ? shared.choiceCardSelected : ''}`}
            >
              <input
                type="radio"
                name="age-band"
                className={shared.srOnly}
                checked={ageBand === band.id}
                onChange={() => setAgeBand(band.id)}
              />
              <span className={shared.choiceCardBody}>
                <span className={shared.choiceCardTitle}>{band.label}</span>
                <span className={shared.choiceCardMeta}>{band.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className={shared.section}>
          <p className={shared.errorText}>{error}</p>
          {modelIssue && (
            <div className={shared.headerActions}>
              <Button
                variant="secondary"
                onClick={() => navigate({ area: 'adult', screen: 'model-setup' })}
              >
                Set up a model
              </Button>
            </div>
          )}
        </div>
      )}

      <p className={shared.hint}>
        {engineHint === 'gemini'
          ? 'Questions will be written by Gemini (fast).'
          : 'Questions will be written by the on-device helper (slower).'}
      </p>

      <div className={shared.footerButtons}>
        <Button
          variant="ghost"
          onClick={() => navigate({ area: 'adult', screen: 'subject-detail', subjectId })}
        >
          Back to subject
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting
            ? mode === 'generate'
              ? 'Making questions…'
              : 'Adding your questions…'
            : savedTextId
              ? 'Try again'
              : mode === 'generate'
                ? 'Make questions'
                : 'Add questions'}
        </Button>
      </div>
    </div>
  )
}
