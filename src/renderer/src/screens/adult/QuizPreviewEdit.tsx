import { useEffect, useRef, useState } from 'react'
import type { Question, QuestionType } from '@shared/types'
import { api } from '../../api'
import { Button, Card, EmptyState, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './QuizPreviewEdit.module.css'

export interface QuizPreviewEditProps {
  subjectId: number
  textId: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  truefalse: 'True or false'
}

interface QuestionDraft {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

function toDraft(question: Question): QuestionDraft {
  return {
    prompt: question.prompt,
    options: [...question.options],
    correctIndex: question.correctIndex,
    explanation: question.explanation ?? ''
  }
}

interface QuestionCardProps {
  question: Question
  onApprovedChange: (id: number, approved: boolean) => void
}

function QuestionCard({ question, onApprovedChange }: QuestionCardProps): React.JSX.Element {
  const { showToast } = useToast()
  const [draft, setDraft] = useState<QuestionDraft>(() => toDraft(question))
  const savedRef = useRef<QuestionDraft>(draft)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)

  const commit = async (override?: Partial<QuestionDraft>): Promise<void> => {
    const next: QuestionDraft = { ...draft, ...override }
    const saved = savedRef.current
    const changed =
      next.prompt.trim() !== saved.prompt ||
      next.explanation.trim() !== saved.explanation ||
      next.correctIndex !== saved.correctIndex ||
      next.options.some((option, index) => option.trim() !== saved.options[index])
    if (!changed) {
      if (override) setDraft(next)
      return
    }
    setSaving(true)
    try {
      const updated = await api.questions.update(question.id, {
        prompt: next.prompt.trim(),
        options: next.options.map((option) => option.trim()),
        correctIndex: next.correctIndex,
        explanation: next.explanation.trim() ? next.explanation.trim() : null
      })
      const updatedDraft = toDraft(updated)
      savedRef.current = updatedDraft
      setDraft(updatedDraft)
    } catch (err) {
      showToast(errMessage(err), 'error')
      setDraft(saved)
    } finally {
      setSaving(false)
    }
  }

  const handleApproveToggle = (): void => {
    setApproving(true)
    api.questions
      .setApproved([question.id], !question.approved)
      .then(() => onApprovedChange(question.id, !question.approved))
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setApproving(false))
  }

  return (
    <Card
      padding="lg"
      className={`${styles.questionCard} ${!question.approved ? styles.questionCardMuted : ''}`}
    >
      <div className={styles.questionHeader}>
        <span
          className={`${shared.badge} ${question.type === 'mcq' ? shared.badgeNeutral : shared.badgeAccent}`}
        >
          {TYPE_LABEL[question.type]}
        </span>
        <label className={shared.radioLabel}>
          <input
            type="checkbox"
            className={shared.checkbox}
            checked={question.approved}
            disabled={approving}
            onChange={handleApproveToggle}
          />
          {question.approved ? 'Approved' : 'Not approved yet'}
        </label>
      </div>

      <div className={shared.formGroup}>
        <label className={shared.label}>Question</label>
        <textarea
          className={shared.textarea}
          rows={2}
          value={draft.prompt}
          onChange={(event) => setDraft((d) => ({ ...d, prompt: event.target.value }))}
          onBlur={() => void commit()}
        />
      </div>

      {question.type === 'mcq' ? (
        <div className={shared.formGroup}>
          <span className={shared.label}>Answer options (pick the correct one)</span>
          <div className={styles.optionsList}>
            {draft.options.map((option, index) => (
              <div className={styles.optionRow} key={index}>
                <input
                  type="radio"
                  className={shared.radio}
                  name={`correct-${question.id}`}
                  checked={draft.correctIndex === index}
                  onChange={() => void commit({ correctIndex: index })}
                  aria-label={`Mark option ${index + 1} as correct`}
                />
                <input
                  className={`${shared.input} ${styles.optionInput}`}
                  value={option}
                  onChange={(event) =>
                    setDraft((d) => ({
                      ...d,
                      options: d.options.map((o, i) => (i === index ? event.target.value : o))
                    }))
                  }
                  onBlur={() => void commit()}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={shared.formGroup}>
          <span className={shared.label}>Correct answer</span>
          <div className={styles.tfRow}>
            {draft.options.map((option, index) => (
              <label className={shared.radioLabel} key={option}>
                <input
                  type="radio"
                  className={shared.radio}
                  name={`correct-${question.id}`}
                  checked={draft.correctIndex === index}
                  onChange={() => void commit({ correctIndex: index })}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={shared.formGroup}>
        <label className={shared.label}>Explanation (optional)</label>
        <input
          className={shared.input}
          value={draft.explanation}
          onChange={(event) => setDraft((d) => ({ ...d, explanation: event.target.value }))}
          onBlur={() => void commit()}
          placeholder="One friendly sentence explaining the answer"
        />
      </div>

      {saving && <span className={shared.hint}>Saving…</span>}
    </Card>
  )
}

export function QuizPreviewEdit({ subjectId, textId }: QuizPreviewEditProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [textTitle, setTextTitle] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [quizName, setQuizName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [creating, setCreating] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)

  useEffect(() => {
    api.texts
      .listBySubject(subjectId)
      .then((texts) => {
        const text = texts.find((t) => t.id === textId)
        if (text) {
          setTextTitle(text.title)
          setQuizName((current) =>
            nameTouched ? current : text.suggestedQuizName?.trim() || `${text.title} quiz`
          )
        }
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    api.questions
      .listByText(textId)
      .then(setQuestions)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, textId])

  const handleApprovedChange = (id: number, approved: boolean): void => {
    setQuestions((current) =>
      current ? current.map((q) => (q.id === id ? { ...q, approved } : q)) : current
    )
  }

  const handleApproveAll = (): void => {
    if (!questions) return
    const unapprovedIds = questions.filter((q) => !q.approved).map((q) => q.id)
    if (unapprovedIds.length === 0) return
    setApprovingAll(true)
    api.questions
      .setApproved(unapprovedIds, true)
      .then(() => {
        setQuestions((current) =>
          current ? current.map((q) => ({ ...q, approved: true })) : current
        )
        showToast('All questions approved.', 'success')
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setApprovingAll(false))
  }

  const approvedIds = (questions ?? []).filter((q) => q.approved).map((q) => q.id)

  const handleCreateQuiz = (): void => {
    if (approvedIds.length === 0 || !quizName.trim()) return
    setCreating(true)
    api.quizzes
      .createFromQuestions(subjectId, quizName.trim(), 'single_text', approvedIds)
      .then(() => {
        showToast('Quiz created!', 'success')
        navigate({ area: 'adult', screen: 'subject-detail', subjectId })
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setCreating(false))
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Review questions</h1>
          <p className={shared.subtitle}>
            {textTitle ? `For "${textTitle}"` : 'Check each question, then approve the ones to use.'}
          </p>
        </div>
        {questions && questions.length > 0 && (
          <div className={shared.headerActions}>
            <Button variant="secondary" onClick={handleApproveAll} disabled={approvingAll}>
              {approvingAll ? 'Approving…' : 'Approve all'}
            </Button>
          </div>
        )}
      </div>

      {questions === null && (
        <div className={shared.center}>
          <Spinner label="Loading questions…" />
        </div>
      )}

      {questions !== null && questions.length === 0 && (
        <EmptyState
          title="No questions yet"
          message="Questions for this text will show up here once they're generated."
          pose="thinking"
        />
      )}

      {questions !== null && questions.length > 0 && (
        <>
          <div className={shared.list}>
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                onApprovedChange={handleApprovedChange}
              />
            ))}
          </div>

          <Card padding="lg" className={styles.footerCard}>
            <p className={shared.rowMeta}>
              {approvedIds.length} of {questions.length} approved
            </p>
            <div className={`${shared.formGroup} ${styles.nameField}`}>
              <label className={shared.label} htmlFor="quiz-name">
                Quiz name
              </label>
              <input
                id="quiz-name"
                className={shared.input}
                value={quizName}
                onChange={(event) => {
                  setNameTouched(true)
                  setQuizName(event.target.value)
                }}
              />
            </div>
            <div className={shared.footerButtons}>
              <Button
                onClick={handleCreateQuiz}
                disabled={approvedIds.length === 0 || !quizName.trim() || creating}
              >
                {creating ? 'Creating…' : `Create quiz (${approvedIds.length})`}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
