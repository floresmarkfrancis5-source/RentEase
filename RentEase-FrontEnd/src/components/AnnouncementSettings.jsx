import { useEffect, useState } from 'react'
import Glass from './Glass'
import { Field } from './ui'
import { api } from '../lib/api'

const blank = { title: '', body: '', is_published: true }

export default function AnnouncementSettings() {
  const [items, setItems] = useState(null)
  const [draft, setDraft] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setError('')
    try {
      const response = await api('/api/admin/announcements', { auth: true })
      setItems(response.data || [])
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { load() }, [])

  function startEdit(item) {
    setEditing(item.id)
    setDraft({ title: item.title, body: item.body, is_published: !!Number(item.is_published) })
    setNotice('')
  }

  function resetForm() {
    setEditing(null)
    setDraft(blank)
  }

  async function save() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await api(
        editing ? `/api/admin/announcements/${editing}` : '/api/admin/announcements',
        { method: editing ? 'PUT' : 'POST', auth: true, body: draft },
      )
      setItems(response.data || [])
      setNotice(editing ? 'Announcement updated.' : 'Announcement published.')
      resetForm()
    } catch (err) {
      setError(err.fields?.title || err.fields?.body || err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await api(`/api/admin/announcements/${item.id}`, { method: 'DELETE', auth: true })
      setItems(response.data || [])
      if (editing === item.id) resetForm()
      setNotice('Announcement deleted.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Glass as="section" className="panel announcement-settings">
      <h2 className="panel__title">Tenant announcements</h2>
      <p className="muted">Publish important updates for your tenants. Published announcements appear prominently on their homepage.</p>
      <div className="stack">
        <Field label="Announcement title">
          <input required minLength={2} maxLength={160} value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
        </Field>
        <Field label="Announcement">
          <textarea required minLength={2} maxLength={5000} rows={5} value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} />
        </Field>
        <label className="field field--checkbox">
          <input type="checkbox" checked={draft.is_published}
            onChange={(event) => setDraft((current) => ({ ...current, is_published: event.target.checked }))} />
          <span className="field__label">Show to tenants</span>
        </label>
        <div className="modal__foot">
          {editing && <button type="button" className="btn btn--ghost" disabled={busy} onClick={resetForm}>Cancel edit</button>}
          <button type="button" className="btn btn--accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save announcement' : 'Publish announcement'}</button>
        </div>
      </div>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {notice && <p className="field__hint field__hint--ok" role="status">{notice}</p>}
      {items === null ? <p className="muted">Loading announcements…</p> : items.length === 0
        ? <p className="muted">No announcements yet.</p>
        : <div className="announcement-settings__list">
          {items.map((item) => (
            <article className="announcement-settings__item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small className="muted">{Number(item.is_published) ? 'Published' : 'Hidden'} · {item.updated_at}</small>
              </div>
              <div className="announcement-settings__actions">
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => startEdit(item)}>Edit</button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => remove(item)}>Delete</button>
              </div>
            </article>
          ))}
        </div>}
    </Glass>
  )
}
