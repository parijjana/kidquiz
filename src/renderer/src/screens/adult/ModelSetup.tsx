import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  InstalledModel,
  ModelCatalogEntry,
  ModelStatus,
  PlatformInfo
} from '@shared/types'
import { api, useKidquizEvent } from '../../api'
import {
  Button,
  Card,
  GeminiProviderSection,
  Modal,
  ProgressBar,
  Spinner,
  useToast
} from '../../components'
import shared from './shared.module.css'
import styles from './ModelSetup.module.css'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatGB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

interface DownloadState {
  bytesDone: number
  bytesTotal: number
}

export function ModelSetup(): React.JSX.Element {
  const { showToast } = useToast()

  const [catalog, setCatalog] = useState<ModelCatalogEntry[] | null>(null)
  const [installed, setInstalled] = useState<InstalledModel[] | null>(null)
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)

  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})
  const cancelledRef = useRef<Set<string>>(new Set())

  const [settingActive, setSettingActive] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InstalledModel | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refreshInstalled = useCallback((): void => {
    api.models
      .installed()
      .then(setInstalled)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    api.models
      .status()
      .then(setStatus)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.models
      .catalog()
      .then(setCatalog)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    api.system
      .platformInfo()
      .then(setPlatformInfo)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    refreshInstalled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useKidquizEvent(
    'model:downloadProgress',
    useCallback((payload) => {
      setDownloads((current) => ({
        ...current,
        [payload.modelId]: { bytesDone: payload.bytesDone, bytesTotal: payload.bytesTotal }
      }))
    }, [])
  )

  useKidquizEvent(
    'model:downloadDone',
    useCallback(
      (payload) => {
        setDownloads((current) => {
          const next = { ...current }
          delete next[payload.modelId]
          return next
        })
        showToast('Model downloaded.', 'success')
        refreshInstalled()
      },
      [refreshInstalled, showToast]
    )
  )

  useKidquizEvent(
    'model:downloadError',
    useCallback((payload) => {
      setDownloads((current) => {
        const next = { ...current }
        delete next[payload.modelId]
        return next
      })
    }, [])
  )

  const handleDownload = (entry: ModelCatalogEntry): void => {
    setDownloads((current) => ({ ...current, [entry.id]: { bytesDone: 0, bytesTotal: entry.fileSizeBytes } }))
    api.models
      .download(entry.id)
      .catch((err: unknown) => {
        if (cancelledRef.current.has(entry.id)) {
          cancelledRef.current.delete(entry.id)
          showToast('Download cancelled.', 'info')
          return
        }
        showToast(errMessage(err), 'error')
      })
      .finally(() => {
        setDownloads((current) => {
          const next = { ...current }
          delete next[entry.id]
          return next
        })
      })
  }

  const handleCancelDownload = (modelId: string): void => {
    cancelledRef.current.add(modelId)
    api.models.cancelDownload(modelId).catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  const handleSetActive = (modelId: string): void => {
    setSettingActive(modelId)
    api.models
      .setActive(modelId)
      .then(() => {
        showToast('Model is ready to use.', 'success')
        refreshInstalled()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setSettingActive(null))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeleting(true)
    api.models
      .remove(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null)
        showToast('Model deleted.', 'success')
        refreshInstalled()
      })
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setDeleting(false))
  }

  const installedIds = new Set((installed ?? []).map((m) => m.id))
  // §14 busy state: switching the active model can take 10s+ (it eagerly
  // loads the model into memory) — lock other model actions meanwhile.
  const switchingActive = settingActive !== null

  const bestFitId = (() => {
    if (!catalog || !platformInfo) return undefined
    const fitting = [...catalog]
      .filter((entry) => entry.minRamGB <= platformInfo.totalRamGB)
      .sort((a, b) => b.minRamGB - a.minRamGB)
    return fitting[0]?.id
  })()

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Quiz helper setup</h1>
          <p className={shared.subtitle}>
            KidQuiz needs a quiz helper to write questions. Use Gemini (cloud, fastest, needs a
            free Google key) or download a helper that runs completely on this computer — no
            internet needed once it&rsquo;s downloaded. You only need one.
          </p>
        </div>
      </div>

      {status && (
        <p className={shared.muted}>
          {status.activeModelId
            ? `Currently using: ${
                catalog?.find((e) => e.id === status.activeModelId)?.displayName ??
                status.activeModelId
              } ${status.loaded ? '(ready)' : '(will load when needed)'}`
            : 'No model selected yet — download one below.'}
          {platformInfo ? ` · This computer has about ${platformInfo.totalRamGB.toFixed(1)} GB of RAM.` : ''}
        </p>
      )}

      <div className={shared.section}>
        <Card padding="lg" className={styles.modelCard}>
          <div className={shared.rowMain}>
            <span className={shared.rowTitle}>Gemini (cloud)</span>
            <span className={shared.rowMeta}>
              Fastest option — needs a free Google account and an internet connection.
            </span>
          </div>
          <GeminiProviderSection heading={null} />
        </Card>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Download a model (on-device)</h2>
        {catalog === null && (
          <div className={shared.center}>
            <Spinner label="Loading model list…" />
          </div>
        )}
        <div className={shared.list}>
          {catalog?.map((entry) => {
            const download = downloads[entry.id]
            const isInstalled = installedIds.has(entry.id)
            const fits = platformInfo ? entry.minRamGB <= platformInfo.totalRamGB : true
            return (
              <Card key={entry.id} padding="lg" className={styles.modelCard}>
                <div className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>{entry.displayName}</span>
                    <span className={shared.rowMeta}>{entry.description}</span>
                    <div className={styles.badgeRow}>
                      <span className={`${shared.badge} ${shared.badgeNeutral}`}>
                        {formatGB(entry.fileSizeBytes)} download
                      </span>
                      <span className={`${shared.badge} ${shared.badgeNeutral}`}>
                        Needs about {entry.minRamGB} GB RAM
                      </span>
                      {entry.id === bestFitId && (
                        <span className={`${shared.badge} ${shared.badgeSuccess}`}>
                          Best for this computer
                        </span>
                      )}
                      {!fits && (
                        <span className={`${shared.badge} ${shared.badgeWarn}`}>
                          May run slowly on this computer
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={shared.rowActions}>
                    {isInstalled ? (
                      <span className={`${shared.badge} ${shared.badgeSuccess}`}>Downloaded</span>
                    ) : download ? (
                      <Button variant="ghost" onClick={() => handleCancelDownload(entry.id)}>
                        Cancel
                      </Button>
                    ) : (
                      <Button onClick={() => handleDownload(entry)} disabled={switchingActive}>
                        Download
                      </Button>
                    )}
                  </div>
                </div>
                {download && (
                  <ProgressBar
                    value={download.bytesDone}
                    max={Math.max(download.bytesTotal, 1)}
                    label={`Downloading… ${formatGB(download.bytesDone)} of ${formatGB(
                      download.bytesTotal || entry.fileSizeBytes
                    )}`}
                  />
                )}
              </Card>
            )
          })}
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Installed models</h2>
        {installed && installed.length === 0 && (
          <p className={shared.muted}>None yet — download a model above to get started.</p>
        )}
        {installed && installed.length > 0 && (
          <div className={shared.list}>
            {installed.map((model) => (
              <Card key={model.id} className={shared.row}>
                {settingActive === model.id ? (
                  <span className={shared.radioLabel}>
                    <Spinner size={20} label="Switching models" />
                    <span className={shared.rowMain}>
                      <span className={shared.rowTitle}>{model.displayName}</span>
                      <span className={shared.rowMeta}>
                        Loading this model — this can take a little while…
                      </span>
                    </span>
                  </span>
                ) : (
                  <label className={shared.radioLabel}>
                    <input
                      type="radio"
                      className={shared.radio}
                      name="active-model"
                      checked={model.active}
                      disabled={switchingActive}
                      onChange={() => handleSetActive(model.id)}
                    />
                    <span className={shared.rowMain}>
                      <span className={shared.rowTitle}>{model.displayName}</span>
                      <span className={shared.rowMeta}>
                        {formatGB(model.fileSizeBytes)} ·{' '}
                        {model.active ? 'Active' : 'Tap to make this the active model'}
                      </span>
                    </span>
                  </label>
                )}
                <div className={shared.rowActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(model)}
                    disabled={switchingActive}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete this model?"
        footer={
          <div className={shared.footerButtons}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete model'}
            </Button>
          </div>
        }
      >
        <p>
          Delete <strong>{deleteTarget?.displayName}</strong>? You can download it again later
          if you change your mind.
        </p>
      </Modal>
    </div>
  )
}
