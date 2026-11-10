import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError, api, authStore } from '../lib/api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(authStore.get)

  useEffect(() => {
    const clear = () => setAuth(null)
    window.addEventListener('rentease-auth-cleared', clear)
    return () => window.removeEventListener('rentease-auth-cleared', clear)
  }, [])

  const start = useCallback((r) => {
    if (!r || typeof r !== 'object' || !r.user || !r.tokens?.access_token) {
      throw new ApiError('The API returned an invalid sign-in response. Check the API URL and server logs.', 502)
    }
    authStore.set(r)
    setAuth(r)
    return r.user
  }, [])

  /** Merge new profile fields into the signed-in user (and the saved session). */
  const updateUser = useCallback((patch) => {
    const cur = authStore.get()
    if (!cur) return
    const next = { ...cur, user: { ...cur.user, ...patch } }
    authStore.set(next)
    setAuth(next)
  }, [])

  // Pick up fields added after the person logged in (phone, profile picture).
  const signedIn = !!auth?.tokens?.access_token
  useEffect(() => {
    if (!signedIn) return
    api('/api/auth/me', { auth: true }).then((r) => updateUser({ ...r.user, avatar_v: authStore.get()?.user?.avatar_v ?? 0 })).catch(() => {})
  }, [signedIn, updateUser])

  const login = useCallback(
    async (email, password) => start(await api('/api/auth/login', { method: 'POST', body: { email, password } })),
    [start],
  )
  const loginGoogle = useCallback(
    async (credential) => start(await api('/api/auth/google', { method: 'POST', body: { credential } })),
    [start],
  )
  const register = useCallback(
    async (details) => start(await api('/api/auth/register', { method: 'POST', body: details })),
    [start],
  )
  const registerGoogle = useCallback(
    async (credential, username) => start(await api('/api/auth/google/register', { method: 'POST', body: { credential, username } })),
    [start],
  )

  const logout = useCallback(async () => {
    const rt = authStore.get()?.tokens?.refresh_token
    authStore.set(null)
    setAuth(null)
    if (rt) api('/api/auth/logout', { method: 'POST', body: { refresh_token: rt } }).catch(() => {})
  }, [])

  /** Change password, then sign in again so the session has fresh tokens. */
  const changePassword = useCallback(
    async (current_password, new_password) => {
      const email = authStore.get()?.user?.email
      await api('/api/auth/change-password', { method: 'POST', auth: true, body: { current_password, new_password } })
      return start(await api('/api/auth/login', { method: 'POST', body: { email, password: new_password } }))
    },
    [start],
  )

  const value = useMemo(
    () => ({
      user: auth?.user ?? null,
      isAdmin: auth?.user?.role === 'admin',
      isSuperadmin: auth?.user?.role === 'superadmin',
      isTenant: auth?.user?.role === 'tenant',
      login, loginGoogle, register, registerGoogle, logout, changePassword, updateUser, startSession: start,
    }),
    [auth, login, loginGoogle, register, registerGoogle, logout, changePassword, updateUser, start],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
