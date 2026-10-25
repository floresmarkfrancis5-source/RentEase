import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import GoogleButton from '../components/GoogleButton'
import HeroArt from '../components/HeroArt'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { home } from '../components/ProtectedRoute'
import { useSettings } from '../context/SettingsContext'
import { assetUrl } from '../lib/brand'

export default function Register() {
  const { user, register } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [values, setValues] = useState({ username: '', full_name: '', email: '', password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const art = assetUrl(settings.login_image_url) || assetUrl(settings.hero_image_url)

  const finish = useCallback((account) => {
    navigate(account.onboarding_completed ? '/admin' : '/onboarding', { replace: true })
  }, [navigate])

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

  return (
    <section className="login">
      <div className="login-art">
        {art ? <img className="login-photo" src={art} alt="" /> : <HeroArt from={settings.hero_color_from} to={settings.hero_color_to} />}
        <h1>Your properties, in one place.</h1>
        <p>Create a landlord account, set up your first property, and invite tenants when you are ready.</p>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h2>Create landlord account</h2>
          <p>Choose a username; your email can also be used to sign in.</p>
          <div className="stack">
            <div className="field">
              <label htmlFor="register_username">Username</label>
              <input id="register_username" autoComplete="username" value={values.username}
                onChange={(event) => update('username', event.target.value)} required minLength={3} maxLength={50} />
              {fieldErrors.username && <span className="field__error">{fieldErrors.username}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_name">Full name</label>
              <input id="register_name" autoComplete="name" value={values.full_name}
                onChange={(event) => update('full_name', event.target.value)} required maxLength={120} />
              {fieldErrors.full_name && <span className="field__error">{fieldErrors.full_name}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_email">Email</label>
              <input id="register_email" type="email" autoComplete="email" value={values.email}
                onChange={(event) => update('email', event.target.value)} required maxLength={255} />
              {fieldErrors.email && <span className="field__error">{fieldErrors.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_password">Password</label>
              <PasswordInput id="register_password" autoComplete="new-password" value={values.password}
                onChange={(event) => update('password', event.target.value)} required />
              <span className="field__hint">At least 8 characters, including a letter and a number.</span>
              {fieldErrors.password && <span className="field__error">{fieldErrors.password}</span>}
            </div>
            <div className="field">
              <label htmlFor="register_confirm_password">Confirm password</label>
              <PasswordInput id="register_confirm_password" autoComplete="new-password" value={values.confirm_password}
                onChange={(event) => update('confirm_password', event.target.value)} required />
              {fieldErrors.confirm_password && <span className="field__error">{fieldErrors.confirm_password}</span>}
            </div>
            {error && <div className="form-msg err" role="alert">{error}</div>}
            <button className="btn btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          </div>
          <div className="stack" style={{ marginTop: 18 }}>
            <p className="login-note">Google account registration will be available in a future update.</p>
            <GoogleButton label="Create account with Google" />
          </div>
          <p className="login-note">Already have an account? <Link to="/login">Log in</Link>.</p>
        </form>
      </div>
    </section>
  )
}
