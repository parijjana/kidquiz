import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Chapter, Quiz, Subject, TextEntry } from '@shared/types'
import { api } from '../../api'
import { Button, Card, EmptyState, Modal, Spinner, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './SubjectDetail.module.css'

export interface SubjectDetailProps {
  subjectId: number
}

interface TextCounts {
  approved: number
  pending: number
}

interface ChapterGroup<T> {
  key: string
  chapter: Chapter | null
  items: T[]
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
  consolidated: 'Mixed quiz',
  dynamic: 'Practice quiz'
}

/** Groups items with a `chapterId` into per-chapter buckets, plus a trailing "No chapter" bucket. */
function groupByChapter<T extends { chapterId: number | null }>(
  items: T[],
  chapters: Chapter[]
): ChapterGroup<T>[] {
  const groups: ChapterGroup<T>[] = chapters.map((c) => ({ key: String(c.id), chapter: c, items: [] }))
  const noChapter: ChapterGroup<T> = { key: 'none', chapter: null, items: [] }
  for (const item of items) {
    const group = item.chapterId === null ? undefined : groups.find((g) => g.chapter?.id === item.chapterId)
    ;(group ?? noChapter).items.push(item)
  }
  return [...groups, noChapter]
}

export function SubjectDetail({ subjectId }: SubjectDetailProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [subject, setSubject] = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[] | null>(null)
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

  const [chapterModalOpen, setChapterModalOpen] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [creatingChapter, setCreatingChapter] = useState(false)

  const [renameChapterTarget, setRenameChapterTarget] = useState<Chapter | null>(null)
  const [renameChapterValue, setRenameChapterValue] = useState('')
  const [renamingChapter, setRenamingChapter] = useState(false)

  const [deleteChapterTarget, setDeleteChapterTarget] = useState<Chapter | null>(null)
  const [deletingChapter, setDeletingChapter] = useState(false)

  const [draggingQuizId, setDraggingQuizId] = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const loadChapters = (): void => {
    api.chapters
      .list(subjectId)
      .then(setChapters)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

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
    loadChapters()
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

  const handleCreateChapter = (event: FormEvent): void => {
    event.preventDefault()
    const trimmed = newChapterName.trim()
    if (!trimmed) return
    setCreatingChapter(true)
    api.chapters
      .create(subjectId, trimmed)
      .then(() => {
        setChapterModalOpen(false)
        setNewChapterName('')
        showToast('Chapter added.', 'success')
        loadChapters()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setCreatingChapter(false))
  }

  const openRenameChapter = (chapter: Chapter): void => {
    setRenameChapterTarget(chapter)
    setRenameChapterValue(chapter.name)
  }

  const handleRenameChapter = (event: FormEvent): void => {
    event.preventDefault()
    if (!renameChapterTarget) return
    const trimmed = renameChapterValue.trim()
    if (!trimmed) return
    setRenamingChapter(true)
    api.chapters
      .rename(renameChapterTarget.id, trimmed)
      .then(() => {
        setRenameChapterTarget(null)
        showToast('Chapter renamed.', 'success')
        loadChapters()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setRenamingChapter(false))
  }

  const handleDeleteChapter = (): void => {
    if (!deleteChapterTarget) return
    setDeletingChapter(true)
    api.chapters
      .remove(deleteChapterTarget.id)
      .then(() => {
        setDeleteChapterTarget(null)
        showToast('Chapter deleted. Its texts and quizzes moved to "No chapter".', 'success')
        loadChapters()
        loadTexts()
        loadQuizzes()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setDeletingChapter(false))
  }

  const handleTextChapterChange = (text: TextEntry, chapterId: number | null): void => {
    api.texts
      .setChapter(text.id, chapterId)
      .then(() => loadTexts())
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  const handleQuizChapterChange = (quizId: number, chapterId: number | null): void => {
    api.quizzes
      .setChapter(quizId, chapterId)
      .then(() => {
        showToast('Quiz moved.', 'success')
        loadQuizzes()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  const handleDragStart =
    (quiz: Quiz) =>
    (event: React.DragEvent<HTMLDivElement>): void => {
      setDraggingQuizId(quiz.id)
      event.dataTransfer.setData('text/plain', String(quiz.id))
      event.dataTransfer.effectAllowed = 'move'
    }

  const handleDragEnd = (): void => {
    setDraggingQuizId(null)
    setDragOverKey(null)
  }

  const handleDragOverChapter =
    (key: string) =>
    (event: React.DragEvent<HTMLDivElement>): void => {
      if (draggingQuizId === null) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (dragOverKey !== key) setDragOverKey(key)
    }

  const handleDragLeaveChapter =
    (key: string) =>
    (): void => {
      setDragOverKey((current) => (current === key ? null : current))
    }

  const handleDropOnChapter =
    (chapterId: number | null) =>
    (event: React.DragEvent<HTMLDivElement>): void => {
      event.preventDefault()
      setDragOverKey(null)
      if (draggingQuizId === null) return
      handleQuizChapterChange(draggingQuizId, chapterId)
      setDraggingQuizId(null)
    }

  const loading = chapters === null || texts === null || quizzes === null
  const chapterList = chapters ?? []

  const bankTotals = Object.values(textCounts).reduce(
    (acc, count) => ({
      approved: acc.approved + count.approved,
      pending: acc.pending + count.pending
    }),
    { approved: 0, pending: 0 }
  )
  const bankTotal = bankTotals.approved + bankTotals.pending

  const textGroups = texts ? groupByChapter(texts, chapterList) : []
  const quizGroups = quizzes ? groupByChapter(quizzes, chapterList) : []

  const totallyEmpty =
    chapterList.length === 0 && (texts?.length ?? 0) === 0 && (quizzes?.length ?? 0) === 0

  const sections: { chapter: Chapter | null; key: string }[] = [
    ...chapterList.map((c) => ({ chapter: c, key: String(c.id) })),
    { chapter: null, key: 'none' }
  ]

  function renderTextRow(text: TextEntry): React.JSX.Element {
    const count = textCounts[text.id]
    return (
      <Card key={text.id} className={shared.row}>
        <div className={shared.rowMain}>
          <span className={shared.rowTitle}>{text.title}</span>
          <span className={shared.rowMeta}>
            Added {formatDate(text.createdAt)}
            {count ? ` · ${count.approved} approved · ${count.pending} to review` : ''}
          </span>
        </div>
        <div className={shared.rowActions}>
          <select
            className={styles.chapterSelect}
            value={text.chapterId === null ? '' : String(text.chapterId)}
            onChange={(event) =>
              handleTextChapterChange(
                text,
                event.target.value === '' ? null : Number(event.target.value)
              )
            }
            aria-label={`Move "${text.title}" to a different chapter`}
          >
            <option value="">No chapter</option>
            {chapterList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate({ area: 'adult', screen: 'quiz-preview', subjectId, textId: text.id })
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
  }

  function renderQuizRow(quiz: Quiz): React.JSX.Element {
    return (
      <Card
        key={quiz.id}
        draggable
        onDragStart={handleDragStart(quiz)}
        onDragEnd={handleDragEnd}
        className={`${shared.row} ${draggingQuizId === quiz.id ? styles.quizRowDragging : ''}`}
      >
        <div className={shared.rowMain}>
          <span className={shared.rowTitle}>{quiz.name}</span>
          <span className={shared.rowMeta}>
            {QUIZ_KIND_LABEL[quiz.kind]} · Created {formatDate(quiz.createdAt)}
          </span>
        </div>
        <div className={shared.rowActions}>
          <select
            className={styles.chapterSelect}
            value={quiz.chapterId === null ? '' : String(quiz.chapterId)}
            onChange={(event) =>
              handleQuizChapterChange(
                quiz.id,
                event.target.value === '' ? null : Number(event.target.value)
              )
            }
            aria-label={`Move "${quiz.name}" to a different chapter`}
          >
            <option value="">No chapter</option>
            {chapterList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => navigate({ area: 'kid', screen: 'player', quizId: quiz.id })}>
            Play
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate({ area: 'print', screen: 'quiz', quizId: quiz.id })}
          >
            Print
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate({ area: 'adult', screen: 'quiz-edit', quizId: quiz.id })}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRemoveQuizTarget(quiz)}>
            Delete
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>{subject ? subject.name : 'Subject'}</h1>
          <p className={shared.subtitle}>Texts, questions, and quizzes for this subject.</p>
          {!loading && bankTotal > 0 && (
            <p className={shared.rowMeta}>
              {bankTotal} {bankTotal === 1 ? 'question' : 'questions'} in the bank — {bankTotals.approved}{' '}
              approved, {bankTotals.pending} awaiting review
            </p>
          )}
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

      {!loading && totallyEmpty && (
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

      {!loading && !totallyEmpty && (
        <>
          <div className={shared.sectionHeader}>
            <div>
              <h2 className={shared.sectionTitle}>Chapters</h2>
              <p className={styles.dragHint}>
                Drag a quiz onto a chapter name to move it, or use its dropdown.
              </p>
            </div>
            <div className={shared.headerActions}>
              <Button variant="secondary" onClick={openMixedModal}>
                Make a mixed quiz
              </Button>
              <Button variant="secondary" onClick={() => setChapterModalOpen(true)}>
                Add chapter
              </Button>
            </div>
          </div>

          <div className={shared.list}>
            {sections.map(({ chapter, key }) => {
              const sectionTexts = textGroups.find((g) => g.key === key)?.items ?? []
              const sectionQuizzes = quizGroups.find((g) => g.key === key)?.items ?? []

              if (chapter === null && chapterList.length > 0 && sectionTexts.length === 0 && sectionQuizzes.length === 0) {
                return null
              }

              return (
                <Card
                  key={key}
                  padding="lg"
                  className={`${styles.chapterSection} ${dragOverKey === key ? styles.chapterSectionDragOver : ''}`}
                  onDragOver={handleDragOverChapter(key)}
                  onDragEnter={handleDragOverChapter(key)}
                  onDragLeave={handleDragLeaveChapter(key)}
                  onDrop={handleDropOnChapter(chapter ? chapter.id : null)}
                >
                  <div className={styles.chapterHeader}>
                    <h3 className={styles.chapterTitle}>{chapter ? chapter.name : 'No chapter'}</h3>
                    {chapter && (
                      <div className={shared.rowActions}>
                        <Button variant="ghost" size="sm" onClick={() => openRenameChapter(chapter)}>
                          Rename
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteChapterTarget(chapter)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className={styles.subsection}>
                    <p className={styles.subsectionTitle}>Texts</p>
                    {sectionTexts.length === 0 && <p className={shared.muted}>No texts here yet.</p>}
                    {sectionTexts.length > 0 && (
                      <div className={shared.list}>{sectionTexts.map(renderTextRow)}</div>
                    )}
                  </div>

                  <div className={styles.subsection}>
                    <p className={styles.subsectionTitle}>Quizzes</p>
                    {sectionQuizzes.length === 0 && (
                      <p className={shared.muted}>No quizzes here yet.</p>
                    )}
                    {sectionQuizzes.length > 0 && (
                      <div className={shared.list}>{sectionQuizzes.map(renderQuizRow)}</div>
                    )}
                  </div>
                </Card>
              )
            })}
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

      <Modal
        open={chapterModalOpen}
        onClose={() => setChapterModalOpen(false)}
        title="Add a chapter"
      >
        <form onSubmit={handleCreateChapter} className={shared.section}>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="new-chapter-name">
              Chapter name
            </label>
            <input
              id="new-chapter-name"
              className={shared.input}
              value={newChapterName}
              onChange={(event) => setNewChapterName(event.target.value)}
              placeholder="e.g. Chapter 1, The Solar System"
              autoFocus
            />
          </div>
          <div className={shared.footerButtons}>
            <Button type="button" variant="ghost" onClick={() => setChapterModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newChapterName.trim() || creatingChapter}>
              {creatingChapter ? 'Adding…' : 'Add chapter'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={renameChapterTarget !== null}
        onClose={() => setRenameChapterTarget(null)}
        title="Rename chapter"
      >
        <form onSubmit={handleRenameChapter} className={shared.section}>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="rename-chapter-name">
              Chapter name
            </label>
            <input
              id="rename-chapter-name"
              className={shared.input}
              value={renameChapterValue}
              onChange={(event) => setRenameChapterValue(event.target.value)}
              autoFocus
            />
          </div>
          <div className={shared.footerButtons}>
            <Button type="button" variant="ghost" onClick={() => setRenameChapterTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!renameChapterValue.trim() || renamingChapter}>
              {renamingChapter ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteChapterTarget !== null}
        onClose={() => setDeleteChapterTarget(null)}
        title="Delete this chapter?"
        footer={
          <div className={shared.footerButtons}>
            <Button variant="ghost" onClick={() => setDeleteChapterTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDeleteChapter} disabled={deletingChapter}>
              {deletingChapter ? 'Deleting…' : 'Delete chapter'}
            </Button>
          </div>
        }
      >
        <p>
          This deletes <strong>{deleteChapterTarget?.name}</strong>. Its texts and quizzes are
          kept — they just move to &ldquo;No chapter&rdquo;. This can&rsquo;t be undone.
        </p>
      </Modal>
    </div>
  )
}
