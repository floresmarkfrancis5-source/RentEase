import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'

export default function Maintenance() {
  const { data, error, loading, reload } = useLoad('/api/admin/maintenance')
  const [edit, setEdit] = useState(null)
  const [toast, flash] = useToast()

  const save = async (v) => {
    flash((await api(`/api/admin/maintenance/${edit.id}`, { method: 'PUT', auth: true, body: { status: v.status, priority: v.priority, admin_notes: v.admin_notes || null } })).message)
    reload()
  }
  return (
    <>
      <PageHead eyebrow="Operations" title="Maintenance requests" sub="Repair requests from your tenants. The tenant is emailed when you update one." />
      <State loading={loading} error={error} empty={data?.length === 0 && 'No requests. Nothing is broken.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'title', label: 'Request', render: (r) => <><strong>{r.title}</strong><br /><small className="muted">{r.description}</small></> },
              { key: 'tenant_name', label: 'Tenant', render: (r) => `${r.tenant_name} · ${r.unit_name}` },
              { key: 'priority', label: 'Priority', render: (r) => <StatusPill value={r.priority} /> },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
              { key: 'created_at', label: 'Sent', render: (r) => dateFmt(r.created_at) },
            ]}
            actions={(r) => <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>Update</button>} />
        )}
      </State>
      {edit && <FormModal title={edit.title} initial={edit} onSubmit={save} onClose={() => setEdit(null)}
        fields={[
          { name: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In progress' }, { value: 'resolved', label: 'Resolved' }] },
          { name: 'priority', label: 'Priority', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
          { name: 'admin_notes', label: 'Note to tenant', type: 'textarea' },
        ]} />}
      {toast}
    </>
  )
}
