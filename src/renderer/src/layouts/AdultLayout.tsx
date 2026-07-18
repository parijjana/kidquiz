import type { ReactNode } from 'react'
import { useRouter } from '../router/RouterContext'
import type { Route } from '../router/RouterContext'
import { useTheme } from '../theme/ThemeProvider'
import styles from './AdultLayout.module.css'

interface NavItem {
  label: string
  target: Route
  isActive: (route: Route) => boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Subjects',
    target: { area: 'adult', screen: 'subjects' },
    isActive: (r) =>
      r.area === 'adult' &&
      (r.screen === 'subjects' ||
        r.screen === 'subject-detail' ||
        r.screen === 'add-text' ||
        r.screen === 'generation-progress' ||
        r.screen === 'quiz-preview')
  },
  {
    label: 'Quizzes',
    target: { area: 'adult', screen: 'history' },
    isActive: (r) => r.area === 'adult' && r.screen === 'history'
  },
  {
    label: 'Model',
    target: { area: 'adult', screen: 'model-setup' },
    isActive: (r) => r.area === 'adult' && r.screen === 'model-setup'
  },
  {
    label: 'Settings',
    target: { area: 'adult', screen: 'settings' },
    isActive: (r) => r.area === 'adult' && r.screen === 'settings'
  }
]

/**
 * Adult-area chrome: a sidebar (branding, main nav, "Kid mode" switch) plus
 * a scrollable content pane. See ARCHITECTURE.md §3.
 */
export function AdultLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { route, navigate } = useRouter()
  const { assets } = useTheme()
  const { Mascot } = assets

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <button
          className={styles.brand}
          onClick={() => navigate({ area: 'adult', screen: 'subjects' })}
          aria-label="KidQuiz home"
        >
          <Mascot pose="happy" size={36} />
          <span>KidQuiz</span>
        </button>

        <nav className={styles.nav} aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              className={`${styles.navItem} ${item.isActive(route) ? styles.navItemActive : ''}`}
              onClick={() => navigate(item.target)}
              aria-current={item.isActive(route) ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className={styles.kidModeButton}
          onClick={() => navigate({ area: 'kid', screen: 'quiz-picker' })}
        >
          <Mascot pose="cheering" size={28} />
          Kid mode
        </button>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  )
}
