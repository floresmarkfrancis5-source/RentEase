import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSettings } from './SettingsContext'

const KEY = 'rentease-theme'
const Ctx = createContext(null)

const systemTheme = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

function stored() {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch { return null }
}

export function ThemeProvider({ children }) {
  const { saved } = useSettings()
  const [choice, setChoice] = useState(stored) // null = visitor never chose -> follow admin default
  const [sys, setSys] = useState(systemTheme)

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
    const t = setTimeout(() => root.classList.remove('theme-anim'), 450)
    return () => clearTimeout(t)
  }, [theme])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setChoice(next)
    try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
