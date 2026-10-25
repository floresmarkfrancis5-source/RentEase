import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { assetUrl } from '../lib/brand'
import { readableOn, rgbTriplet } from '../lib/color'

export const DEFAULT_SETTINGS = {
  site_name: 'RentEase',
  site_tagline: 'Rental billing, made effortless',
  logo_url: '',
  footer_text: 'Built for landlords and tenants of apartments and boarding houses.',
  accent_color: '#9b5138',
  header_color: '#40352b',
  hero_color_from: '#d18a57',
  hero_color_to: '#627d79',
  hero_title: 'Rent collection, without the notebook.',
  hero_subtitle:
    'Units, tenants, monthly billing, online payments and repair requests — in one calm, centralized place.',
  hero_cta_text: 'Get started',
  hero_image_url: '',
  login_image_url: '',
  default_theme: 'system',
  glass_blur: '18',
  glass_opacity: '55',
}

const CACHE_KEY = 'rentease-settings'

function readCache() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } } catch { return DEFAULT_SETTINGS }
}

/** Push settings into CSS variables, the tab title and the favicon. */
export function applySettings(s) {
  const root = document.documentElement.style
  root.setProperty('--accent', s.accent_color)
  root.setProperty('--accent-rgb', rgbTriplet(s.accent_color))
  root.setProperty('--on-accent', readableOn(s.accent_color))
  root.setProperty('--header-color', s.header_color)
  root.setProperty('--header-rgb', rgbTriplet(s.header_color))
  root.setProperty('--on-header', readableOn(s.header_color))
  root.setProperty('--hero-from', s.hero_color_from)
  root.setProperty('--hero-to', s.hero_color_to)
  root.setProperty('--on-hero', readableOn(s.hero_color_from, s.hero_color_to))
  root.setProperty('--glass-blur', `${Number(s.glass_blur) || 0}px`)
  root.setProperty('--glass-opacity', String(Number(s.glass_opacity) || 55))

  document.title = s.site_tagline ? `${s.site_name} — ${s.site_tagline}` : s.site_name

  let link = document.querySelector('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  if (s.logo_url) {
    link.removeAttribute('type')
    link.href = assetUrl(s.logo_url)
  } else {
    const letter = (s.site_name || 'R').trim().charAt(0).toUpperCase()
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${s.accent_color}"/>` +
      `<text x="32" y="44" font-size="36" font-family="Georgia,serif" font-weight="700" text-anchor="middle" fill="${readableOn(s.accent_color)}">${letter.replace(/[<&]/g, '')}</text></svg>`
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
}

// Apply cached values synchronously on module load -> no flash of default colors.
applySettings(readCache())

const Ctx = createContext(null)

export function SettingsProvider({ children }) {
  const [saved, setSaved] = useState(readCache)
  const [preview, setPreview] = useState(null) // unsaved draft from the admin form
  const [ready, setReady] = useState(false)

  const effective = useMemo(() => (preview ? { ...saved, ...preview } : saved), [saved, preview])

  useEffect(() => { applySettings(effective) }, [effective])

  const commit = useCallback((next) => {
    const merged = { ...DEFAULT_SETTINGS, ...next }
    setSaved(merged)
    setPreview(null)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let alive = true
    api('/api/settings')
      .then((r) => alive && commit(r.data))
      .catch(() => { /* keep cached/default look if the API is asleep */ })
      .finally(() => alive && setReady(true))
    return () => { alive = false }
  }, [commit])

  const value = useMemo(
    () => ({ settings: effective, saved, ready, setPreview, commit }),
    [effective, saved, ready, commit],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
