import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { Button, Card, EmptyState, Spinner } from '../../components'
import { useRouter } from '../../router/RouterContext'
import { useTheme } from '../../theme/ThemeProvider'
import { getChildName, setChildName } from './KidSession'
import type { Quiz, Subject } from '@shared/types'
import styles from './QuizPicker.module.css'

interface SubjectGroup {
  subject: Subject
  quizzes: Quiz[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; groups: SubjectGroup[] }

/**
 * Kid-area home screen: mascot welcome, an optional name field, and big
 * friendly quiz cards grouped by subject. Tapping a quiz starts it.
 */
export function QuizPicker(): React.JSX.Element {
  const { navigate } = useRouter()
  const { assets } = useTheme()
  const { Mascot } = assets

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [nameInput, setNameInput] = useState(() => getChildName() ?? '')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    Promise.all([api.subjects.list(), api.quizzes.list()])
      .then(([subjects, quizzes]) => {
        if (cancelled) return
        const bySubject = new Map<number, Quiz[]>()
        for (const quiz of quizzes) {
          const list = bySubject.get(quiz.subjectId)
          if (list) {
            list.push(quiz)
          } else {
            bySubject.set(quiz.subjectId, [quiz])
          }
        }
        const groups: SubjectGroup[] = subjects
          .filter((subject) => bySubject.has(subject.id))
          .map((subject) => ({ subject, quizzes: bySubject.get(subject.id) ?? [] }))

        setState({ status: 'ready', groups })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const hasAnyQuiz = useMemo(
    () => state.status === 'ready' && state.groups.length > 0,
    [state]
  )

  function handleNameChange(value: string): void {
    setNameInput(value)
    setChildName(value)
  }

  function handlePlay(quizId: number): void {
    setChildName(nameInput)
    navigate({ area: 'kid', screen: 'player', quizId })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.welcome}>
        <Mascot pose="cheering" size={110} />
        <h1 className={styles.title}>Pick a quiz!</h1>

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
      </div>

      {state.status === 'loading' && (
        <div className={styles.centerRow}>
          <Spinner size={48} label="Finding your quizzes…" />
        </div>
      )}

      {state.status === 'error' && (
        <EmptyState
          title="Oops! Let's try that again"
          message="We couldn't find your quizzes just now."
          pose="thinking"
          action={
            <Button size="kid" onClick={() => setReloadToken((t) => t + 1)}>
              Try again
            </Button>
          }
        />
      )}

      {state.status === 'ready' && !hasAnyQuiz && (
        <EmptyState
          title="No quizzes yet"
          message="Ask a grown-up to make you a quiz to play!"
          pose="thinking"
        />
      )}

      {state.status === 'ready' && hasAnyQuiz && (
        <div className={styles.groups}>
          {state.groups.map(({ subject, quizzes }) => (
            <Card key={subject.id} padding="lg" className={styles.subjectCard}>
              <h2 className={styles.subjectTitle}>{subject.name}</h2>
              <div className={styles.quizGrid}>
                {quizzes.map((quiz) => (
                  <Button
                    key={quiz.id}
                    size="kid"
                    fullWidth
                    onClick={() => handlePlay(quiz.id)}
                  >
                    {quiz.name}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
