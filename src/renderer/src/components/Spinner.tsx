import styles from './Spinner.module.css'

export interface SpinnerProps {
  /** Diameter in px. */
  size?: number
  label?: string
}

export function Spinner({ size = 32, label = 'Loading…' }: SpinnerProps): React.JSX.Element {
  return (
    <span className={styles.wrap} role="status">
      <span className={styles.spinner} style={{ width: size, height: size }} />
      <span className={styles.srOnly}>{label}</span>
    </span>
  )
}
