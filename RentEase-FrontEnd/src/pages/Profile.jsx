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
  const [photoPreview, setPhotoPreview] = useState('')
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const file = useRef(null)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((previous) => {
      if (!previous[k]) return previous
      const next = { ...previous }
      delete next[k]
      return next
    })
    setMsg(null)
  }
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
    setPhotoBusy(true); setPhotoMsg(null); setConfirmRemovePhoto(false)
    try {
      const image = await compressImage(f, { maxSide: 320, maxBytes: 150 * 1024, square: true })
      setPhotoPreview(image)
      const r = await api('/api/profile/photo', { method: 'PUT', auth: true, body: { image } })
      updateUser({ ...r.user, avatar_v: Date.now() })
      setPhotoMsg({ ok: true, text: 'Picture updated.' })
    } catch (err) {
      setPhotoPreview('')
      setPhotoMsg({ ok: false, text: err.fields?.image || err.message })
    } finally { setPhotoBusy(false) }
  }

  async function removePhoto() {
    setPhotoBusy(true); setPhotoMsg(null)
    try {
      const r = await api('/api/profile/photo', { method: 'DELETE', auth: true })
      updateUser({ ...r.user, avatar_v: Date.now() })
      setPhotoPreview('')
      setConfirmRemovePhoto(false)
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
  const roleLabel = user.role === 'superadmin' ? 'Superadmin' : user.role === 'admin' ? 'Landlord' : 'Tenant'

  return (
    <div className="profile">
      <p className="eyebrow">Account</p>
      <h1 className="page-title">My profile</h1>
      <p className="muted profile__sub">Update how you appear in RentEase and how you log in.</p>

      <div className="profile__grid">
        <Glass className="profile__card profile__photo">
          <div className="profile__avatar-wrap">
            {photoPreview
              ? <img className="profile__avatar-preview" src={photoPreview} alt="Preview of your new profile picture" />
              : <Avatar user={{ ...user, full_name: form.full_name }} large />}
            {photoBusy && <span className="profile__avatar-saving" role="status">Uploading…</span>}
          </div>
          <div className="profile__identity">
            <h2>{form.full_name || user.username}</h2>
            <span className="tag">{roleLabel}</span>
          </div>
          <div className="profile__photo-actions">
            <button type="button" className="btn btn-sm" disabled={photoBusy} onClick={() => file.current?.click()}>
              {photoBusy ? 'Uploading…' : user.has_avatar ? 'Change picture' : 'Upload picture'}
            </button>
            {user.has_avatar && !confirmRemovePhoto && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={photoBusy} onClick={() => { setPhotoMsg(null); setConfirmRemovePhoto(true) }}>Remove</button>
            )}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} />
          </div>
          {confirmRemovePhoto && (
            <div className="profile__photo-confirm" role="group" aria-label="Confirm profile picture removal">
              <span>Remove your current picture?</span>
              <div>
                <button type="button" className="btn btn-ghost btn-sm" disabled={photoBusy} onClick={() => setConfirmRemovePhoto(false)}>Keep picture</button>
                <button type="button" className="btn btn-sm profile__remove-confirm" disabled={photoBusy} onClick={removePhoto}>{photoBusy ? 'Removing…' : 'Remove picture'}</button>
              </div>
            </div>
          )}
          {photoMsg && <span className={photoMsg.ok ? 'field__hint field__hint--ok' : 'field__error'} role={photoMsg.ok ? 'status' : 'alert'}>{photoMsg.text}</span>}
          <span className="field__hint profile__photo-hint">PNG, JPG, or WebP. Your photo is cropped square and resized automatically.</span>
          <dl className="profile__photo-meta">
            <div><dt>Member since</dt><dd>{dateFmt(user.created_at)}</dd></div>
            <div><dt>Account type</dt><dd>{roleLabel}</dd></div>
          </dl>
        </Glass>

        <Glass className="profile__card profile__details-card">
          <div className="profile__details-heading">
            <div>
              <h2>Your details</h2>
              <p>Manage your personal information and sign-in details.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/change-password">Change password</Link>
          </div>
          <form onSubmit={save} noValidate className="stack profile__form">
            <section className="profile__section" aria-labelledby="profile-personal-heading">
              <div className="profile__section-heading">
                <h3 id="profile-personal-heading">Personal information</h3>
                <p>How your name and contact details appear in RentEase.</p>
              </div>
              <div className="profile__fields profile__fields--personal">
                {field('pf_name', 'Full name', 'full_name', { autoComplete: 'name', maxLength: 120 })}
                {field('pf_phone', 'Phone', 'phone', { type: 'tel', autoComplete: 'tel', maxLength: 30, placeholder: 'e.g. 0917 123 4567' })}
              </div>
            </section>

            <section className="profile__section" aria-labelledby="profile-login-heading">
              <div className="profile__section-heading">
                <h3 id="profile-login-heading">Sign-in details</h3>
                <p>Changing your username or email requires your current password.</p>
              </div>
              <div className="profile__fields">
                {field('pf_user', 'Username', 'username', { autoComplete: 'username', maxLength: 40 })}
                {field('pf_email', 'Email', 'email', { type: 'email', autoComplete: 'email', maxLength: 255 })}
              </div>
              {loginChanged && (
                <div className="profile__password-check">
                  <div>
                    <strong>Confirm it’s you</strong>
                    <span>Enter your current password to save sign-in changes.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="pf_pw">Current password</label>
                    <PasswordInput id="pf_pw" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} aria-invalid={!!errors.current_password} />
                    {errors.current_password && <span className="field__error">{errors.current_password}</span>}
                  </div>
                </div>
              )}
            </section>

            {msg && <div className={`profile__feedback ${msg.ok ? 'is-success' : 'is-error'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
            <div className="profile__actions">
              <div className="profile__save-state" role="status">
                {dirty && !msg?.ok ? 'You have unsaved changes.' : msg?.ok ? 'Your profile is up to date.' : ''}
              </div>
              <button className="btn" disabled={busy || !dirty || (loginChanged && !form.current_password)}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </Glass>
      </div>
    </div>
  )
}
