import { useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Spinner } from '../components'
import { useRouter } from '../router/RouterContext'
import type { QuizWithQuestions } from '@shared/types'
import styles from './PrintQuiz.module.css'

export interface PrintQuizProps {
  quizId: number
}

type LoadState = 'loading' | 'error' | 'ready'

const OPTION_LETTERS = ['A', 'B', 'C', 'D']

/**
 * Print-only route (ARCHITECTURE.md §10): a black-on-white quiz sheet
 * (name/date line, numbered questions with empty checkboxes) followed by an
 * answer key on its own page. The on-screen "Print"/"Back" chrome is hidden
 * under `@media print` — only `.sheet` prints.
 */
export function PrintQuiz({ quizId }: PrintQuizProps): React.JSX.Element {
  const { navigate } = useRouter()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')

    api.quizzes
      .get(quizId)
      .then((loaded) => {
        if (cancelled) return
        setQuiz(loaded)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [quizId])

  function handleBack(): void {
    if (quiz) {
      navigate({ area: 'adult', screen: 'subject-detail', subjectId: quiz.subjectId })
    } else {
      navigate({ area: 'adult', screen: 'subjects' })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.chrome}>
        <Button onClick={handleBack} variant="ghost">
          Back
        </Button>
        {loadState === 'ready' && <Button onClick={() => window.print()}>Print</Button>}
      </div>

      {loadState === 'loading' && (
        <div className={styles.chrome}>
          <Spinner size={32} label="Loading quiz…" />
        </div>
      )}

      {loadState === 'error' && (
        <div className={styles.chrome}>
          <p>We couldn&apos;t load this quiz for printing.</p>
        </div>
      )}

      {loadState === 'ready' && quiz && (
        <div className={styles.sheet}>
          <h1 className={styles.sheetTitle}>{quiz.name}</h1>

          <div className={styles.nameDateLine}>
            <span>Name: ____________________________</span>
            <span>Date: ______________</span>
          </div>

          <ol className={styles.questionList}>
            {quiz.questions.map((question) => (
              <li key={question.id} className={styles.question}>
                <p className={styles.questionPrompt}>{question.prompt}</p>

                {question.type === 'mcq' ? (
                  <ul className={styles.optionList}>
                    {question.options.map((option, i) => (
                      <li key={i} className={styles.option}>
                        <span className={styles.checkbox} aria-hidden="true" />
                        <span className={styles.optionLetter}>{OPTION_LETTERS[i] ?? ''}.</span>
                        <span>{option}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className={styles.optionList}>
                    {question.options.map((option, i) => (
                      <li key={i} className={styles.option}>
                        <span className={styles.checkbox} aria-hidden="true" />
                        <span>{option}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          <div className={styles.answerKey}>
            <h2 className={styles.sheetTitle}>Answer key — {quiz.name}</h2>
            <ol className={styles.answerList}>
              {quiz.questions.map((question, index) => {
                const correctText =
                  question.type === 'mcq'
                    ? `${OPTION_LETTERS[question.correctIndex] ?? '?'} — ${question.options[question.correctIndex]}`
                    : question.options[question.correctIndex]

                return (
                  <li key={question.id} className={styles.answerItem}>
                    <span className={styles.answerNumber}>{index + 1}.</span>
                    <span>
                      <strong>{correctText}</strong>
                      {question.explanation && <span> — {question.explanation}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
