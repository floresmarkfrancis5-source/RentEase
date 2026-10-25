import { useState } from 'react'
import { FormModal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'

const FILTERS = ['', 'unpaid', 'overdue', 'paid']

export default function Bills() {
  const [status, setStatus] = useState('')
  const { data, error, loading, reload } = useLoad(`/api/admin/bills${status ? `?status=${status}` : ''}`)
  const [gen, setGen] = useState(false)
  const [pay, setPay] = useState(null)
  const [toast, flash] = useToast()

  const generate = async (v) => { flash((await api('/api/admin/bills/generate', { method: 'POST', auth: true, body: { month: v.month } })).message); reload() }
  const record = async (v) => {
    const r = await api('/api/admin/payments', { method: 'POST', auth: true, body: { bill_id: pay.id, method: v.method, notes: v.notes || null } })
    flash(r.message); reload()
  }
  const remind = async (b) => {
    try { flash((await api(`/api/admin/bills/${b.id}/remind`, { method: 'POST', auth: true, body: {} })).message) } catch (e) { flash(e.message, 'bad') }
  }
  const pdf = (b) => downloadPdf(`/api/bills/${b.id}/statement`, `statement-${b.period_month}-${b.unit_name}.pdf`).catch((e) => flash(e.message, 'bad'))
  const del = async (b) => {
    if (!window.confirm('Delete this unpaid bill?')) return
    try { flash((await api(`/api/admin/bills/${b.id}`, { method: 'DELETE', auth: true })).message); reload() } catch (e) { flash(e.message, 'bad') }
  }

  return (
    <>
      <PageHead eyebrow="Billing" title="Bills" sub="One bill per active lease per month. Generating twice never creates duplicates.">
        <button className="btn btn--accent" onClick={() => setGen(true)}>Generate monthly bills</button>
      </PageHead>
      <div className="segmented" role="tablist" aria-label="Filter bills">
        {FILTERS.map((f) => <button key={f} className={status === f ? 'is-on' : ''} onClick={() => setStatus(f)}>{f || 'All'}</button>)}
      </div>
      <State loading={loading} error={error} empty={data?.length === 0 && 'No bills match.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'period_month', label: 'Month', render: (r) => <strong>{r.period_month}</strong> },
              { key: 'tenant_name', label: 'Tenant', render: (r) => `${r.tenant_name} · ${r.unit_name}` },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
              { key: 'due_date', label: 'Due', render: (r) => dateFmt(r.due_date) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => (
              <>
                {r.status !== 'paid' && <button className="btn btn--accent btn--sm" onClick={() => setPay(r)}>Record payment</button>}
                {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => remind(r)}>Send reminder</button>}
                <button className="btn btn--ghost btn--sm" onClick={() => pdf(r)}>PDF</button>
                {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => del(r)}>Delete</button>}
              </>
            )} />
        )}
      </State>
      {gen && <FormModal title="Generate bills" submitLabel="Generate" onSubmit={generate} onClose={() => setGen(false)}
        fields={[{ name: 'month', label: 'Month', type: 'month', default: new Date().toISOString().slice(0, 7), hint: 'Bills every active lease for this month. Safe to run again.' }]} />}
      {pay && <FormModal title={`Record payment · ${pay.tenant_name} · ${pay.period_month}`} submitLabel={`Mark ${money(pay.amount)} paid`} onSubmit={record} onClose={() => setPay(null)}
        fields={[
          { name: 'method', label: 'Method', type: 'select', default: 'cash', options: [{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank transfer' }] },
          { name: 'notes', label: 'Notes (optional)' },
        ]} />}
      {toast}
    </>
  )
}
