import { useEffect, useState } from 'react'
import type { Attempt, AttemptAnswer, Question, Quiz, Subject } from '@shared/types'
import { api } from '../../api'
import { Button, Card, EmptyState, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './History.module.css'

export interface HistoryProps {
  subjectId?: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatDateTime(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : `${iso}Z`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function scoreBadgeClass(score: number, total: number): string {
  if (total <= 0) return shared.badgeNeutral
  const pct = score / total
  if (pct >= 0.8) return shared.badgeSuccess
  if (pct >= 0.5) return shared.badgeAccent
  return shared.badgeWarn
}

interface DetailRow {
  answer: AttemptAnswer
  /** `null` when the question behind this answer is no longer available. */
  question: Question | null
}

interface DetailState {
  status: 'loading' | 'ready' | 'error'
  rows: DetailRow[]
}

export function History({ subjectId }: HistoryProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [quizzesById, setQuizzesById] = useState<Map<number, Quiz>>(new Map())

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, DetailState>>({})

  useEffect(() => {
    if (subjectId === undefined) {
      setSubject(null)
    } else {
      api.subjects
        .list()
        .then((list) => setSubject(list.find((s) => s.id === subjectId) ?? null))
        .catch((err: unknown) => showToast(errMessage(err), 'error'))
    }

    Promise.all([api.attempts.list(), api.quizzes.list()])
      .then(([attemptList, quizList]) => {
        setQuizzesById(new Map(quizList.map((quiz) => [quiz.id, quiz])))
        const filtered =
          subjectId === undefined
            ? attemptList
            : attemptList.filter((attempt) => {
                const quiz = quizList.find((q) => q.id === attempt.quizId)
                return quiz?.subjectId === subjectId
              })
        setAttempts(filtered)
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  const loadDetail = (attempt: Attempt): void => {
    setDetails((current) => ({ ...current, [attempt.id]: { status: 'loading', rows: [] } }))
    const quiz = quizzesById.get(attempt.quizId)

    Promise.all([
      api.attempts.answers(attempt.id),
      // The quiz's own `questions` only reflects what's CURRENTLY in it —
      // an edited/deleted quiz may no longer include a question this
      // attempt answered. Look questions up from the subject's whole bank
      // instead, so history stays correct even after edits.
      quiz ? api.questions.listBySubject(quiz.subjectId) : Promise.resolve<Question[]>([])
    ])
      .then(([answers, questions]) => {
        const questionsById = new Map(questions.map((q) => [q.id, q]))
        const rows: DetailRow[] = [...answers]
          .sort((a, b) => a.position - b.position)
          .map((answer) => ({ answer, question: questionsById.get(answer.questionId) ?? null }))
        setDetails((current) => ({ ...current, [attempt.id]: { status: 'ready', rows } }))
      })
      .catch(() => {
        setDetails((current) => ({ ...current, [attempt.id]: { status: 'error', rows: [] } }))
      })
  }

  const toggleExpand = (attempt: Attempt): void => {
    const next = expandedId === attempt.id ? null : attempt.id
    setExpandedId(next)
    if (next !== null && !details[attempt.id]) {
      loadDetail(attempt)
    }
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>
            {subjectId !== undefined ? `History — ${subject?.name ?? 'Subject'}` : 'Quiz history'}
          </h1>
          <p className={shared.subtitle}>Every quiz attempt, most recent first.</p>
          {subjectId !== undefined && (
            <button
              className={shared.link}
              onClick={() => navigate({ area: 'adult', screen: 'history' })}
            >
              Show all subjects
            </button>
          )}
        </div>
      </div>

      {attempts === null && (
        <div className={shared.center}>
          <Spinner label="Loading history…" />
        </div>
      )}

      {attempts !== null && attempts.length === 0 && (
        <EmptyState
          title="No quiz attempts yet"
          message={
            subjectId !== undefined
              ? 'Once someone plays a quiz from this subject, their scores will show up here.'
              : 'Once someone plays a quiz, their scores will show up here.'
          }
          pose="thinking"
        />
      )}

      {attempts !== null && attempts.length > 0 && (
        <div className={shared.list}>
          {attempts.map((attempt) => {
            const quiz = quizzesById.get(attempt.quizId)
            const expanded = expandedId === attempt.id
            const detail = details[attempt.id]
            return (
              <Card key={attempt.id} className={styles.attemptCard}>
                <div className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>{quiz?.name ?? 'Deleted quiz'}</span>
                    <span className={shared.rowMeta}>
                      {formatDateTime(attempt.takenAt)} · {attempt.childName ?? '—'}
                    </span>
                  </div>
                  <div className={shared.rowActions}>
                    <span
                      className={`${shared.badge} ${scoreBadgeClass(attempt.score, attempt.total)} ${styles.scoreBadge}`}
                    >
                      {attempt.score}/{attempt.total}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(attempt)}>
                      {expanded ? 'Hide details' : 'Show details'}
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className={styles.detailWrap}>
                    {(!detail || detail.status === 'loading') && (
                      <div className={shared.center}>
                        <Spinner size={24} label="Loading answers…" />
                      </div>
                    )}
                    {detail?.status === 'error' && (
                      <p className={shared.errorText}>
                        We couldn&rsquo;t load the answers for this attempt.
                      </p>
                    )}
                    {detail?.status === 'ready' && detail.rows.length === 0 && (
                      <p className={shared.muted}>No answer detail was saved for this attempt.</p>
                    )}
                    {detail?.status === 'ready' && detail.rows.length > 0 && (
                      <ol className={styles.detailList}>
                        {detail.rows.map((row) => (
                          <li key={row.answer.position} className={styles.detailRow}>
                            {row.question ? (
                              <>
                                <p className={styles.detailPrompt}>{row.question.prompt}</p>
                                <p className={styles.detailAnswerLine}>
                                  <span
                                    className={`${shared.badge} ${row.answer.correct ? shared.badgeSuccess : shared.badgeWarn}`}
                                  >
                                    {row.answer.correct ? 'Correct' : 'Not quite'}
                                  </span>
                                  <span>
                                    Answered:{' '}
                                    <strong>
                                      {row.question.options[row.answer.chosenIndex] ?? '—'}
                                    </strong>
                                    {!row.answer.correct && (
                                      <>
                                        {' '}
                                        · Correct answer:{' '}
                                        <strong>
                                          {row.question.options[row.question.correctIndex]}
                                        </strong>
                                      </>
                                    )}
                                  </span>
                                </p>
                              </>
                            ) : (
                              <p className={shared.muted}>
                                This question is no longer available.
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
