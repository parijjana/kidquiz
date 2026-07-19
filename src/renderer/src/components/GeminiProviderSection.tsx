import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { GeminiStatus } from '@shared/types'
import { api } from '../api'
import { Button } from './Button'
import { Card } from './Card'
import { Modal } from './Modal'
import { useToast } from './Toast'
import styles from './GeminiProviderSection.module.css'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** True when the rejection is Electron's "no handler for this channel" —
 * the expected shape of failure if the Gemini main-process handlers are
 * ever unavailable. That case must render as "not available", never crash
 * or show a raw technical error. */
function isHandlerMissing(err: unknown): boolean {
  return /no handler registered/i.test(errMessage(err))
}

const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey'

export interface GeminiProviderSectionProps {
  /** Heading shown above the section. Pass `null` when the caller supplies its own heading. */
  heading?: string | null
  /** Intro/privacy copy shown under the heading. Pass `null` to omit (caller supplies its own). */
  showIntro?: boolean
}

/**
 * Gemini key management — status, step-by-step guide, save/remove key,
 * encrypted-file path, and the required privacy copy (ARCHITECTURE.md §13,
 * §16). Shared between Settings (full "Gemini (optional)" section) and
 * ModelSetup (presented as a provider card alongside the local catalog).
 */
export function GeminiProviderSection({
  heading = 'Gemini (optional)',
  showIntro = true
}: GeminiProviderSectionProps): React.JSX.Element {
  const { showToast } = useToast()

  const [geminiAvailable, setGeminiAvailable] = useState(true)
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [openingKeyPage, setOpeningKeyPage] = useState(false)
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false)
  const [deletingKey, setDeletingKey] = useState(false)

  useEffect(() => {
    api.gemini
      .status()
      .then((s) => {
        setGeminiAvailable(true)
        setGeminiStatus(s)
      })
      .catch((err: unknown) => {
        setGeminiStatus(null)
        if (!isHandlerMissing(err)) showToast(errMessage(err), 'error')
        setGeminiAvailable(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenKeyPage = (): void => {
    setOpeningKeyPage(true)
    api.system
      .openExternal(GEMINI_KEY_URL)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setOpeningKeyPage(false))
  }

  const handleSaveKey = (event: FormEvent): void => {
    event.preventDefault()
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    setSavingKey(true)
    api.gemini
      .setKey(trimmed)
      .then((s) => {
        setGeminiAvailable(true)
        setGeminiStatus(s)
        setApiKeyInput('')
        showToast('Gemini key saved.', 'success')
      })
      .catch((err: unknown) => {
        if (isHandlerMissing(err)) {
          setGeminiAvailable(false)
        } else {
          showToast(errMessage(err), 'error')
        }
      })
      .finally(() => setSavingKey(false))
  }

  const handleDeleteKey = (): void => {
    setDeletingKey(true)
    api.gemini
      .deleteKey()
      .then((s) => {
        setGeminiAvailable(true)
        setGeminiStatus(s)
        setDeleteKeyOpen(false)
        showToast('Gemini key removed.', 'success')
      })
      .catch((err: unknown) => {
        if (isHandlerMissing(err)) {
          setGeminiAvailable(false)
          setDeleteKeyOpen(false)
        } else {
          showToast(errMessage(err), 'error')
        }
      })
      .finally(() => setDeletingKey(false))
  }

  const geminiStatusLine = (): string => {
    if (!geminiAvailable) return "Gemini setup isn't available yet in this version of the app."
    if (!geminiStatus) return 'Checking Gemini status…'
    if (!geminiStatus.encryptionAvailable) {
      return "This computer can't securely store a key, so Gemini can't be turned on here."
    }
    return geminiStatus.keyPresent
      ? 'Configured — Gemini will help write questions faster.'
      : 'Not configured yet — add a free key below to turn it on.'
  }

  const geminiStatusBadgeClass = (): string => {
    if (!geminiAvailable || !geminiStatus) return styles.badgeNeutral
    if (!geminiStatus.encryptionAvailable) return styles.badgeWarn
    return geminiStatus.keyPresent ? styles.badgeSuccess : styles.badgeNeutral
  }

  const keySetupDisabled =
    !geminiAvailable || geminiStatus === null || geminiStatus.encryptionAvailable === false

  return (
    <div className={styles.wrap}>
      {heading !== null && <h2 className={styles.heading}>{heading}</h2>}
      {showIntro && (
        <p className={styles.intro}>
          KidQuiz itself sends nothing over the internet, and works fully offline without
          Gemini. Turning Gemini on is optional and can make writing questions much faster: when
          it&rsquo;s enabled, the text you paste is sent to Google&rsquo;s Gemini service — which
          is separate from KidQuiz and has its own terms and privacy policy — to write the
          questions.
        </p>
      )}

      <span className={`${styles.badge} ${geminiStatusBadgeClass()}`}>{geminiStatusLine()}</span>

      <Card padding="lg" className={styles.card}>
        <h3 className={styles.cardTitle}>Set up a free Gemini key</h3>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <p className={styles.stepText}>
              Open the key page and sign in with a free Google account.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenKeyPage}
              disabled={openingKeyPage}
            >
              {openingKeyPage ? 'Opening…' : 'Open the Google AI Studio key page'}
            </Button>
          </li>
          <li className={styles.step}>
            <p className={styles.stepText}>Create a free API key and copy it.</p>
          </li>
          <li className={styles.step}>
            <form onSubmit={handleSaveKey} className={styles.keyForm}>
              <div className={styles.keyField}>
                <label className={styles.label} htmlFor="gemini-key">
                  Paste your key here
                </label>
                <input
                  id="gemini-key"
                  type="password"
                  autoComplete="off"
                  className={styles.input}
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder="Paste your Gemini API key"
                  disabled={keySetupDisabled}
                />
              </div>
              <Button type="submit" disabled={!apiKeyInput.trim() || savingKey || keySetupDisabled}>
                {savingKey ? 'Saving…' : 'Save key'}
              </Button>
            </form>
          </li>
        </ol>
        {!geminiAvailable && (
          <p className={styles.hint}>
            Gemini setup isn&rsquo;t available yet in this version — check back after an update.
          </p>
        )}
        {geminiAvailable && geminiStatus && !geminiStatus.encryptionAvailable && (
          <p className={styles.hint}>
            This computer doesn&rsquo;t support the secure storage KidQuiz needs to save a
            Gemini key, so this feature can&rsquo;t be turned on here.
          </p>
        )}
      </Card>

      {geminiAvailable && geminiStatus?.keyPresent && (
        <Card padding="lg" className={styles.card}>
          <p className={styles.stepText}>Your key is stored, encrypted, in this file:</p>
          <p className={styles.keyPath}>{geminiStatus.keyFilePath}</p>
          <p className={styles.stepText}>
            Deleting that file removes the key — or use the button below.
          </p>
          <Button variant="ghost" onClick={() => setDeleteKeyOpen(true)}>
            Remove key
          </Button>
        </Card>
      )}

      <Modal
        open={deleteKeyOpen}
        onClose={() => {
          if (!deletingKey) setDeleteKeyOpen(false)
        }}
        title="Remove Gemini key?"
        footer={
          <div className={styles.footerButtons}>
            <Button variant="ghost" onClick={() => setDeleteKeyOpen(false)} disabled={deletingKey}>
              Cancel
            </Button>
            <Button onClick={handleDeleteKey} disabled={deletingKey}>
              {deletingKey ? 'Removing…' : 'Remove key'}
            </Button>
          </div>
        }
      >
        <p>
          This deletes the saved key file. KidQuiz will go back to using only the on-device
          helper until you add a new key.
        </p>
      </Modal>
    </div>
  )
}
