import { ThemeProvider } from './theme/ThemeProvider'
import { RouterProvider, useRouter } from './router/RouterContext'
import type { Route } from './router/RouterContext'
import { ToastProvider } from './components/Toast'
import { AdultLayout } from './layouts/AdultLayout'
import { KidLayout } from './layouts/KidLayout'
import {
  SubjectList,
  SubjectDetail,
  AddText,
  GenerationProgress,
  QuizPreviewEdit,
  QuizEdit,
  ModelSetup,
  Settings,
  History
} from './screens/adult'
import { QuizPicker, QuizPlayer, ResultsScreen } from './screens/kid'
import { PrintQuiz } from './print/PrintQuiz'

function AdultScreens({ route }: { route: Extract<Route, { area: 'adult' }> }): React.JSX.Element {
  switch (route.screen) {
    case 'subjects':
      return <SubjectList />
    case 'subject-detail':
      return <SubjectDetail subjectId={route.subjectId} />
    case 'add-text':
      return <AddText subjectId={route.subjectId} />
    case 'generation-progress':
      return (
        <GenerationProgress
          subjectId={route.subjectId}
          textId={route.textId}
          generationId={route.generationId}
        />
      )
    case 'quiz-preview':
      return <QuizPreviewEdit subjectId={route.subjectId} textId={route.textId} />
    case 'quiz-edit':
      return <QuizEdit quizId={route.quizId} />
    case 'model-setup':
      return <ModelSetup />
    case 'settings':
      return <Settings />
    case 'history':
      return <History subjectId={route.subjectId} />
  }
}

function KidScreens({ route }: { route: Extract<Route, { area: 'kid' }> }): React.JSX.Element {
  switch (route.screen) {
    case 'quiz-picker':
      return <QuizPicker />
    case 'player':
      return <QuizPlayer quizId={route.quizId} />
    case 'results':
      return <ResultsScreen quizId={route.quizId} score={route.score} total={route.total} />
  }
}

function Shell(): React.JSX.Element {
  const { route } = useRouter()

  if (route.area === 'kid') {
    return (
      <KidLayout>
        <KidScreens route={route} />
      </KidLayout>
    )
  }

  if (route.area === 'print') {
    return <PrintQuiz quizId={route.quizId} />
  }

  return (
    <AdultLayout>
      <AdultScreens route={route} />
    </AdultLayout>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RouterProvider>
          <Shell />
        </RouterProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
