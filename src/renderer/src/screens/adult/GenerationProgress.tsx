import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenerationProvider } from '@shared/types'
import { api, useKidquizEvent } from '../../api'
import { Button, Card, ProgressBar, Spinner, useToast } from '../../components'
import { useTheme } from '../../theme/ThemeProvider'
import { useRouter } from '../../router/RouterContext'
import shared from './shared.module.css'
import styles from './GenerationProgress.module.css'

export interface GenerationProgressProps {
  subjectId: number
  textId: number
  generationId: string
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function GenerationProgress({
  subjectId,
  textId,
  generationId
}: GenerationProgressProps): React.JSX.Element {
  const { navigate } = useRouter()
  const { showToast } = useToast()
  const { assets } = useTheme()
  const { Mascot } = assets

  const [phase, setPhase] = useState<
    'loading_model' | 'generating' | 'done' | 'error' | 'all_duplicates'
  >('loading_model')
  const [chunkIndex, setChunkIndex] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const [questionsSoFar, setQuestionsSoFar] = useState(0)
  const [provider, setProvider] = useState<GenerationProvider | undefined>(undefined)
  const [tokensSoFar, setTokensSoFar] = useState<number | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Elapsed-time counter (§14) — ticks every second from mount so the screen
  // never looks dead during a long local generation run.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    const start = Date.now()
    const interval = window.setInterval(() => {
      if (
        phaseRef.current === 'done' ||
        phaseRef.current === 'error' ||
        phaseRef.current === 'all_duplicates'
      ) {
        return
      }
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [])

  useKidquizEvent(
    'generation:progress',
    useCallback(
      (payload) => {
        if (payload.generationId !== generationId) return
        setPhase(payload.phase)
        setChunkIndex(payload.chunkIndex)
        setChunkCount(payload.chunkCount)
        setQuestionsSoFar(payload.questionsSoFar)
        setProvider(payload.provider)
        setTokensSoFar(payload.tokensSoFar)
      },
      [generationId]
    )
  )

  useKidquizEvent(
    'generation:done',
    useCallback(
      (payload) => {
        if (payload.generationId !== generationId) return

        const dropped = payload.droppedDuplicates ?? 0
        if (dropped > 0) {
          showToast(
            `Skipped ${dropped} ${dropped === 1 ? 'question' : 'questions'} that repeated ones you already have.`,
            'info'
          )
        }

        // Every candidate this run turned out to be a near-duplicate of an
        // existing question — nothing new to review, so don't navigate away;
        // explain what happened and offer a way forward instead.
        if (dropped > 0 && payload.questionIds.length === 0) {
          setPhase('all_duplicates')
          return
        }

        setPhase('done')
        navigate({ area: 'adult', screen: 'quiz-preview', subjectId, textId })
      },
      [generationId, navigate, showToast, subjectId, textId]
    )
  )

  useKidquizEvent(
    'generation:error',
    useCallback(
      (payload) => {
        if (payload.generationId !== generationId) return
        setPhase('error')
        setErrorMessage(payload.message)
      },
      [generationId]
    )
  )

  const handleCancel = (): void => {
    setCancelling(true)
    api.generation
      .cancel(generationId)
      .then(() => showToast('Stopping soon — questions made so far will be kept.', 'info'))
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
  }

  const modelIssue = errorMessage !== null && errorMessage.toLowerCase().includes('model')

  // §16: never guess a provider before an event actually names one — show
  // neutral copy until then, then switch to the Gemini / on-device wording.
  const providerLabel =
    provider === undefined
      ? 'Getting the quiz maker ready…'
      : provider === 'gemini'
        ? 'Using Gemini (fast)'
        : 'Using the on-device helper — this can take a few minutes on this computer'
  const providerBadgeClass =
    provider === undefined
      ? shared.badgeNeutral
      : provider === 'gemini'
        ? shared.badgeSuccess
        : shared.badgeNeutral

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Making your questions</h1>
          <p className={shared.subtitle}>This can take a few minutes the first time.</p>
        </div>
      </div>

      <Card padding="lg" className={styles.card}>
        <Mascot pose="thinking" size={96} />

        {(phase === 'loading_model' || phase === 'generating') && (
          <div className={styles.metaRow}>
            <span className={`${shared.badge} ${providerBadgeClass}`}>{providerLabel}</span>
            <span className={shared.rowMeta}>Elapsed: {formatElapsed(elapsedSeconds)}</span>
          </div>
        )}

        {phase === 'loading_model' && (
          <>
            <Spinner label="Getting the quiz maker ready…" />
            <p className={shared.muted}>Getting the quiz maker ready…</p>
          </>
        )}

        {phase === 'generating' && (
          <div className={styles.progressBlock}>
            <ProgressBar
              value={chunkIndex}
              max={Math.max(chunkCount, 1)}
              label={`Reading part ${chunkIndex} of ${Math.max(chunkCount, 1)}`}
              size="lg"
            />
            <p className={shared.muted}>
              {questionsSoFar} {questionsSoFar === 1 ? 'question' : 'questions'} made so far
            </p>
            {tokensSoFar !== undefined && tokensSoFar > 0 && (
              <p className={styles.pulse}>The helper is writing… {tokensSoFar} words so far</p>
            )}
          </div>
        )}

        {phase === 'done' && <p className={shared.muted}>All done! Taking you to review…</p>}

        {phase === 'all_duplicates' && (
          <div className={styles.progressBlock}>
            <p className={shared.muted}>
              Every question this made repeated ones you already have for this text. Have a
              look at the existing questions, or try the Gemini helper for fresh angles.
            </p>
            <div className={shared.footerButtons}>
              <Button
                variant="secondary"
                onClick={() => navigate({ area: 'adult', screen: 'quiz-preview', subjectId, textId })}
              >
                Review existing questions
              </Button>
              <Button
                onClick={() => navigate({ area: 'adult', screen: 'subject-detail', subjectId })}
              >
                Back to subject
              </Button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className={styles.progressBlock}>
            <p className={shared.errorText}>
              Something went wrong while making questions: {errorMessage}
            </p>
            {!modelIssue && (
              <p className={shared.muted}>
                You can go back and try adding the text again — nothing was lost.
              </p>
            )}
            <div className={shared.footerButtons}>
              {modelIssue && (
                <Button
                  variant="secondary"
                  onClick={() => navigate({ area: 'adult', screen: 'model-setup' })}
                >
                  Set up a model
                </Button>
              )}
              <Button
                onClick={() => navigate({ area: 'adult', screen: 'add-text', subjectId })}
              >
                Back to add text
              </Button>
            </div>
          </div>
        )}

        {(phase === 'loading_model' || phase === 'generating') && (
          <Button variant="ghost" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Stopping…' : 'Stop and keep what we have'}
          </Button>
        )}
      </Card>
    </div>
  )
}
