import { useMemo } from 'react'
import type { CelebrationProps } from '../themes'
import styles from './Confetti.module.css'

const COLORS = ['var(--kq-primary)', 'var(--kq-accent)', 'var(--kq-secondary)', 'var(--kq-success)']
const PIECE_COUNT = 24

interface ConfettiPiece {
  id: number
  left: number
  rotate: number
  delay: number
  duration: number
  color: string
}

/**
 * Lightweight CSS-only confetti burst (no animation library). Renders
 * `PIECE_COUNT` small rectangles that fall + fade via a CSS keyframe
 * animation; per-piece randomness (position/rotation/timing/color) is
 * generated once per activation.
 */
export function Confetti({ active, className }: CelebrationProps): React.JSX.Element | null {
  const pieces = useMemo<ConfettiPiece[]>(() => {
    if (!active) return []
    return Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      left: Math.round(Math.random() * 100),
      rotate: Math.round(Math.random() * 360),
      delay: Math.round(Math.random() * 200),
      duration: 900 + Math.round(Math.random() * 700),
      color: COLORS[i % COLORS.length]
    }))
    // Re-roll pieces every time `active` flips true (a fresh celebration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!active || pieces.length === 0) return null

  return (
    <div className={`${styles.field} ${className ?? ''}`} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={styles.pieceWrap}
          style={{ left: `${p.left}%`, transform: `rotate(${p.rotate}deg)` }}
        >
          <span
            className={styles.piece}
            style={{
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`
            }}
          />
        </span>
      ))}
    </div>
  )
}
