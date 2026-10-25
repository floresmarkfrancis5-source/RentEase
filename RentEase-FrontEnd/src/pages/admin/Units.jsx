import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, money } from '../../lib/api'

export default function Units() {
  const { data, error, loading, reload } = useLoad('/api/admin/units')
  const props = useLoad('/api/admin/properties')
  const [edit, setEdit] = useState(null)
  const [toast, flash] = useToast()

  const fields = [
    { name: 'property_id', label: 'Property', type: 'select', placeholder: 'Choose…', options: (props.data || []).map((p) => ({ value: p.id, label: p.name })) },
    { name: 'unit_name', label: 'Unit name / room' },
    { name: 'monthly_rent', label: 'Monthly rent (PHP)', type: 'number', step: '0.01', min: 0 },
    { name: 'capacity', label: 'Capacity (people)', type: 'number', min: 1, default: 1 },
    { name: 'condition_tag', label: 'Condition', type: 'select', default: 'good_condition', options: [{ value: 'good_condition', label: 'Good condition' }, { value: 'under_maintenance', label: 'Under maintenance' }] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const save = async (v) => {
    const body = clean(v)
    const r = edit.id
      ? await api(`/api/admin/units/${edit.id}`, { method: 'PUT', auth: true, body })
      : await api('/api/admin/units', { method: 'POST', auth: true, body })
    flash(r.message); reload()
  }
  const del = async (u) => {
    if (!window.confirm(`Delete unit ${u.unit_name}?`)) return
    try { flash((await api(`/api/admin/units/${u.id}`, { method: 'DELETE', auth: true })).message); reload() } catch (e) { flash(e.message, 'bad') }
  }

  return (
    <>
      <PageHead eyebrow="Manage" title="Units" sub="Rooms and apartments, with their current tenant.">
        <button className="btn btn--accent" onClick={() => setEdit({})} disabled={!props.data?.length}>+ Add unit</button>
      </PageHead>
      {props.data?.length === 0 && <p className="alert">Add a property first, then its units.</p>}
      <State loading={loading} error={error} empty={data?.length === 0 && 'No units yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'unit_name', label: 'Unit', render: (r) => <strong>{r.unit_name}</strong> },
              { key: 'property_name', label: 'Property' },
              { key: 'monthly_rent', label: 'Rent', align: 'right', render: (r) => money(r.monthly_rent) },
              { key: 'occupancy_status', label: 'Occupancy', render: (r) => <StatusPill value={r.occupancy_status} /> },
              { key: 'condition_tag', label: 'Condition', render: (r) => <StatusPill value={r.condition_tag} /> },
              { key: 'tenant_name', label: 'Tenant' },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(r)}>Delete</button>
              </>
            )} />
        )}
      </State>
      {edit && <FormModal title={edit.id ? 'Edit unit' : 'Add unit'} fields={fields} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {toast}
    </>
  )
}
