import { PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { dateFmt, downloadPdf, money } from '../../lib/api'

export default function Payments() {
  const { data, error, loading } = useLoad('/api/admin/payments')
  const [toast, flash] = useToast()
  const receipt = (p) => downloadPdf(`/api/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`).catch((e) => flash(e.message, 'bad'))

  return (
    <>
      <PageHead eyebrow="Billing" title="Payments" sub="Every payment, with its official receipt." />
      <State loading={loading} error={error} empty={data?.length === 0 && 'No payments yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'receipt_no', label: 'Receipt', render: (r) => <strong>{r.receipt_no || '—'}</strong> },
              { key: 'tenant_name', label: 'Tenant', render: (r) => `${r.tenant_name} · ${r.unit_name}` },
              { key: 'period_month', label: 'For' },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
              { key: 'method', label: 'Method', render: (r) => r.method.replace('_', ' ') },
              { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => r.status === 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => receipt(r)}>Receipt PDF</button>} />
        )}
      </State>
      {toast}
    </>
  )
}
