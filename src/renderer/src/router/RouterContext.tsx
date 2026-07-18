import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Hand-rolled router (no routing library — ARCHITECTURE.md §3/§12). `Route`
 * is a discriminated union covering every screen named in the spec:
 *  - adult: subjects list/detail, add-text, generation-progress,
 *    quiz-preview, model-setup, settings, history
 *  - kid: quiz-picker, player, results
 *  - print: quiz
 */
export type Route =
  | { area: 'adult'; screen: 'subjects' }
  | { area: 'adult'; screen: 'subject-detail'; subjectId: number }
  | { area: 'adult'; screen: 'add-text'; subjectId: number }
  | {
      area: 'adult'
      screen: 'generation-progress'
      subjectId: number
      textId: number
      generationId: string
    }
  | { area: 'adult'; screen: 'quiz-preview'; subjectId: number; textId: number }
  | { area: 'adult'; screen: 'model-setup' }
  | { area: 'adult'; screen: 'settings' }
  | { area: 'adult'; screen: 'history'; subjectId?: number }
  | { area: 'kid'; screen: 'quiz-picker' }
  | { area: 'kid'; screen: 'player'; quizId: number }
  | { area: 'kid'; screen: 'results'; quizId: number; score: number; total: number }
  | { area: 'print'; screen: 'quiz'; quizId: number }

export const DEFAULT_ROUTE: Route = { area: 'adult', screen: 'subjects' }

interface RouterContextValue {
  route: Route
  navigate: (route: Route) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE)

  const value = useMemo<RouterContextValue>(() => ({ route, navigate: setRoute }), [route])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('useRouter must be used within a RouterProvider')
  }
  return ctx
}
