import { useEffect, useMemo, useState } from 'react'
import Glass from '../../components/Glass'
import { Field, FormModal, Modal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'
import { printLeaseAgreement } from '../../lib/leaseAgreement'
import { useAuth } from '../../context/AuthContext'
import ViewToolbar from '../../components/ViewToolbar'
import { annualEndDate, billingDefaultMoveInDate, defaultMoveInDate, parseLeaseTemplate } from '../../lib/leaseContract'
import { useSettings } from '../../context/SettingsContext'
import LeaseBillingFields, { billingStartDateError } from '../../components/LeaseBillingFields'

const CONTRACT_TERM_OPTIONS = [
  { value: 'monthly',  label: 'Month-to-month' },
  { value: 'annually', label: 'Annual (12 months)' },
  { value: 'custom',   label: 'Custom term' },
]

const editableFields = [
  { name: 'end_date',                label: 'Lease end date (optional)',          type: 'date',   hint: 'Leave empty for an open-ended lease.' },
  { name: 'monthly_rent',            label: 'Monthly rent',                       type: 'number', min: 1, step: '0.01' },
  { name: 'deposit',                 label: 'Deposit',                            type: 'number', min: 0, step: '0.01' },
  { name: 'due_day',                 label: 'Calendar due day (1-28)',            type: 'number', min: 1, max: 28 },
  { name: 'billing_style',           label: 'Rent billing schedule',              type: 'select', options: [
    { value: 'calendar', label: 'Calendar billing' },
    { value: 'anniversary', label: 'Anniversary billing' },
    { value: 'first_of_month', label: 'Start on the 1st only' },
  ] },
  { name: 'prorate_first_month',     label: 'Prorate first partial month',        type: 'checkbox' },
  { name: 'grace_period_days',       label: 'Grace period (0-15 days)',           type: 'number', min: 0, max: 15 },
  { name: 'late_fee',                label: 'Late fee per overdue bill (PHP)',    type: 'number', min: 0, step: '0.01' },
  { name: 'contract_term',           label: 'Contract term',                      type: 'select', options: CONTRACT_TERM_OPTIONS },
  { name: 'contract_months',         label: 'Contract months (optional)',         type: 'number', min: 1, hint: 'Total months. Leave empty for open-ended.' },
  { name: 'advance_payment',         label: 'Advance payment (PHP)',              type: 'number', min: 0, step: '0.01', hint: 'Amount paid in advance at signing.' },
  { name: 'down_payment',            label: 'Down payment (PHP)',                 type: 'number', min: 0, step: '0.01', hint: 'Initial down payment at signing.' },
  { name: 'estimated_annual_income', label: 'Estimated annual income (optional)',type: 'number', min: 0, step: '0.01', hint: 'Override auto-calculated annual income.' },
  { name: 'notes',                   label: 'Notes (optional)',                   hint: 'Internal notes - not visible to tenants.' },
]

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(String(dateStr).replace(' ', 'T'))
  return Math.round((d - Date.now()) / 86400000)
}

function ExpiryBadge({ endDate }) {
  const days = daysUntil(endDate)
  if (days === null) return <small className="muted">Open-ended</small>
  if (days < 0)   return <small style={{ color: 'var(--danger)', fontWeight: 600 }}>Expired {Math.abs(days)}d ago</small>
  if (days <= 7)  return <small style={{ color: 'var(--danger)', fontWeight: 600 }}>Expires in {days}d</small>
  if (days <= 30) return <small style={{ color: 'var(--warning, #e67e22)', fontWeight: 600 }}>Expires in {days}d</small>
  return <small className="muted">to {dateFmt(endDate)}</small>
}

function FinancialSummary({ data }) {
  if (!data) return null
  const cards = [
    { label: 'Monthly Income', value: money(data.total_monthly_rent), accent: true },
    { label: 'Est. Annual Income', value: money(data.estimated_annual_income), accent: true },
    { label: 'Total Deposits', value: money(data.total_deposits) },
    { label: 'Total Advances', value: money(data.total_advances) },
    { label: 'Down Payments', value: money(data.total_down_payments) },
  ]
  return (
    <details className="lease-financial-summary">
      <summary>Financial overview <span>{data.active_leases_count} active leases</span></summary>
      <div className="lease-financial-summary__metrics">
        {cards.map((card) => (
          <div key={card.label}>
            <span>{card.label}</span>
            <strong className={card.accent ? 'is-accent' : ''}>{card.value}</strong>
          </div>
        ))}
      </div>
    </details>
  )
}

function LeaseActions({ lease, onDetails, onEdit, onRenew, onEnd, onCancel }) {
  const menuId = `lease-actions-${lease.id}`
  const hasActions = lease.status === 'active' || ['offered', 'scheduled'].includes(lease.status)
  function runAction(event, action) {
    event.currentTarget.closest('details')?.removeAttribute('open')
    action(lease)
  }
  return (
    <div className="lease-row-actions">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDetails(lease)}>Details</button>
      {hasActions && (
        <details className="lease-action-menu">
          <summary aria-label={`More actions for ${lease.tenant_name}`} aria-controls={menuId}>More</summary>
          <div id={menuId} className="lease-action-menu__items">
            {lease.status === 'active' && (
              <>
                <button type="button" onClick={(event) => runAction(event, onEdit)}>Edit terms</button>
                <button type="button" onClick={(event) => runAction(event, onRenew)}>Renew</button>
                <button type="button" className="is-danger" onClick={(event) => runAction(event, onEnd)}>End lease</button>
              </>
            )}
            {['offered', 'scheduled'].includes(lease.status) && (
              <button type="button" className="is-danger" onClick={(event) => runAction(event, onCancel)}>Cancel lease</button>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

const BILLING_SETTING_KEYS = [
  'billing_style',
  'billing_due_day',
  'billing_prorate_first_month',
  'billing_grace_period_days',
  'billing_late_fee',
]

function billingSettingsFrom(settings) {
  return Object.fromEntries(BILLING_SETTING_KEYS.map((key) => [key, settings[key]]))
}

function BillingDefaults() {
  const { saved, commit } = useSettings()
  const [draft, setDraft] = useState(() => billingSettingsFrom(saved))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const isDirty = BILLING_SETTING_KEYS.some((key) => draft[key] !== saved[key])

  useEffect(() => {
    setDraft(billingSettingsFrom(saved))
  }, [saved])

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice(null)
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const result = await api('/api/admin/settings', { method: 'PUT', body: draft, auth: true })
      commit(result.data)
      setDraft(billingSettingsFrom(result.data))
      setErrors({})
      setNotice({ type: 'ok', text: 'Default billing policy saved for new leases.' })
    } catch (error) {
      setErrors(error.fields || {})
      setNotice({ type: 'error', text: error.status === 422 ? 'Please fix the highlighted fields.' : error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Glass as="form" className="panel" style={{ marginTop: 28 }} onSubmit={save}>
      <h2 className="panel__title">Default rent billing</h2>
      <p className="field__hint" style={{ marginTop: 0 }}>
        This policy is used for new leases. Existing leases keep their saved billing terms. You can override these defaults on an individual lease.
      </p>
      <label className="field">
        <span className="field__label">Billing schedule</span>
        <select value={draft.billing_style} onChange={(event) => {
          const billing_style = event.target.value
          setDraft((current) => ({
            ...current,
            billing_style,
            ...(billing_style === 'first_of_month' ? { billing_due_day: '1', billing_prorate_first_month: '0' } : {}),
          }))
          setErrors({})
          setNotice(null)
        }}>
          <option value="calendar">Calendar billing — fixed due day each month</option>
          <option value="anniversary">Anniversary billing — due on the lease start day</option>
          <option value="first_of_month">Start on the 1st only — rent due on the 1st</option>
        </select>
        <span className="field__hint">Anniversary billing requires a lease start day from the 1st to the 28th.</span>
      </label>
      {draft.billing_style === 'calendar' && (
        <label className="field">
          <span className="field__label">Rent due day (1–28)</span>
          <input type="number" min="1" max="28" value={draft.billing_due_day} onChange={(event) => update('billing_due_day', event.target.value)} aria-invalid={!!errors.billing_due_day} />
          {errors.billing_due_day && <span className="field__error">{errors.billing_due_day}</span>}
        </label>
      )}
      {draft.billing_style !== 'first_of_month' && (
        <label className="field field--checkbox">
          <span className="field__label">Prorate the first partial month</span>
          <input type="checkbox" checked={draft.billing_prorate_first_month === '1'} onChange={(event) => update('billing_prorate_first_month', event.target.checked ? '1' : '0')} />
          <span className="field__hint">When enabled, the first rent bill is calculated for the occupied days remaining in that calendar month.</span>
        </label>
      )}
      <div className="two">
        <label className="field">
          <span className="field__label">Grace period (0–15 days)</span>
          <input type="number" min="0" max="15" value={draft.billing_grace_period_days} onChange={(event) => update('billing_grace_period_days', event.target.value)} aria-invalid={!!errors.billing_grace_period_days} />
          {errors.billing_grace_period_days && <span className="field__error">{errors.billing_grace_period_days}</span>}
        </label>
        <label className="field">
          <span className="field__label">Late fee per overdue bill (PHP)</span>
          <input type="number" min="0" max="999999.99" step="0.01" value={draft.billing_late_fee} onChange={(event) => update('billing_late_fee', event.target.value)} aria-invalid={!!errors.billing_late_fee} />
          {errors.billing_late_fee && <span className="field__error">{errors.billing_late_fee}</span>}
          <span className="field__hint">Zero means no late fee. Tenants see any fee in their lease terms.</span>
        </label>
      </div>
      {notice && <p className={`alert ${notice.type === 'error' ? 'alert--error' : ''}`} role="status">{notice.text}</p>}
      <div className="modal__foot">
        <button className="btn btn--accent" type="submit" disabled={saving || !isDirty}>{saving ? 'Saving…' : 'Save billing defaults'}</button>
      </div>
    </Glass>
  )
}

function NewLeaseForm({ units, tenants, onSubmit, onClose }) {
  const { saved: settings } = useSettings()
  const firstUnit = units[0]
  const [values, setValues] = useState(() => {
    const start_date = billingDefaultMoveInDate(settings.billing_style)
    return {
      unit_id: firstUnit?.id || '',
      tenant_id: '',
      start_date,
      end_date: annualEndDate(start_date),
      monthly_rent: firstUnit?.monthly_rent ?? '',
      deposit: firstUnit?.default_deposit ?? 0,
      due_day: settings.billing_due_day,
      billing_style: settings.billing_style,
      prorate_first_month: settings.billing_prorate_first_month === '1',
      grace_period_days: settings.billing_grace_period_days,
      late_fee: settings.billing_late_fee,
      contract_term: 'annually',
      contract_months: 12,
      advance_payment: 0,
      down_payment: 0,
      contract_required: !!parseLeaseTemplate(firstUnit?.contract_template || firstUnit?.property_contract_template).enabled,
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const unit = units.find((item) => String(item.id) === String(values.unit_id))
  const template = parseLeaseTemplate(unit?.contract_template || unit?.property_contract_template)

  function update(patch) {
    setValues((current) => ({ ...current, ...patch }))
  }

  function selectUnit(id) {
    const next = units.find((item) => String(item.id) === String(id))
    const defaultTemplate = parseLeaseTemplate(next?.contract_template || next?.property_contract_template)
    update({
      unit_id: id,
      monthly_rent: next?.monthly_rent ?? '',
      deposit: next?.default_deposit ?? 0,
      due_day: settings.billing_due_day,
      contract_required: !!defaultTemplate.enabled,
    })
  }

  async function submit(event) {
    event.preventDefault()
    const billingError = billingStartDateError(values.start_date, values.billing_style)
    if (billingError) {
      setError(billingError)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Assign a tenant to a unit" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <p className="muted">Assign an existing tenant account that does not have a current lease. The unit stays available until the scheduled move-in date.</p>
        <Field label="Vacant unit">
          <select required value={values.unit_id} onChange={(event) => selectUnit(event.target.value)}>
            <option value="">Choose a unit</option>
            {units.map((item) => <option key={item.id} value={item.id}>{item.unit_name} · {item.property_name}</option>)}
          </select>
        </Field>
        <Field label="Tenant">
          <select required value={values.tenant_id} onChange={(event) => update({ tenant_id: event.target.value })}>
            <option value="">Choose a tenant without a current lease</option>
            {tenants.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
        </Field>
        <div className="onboarding__grid">
          <Field label="Move-in date (defaults to 5 days from now)">
            <input type="date" min={defaultMoveInDate(values.contract_required ? 1 : 0)} required value={values.start_date} onChange={(event) => update({ start_date: event.target.value, end_date: annualEndDate(event.target.value) })} />
          </Field>
          <Field label="Annual term ends">
            <input type="date" readOnly value={values.end_date} />
          </Field>
        </div>
        <div className="onboarding__grid">
          <Field label="Monthly rent (PHP)">
            <input type="number" min="1" step="0.01" required value={values.monthly_rent} onChange={(event) => update({ monthly_rent: event.target.value })} />
          </Field>
          <Field label="Security deposit (PHP)">
            <input type="number" min="0" step="0.01" value={values.deposit} onChange={(event) => update({ deposit: event.target.value })} />
          </Field>
        </div>
        <LeaseBillingFields values={values} onChange={setValues} />
        <Field label="Advance rent (PHP, optional)">
          <input type="number" min="0" step="0.01" value={values.advance_payment} onChange={(event) => update({ advance_payment: event.target.value })} />
        </Field>
        {template.enabled && (
          <label className="field field--checkbox">
            <input type="checkbox" checked={!!values.contract_required} onChange={(event) => {
              const contract_required = event.target.checked
              const start_date = contract_required && values.start_date <= defaultMoveInDate(0)
                ? defaultMoveInDate()
                : values.start_date
              update({ contract_required, start_date, end_date: annualEndDate(start_date) })
            }} />
            <span className="field__label">Send annual contract for tenant approval</span>
            <span className="field__hint">If selected, tenant must agree by the move-in date. If not selected, the lease is scheduled directly.</span>
          </label>
        )}
        {!template.enabled && <p className="muted">Quick mode: the lease will start automatically on the move-in date. To use tenant approval, first enable a contract template on this unit or property.</p>}
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy || !values.unit_id || !values.tenant_id}>{busy ? 'Saving…' : values.contract_required ? 'Send contract' : 'Schedule lease'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Leases() {
  const { user } = useAuth()
  const leases     = useLoad('/api/admin/leases')
  const units      = useLoad('/api/admin/units')
  const tenants    = useLoad('/api/admin/tenants')
  const financials = useLoad('/api/admin/leases/financials')

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expiryFilter, setExpiryFilter] = useState('all')
  const [sortBy, setSortBy]             = useState('date-desc')
  const [viewMode, setViewMode]         = useState('grid')
  const [selected, setSelected]         = useState(null)
  const [form, setForm]                 = useState(null)
  const [toast, flash]                  = useToast()

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = (leases.data || []).filter((lease) => {
      if (statusFilter !== 'all' && lease.status !== statusFilter) return false
      if (expiryFilter !== 'all') {
        const days = daysUntil(lease.end_date)
        if (expiryFilter === 'expiring7'  && !(lease.status === 'active' && days !== null && days >= 0 && days <= 7))  return false
        if (expiryFilter === 'expiring30' && !(lease.status === 'active' && days !== null && days >= 0 && days <= 30)) return false
        if (expiryFilter === 'open'       && lease.end_date) return false
      }
      if (!term) return true
      return [lease.tenant_name, lease.tenant_email, lease.unit_name, lease.property_name]
        .some((v) => String(v || '').toLowerCase().includes(term))
    })
    list.sort((a, b) => {
      if (sortBy === 'name-asc')  return (a.tenant_name || '').localeCompare(b.tenant_name || '')
      if (sortBy === 'name-desc') return (b.tenant_name || '').localeCompare(a.tenant_name || '')
      if (sortBy === 'rent-desc') return Number(b.monthly_rent || 0) - Number(a.monthly_rent || 0)
      if (sortBy === 'rent-asc')  return Number(a.monthly_rent || 0) - Number(b.monthly_rent || 0)
      if (sortBy === 'date-desc') return (b.start_date || '').localeCompare(a.start_date || '')
      if (sortBy === 'date-asc')  return (a.start_date || '').localeCompare(b.start_date || '')
      return 0
    })
    return list
  }, [leases.data, search, statusFilter, expiryFilter, sortBy])

  async function saveNew(values) {
    const result = await api('/api/admin/leases', { method: 'POST', auth: true, body: clean(values) })
    flash(result.message)
    await Promise.all([leases.reload(), units.reload(), tenants.reload(), financials.reload()])
  }

  async function saveTerms(values) {
    const isRenewal = form.kind === 'renew'
    const result = await api(
      `/api/admin/leases/${form.lease.id}${isRenewal ? '/renew' : ''}`,
      { method: isRenewal ? 'POST' : 'PATCH', auth: true, body: clean(values) }
    )
    flash(result.message)
    setForm(null)
    await Promise.all([leases.reload(), financials.reload()])
  }

  async function endLease(lease) {
    if (!window.confirm(`End the lease of ${lease.tenant_name} for ${lease.unit_name} now?`)) return
    try {
      const result = await api(`/api/admin/leases/${lease.id}/end`, { method: 'POST', auth: true, body: {} })
      flash(result.message)
      await Promise.all([leases.reload(), units.reload(), tenants.reload(), financials.reload()])
    } catch (error) { flash(error.message, 'bad') }
  }

  async function cancelScheduled(lease) {
    if (!window.confirm(`Cancel the contract offer or scheduled move-in for ${lease.tenant_name}?`)) return
    try {
      const result = await api(`/api/admin/leases/${lease.id}/cancel`, { method: 'POST', auth: true, body: {} })
      flash(result.message)
      await Promise.all([leases.reload(), units.reload(), tenants.reload(), financials.reload()])
    } catch (error) { flash(error.message, 'bad') }
  }

  const activeCount = (leases.data || []).filter((l) => l.status === 'active').length
  const endedCount  = (leases.data || []).filter((l) => l.status === 'ended').length
  const pendingCount = (leases.data || []).filter((l) => l.status === 'offered').length
  const scheduledCount = (leases.data || []).filter((l) => l.status === 'scheduled').length
  const expiring7   = (leases.data || []).filter((l) => { const d = daysUntil(l.end_date); return l.status === 'active' && d !== null && d >= 0 && d <= 7 }).length
  const expiring30  = (leases.data || []).filter((l) => { const d = daysUntil(l.end_date); return l.status === 'active' && d !== null && d >= 0 && d <= 30 }).length
  const assignableUnits = (units.data || []).filter((unit) =>
    unit.occupancy_status === 'vacant' && unit.condition_tag === 'good_condition' && !unit.lease_id
  )
  const assignableTenants = (tenants.data || []).filter((tenant) => tenant.is_active && !tenant.lease_id)
  const attentionItems = (leases.data || [])
    .filter((lease) => lease.status === 'offered' || (
      lease.status === 'active' && daysUntil(lease.end_date) !== null &&
      daysUntil(lease.end_date) >= 0 && daysUntil(lease.end_date) <= 30
    ))
    .sort((a, b) => {
      if (a.status === 'offered' && b.status !== 'offered') return -1
      if (b.status === 'offered' && a.status !== 'offered') return 1
      return (a.end_date || '').localeCompare(b.end_date || '')
    })
  const hasFilters = search || statusFilter !== 'all' || expiryFilter !== 'all'

  return (
    <>
      <PageHead eyebrow="Manage" title="Leases" sub="A lease links a tenant to a unit and sets the move-in date, rent, deposit and due day.">
        {assignableUnits.length > 0 && assignableTenants.length > 0 && (
          <button className="btn btn--accent" onClick={() => setForm({ kind: 'assign' })}>Assign Tenant</button>
        )}
      </PageHead>
      <p className="lease-workflow-note">New tenant accounts automatically receive a scheduled lease. Use <strong>Assign Tenant</strong> only for an existing account without a current lease. Scheduled leases become active on the move-in date.</p>

      <section className="lease-overview" aria-label="Lease overview">
        <button type="button" className={`lease-overview__item${statusFilter === 'active' && expiryFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => { setSearch(''); setStatusFilter('active'); setExpiryFilter('all') }}
          aria-pressed={statusFilter === 'active' && expiryFilter === 'all'}>
          <strong>{activeCount}</strong><span>Active</span>
        </button>
        <button type="button" className={`lease-overview__item${statusFilter === 'scheduled' && expiryFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => { setSearch(''); setStatusFilter('scheduled'); setExpiryFilter('all') }}
          aria-pressed={statusFilter === 'scheduled' && expiryFilter === 'all'}>
          <strong>{scheduledCount}</strong><span>Move-in scheduled</span>
        </button>
        <button type="button" className={`lease-overview__item${statusFilter === 'offered' && expiryFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => { setSearch(''); setStatusFilter('offered'); setExpiryFilter('all') }}
          aria-pressed={statusFilter === 'offered' && expiryFilter === 'all'}>
          <strong>{pendingCount}</strong><span>Awaiting approval</span>
        </button>
        <button type="button" className={`lease-overview__item${expiryFilter === 'expiring30' ? ' is-active' : ''}`}
          onClick={() => { setSearch(''); setStatusFilter('all'); setExpiryFilter('expiring30') }}
          aria-pressed={expiryFilter === 'expiring30'}>
          <strong>{expiring30}</strong><span>Expiring in 30 days</span>
        </button>
      </section>

      {attentionItems.length > 0 && (
        <section className="lease-attention" aria-labelledby="lease-attention-title">
          <div className="lease-attention__head">
            <div>
              <h2 id="lease-attention-title">Needs attention</h2>
              <p>Pending contract approvals and leases ending within 30 days.</p>
            </div>
            <span>{attentionItems.length}</span>
          </div>
          <ul>
            {attentionItems.slice(0, 4).map((lease) => (
              <li key={lease.id}>
                <div className="lease-attention__detail">
                  <strong>{lease.tenant_name}</strong>
                  <span>{lease.unit_name} · {lease.property_name}</span>
                </div>
                <span className={lease.status === 'offered' ? 'lease-attention__reason is-pending' : 'lease-attention__reason'}>
                  {lease.status === 'offered'
                    ? 'Awaiting tenant approval'
                    : `${daysUntil(lease.end_date) <= 7 ? 'Expiring soon' : 'Expiring'} · ${dateFmt(lease.end_date)}`}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(lease)}>Review</button>
              </li>
            ))}
          </ul>
          {attentionItems.length > 4 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setExpiryFilter('all')
            }}>View all leases</button>
          )}
        </section>
      )}

      {!financials.loading && financials.data && <FinancialSummary data={financials.data} />}

      <ViewToolbar
        view={viewMode} onViewChange={setViewMode}
        search={search} onSearchChange={setSearch}
        searchPlaceholder="Search tenant, unit or property..."
        filter={statusFilter} onFilterChange={setStatusFilter}
        filterOptions={[
          { value: 'all',    label: `All Leases (${(leases.data || []).length})` },
          { value: 'offered', label: `Awaiting tenant (${pendingCount})` },
          { value: 'scheduled', label: `Move-in scheduled (${scheduledCount})` },
          { value: 'active', label: `Active (${activeCount})` },
          { value: 'ended',  label: `Ended (${endedCount})` },
          { value: 'expired', label: 'Expired offers' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        sort={sortBy} onSortChange={setSortBy}
        sortOptions={[
          { value: 'date-desc',  label: 'Start Date (Newest)' },
          { value: 'date-asc',   label: 'Start Date (Oldest)' },
          { value: 'name-asc',   label: 'Tenant Name (A-Z)' },
          { value: 'name-desc',  label: 'Tenant Name (Z-A)' },
          { value: 'rent-desc',  label: 'Highest Rent' },
          { value: 'rent-asc',   label: 'Lowest Rent' },
        ]}
      >
        <select aria-label="Filter by expiry" value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}>
          <option value="all">All expiry</option>
          <option value="expiring7">Expiring in 7d ({expiring7})</option>
          <option value="expiring30">Expiring in 30d ({expiring30})</option>
          <option value="open">Open-ended</option>
        </select>
        {hasFilters && (
          <button className="btn btn--ghost btn--sm" onClick={() => { setSearch(''); setStatusFilter('all'); setExpiryFilter('all') }}>Clear</button>
        )}
      </ViewToolbar>

      <State loading={leases.loading} error={leases.error} empty={leases.data?.length === 0 && 'No leases yet.'}>
        {leases.data && rows.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            No leases match your criteria.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid lease-cards-grid">
            {rows.map((l) => (
              <article key={l.id} className="request-card lease-card">
                <div className="request-card__head">
                  <div>
                    <h3 className="request-card__title">{l.tenant_name}</h3>
                    <div className="request-card__sub">{l.unit_name} · {l.property_name}</div>
                  </div>
                  <StatusPill value={l.status} />
                </div>
                <div className="lease-card__facts">
                  <div className="lease-card__rent">
                    <span>Monthly rent</span>
                    <strong>{money(l.monthly_rent)}</strong>
                  </div>
                  <div>
                    <span>{l.status === 'scheduled' || l.status === 'offered' ? 'Move-in date' : 'Start date'}</span>
                    <strong>{dateFmt(l.start_date)}</strong>
                  </div>
                  <div>
                    <span>Lease end</span>
                    <strong><ExpiryBadge endDate={l.end_date} /></strong>
                  </div>
                </div>
                <div className="request-card__foot lease-card__foot">
                  <LeaseActions
                    lease={l}
                    onDetails={setSelected}
                    onEdit={(lease) => setForm({ kind: 'edit', lease })}
                    onRenew={(lease) => setForm({ kind: 'renew', lease })}
                    onEnd={endLease}
                    onCancel={cancelScheduled}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Table
            rows={rows}
            columns={[
              { key: 'tenant_name',  label: 'Tenant', render: (l) => (<><strong>{l.tenant_name}</strong><br /><small className="muted">{l.tenant_email}</small></>)},
              { key: 'unit_name',    label: 'Unit / Property', render: (l) => (<>{l.unit_name}<br /><small className="muted">{l.property_name}</small></>)},
              { key: 'term',         label: 'Term', render: (l) => (<>{dateFmt(l.start_date)}<br /><ExpiryBadge endDate={l.end_date} /></>)},
              { key: 'monthly_rent', label: 'Rent', align: 'right', render: (l) => (<>{money(l.monthly_rent)}<br /><small className="muted">due day {l.due_day}</small></>)},
              { key: 'status', label: 'Status', render: (l) => <StatusPill value={l.status} /> },
            ]}
            actions={(lease) => (
              <LeaseActions
                lease={lease}
                onDetails={setSelected}
                onEdit={(item) => setForm({ kind: 'edit', lease: item })}
                onRenew={(item) => setForm({ kind: 'renew', lease: item })}
                onEnd={endLease}
                onCancel={cancelScheduled}
              />
            )}
          />
        )}
      </State>

      <BillingDefaults />

      {form?.kind === 'assign' && <NewLeaseForm
        units={assignableUnits}
        tenants={assignableTenants}
        onSubmit={saveNew}
        onClose={() => setForm(null)}
      />}
      {form?.kind === 'edit' && (
        <FormModal
          title={`Edit lease terms · ${form.lease.tenant_name}`}
          fields={editableFields} initial={form.lease}
          onSubmit={saveTerms} onClose={() => setForm(null)}
        />
      )}
      {form?.kind === 'renew' && (
        <FormModal
          title={`Renew lease · ${form.lease.tenant_name}`}
          submitLabel="Renew lease"
          fields={[
            { name: 'end_date',        label: 'New lease end date',         type: 'date', hint: 'Choose a date after the current end date.' },
            { name: 'monthly_rent',    label: 'New monthly rent (optional)', type: 'number', min: 1, step: '0.01', hint: `Current rent: ${money(form.lease.monthly_rent)}` },
            { name: 'deposit',         label: 'Deposit (optional)',          type: 'number', min: 0, step: '0.01' },
            { name: 'due_day',         label: 'Due day (optional)',          type: 'number', min: 1, max: 28 },
            { name: 'contract_term',   label: 'Contract term',              type: 'select', options: CONTRACT_TERM_OPTIONS },
            { name: 'contract_months', label: 'Contract months (optional)', type: 'number', min: 1 },
            { name: 'advance_payment', label: 'Advance payment (PHP)',      type: 'number', min: 0, step: '0.01' },
            { name: 'down_payment',    label: 'Down payment (PHP)',         type: 'number', min: 0, step: '0.01' },
            { name: 'notes',           label: 'Renewal notes (optional)' },
          ]}
          onSubmit={saveTerms} onClose={() => setForm(null)}
        />
      )}

      {selected && (
        <LeaseDetails
          lease={{ ...selected, landlord_name: user?.full_name }}
          onClose={() => setSelected(null)}
          flash={flash}
          reload={() => Promise.all([leases.reload(), financials.reload()])}
        />
      )}
      {toast}
    </>
  )
}

function LeaseDetails({ lease, onClose, flash, reload }) {
  const history   = useLoad(`/api/admin/leases/${lease.id}/history`)
  const documents = useLoad(`/api/admin/leases/${lease.id}/documents`)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState('')
  const address    = [lease.address, lease.property_barangay, lease.property_city].filter(Boolean).join(', ')
  const expiryDays = daysUntil(lease.end_date)

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) { setUploadError('Choose a valid lease document file.'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Lease documents must be no larger than 5 MB.'); return }
    setUploading(true); setUploadError('')
    try {
      const document = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the selected lease document.'))
        reader.readAsDataURL(file)
      })
      const result = await api(`/api/admin/leases/${lease.id}/documents`, { method: 'POST', auth: true, body: { name: file.name, document } })
      flash(result.message)
      await documents.reload()
    } catch (error) { setUploadError(error.message) } finally { setUploading(false) }
  }

  async function removeDocument(doc) {
    if (!window.confirm(`Delete ${doc.original_name}?`)) return
    try {
      flash((await api(`/api/admin/leases/${lease.id}/documents/${doc.id}`, { method: 'DELETE', auth: true })).message)
      await documents.reload()
    } catch (error) { flash(error.message, 'bad') }
  }

  function print() {
    if (!printLeaseAgreement(lease)) flash('Allow pop-ups to print the lease agreement.', 'bad')
  }

  const termLabel = CONTRACT_TERM_OPTIONS.find(o => o.value === lease.contract_term)?.label || (lease.contract_term || 'Monthly')

  return (
    <Modal title="Lease details and history" onClose={onClose}>
      {lease.status === 'active' && expiryDays !== null && expiryDays <= 30 && (
        <div className={`alert ${expiryDays <= 7 ? 'alert--error' : 'alert--warn'}`} style={{ marginBottom: 16 }}>
          {expiryDays <= 0 ? `This lease expired ${Math.abs(expiryDays)} day(s) ago.` : `This lease expires in ${expiryDays} day(s). Consider renewing soon.`}
        </div>
      )}

      <div className="lease-detail-grid">
        <p><strong>Tenant</strong>         <span>{lease.tenant_name}<br /><small>{lease.tenant_email}</small></span></p>
        <p><strong>Unit</strong>           <span>{lease.unit_name} · {lease.property_name}</span></p>
        <p><strong>Address</strong>        <span>{address || '-'}</span></p>
        <p><strong>Lease term</strong>     <span>{dateFmt(lease.start_date)} to {dateFmt(lease.end_date)}</span></p>
        <p><strong>Monthly rent</strong>   <span>{money(lease.monthly_rent)}</span></p>
        <p><strong>Deposit</strong>        <span>{money(lease.deposit)}</span></p>
        <p><strong>Rent due</strong>       <span>Day {lease.due_day} of each month</span></p>
        <p><strong>Status</strong>         <span><StatusPill value={lease.status} /></span></p>
        <p><strong>Contract type</strong>  <span>{termLabel}{lease.contract_months ? ` · ${lease.contract_months} months` : ''}</span></p>
        {Number(lease.estimated_annual_income) > 0 && (
          <p><strong>Est. Annual Income</strong><span style={{ color: '#16a34a', fontWeight: 700 }}>{money(lease.estimated_annual_income)}</span></p>
        )}
        {Number(lease.advance_payment) > 0 && (
          <p><strong>Advance Payment</strong><span>{money(lease.advance_payment)}</span></p>
        )}
        {Number(lease.down_payment) > 0 && (
          <p><strong>Down Payment</strong><span>{money(lease.down_payment)}</span></p>
        )}
        {lease.notes && <p><strong>Notes</strong><span style={{ fontStyle: 'italic' }}>{lease.notes}</span></p>}
      </div>

      <div className="lease-detail-actions">
        {lease.contract_required && lease.contract_json && (
          <button className="btn btn--accent" onClick={print}>Print annual contract</button>
        )}
        <label className={`btn btn--ghost${uploading ? ' is-disabled' : ''}`}>
          {uploading ? 'Uploading...' : 'Upload lease document'}
          <input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={upload} hidden />
        </label>
      </div>

      {uploadError && <p className="alert alert--error" role="alert">{uploadError}</p>}

      <h3>Lease documents</h3>
      <State loading={documents.loading} error={documents.error} empty={documents.data?.length === 0 && 'No documents uploaded for this lease.'}>
        {documents.data?.map((doc) => (
          <div className="lease-document" key={doc.id}>
            <span>
              <strong>{doc.original_name}</strong>
              <small>{Math.max(1, Math.ceil(doc.byte_size / 1024))} KB · {dateFmt(doc.created_at)}</small>
            </span>
            <div>
              <button className="btn btn--ghost btn--sm" onClick={() => downloadPdf(`/api/admin/leases/${lease.id}/documents/${doc.id}`, doc.original_name).catch((e) => flash(e.message, 'bad'))}>Download</button>
              <button className="btn btn--ghost btn--sm" onClick={() => removeDocument(doc)}>Delete</button>
            </div>
          </div>
        ))}
      </State>

      <h3>Lease history</h3>
      <State loading={history.loading} error={history.error} empty={history.data?.length === 0 && 'No lease history available.'}>
        {history.data?.map((event) => (
          <details className="lease-history" key={event.id}>
            <summary><span>{event.summary}</span><small>{dateFmt(event.created_at)}</small></summary>
            {(event.before_data || event.after_data) && (
              <pre>{JSON.stringify({ before: event.before_data, after: event.after_data }, null, 2)}</pre>
            )}
          </details>
        ))}
      </State>

      <div className="modal__foot"><button className="btn btn--ghost" onClick={onClose}>Close</button></div>
    </Modal>
  )
}
