import { useId } from 'react'
import type { BackgroundProps } from '../themes'
import styles from './DinoBackground.module.css'

/**
 * Subtle full-bleed leaf + footprint pattern, tiled via an SVG `<pattern>`.
 * Purely decorative (`aria-hidden`) — meant to sit behind content at low
 * opacity, e.g. as a KidLayout backdrop.
 */
export function DinoBackground({ className }: BackgroundProps): React.JSX.Element {
  const patternId = useId()

  return (
    <svg
      className={`${styles.background} ${className ?? ''}`}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={patternId} width="120" height="120" patternUnits="userSpaceOnUse">
          {/* leaf */}
          <path d="M20 30 Q30 10 45 20 Q35 35 20 30 Z" fill="var(--kq-primary)" opacity="0.5" />
          <path d="M28 24 Q32 22 38 22" stroke="var(--kq-primary)" strokeWidth="1" opacity="0.6" fill="none" />
          {/* footprint pair */}
          <ellipse cx="85" cy="68" rx="7" ry="10" fill="var(--kq-secondary)" opacity="0.4" />
          <ellipse cx="98" cy="84" rx="7" ry="10" fill="var(--kq-secondary)" opacity="0.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
