import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Button, EmptyState, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import { useTheme } from '../../theme/ThemeProvider'
import { getChildName, setChildName } from './KidSession'
import type { Chapter, Subject } from '@shared/types'
import styles from './QuizPicker.module.css'

type Step = 'subject' | 'chapter' | 'length'
type LoadState = 'loading' | 'error' | 'ready'

interface SubjectOption {
  subject: Subject
  approvedCount: number
}

interface ChapterOption {
  /** `null` represents "play the whole subject", not a real chapter. */
  chapter: Chapter | null
  label: string
  approvedCount: number
}

const LENGTHS = [5, 10, 15, 20]

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Kid-area home screen (ARCHITECTURE.md §15/§16 dynamic quiz flow): choose a
 * subject, optionally a chapter, then how many questions — KidQuiz samples
 * that many approved questions from the bank on the spot. Kept joyful and
 * low-text: big buttons, minimal reading, gentle "not enough yet" notes
 * instead of technical errors.
 */
export function QuizPicker(): React.JSX.Element {
  const { navigate } = useRouter()
  const { assets } = useTheme()
  const { Mascot } = assets
  const { showToast } = useToast()

  const [nameInput, setNameInput] = useState(() => getChildName() ?? '')

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([])
  const [reloadToken, setReloadToken] = useState(0)

  const [step, setStep] = useState<Step>('subject')
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  // `null` (not-yet-loaded) vs an array means "this subject has real chapters
  // to choose from"; when a subject has none, the chapter step is skipped
  // entirely and this stays `null`.
  const [chapterOptions, setChapterOptions] = useState<ChapterOption[] | null>(null)
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null)
  const [availableCount, setAvailableCount] = useState(0)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')

    api.subjects
      .list()
      .then(async (subjects) => {
        const counts = await Promise.all(
          subjects.map(async (subject) => {
            const questions = await api.questions.listBySubject(subject.id)
            return questions.filter((q) => q.approved).length
          })
        )
        if (cancelled) return
        setSubjectOptions(subjects.map((subject, i) => ({ subject, approvedCount: counts[i] })))
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  function handleNameChange(value: string): void {
    setNameInput(value)
    setChildName(value)
  }

  function handleSelectSubject(option: SubjectOption): void {
    if (option.approvedCount === 0) return
    setSelectedSubject(option.subject)
    setChapterOptions(null)
    setLoadingChapters(true)

    Promise.all([
      api.chapters.list(option.subject.id),
      api.questions.listBySubject(option.subject.id),
      api.texts.listBySubject(option.subject.id)
    ])
      .then(([chapters, questions, texts]) => {
        if (chapters.length === 0) {
          // No chapters to choose from — go straight to quiz length.
          setSelectedChapterId(null)
          setAvailableCount(option.approvedCount)
          setStep('length')
          return
        }

        const textChapterById = new Map(texts.map((t) => [t.id, t.chapterId]))
        const approvedQuestions = questions.filter((q) => q.approved)

        const options: ChapterOption[] = [
          { chapter: null, label: `All of ${option.subject.name}`, approvedCount: option.approvedCount }
        ]
        for (const chapter of chapters) {
          const count = approvedQuestions.filter(
            (q) => q.textId !== null && textChapterById.get(q.textId) === chapter.id
          ).length
          options.push({ chapter, label: chapter.name, approvedCount: count })
        }
        setChapterOptions(options)
        setStep('chapter')
      })
      .catch(() => showToast("Hmm, we couldn't load that subject. Let's try again!", 'error'))
      .finally(() => setLoadingChapters(false))
  }

  function handleSelectChapter(option: ChapterOption): void {
    if (option.approvedCount === 0) return
    setSelectedChapterId(option.chapter ? option.chapter.id : null)
    setAvailableCount(option.approvedCount)
    setStep('length')
  }

  function handleSelectLength(count: number): void {
    if (!selectedSubject || availableCount < count || creating) return
    setCreating(true)
    setChildName(nameInput)
    api.quizzes
      .createDynamic(selectedSubject.id, selectedChapterId, count)
      .then((quizId) => navigate({ area: 'kid', screen: 'player', quizId }))
      .catch((err: unknown) => {
        showToast(errMessage(err), 'error')
        setCreating(false)
      })
  }

  function backToSubjects(): void {
    setStep('subject')
    setSelectedSubject(null)
    setChapterOptions(null)
  }

  function backFromLength(): void {
    if (chapterOptions !== null) {
      setStep('chapter')
    } else {
      backToSubjects()
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.welcome}>
        <Mascot pose="cheering" size={100} />
        <h1 className={styles.title}>
          {step === 'subject' && 'Pick a quiz!'}
          {step === 'chapter' && (selectedSubject?.name ?? 'Pick a part!')}
          {step === 'length' && 'How many questions?'}
        </h1>

        {step === 'subject' && (
          <>
            <label className={styles.nameLabel} htmlFor="kid-name-input">
              What&apos;s your name? (optional)
            </label>
            <input
              id="kid-name-input"
              className={styles.nameInput}
              type="text"
              value={nameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Type your name here"
              maxLength={40}
              autoComplete="off"
            />
          </>
        )}
        {step === 'chapter' && <p className={styles.subtitle}>Pick a part, or play it all!</p>}
      </div>

      {step !== 'subject' && (
        <button
          className={styles.backButton}
          onClick={step === 'chapter' ? backToSubjects : backFromLength}
          disabled={creating}
        >
          ‹ Back
        </button>
      )}

      {step === 'subject' && (
        <>
          {loadState === 'loading' && (
            <div className={styles.centerRow}>
              <Spinner size={48} label="Finding your subjects…" />
            </div>
          )}

          {loadState === 'error' && (
            <EmptyState
              title="Oops! Let's try that again"
              message="We couldn't find your subjects just now."
              pose="thinking"
              action={
                <Button size="kid" onClick={() => setReloadToken((t) => t + 1)}>
                  Try again
                </Button>
              }
            />
          )}

          {loadState === 'ready' && subjectOptions.length === 0 && (
            <EmptyState
              title="No quizzes yet"
              message="Ask a grown-up to add a subject and some questions!"
              pose="thinking"
            />
          )}

          {loadState === 'ready' && subjectOptions.length > 0 && (
            <div className={styles.choiceGrid}>
              {subjectOptions.map((option) => (
                <div key={option.subject.id} className={styles.choiceCell}>
                  <Button
                    size="kid"
                    fullWidth
                    disabled={option.approvedCount === 0 || loadingChapters}
                    onClick={() => handleSelectSubject(option)}
                  >
                    {option.subject.name}
                  </Button>
                  {option.approvedCount === 0 && (
                    <p className={styles.note}>No questions ready yet</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'chapter' && (
        <>
          {chapterOptions === null && (
            <div className={styles.centerRow}>
              <Spinner size={48} label="Finding the parts…" />
            </div>
          )}
          {chapterOptions !== null && (
            <div className={styles.choiceGrid}>
              {chapterOptions.map((option) => (
                <div key={option.chapter?.id ?? 'all'} className={styles.choiceCell}>
                  <Button
                    size="kid"
                    fullWidth
                    disabled={option.approvedCount === 0}
                    onClick={() => handleSelectChapter(option)}
                  >
                    {option.label}
                  </Button>
                  {option.approvedCount === 0 && (
                    <p className={styles.note}>No questions ready yet</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'length' && (
        <>
          <div className={styles.choiceGrid}>
            {LENGTHS.map((count) => {
              const disabled = availableCount < count || creating
              return (
                <div key={count} className={styles.choiceCell}>
                  <Button size="kid" fullWidth disabled={disabled} onClick={() => handleSelectLength(count)}>
                    {count}
                  </Button>
                  {availableCount < count && (
                    <p className={styles.note}>Only {availableCount} ready</p>
                  )}
                </div>
              )
            })}
          </div>
          {creating && (
            <div className={styles.centerRow}>
              <Spinner size={48} label="Making your quiz…" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
