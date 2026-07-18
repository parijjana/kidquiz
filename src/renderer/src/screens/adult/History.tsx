import { useEffect, useState } from 'react'
import type { Attempt, Quiz, Subject } from '@shared/types'
import { api } from '../../api'
import { Card, EmptyState, Spinner, useToast } from '../../components'
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

export function History({ subjectId }: HistoryProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [quizzesById, setQuizzesById] = useState<Map<number, Quiz>>(new Map())

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
            return (
              <Card key={attempt.id} className={shared.row}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>{quiz?.name ?? 'Deleted quiz'}</span>
                  <span className={shared.rowMeta}>
                    {formatDateTime(attempt.takenAt)} · {attempt.childName ?? '—'}
                  </span>
                </div>
                <span className={`${shared.badge} ${scoreBadgeClass(attempt.score, attempt.total)} ${styles.scoreBadge}`}>
                  {attempt.score}/{attempt.total}
                </span>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
