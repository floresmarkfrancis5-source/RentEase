import { useCallback, useEffect, useState } from 'react'
import Avatar from '../components/Avatar'
import Glass from '../components/Glass'
import PasswordInput from '../components/PasswordInput'
import { Field, Modal } from '../components/ui'
import { api } from '../lib/api'

const emptyForm = { username: '', full_name: '', email: '', password: '' }

export default function SuperadminDashboard() {
  const [landlords, setLandlords] = useState([])
  const [superadmins, setSuperadmins] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [landlordResult, adminResult] = await Promise.all([
        api('/api/superadmin/landlords', { auth: true }),
        api('/api/superadmin/accounts', { auth: true }),
      ])
      setLandlords(landlordResult.data)
      setSuperadmins(adminResult.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleAccount(kind, account) {
    const path = kind === 'landlord' ? `/api/superadmin/landlords/${account.id}` : `/api/superadmin/accounts/${account.id}`
    setBusy(`${kind}-${account.id}`)
    setError('')
    setNotice('')
    try {
      const result = await api(path, { method: 'PATCH', auth: true, body: { is_active: !Number(account.is_active) } })
      setNotice(result.message)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function sendReset(landlord) {
    setBusy(`reset-${landlord.id}`)
    setError('')
    setNotice('')
    try {
      const result = await api(`/api/superadmin/landlords/${landlord.id}/send-password-reset`, { method: 'POST', auth: true, body: {} })
      setNotice(result.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(`delete-${deleteTarget.id}`)
    setError('')
    setNotice('')
    try {
      const result = await api(`/api/superadmin/landlords/${deleteTarget.id}`, { method: 'DELETE', auth: true })
      setNotice(result.message)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function createSuperadmin(event) {
    event.preventDefault()
    setBusy('create')
    setError('')
    setNotice('')
    try {
      const result = await api('/api/superadmin/accounts', { method: 'POST', auth: true, body: form })
      setNotice(result.message)
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="superadmin-page">
      <header className="pagehead">
        <div><p className="eyebrow">Platform control</p><h1 className="page-title">Superadmin dashboard</h1>
          <p className="page-sub">Manage landlord access, account lifecycles, and trusted platform administrators.</p></div>
      </header>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {notice && <p className="alert" role="status">{notice}</p>}

      <Glass className="superadmin-card">
        <div className="superadmin-card__heading"><div><h2>Landlord accounts</h2><p>Manage, activate, send password resets, or permanently remove landlord accounts.</p></div>
          <button className="btn btn--ghost" onClick={load} disabled={loading}>Refresh</button></div>
        {loading ? <p className="muted">Loading accounts…</p> : landlords.length === 0 ? <p className="muted">No landlord accounts found.</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Landlord</th><th>Properties</th><th>Tenants</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>{landlords.map((landlord) => <tr key={landlord.id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar user={landlord} />
                  <div>
                    <strong>{landlord.full_name}</strong>
                    <small style={{ display: 'block' }}>{landlord.email} · @{landlord.username}</small>
                  </div>
                </div>
              </td>
              <td>{landlord.property_count}</td><td>{landlord.tenant_count}</td>
              <td>{Number(landlord.is_active) ? 'Active' : 'Inactive'}</td>
              <td className="superadmin-actions">
                <button className="btn btn--ghost btn--sm" disabled={!!busy || !Number(landlord.is_active)} onClick={() => sendReset(landlord)}>
                  {busy === `reset-${landlord.id}` ? 'Sending…' : 'Send reset'}
                </button>
                <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => toggleAccount('landlord', landlord)}>
                  {busy === `landlord-${landlord.id}` ? 'Saving…' : Number(landlord.is_active) ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                  disabled={!!busy}
                  onClick={() => setDeleteTarget(landlord)}
                >
                  Delete
                </button>
              </td>
            </tr>)}</tbody></table></div>
        )}
      </Glass>

      <div className="superadmin-grid">
        <Glass className="superadmin-card">
          <h2>Create another superadmin</h2>
          <p>Only an active superadmin can create or deactivate platform administrators.</p>
          <form className="stack" onSubmit={createSuperadmin}>
            <Field label="Username"><input autoComplete="username" required minLength={3} maxLength={50} value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
            <Field label="Full name"><input autoComplete="name" required minLength={2} maxLength={120} value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
            <Field label="Email"><input type="email" autoComplete="email" required value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="Initial password"><PasswordInput autoComplete="new-password" required minLength={12} value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })} /><span className="field__hint">At least 12 characters with a letter and a number.</span></Field>
            <button className="btn btn--accent" disabled={!!busy}>{busy === 'create' ? 'Creating…' : 'Create superadmin'}</button>
          </form>
        </Glass>

        <Glass className="superadmin-card">
          <h2>Superadmin access</h2>
          {loading ? <p className="muted">Loading accounts…</p> : <ul className="superadmin-list">{superadmins.map((account) => (
            <li key={account.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar user={account} />
                <div>
                  <strong>{account.full_name}</strong>
                  <small style={{ display: 'block' }}>{account.email} · @{account.username}</small>
                  <small style={{ display: 'block' }}>{Number(account.is_active) ? 'Active' : 'Inactive'}</small>
                </div>
              </div>
              <button className="btn btn--ghost" disabled={!!busy} onClick={() => toggleAccount('superadmin', account)}>
                {busy === `superadmin-${account.id}` ? 'Saving…' : Number(account.is_active) ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}</ul>}
          <p className="field__hint">The system prevents deactivating the last active superadmin.</p>
        </Glass>
      </div>

      {deleteTarget && (
        <Modal title="Delete Landlord Account" onClose={() => !busy && setDeleteTarget(null)}>
          <div className="stack" style={{ gap: '16px', padding: '4px 0' }}>
            <p>
              Are you sure you want to permanently delete the landlord account for{' '}
              <strong>{deleteTarget.full_name || deleteTarget.username}</strong> (@{deleteTarget.username})?
            </p>

            <div style={{ background: 'var(--page-raised)', padding: '12px 16px', borderRadius: '8px', fontSize: '.9rem' }}>
              <div><strong>Email:</strong> {deleteTarget.email}</div>
              <div style={{ marginTop: '4px' }}>
                <strong>Properties:</strong> {deleteTarget.property_count} &nbsp;·&nbsp; <strong>Tenants:</strong> {deleteTarget.tenant_count}
              </div>
            </div>

            {(Number(deleteTarget.property_count) > 0 || Number(deleteTarget.tenant_count) > 0) ? (
              <div className="alert alert--error" style={{ margin: 0 }}>
                <strong><svg className="alert__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg> Warning:</strong> This landlord owns <strong>{deleteTarget.property_count}</strong> propert{Number(deleteTarget.property_count) === 1 ? 'y' : 'ies'} and <strong>{deleteTarget.tenant_count}</strong> tenant{Number(deleteTarget.tenant_count) === 1 ? '' : 's'}. Deleting this account will permanently delete all associated properties, units, leases, bills, maintenance requests, and tenant records.
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '.88rem', margin: 0 }}>
                This landlord has no active properties or tenants. Their account will be permanently removed.
              </p>
            )}

            <div className="modal__foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#b91c1c' }}
                onClick={confirmDelete}
                disabled={!!busy}
              >
                {busy === `delete-${deleteTarget.id}` ? 'Deleting…' : 'Delete landlord permanently'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
