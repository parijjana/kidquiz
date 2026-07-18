import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Quiz, Subject, TextEntry } from '@shared/types'
import { api } from '../../api'
import { Button, Card, EmptyState, Modal, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'

export interface SubjectDetailProps {
  subjectId: number
}

interface TextCounts {
  approved: number
  pending: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatDate(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : `${iso}Z`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const QUIZ_KIND_LABEL: Record<Quiz['kind'], string> = {
  single_text: 'From one text',
  consolidated: 'Mixed quiz'
}

export function SubjectDetail({ subjectId }: SubjectDetailProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [texts, setTexts] = useState<TextEntry[] | null>(null)
  const [textCounts, setTextCounts] = useState<Record<number, TextCounts>>({})
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null)

  const [removeTextTarget, setRemoveTextTarget] = useState<TextEntry | null>(null)
  const [removingText, setRemovingText] = useState(false)

  const [removeQuizTarget, setRemoveQuizTarget] = useState<Quiz | null>(null)
  const [removingQuiz, setRemovingQuiz] = useState(false)

  const [mixedOpen, setMixedOpen] = useState(false)
  const [mixedName, setMixedName] = useState('')
  const [mixedCount, setMixedCount] = useState(10)
  const [creatingMixed, setCreatingMixed] = useState(false)

  const loadTexts = (): void => {
    api.texts
      .listBySubject(subjectId)
      .then((list) => {
        setTexts(list)
        void Promise.all(
          list.map(async (text) => {
            const questions = await api.questions.listByText(text.id)
            const approved = questions.filter((q) => q.approved).length
            return [text.id, { approved, pending: questions.length - approved }] as const
          })
        ).then((entries) => setTextCounts(Object.fromEntries(entries)))
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  const loadQuizzes = (): void => {
    api.quizzes
      .list(subjectId)
      .then(setQuizzes)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  useEffect(() => {
    api.subjects
      .list()
      .then((list) => setSubject(list.find((s) => s.id === subjectId) ?? null))
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    loadTexts()
    loadQuizzes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  const handleRemoveText = (): void => {
    if (!removeTextTarget) return
    setRemovingText(true)
    api.texts
      .remove(removeTextTarget.id)
      .then(() => {
        setRemoveTextTarget(null)
        showToast('Text removed.', 'success')
        loadTexts()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setRemovingText(false))
  }

  const handleRemoveQuiz = (): void => {
    if (!removeQuizTarget) return
    setRemovingQuiz(true)
    api.quizzes
      .remove(removeQuizTarget.id)
      .then(() => {
        setRemoveQuizTarget(null)
        showToast('Quiz removed.', 'success')
        loadQuizzes()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setRemovingQuiz(false))
  }

  const openMixedModal = (): void => {
    setMixedName(subject ? `${subject.name} mixed quiz` : 'Mixed quiz')
    setMixedCount(10)
    setMixedOpen(true)
  }

  const handleCreateMixed = (event: FormEvent): void => {
    event.preventDefault()
    const trimmed = mixedName.trim()
    if (!trimmed || mixedCount < 1) return
    setCreatingMixed(true)
    api.quizzes
      .createConsolidated(subjectId, trimmed, mixedCount)
      .then(() => {
        setMixedOpen(false)
        showToast('Mixed quiz created!', 'success')
        loadQuizzes()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setCreatingMixed(false))
  }

  const loading = texts === null || quizzes === null

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>{subject ? subject.name : 'Subject'}</h1>
          <p className={shared.subtitle}>Texts, questions, and quizzes for this subject.</p>
        </div>
        <div className={shared.headerActions}>
          <Button
            variant="ghost"
            onClick={() => navigate({ area: 'adult', screen: 'history', subjectId })}
          >
            View history
          </Button>
          <Button onClick={() => navigate({ area: 'adult', screen: 'add-text', subjectId })}>
            Add text
          </Button>
        </div>
      </div>

      {loading && (
        <div className={shared.center}>
          <Spinner label="Loading subject…" />
        </div>
      )}

      {!loading && (
        <>
          <div className={shared.section}>
            <div className={shared.sectionHeader}>
              <h2 className={shared.sectionTitle}>Texts</h2>
            </div>

            {texts && texts.length === 0 && (
              <EmptyState
                title="No texts yet"
                message="Paste in a text and KidQuiz will make questions from it."
                pose="thinking"
                action={
                  <Button onClick={() => navigate({ area: 'adult', screen: 'add-text', subjectId })}>
                    Add text
                  </Button>
                }
              />
            )}

            {texts && texts.length > 0 && (
              <div className={shared.list}>
                {texts.map((text) => {
                  const count = textCounts[text.id]
                  return (
                    <Card key={text.id} className={shared.row}>
                      <div className={shared.rowMain}>
                        <span className={shared.rowTitle}>{text.title}</span>
                        <span className={shared.rowMeta}>
                          Added {formatDate(text.createdAt)}
                          {count
                            ? ` · ${count.approved} approved · ${count.pending} to review`
                            : ''}
                        </span>
                      </div>
                      <div className={shared.rowActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            navigate({
                              area: 'adult',
                              screen: 'quiz-preview',
                              subjectId,
                              textId: text.id
                            })
                          }
                        >
                          Review questions
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRemoveTextTarget(text)}>
                          Remove
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          <div className={shared.section}>
            <div className={shared.sectionHeader}>
              <h2 className={shared.sectionTitle}>Quizzes</h2>
              <Button variant="secondary" onClick={openMixedModal}>
                Make a mixed quiz
              </Button>
            </div>

            {quizzes && quizzes.length === 0 && (
              <p className={shared.muted}>
                No quizzes yet. Approve some questions from a text above, or make a mixed quiz
                once you have approved questions.
              </p>
            )}

            {quizzes && quizzes.length > 0 && (
              <div className={shared.list}>
                {quizzes.map((quiz) => (
                  <Card key={quiz.id} className={shared.row}>
                    <div className={shared.rowMain}>
                      <span className={shared.rowTitle}>{quiz.name}</span>
                      <span className={shared.rowMeta}>
                        {QUIZ_KIND_LABEL[quiz.kind]} · Created {formatDate(quiz.createdAt)}
                      </span>
                    </div>
                    <div className={shared.rowActions}>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate({ area: 'kid', screen: 'player', quizId: quiz.id })
                        }
                      >
                        Play
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          navigate({ area: 'print', screen: 'quiz', quizId: quiz.id })
                        }
                      >
                        Print
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRemoveQuizTarget(quiz)}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={removeTextTarget !== null}
        onClose={() => setRemoveTextTarget(null)}
        title="Remove this text?"
        footer={
          <div className={shared.footerButtons}>
            <Button variant="ghost" onClick={() => setRemoveTextTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRemoveText} disabled={removingText}>
              {removingText ? 'Removing…' : 'Remove text'}
            </Button>
          </div>
        }
      >
        <p>
          This removes <strong>{removeTextTarget?.title}</strong> and all of its questions. Any
          quizzes already made from it are kept. This can&rsquo;t be undone.
        </p>
      </Modal>

      <Modal
        open={removeQuizTarget !== null}
        onClose={() => setRemoveQuizTarget(null)}
        title="Delete this quiz?"
        footer={
          <div className={shared.footerButtons}>
            <Button variant="ghost" onClick={() => setRemoveQuizTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRemoveQuiz} disabled={removingQuiz}>
              {removingQuiz ? 'Deleting…' : 'Delete quiz'}
            </Button>
          </div>
        }
      >
        <p>
          This deletes <strong>{removeQuizTarget?.name}</strong> and its score history. The
          questions themselves stay in the subject&rsquo;s question bank. This can&rsquo;t be
          undone.
        </p>
      </Modal>

      <Modal
        open={mixedOpen}
        onClose={() => {
          if (!creatingMixed) setMixedOpen(false)
        }}
        title="Make a mixed quiz"
      >
        <form onSubmit={handleCreateMixed} className={shared.section}>
          <p className={shared.hint}>
            Pulls questions from across this subject&rsquo;s approved question bank, favouring
            ones that haven&rsquo;t been used in a while.
          </p>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="mixed-quiz-name">
              Quiz name
            </label>
            <input
              id="mixed-quiz-name"
              className={shared.input}
              value={mixedName}
              onChange={(event) => setMixedName(event.target.value)}
              autoFocus
            />
          </div>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="mixed-quiz-count">
              How many questions?
            </label>
            <input
              id="mixed-quiz-count"
              type="number"
              min={1}
              max={50}
              className={shared.input}
              value={mixedCount}
              onChange={(event) => setMixedCount(Number(event.target.value))}
            />
          </div>
          <div className={shared.footerButtons}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMixedOpen(false)}
              disabled={creatingMixed}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!mixedName.trim() || mixedCount < 1 || creatingMixed}>
              {creatingMixed ? (
                <>
                  <Spinner size={16} label="Creating" /> Creating…
                </>
              ) : (
                'Create mixed quiz'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
