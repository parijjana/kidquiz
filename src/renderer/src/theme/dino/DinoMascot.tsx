import type { MascotProps } from '../themes'

/**
 * Friendly hand-drawn dino mascot, inline SVG (no binary assets, no
 * external fonts/libraries). Colors come entirely from `var(--kq-*)` so the
 * mascot re-themes automatically if a new theme is ever added.
 *
 * Poses:
 *  - 'happy'    default gentle smile, arms relaxed at sides
 *  - 'thinking' paw on chin, small thought dots (used for empty/loading states)
 *  - 'cheering' arms up, big grin, sparkles (used for correct answers/results)
 */
export function DinoMascot({ pose = 'happy', size = 96, className }: MascotProps): React.JSX.Element {
  const cheering = pose === 'cheering'
  const thinking = pose === 'thinking'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={`Friendly dino mascot, ${pose}`}
    >
      {/* tail */}
      <path d="M18 82 Q4 78 8 64 Q16 70 24 76 Z" fill="var(--kq-primary)" />
      {/* legs */}
      <rect x="38" y="92" width="14" height="16" rx="7" fill="var(--kq-primary)" />
      <rect x="66" y="92" width="14" height="16" rx="7" fill="var(--kq-primary)" />
      {/* body */}
      <ellipse cx="60" cy="72" rx="34" ry="28" fill="var(--kq-primary)" />
      {/* belly */}
      <ellipse cx="60" cy="80" rx="20" ry="14" fill="var(--kq-primary-contrast)" opacity="0.35" />
      {/* back spikes */}
      <path d="M46 46 L52 34 L58 46 Z" fill="var(--kq-accent)" />
      <path d="M58 42 L64 30 L70 42 Z" fill="var(--kq-accent)" />
      <path d="M70 46 L76 36 L80 48 Z" fill="var(--kq-accent)" />

      {/* arms */}
      {cheering ? (
        <>
          <path
            d="M32 66 Q18 50 24 36"
            stroke="var(--kq-primary)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M88 66 Q102 50 96 36"
            stroke="var(--kq-primary)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : thinking ? (
        <path
          d="M84 70 Q97 63 92 50"
          stroke="var(--kq-primary)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <>
          <path
            d="M30 70 Q22 76 26 84"
            stroke="var(--kq-primary)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M90 70 Q98 76 94 84"
            stroke="var(--kq-primary)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      {/* head */}
      <circle cx="60" cy="40" r="26" fill="var(--kq-primary)" />
      {/* snout */}
      <ellipse cx="60" cy="48" rx="14" ry="10" fill="var(--kq-primary-contrast)" opacity="0.35" />
      {/* eyes */}
      <circle cx="50" cy="34" r="6" fill="var(--kq-primary-contrast)" />
      <circle cx="70" cy="34" r="6" fill="var(--kq-primary-contrast)" />
      <circle cx={thinking ? 52 : 51} cy={thinking ? 32 : 34} r="3" fill="var(--kq-text)" />
      <circle cx={thinking ? 72 : 69} cy={thinking ? 32 : 34} r="3" fill="var(--kq-text)" />
      {/* nostrils */}
      <circle cx="55" cy="46" r="1.4" fill="var(--kq-text)" opacity="0.5" />
      <circle cx="65" cy="46" r="1.4" fill="var(--kq-text)" opacity="0.5" />

      {/* mouth */}
      {cheering ? (
        <path d="M50 48 Q60 58 70 48" stroke="var(--kq-text)" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M52 48 Q60 53 68 48" stroke="var(--kq-text)" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}

      {thinking && (
        <g opacity="0.7">
          <circle cx="94" cy="26" r="2.5" fill="var(--kq-text-muted)" />
          <circle cx="100" cy="18" r="3.5" fill="var(--kq-text-muted)" />
          <circle cx="108" cy="8" r="5" fill="var(--kq-text-muted)" />
        </g>
      )}

      {cheering && (
        <g fill="var(--kq-accent)">
          <path d="M18 20 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1 z" />
          <path d="M100 60 l2.4 5.6 5.6 0.8 -4 4 0.8 5.6 -4.8 -3.2 -4.8 3.2 0.8 -5.6 -4 -4 5.6 -0.8 z" />
        </g>
      )}
    </svg>
  )
}
