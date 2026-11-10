import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Glass from '../components/Glass'
import GoogleButton from '../components/GoogleButton'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function ActivateTenant() {
  const navigate = useNavigate()
  const { startSession } = useAuth()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('No activation token provided. Please check the link from your invitation email.')
      setLoading(false)
      return
    }

    api(`/api/auth/tenant/invitation?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setTenant(res.tenant)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'This activation link is invalid or has expired.')
        setLoading(false)
      })
  }, [token])

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setFormError('Choose a stronger password: at least 8 characters with a letter and a number.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await api('/api/auth/tenant/activate', {
        method: 'POST',
        body: { token, password },
      })
      if (res.tokens) {
        startSession(res)
        navigate('/tenant', { replace: true })
      }
    } catch (err) {
      setFormError(err.message || 'Activation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleActivate(credential) {
    setFormError('')
    try {
      const res = await api('/api/auth/tenant/activate-google', {
        method: 'POST',
        body: { token, credential },
      })
      if (res.tokens) {
        startSession(res)
        navigate('/tenant', { replace: true })
      }
    } catch (err) {
      setFormError(err.message || 'Google activation failed.')
    }
  }

  return (
    <div className="auth-wrap">
      <Glass className="auth-card">
        <p className="eyebrow">Tenant activation</p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p className="muted">Verifying your activation link…</p>
          </div>
        )}

        {!loading && error && (
          <div>
            <h1 className="auth-card__title" style={{ color: 'var(--danger)' }}>Invitation Expired</h1>
            <p className="alert alert--error" role="alert" style={{ marginBottom: 20 }}>{error}</p>
            <p className="muted" style={{ marginBottom: 24 }}>
              Activation links expire after 7 days for security. Please ask your landlord to resend your activation email.
            </p>
            <Link to="/login" className="btn btn--accent" style={{ display: 'inline-flex' }}>
              Go to sign in
            </Link>
          </div>
        )}

        {!loading && !error && tenant && (
          <div>
            <h1 className="auth-card__title">Welcome to RentEase!</h1>
            <p className="muted" style={{ marginBottom: 16 }}>
              Hello <strong>{tenant.full_name}</strong>! Your account has been prepared
              {tenant.unit_name ? ` for ${tenant.unit_name}` : ''}
              {tenant.property_name ? ` at ${tenant.property_name}` : ''}.
            </p>

            <div className="alert alert--info" style={{ marginBottom: 20 }}>
              <strong>Verified email:</strong> {tenant.email}
              <br />
              <small className="muted">Username: @{tenant.username}</small>
            </div>

            {formError && <p className="alert alert--error" role="alert" style={{ marginBottom: 16 }}>{formError}</p>}

            <form onSubmit={handlePasswordSubmit} className="stack">
              <div className="field">
                <label htmlFor="activate-password">Create your password</label>
                <PasswordInput
                  id="activate-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="activate-confirm">Confirm password</label>
                <PasswordInput
                  id="activate-confirm"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <small className="muted">Must be at least 8 characters with a letter and a number.</small>
              </div>

              <button type="submit" className="btn btn--accent" disabled={submitting}>
                {submitting ? 'Activating account…' : 'Activate Account & Sign In'}
              </button>
            </form>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '.88rem', marginBottom: 12 }}>— Or activate with your Google Account —</p>
              <GoogleButton
                onSuccess={handleGoogleActivate}
                text="signup_with"
              />
              <small className="muted" style={{ display: 'block', marginTop: 8 }}>
                Must be the Google account for <strong>{tenant.email}</strong>.
              </small>
            </div>
          </div>
        )}
      </Glass>
    </div>
  )
}
