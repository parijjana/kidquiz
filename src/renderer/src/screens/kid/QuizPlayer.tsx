import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { Button, Card, EmptyState, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import { useTheme } from '../../theme/ThemeProvider'
import { getChildName } from './KidSession'
import type { QuizWithQuestions } from '@shared/types'
import styles from './QuizPlayer.module.css'

export interface QuizPlayerProps {
  quizId: number
}

type LoadState = 'loading' | 'error' | 'empty' | 'ready'

/** Fisher-Yates shuffle of the indices `0..length-1`. */
function shuffledIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * One question at a time, big prompt + huge answer buttons, instant
 * feedback, then a big "Next" button. Records the attempt after the last
 * question and hands off to the results screen.
 */
export function QuizPlayer({ quizId }: QuizPlayerProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { assets } = useTheme()
  const { Mascot, Celebration } = assets
  const { showToast } = useToast()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  const [celebrate, setCelebrate] = useState(false)
  const [wobble, setWobble] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')

    api.quizzes
      .get(quizId)
      .then((loaded) => {
        if (cancelled) return
        if (loaded.questions.length === 0) {
          setLoadState('empty')
          return
        }
        setQuiz(loaded)
        setCurrentIndex(0)
        setAnswered(false)
        setSelectedIndex(null)
        setResults([])
        setCelebrate(false)
        setWobble(false)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [quizId])

  const question = quiz?.questions[currentIndex]

  // Shuffle only the presentation order of MCQ options — the correct answer
  // is still tracked through `question.correctIndex`, which never changes.
  const displayOrder = useMemo(() => {
    if (!question) return []
    if (question.type !== 'mcq') return question.options.map((_, i) => i)
    return shuffledIndices(question.options.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, currentIndex])

  function handleAnswer(originalIndex: number): void {
    if (!question || answered) return
    const correct = originalIndex === question.correctIndex
    setSelectedIndex(originalIndex)
    setAnswered(true)
    setResults((prev) => {
      const next = [...prev]
      next[currentIndex] = correct
      return next
    })
    setCelebrate(correct)
    setWobble(!correct)
  }

  function goBackToPicker(): void {
    navigate({ area: 'kid', screen: 'quiz-picker' })
  }

  async function handleNext(): Promise<void> {
    if (!quiz) return
    const isLast = currentIndex === quiz.questions.length - 1

    if (!isLast) {
      setCurrentIndex((i) => i + 1)
      setAnswered(false)
      setSelectedIndex(null)
      setCelebrate(false)
      setWobble(false)
      return
    }

    const total = quiz.questions.length
    const score = results.filter(Boolean).length
    setFinishing(true)
    try {
      await api.attempts.record(quiz.id, getChildName(), score, total)
    } catch {
      showToast("Hmm, we couldn't save that score, but here it is!", 'error')
    } finally {
      navigate({ area: 'kid', screen: 'results', quizId: quiz.id, score, total })
    }
  }

  if (loadState === 'loading') {
    return (
      <div className={styles.centerRow}>
        <Spinner size={56} label="Getting your quiz ready…" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <EmptyState
        title="Oops, let's go back"
        message="We couldn't load this quiz right now."
        pose="thinking"
        action={
          <Button size="kid" onClick={goBackToPicker}>
            Back to quizzes
          </Button>
        }
      />
    )
  }

  if (loadState === 'empty') {
    return (
      <EmptyState
        title="Oops, let's go back"
        message="This quiz doesn't have any questions yet."
        pose="thinking"
        action={
          <Button size="kid" onClick={goBackToPicker}>
            Back to quizzes
          </Button>
        }
      />
    )
  }

  if (!quiz || !question) return <></>

  const total = quiz.questions.length
  const isLast = currentIndex === total - 1
  const correctOptionText = question.options[question.correctIndex]

  return (
    <div className={styles.wrap}>
      <Celebration active={celebrate} />

      <div className={styles.progress} aria-label={`Question ${currentIndex + 1} of ${total}`}>
        {quiz.questions.map((_, i) => (
          <span
            key={i}
            className={[
              styles.dot,
              i === currentIndex ? styles.dotCurrent : '',
              i < currentIndex || (i === currentIndex && answered) ? styles.dotDone : ''
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
        <span className={styles.progressLabel}>
          Question {currentIndex + 1} of {total}
        </span>
      </div>

      <Card padding="lg" className={styles.questionCard}>
        <p className={styles.prompt}>{question.prompt}</p>

        <div className={styles.options}>
          {displayOrder.map((originalIndex) => {
            const isCorrectOption = originalIndex === question.correctIndex
            const isSelected = originalIndex === selectedIndex
            const optionStyle = answered
              ? isCorrectOption
                ? { backgroundColor: 'var(--kq-success)', color: 'var(--kq-primary-contrast)' }
                : isSelected
                  ? { backgroundColor: 'var(--kq-danger-soft)', color: 'var(--kq-text)' }
                  : { opacity: 0.55 }
              : undefined

            return (
              <Button
                key={originalIndex}
                size="kid"
                fullWidth
                className={isSelected && wobble ? styles.wobble : ''}
                style={optionStyle}
                onClick={() => handleAnswer(originalIndex)}
                disabled={answered}
              >
                {question.options[originalIndex]}
              </Button>
            )
          })}
        </div>

        {answered && (
          <div
            className={[styles.feedback, celebrate ? styles.feedbackGood : styles.feedbackSoft].join(
              ' '
            )}
          >
            <Mascot pose={celebrate ? 'cheering' : 'happy'} size={64} />
            <div className={styles.feedbackText}>
              <p className={styles.feedbackHeadline}>
                {celebrate ? 'Woohoo, that’s right!' : `Good try! The answer is ${correctOptionText}.`}
              </p>
              {question.explanation && <p className={styles.explanation}>{question.explanation}</p>}
            </div>
          </div>
        )}

        {answered && (
          <Button size="kid" fullWidth onClick={handleNext} disabled={finishing}>
            {isLast ? 'See my score!' : 'Next'}
          </Button>
        )}
      </Card>
    </div>
  )
}
