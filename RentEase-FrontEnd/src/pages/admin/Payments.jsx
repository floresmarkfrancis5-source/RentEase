import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { dateFmt, fetchPdf, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

export default function Payments() {
  const { data, error, loading } = useLoad('/api/admin/payments')
  const [toast, flash] = useToast()
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')
  const [statusFilter, setStatusFilter] = useState('')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const receiptRequest = useRef(null)

  const rawPayments = data || []

  const filteredPayments = useMemo(() => {
    let result = [...rawPayments]

    if (statusFilter) result = result.filter((payment) => payment.status === statusFilter)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          (p.receipt_no && p.receipt_no.toLowerCase().includes(q)) ||
          (p.tenant_name && p.tenant_name.toLowerCase().includes(q)) ||
          (p.unit_name && p.unit_name.toLowerCase().includes(q)) ||
          (p.period_month && p.period_month.toLowerCase().includes(q)) ||
          (p.method && p.method.toLowerCase().includes(q)) ||
          String(p.amount).includes(q)
      )
    }

    result.sort((a, b) => {
      if (sortBy === 'date-desc') return (b.paid_at || '').localeCompare(a.paid_at || '')
      if (sortBy === 'date-asc') return (a.paid_at || '').localeCompare(b.paid_at || '')
      if (sortBy === 'amount-desc') return Number(b.amount || 0) - Number(a.amount || 0)
      if (sortBy === 'amount-asc') return Number(a.amount || 0) - Number(b.amount || 0)
      if (sortBy === 'tenant-asc') return (a.tenant_name || '').localeCompare(b.tenant_name || '')
      return 0
    })

    return result
  }, [rawPayments, search, sortBy, statusFilter])

  useEffect(() => {
    const url = receiptPreview?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [receiptPreview?.url])

  const previewReceipt = async (payment) => {
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
    } catch (error) {
      if (receiptRequest.current === requestId) {
        setReceiptPreview({ payment, url: '', loading: false, error: error.message })
      }
    }
  }

  const closeReceiptPreview = () => {
    receiptRequest.current = null
    setReceiptPreview(null)
  }

  const downloadReceipt = () => {
    if (!receiptPreview?.url) return
    const link = Object.assign(document.createElement('a'), {
      href: receiptPreview.url,
      download: `${receiptPreview.payment.receipt_no || 'payment-receipt'}.pdf`,
    })
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const paidPayments = rawPayments.filter((payment) => payment.status === 'paid')
  const totalCollected = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const pendingCount = rawPayments.filter((payment) => payment.status === 'pending').length
  const failedCount = rawPayments.filter((payment) => payment.status === 'failed').length

  return (
    <>
      <PageHead eyebrow="Billing" title="Payments" sub="Money successfully received from tenants, with the bill it paid and its receipt." />
      <p className="payments-explainer">Only completed payments count as collected; pending checkouts are not received money. Totals reflect up to 500 recent payment records.</p>

      {data && (
        <section className="payment-summary" aria-label="Payment totals">
          <button type="button" className={`payment-summary__item is-collected${statusFilter === 'paid' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'paid' ? '' : 'paid')} aria-pressed={statusFilter === 'paid'}>
            <span>Total collected</span><strong>{money(totalCollected)}</strong><small>{paidPayments.length} completed payments</small>
          </button>
          <button type="button" className={`payment-summary__item${statusFilter === '' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('')} aria-pressed={statusFilter === ''}>
            <span>All payment records</span><strong>{rawPayments.length}</strong><small>Successful, pending, and failed</small>
          </button>
          <button type="button" className={`payment-summary__item is-pending${statusFilter === 'pending' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')} aria-pressed={statusFilter === 'pending'}>
            <span>Pending checkouts</span><strong>{pendingCount}</strong><small>Not counted as collected</small>
          </button>
          {failedCount > 0 && (
            <button type="button" className={`payment-summary__item is-failed${statusFilter === 'failed' ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'failed' ? '' : 'failed')} aria-pressed={statusFilter === 'failed'}>
              <span>Failed attempts</span><strong>{failedCount}</strong><small>Payment was not completed</small>
            </button>
          )}
        </section>
      )}

      <ViewToolbar
        view={viewMode}
        onViewChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by receipt, tenant, unit, method…"
        filter={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={[
          { value: '', label: `All records (${rawPayments.length})` },
          { value: 'paid', label: `Completed (${paidPayments.length})` },
          { value: 'pending', label: `Pending (${pendingCount})` },
          { value: 'failed', label: `Failed (${failedCount})` },
        ]}
        sort={sortBy}
        onSortChange={setSortBy}
        sortOptions={[
          { value: 'date-desc', label: 'Date (Newest)' },
          { value: 'date-asc', label: 'Date (Oldest)' },
          { value: 'amount-desc', label: 'Amount (High to Low)' },
          { value: 'amount-asc', label: 'Amount (Low to High)' },
          { value: 'tenant-asc', label: 'Tenant Name (A–Z)' },
        ]}
      >
        <span className="muted" style={{ fontSize: '.84rem' }}>
          {filteredPayments.length} {filteredPayments.length === 1 ? 'payment' : 'payments'}
        </span>
      </ViewToolbar>

      <State loading={loading} error={error} empty={data?.length === 0 && 'No payments yet.'}>
        {data && filteredPayments.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            No payments match your search.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid">
            {filteredPayments.map((r) => (
              <div key={r.id} className="request-card">
                <div className="request-card__head">
                  <div>
                    <h3 className="request-card__title">{r.tenant_name}</h3>
                    <div className="request-card__sub">{r.unit_name} · {r.property_name}</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div className="payment-card__summary">
                  <span className="payment-card__receipt">Receipt {r.receipt_no || 'Not issued'}</span>
                  <strong className="payment-card__amount">{money(r.amount)}</strong>
                  <div className="payment-card__meta">
                    <span>For <strong>{r.period_month || '—'}</strong></span>
                    <span>Via <strong>{(r.method || '—').replace(/_/g, ' ')}</strong></span>
                  </div>
                  <span className="payment-card__date">{r.status === 'paid' ? 'Paid' : 'Created'} {dateFmt(r.paid_at || r.created_at)}</span>
                </div>

                <div className="request-card__foot payment-card__foot">
                  {r.status === 'paid' && (
                    <button className="btn btn--ghost btn--sm" onClick={() => previewReceipt(r)}>View receipt</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table rows={filteredPayments}
            columns={[
              { key: 'receipt_no', label: 'Receipt', render: (r) => <strong>{r.receipt_no || '—'}</strong> },
              { key: 'tenant_name', label: 'Tenant', render: (r) => `${r.tenant_name} · ${r.unit_name}` },
              { key: 'period_month', label: 'For' },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
              { key: 'method', label: 'Method', render: (r) => (r.method || '—').replace(/_/g, ' ') },
              { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at || r.created_at) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => r.status === 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => previewReceipt(r)}>View receipt</button>} />
        )}
      </State>
      {receiptPreview && (
        <Modal
          title={`Receipt preview · ${receiptPreview.payment.receipt_no || 'Payment'}`}
          onClose={closeReceiptPreview}
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
            <button type="button" className="btn btn--ghost" onClick={closeReceiptPreview}>Close</button>
            <button type="button" className="btn btn--accent" disabled={!receiptPreview.url} onClick={downloadReceipt}>Download receipt</button>
          </div>
        </Modal>
      )}
      {toast}
    </>
  )
}
