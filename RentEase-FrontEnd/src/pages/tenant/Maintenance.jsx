import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'

const FIELDS = [
  { name: 'title', label: 'What needs fixing?', placeholder: 'e.g. Leaking kitchen tap' },
  { name: 'description', label: 'Details', type: 'textarea' },
  { name: 'priority', label: 'How urgent?', type: 'select', default: 'medium', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'Urgent' }] },
]

export default function Maintenance() {
  const { data, error, loading, reload } = useLoad('/api/my/maintenance')
  const [open, setOpen] = useState(false)
  const [toast, flash] = useToast()
  const send = async (v) => { flash((await api('/api/my/maintenance', { method: 'POST', auth: true, body: v })).message); reload() }

  return (
    <>
      <PageHead eyebrow="My rent" title="Repair requests" sub="Tell your landlord what needs fixing and follow its status.">
        <button className="btn btn--accent" onClick={() => setOpen(true)}>+ New request</button>
      </PageHead>
      <State loading={loading} error={error} empty={data?.length === 0 && 'No requests yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'title', label: 'Request', render: (r) => <><strong>{r.title}</strong><br /><small className="muted">{r.description}</small></> },
              { key: 'priority', label: 'Priority', render: (r) => <StatusPill value={r.priority} /> },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
              { key: 'admin_notes', label: 'Landlord note' },
              { key: 'created_at', label: 'Sent', render: (r) => dateFmt(r.created_at) },
            ]} />
        )}
      </State>
      {open && <FormModal title="New repair request" submitLabel="Send request" fields={FIELDS} onSubmit={send} onClose={() => setOpen(false)} />}
      {toast}
    </>
  )
}
