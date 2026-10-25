import { useState } from 'react'
import Glass from '../../components/Glass'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'
import { Field } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const today = () => new Date().toISOString().slice(0, 10)
const normaliseProposal = (proposal) => ({
  property: {
    name: '', type: 'apartment', address: '', city: '', barangay: '', latitude: '', longitude: '', description: '',
    ...(proposal.property || {}),
  },
  units: (proposal.units || []).map((unit, index) => ({
    unit_name: `Unit ${index + 1}`, monthly_rent: '', capacity: 1, condition_tag: 'good_condition', ...unit,
  })),
  tenants: (proposal.tenants || []).map((tenant) => ({
    username: '', email: '', full_name: '', phone: '', start_date: today(),
    monthly_rent: '', deposit: 0, due_day: 5, ...tenant, unit_index: Number(tenant.unit_index || 0),
  })),
})

export default function Assistant() {
  const { updateUser } = useAuth()
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hi! Tell me about a rental property you want to add. I can draft the property, its units, and optional tenant leases. I will not save anything until you review and confirm it.' }])
  const [draft, setDraft] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState([])

  async function send(event) {
    event.preventDefault()
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    setText('')
    try {
      const result = await api('/api/admin/assistant/chat', {
        method: 'POST',
        auth: true,
        body: { message, history: messages.slice(-10) },
      })
      setMessages((current) => [
        ...current,
        { role: 'user', content: message },
        { role: 'assistant', content: result.data.reply },
      ])
      setDraft(result.data.proposal ? normaliseProposal(result.data.proposal) : null)
    } catch (err) {
      setText(message)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function updateProperty(patch) {
    setDraft((current) => ({ ...current, property: { ...current.property, ...patch } }))
  }

  function updateUnit(index, patch) {
    setDraft((current) => ({ ...current, units: current.units.map((unit, i) => i === index ? { ...unit, ...patch } : unit) }))
  }

  function updateTenant(index, patch) {
    setDraft((current) => ({ ...current, tenants: current.tenants.map((tenant, i) => i === index ? { ...tenant, ...patch } : tenant) }))
  }

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/admin/onboarding', { method: 'POST', auth: true, body: draft })
      updateUser({ onboarding_completed: true })
      setCredentials(result.tenant_credentials || [])
      setDraft(null)
      setMessages((current) => [...current, { role: 'assistant', content: result.message }])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="assistant-page">
      <header className="pagehead">
        <div><p className="eyebrow">RentEase AI</p><h1 className="page-title">Rental setup assistant</h1>
          <p className="page-sub">Describe what you need in everyday language. Review every draft before it is saved.</p></div>
      </header>
      <Glass className="assistant-chat">
        <div className="assistant-chat__messages" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${index}-${message.role}`} className={`assistant-message assistant-message--${message.role}`}>
              <strong>{message.role === 'assistant' ? 'RentEase AI' : 'You'}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {busy && <p className="muted">Thinking…</p>}
        </div>
        <form className="assistant-chat__input" onSubmit={send}>
          <label className="sr-only" htmlFor="assistant-message">Message the RentEase assistant</label>
          <textarea id="assistant-message" rows={2} maxLength={4000} value={text} disabled={busy}
            placeholder="Example: Add my 6-unit boarding house in Calapan City…"
            onChange={(event) => setText(event.target.value)} />
          <button className="btn btn--accent" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </form>
        <p className="assistant-chat__notice">Do not share passwords or payment credentials. Gemini receives only the messages you send here; it cannot access your database.</p>
      </Glass>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {draft && (
        <Glass className="assistant-draft">
          <div className="assistant-draft__head">
            <div><p className="eyebrow">Review before saving</p><h2>Proposed rental setup</h2></div>
            <button className="btn btn--ghost" disabled={busy} onClick={() => setDraft(null)}>Discard draft</button>
          </div>
          <div className="stack">
            <h3>Property</h3>
            <div className="assistant-draft__grid">
              <Field label="Property name"><input value={draft.property.name} maxLength={120} onChange={(e) => updateProperty({ name: e.target.value })} /></Field>
              <Field label="Type"><select value={draft.property.type} onChange={(e) => updateProperty({ type: e.target.value })}><option value="apartment">Apartment</option><option value="boarding_house">Boarding house</option></select></Field>
              <Field label="Street address"><input value={draft.property.address} maxLength={255} onChange={(e) => updateProperty({ address: e.target.value })} /></Field>
              <Field label="Description"><input value={draft.property.description || ''} maxLength={2000} onChange={(e) => updateProperty({ description: e.target.value })} /></Field>
            </div>
            <PropertyLocationPicker address={draft.property.address} city={draft.property.city} barangay={draft.property.barangay}
              latitude={draft.property.latitude} longitude={draft.property.longitude} onChange={updateProperty} />
            <h3>Units ({draft.units.length})</h3>
            {draft.units.map((unit, index) => (
              <div className="assistant-draft__row" key={index}>
                <Field label="Unit name"><input value={unit.unit_name} onChange={(e) => updateUnit(index, { unit_name: e.target.value })} /></Field>
                <Field label="Monthly rent"><input type="number" min="1" step="0.01" value={unit.monthly_rent} onChange={(e) => updateUnit(index, { monthly_rent: e.target.value })} /></Field>
                <Field label="Condition"><select value={unit.condition_tag} onChange={(e) => updateUnit(index, { condition_tag: e.target.value })}><option value="good_condition">Good condition</option><option value="under_maintenance">Under maintenance</option></select></Field>
              </div>
            ))}
            {draft.tenants.length > 0 && <>
              <h3>Tenants and leases ({draft.tenants.length})</h3>
              {draft.tenants.map((tenant, index) => (
                <div className="assistant-draft__row assistant-draft__row--tenant" key={index}>
                  <Field label="Username"><input value={tenant.username} onChange={(e) => updateTenant(index, { username: e.target.value })} /></Field>
                  <Field label="Full name"><input value={tenant.full_name} onChange={(e) => updateTenant(index, { full_name: e.target.value })} /></Field>
                  <Field label="Email"><input type="email" value={tenant.email} onChange={(e) => updateTenant(index, { email: e.target.value })} /></Field>
                  <Field label="Unit"><select value={tenant.unit_index} onChange={(e) => updateTenant(index, { unit_index: Number(e.target.value) })}>
                    {draft.units.map((unit, unitIndex) => <option key={unitIndex} value={unitIndex}>{unit.unit_name}</option>)}
                  </select></Field>
                  <Field label="Start date"><input type="date" value={tenant.start_date} onChange={(e) => updateTenant(index, { start_date: e.target.value })} /></Field>
                  <Field label="Rent override (optional)"><input type="number" min="1" step="0.01" value={tenant.monthly_rent ?? ''} onChange={(e) => updateTenant(index, { monthly_rent: e.target.value })} /></Field>
                </div>
              ))}
            </>}
          </div>
          <div className="assistant-draft__confirm">
            <p>{draft.property.name || 'Unnamed property'} · {draft.units.length} units · {draft.tenants.length} tenant leases</p>
            <button className="btn btn--accent" disabled={busy || !draft.units.length} onClick={confirm}>Confirm and create</button>
          </div>
        </Glass>
      )}

      {!!credentials.length && (
        <Glass className="assistant-draft">
          <h2>Tenant temporary passwords</h2>
          <p>Copy these now and share them privately. They are shown only once.</p>
          {credentials.map((credential) => <p className="assistant-credential" key={credential.email}>
            <strong>{credential.full_name || credential.username}</strong> · {credential.username} · {credential.email} · <code>{credential.temporary_password}</code>
          </p>)}
          <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(credentials.map((c) => `${c.username} ${c.email} ${c.temporary_password}`).join('\n'))}>Copy credentials</button>
        </Glass>
      )}
    </section>
  )
}
