import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, money } from '../../lib/api'

export default function Transfers() {
  const { data, error, loading, reload } = useLoad('/api/my/transfer-requests')
  const units = useLoad('/api/my/available-units')
  const summary = useLoad('/api/my/summary')
  const [open, setOpen] = useState(false)
  const [toast, flash] = useToast()
  const pending = data?.some((r) => r.status === 'pending')

  const send = async (values) => {
    const r = await api('/api/my/transfer-requests', { method: 'POST', auth: true, body: values })
    flash(r.message)
    reload()
  }

  const choices = (units.data || []).map((u) => ({
    value: u.id,
    label: `${u.unit_name} · ${u.property_name} · ${money(u.monthly_rent)}/month`,
  }))

  return (
    <>
      <PageHead eyebrow="My rent" title="Unit transfer" sub="Ask your landlord to move you to a different available unit. Your current lease stays active until your request is approved.">
        <button className="btn btn--accent" onClick={() => setOpen(true)} disabled={pending || !choices.length || !summary.data?.lease}>
          + Request unit transfer
        </button>
      </PageHead>
      {summary.data && <p className="muted" style={{ marginBottom: 18 }}>
        Current unit: {summary.data.lease ? `${summary.data.lease.unit_name} · ${summary.data.lease.property_name}` : 'No active lease'}
        {pending ? ' · You already have a pending request.' : ''}
      </p>}
      {!pending && summary.data?.lease && !choices.length && <p className="alert">There are no vacant units in good condition to request right now.</p>}
      <State loading={loading} error={error} empty={data?.length === 0 && 'You have not requested a unit transfer.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'current_unit_name', label: 'Current unit', render: (r) => `${r.current_unit_name} · ${r.current_property_name}` },
              { key: 'requested_unit_name', label: 'Requested unit', render: (r) => `${r.requested_unit_name} · ${r.requested_property_name}` },
              { key: 'reason', label: 'Reason' },
              { key: 'created_at', label: 'Requested', render: (r) => dateFmt(r.created_at) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
              { key: 'admin_note', label: 'Landlord note' },
            ]} />
        )}
      </State>
      {open && <FormModal title="Request unit transfer" submitLabel="Send request"
        fields={[
          { name: 'requested_unit_id', label: 'Choose an available unit', type: 'select', placeholder: 'Choose a unit…', options: choices },
          { name: 'reason', label: 'Reason (optional)', type: 'textarea' },
        ]}
        onSubmit={send} onClose={() => setOpen(false)} />}
      {toast}
    </>
  )
}
