import { useEffect, useState } from 'react'
import type { Question, QuestionType, QuizWithQuestions } from '@shared/types'
import { api } from '../../api'
import { Button, Card, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './QuizEdit.module.css'

export interface QuizEditProps {
  quizId: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  truefalse: 'True or false'
}

export function QuizEdit({ quizId }: QuizEditProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [questionIds, setQuestionIds] = useState<number[]>([])
  const [questionsById, setQuestionsById] = useState<Map<number, Question>>(new Map())
  const [bankQuestions, setBankQuestions] = useState<Question[] | null>(null)
  const [savingQuestions, setSavingQuestions] = useState(false)

  useEffect(() => {
    api.quizzes
      .get(quizId)
      .then((loaded) => {
        setQuiz(loaded)
        setName(loaded.name)
        setQuestionIds(loaded.questions.map((q) => q.id))
        setQuestionsById((current) => {
          const next = new Map(current)
          for (const q of loaded.questions) next.set(q.id, q)
          return next
        })
        return api.questions.listBySubject(loaded.subjectId)
      })
      .then((bank) => {
        setBankQuestions(bank.filter((q) => q.approved))
        setQuestionsById((current) => {
          const next = new Map(current)
          for (const q of bank) next.set(q.id, q)
          return next
        })
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId])

  const handleSaveName = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSavingName(true)
    api.quizzes
      .updateName(quizId, trimmed)
      .then((updated) => {
        setName(updated.name)
        setQuiz((q) => (q ? { ...q, name: updated.name } : q))
        showToast(
          updated.name === trimmed
            ? 'Quiz renamed.'
            : `Saved as "${updated.name}" — that name was already used.`,
          'success'
        )
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setSavingName(false))
  }

  const moveQuestion = (index: number, direction: -1 | 1): void => {
    setQuestionIds((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }

  const removeQuestion = (id: number): void => {
    setQuestionIds((current) => current.filter((qid) => qid !== id))
  }

  const addQuestion = (id: number): void => {
    setQuestionIds((current) => (current.includes(id) ? current : [...current, id]))
  }

  const handleSaveQuestions = (): void => {
    if (questionIds.length === 0) return
    setSavingQuestions(true)
    api.quizzes
      .setQuestions(quizId, questionIds)
      .then(() => {
        showToast('Quiz updated!', 'success')
        if (quiz) navigate({ area: 'adult', screen: 'subject-detail', subjectId: quiz.subjectId })
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setSavingQuestions(false))
  }

  const availableBank = (bankQuestions ?? []).filter((q) => !questionIds.includes(q.id))

  if (!quiz) {
    return (
      <div className={shared.page}>
        <div className={shared.center}>
          <Spinner label="Loading quiz…" />
        </div>
      </div>
    )
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Edit quiz</h1>
          <p className={shared.subtitle}>Rename it, reorder questions, or swap some out.</p>
        </div>
        <div className={shared.headerActions}>
          <Button
            variant="ghost"
            onClick={() =>
              navigate({ area: 'adult', screen: 'subject-detail', subjectId: quiz.subjectId })
            }
          >
            Back to subject
          </Button>
        </div>
      </div>

      <div className={`${shared.formGroup} ${styles.nameField}`}>
        <label className={shared.label} htmlFor="quiz-edit-name">
          Quiz name
        </label>
        <div className={styles.nameRow}>
          <input
            id="quiz-edit-name"
            className={`${shared.input} ${styles.nameInput}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button onClick={handleSaveName} disabled={!name.trim() || savingName}>
            {savingName ? 'Saving…' : 'Save name'}
          </Button>
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Questions in this quiz ({questionIds.length})</h2>
        {questionIds.length === 0 && (
          <p className={shared.muted}>No questions left — add some from the bank below.</p>
        )}
        <div className={shared.list}>
          {questionIds.map((id, index) => {
            const question = questionsById.get(id)
            return (
              <Card key={id} className={styles.questionRow}>
                <div className={shared.rowMain}>
                  <span
                    className={`${shared.badge} ${shared.badgeNeutral} ${styles.typeBadge}`}
                  >
                    {question ? TYPE_LABEL[question.type] : '…'}
                  </span>
                  <span className={shared.rowTitle}>{question?.prompt ?? 'Loading…'}</span>
                </div>
                <div className={shared.rowActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                    aria-label="Move question up"
                  >
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questionIds.length - 1}
                    aria-label="Move question down"
                  >
                    Down
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeQuestion(id)}>
                    Remove
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Add more from the question bank</h2>
        {bankQuestions === null && (
          <div className={shared.center}>
            <Spinner label="Loading question bank…" />
          </div>
        )}
        {bankQuestions !== null && availableBank.length === 0 && (
          <p className={shared.muted}>
            Every approved question for this subject is already in this quiz.
          </p>
        )}
        {availableBank.length > 0 && (
          <div className={shared.list}>
            {availableBank.map((question) => (
              <Card key={question.id} className={styles.questionRow}>
                <div className={shared.rowMain}>
                  <span
                    className={`${shared.badge} ${shared.badgeNeutral} ${styles.typeBadge}`}
                  >
                    {TYPE_LABEL[question.type]}
                  </span>
                  <span className={shared.rowTitle}>{question.prompt}</span>
                </div>
                <div className={shared.rowActions}>
                  <Button variant="secondary" size="sm" onClick={() => addQuestion(question.id)}>
                    Add
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className={shared.footerButtons}>
        <Button
          onClick={handleSaveQuestions}
          disabled={questionIds.length === 0 || savingQuestions}
        >
          {savingQuestions ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
