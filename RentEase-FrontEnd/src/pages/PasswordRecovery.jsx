import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Glass from '../components/Glass'
import PasswordInput from '../components/PasswordInput'
import { api } from '../lib/api'

export default function PasswordRecovery() {
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (token) navigate('/reset-password', { replace: true })
  }, [navigate, token])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (token) {
        if (password !== confirmPassword) throw new Error('The new passwords do not match.')
        const result = await api('/api/auth/password/reset', {
          method: 'POST',
          body: { token, password },
        })
        setMessage(result.message)
        setPassword('')
        setConfirmPassword('')
      } else {
        const result = await api('/api/auth/password/forgot', { method: 'POST', body: { email } })
        setMessage(result.message)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <Glass className="auth-card">
        <p className="eyebrow">Account recovery</p>
        <h1 className="auth-card__title">{token ? 'Choose a new password' : 'Forgot your password?'}</h1>
        <p className="muted">{token
          ? 'Use a strong password with at least 8 characters, including a letter and a number.'
          : 'Enter your account email. If it belongs to an active account, we will send a reset link that expires in 30 minutes.'}</p>
        <form onSubmit={submit} className="stack">
          {!token ? (
            <div className="field">
              <label htmlFor="recovery-email">Account email</label>
              <input id="recovery-email" type="email" autoComplete="email" required maxLength={255}
                value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : (
            <>
              <div className="field"><label htmlFor="recovery-password">New password</label>
                <PasswordInput id="recovery-password" autoComplete="new-password" required value={password}
                  onChange={(event) => setPassword(event.target.value)} /></div>
              <div className="field"><label htmlFor="recovery-confirm">Confirm new password</label>
                <PasswordInput id="recovery-confirm" autoComplete="new-password" required value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)} /></div>
            </>
          )}
          {error && <p className="form-msg err" role="alert">{error}</p>}
          {message && <p className="form-msg ok" role="status">{message}</p>}
          <button className="btn btn-block" disabled={busy || !!message}>{busy ? 'Please wait…' : token ? 'Reset password' : 'Send reset link'}</button>
        </form>
        <p className="login-note"><Link to="/login">Back to log in</Link></p>
      </Glass>
    </div>
  )
}
