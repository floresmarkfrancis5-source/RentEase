import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, fetchPdf, money } from '../../lib/api'
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
  const [paymentSetup, setPaymentSetup] = useState(null)
  const handled = useRef(false)

  useEffect(() => {
    let alive = true
    api('/api/my/settings', { auth: true })
      .then((r) => {
        if (alive) setPaymentSetup({ landlord: r.landlord, methods: String(r.data?.payment_methods || '').split(',').filter(Boolean) })
      })
      .catch((e) => {
        if (alive) setPaymentSetup({ error: e.message, methods: [] })
      })
    return () => { alive = false }
  }, [])

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
          ok ? `Payment received. Receipt: ${r.data.receipt_no}` : 'Payment is still processing. Refresh in a moment.',
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
  const canPayOnline = !!paymentSetup && !paymentSetup.error && paymentSetup.methods.length > 0

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

    if (statusFilter === 'outstanding') {
      result = result.filter((b) => b.status !== 'paid')
    } else if (statusFilter !== 'all') {
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
  const unpaidBills = rawBills.filter((b) => b.status !== 'paid')
  const totalDue = unpaidBills.reduce((s, b) => s + Number(b.amount), 0)
  const overdueBills = rawBills.filter((b) => b.status === 'overdue')
  const overdueCount = overdueBills.length
  const overdueTotal = overdueBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const nextDue = [...unpaidBills].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0]
  const unpaidCount = rawBills.filter((b) => b.status === 'unpaid').length
  const paidCount = rawBills.filter((b) => b.status === 'paid').length

  return (
    <>
      <PageHead eyebrow="My rent" title="My Bills" sub="See what is due, pay online when available, and keep your statements and receipts together." />
      {paymentSetup?.error ? (
        <p className="alert alert--error" role="alert">{paymentSetup.error}</p>
      ) : paymentSetup && (
        <details className="bills-payment-help">
          <summary>
            <span><strong>Payment help</strong><small>{paymentSetup.methods.length ? `Online payment available: ${paymentSetup.methods.map((method) => method === 'paymaya' ? 'Maya' : 'GCash').join(', ')}` : 'Check with your landlord for payment options'}</small></span>
          </summary>
          <div className="bills-payment-help__body">
            <div>
              <strong>{paymentSetup.landlord?.full_name || 'Your landlord'}</strong>
              {paymentSetup.landlord?.email && <span>{paymentSetup.landlord.email}</span>}
              {paymentSetup.landlord?.phone && <span>{paymentSetup.landlord.phone}</span>}
            </div>
            <div className="bills-payment-help__methods">
              <span className="bills-payment-help__label">Available online methods</span>
              {paymentSetup.methods.length ? paymentSetup.methods.map((method) => (
                <span className="tag" key={method}>{method === 'paymaya' ? 'Maya' : 'GCash'}</span>
              )) : <span className="muted">No online payment method is currently available. Contact your landlord to arrange payment.</span>}
            </div>
          </div>
        </details>
      )}

      {nextDue ? (
        <section className={`tenant-bills-next${nextDue.status === 'overdue' ? ' tenant-bills-next--overdue' : ''}`} aria-label="Next bill to pay">
          <div className="tenant-bills-next__copy">
            <span className="tenant-bills-next__eyebrow">{nextDue.status === 'overdue' ? 'Overdue bill' : 'Next bill to pay'}</span>
            <h2>{nextDue.description || nextDue.period_month || 'Rent bill'}</h2>
            <p>{nextDue.period_month} <span aria-hidden="true">·</span> Due {dateFmt(nextDue.due_date)} <StatusPill value={nextDue.status} /></p>
            <strong className="tenant-bills-next__amount">{money(nextDue.amount)}</strong>
          </div>
          {canPayOnline
            ? <button className="btn btn--accent" disabled={busy === nextDue.id} onClick={() => pay(nextDue)}>{busy === nextDue.id ? 'Opening secure checkout…' : 'Pay now'}</button>
            : <span className="tenant-bills-next__payment-note">Contact your landlord to arrange payment.</span>}
        </section>
      ) : data?.length > 0 ? (
        <section className="tenant-bills-next tenant-bills-next--paid" aria-label="Payment status">
          <div className="tenant-bills-next__copy">
            <span className="tenant-bills-next__eyebrow">Payment status</span>
            <h2>All caught up</h2>
            <p>You have no outstanding bills right now.</p>
          </div>
        </section>
      ) : null}

      {data && data.length > 0 && (
        <section className="tenant-bills-summary" aria-label="Bill status summary">
          <button type="button" className={`tenant-bills-summary__item tenant-bills-summary__item--outstanding${statusFilter === 'outstanding' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'outstanding' ? 'all' : 'outstanding')} aria-pressed={statusFilter === 'outstanding'}>
            <span>Total outstanding</span><strong>{money(totalDue)}</strong><small>{unpaidBills.length} unpaid or overdue</small>
          </button>
          <button type="button" className={`tenant-bills-summary__item tenant-bills-summary__item--overdue${statusFilter === 'overdue' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')} aria-pressed={statusFilter === 'overdue'}>
            <span>Overdue</span><strong>{money(overdueTotal)}</strong><small>{overdueCount} {overdueCount === 1 ? 'bill' : 'bills'}</small>
          </button>
          <button type="button" className={`tenant-bills-summary__item tenant-bills-summary__item--paid${statusFilter === 'paid' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'paid' ? 'all' : 'paid')} aria-pressed={statusFilter === 'paid'}>
            <span>Paid</span><strong>{paidCount}</strong><small>View paid bills</small>
          </button>
        </section>
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
          { value: 'outstanding', label: `Outstanding (${unpaidBills.length})` },
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
          <div className="tenant-bills-empty">
            <strong>No bills match these filters</strong>
            <span>Try a different status or clear your search to see more bills.</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid bills-cards-grid">
            {filteredBills.map((r) => (
              <article key={r.id} className={`request-card tenant-bill-card${r.status === 'overdue' ? ' tenant-bill-card--overdue' : r.status === 'paid' ? ' tenant-bill-card--paid' : ''}`}>
                <div className="request-card__head">
                  <div className="tenant-bill-card__identity">
                    <h3 className="request-card__title">{r.period_month}</h3>
                    <div className="request-card__sub">{r.description || 'Monthly rent'}</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div className="tenant-bill-card__summary">
                  <strong className="tenant-bill-card__amount">{money(r.amount)}</strong>
                  {Number(r.late_fee_amount) > 0 && <small className="muted">Includes {money(r.late_fee_amount)} late fee</small>}
                  <div className="tenant-bill-card__due"><span>Due {dateFmt(r.due_date)}</span>{r.status === 'overdue' && <strong>Overdue</strong>}</div>
                  {r.notes && <details className="tenant-bill-card__notes"><summary>Note from landlord</summary><p>{r.notes}</p></details>}
                </div>

                <div className="request-card__foot tenant-bill-card__foot">
                  {r.status !== 'paid' && canPayOnline && (
                    <button
                      className="btn btn--accent btn--sm"
                      disabled={busy === r.id}
                      onClick={() => pay(r)}
                    >
                      {busy === r.id ? 'Opening checkout…' : 'Pay now'}
                    </button>
                  )}
                  {r.status !== 'paid' && !canPayOnline && <span className="tenant-bill-card__payment-note">Contact landlord to pay</span>}
                  <details className="bill-action-menu">
                    <summary>More</summary>
                    <div className="bill-action-menu__items">
                      <button type="button" onClick={() => statement(r)}>{r.status === 'paid' ? 'Download statement' : 'Download bill'}</button>
                    </div>
                  </details>
                  <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>Details</button>
                </div>
              </article>
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
                {r.status !== 'paid' && canPayOnline && (
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

      <Receipts />

      {detail && <BillDetailModal bill={detail} onClose={() => setDetail(null)} onPay={pay} busy={busy} flash={flash} />}
      {toast}
    </>
  )
}

function Receipts() {
  const { data, error, loading } = useLoad('/api/my/payments')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const receiptRequest = useRef(null)

  useEffect(() => {
    const url = receiptPreview?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [receiptPreview?.url])

  async function previewReceipt(payment) {
    const requestId = `${payment.id}-${Date.now()}`
    receiptRequest.current = requestId
    setReceiptPreview({ payment, url: '', loading: true, error: '' })
    try {
      const blob = await fetchPdf(`/api/payments/${payment.id}/receipt`)
      const url = URL.createObjectURL(blob)
      if (receiptRequest.current !== requestId) {
        URL.revokeObjectURL(url)
        return
      }
      setReceiptPreview({ payment, url, loading: false, error: '' })
    } catch (previewError) {
      if (receiptRequest.current === requestId) {
        setReceiptPreview({ payment, url: '', loading: false, error: previewError.message || 'The receipt preview could not be loaded.' })
      }
    }
  }

  function closePreview() {
    receiptRequest.current = null
    setReceiptPreview(null)
  }

  function downloadReceipt() {
    if (!receiptPreview?.url) return
    const link = Object.assign(document.createElement('a'), {
      href: receiptPreview.url,
      download: `${receiptPreview.payment.receipt_no || 'payment-receipt'}.pdf`,
    })
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="tenant-receipts" aria-labelledby="tenant-receipts-title">
      <div className="tenant-receipts__head">
        <div>
          <h2 id="tenant-receipts-title">Receipts</h2>
          <p>Receipts are available for confirmed payments. Preview one before downloading it.</p>
        </div>
      </div>
      {loading && <p className="muted" role="status">Loading your receipts…</p>}
      {error && <p className="alert alert--error" role="alert">Receipts could not be loaded: {error}</p>}
      {!loading && !error && !data?.length && <p className="tenant-receipts__empty">No confirmed payments yet. Your receipts will appear here after a payment is complete.</p>}
      {!loading && !error && !!data?.length && (
        <Table
          rows={data}
          columns={[
            { key: 'receipt_no', label: 'Receipt', render: (r) => <strong>{r.receipt_no}</strong> },
            { key: 'bill_description', label: 'For' },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
            { key: 'method', label: 'Method', render: (r) => (r.method || '—').replace(/_/g, ' ') },
            { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at) },
          ]}
          actions={(r) => (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => previewReceipt(r)}>
              View receipt
            </button>
          )}
        />
      )}
      {receiptPreview && (
        <Modal
          title={`Receipt preview · ${receiptPreview.payment.receipt_no || 'Payment'}`}
          onClose={closePreview}
          className="receipt-preview-modal"
        >
          <div className="receipt-preview">
            {receiptPreview.loading && <p className="muted" role="status">Preparing receipt preview…</p>}
            {receiptPreview.error && (
              <div className="receipt-preview__error">
                <p className="alert alert--error" role="alert">{receiptPreview.error}</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => previewReceipt(receiptPreview.payment)}>Try again</button>
              </div>
            )}
            {receiptPreview.url && (
              <iframe
                className="receipt-preview__document"
                src={receiptPreview.url}
                title={`Receipt ${receiptPreview.payment.receipt_no || ''}`}
              />
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={closePreview}>Close</button>
            <button type="button" className="btn btn--accent" disabled={!receiptPreview.url} onClick={downloadReceipt}>Download receipt</button>
          </div>
        </Modal>
      )}
    </section>
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
