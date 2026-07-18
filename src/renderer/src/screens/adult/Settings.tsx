import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { GeminiStatus, PlatformInfo } from '@shared/types'
import { api } from '../../api'
import { Button, Card, Modal, useToast } from '../../components'
import { useTheme } from '../../theme/ThemeProvider'
import { themes } from '../../theme/themes'
import shared from './shared.module.css'
import styles from './Settings.module.css'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** True when the rejection is Electron's "no handler for this channel" — the
 * expected shape of failure while the Gemini main-process handlers don't
 * exist yet. That case must render as "not available", never as a toast. */
function isHandlerMissing(err: unknown): boolean {
  return /no handler registered/i.test(errMessage(err))
}

const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey'

export function Settings(): React.JSX.Element {
  const { showToast } = useToast()
  const { themeId, setThemeId, assets } = useTheme()
  const { Mascot } = assets

  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)
  const [openingFolder, setOpeningFolder] = useState(false)

  const [geminiAvailable, setGeminiAvailable] = useState(true)
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [openingKeyPage, setOpeningKeyPage] = useState(false)
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false)
  const [deletingKey, setDeletingKey] = useState(false)

  useEffect(() => {
    api.system
      .platformInfo()
      .then(setPlatformInfo)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadGeminiStatus = (): void => {
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
  }

  useEffect(loadGeminiStatus, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenDataFolder = (): void => {
    setOpeningFolder(true)
    api.system
      .openDataFolder()
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setOpeningFolder(false))
  }

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
    if (!geminiAvailable || !geminiStatus) return shared.badgeNeutral
    if (!geminiStatus.encryptionAvailable) return shared.badgeWarn
    return geminiStatus.keyPresent ? shared.badgeSuccess : shared.badgeNeutral
  }

  const keySetupDisabled =
    !geminiAvailable || geminiStatus === null || geminiStatus.encryptionAvailable === false

  return (
    <div className={shared.page}>
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.title}>Settings</h1>
          <p className={shared.subtitle}>Theme, your data folder, and app info.</p>
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Look and feel</h2>
        <div className={shared.choiceGrid}>
          {Object.values(themes).map((theme) => (
            <label
              key={theme.id}
              className={`${shared.choiceCard} ${themeId === theme.id ? shared.choiceCardSelected : ''}`}
            >
              <input
                type="radio"
                name="theme"
                className={shared.srOnly}
                checked={themeId === theme.id}
                onChange={() => setThemeId(theme.id)}
              />
              <span className={shared.choiceCardBody}>
                <theme.assets.Mascot pose="happy" size={48} />
                <span className={shared.choiceCardTitle}>{theme.label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Gemini (optional)</h2>
        <p className={shared.muted}>
          KidQuiz itself sends nothing over the internet, and works fully offline without
          Gemini. Turning Gemini on is optional and can make writing questions much faster: when
          it&rsquo;s enabled, the text you paste is sent to Google&rsquo;s Gemini service — which
          is separate from KidQuiz and has its own terms and privacy policy — to write the
          questions.
        </p>

        <span className={`${shared.badge} ${geminiStatusBadgeClass()}`}>{geminiStatusLine()}</span>

        <Card padding="lg" className={styles.geminiCard}>
          <h3 className={styles.geminiCardTitle}>Set up a free Gemini key</h3>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={shared.muted}>Open the key page and sign in with a free Google account.</span>
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
              <span className={shared.muted}>Create a free API key and copy it.</span>
            </li>
            <li className={styles.step}>
              <form onSubmit={handleSaveKey} className={styles.keyForm}>
                <div className={`${shared.formGroup} ${styles.keyField}`}>
                  <label className={shared.label} htmlFor="gemini-key">
                    Paste your key here
                  </label>
                  <input
                    id="gemini-key"
                    type="password"
                    autoComplete="off"
                    className={shared.input}
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
            <p className={shared.hint}>
              Gemini setup isn&rsquo;t available yet in this version — check back after an
              update.
            </p>
          )}
          {geminiAvailable && geminiStatus && !geminiStatus.encryptionAvailable && (
            <p className={shared.hint}>
              This computer doesn&rsquo;t support the secure storage KidQuiz needs to save a
              Gemini key, so this feature can&rsquo;t be turned on here.
            </p>
          )}
        </Card>

        {geminiAvailable && geminiStatus?.keyPresent && (
          <Card padding="lg" className={styles.geminiCard}>
            <p className={shared.muted}>
              Your key is stored, encrypted, in this file:
            </p>
            <p className={styles.keyPath}>{geminiStatus.keyFilePath}</p>
            <p className={shared.muted}>
              Deleting that file removes the key — or use the button below.
            </p>
            <Button variant="ghost" onClick={() => setDeleteKeyOpen(true)}>
              Remove key
            </Button>
          </Card>
        )}
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>Your data</h2>
        <Card padding="lg" className={styles.dataCard}>
          <p className={shared.muted}>
            Your subjects, texts, questions, quizzes, and downloaded AI models are all stored in
            one folder on this computer — nothing leaves your device.
          </p>
          <Button variant="secondary" onClick={handleOpenDataFolder} disabled={openingFolder}>
            {openingFolder ? 'Opening…' : 'Open data folder'}
          </Button>
        </Card>
      </div>

      <div className={shared.section}>
        <h2 className={shared.sectionTitle}>About</h2>
        <Card padding="lg" className={styles.aboutCard}>
          <Mascot pose="happy" size={48} />
          <div>
            <p className={styles.aboutTitle}>KidQuiz</p>
            <p className={shared.muted}>
              An offline quiz maker for kids. Everything runs on this computer — no cloud, no
              accounts.
            </p>
            {platformInfo && (
              <p className={styles.systemInfo}>
                Running on {platformInfo.platform} · {platformInfo.totalRamGB.toFixed(1)} GB RAM
                detected
              </p>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={deleteKeyOpen}
        onClose={() => {
          if (!deletingKey) setDeleteKeyOpen(false)
        }}
        title="Remove Gemini key?"
        footer={
          <div className={shared.footerButtons}>
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
