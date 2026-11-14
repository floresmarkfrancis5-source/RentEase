import axios from 'axios'

// Base URL of the deployed (or local) LavaLust API. Set VITE_API_URL in .env
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
const KEY = 'rentease-auth'

/* ---------- token storage ---------- */
export const authStore = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
  },
  set(v) {
    try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* private mode */ }
  },
}

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message)
    this.status = status
    this.fields = fields || {}
  }
}

/* ---------- axios instance (the React app only ever talks to the LavaLust API) ---------- */
const http = axios.create({ baseURL: API_URL, timeout: 45000 })
const REQUEST_TIMEOUT_MS = 45000

http.interceptors.request.use((config) => {
  if (config.auth_required) {
    const t = authStore.get()?.tokens?.access_token
    if (t) config.headers.Authorization = `Bearer ${t}`
  }
  return config
})

// One shared silent refresh when the access token has expired.
let refreshing = null
function refreshTokens() {
  const auth = authStore.get()
  if (!auth?.tokens?.refresh_token) return Promise.resolve(false)
  refreshing ??= axios
    .post(`${API_URL}/api/auth/refresh`, { refresh_token: auth.tokens.refresh_token })
    .then((r) => { authStore.set({ ...auth, tokens: r.data.tokens }); return true })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

async function toError(e) {
  if (!e.response && ['ECONNABORTED', 'ETIMEDOUT'].includes(e.code)) {
    return new ApiError(
      `The API did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds. It may be waking up or waiting on the database or another service.`,
      0,
    )
  }
  if (!e.response) {
    return new ApiError(
      `Cannot contact the API. Check the deployed VITE_API_URL, API availability, and CORS settings for this website.`,
      0,
    )
  }
  let d = e.response.data
  if (d instanceof Blob) { try { d = JSON.parse(await d.text()) } catch { d = null } }
  return new ApiError(d?.error || `Request failed (${e.response.status})`, e.response.status, d?.errors)
}

async function send(path, { method = 'GET', body, auth = false, responseType, _retried = false }) {
  try {
    return await http.request({
      url: path, method, data: body, responseType, auth_required: auth,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch (e) {
    if (e.response?.status === 401 && auth && !_retried && (await refreshTokens())) {
      return send(path, { method, body, auth, responseType, _retried: true })
    }
    if (e.response?.status === 401 && auth) {
      authStore.set(null)
      window.dispatchEvent(new Event('rentease-auth-cleared'))
    }
    throw await toError(e)
  }
}

/** JSON call. Resolves to the parsed response body. */
export async function api(path, opts = {}) {
  return (await send(path, opts)).data
}

/** Fetches an authenticated PDF without exposing the token in the URL. */
export async function fetchPdf(path) {
  const res = await send(path, { auth: true, responseType: 'blob' })
  const header = new Uint8Array(await res.data.slice(0, 1024).arrayBuffer())
  let signatureOffset = -1
  for (let i = 0; i <= header.length - 5; i += 1) {
    if (header[i] === 0x25 && header[i + 1] === 0x50 && header[i + 2] === 0x44 && header[i + 3] === 0x46 && header[i + 4] === 0x2d) {
      signatureOffset = i
      break
    }
  }
  if (signatureOffset < 0) {
    const body = await res.data.slice(0, 128 * 1024).text()
    let message = `The receipt endpoint returned ${res.headers['content-type'] || 'an unknown content type'}, not a PDF (HTTP ${res.status}).`
    try {
      const payload = JSON.parse(body)
      if (payload?.error) message = payload.error
    } catch {
      const errorPage = new DOMParser().parseFromString(body, 'text/html')
      const phpMessage = errorPage.querySelector('.exc-msg')?.textContent?.trim()
      const title = errorPage.querySelector('title')?.textContent?.trim()
      if (phpMessage) {
        message = `Receipt generation failed${title ? ` (${title.replace(/^PHP Error\s*[—-]\s*/i, '')})` : ''}: ${phpMessage}`
      } else {
        errorPage.querySelectorAll('style, script').forEach((element) => element.remove())
        const readable = (errorPage.body?.textContent || '').replace(/\s+/g, ' ').trim()
        if (readable) message += ` Response: ${readable.slice(0, 240)}`
      }
    }
    throw new ApiError(message, res.status)
  }
  return signatureOffset ? res.data.slice(signatureOffset) : res.data
}

/** Authenticated document download: the token never goes in the URL. */
export async function downloadPdf(path, filename) {
  const blob = await fetchPdf(path)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const money = (n) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0)
export const dateFmt = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
