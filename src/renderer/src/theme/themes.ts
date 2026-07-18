/**
 * Theme registry (ARCHITECTURE.md §9).
 *
 * A theme is a bag of CSS custom property VALUES plus a matching set of
 * illustration/animation components. Components and screens must consume
 * ONLY `var(--kq-*)` for color/radius/font/spacing — never a hardcoded
 * value — so that a whole new theme can be added later purely by adding a
 * new entry here, with zero changes to component code.
 */
import type { ComponentType } from 'react'
import { dinoTheme } from './dino'

/** Poses every theme's mascot component must support. */
export type MascotPose = 'happy' | 'thinking' | 'cheering'

export interface MascotProps {
  pose?: MascotPose
  /** Square size, px number or any valid CSS size string. */
  size?: number | string
  className?: string
}

export interface CelebrationProps {
  /** When true, plays (or re-plays) the celebration burst. */
  active: boolean
  className?: string
}

export interface BackgroundProps {
  className?: string
}

/** Theme-provided illustrations/animations, swapped as a unit per theme. */
export interface ThemeAssets {
  /** Cute character used across empty states, results, nav branding, etc. */
  Mascot: ComponentType<MascotProps>
  /** Celebration effect (e.g. confetti) for correct answers / quiz results. */
  Celebration: ComponentType<CelebrationProps>
  /** Subtle full-bleed decorative background pattern. */
  Background: ComponentType<BackgroundProps>
}

export interface Theme {
  id: string
  /** Human-readable name shown in a future theme picker. */
  label: string
  /** CSS custom property values, set on `document.documentElement`. */
  cssVars: Record<string, string>
  assets: ThemeAssets
}

export const themes: Record<string, Theme> = {
  dino: dinoTheme
}

export const DEFAULT_THEME_ID = 'dino'

export type ThemeId = keyof typeof themes
