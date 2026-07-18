import { useTheme } from '../../theme/ThemeProvider'
import { Button, Card } from '../../components'
import { useRouter } from '../../router/RouterContext'
import type { MascotPose } from '../../theme/themes'
import styles from './ResultsScreen.module.css'

export interface ResultsScreenProps {
  quizId: number
  score: number
  total: number
}

interface CelebrationTier {
  headline: string
  message: string
  pose: MascotPose
  confetti: boolean
}

function tierFor(ratio: number): CelebrationTier {
  if (ratio >= 0.8) {
    return {
      headline: 'Amazing job!',
      message: 'You really know your stuff!',
      pose: 'cheering',
      confetti: true
    }
  }
  if (ratio >= 0.5) {
    return {
      headline: 'Great effort!',
      message: 'You got lots of great answers in there!',
      pose: 'cheering',
      confetti: true
    }
  }
  return {
    headline: 'Nice try!',
    message: 'Practice makes perfect — you’ll get even better!',
    pose: 'happy',
    confetti: false
  }
}

/**
 * Celebration screen shown after the last question. Never shames a low
 * score — every tier ends on a warm, encouraging note. Records nothing
 * (the attempt was already recorded by `QuizPlayer`).
 */
export function ResultsScreen({ quizId, score, total }: ResultsScreenProps): React.JSX.Element {
  const { assets } = useTheme()
  const { Mascot, Celebration } = assets
  const { navigate } = useRouter()

  const ratio = total > 0 ? score / total : 0
  const tier = tierFor(ratio)

  return (
    <div className={styles.wrap}>
      <Celebration active={tier.confetti} />

      <Card padding="lg" className={styles.card}>
        <Mascot pose={tier.pose} size={120} />
        <h1 className={styles.headline}>{tier.headline}</h1>
        <p className={styles.score}>
          {score} out of {total}!
        </p>
        <p className={styles.message}>{tier.message}</p>

        <div className={styles.actions}>
          <Button
            size="kid"
            fullWidth
            onClick={() => navigate({ area: 'kid', screen: 'player', quizId })}
          >
            Play again
          </Button>
          <Button
            size="kid"
            variant="secondary"
            fullWidth
            onClick={() => navigate({ area: 'kid', screen: 'quiz-picker' })}
          >
            All done!
          </Button>
        </div>
      </Card>
    </div>
  )
}
