import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Glass from '../components/Glass'
import { Field } from '../components/ui'
import PropertyLocationPicker from '../components/PropertyLocationPicker'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useSettings } from '../context/SettingsContext'
import { api } from '../lib/api'
import ContractTemplateEditor from '../components/ContractTemplateEditor'
import AssistantAvatar from '../components/AssistantAvatar'
import { billingStartDateError } from '../components/LeaseBillingFields'
import { DEFAULT_LEASE_TEMPLATE, annualEndDate, billingDefaultMoveInDate, defaultMoveInDate, parseLeaseTemplate } from '../lib/leaseContract'

const blankTenant = (unitIndex = 0, unit = {}, billingStyle = 'calendar', billingDueDay = '1') => {
  const start_date = billingDefaultMoveInDate(billingStyle)
  return {
    username: '', email: '', full_name: '', phone: '', unit_index: String(unitIndex),
    start_date, end_date: annualEndDate(start_date), monthly_rent: '',
    deposit: unit.default_deposit ?? '0', due_day: billingDueDay,
  }
}

export default function Onboarding() {
  const { t } = useLanguage()
  const { saved: settings, commit } = useSettings()
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tenantCredentials, setTenantCredentials] = useState(null)
  const [property, setProperty] = useState({
    name: '', type: 'apartment', address: '', city: '', barangay: '',
    latitude: '', longitude: '', description: '', contract_template: parseLeaseTemplate(DEFAULT_LEASE_TEMPLATE),
  })
  const [unitNaming, setUnitNaming] = useState({ prefix: 'Unit', startNumber: '101' })
  const [units, setUnits] = useState([{ unit_name: 'Unit 101', monthly_rent: '', default_deposit: '0', default_due_day: '5', capacity: '1', condition_tag: 'good_condition' }])
  const [addTenants, setAddTenants] = useState(false)
  const [tenants, setTenants] = useState([])
  const [paymentMethods, setPaymentMethods] = useState(['gcash', 'paymaya'])
  const [paymentMethodsTouched, setPaymentMethodsTouched] = useState(false)

  useEffect(() => {
    if (!paymentMethodsTouched) {
      setPaymentMethods(String(settings.payment_methods || 'gcash,paymaya').split(',').filter(Boolean))
    }
  }, [settings.payment_methods, paymentMethodsTouched])

  const unitMinimum = tenants.reduce((n, tenant) => Math.max(n, Number(tenant.unit_index) + 1), 1)
  const eligibleUnits = units.map((unit, index) => ({ ...unit, index }))
    .filter((unit) => unit.condition_tag === 'good_condition')

  function addTenantForUnit(unitIndex) {
    return blankTenant(unitIndex, units[unitIndex], settings.billing_style, settings.billing_due_day)
  }

  function resizeUnits(rawCount) {
    const count = Math.max(unitMinimum, Math.min(100, Number(rawCount) || 1))
    setUnits((current) => Array.from({ length: count }, (_, index) => current[index] || ({
      unit_name: `${unitNaming.prefix.trim() || 'Unit'} ${Number(unitNaming.startNumber) + index}`,
      monthly_rent: current[0]?.monthly_rent ?? '',
      capacity: '1', condition_tag: 'good_condition',
      default_deposit: '0', default_due_day: '5',
    })))
  }

  function updateUnitNaming(patch) {
    const next = { ...unitNaming, ...patch }
    const currentPrefix = unitNaming.prefix.trim() || 'Unit'
    const nextPrefix = next.prefix.trim() || 'Unit'
    const currentStart = Number(unitNaming.startNumber)
    const nextStart = Number(next.startNumber)
    setUnits((existing) => existing.map((unit, index) => {
      const generatedName = `${currentPrefix} ${currentStart + index}`
      return unit.unit_name === generatedName
        ? { ...unit, unit_name: `${nextPrefix} ${nextStart + index}` }
        : unit
    }))
    setUnitNaming(next)
  }

  function updateUnit(index, patch) {
    setUnits((current) => current.map((unit, unitIndex) => {
      if (unitIndex === index) return { ...unit, ...patch }
      if (index === 0 && patch.monthly_rent !== undefined
        && (unit.monthly_rent === current[0].monthly_rent || !unit.monthly_rent)) {
        return { ...unit, monthly_rent: patch.monthly_rent }
      }
      return unit
    }))
  }

  function updateTenant(index, patch) {
    setTenants((current) => current.map((tenant, i) => {
      if (i !== index) return tenant
      const next = { ...tenant, ...patch }
      if (patch.start_date) next.end_date = annualEndDate(patch.start_date)
      if (patch.unit_index !== undefined) {
        const unit = units[Number(patch.unit_index)]
        next.deposit = unit?.default_deposit ?? '0'
        next.due_day = settings.billing_due_day
      }

      return next
    }))
  }

  function next() {
    setError('')
    if (step === 0 && (!property.name.trim() || !property.address.trim())) {
      setError(t('Enter a property name and street address before continuing.'))
      return
    }
    if (step === 1) {
      if (!Number.isInteger(Number(unitNaming.startNumber)) || Number(unitNaming.startNumber) < 1
        || Number(unitNaming.startNumber) + units.length - 1 > 99999999) {
        setError(t('Enter a valid starting number for your units.'))
        return
      }
      if (units.some((unit) => !unit.unit_name.trim() || !Number.isFinite(Number(unit.monthly_rent)) || Number(unit.monthly_rent) <= 0)) {
        setError(t('Each unit needs a name and a monthly rent greater than zero.'))
        return
      }
      if (new Set(units.map((unit) => unit.unit_name.trim().toLocaleLowerCase())).size !== units.length) {
        setError(t('Each unit must have a unique name.'))
        return
      }
    }
    if (step === 2 && addTenants) {
      if (tenants.some((tenant) => !tenant.username.trim() || !tenant.email.trim() || !tenant.full_name.trim())) {
        setError(t('Complete each tenant’s username, email, and full name, or remove the tenant from setup.'))
        return
      }
      if (new Set(tenants.map((tenant) => tenant.unit_index)).size !== tenants.length) {
        setError(t('Assign each tenant to a different unit.'))
        return
      }
      if (tenants.some((tenant) => units[Number(tenant.unit_index)]?.condition_tag !== 'good_condition')) {
        setError(t('Tenants can only be assigned to units in good condition.'))
        return
      }
      if (tenants.some((tenant) => billingStartDateError(tenant.start_date, settings.billing_style))) {
        setError(t('Move-in dates must match your saved rent billing schedule.'))
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
      const settingsResult = await api('/api/admin/settings', {
        method: 'PUT',
        auth: true,
        body: { payment_methods: paymentMethods },
      })
      commit(settingsResult.data)
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
    <section className="onboarding onboarding--welcome">
      <div className="onboarding__top">
        <div>
          <p className="eyebrow">{t('Your RentEase setup')}</p>
          <h1 className="page-title">{t('Let’s get your rental started.')}</h1>
          <p className="page-sub">{t('A few simple steps to bring your rental into one place. You can change these details later.')}</p>
        </div>
        <div className="onboarding__welcome-side">
          <div className="onboarding__guide" role="note">
            <AssistantAvatar thinking={busy} className="assistant-avatar--onboarding" />
            <div>
              <strong>{busy ? t('Setting things up') : t('Your setup guide')}</strong>
              <p>{busy ? t('Creating your rental workspace…') : t('We’ll take this one step at a time. It only takes a few minutes.')}</p>
            </div>
          </div>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={skip}>{t('Skip setup')}</button>
        </div>
      </div>
      <Glass className="onboarding__card">
        <div className="onboarding__steps" aria-label={t('Setup steps')}>
          {['Property', 'Units', 'Tenants', 'Payment & review'].map((label, index) => (
            <span key={label} aria-current={index === step ? 'step' : undefined}
              className={index === step ? 'onboarding__step is-active' : index < step ? 'onboarding__step is-done' : 'onboarding__step'}>
              <b>{index < step ? '✓' : index + 1}</b> {t(label)}
            </span>
          ))}
        </div>
        <div className="onboarding__progress" role="progressbar" aria-label={t('Setup progress')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(((step + 1) / 4) * 100)}>
          <span style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </div>

        {step === 0 && (
          <div className="stack">
            <h2>{t('Your property')}</h2>
            <Field label="Property name">
              <input value={property.name} maxLength={120} onChange={(event) => setProperty({ ...property, name: event.target.value })} />
            </Field>
            <Field label="Property type">
              <select value={property.type} onChange={(event) => setProperty({ ...property, type: event.target.value })}>
                <option value="apartment">{t('Apartment')}</option><option value="boarding_house">{t('Boarding House')}</option>
              </select>
            </Field>
            <Field label="Street / house number / building">
              <input value={property.address} maxLength={255} placeholder={t('House number, street, or building')}
                onChange={(event) => setProperty({ ...property, address: event.target.value })} />
            </Field>
            <PropertyLocationPicker address={property.address} city={property.city} barangay={property.barangay}
              latitude={property.latitude} longitude={property.longitude} onChange={(patch) => setProperty((current) => ({ ...current, ...patch }))} />
            <Field label="Description (optional)">
              <textarea rows={3} value={property.description} onChange={(event) => setProperty({ ...property, description: event.target.value })} />
            </Field>
            <ContractTemplateEditor value={property.contract_template}
              onChange={(contract_template) => setProperty((current) => ({ ...current, contract_template }))} />
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h2>{t('How many units do you have?')}</h2>
            <Field label="Number of units">
              <input type="number" min={unitMinimum} max={100} value={units.length} onChange={(event) => resizeUnits(event.target.value)} />
            </Field>
            <div className="onboarding__grid">
              <Field label="Unit name prefix" hint="Names are numbered automatically; you can edit any unit name below.">
                <input maxLength={40} value={unitNaming.prefix}
                  onChange={(event) => updateUnitNaming({ prefix: event.target.value })} />
              </Field>
              <Field label="Starting number">
                <input type="number" min="1" max="99999999" value={unitNaming.startNumber}
                  onChange={(event) => updateUnitNaming({ startNumber: event.target.value })} />
              </Field>
            </div>
            {units.map((unit, index) => (
              <div className="onboarding__unit" key={index}>
                <h3>{unit.unit_name}</h3>
                <div className="onboarding__grid">
                  <Field label="Unit name">
                    <input maxLength={50} value={unit.unit_name} onChange={(event) => updateUnit(index, { unit_name: event.target.value })} />
                  </Field>
                  <Field label="Monthly rent (PHP)">
                    <input type="number" min="1" step="0.01" value={unit.monthly_rent} onChange={(event) => updateUnit(index, { monthly_rent: event.target.value })} />
                  </Field>
                  <Field label="Default security deposit (PHP)">
                    <input type="number" min="0" step="0.01" value={unit.default_deposit} onChange={(event) => updateUnit(index, { default_deposit: event.target.value })} />
                  </Field>
                  <Field label="Default rent due day (1–28)">
                    <input type="number" min="1" max="28" value={unit.default_due_day} onChange={(event) => updateUnit(index, { default_due_day: event.target.value })} />
                  </Field>
                  <Field label="Capacity">
                    <input type="number" min="1" max="50" value={unit.capacity} onChange={(event) => updateUnit(index, { capacity: event.target.value })} />
                  </Field>
                  <Field label="Condition">
                    <select value={unit.condition_tag} onChange={(event) => updateUnit(index, { condition_tag: event.target.value })}>
                      <option value="good_condition">{t('Good condition')}</option><option value="under_maintenance">{t('Under maintenance')}</option>
                    </select>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h2>{t('Do you already have tenants?')}</h2>
            <div className="onboarding__choice">
              <button type="button" className={addTenants ? 'btn btn--accent' : 'btn btn--ghost'} onClick={() => {
                setAddTenants(true)
                setTenants((current) => current.length ? current : [addTenantForUnit(eligibleUnits[0]?.index ?? 0)])
              }}>{t('Yes, add tenant accounts')}</button>
              <button type="button" className={!addTenants ? 'btn btn--accent' : 'btn btn--ghost'} onClick={() => setAddTenants(false)}>{t('Not yet, I’ll do this later')}</button>
            </div>
            {addTenants && tenants.map((tenant, index) => (
              <div className="onboarding__unit" key={index}>
                <div className="onboarding__tenant-head">
                  <h3>Tenant {index + 1}</h3>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTenants((current) => current.filter((_, i) => i !== index))}>{t('Remove')}</button>
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
                  <Field label="Move-in date (defaults to 5 days from now)"><input type="date" min={defaultMoveInDate(parseLeaseTemplate(property.contract_template).enabled ? 1 : 0)} value={tenant.start_date} onChange={(event) => updateTenant(index, { start_date: event.target.value })} /></Field>
                  <Field label="Annual lease ends"><input type="date" value={tenant.end_date} readOnly /></Field>
                  <Field label="Monthly rent override (optional)"><input type="number" min="1" step="0.01" value={tenant.monthly_rent} onChange={(event) => updateTenant(index, { monthly_rent: event.target.value })} /></Field>
                  <Field label="Deposit (unit default)"><input type="number" min="0" step="0.01" value={tenant.deposit} onChange={(event) => updateTenant(index, { deposit: event.target.value })} /></Field>
                  <Field label="Rent due day (landlord default)"><input type="number" min="1" max="28" value={tenant.due_day} onChange={(event) => updateTenant(index, { due_day: event.target.value })} /></Field>
                </div>
              </div>
            ))}
            {addTenants && eligibleUnits.length > tenants.length && (
              <button type="button" className="btn btn--ghost" onClick={() => setTenants((current) => {
                const unitIndex = eligibleUnits.find((unit) => !current.some((tenant) => Number(tenant.unit_index) === unit.index))?.index ?? 0
                return [...current, addTenantForUnit(unitIndex)]
              })}>
                + {t('Add another tenant')}
              </button>
            )}
            {addTenants && eligibleUnits.length === 0 && <p className="alert">{t('Mark at least one unit as good condition before assigning tenants.')}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h2>{t('Review your setup')}</h2>
            <p><strong>{property.name}</strong> · {t(property.type === 'apartment' ? 'Apartment' : 'Boarding House')}</p>
            <p>{[property.address, property.barangay, property.city].filter(Boolean).join(', ')}</p>
            <h3>{units.length} {t('units')}</h3>
            <ul>{units.map((unit, index) => <li key={index}>{unit.unit_name} · PHP {Number(unit.monthly_rent).toLocaleString()} · {t(unit.condition_tag === 'good_condition' ? 'Good condition' : 'Under maintenance')}</li>)}</ul>
            <h3>{addTenants ? `${tenants.length} ${t('tenant accounts and leases')}` : t('No tenants yet')}</h3>
            {addTenants && <ul>{tenants.map((tenant, index) => <li key={index}>{tenant.full_name} → {units[Number(tenant.unit_index)]?.unit_name}</li>)}</ul>}
            {addTenants && <p className="muted">{t('Temporary tenant passwords will be shown once after setup. Copy them and share them privately.')}</p>}
            <div className="panel stack">
              <h3>{t('Payment setup')}</h3>
              <p className="muted">{t('Tenants will see your account contact details and the payment methods you select.')}</p>
              <p><strong>{user?.full_name || t('Landlord')}</strong></p>
              <p>{user?.email || t('Email not provided')}</p>
              <p>{user?.phone || t('Add a phone number in your profile to display it to tenants.')}</p>
              <div className="onboarding__choice">
                {[
                  { value: 'gcash', label: 'GCash' },
                  { value: 'paymaya', label: 'Maya' },
                ].map((method) => (
                  <label className="field" key={method.value} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={paymentMethods.includes(method.value)}
                      onChange={(event) => {
                        setPaymentMethodsTouched(true)
                        setPaymentMethods((current) => event.target.checked
                          ? [...new Set([...current, method.value])]
                          : current.filter((value) => value !== method.value))
                      }}
                    />
                    <span>{t(method.label)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="onboarding__actions">
          <span className="onboarding__step-hint">{t('Step')} {step + 1} {t('of')} 4</span>
          <button type="button" className="btn btn--ghost" disabled={busy || step === 0} onClick={() => { setError(''); setStep((current) => current - 1) }}>{t('Back')}</button>
          {step < 3
            ? <button type="button" className="btn btn--accent" disabled={busy} onClick={next}>{t('Continue')}</button>
            : <button type="button" className="btn btn--accent onboarding__save" disabled={busy} onClick={save}>
              {busy && <AssistantAvatar thinking className="assistant-avatar--onboarding-save" />}
              {busy ? t('Saving setup…') : t('Create my rental setup')}
            </button>}
        </div>
      </Glass>

      {tenantCredentials && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('Tenant temporary passwords')}>
          <Glass className="modal__card">
            <div className="modal__head"><h2>{t('Setup complete')}</h2></div>
            <p>{t('Copy each temporary password now. Tenants must change it when they first sign in.')}</p>
            {tenantCredentials.map((credential) => (
              <div className="secret" key={credential.email}>
                <span>{t('Username')}</span><code>{credential.username}</code>
                <span>{t('Email')}</span><code>{credential.email}</code>
                <span>{t('Temporary password')}</span><code>{credential.temporary_password}</code>
              </div>
            ))}
            <div className="modal__foot">
              <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(tenantCredentials.map((c) => `${c.username} (${c.email}): ${c.temporary_password}`).join('\n'))}>{t('Copy credentials')}</button>
              <button className="btn btn--accent" onClick={done}>{t('Go to dashboard')}</button>
            </div>
          </Glass>
        </div>
      )}
    </section>
  )
}
