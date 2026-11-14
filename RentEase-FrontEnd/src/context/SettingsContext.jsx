import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { readableOn, rgbTriplet } from '../lib/color'
import { paletteColors } from '../lib/colorPresets'
import { useAuth } from './AuthContext'

export const DEFAULT_SETTINGS = {
  site_name: 'RentEase',
  site_tagline: 'Rental billing, made effortless',
  logo_url: '',
  footer_text: 'Built for landlords and tenants of apartments and boarding houses.',
  accent_color: '#E05A47',
  header_color: '#1E4620',
  hero_color_from: '#1E4620',
  hero_color_to: '#4A7450',
  hero_title: 'Welcome home. Your rent, all in one place.',
  hero_subtitle: 'Check what is due, download receipts, and follow repair updates from your tenant account.',
  hero_cta_text: 'Go to my rent',
  hero_image_url: '',
  default_theme: 'light',
  glass_blur: '8',
  glass_opacity: '90',
  billing_style: 'calendar',
  billing_due_day: '1',
  billing_prorate_first_month: '1',
  billing_grace_period_days: '3',
  billing_late_fee: '0.00',
  payment_methods: 'gcash,paymaya',
}

const CACHE_KEY = 'rentease-settings'

function readCache(ownerId) {
  if (!ownerId) return DEFAULT_SETTINGS
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(`${CACHE_KEY}-${ownerId}`) || '{}') } } catch { return DEFAULT_SETTINGS }
}

/** Apply the signed-in landlord's appearance without changing RentEase branding. */
export function applySettings(s, mode = 'light') {
  const colors = paletteColors(s, mode)
  const root = document.documentElement.style
  root.setProperty('--accent', colors.accent_color)
  root.setProperty('--accent-rgb', rgbTriplet(colors.accent_color))
  root.setProperty('--on-accent', readableOn(colors.accent_color))
  root.setProperty('--header-color', colors.header_color)
  root.setProperty('--header-rgb', rgbTriplet(colors.header_color))
  root.setProperty('--on-header', readableOn(colors.header_color))
  root.setProperty('--hero-from', colors.hero_color_from)
  root.setProperty('--hero-to', colors.hero_color_to)
  root.setProperty('--on-hero', readableOn(colors.hero_color_from, colors.hero_color_to))
  root.setProperty('--glass-blur', `${Number(s.glass_blur) || 0}px`)
  root.setProperty('--glass-opacity', String(Number(s.glass_opacity) || 55))

  document.title = 'RentEase — Rental billing, made effortless'
}

// Apply cached values synchronously on module load -> no flash of default colors.
applySettings(readCache())

const Ctx = createContext(null)

export function SettingsProvider({ children }) {
  const { user } = useAuth()
  const ownerId = user?.role === 'admin' ? user.id : user?.role === 'tenant' ? user.landlord_id : null
  const [saved, setSaved] = useState(() => readCache(ownerId))
  const [preview, setPreview] = useState(null) // unsaved draft from the admin form
  const [ready, setReady] = useState(false)
  const [colorMode, setColorMode] = useState(() => document.documentElement.getAttribute('data-theme') || 'light')

  const effective = useMemo(() => (preview ? { ...saved, ...preview } : saved), [saved, preview])

  useEffect(() => { applySettings(effective, colorMode) }, [effective, colorMode])

  const commit = useCallback((next) => {
    const merged = { ...DEFAULT_SETTINGS, ...next }
    setSaved(merged)
    setPreview(null)
    if (ownerId) {
      try { localStorage.setItem(`${CACHE_KEY}-${ownerId}`, JSON.stringify(merged)) } catch { /* ignore */ }
    }
  }, [ownerId])

  useEffect(() => {
    let alive = true
    setSaved(readCache(ownerId))
    setPreview(null)
    if (!ownerId) {
      setReady(true)
      return () => { alive = false }
    }
    setReady(false)
    api('/api/my/settings', { auth: true })
      .then((r) => alive && commit(r.data))
      .catch(() => { /* Keep this landlord's cached settings if the API is unavailable. */ })
      .finally(() => alive && setReady(true))
    return () => { alive = false }
  }, [ownerId, commit])

  const value = useMemo(
    () => ({ settings: effective, saved, ready, setPreview, commit, setColorMode }),
    [effective, saved, ready, commit, setColorMode],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
