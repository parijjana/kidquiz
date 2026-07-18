import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Subject } from '@shared/types'
import { api } from '../../api'
import { Button, Card, EmptyState, Modal, useToast } from '../../components'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'

interface SubjectCounts {
  texts: number
  questions: number
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function SubjectList(): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [counts, setCounts] = useState<Record<number, SubjectCounts>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  const [renameTarget, setRenameTarget] = useState<Subject | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadSubjects = (): void => {
    api.subjects
      .list()
      .then((list) => {
        setSubjects(list)
        // Fetch text/question counts per subject in the background — cheap
        // enough for the small number of subjects a family/classroom keeps.
        void Promise.all(
          list.map(async (subject) => {
            const [texts, questions] = await Promise.all([
              api.texts.listBySubject(subject.id),
              api.questions.listBySubject(subject.id)
            ])
            return [subject.id, { texts: texts.length, questions: questions.length }] as const
          })
        ).then((entries) => {
          setCounts(Object.fromEntries(entries))
        })
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  useEffect(loadSubjects, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = (): void => {
    setCreateName('')
    setCreateOpen(true)
  }

  const handleCreate = (event: FormEvent): void => {
    event.preventDefault()
    const trimmed = createName.trim()
    if (!trimmed) return
    setCreating(true)
    api.subjects
      .create(trimmed)
      .then((subject) => {
        setCreateOpen(false)
        showToast(`"${subject.name}" created.`, 'success')
        navigate({ area: 'adult', screen: 'subject-detail', subjectId: subject.id })
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setCreating(false))
  }

  const openRename = (subject: Subject): void => {
    setRenameTarget(subject)
    setRenameValue(subject.name)
  }

  const handleRename = (event: FormEvent): void => {
    event.preventDefault()
    if (!renameTarget) return
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setRenaming(true)
    api.subjects
      .rename(renameTarget.id, trimmed)
      .then(() => {
        setRenameTarget(null)
        showToast('Subject renamed.', 'success')
        loadSubjects()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setRenaming(false))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeleting(true)
    api.subjects
      .remove(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null)
        showToast(`"${deleteTarget.name}" deleted.`, 'success')
        loadSubjects()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setDeleting(false))
  }

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Subjects</h1>
          <p className={shared.subtitle}>
            Group texts and quizzes by subject — like "Space" or "Ancient Egypt".
          </p>
        </div>
        <div className={shared.headerActions}>
          <Button onClick={openCreate}>New subject</Button>
        </div>
      </div>

      {subjects === null && <div className={shared.center}>Loading subjects…</div>}

      {subjects !== null && subjects.length === 0 && (
        <EmptyState
          title="No subjects yet"
          message="Create your first subject, then add a text to it to start making questions."
          action={<Button onClick={openCreate}>New subject</Button>}
        />
      )}

      {subjects !== null && subjects.length > 0 && (
        <div className={shared.list}>
          {subjects.map((subject) => {
            const count = counts[subject.id]
            return (
              <Card
                key={subject.id}
                interactive
                className={shared.row}
                onClick={() => navigate({ area: 'adult', screen: 'subject-detail', subjectId: subject.id })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate({ area: 'adult', screen: 'subject-detail', subjectId: subject.id })
                  }
                }}
              >
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>{subject.name}</span>
                  <span className={shared.rowMeta}>
                    {count
                      ? `${count.texts} ${count.texts === 1 ? 'text' : 'texts'} · ${count.questions} ${
                          count.questions === 1 ? 'question' : 'questions'
                        }`
                      : '…'}
                  </span>
                </div>
                <div className={shared.rowActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      openRename(subject)
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      setDeleteTarget(subject)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New subject">
        <form onSubmit={handleCreate} className={shared.section}>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="new-subject-name">
              Subject name
            </label>
            <input
              id="new-subject-name"
              className={shared.input}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. Space, Ancient Egypt, Rainforests"
              autoFocus
            />
          </div>
          <div className={shared.footerButtons}>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!createName.trim() || creating}>
              {creating ? 'Creating…' : 'Create subject'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={renameTarget !== null} onClose={() => setRenameTarget(null)} title="Rename subject">
        <form onSubmit={handleRename} className={shared.section}>
          <div className={shared.formGroup}>
            <label className={shared.label} htmlFor="rename-subject-name">
              Subject name
            </label>
            <input
              id="rename-subject-name"
              className={shared.input}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
          </div>
          <div className={shared.footerButtons}>
            <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!renameValue.trim() || renaming}>
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete subject?"
        footer={
          <div className={shared.footerButtons}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete everything'}
            </Button>
          </div>
        }
      >
        <p>
          This permanently deletes <strong>{deleteTarget?.name}</strong> and everything under
          it — all of its texts, questions, and quizzes. This can&rsquo;t be undone.
        </p>
      </Modal>
    </div>
  )
}
