import type { ReactNode } from 'react'
import { useRouter } from '../router/RouterContext'
import { useTheme } from '../theme/ThemeProvider'
import styles from './KidLayout.module.css'

/**
 * Kid-area chrome: fullscreen, no adult nav/chrome, just a big "Exit"
 * button in the top-right corner that returns to the adult subjects
 * screen. See ARCHITECTURE.md §3.
 */
export function KidLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { navigate } = useRouter()
  const { assets } = useTheme()
  const { Background } = assets

  return (
    <div className={styles.shell}>
      <Background className={styles.backdrop} />

      <button
        className={styles.exitButton}
        onClick={() => navigate({ area: 'adult', screen: 'subjects' })}
        aria-label="Exit kid mode"
      >
        Exit
      </button>

      <div className={styles.content}>{children}</div>
    </div>
  )
}
