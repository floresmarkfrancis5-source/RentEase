import { useCallback, useEffect, useState } from 'react'
import Glass from '../components/Glass'
import PasswordInput from '../components/PasswordInput'
import { Field } from '../components/ui'
import { api } from '../lib/api'

const emptyForm = { username: '', full_name: '', email: '', password: '' }

export default function SuperadminDashboard() {
  const [landlords, setLandlords] = useState([])
  const [superadmins, setSuperadmins] = useState([])
  const [form, setForm] = useState(emptyForm)
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
          <p className="page-sub">Manage landlord access and trusted platform administrators.</p></div>
      </header>
      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {notice && <p className="alert" role="status">{notice}</p>}

      <Glass className="superadmin-card">
        <div className="superadmin-card__heading"><div><h2>Landlord accounts</h2><p>Send a secure password reset link to the landlord’s registered email.</p></div>
          <button className="btn btn--ghost" onClick={load} disabled={loading}>Refresh</button></div>
        {loading ? <p className="muted">Loading accounts…</p> : landlords.length === 0 ? <p className="muted">No landlord accounts found.</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Landlord</th><th>Properties</th><th>Tenants</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>{landlords.map((landlord) => <tr key={landlord.id}>
              <td><strong>{landlord.full_name}</strong><small>{landlord.email} · @{landlord.username}</small></td>
              <td>{landlord.property_count}</td><td>{landlord.tenant_count}</td>
              <td>{Number(landlord.is_active) ? 'Active' : 'Inactive'}</td>
              <td className="superadmin-actions">
                <button className="btn btn--ghost" disabled={!!busy || !Number(landlord.is_active)} onClick={() => sendReset(landlord)}>
                  {busy === `reset-${landlord.id}` ? 'Sending…' : 'Send reset link'}
                </button>
                <button className="btn btn--ghost" disabled={!!busy} onClick={() => toggleAccount('landlord', landlord)}>
                  {busy === `landlord-${landlord.id}` ? 'Saving…' : Number(landlord.is_active) ? 'Deactivate' : 'Activate'}
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
            <li key={account.id}><div><strong>{account.full_name}</strong><small>{account.email} · @{account.username}</small><small>{Number(account.is_active) ? 'Active' : 'Inactive'}</small></div>
              <button className="btn btn--ghost" disabled={!!busy} onClick={() => toggleAccount('superadmin', account)}>
                {busy === `superadmin-${account.id}` ? 'Saving…' : Number(account.is_active) ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}</ul>}
          <p className="field__hint">The system prevents deactivating the last active superadmin.</p>
        </Glass>
      </div>
    </section>
  )
}
