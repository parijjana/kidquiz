import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  /** Current progress amount, in the same units as `max`. */
  value: number
  /** Defaults to 100 (i.e. `value` is treated as a percentage). */
  max?: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export function ProgressBar({ value, max = 100, label, size = 'md' }: ProgressBarProps): React.JSX.Element {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0

  return (
    <div className={styles.wrap}>
      {label && <div className={styles.label}>{label}</div>}
      <div
        className={`${styles.track} ${styles[`size-${size}`]}`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
