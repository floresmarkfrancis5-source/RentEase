import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Avatar from '../../components/Avatar'
import { Field, FormModal, Modal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'
import { annualEndDate, billingDefaultMoveInDate, defaultMoveInDate, parseLeaseTemplate } from '../../lib/leaseContract'
import { useSettings } from '../../context/SettingsContext'
import LeaseBillingFields, { billingStartDateError } from '../../components/LeaseBillingFields'

const FIELDS = [
  { name: 'username',  label: 'Username',  hint: 'Choose a unique username the tenant can use to sign in.' },
  { name: 'full_name', label: 'Full name' },
  { name: 'email',     label: 'Email',     type: 'email', hint: 'Used to log in and to receive bills and receipts.' },
  { name: 'phone',     label: 'Phone',     type: 'tel' },
]

function TenantActionMenu({ tenant, onEdit, onMove, onInvite, onReset, onToggle, onDelete }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = `tenant-actions-${tenant.id}`

  useEffect(() => {
    if (!open) return undefined

    const placeMenu = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight || 240
      const menuWidth = menuRef.current?.offsetWidth || 208
      const top = rect.bottom + menuHeight + 8 > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))
      setPosition({ top, left })
    }

    const handleOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const items = menuRef.current?.querySelectorAll('[role="menuitem"]')
      if (!items?.length) return
      event.preventDefault()
      const currentIndex = Array.from(items).indexOf(document.activeElement)
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? items.length - 1
          : event.key === 'ArrowDown' ? (currentIndex + 1) % items.length
            : (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
      items[nextIndex].focus()
    }

    placeMenu()
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  const items = [
    { label: 'Edit', onClick: onEdit },
    tenant.unit_name && tenant.is_active && tenant.lease_status === 'active' && { label: 'Move unit', onClick: onMove },
    !(tenant.email_verified || tenant.google_linked) && { label: 'Resend invite', onClick: onInvite },
    { label: 'Reset password', onClick: onReset },
    { label: tenant.is_active ? 'Deactivate' : 'Reactivate', onClick: onToggle },
    { label: 'Delete', onClick: onDelete, danger: true },
  ].filter(Boolean)

  return (
    <div className="tenant-action-menu">
      <button
        ref={triggerRef}
        id={`${menuId}-trigger`}
        type="button"
        className="tenant-action-menu__trigger"
        aria-label={`More actions for ${tenant.full_name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="More actions"
        onClick={(event) => {
          setOpen((current) => !current)
          if (!open && event.detail === 0) {
            requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus())
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
            requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus())
          }
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="tenant-action-menu__popover"
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'tenant-action-menu__item tenant-action-menu__item--danger' : 'tenant-action-menu__item'}
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function NewTenantForm({ units, onSubmit, onClose }) {
  const { saved: settings } = useSettings()
  const firstUnit = units[0]
  const [values, setValues] = useState(() => {
    const start_date = billingDefaultMoveInDate(settings.billing_style)
    return {
      username: '',
      full_name: '',
      email: '',
      phone: '',
      unit_id: firstUnit?.id || '',
      start_date,
      end_date: annualEndDate(start_date),
      monthly_rent: '',
      deposit: firstUnit?.default_deposit ?? 0,
      due_day: settings.billing_due_day,
      billing_style: settings.billing_style,
      prorate_first_month: settings.billing_prorate_first_month === '1',
      grace_period_days: settings.billing_grace_period_days,
      late_fee: settings.billing_late_fee,
      contract_required: !!parseLeaseTemplate(firstUnit?.contract_template || firstUnit?.property_contract_template).enabled,
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedUnit = units.find((unit) => String(unit.id) === String(values.unit_id))
  const template = parseLeaseTemplate(selectedUnit?.contract_template || selectedUnit?.property_contract_template)

  function selectUnit(unitId) {
    const unit = units.find((item) => String(item.id) === String(unitId))
    const contract_required = !!parseLeaseTemplate(unit?.contract_template || unit?.property_contract_template).enabled
    const start_date = contract_required && values.start_date <= defaultMoveInDate(0)
      ? defaultMoveInDate()
      : values.start_date
    setValues((current) => ({
      ...current,
      unit_id: unitId,
      deposit: unit?.default_deposit ?? 0,
      contract_required,
      start_date,
      end_date: annualEndDate(start_date),
    }))
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
      setError(err.message || 'Could not create the tenant.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add tenant and schedule move-in" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">This creates the tenant account and schedules their lease. Bills begin only after move-in.</p>
        <Field label="Username"><input required minLength={3} maxLength={50} value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} /></Field>
        <Field label="Full name"><input required maxLength={120} value={values.full_name} onChange={(event) => setValues({ ...values, full_name: event.target.value })} /></Field>
        <Field label="Email"><input required type="email" maxLength={255} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></Field>
        <Field label="Phone (optional)"><input type="tel" maxLength={30} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></Field>
        <Field label="Vacant unit">
          <select required value={values.unit_id} onChange={(event) => selectUnit(event.target.value)}>
            <option value="">Choose a vacant unit</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_name} · {unit.property_name}</option>)}
          </select>
        </Field>
        <div className="onboarding__grid">
          <Field label="Move-in date (defaults to 5 days from now)">
            <input type="date" required min={defaultMoveInDate(values.contract_required ? 1 : 0)} value={values.start_date}
              onChange={(event) => setValues({ ...values, start_date: event.target.value, end_date: annualEndDate(event.target.value) })} />
          </Field>
          <Field label="Annual lease ends"><input type="date" readOnly value={values.end_date} /></Field>
        </div>
        <div className="onboarding__grid">
          <Field label="Monthly rent (optional)">
            <input type="number" min="1" step="0.01" value={values.monthly_rent} onChange={(event) => setValues({ ...values, monthly_rent: event.target.value })} />
          </Field>
          <Field label="Deposit (unit default)">
            <input type="number" min="0" step="0.01" value={values.deposit} onChange={(event) => setValues({ ...values, deposit: event.target.value })} />
          </Field>
        </div>
        <LeaseBillingFields values={values} onChange={setValues} />
        {template.enabled ? (
          <label className="field field--checkbox">
            <input type="checkbox" checked={values.contract_required} onChange={(event) => {
              const contract_required = event.target.checked
              const start_date = contract_required && values.start_date <= defaultMoveInDate(0)
                ? defaultMoveInDate()
                : values.start_date
              setValues({ ...values, contract_required, start_date, end_date: annualEndDate(start_date) })
            }} />
            <span className="field__label">Send annual contract for tenant approval</span>
            <span className="field__hint">The tenant must agree before the move-in date. Otherwise, this will be a quick scheduled lease.</span>
          </label>
        ) : <p className="muted">Quick mode: move-in is scheduled without a contract approval step.</p>}
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy || !values.unit_id}>{busy ? 'Saving…' : values.contract_required ? 'Send contract' : 'Schedule lease'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Credentials({ username, email, password, activation_url, invitation_email_status, onClose }) {
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    if (activation_url) { navigator.clipboard?.writeText(activation_url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  return (
    <Modal title="Tenant activation & credentials" onClose={onClose}>
      {activation_url && ['failed', 'skipped'].includes(invitation_email_status)
        ? <p className="alert alert--error">The tenant account was created, but the invitation email could not be sent. Share the activation link below or resend the invitation from the tenant list.</p>
        : activation_url
          ? <p>The tenant can use the activation link below to verify their account and choose a password. If the email does not arrive, share the link or resend the invitation from the tenant list.</p>
          : <p>Share these sign-in details with <strong>{email}</strong>.</p>}
      <div className="secret" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'center' }}>
        <span>Username</span><code>{username}</code>
        <span>Email</span><code>{email}</code>
        {activation_url && (<><span>Activation link</span><code style={{ wordBreak: 'break-all', fontSize: '.78rem' }}>{activation_url}</code></>)}
        {password && (<><span>Backup password</span><code>{password}</code></>)}
      </div>
      <div className="modal__foot" style={{ marginTop: 18 }}>
        {activation_url && (
          <button className="btn btn--accent" onClick={copyLink}>{copied ? 'Copied link!' : 'Copy activation link'}</button>
        )}
        <button className="btn btn--ghost" onClick={() => {
          const text = `RentEase Account\nUsername: ${username}\nEmail: ${email}${activation_url ? `\nActivation link: ${activation_url}` : ''}${password ? `\nTemporary password: ${password}` : ''}`
          navigator.clipboard?.writeText(text)
        }}>Copy all</button>
        <button className="btn btn--ghost" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}

function ReassignUnitModal({ tenant, availableUnits, onClose, onDone, flash }) {
  const [newUnitId, setNewUnitId]   = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [notes, setNotes]           = useState('')
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!newUnitId) { setError('Please select a unit.'); return }
    setBusy(true); setError('')
    try {
      const body = { new_unit_id: Number(newUnitId) }
      if (monthlyRent) body.monthly_rent = Number(monthlyRent)
      if (notes.trim()) body.notes = notes.trim()
      const r = await api(`/api/admin/tenants/${tenant.id}/reassign-unit`, { method: 'POST', auth: true, body })
      flash(r.message)
      onDone()
      onClose()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const selectedUnit = availableUnits.find(u => String(u.id) === String(newUnitId))

  return (
    <Modal title={`Move tenant: ${tenant.full_name}`} onClose={onClose}>
      <p style={{ marginBottom: 16, color: 'var(--page-muted)', fontSize: '.9rem' }}>
        Currently in: <strong style={{ color: 'var(--page-text)' }}>{tenant.unit_name ? `${tenant.unit_name} · ${tenant.property_name}` : 'No unit assigned'}</strong>
      </p>
      <form className="stack" onSubmit={submit}>
        <Field label="Move to unit" hint="Only vacant units in good condition are shown.">
          <select value={newUnitId} onChange={(e) => setNewUnitId(e.target.value)} required>
            <option value="">Choose a vacant unit...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>{u.unit_name} · {u.property_name}</option>
            ))}
          </select>
        </Field>

        {selectedUnit && (
          <div style={{
            background: 'var(--page-raised)', border: '1px solid var(--page-line)',
            borderRadius: 10, padding: '12px 14px', fontSize: '.85rem', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {selectedUnit.image_url && (
              <img src={selectedUnit.image_url} alt={selectedUnit.unit_name}
                style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
            )}
            <strong style={{ fontSize: '.95rem' }}>{selectedUnit.unit_name}</strong>
            <span className="muted">{selectedUnit.property_name}</span>
            {selectedUnit.monthly_rent && <span>Rent: <strong>PHP {Number(selectedUnit.monthly_rent).toLocaleString()}</strong></span>}
            {selectedUnit.notes && <span style={{ fontStyle: 'italic', color: 'var(--page-muted)' }}>{selectedUnit.notes}</span>}
          </div>
        )}

        <Field label="Override monthly rent (optional)" hint="Leave empty to use the new unit's default rent.">
          <input type="number" min="1" step="0.01" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} placeholder="e.g. 8000" />
        </Field>

        <Field label="Note to tenant (optional)" hint="This message will be included in the notification sent to the tenant.">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Moved due to unit renovation." />
        </Field>

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy || !newUnitId}>{busy ? 'Moving...' : 'Move tenant'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Tenants() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad('/api/admin/tenants')
  const units = useLoad('/api/admin/units')
  const [edit, setEdit]       = useState(null)
  const [secret, setSecret]   = useState(null)
  const [reassign, setReassign] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy]   = useState('name-asc')
  const [toast, flash]        = useToast()

  const rawTenants     = data || []
  const allUnits       = units.data || []
  const availableUnits = allUnits.filter((unit) => unit.occupancy_status === 'vacant' && unit.condition_tag === 'good_condition' && !unit.lease_id)

  const filteredTenants = useMemo(() => {
    let result = [...rawTenants]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        (t.email && t.email.toLowerCase().includes(q)) ||
        (t.phone && t.phone.toLowerCase().includes(q)) ||
        (t.unit_name && t.unit_name.toLowerCase().includes(q)) ||
        (t.property_name && t.property_name.toLowerCase().includes(q))
      )
    }
    if (statusFilter === 'active')   result = result.filter((t) => t.is_active)
    else if (statusFilter === 'inactive')  result = result.filter((t) => !t.is_active)
    else if (statusFilter === 'verified')  result = result.filter((t) => t.email_verified || t.google_linked)
    else if (statusFilter === 'pending')   result = result.filter((t) => !t.email_verified && !t.google_linked)
    result.sort((a, b) => {
      if (sortBy === 'name-asc')  return a.full_name.localeCompare(b.full_name)
      if (sortBy === 'name-desc') return b.full_name.localeCompare(a.full_name)
      if (sortBy === 'unit-asc')  return (a.unit_name || '').localeCompare(b.unit_name || '')
      if (sortBy === 'status')    return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)
      return 0
    })
    return result
  }, [rawTenants, search, statusFilter, sortBy])

  const save = async (v) => {
    const body = clean(v)
    if (edit.id) {
      flash((await api(`/api/admin/tenants/${edit.id}`, { method: 'PUT', auth: true, body: { ...body, is_active: edit.is_active } })).message)
    } else {
      const r = await api('/api/admin/tenants', { method: 'POST', auth: true, body })
      setSecret({ username: r.data.username, email: r.data.email, password: r.temporary_password, activation_url: r.activation_url, invitation_email_status: r.invitation_email_status })
      units.reload()
    }
    reload()
  }

  const reset = async (t) => {
    if (!window.confirm(`Reset the password for ${t.full_name}?`)) return
    try {
      const r = await api(`/api/admin/tenants/${t.id}/reset-password`, { method: 'POST', auth: true, body: {} })
      setSecret({ username: t.username, email: t.email, password: r.temporary_password })
    } catch (e) { flash(e.message, 'bad') }
  }

  const resendInvite = async (t) => {
    try {
      const r = await api(`/api/admin/tenants/${t.id}/resend-invite`, { method: 'POST', auth: true, body: {} })
      flash(r.message)
      setSecret({ username: t.username, email: t.email, activation_url: r.activation_url })
    } catch (e) { flash(e.message, 'bad') }
  }

  const toggle = async (t) => {
    try {
      await api(`/api/admin/tenants/${t.id}`, { method: 'PUT', auth: true, body: { username: t.username, full_name: t.full_name, email: t.email, phone: t.phone, is_active: !t.is_active } })
      flash(t.is_active ? 'Account deactivated' : 'Account reactivated'); reload()
    } catch (e) { flash(e.message, 'bad') }
  }

  const del = async (t) => {
    if (!window.confirm(`Delete ${t.full_name}?`)) return
    try { flash((await api(`/api/admin/tenants/${t.id}`, { method: 'DELETE', auth: true })).message); reload() } catch (e) { flash(e.message, 'bad') }
  }

  return (
    <>
      <PageHead eyebrow="Manage" title="Tenants" sub="Tenants sign in with the account you create here (username or email, or Google).">
        <button className="btn btn--accent" onClick={() => setEdit({})} disabled={units.loading || !!units.error || availableUnits.length === 0}>+ Add tenant</button>
      </PageHead>
      {units.error && <p className="alert alert--error" role="alert">Could not load units: {units.error} <button className="btn btn--ghost btn--sm" onClick={units.reload}>Retry</button></p>}
      {!units.loading && !units.error && availableUnits.length === 0 && (
        <p className="alert">No vacant units in good condition. Add a unit or update one on the <a href="/admin/units">Units page</a> first.</p>
      )}

      <ViewToolbar
        view={viewMode} onViewChange={setViewMode}
        search={search} onSearchChange={setSearch}
        searchPlaceholder="Search tenants by name, unit, email..."
        filter={statusFilter} onFilterChange={setStatusFilter}
        filterOptions={[
          { value: 'all',      label: 'All Tenants' },
          { value: 'active',   label: 'Active Only' },
          { value: 'inactive', label: 'Deactivated' },
          { value: 'verified', label: 'Verified' },
          { value: 'pending',  label: 'Pending Activation' },
        ]}
        sort={sortBy} onSortChange={setSortBy}
        sortOptions={[
          { value: 'name-asc',  label: 'Name (A to Z)' },
          { value: 'name-desc', label: 'Name (Z to A)' },
          { value: 'unit-asc',  label: 'Unit Name' },
          { value: 'status',    label: 'Active First' },
        ]}
      >
        <span className="muted" style={{ fontSize: '.84rem' }}>{filteredTenants.length} {filteredTenants.length === 1 ? 'tenant' : 'tenants'}</span>
      </ViewToolbar>

      <State loading={loading} error={error} empty={data?.length === 0 && 'No tenants yet.'}>
        {data && filteredTenants.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            No tenants match your search and filter criteria.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid">
            {filteredTenants.map((t) => (
              <div key={t.id} className="tenant-card">
                <div className="tenant-card__header">
                  <Avatar user={t} />
                  <div className="tenant-card__info">
                    <h3 className="tenant-card__name">{t.full_name}</h3>
                    <div className="tenant-card__username">@{t.username}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <StatusPill value={t.is_active ? 'active' : 'ended'} />
                    {t.email_verified || t.google_linked
                      ? <span className="tag tag--ok" style={{ fontSize: '.7rem', padding: '2px 6px' }}>Verified</span>
                      : <span className="tag tag--warn" style={{ fontSize: '.7rem', padding: '2px 6px' }}>Pending</span>}
                  </div>
                </div>

                <div className="tenant-card__details">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg className="tenant-card__detail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5M5 9v12h14V9M9 21v-7h6v7" /></svg>
                    <strong>
                      {t.unit_name ? `${t.unit_name} · ${t.property_name}` : <span className="muted">No assigned unit</span>}
                    </strong>
                    {t.lease_status === 'offered' && <StatusPill value="offered" />}
                    {t.lease_status === 'scheduled' && <span className="muted">Move-in {dateFmt(t.lease_start_date)}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg className="tenant-card__detail-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg><span style={{ wordBreak: 'break-all' }}>{t.email}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg className="tenant-card__detail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-8-8l2-2-1-5Z" /></svg><span>{t.phone || 'No phone'}</span>
                  </div>
                </div>

                <div className="tenant-card__foot">
                  {t.is_active && (
                    <button
                      type="button"
                      className="tenant-message-button"
                      aria-label={`Message ${t.full_name}`}
                      title={`Message ${t.full_name}`}
                      onClick={() => navigate(`/admin/chats?tenant=${t.id}`)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.65L4 20l1.2-4.1A7.5 7.5 0 1 1 20 11.5Z" />
                        <path d="M8.5 11.5h7M8.5 14.5h4" />
                      </svg>
                    </button>
                  )}
                  <TenantActionMenu
                    tenant={t}
                    onEdit={() => setEdit(t)}
                    onMove={() => setReassign(t)}
                    onInvite={() => resendInvite(t)}
                    onReset={() => reset(t)}
                    onToggle={() => toggle(t)}
                    onDelete={() => del(t)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table rows={filteredTenants}
            columns={[
              { key: 'full_name', label: 'Tenant', render: (r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar user={r} />
                  <div><strong>{r.full_name}</strong></div>
                </div>
              )},
              { key: 'username',   label: 'Username' },
              { key: 'email',      label: 'Email' },
              { key: 'phone',      label: 'Phone' },
              { key: 'unit_name',  label: 'Unit', render: (r) => (
                <span>
                  {r.unit_name ? `${r.unit_name} · ${r.property_name}` : '—'}
                  {r.lease_status === 'offered' && <> · <StatusPill value="offered" /></>}
                  {r.lease_status === 'scheduled' && <> · Move-in {dateFmt(r.lease_start_date)}</>}
                </span>
              )},
              { key: 'email_verified', label: 'Verification', render: (r) => (
                r.email_verified || r.google_linked
                  ? <span className="tag tag--ok">Verified</span>
                  : <span className="tag tag--warn">Pending activation</span>
              )},
              { key: 'is_active', label: 'Account', render: (r) => <StatusPill value={r.is_active ? 'active' : 'ended'} /> },
            ]}
            actions={(r) => (
              <div className="tenant-row-actions">
                {r.is_active && (
                  <button
                    type="button"
                    className="tenant-message-button"
                    aria-label={`Message ${r.full_name}`}
                    title={`Message ${r.full_name}`}
                    onClick={() => navigate(`/admin/chats?tenant=${r.id}`)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.65L4 20l1.2-4.1A7.5 7.5 0 1 1 20 11.5Z" />
                      <path d="M8.5 11.5h7M8.5 14.5h4" />
                    </svg>
                  </button>
                )}
                <TenantActionMenu
                  tenant={r}
                  onEdit={() => setEdit(r)}
                  onMove={() => setReassign(r)}
                  onInvite={() => resendInvite(r)}
                  onReset={() => reset(r)}
                  onToggle={() => toggle(r)}
                  onDelete={() => del(r)}
                />
              </div>
            )} />
        )}
      </State>

      {edit?.id && <FormModal title="Edit tenant" fields={FIELDS} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {edit && !edit.id && <NewTenantForm units={availableUnits} onSubmit={save} onClose={() => setEdit(null)} />}
      {secret && <Credentials {...secret} onClose={() => setSecret(null)} />}
      {reassign && (
        <ReassignUnitModal
          tenant={reassign}
          availableUnits={availableUnits}
          onClose={() => setReassign(null)}
          onDone={() => { reload(); units.reload() }}
          flash={flash}
        />
      )}
      {toast}
    </>
  )
}
