import { useEffect, useState } from 'react'
import type { PlatformInfo } from '@shared/types'
import { api } from '../../api'
import { Button, Card, GeminiProviderSection, useToast } from '../../components'
import { useTheme } from '../../theme/ThemeProvider'
import { themes } from '../../theme/themes'
import shared from './shared.module.css'
import styles from './Settings.module.css'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function Settings(): React.JSX.Element {
  const { showToast } = useToast()
  const { themeId, setThemeId, assets } = useTheme()
  const { Mascot } = assets

  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)
  const [openingFolder, setOpeningFolder] = useState(false)

  useEffect(() => {
    api.system
      .platformInfo()
      .then(setPlatformInfo)
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenDataFolder = (): void => {
    setOpeningFolder(true)
    api.system
      .openDataFolder()
      .catch((err: unknown) => showToast(errMessage(err), 'error'))
      .finally(() => setOpeningFolder(false))
  }

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
        <GeminiProviderSection />
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
    </div>
  )
}
