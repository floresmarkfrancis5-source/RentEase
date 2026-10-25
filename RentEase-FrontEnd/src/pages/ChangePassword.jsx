import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PasswordInput from '../components/PasswordInput'
import { home } from '../components/ProtectedRoute'
import Glass from '../components/Glass'
import { useAuth } from '../context/AuthContext'

export default function ChangePassword() {
  const { user, changePassword } = useAuth()
  const navigate = useNavigate()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (pw !== pw2) return setError('The new passwords do not match.')
    setBusy(true)
    try {
      const u = await changePassword(cur, pw)
      navigate(home(u), { replace: true })
    } catch (err) {
      setError(err.fields?.new_password || err.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <Glass className="auth-card">
        <p className="eyebrow">{user?.must_change_password ? 'One more step' : 'Account'}</p>
        <h1 className="auth-card__title">Choose a new password</h1>
        {user?.must_change_password && <p className="muted" style={{ marginBottom: 18 }}>You are using a temporary password. Set your own before continuing.</p>}
        <form onSubmit={submit} noValidate className="stack">
          <div className="field"><label htmlFor="cp0">Current password</label>
            <PasswordInput id="cp0" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="field"><label htmlFor="cp1">New password</label>
            <PasswordInput id="cp1" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <span className="field__hint">At least 8 characters with a letter and a number.</span></div>
          <div className="field"><label htmlFor="cp2">Repeat new password</label>
            <PasswordInput id="cp2" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <div className="form-msg err" role="alert">{error}</div>
          <button className="btn btn-block" disabled={busy || !cur || !pw || !pw2}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      </Glass>
    </div>
  )
}
