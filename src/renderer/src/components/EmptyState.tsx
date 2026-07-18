import type { ReactNode } from 'react'
import { useTheme } from '../theme/ThemeProvider'
import type { MascotPose } from '../theme/themes'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  title: string
  message?: string
  /** Which mascot pose to use when no custom `icon` is supplied. */
  pose?: MascotPose
  /** Mascot slot — defaults to the current theme's mascot at `pose`. */
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  message,
  pose = 'thinking',
  icon,
  action
}: EmptyStateProps): React.JSX.Element {
  const { assets } = useTheme()
  const { Mascot } = assets

  return (
    <div className={styles.wrap}>
      {icon ?? <Mascot pose={pose} size={96} />}
      <h3 className={styles.title}>{title}</h3>
      {message && <p className={styles.message}>{message}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
