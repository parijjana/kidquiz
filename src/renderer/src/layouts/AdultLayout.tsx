import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { Button } from '../components'
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
        r.screen === 'quiz-preview' ||
        r.screen === 'quiz-edit')
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
/**
 * True once we know for certain neither provider is set up: no local model
 * installed AND no Gemini key saved. Errors from either check (e.g. the
 * Gemini handlers being unavailable) are treated as "absent", never thrown.
 */
function useNeedsProviderBanner(route: Route): boolean {
  const [needsProvider, setNeedsProvider] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.models.installed().catch(() => []),
      api.gemini.status().catch(() => ({ keyPresent: false }))
    ]).then(([installed, gemini]) => {
      if (cancelled) return
      setNeedsProvider(installed.length === 0 && !gemini.keyPresent)
    })
    return () => {
      cancelled = true
    }
    // Re-check on every route change (cheap calls) so the banner disappears
    // as soon as a provider becomes available — ARCHITECTURE.md §16.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  return needsProvider
}

/**
 * Adult-area chrome: a sidebar (branding, main nav, "Kid mode" switch) plus
 * a scrollable content pane. See ARCHITECTURE.md §3.
 */
export function AdultLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const { route, navigate } = useRouter()
  const { assets } = useTheme()
  const { Mascot } = assets
  const needsProvider = useNeedsProviderBanner(route)

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

      <main className={styles.content}>
        {needsProvider && (
          <div className={styles.banner}>
            <p className={styles.bannerText}>
              KidQuiz needs a quiz helper — add one to get started.
            </p>
            <Button size="sm" onClick={() => navigate({ area: 'adult', screen: 'model-setup' })}>
              Set up a quiz helper
            </Button>
          </div>
        )}
        <div className={styles.contentBody}>{children}</div>
      </main>
    </div>
  )
}
