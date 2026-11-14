import { useCallback, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import GoogleButton from '../components/GoogleButton'
import PasswordInput from '../components/PasswordInput'
import { home } from '../components/ProtectedRoute'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

export default function Login() {
  const { t } = useLanguage()
  const { user, login, loginGoogle } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [who, setWho] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const go = useCallback(
    (u) => navigate(u.must_change_password ? '/change-password' : loc.state?.from || home(u), { replace: true }),
    [navigate, loc.state],
  )

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

  async function handleGoogle(credential) {
    // loginGoogle throws ApiError (with .message) on failure — GoogleButton catches it.
    go(await loginGoogle(credential))
  }

  return (
    <section className="login">
      <div className="login-art">
        <img className="login-photo" src="/images/rentease-auth-default.jpg" alt="" fetchpriority="high" />
        <h1>{t('Rent day, all in one place.')}</h1>
        <p>{t('Check your bills, pay online and follow repairs — or manage every property as a landlord.')}</p>
      </div>

      <div className="login-form">
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>{t('Welcome back')}</h2>
          <p>{t('Log in to RentEase with your email or username.')}</p>
          <div className="stack">
            <div className="field">
              <label htmlFor="li_who">{t('Email or username')}</label>
              <input id="li_who" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={who} onChange={(e) => setWho(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="li_pass">{t('Password')}</label>
              <PasswordInput id="li_pass" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Link className="field__hint" to="/forgot-password">{t('Forgot password?')}</Link>
            </div>
            <div className="form-msg err" role="alert">{error}</div>
            <button className="btn btn-block" disabled={busy || !who || !password}>{busy ? t('Signing in…') : t('Log in')}</button>
          </div>

          <div className="login-divider"><span>{t('or')}</span></div>

          {/* Real Google Sign-In: tenant accounts are linked by the landlord, so Google
              sign-in is supported for both landlords (admins) and tenants. */}
          <GoogleButton label="Sign in with Google" onCredential={handleGoogle} />

          <p className="login-note">{t('Tenant accounts are created by your landlord. Ask them for your username and temporary password.')}</p>
          <div className="login-register">
            <p className="login-note">{t('New landlord?')}</p>
            <Link className="btn btn-block login-register__button" to="/register">{t('Create a landlord account')}</Link>
          </div>
        </form>
      </div>
    </section>
  )
}
