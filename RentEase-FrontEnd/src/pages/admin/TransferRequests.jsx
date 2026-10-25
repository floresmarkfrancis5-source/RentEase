import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'

export default function TransferRequests() {
  const { data, error, loading, reload } = useLoad('/api/admin/transfer-requests')
  const [reject, setReject] = useState(null)
  const [toast, flash] = useToast()

  const decide = async (row, status, admin_note = null) => {
    try {
      const r = await api(`/api/admin/transfer-requests/${row.id}`, {
        method: 'PATCH', auth: true, body: { status, admin_note },
      })
      flash(r.message)
      reload()
    } catch (e) { flash(e.message, 'bad') }
  }

  const submitReject = async ({ admin_note }) => {
    await decide(reject, 'rejected', admin_note || null)
    setReject(null)
  }

  return (
    <>
      <PageHead eyebrow="Operations" title="Transfer requests" sub="Review tenant requests to move to another available unit." />
      <State loading={loading} error={error} empty={data?.length === 0 && 'No transfer requests yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'tenant_name', label: 'Tenant', render: (r) => <strong>{r.tenant_name}</strong> },
              { key: 'current_unit_name', label: 'Current unit', render: (r) => `${r.current_unit_name} · ${r.current_property_name}` },
              { key: 'requested_unit_name', label: 'Requested unit', render: (r) => `${r.requested_unit_name} · ${r.requested_property_name}` },
              { key: 'reason', label: 'Reason' },
              { key: 'created_at', label: 'Requested', render: (r) => dateFmt(r.created_at) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => r.status === 'pending' && (
              <>
                <button className="btn btn--accent btn--sm" onClick={() => decide(r, 'approved')}>Approve</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setReject(r)}>Reject</button>
              </>
            )} />
        )}
      </State>
      {reject && <FormModal title={`Reject ${reject.tenant_name}’s request`} submitLabel="Reject request"
        fields={[{ name: 'admin_note', label: 'Optional note to tenant', type: 'textarea' }]}
        onSubmit={submitReject} onClose={() => setReject(null)} />}
      {toast}
    </>
  )
}
