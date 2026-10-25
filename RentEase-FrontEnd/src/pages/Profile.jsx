import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Glass from '../components/Glass'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'
import { api, dateFmt } from '../lib/api'
import { compressImage } from '../lib/image'

/** "My profile" - the same page for the landlord and for tenants. */
export default function Profile() {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    full_name: user.full_name || '', username: user.username || '', email: user.email || '', phone: user.phone || '', current_password: '',
  })
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState(null)
  const file = useRef(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const loginChanged = form.username.trim().toLowerCase() !== (user.username || '').toLowerCase()
    || form.email.trim().toLowerCase() !== (user.email || '').toLowerCase()
  const dirty = loginChanged || form.full_name !== (user.full_name || '') || form.phone !== (user.phone || '')

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErrors({}); setMsg(null)
    try {
      const r = await api('/api/profile', {
        method: 'PUT', auth: true,
        body: { full_name: form.full_name, username: form.username, email: form.email, phone: form.phone, ...(loginChanged ? { current_password: form.current_password } : {}) },
      })
      updateUser(r.user)
      setForm((f) => ({ ...f, full_name: r.user.full_name, username: r.user.username, email: r.user.email, phone: r.user.phone || '', current_password: '' }))
      setMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      setErrors(err.fields || {})
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  async function pickPhoto(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPhotoBusy(true); setPhotoMsg(null)
    try {
      const image = await compressImage(f, { maxSide: 320, maxBytes: 150 * 1024, square: true })
      const r = await api('/api/profile/photo', { method: 'PUT', auth: true, body: { image } })
      updateUser({ ...r.user, avatar_v: Date.now() })
      setPhotoMsg({ ok: true, text: 'Picture updated.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.fields?.image || err.message })
    } finally { setPhotoBusy(false) }
  }

  async function removePhoto() {
    if (!window.confirm('Remove your profile picture?')) return
    setPhotoBusy(true); setPhotoMsg(null)
    try {
      const r = await api('/api/profile/photo', { method: 'DELETE', auth: true })
      updateUser({ ...r.user, avatar_v: Date.now() })
      setPhotoMsg({ ok: true, text: 'Picture removed.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.message })
    } finally { setPhotoBusy(false) }
  }

  const field = (id, label, key, props = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={form[key]} onChange={set(key)} aria-invalid={!!errors[key]} {...props} />
      {errors[key] && <span className="field__error">{errors[key]}</span>}
    </div>
  )

  return (
    <div className="profile">
      <p className="eyebrow">Account</p>
      <h1 className="page-title">My profile</h1>
      <p className="muted profile__sub">Update how you appear in RentEase and how you log in.</p>

      <div className="profile__grid">
        <Glass className="profile__card profile__photo">
          <Avatar user={user} large />
          <h2>{user.full_name || user.username}</h2>
          <span className="tag">{user.role === 'superadmin' ? 'Superadmin' : user.role === 'admin' ? 'Landlord' : 'Tenant'}</span>
          <div className="imgfield__actions">
            <button type="button" className="btn btn-sm" disabled={photoBusy} onClick={() => file.current?.click()}>{photoBusy ? 'Working…' : user.has_avatar ? 'Change picture' : 'Upload picture'}</button>
            {user.has_avatar && <button type="button" className="btn btn-ghost btn-sm" disabled={photoBusy} onClick={removePhoto}>Remove</button>}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} />
          </div>
          {photoMsg && <span className={photoMsg.ok ? 'field__hint field__hint--ok' : 'field__error'} role="status">{photoMsg.text}</span>}
          <span className="field__hint">PNG, JPG or WebP. It is cropped to a square and shrunk automatically.</span>
        </Glass>

        <Glass className="profile__card">
          <h2>Your details</h2>
          <form onSubmit={save} noValidate className="stack">
            {field('pf_name', 'Full name', 'full_name', { autoComplete: 'name', maxLength: 120 })}
            {field('pf_user', 'Username', 'username', { autoComplete: 'username', maxLength: 40 })}
            {field('pf_email', 'Email', 'email', { type: 'email', autoComplete: 'email', maxLength: 255 })}
            {field('pf_phone', 'Phone', 'phone', { type: 'tel', autoComplete: 'tel', maxLength: 30, placeholder: 'e.g. 0917 123 4567' })}
            {loginChanged && (
              <div className="field">
                <label htmlFor="pf_pw">Current password</label>
                <PasswordInput id="pf_pw" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
                <span className="field__hint">Needed because you are changing your username or email.</span>
                {errors.current_password && <span className="field__error">{errors.current_password}</span>}
              </div>
            )}
            <div className={`form-msg ${msg?.ok ? 'ok' : 'err'}`} role="status">{msg?.text}</div>
            <div className="profile__actions">
              <button className="btn" disabled={busy || !dirty || (loginChanged && !form.current_password)}>{busy ? 'Saving…' : 'Save changes'}</button>
              <Link className="btn btn-ghost" to="/change-password">Change password</Link>
            </div>
          </form>
          <dl className="profile__meta">
            <div><dt>Member since</dt><dd>{dateFmt(user.created_at)}</dd></div>
            <div><dt>Role</dt><dd>{user.role === 'superadmin' ? 'Superadmin' : user.role === 'admin' ? 'Landlord' : 'Tenant'}</dd></div>
          </dl>
        </Glass>
      </div>
    </div>
  )
}
