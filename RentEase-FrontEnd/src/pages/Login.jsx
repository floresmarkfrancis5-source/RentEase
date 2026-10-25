import { useCallback, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import GoogleButton from '../components/GoogleButton'
import HeroArt from '../components/HeroArt'
import PasswordInput from '../components/PasswordInput'
import { home } from '../components/ProtectedRoute'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { assetUrl } from '../lib/brand'

export default function Login() {
  const { user, login } = useAuth()
  const { settings: s } = useSettings()
  const navigate = useNavigate()
  const loc = useLocation()
  const [who, setWho] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const art = assetUrl(s.login_image_url) || assetUrl(s.hero_image_url)

  const go = useCallback((u) => navigate(u.must_change_password ? '/change-password' : loc.state?.from || home(u), { replace: true }), [navigate, loc.state])

  if (user) return <Navigate to={user.must_change_password ? '/change-password' : loc.state?.from || home(user)} replace />

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      go(await login(who.trim(), password))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="login">
      <div className="login-art">
        {art ? <img className="login-photo" src={art} alt="" /> : <HeroArt from={s.hero_color_from} to={s.hero_color_to} />}
        <h1>Rent day, all in one place.</h1>
        <p>Check your bills, pay online and follow repairs — or manage every property as a landlord.</p>
      </div>

      <div className="login-form">
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>Welcome back</h2>
          <p>Log in to {s.site_name} with your email or username.</p>
          <div className="stack">
            <div className="field">
              <label htmlFor="li_who">Email or username</label>
              <input id="li_who" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={who} onChange={(e) => setWho(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="li_pass">Password</label>
              <PasswordInput id="li_pass" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Link className="field__hint" to="/forgot-password">Forgot password?</Link>
            </div>
            <div className="form-msg err" role="alert">{error}</div>
            <button className="btn btn-block" disabled={busy || !who || !password}>{busy ? 'Signing in…' : 'Log in'}</button>
          </div>
          <GoogleButton label="Sign in with Google" />
          <p className="login-note">Tenant accounts are created by your landlord. Ask them for your username and temporary password.</p>
          <p className="login-note">New landlord? <a href="/register">Create a landlord account</a>.</p>
        </form>
      </div>
    </section>
  )
}
