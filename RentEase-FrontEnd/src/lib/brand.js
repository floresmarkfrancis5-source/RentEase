import { API_URL } from './api'

export const assetUrl = (u) => {
  const v = String(u || '').trim()
  if (!v) return ''
  return v.startsWith('/api/') ? `${API_URL}${v}` : v
}

export function splitBrand(name) {
  const n = String(name || '').trim()
  const words = n.split(/\s+/)
  if (words.length > 1) return [words.slice(0, -1).join(' '), words[words.length - 1]]
  const m = n.match(/^(.*?[a-z])([A-Z][A-Za-z]*)$/)
  return m ? [m[1], m[2]] : ['', n]
}

export function splitHeadline(t) {
  const s = String(t || '').trim()
  const nl = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  if (nl.length > 1) return [nl[0], nl.slice(1).join(' ')]
  const m = s.match(/^(.+?[,;:—–])\s+(.+)$/)
  return m ? [m[1], m[2]] : [s, '']
}

export const initials = (n) =>
  String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
