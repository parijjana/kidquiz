import { createContext, useContext, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { themes, DEFAULT_THEME_ID } from './themes'
import type { Theme, ThemeAssets } from './themes'

const THEME_SETTINGS_KEY = 'themeId'

interface ThemeContextValue {
  theme: Theme
  themeId: string
  assets: ThemeAssets
  /** Switch themes at runtime; persisted best-effort via settings. */
  setThemeId: (id: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID)

  // Load the persisted theme choice without blocking first render — the app
  // always renders with DEFAULT_THEME_ID immediately, then swaps if settings
  // says otherwise.
  useLayoutEffect(() => {
    let cancelled = false
    api.settings
      .get(THEME_SETTINGS_KEY)
      .then((stored) => {
        if (!cancelled && stored && stored in themes) {
          setThemeIdState(stored)
        }
      })
      .catch(() => {
        // Settings unavailable — silently keep the default theme.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const theme = themes[themeId] ?? themes[DEFAULT_THEME_ID]

  // Apply CSS vars synchronously before paint so there is no flash of
  // unstyled/unthemed content.
  useLayoutEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.cssVars)) {
      root.style.setProperty(key, value)
    }
    root.dataset.theme = theme.id
  }, [theme])

  const setThemeId = (id: string): void => {
    if (!(id in themes)) return
    setThemeIdState(id)
    api.settings.set(THEME_SETTINGS_KEY, id).catch(() => {
      // Best-effort persistence — theme still applies for this session.
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, themeId: theme.id, assets: theme.assets, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
