import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeSettings {
  mode: ThemeMode
}

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  isDark: boolean
  setMode: (mode: ThemeMode) => void
}

const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'system',
}

const STORAGE_KEY = 'mcstart.theme-mode'

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedTheme: 'light',
  isDark: false,
  setMode: () => {},
})

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readLocalMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {}
  return 'system'
}

function persistLocalMode(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {}
}

async function saveThemeMode(mode: ThemeMode) {
  await fetch('/api/preferences/theme_settings', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: { mode } }),
  })
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readLocalMode())
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const hasLoadedRemote = useRef(false)
  const isFirstResolvedTheme = useRef(true)

  const resolvedTheme = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light')
    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/preferences/theme_settings', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) return DEFAULT_THEME_SETTINGS
        return await response.json()
      })
      .then(payload => {
        if (cancelled) return
        const nextMode = payload?.value?.mode
        if (nextMode === 'system' || nextMode === 'light' || nextMode === 'dark') {
          setModeState(nextMode)
          persistLocalMode(nextMode)
        }
      })
      .catch(() => {})
      .finally(() => { hasLoadedRemote.current = true })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    persistLocalMode(mode)
    if (!hasLoadedRemote.current) return
    void saveThemeMode(mode).catch(() => {})
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.dataset.theme = resolvedTheme

    if (isFirstResolvedTheme.current) {
      isFirstResolvedTheme.current = false
      return
    }

    root.classList.add('theme-animating')
    const timer = window.setTimeout(() => root.classList.remove('theme-animating'), 520)
    return () => window.clearTimeout(timer)
  }, [resolvedTheme])

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setMode: setModeState,
  }), [mode, resolvedTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
