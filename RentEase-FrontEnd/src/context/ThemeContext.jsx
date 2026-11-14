import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSettings } from './SettingsContext'
import { useAuth } from './AuthContext'

const Ctx = createContext(null)

const systemTheme = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

function storedChoice(accountKey, defaultTheme) {
  try {
    const saved = JSON.parse(localStorage.getItem(`rentease-theme-${accountKey}`) || 'null')
    return saved?.defaultTheme === defaultTheme && (saved.theme === 'light' || saved.theme === 'dark')
      ? saved.theme
      : null
  } catch {
    return null
  }
}

export function ThemeProvider({ children }) {
  const { saved, setColorMode } = useSettings()
  const { user } = useAuth()
  const accountKey = user?.id ?? 'guest'
  const [choice, setChoice] = useState(() => storedChoice(accountKey, saved.default_theme))
  const [sys, setSys] = useState(systemTheme)

  useEffect(() => setChoice(storedChoice(accountKey, saved.default_theme)), [accountKey, saved.default_theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSys(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const fallback = saved.default_theme === 'system' ? sys : saved.default_theme
  const theme = choice ?? fallback

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('theme-anim')
    root.setAttribute('data-theme', theme)
    setColorMode(theme)
    const t = setTimeout(() => root.classList.remove('theme-anim'), 450)
    return () => clearTimeout(t)
  }, [theme, setColorMode])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setChoice(next)
    try {
      localStorage.setItem(`rentease-theme-${accountKey}`, JSON.stringify({ theme: next, defaultTheme: saved.default_theme }))
    } catch { /* The selected mode still applies for this session if storage is unavailable. */ }
  }, [accountKey, saved.default_theme, theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
