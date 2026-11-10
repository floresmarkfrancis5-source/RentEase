import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

export default function Bills() {
  const { data, error, loading, reload } = useLoad('/api/my/bills')
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(null)
  const [toast, flash] = useToast()
  const [detail, setDetail] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('month-desc')
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
      .then((r) => {
        const ok = r.data?.status === 'paid'
        flash(
          ok ? `✅ Payment received. Receipt: ${r.data.receipt_no}` : '⏳ Payment is still processing. Refresh in a moment.',
          ok ? 'ok' : 'warn',
        )
        reload()
      })
      .catch((e) => flash(e.message, 'bad'))
  }, [params, setParams, flash, reload])

  const pay = async (b) => {
    setBusy(b.id)
    try {
      const r = await api(`/api/my/bills/${b.id}/pay`, { method: 'POST', auth: true, body: {} })
      window.location.assign(r.checkout_url)
    } catch (e) {
      flash(e.message, 'bad')
      setBusy(null)
    }
  }

  const statement = (b) =>
    downloadPdf(`/api/bills/${b.id}/statement`, `statement-${b.period_month}.pdf`)
      .catch((e) => flash(e.message, 'bad'))

  const rawBills = data || []

  // Filter + sort
  const filteredBills = useMemo(() => {
    let result = [...rawBills]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (b) =>
          (b.period_month && b.period_month.toLowerCase().includes(q)) ||
          (b.description && b.description.toLowerCase().includes(q)) ||
          (b.notes && b.notes.toLowerCase().includes(q)) ||
          String(b.amount).includes(q)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((b) => b.status === statusFilter)
    }

    result.sort((a, b) => {
      if (sortBy === 'month-desc') return (b.period_month || '').localeCompare(a.period_month || '')
      if (sortBy === 'month-asc') return (a.period_month || '').localeCompare(b.period_month || '')
      if (sortBy === 'amount-desc') return Number(b.amount || 0) - Number(a.amount || 0)
      if (sortBy === 'amount-asc') return Number(a.amount || 0) - Number(b.amount || 0)
      if (sortBy === 'due-asc') return (a.due_date || '').localeCompare(b.due_date || '')
      return 0
    })

    return result
  }, [rawBills, search, statusFilter, sortBy])

  // Summary from the loaded bills
  const totalDue = rawBills.filter((b) => b.status !== 'paid').reduce((s, b) => s + Number(b.amount), 0)
  const overdueCount = rawBills.filter((b) => b.status === 'overdue').length
  const nextDue = rawBills.filter((b) => b.status !== 'paid').sort((a, b) => a.due_date?.localeCompare(b.due_date ?? ''))[0]
  const unpaidCount = rawBills.filter((b) => b.status === 'unpaid').length

  return (
    <>
      <PageHead eyebrow="My rent" title="My Bills" sub="Bills show rent you owe. Pay online with GCash or Maya; a confirmed payment appears in Payments with a receipt." />

      {/* Quick-glance summary */}
      {data && data.length > 0 && (
        <div className="bill-stats">
          {totalDue > 0 ? (
            <div className={`bill-stat ${overdueCount > 0 ? 'bill-stat--bad' : 'bill-stat--warn'}`}>
              <span className="bill-stat__label">{overdueCount > 0 ? '⚠ Total outstanding (includes overdue)' : 'Total outstanding'}</span>
              <span className="bill-stat__value">{money(totalDue)}</span>
            </div>
          ) : (
            <div className="bill-stat bill-stat--good">
              <span className="bill-stat__label">✅ All paid — you are up to date!</span>
              <span className="bill-stat__value">{money(0)}</span>
            </div>
          )}
          {nextDue && (
            <div className="bill-stat">
              <span className="bill-stat__label">Next due date</span>
              <span className="bill-stat__value" style={{ fontSize: '1.2rem' }}>{dateFmt(nextDue.due_date)}</span>
            </div>
          )}
        </div>
      )}

      <ViewToolbar
        view={viewMode}
        onViewChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bills by month, description…"
        filter={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: 'all', label: `All Bills (${rawBills.length})` },
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
          { value: 'due-asc', label: 'Due Date (Soonest)' },
        ]}
      />

      <State loading={loading} error={error} empty={data?.length === 0 && 'No bills yet. Your landlord will generate bills each month.'}>
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
                    <div className="request-card__sub">{r.description || 'Monthly rent'}</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div style={{ background: 'var(--page-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--page-line)' }}>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: r.status === 'paid' ? 'var(--emerald, #10b981)' : 'var(--accent, #6366f1)' }}>
                    {money(r.amount)}
                  </div>
                  {Number(r.late_fee_amount) > 0 && (
                    <small className="muted">Includes {money(r.late_fee_amount)} late fee</small>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '.84rem' }}>
                    <span className="muted">Due: <strong>{dateFmt(r.due_date)}</strong></span>
                    {r.status === 'overdue' && (
                      <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '.8rem' }}>⚠ Overdue!</span>
                    )}
                  </div>
                  {r.notes && (
                    <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--page-muted)', fontStyle: 'italic' }}>
                      {r.notes}
                    </div>
                  )}
                </div>

                <div className="request-card__foot">
                  <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>Details</button>
                  {r.status !== 'paid' && (
                    <button
                      className="btn btn--accent btn--sm"
                      disabled={busy === r.id}
                      onClick={() => pay(r)}
                    >
                      {busy === r.id ? 'Redirecting…' : '💳 Pay now'}
                    </button>
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => statement(r)}>
                    {r.status === 'paid' ? '📄 Download statement' : '📄 Download bill'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table
            rows={filteredBills}
            columns={[
              { key: 'period_month', label: 'Month', render: (r) => <strong>{r.period_month}</strong> },
              { key: 'description', label: 'Description' },
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
                      <><br /><small style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        Overdue
                      </small></>
                    )}
                  </>
                )
              },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>Details</button>
                {r.status !== 'paid' && (
                  <button
                    className="btn btn--accent btn--sm"
                    disabled={busy === r.id}
                    onClick={() => pay(r)}
                  >
                    {busy === r.id ? 'Redirecting…' : 'Pay now'}
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={() => statement(r)}>
                  {r.status === 'paid' ? 'Download statement' : 'Download bill'}
                </button>
              </>
            )}
          />
        )}
      </State>

      <Receipts flash={flash} />

      {detail && <BillDetailModal bill={detail} onClose={() => setDetail(null)} onPay={pay} busy={busy} flash={flash} />}
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
      <p className="muted">These are confirmed payments received for your bills. Pending checkouts are not receipts.</p>
      <Table
        rows={data}
        columns={[
          { key: 'receipt_no', label: 'Receipt', render: (r) => <strong>{r.receipt_no}</strong> },
          { key: 'bill_description', label: 'For' },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
          { key: 'method', label: 'Method', render: (r) => r.method?.replace('_', ' ') || '—' },
          { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at) },
        ]}
        actions={(r) => (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => downloadPdf(`/api/payments/${r.id}/receipt`, `${r.receipt_no}.pdf`).catch((e) => flash(e.message, 'bad'))}
          >
            Download receipt
          </button>
        )}
      />
    </>
  )
}

/** Tenant bill detail pop-up */
function BillDetailModal({ bill, onClose, onPay, busy, flash }) {
  return (
    <Modal title={`Bill · ${bill.period_month}`} onClose={onClose}>
      <div className="bill-detail-grid">
        <p><strong>Description</strong><span>{bill.description || '—'}</span></p>
        <p><strong>Period</strong><span>{bill.period_month}</span></p>
        {Number(bill.late_fee_amount) > 0 && (
          <>
            <p><strong>Bill before late fee</strong><span>{money(Number(bill.amount) - Number(bill.late_fee_amount))}</span></p>
            <p><strong>Late fee</strong><span>{money(bill.late_fee_amount)}</span></p>
          </>
        )}
        <p><strong>Amount</strong><span style={{ fontWeight: 700, fontSize: '1.3rem' }}>{money(bill.amount)}</span></p>
        <p><strong>Due date</strong><span>{dateFmt(bill.due_date)}</span></p>
        <p><strong>Status</strong><span><StatusPill value={bill.status} /></span></p>
        {bill.notes && <p><strong>Note from landlord</strong><span>{bill.notes}</span></p>}
      </div>
      <div className="modal__foot">
        {bill.status !== 'paid' && (
          <button className="btn btn--accent" disabled={busy === bill.id} onClick={() => { onPay(bill); onClose() }}>
            {busy === bill.id ? 'Redirecting…' : `Pay ${money(bill.amount)} now`}
          </button>
        )}
        <button className="btn btn--ghost" onClick={() =>
          downloadPdf(`/api/bills/${bill.id}/statement`, `statement-${bill.period_month}.pdf`).catch((e) => flash(e.message, 'bad'))
        }>
          {bill.status === 'paid' ? 'Download statement' : 'Download bill'}
        </button>
        <button className="btn btn--ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
