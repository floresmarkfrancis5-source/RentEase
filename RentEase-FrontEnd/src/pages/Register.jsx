import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import GoogleButton from '../components/GoogleButton'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { home } from '../components/ProtectedRoute'

export default function Register() {
  const { t } = useLanguage()
  const { user, register, registerGoogle } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ username: '', full_name: '', email: '', password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // Google two-step: after Google verifies, we ask for a username.
  const [googleCredential, setGoogleCredential] = useState(null)
  const [googleUsername, setGoogleUsername] = useState('')

  const finish = useCallback(
    (account) => navigate(account.onboarding_completed ? '/admin' : '/onboarding', { replace: true }),
    [navigate],
  )

  if (user) return <Navigate to={user.role === 'admin' && !user.onboarding_completed ? '/onboarding' : home(user)} replace />

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    if (values.password !== values.confirm_password) {
      setFieldErrors({ confirm_password: 'Passwords do not match.' })
      return
    }
    setBusy(true)
    try {
      const account = await register({
        username: values.username,
        full_name: values.full_name,
        email: values.email,
        password: values.password,
      })
      finish(account)
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fields || {})
    } finally {
      setBusy(false)
    }
  }

  /** Step 1 of Google registration: receive the JWT from Google and show username field. */
  async function handleGoogleCredential(credential) {
    setGoogleCredential(credential)
    setError('')
  }

  /** Step 2 of Google registration: submit username + Google credential to the backend. */
  async function submitGoogle(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    const uname = googleUsername.trim()
    if (!uname) { setFieldErrors({ google_username: 'Choose a username.' }); return }
    setBusy(true)
    try {
      const account = await registerGoogle(googleCredential, uname)
      finish(account)
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fields || {})
      // If the error is about the Google token being expired the user needs to try again.
      if (err.status === 401) setGoogleCredential(null)
    } finally {
      setBusy(false)
    }
  }

  // ── Step 2: username selection after Google verified the identity ──
  if (googleCredential) {
    return (
      <section className="login">
        <div className="login-art">
          <img className="login-photo" src="/images/rentease-auth-default.jpg" alt="" fetchpriority="high" />
          <h1>{t('Almost there.')}</h1>
          <p>{t('Google verified your identity. Pick a username to finish creating your landlord account.')}</p>
        </div>
        <div className="login-form">
          <form className="login-card" onSubmit={submitGoogle}>
            <h2>{t('Choose a username')}</h2>
            <p>{t('This will be your login identifier alongside your Google email.')}</p>
            <div className="stack">
              <div className="field">
                <label htmlFor="greg_username">{t('Username')}</label>
                <input
                  id="greg_username"
                  autoComplete="username"
                  value={googleUsername}
                  onChange={(e) => { setGoogleUsername(e.target.value); setFieldErrors((c) => ({ ...c, google_username: undefined, username: undefined })) }}
                  required
                  minLength={3}
                  maxLength={50}
                  placeholder={t('e.g. juan_dela_cruz')}
                />
                {(fieldErrors.google_username || fieldErrors.username) && (
                  <span className="field__error">{fieldErrors.google_username || fieldErrors.username}</span>
                )}
                <span className="field__hint">{t('3–50 characters: letters, numbers, dots, dashes, underscores.')}</span>
              </div>
              {error && <div className="form-msg err" role="alert">{error}</div>}
              <button className="btn btn-block" disabled={busy}>{busy ? t('Creating account…') : t('Create landlord account')}</button>
              <button type="button" className="btn btn--ghost btn-block" onClick={() => { setGoogleCredential(null); setError('') }}>{t('← Use a different method')}</button>
            </div>
          </form>
        </div>
      </section>
    )
  }

  // ── Step 1: normal registration form + Google sign-up button ──
  return (
    <section className="login">
      <div className="login-art">
        <img className="login-photo" src="/images/rentease-auth-default.jpg" alt="" fetchpriority="high" />
        <h1>{t('Your properties, in one place.')}</h1>
        <p>{t('Create a landlord account, set up your first property, and invite tenants when you are ready.')}</p>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h2>{t('Create landlord account')}</h2>
          <p>{t('Choose a username; your email can also be used to sign in.')}</p>
          <div className="stack">
            <div className="field">
              <label htmlFor="register_username">{t('Username')}</label>
              <input id="register_username" autoComplete="username" value={values.username}
                onChange={(event) => update('username', event.target.value)} required minLength={3} maxLength={50} />
              {fieldErrors.username && <span className="field__error">{fieldErrors.username}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_name">{t('Full name')}</label>
              <input id="register_name" autoComplete="name" value={values.full_name}
                onChange={(event) => update('full_name', event.target.value)} required maxLength={120} />
              {fieldErrors.full_name && <span className="field__error">{fieldErrors.full_name}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_email">{t('Email')}</label>
              <input id="register_email" type="email" autoComplete="email" value={values.email}
                onChange={(event) => update('email', event.target.value)} required maxLength={255} />
              {fieldErrors.email && <span className="field__error">{fieldErrors.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_password">{t('Password')}</label>
              <PasswordInput id="register_password" autoComplete="new-password" value={values.password}
                onChange={(event) => update('password', event.target.value)} required />
              <span className="field__hint">{t('At least 8 characters, including a letter and a number.')}</span>
              {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_confirm_password">{t('Confirm password')}</label>
              <PasswordInput id="register_confirm_password" autoComplete="new-password" value={values.confirm_password}
                onChange={(event) => update('confirm_password', event.target.value)} required />
              {fieldErrors.confirm_password && <span className="field__error">{fieldErrors.confirm_password}</span>}
            </div>
            {error && <div className="form-msg err" role="alert">{error}</div>}
            <button className="btn btn-block" disabled={busy}>{busy ? t('Creating account…') : t('Create account')}</button>
          </div>

          <div className="login-divider"><span>{t('or')}</span></div>

          {/* Google sign-up — triggers the 2-step username flow above */}
          <GoogleButton label="Create account with Google" onCredential={handleGoogleCredential} />

          <p className="login-note">{t('Already have an account?')} <Link to="/login">{t('Log in')}</Link>.</p>
        </form>
      </div>
    </section>
  )
}
