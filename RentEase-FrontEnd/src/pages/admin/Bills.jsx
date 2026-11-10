import { useMemo, useState } from 'react'
import { FormModal, Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

const FILTERS = ['', 'unpaid', 'overdue', 'paid']
const STATUS_LABELS = { '': 'All', unpaid: 'Unpaid', overdue: 'Overdue', paid: 'Paid' }

export default function Bills() {
  const [status, setStatus] = useState('')
  const [month, setMonth] = useState('')
  const { data, error, loading, reload } = useLoad(
    `/api/admin/bills${buildQuery({ status, month })}`
  )
  const [gen, setGen] = useState(false)
  const [pay, setPay] = useState(null)
  const [detail, setDetail] = useState(null)
  const [adjust, setAdjust] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('month-desc')
  const [toast, flash] = useToast()

  const rawBills = data || []

  // Filter & sort
  const filteredBills = useMemo(() => {
    let result = [...rawBills]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (b) =>
          (b.tenant_name && b.tenant_name.toLowerCase().includes(q)) ||
          (b.unit_name && b.unit_name.toLowerCase().includes(q)) ||
          (b.property_name && b.property_name.toLowerCase().includes(q)) ||
          (b.period_month && b.period_month.toLowerCase().includes(q)) ||
          (b.notes && b.notes.toLowerCase().includes(q)) ||
          String(b.amount).includes(q)
      )
    }

    result.sort((a, b) => {
      if (sortBy === 'month-desc') return (b.period_month || '').localeCompare(a.period_month || '')
      if (sortBy === 'month-asc') return (a.period_month || '').localeCompare(b.period_month || '')
      if (sortBy === 'amount-desc') return Number(b.amount || 0) - Number(a.amount || 0)
      if (sortBy === 'amount-asc') return Number(a.amount || 0) - Number(b.amount || 0)
      if (sortBy === 'tenant-asc') return (a.tenant_name || '').localeCompare(b.tenant_name || '')
      if (sortBy === 'due-asc') return (a.due_date || '').localeCompare(b.due_date || '')
      return 0
    })

    return result
  }, [rawBills, search, sortBy])

  // Summary counts from current filtered data
  const stats = rawBills.reduce((acc, b) => {
    acc.total += Number(b.amount)
    if (b.status === 'paid') acc.collected += Number(b.amount)
    if (b.status === 'unpaid' || b.status === 'overdue') acc.outstanding += Number(b.amount)
    return acc
  }, { total: 0, collected: 0, outstanding: 0 })

  const generate = async (v) => {
    const r = await api('/api/admin/bills/generate', { method: 'POST', auth: true, body: { month: v.month } })
    flash(r.message)
    reload()
  }

  const recordPayment = async (v) => {
    const r = await api('/api/admin/payments', {
      method: 'POST', auth: true,
      body: { bill_id: pay.id, method: v.method, notes: v.notes || null }
    })
    flash(r.message)
    reload()
    if (detail?.id === pay.id) detailReload()
  }

  const adjustBill = async (v) => {
    // Update a bill's amount and/or notes via PATCH (extend backend if needed)
    const r = await api(`/api/admin/bills/${adjust.id}`, {
      method: 'PATCH', auth: true,
      body: { amount: v.amount || null, notes: v.notes || null }
    })
    flash(r.message || 'Bill updated.')
    reload()
    setAdjust(null)
  }

  const remind = async (b) => {
    try {
      flash((await api(`/api/admin/bills/${b.id}/remind`, { method: 'POST', auth: true, body: {} })).message)
    } catch (e) { flash(e.message, 'bad') }
  }

  const pdf = (b) =>
    downloadPdf(`/api/bills/${b.id}/statement`, `statement-${b.period_month}-${b.unit_name}.pdf`)
      .catch((e) => flash(e.message, 'bad'))

  const del = async (b) => {
    if (!window.confirm('Delete this unpaid bill? This cannot be undone.')) return
    try {
      flash((await api(`/api/admin/bills/${b.id}`, { method: 'DELETE', auth: true })).message)
      reload()
    } catch (e) { flash(e.message, 'bad') }
  }

  // For bulk generation — generate for the previous/current/next month at once
  const bulkGenerate = async () => {
    if (!window.confirm('Generate bills for ALL active leases this month?')) return
    try {
      const r = await api('/api/admin/bills/generate', { method: 'POST', auth: true, body: { month: new Date().toISOString().slice(0, 7) } })
      flash(r.message)
      reload()
    } catch (e) { flash(e.message, 'bad') }
  }

  const unpaidCount = rawBills.filter((b) => b.status === 'unpaid').length
  const overdueCount = rawBills.filter((b) => b.status === 'overdue').length

  return (
    <>
      <PageHead eyebrow="Billing" title="Bills" sub="One bill per active lease per month. Generating twice never creates duplicates.">
        <button className="btn btn--ghost" onClick={bulkGenerate}>Quick generate (this month)</button>
        <button className="btn btn--accent" onClick={() => setGen(true)}>Generate bills…</button>
      </PageHead>
      <p className="alert" style={{ marginTop: 0 }}>Bills are amounts tenants owe for a rental month. Generate bills after leases start; the Payments page shows money actually received and its receipt. A bill is not a payment.</p>

      {/* Summary cards */}
      {data && data.length > 0 && (
        <div className="bill-stats">
          <div className="bill-stat">
            <span className="bill-stat__label">Total billed</span>
            <span className="bill-stat__value">{money(stats.total)}</span>
          </div>
          <div className="bill-stat bill-stat--good">
            <span className="bill-stat__label">Collected</span>
            <span className="bill-stat__value">{money(stats.collected)}</span>
          </div>
          <div className="bill-stat bill-stat--warn">
            <span className="bill-stat__label">Outstanding</span>
            <span className="bill-stat__value">{money(stats.outstanding)}</span>
          </div>
          {overdueCount > 0 && (
            <div className="bill-stat bill-stat--bad">
              <span className="bill-stat__label">Overdue bills</span>
              <span className="bill-stat__value">{overdueCount}</span>
            </div>
          )}
        </div>
      )}

      {/* ViewToolbar */}
      <ViewToolbar
        view={viewMode}
        onViewChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bills by tenant, unit, month…"
        filter={status}
        onFilterChange={setStatus}
        filterOptions={[
          { value: '', label: `All Statuses (${rawBills.length})` },
          { value: 'unpaid', label: `Unpaid (${unpaidCount})` },
          { value: 'overdue', label: `Overdue (${overdueCount})` },
          { value: 'paid', label: 'Paid' },
        ]}
        sort={sortBy}
        onSortChange={setSortBy}
        sortOptions={[
          { value: 'month-desc', label: 'Month (Newest)' },
          { value: 'month-asc', label: 'Month (Oldest)' },
          { value: 'amount-desc', label: 'Amount (High to Low)' },
          { value: 'amount-asc', label: 'Amount (Low to High)' },
          { value: 'tenant-asc', label: 'Tenant Name (A–Z)' },
          { value: 'due-asc', label: 'Due Date (Soonest)' },
        ]}
      >
        <input
          type="month"
          aria-label="Filter by month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ maxWidth: 160 }}
        />
        {(status || month || search) && (
          <button className="btn btn--ghost btn--sm" onClick={() => { setStatus(''); setMonth(''); setSearch('') }}>
            Clear
          </button>
        )}
      </ViewToolbar>

      <State loading={loading} error={error} empty={data?.length === 0 && 'No bills match your filters.'}>
        {data && filteredBills.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            No bills match your search and filter criteria.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid">
            {filteredBills.map((r) => (
              <div key={r.id} className="request-card">
                <div className="request-card__head">
                  <div>
                    <h3 className="request-card__title">{r.period_month}</h3>
                    <div className="request-card__sub">{r.tenant_name} · {r.unit_name} ({r.property_name})</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div style={{ background: 'var(--page-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--page-line)' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent, #6366f1)' }}>
                    {money(r.amount)}
                  </div>
                  {Number(r.late_fee_amount) > 0 && (
                    <small className="muted">
                      Includes {money(r.late_fee_amount)} late fee
                    </small>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '.84rem' }}>
                    <span className="muted">Due: {dateFmt(r.due_date)}</span>
                    {r.status === 'overdue' && (
                      <span className="tag tag--danger" style={{ fontSize: '.72rem', padding: '2px 6px' }}>
                        {overdueDays(r.due_date)}d overdue
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--page-muted)', fontStyle: 'italic' }}>
                      {r.notes}
                    </div>
                  )}
                </div>

                <div className="request-card__foot">
                  <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>View</button>
                  {r.status !== 'paid' && <button className="btn btn--accent btn--sm" onClick={() => setPay(r)}>Record pay</button>}
                  {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => remind(r)}>Remind</button>}
                  <button className="btn btn--ghost btn--sm" onClick={() => pdf(r)}>Download statement</button>
                  {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => setAdjust(r)}>Adjust</button>}
                  {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)' }} onClick={() => del(r)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table
            rows={filteredBills}
            columns={[
              { key: 'period_month', label: 'Month', render: (r) => <strong>{r.period_month}</strong> },
              { key: 'tenant_name', label: 'Tenant', render: (r) => <>{r.tenant_name}<br /><small className="muted">{r.unit_name} · {r.property_name}</small></> },
              {
                key: 'amount', label: 'Amount', align: 'right', render: (r) => (
                  <>
                    {money(r.amount)}
                    {Number(r.late_fee_amount) > 0 && <><br /><small className="muted">Includes {money(r.late_fee_amount)} late fee</small></>}
                    {r.notes && <><br /><small className="muted">{r.notes}</small></>}
                  </>
                )
              },
              {
                key: 'due_date', label: 'Due', render: (r) => (
                  <>
                    {dateFmt(r.due_date)}
                    {r.status === 'overdue' && (
                      <><br /><small style={{ color: 'var(--danger)' }}>
                        {overdueDays(r.due_date)} days overdue
                      </small></>
                    )}
                  </>
                )
              },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>View</button>
                {r.status !== 'paid' && <button className="btn btn--accent btn--sm" onClick={() => setPay(r)}>Record payment</button>}
                {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => remind(r)}>Remind</button>}
                <button className="btn btn--ghost btn--sm" onClick={() => pdf(r)}>Download</button>
                {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => setAdjust(r)}>Adjust</button>}
                {r.status !== 'paid' && <button className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)' }} onClick={() => del(r)}>Delete</button>}
              </>
            )}
          />
        )}
      </State>

      {/* Modals */}
      {gen && (
        <FormModal title="Generate bills" submitLabel="Generate" onSubmit={generate} onClose={() => setGen(false)}
          fields={[{
            name: 'month', label: 'Month', type: 'month',
            default: new Date().toISOString().slice(0, 7),
            hint: 'Bills every active lease for this month. Safe to run again — no duplicates created.'
          }]}
        />
      )}

      {pay && (
        <FormModal
          title={`Record payment · ${pay.tenant_name} · ${pay.period_month}`}
          submitLabel={`Mark ${money(pay.amount)} paid`}
          onSubmit={recordPayment}
          onClose={() => setPay(null)}
          fields={[
            {
              name: 'method', label: 'Payment method', type: 'select', default: 'cash',
              options: [
                { value: 'cash', label: 'Cash' },
                { value: 'bank_transfer', label: 'Bank transfer' },
                { value: 'gcash', label: 'GCash' },
                { value: 'paymaya', label: 'Maya / PayMaya' },
                { value: 'check', label: 'Check' },
                { value: 'other', label: 'Other' },
              ]
            },
            { name: 'notes', label: 'Notes (optional)', hint: 'e.g. reference number, date received' },
          ]}
        />
      )}

      {adjust && (
        <FormModal
          title={`Adjust bill · ${adjust.tenant_name} · ${adjust.period_month}`}
          submitLabel="Save adjustment"
          onSubmit={adjustBill}
          onClose={() => setAdjust(null)}
          fields={[
            {
              name: 'amount', label: 'New amount', type: 'number', min: 1, step: '0.01',
              default: adjust.amount,
              hint: `Current: ${money(adjust.amount)}`
            },
            {
              name: 'notes', label: 'Reason / note', default: adjust.notes || '',
              hint: 'This note will appear on the bill and statement.'
            },
          ]}
        />
      )}

      {detail && <BillDetail bill={detail} onClose={() => setDetail(null)} flash={flash} />}

      {toast}
    </>
  )
}

/** Inline bill detail modal showing payment history */
function BillDetail({ bill, onClose, flash }) {
  const { data, loading } = useLoad(`/api/admin/bills/${bill.id}`)
  const b = data?.data || bill

  return (
    <Modal title={`Bill · ${bill.tenant_name} · ${bill.period_month}`} onClose={onClose}>
      <div className="bill-detail-grid">
        <p><strong>Tenant</strong><span>{b.tenant_name}</span></p>
        <p><strong>Unit</strong><span>{b.unit_name} · {b.property_name}</span></p>
        <p><strong>Period</strong><span>{b.period_month}</span></p>
        {Number(b.late_fee_amount) > 0 && (
          <>
            <p><strong>Bill before late fee</strong><span>{money(Number(b.amount) - Number(b.late_fee_amount))}</span></p>
            <p><strong>Late fee</strong><span>{money(b.late_fee_amount)}</span></p>
          </>
        )}
        <p><strong>Amount</strong><span>{money(b.amount)}</span></p>
        <p><strong>Due date</strong><span>{dateFmt(b.due_date)}</span></p>
        <p><strong>Status</strong><span><StatusPill value={b.status} /></span></p>
        {b.notes && <p><strong>Notes</strong><span>{b.notes}</span></p>}
      </div>

      {loading && <p className="muted state">Loading payments…</p>}
      {b.payments && b.payments.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 10px' }}>Payment history</h3>
          {b.payments.map((p) => (
            <div className="payment-row" key={p.id}>
              <div>
                <strong>{money(p.amount)}</strong>
                <small className="muted"> via {p.method?.replace('_', ' ')}</small>
              </div>
              <div className="muted" style={{ fontSize: '.83rem' }}>{dateFmt(p.paid_at || p.created_at)}</div>
              {p.receipt_no && (
                <div style={{ fontSize: '.82rem' }}>
                  Receipt: <strong>{p.receipt_no}</strong>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => downloadPdf(`/api/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`).catch((e) => flash(e.message, 'bad'))}
                  >Download statement</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {b.payments && b.payments.length === 0 && (
        <p className="muted" style={{ marginTop: 12, fontSize: '.9rem' }}>No payments recorded for this bill.</p>
      )}
      <div className="modal__foot"><button className="btn btn--ghost" onClick={onClose}>Close</button></div>
    </Modal>
  )
}

function buildQuery(filters) {
  const q = []
  if (filters.status) q.push(`status=${encodeURIComponent(filters.status)}`)
  if (filters.month) q.push(`month=${encodeURIComponent(filters.month)}`)
  return q.length ? '?' + q.join('&') : ''
}

function overdueDays(dueDateStr) {
  if (!dueDateStr) return 0
  const due = new Date(String(dueDateStr).replace(' ', 'T'))
  const diff = Date.now() - due.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}
