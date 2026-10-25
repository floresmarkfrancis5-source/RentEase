import { useEffect, useState } from 'react'
import Glass from '../../components/Glass'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'
import { Field } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

const today = () => new Date().toISOString().slice(0, 10)
const INTRO_MESSAGE = 'Hi! Tell me about a rental property you want to add. I can draft the property, its units, and optional tenant leases. I will not save anything until you review and confirm it.'
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
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState([])

  useEffect(() => {
    let cancelled = false
    async function initialise() {
      try {
        const result = await api('/api/admin/assistant/conversations', { auth: true })
        if (cancelled) return
        const items = result.data || []
        setConversations(items)
        if (items.length) {
          await loadConversation(items[0].id, () => cancelled)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingConversations(false)
      }
    }
    initialise()
    return () => { cancelled = true }
  }, [])

  async function loadConversation(id, isCancelled = () => false) {
    const result = await api(`/api/admin/assistant/conversations/${id}`, { auth: true })
    if (isCancelled()) return
    const conversation = result.data
    setConversationId(conversation.id)
    setMessages(conversation.messages || [])
    const lastAssistantMessage = [...(conversation.messages || [])].reverse().find((item) => item.role === 'assistant')
    setDraft(lastAssistantMessage?.proposal ? normaliseProposal(lastAssistantMessage.proposal) : null)
    setText('')
    setEditingMessageId(null)
    setCredentials([])
    setError('')
    return conversation
  }

  async function createConversation(isCancelled = () => false) {
    const result = await api('/api/admin/assistant/conversations', { method: 'POST', auth: true })
    if (isCancelled()) return
    setConversationId(result.data.id)
    setMessages([])
    setDraft(null)
    setText('')
    setEditingMessageId(null)
    setCredentials([])
    setError('')
    setConversations((items) => [result.data, ...items])
  }

  async function startNewConversation() {
    setBusy(true)
    setError('')
    try {
      await createConversation()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function refreshConversations() {
    const result = await api('/api/admin/assistant/conversations', { auth: true })
    setConversations(result.data || [])
  }

  async function send(event) {
    event.preventDefault()
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    setText('')
    let activeId = conversationId
    try {
      if (!activeId) {
        const created = await api('/api/admin/assistant/conversations', { method: 'POST', auth: true })
        activeId = created.data.id
        setConversationId(activeId)
        setConversations((items) => [created.data, ...items])
      }
      const previousMessages = messages
      const editedIndex = editingMessageId === null
        ? -1
        : previousMessages.findIndex((item) => Number(item.id) === Number(editingMessageId))
      const result = await api('/api/admin/assistant/chat', {
        method: 'POST',
        auth: true,
        body: {
          message,
          conversation_id: activeId,
          ...(editingMessageId !== null ? { edit_message_id: editingMessageId } : {}),
        },
      })
      const pair = [
        { id: result.data.user_message_id, role: 'user', content: message },
        { id: result.data.assistant_message_id, role: 'assistant', content: result.data.reply, proposal: result.data.proposal },
      ]
      setConversationId(result.data.conversation_id)
      setMessages((current) => (editedIndex >= 0 ? current.slice(0, editedIndex) : current).concat(pair))
      setDraft(result.data.proposal ? normaliseProposal(result.data.proposal) : null)
      setEditingMessageId(null)
      await refreshConversations()
    } catch (err) {
      setError(err.message)
      if (activeId) {
        try {
          const savedConversation = await loadConversation(activeId)
          const lastMessage = savedConversation.messages?.[savedConversation.messages.length - 1]
          if (lastMessage?.role === 'user' && lastMessage.content === message) {
            setEditingMessageId(lastMessage.id)
          }
          await refreshConversations()
        } catch (loadError) {
          setError(`${err.message} ${loadError.message}`)
        }
      }
      setText(message)
    } finally {
      setBusy(false)
    }
  }

  function editMessage(message) {
    setEditingMessageId(message.id)
    setText(message.content)
    setDraft(null)
    setError('')
  }

  async function copyMessage(content) {
    try {
      await navigator.clipboard.writeText(content)
      setError('')
    } catch {
      setError('Could not copy the message. Check clipboard permissions and try again.')
    }
  }

  async function deleteConversation(id) {
    if (!window.confirm('Delete this conversation and all its messages? This cannot be undone.')) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/assistant/conversations/${id}`, { method: 'DELETE', auth: true })
      const remaining = conversations.filter((item) => Number(item.id) !== Number(id))
      setConversations(remaining)
      if (Number(conversationId) === Number(id)) {
        if (remaining.length) await loadConversation(remaining[0].id)
        else {
          setConversationId(null)
          setMessages([])
          setDraft(null)
          setText('')
          setEditingMessageId(null)
          setCredentials([])
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function selectConversation(id) {
    if (busy || Number(conversationId) === Number(id)) return
    setBusy(true)
    setError('')
    try {
      await loadConversation(id)
    } catch (err) {
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
      try {
        await api(`/api/admin/assistant/conversations/${conversationId}/confirmation`, {
          method: 'POST', auth: true, body: { message: result.message },
        })
        const conversation = await api(`/api/admin/assistant/conversations/${conversationId}`, { auth: true })
        setMessages(conversation.data.messages || [])
        await refreshConversations()
      } catch (historyError) {
        setError(`Your rental setup was created, but its confirmation could not be saved to this conversation: ${historyError.message}`)
      }
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
          <p className="page-sub">Your conversations are saved to your account. Review every draft before it is saved.</p></div>
      </header>
      <div className="assistant-workspace">
        <Glass className="assistant-history">
          <div className="assistant-history__head">
            <h2>Conversations</h2>
            <button className="btn btn--accent" type="button" disabled={busy || loadingConversations} onClick={startNewConversation}>New chat</button>
          </div>
          {loadingConversations ? <p className="muted">Loading saved conversations…</p> : (
            <ul className="assistant-history__list">
              {conversations.map((conversation) => (
                <li key={conversation.id} className={Number(conversation.id) === Number(conversationId) ? 'is-active' : ''}>
                  <button className="assistant-history__select" type="button" disabled={busy}
                    onClick={() => selectConversation(conversation.id)}>
                    <strong>{conversation.title || 'New conversation'}</strong>
                    <small>{new Date(String(conversation.updated_at).replace(' ', 'T')).toLocaleString()}</small>
                  </button>
                  <button className="assistant-history__delete" type="button" disabled={busy}
                    aria-label={`Delete ${conversation.title || 'conversation'}`}
                    onClick={() => deleteConversation(conversation.id)}>Delete</button>
                </li>
              ))}
              {!conversations.length && <li className="muted">No saved conversations yet.</li>}
            </ul>
          )}
        </Glass>

        <Glass className="assistant-chat">
          <div className="assistant-chat__messages" aria-live="polite">
            {(messages.length ? messages : [{ id: 'intro', role: 'assistant', content: INTRO_MESSAGE }]).map((message) => (
              <div key={message.id} className={`assistant-message assistant-message--${message.role}`}>
                <strong>{message.role === 'assistant' ? 'RentEase AI' : 'You'}</strong>
                <p>{message.content}</p>
                <div className="assistant-message__actions">
                  <button className="btn btn--ghost" type="button" onClick={() => copyMessage(message.content)}>Copy</button>
                  {message.role === 'user' && (
                    <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => editMessage(message)}>Edit and retry</button>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="muted">Thinking…</p>}
          </div>
          <form className="assistant-chat__input" onSubmit={send}>
            <label className="sr-only" htmlFor="assistant-message">{editingMessageId === null ? 'Message the RentEase assistant' : 'Edit your message'}</label>
            <textarea id="assistant-message" rows={2} maxLength={4000} value={text} disabled={busy || loadingConversations}
              placeholder="Example: Add my 6-unit boarding house in Calapan City…"
              onChange={(event) => setText(event.target.value)} />
            <div className="assistant-chat__controls">
              {editingMessageId !== null && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => { setEditingMessageId(null); setText('') }}>Cancel edit</button>}
              <button className="btn btn--accent" disabled={busy || loadingConversations || !text.trim()}>{busy ? 'Sending…' : editingMessageId === null ? 'Send' : 'Save and retry'}</button>
            </div>
          </form>
          <p className="assistant-chat__notice">Do not share passwords or payment credentials. Gemini receives only the messages you send here; it cannot access your database.</p>
        </Glass>
      </div>

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
