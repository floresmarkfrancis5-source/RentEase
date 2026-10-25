import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'

export default function Bills() {
  const { data, error, loading, reload } = useLoad('/api/my/bills')
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(null)
  const [toast, flash] = useToast()
  const handled = useRef(false)

  // Returning from PayMongo: ask the API to confirm the payment (covers a late webhook).
  useEffect(() => {
    const id = params.get('payment')
    const result = params.get('result')
    if (!id || handled.current) return
    handled.current = true
    setParams({}, { replace: true })
    if (result === 'cancelled') { flash('Payment cancelled. You have not been charged.', 'bad'); return }
    api(`/api/my/payments/${id}/verify`, { method: 'POST', auth: true, body: {} })
      .then((r) => { flash(r.data.status === 'paid' ? `Payment received. Receipt ${r.data.receipt_no}` : 'Payment is still processing. Refresh in a moment.', r.data.status === 'paid' ? 'ok' : 'warn'); reload() })
      .catch((e) => flash(e.message, 'bad'))
  }, [params, setParams, flash, reload])

  const pay = async (b) => {
    setBusy(b.id)
    try {
      const r = await api(`/api/my/bills/${b.id}/pay`, { method: 'POST', auth: true, body: {} })
      window.location.assign(r.checkout_url)
    } catch (e) { flash(e.message, 'bad'); setBusy(null) }
  }
  const statement = (b) => downloadPdf(`/api/bills/${b.id}/statement`, `statement-${b.period_month}.pdf`).catch((e) => flash(e.message, 'bad'))

  return (
    <>
      <PageHead eyebrow="My rent" title="My bills" sub="Pay online with GCash, Maya or card through PayMongo. Receipts are emailed and downloadable." />
      <State loading={loading} error={error} empty={data?.length === 0 && 'No bills yet.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'period_month', label: 'Month', render: (r) => <strong>{r.period_month}</strong> },
              { key: 'description', label: 'Description' },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
              { key: 'due_date', label: 'Due', render: (r) => dateFmt(r.due_date) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => (
              <>
                {r.status !== 'paid' && <button className="btn btn--accent btn--sm" disabled={busy === r.id} onClick={() => pay(r)}>{busy === r.id ? 'Redirecting…' : 'Pay now'}</button>}
                <button className="btn btn--ghost btn--sm" onClick={() => statement(r)}>{r.status === 'paid' ? 'Statement' : 'Bill PDF'}</button>
              </>
            )} />
        )}
      </State>
      <Receipts flash={flash} />
      {toast}
    </>
  )
}

function Receipts({ flash }) {
  const { data } = useLoad('/api/my/payments')
  if (!data?.length) return null
  return (
    <>
      <h2 className="panel__title" style={{ margin: '36px 0 14px' }}>Receipts</h2>
      <Table rows={data}
        columns={[
          { key: 'receipt_no', label: 'Receipt', render: (r) => <strong>{r.receipt_no}</strong> },
          { key: 'bill_description', label: 'For' },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
          { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at) },
        ]}
        actions={(r) => <button className="btn btn--ghost btn--sm" onClick={() => downloadPdf(`/api/payments/${r.id}/receipt`, `${r.receipt_no}.pdf`).catch((e) => flash(e.message, 'bad'))}>Download PDF</button>} />
    </>
  )
}
