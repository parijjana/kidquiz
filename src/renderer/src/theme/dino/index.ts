import type { Theme } from '../themes'
import { DinoMascot } from './DinoMascot'
import { Confetti } from './Confetti'
import { DinoBackground } from './DinoBackground'

/**
 * "Dino Pals" — the v1 built-in theme. Friendly greens with a warm orange
 * accent, cream background, large rounded corners, large kid-friendly type.
 *
 * This is the ONLY place dino-specific color/shape/type VALUES are defined;
 * everything else in the app reads them back out through `var(--kq-*)`.
 */
export const dinoTheme: Theme = {
  id: 'dino',
  label: 'Dino Pals',
  cssVars: {
    // --- Surfaces -----------------------------------------------------------
    '--kq-bg': '#FBF3E3', // page background — warm cream
    '--kq-surface': '#FFFFFF', // cards/panels/sidebars sitting on top of --kq-bg

    // --- Text -----------------------------------------------------------------
    '--kq-text': '#2E2A22', // primary reading text — warm near-black, softer than pure black
    '--kq-text-muted': '#8A8072', // secondary text, captions, help copy

    // --- Brand / action colors ------------------------------------------------
    '--kq-primary': '#3FA34D', // main CTA color, dino green
    '--kq-primary-contrast': '#FFFFFF', // text/icons placed on top of --kq-primary
    '--kq-secondary': '#2F8F86', // secondary actions & nav accents — teal-green
    '--kq-accent': '#F2994A', // warm orange — spikes, badges, "Kid mode" button, energy

    // --- Feedback ---------------------------------------------------------
    '--kq-success': '#3FA34D', // correct-answer / success state
    '--kq-danger-soft': '#F4A38A', // "try again" state — warm coral, deliberately NOT alarm-red

    // --- Shape ------------------------------------------------------------------
    '--kq-radius-sm': '8px', // small controls: chips, inputs, badges
    '--kq-radius-md': '16px', // buttons, list rows, nav items
    '--kq-radius-lg': '28px', // cards, modals — big friendly rounding

    // --- Type -------------------------------------------------------------------
    '--kq-font-display':
      "'Segoe UI Rounded', ui-rounded, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif", // headings, buttons, kid-mode UI
    '--kq-font-body': "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif", // body copy, forms, lists

    // --- Elevation --------------------------------------------------------------
    '--kq-shadow': '0 6px 18px rgba(46, 42, 34, 0.14)', // card/modal/button elevation

    // --- Spacing scale (4px base) -------------------------------------------
    '--kq-space-1': '4px',
    '--kq-space-2': '8px',
    '--kq-space-3': '12px',
    '--kq-space-4': '16px',
    '--kq-space-5': '24px',
    '--kq-space-6': '32px',

    // --- Font sizes ---------------------------------------------------------
    '--kq-fs-sm': '14px', // captions, helper/meta text
    '--kq-fs-md': '17px', // body text, form fields
    '--kq-fs-lg': '22px', // section headings, emphasized copy
    '--kq-fs-xl': '30px', // screen titles
    '--kq-fs-hero': '44px' // kid-mode celebratory text, big score numbers
  },
  assets: {
    Mascot: DinoMascot,
    Celebration: Confetti,
    Background: DinoBackground
  }
}
