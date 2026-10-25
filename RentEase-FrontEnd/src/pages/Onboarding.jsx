import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Glass from '../components/Glass'
import { Field } from '../components/ui'
import PropertyLocationPicker from '../components/PropertyLocationPicker'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const today = () => new Date().toISOString().slice(0, 10)
const blankTenant = (unitIndex = 0) => ({
  username: '', email: '', full_name: '', phone: '', unit_index: String(unitIndex),
  start_date: today(), monthly_rent: '', deposit: '0', due_day: '5',
})

export default function Onboarding() {
  const { updateUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tenantCredentials, setTenantCredentials] = useState(null)
  const [property, setProperty] = useState({
    name: '', type: 'apartment', address: '', city: '', barangay: '',
    latitude: '', longitude: '', description: '',
  })
  const [units, setUnits] = useState([{ unit_name: 'Unit 1', monthly_rent: '6500', capacity: '1', condition_tag: 'good_condition' }])
  const [addTenants, setAddTenants] = useState(false)
  const [tenants, setTenants] = useState([blankTenant()])

  const unitMinimum = tenants.reduce((n, tenant) => Math.max(n, Number(tenant.unit_index) + 1), 1)
  const eligibleUnits = units.map((unit, index) => ({ ...unit, index }))
    .filter((unit) => unit.condition_tag === 'good_condition')

  function resizeUnits(rawCount) {
    const count = Math.max(unitMinimum, Math.min(100, Number(rawCount) || 1))
    setUnits((current) => Array.from({ length: count }, (_, index) => current[index] || ({
      unit_name: `Unit ${index + 1}`, monthly_rent: '6500', capacity: '1', condition_tag: 'good_condition',
    })))
  }

  function updateTenant(index, patch) {
    setTenants((current) => current.map((tenant, i) => i === index ? { ...tenant, ...patch } : tenant))
  }

  function next() {
    setError('')
    if (step === 0 && (!property.name.trim() || !property.address.trim())) {
      setError('Enter a property name and street address before continuing.')
      return
    }
    if (step === 1 && units.some((unit) => !unit.unit_name.trim() || Number(unit.monthly_rent) <= 0)) {
      setError('Each unit needs a name and a monthly rent greater than zero.')
      return
    }
    if (step === 2 && addTenants) {
      if (tenants.some((tenant) => !tenant.username.trim() || !tenant.email.trim() || !tenant.full_name.trim())) {
        setError('Complete each tenant’s username, email, and full name, or remove the tenant from setup.')
        return
      }
      if (new Set(tenants.map((tenant) => tenant.unit_index)).size !== tenants.length) {
        setError('Assign each tenant to a different unit.')
        return
      }
      if (tenants.some((tenant) => units[Number(tenant.unit_index)]?.condition_tag !== 'good_condition')) {
        setError('Tenants can only be assigned to units in good condition.')
        return
      }
    }
    setStep((current) => Math.min(current + 1, 3))
  }

  async function skip() {
    setBusy(true)
    setError('')
    try {
      await api('/api/admin/onboarding/skip', { method: 'POST', auth: true, body: {} })
      updateUser({ onboarding_completed: true })
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/admin/onboarding', {
        method: 'POST',
        auth: true,
        body: {
          property,
          units,
          tenants: addTenants ? tenants.map((tenant) => ({ ...tenant, unit_index: Number(tenant.unit_index) })) : [],
        },
      })
      updateUser({ onboarding_completed: true })
      if (result.tenant_credentials?.length) setTenantCredentials(result.tenant_credentials)
      else navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function done() {
    setTenantCredentials(null)
    navigate('/admin', { replace: true })
  }

  return (
    <section className="onboarding">
      <div className="onboarding__top">
        <div>
          <p className="eyebrow">First-time setup</p>
          <h1 className="page-title">Let’s get your rental started.</h1>
          <p className="page-sub">A few steps to add a property. You can skip this and manage everything manually later.</p>
        </div>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={skip}>Skip setup</button>
      </div>
      <Glass className="onboarding__card">
        <div className="onboarding__steps" aria-label="Setup steps">
          {['Property', 'Units', 'Tenants', 'Review'].map((label, index) => (
            <span key={label} className={index === step ? 'onboarding__step is-active' : index < step ? 'onboarding__step is-done' : 'onboarding__step'}>
              <b>{index + 1}</b> {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="stack">
            <h2>Your property</h2>
            <Field label="Property name">
              <input value={property.name} maxLength={120} onChange={(event) => setProperty({ ...property, name: event.target.value })} />
            </Field>
            <Field label="Property type">
              <select value={property.type} onChange={(event) => setProperty({ ...property, type: event.target.value })}>
                <option value="apartment">Apartment</option><option value="boarding_house">Boarding house</option>
              </select>
            </Field>
            <Field label="Street / house number / building">
              <input value={property.address} maxLength={255} placeholder="House number, street, or building"
                onChange={(event) => setProperty({ ...property, address: event.target.value })} />
            </Field>
            <PropertyLocationPicker address={property.address} city={property.city} barangay={property.barangay}
              latitude={property.latitude} longitude={property.longitude} onChange={(patch) => setProperty((current) => ({ ...current, ...patch }))} />
            <Field label="Description (optional)">
              <textarea rows={3} value={property.description} onChange={(event) => setProperty({ ...property, description: event.target.value })} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h2>How many units do you have?</h2>
            <Field label="Number of units">
              <input type="number" min={unitMinimum} max={100} value={units.length} onChange={(event) => resizeUnits(event.target.value)} />
            </Field>
            {units.map((unit, index) => (
              <div className="onboarding__unit" key={index}>
                <h3>Unit {index + 1}</h3>
                <div className="onboarding__grid">
                  <Field label="Unit name">
                    <input maxLength={50} value={unit.unit_name} onChange={(event) => setUnits((current) => current.map((item, i) => i === index ? { ...item, unit_name: event.target.value } : item))} />
                  </Field>
                  <Field label="Monthly rent (PHP)">
                    <input type="number" min="1" step="0.01" value={unit.monthly_rent} onChange={(event) => setUnits((current) => current.map((item, i) => i === index ? { ...item, monthly_rent: event.target.value } : item))} />
                  </Field>
                  <Field label="Capacity">
                    <input type="number" min="1" max="50" value={unit.capacity} onChange={(event) => setUnits((current) => current.map((item, i) => i === index ? { ...item, capacity: event.target.value } : item))} />
                  </Field>
                  <Field label="Condition">
                    <select value={unit.condition_tag} onChange={(event) => setUnits((current) => current.map((item, i) => i === index ? { ...item, condition_tag: event.target.value } : item))}>
                      <option value="good_condition">Good condition</option><option value="under_maintenance">Under maintenance</option>
                    </select>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h2>Do you already have tenants?</h2>
            <div className="onboarding__choice">
              <button type="button" className={addTenants ? 'btn btn--accent' : 'btn btn--ghost'} onClick={() => setAddTenants(true)}>Yes, add tenant accounts</button>
              <button type="button" className={!addTenants ? 'btn btn--accent' : 'btn btn--ghost'} onClick={() => setAddTenants(false)}>Not yet, I’ll do this later</button>
            </div>
            {addTenants && tenants.map((tenant, index) => (
              <div className="onboarding__unit" key={index}>
                <div className="onboarding__tenant-head">
                  <h3>Tenant {index + 1}</h3>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTenants((current) => current.filter((_, i) => i !== index))}>Remove</button>
                </div>
                <div className="onboarding__grid">
                  <Field label="Username"><input maxLength={50} value={tenant.username} onChange={(event) => updateTenant(index, { username: event.target.value })} /></Field>
                  <Field label="Full name"><input maxLength={120} value={tenant.full_name} onChange={(event) => updateTenant(index, { full_name: event.target.value })} /></Field>
                  <Field label="Email"><input type="email" maxLength={255} value={tenant.email} onChange={(event) => updateTenant(index, { email: event.target.value })} /></Field>
                  <Field label="Phone (optional)"><input type="tel" maxLength={30} value={tenant.phone} onChange={(event) => updateTenant(index, { phone: event.target.value })} /></Field>
                  <Field label="Assign unit">
                    <select value={tenant.unit_index} onChange={(event) => updateTenant(index, { unit_index: event.target.value })}>
                      {eligibleUnits.map((unit) => <option key={unit.index} value={unit.index}>{unit.unit_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Lease start date"><input type="date" value={tenant.start_date} onChange={(event) => updateTenant(index, { start_date: event.target.value })} /></Field>
                  <Field label="Monthly rent override (optional)"><input type="number" min="1" step="0.01" value={tenant.monthly_rent} onChange={(event) => updateTenant(index, { monthly_rent: event.target.value })} /></Field>
                  <Field label="Deposit"><input type="number" min="0" step="0.01" value={tenant.deposit} onChange={(event) => updateTenant(index, { deposit: event.target.value })} /></Field>
                  <Field label="Due day (1–28)"><input type="number" min="1" max="28" value={tenant.due_day} onChange={(event) => updateTenant(index, { due_day: event.target.value })} /></Field>
                </div>
              </div>
            ))}
            {addTenants && eligibleUnits.length > tenants.length && (
              <button type="button" className="btn btn--ghost" onClick={() => setTenants((current) => [...current, blankTenant(eligibleUnits.find((unit) => !current.some((tenant) => Number(tenant.unit_index) === unit.index))?.index ?? 0)])}>
                + Add another tenant
              </button>
            )}
            {addTenants && eligibleUnits.length === 0 && <p className="alert">Mark at least one unit as good condition before assigning tenants.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h2>Review your setup</h2>
            <p><strong>{property.name}</strong> · {property.type.replace('_', ' ')}</p>
            <p>{[property.address, property.barangay, property.city].filter(Boolean).join(', ')}</p>
            <h3>{units.length} unit{units.length === 1 ? '' : 's'}</h3>
            <ul>{units.map((unit, index) => <li key={index}>{unit.unit_name} · PHP {Number(unit.monthly_rent).toLocaleString()} · {unit.condition_tag.replace('_', ' ')}</li>)}</ul>
            <h3>{addTenants ? `${tenants.length} tenant account${tenants.length === 1 ? '' : 's'} and lease${tenants.length === 1 ? '' : 's'}` : 'No tenants yet'}</h3>
            {addTenants && <ul>{tenants.map((tenant, index) => <li key={index}>{tenant.full_name} → {units[Number(tenant.unit_index)]?.unit_name}</li>)}</ul>}
            {addTenants && <p className="muted">Temporary tenant passwords will be shown once after setup. Copy them and share them privately.</p>}
          </div>
        )}

        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="onboarding__actions">
          <button type="button" className="btn btn--ghost" disabled={busy || step === 0} onClick={() => { setError(''); setStep((current) => current - 1) }}>Back</button>
          {step < 3
            ? <button type="button" className="btn btn--accent" disabled={busy} onClick={next}>Continue</button>
            : <button type="button" className="btn btn--accent" disabled={busy} onClick={save}>{busy ? 'Saving setup…' : 'Create my rental setup'}</button>}
        </div>
      </Glass>

      {tenantCredentials && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Tenant temporary passwords">
          <Glass className="modal__card">
            <div className="modal__head"><h2>Setup complete</h2></div>
            <p>Copy each temporary password now. Tenants must change it when they first sign in.</p>
            {tenantCredentials.map((credential) => (
              <div className="secret" key={credential.email}>
                <span>Username</span><code>{credential.username}</code>
                <span>Email</span><code>{credential.email}</code>
                <span>Temporary password</span><code>{credential.temporary_password}</code>
              </div>
            ))}
            <div className="modal__foot">
              <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(tenantCredentials.map((c) => `${c.username} (${c.email}): ${c.temporary_password}`).join('\n'))}>Copy credentials</button>
              <button className="btn btn--accent" onClick={done}>Go to dashboard</button>
            </div>
          </Glass>
        </div>
      )}
    </section>
  )
}
