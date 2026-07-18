import type { HTMLAttributes } from 'react'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
  /** Adds hover/focus affordances for cards that act as buttons/links. */
  interactive?: boolean
}

export function Card({
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const classes = [
    styles.card,
    styles[`padding-${padding}`],
    interactive ? styles.interactive : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} tabIndex={interactive ? 0 : undefined} {...rest}>
      {children}
    </div>
  )
}
