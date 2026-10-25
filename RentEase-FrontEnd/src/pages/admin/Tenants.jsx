import { useState } from 'react'
import { FormModal, Modal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api } from '../../lib/api'

const FIELDS = [
  { name: 'username', label: 'Username', hint: 'Choose a unique username the tenant can use to sign in.' },
  { name: 'full_name', label: 'Full name' },
  { name: 'email', label: 'Email', type: 'email', hint: 'Used to log in and to receive bills and receipts.' },
  { name: 'phone', label: 'Phone', type: 'tel' },
]

function Credentials({ username, email, password, onClose }) {
  return (
    <Modal title="Tenant login" onClose={onClose}>
      <p>Give these details to the tenant. The temporary password is shown <strong>only once</strong>, and they must change it at first login.</p>
      <div className="secret">
        <span>Username</span><code>{username}</code>
        <span>or email</span><code>{email}</code>
        <span>Temporary password</span><code>{password}</code>
      </div>
      <div className="modal__foot">
        <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(`Username: ${username}\nEmail: ${email}\nPassword: ${password}`)}>Copy</button>
        <button className="btn btn--accent" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}

export default function Tenants() {
  const { data, error, loading, reload } = useLoad('/api/admin/tenants')
  const units = useLoad('/api/admin/units')
  const [edit, setEdit] = useState(null)
  const [secret, setSecret] = useState(null)
  const [toast, flash] = useToast()
  const availableUnits = (units.data || []).filter((unit) =>
    unit.occupancy_status === 'vacant' && unit.condition_tag === 'good_condition'
  )

  const fields = edit?.id ? FIELDS : [
    ...FIELDS,
    { name: 'unit_id', label: 'Assign unit', type: 'select', required: true,
      placeholder: units.loading ? 'Loading available units…' : units.error ? 'Unit list could not be loaded' : availableUnits.length ? 'Choose a vacant unit in good condition…' : 'No assignable units',
      hint: units.error
        ? `Could not load units: ${units.error}. Close this form and retry loading the unit list.`
        : availableUnits.length === 0 && !units.loading
          ? 'Create a unit or change an existing unit to vacant and good condition before adding a tenant.'
          : 'The tenant will be assigned to this unit immediately, and an active lease will be created.',
      options: availableUnits.map((unit) => ({ value: unit.id, label: `${unit.unit_name} · ${unit.property_name}` })) },
    { name: 'start_date', label: 'Lease start date', type: 'date', default: new Date().toISOString().slice(0, 10) },
    { name: 'monthly_rent', label: 'Monthly rent (optional)', type: 'number', step: '0.01', hint: 'Leave empty to use the unit rent.' },
    { name: 'deposit', label: 'Deposit', type: 'number', step: '0.01', default: 0 },
    { name: 'due_day', label: 'Due day of month (1–28)', type: 'number', min: 1, default: 5 },
  ]

  const save = async (v) => {
    const body = clean(v)
    if (edit.id) {
      flash((await api(`/api/admin/tenants/${edit.id}`, { method: 'PUT', auth: true, body: { ...body, is_active: edit.is_active } })).message)
    } else {
      const r = await api('/api/admin/tenants', { method: 'POST', auth: true, body })
      setSecret({ username: r.data.username, email: r.data.email, password: r.temporary_password })
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
      {units.error && <p className="alert alert--error" role="alert">
        Could not load assignable units: {units.error}{' '}
        <button className="btn btn--ghost btn--sm" onClick={units.reload}>Retry</button>
      </p>}
      {!units.loading && !units.error && availableUnits.length === 0 && (
        <p className="alert">There are no vacant units in good condition to assign. Add a unit or update a unit on the <a href="/admin/units">Units page</a> first.</p>
      )}
      <State loading={loading} error={error} empty={data?.length === 0 && 'No tenants yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'full_name', label: 'Name', render: (r) => <strong>{r.full_name}</strong> },
              { key: 'username', label: 'Username' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'unit_name', label: 'Unit', render: (r) => (r.unit_name ? `${r.unit_name} · ${r.property_name}` : '—') },
              { key: 'is_active', label: 'Account', render: (r) => <StatusPill value={r.is_active ? 'active' : 'ended'} /> },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => reset(r)}>Reset password</button>
                <button className="btn btn--ghost btn--sm" onClick={() => toggle(r)}>{r.is_active ? 'Deactivate' : 'Reactivate'}</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(r)}>Delete</button>
              </>
            )} />
        )}
      </State>
      {edit && <FormModal title={edit.id ? 'Edit tenant' : 'Add tenant'} fields={fields} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {secret && <Credentials {...secret} onClose={() => setSecret(null)} />}
      {toast}
    </>
  )
}
