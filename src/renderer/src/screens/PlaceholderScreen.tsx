import type { ReactNode } from 'react'
import { Card } from '../components/Card'
import { useTheme } from '../theme/ThemeProvider'
import type { MascotPose } from '../theme/themes'
import styles from './PlaceholderScreen.module.css'

export interface PlaceholderScreenProps {
  title: string
  subtitle?: string
  pose?: MascotPose
  children?: ReactNode
}

/**
 * Sanctioned minimal placeholder used by every screen route until a later
 * agent replaces its internals (ARCHITECTURE.md §12 handoff). Renders the
 * screen name in a themed Card with the mascot, per the orchestrator's
 * instructions — real screen content is explicitly out of scope here.
 */
export function PlaceholderScreen({
  title,
  subtitle,
  pose = 'happy',
  children
}: PlaceholderScreenProps): React.JSX.Element {
  const { assets } = useTheme()
  const { Mascot } = assets

  return (
    <div className={styles.wrap}>
      <Card padding="lg" className={styles.card}>
        <Mascot pose={pose} size={96} />
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </Card>
    </div>
  )
}
