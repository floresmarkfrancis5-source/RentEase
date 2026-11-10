import { useMemo, useState } from 'react'
import { PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { dateFmt, downloadPdf, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

export default function Payments() {
  const { data, error, loading } = useLoad('/api/admin/payments')
  const [toast, flash] = useToast()
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')

  const rawPayments = data || []

  const filteredPayments = useMemo(() => {
    let result = [...rawPayments]

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
  }, [rawPayments, search, sortBy])

  const receipt = (p) => downloadPdf(`/api/payments/${p.id}/receipt`, `${p.receipt_no}.pdf`).catch((e) => flash(e.message, 'bad'))

  const totalCollected = rawPayments.reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <>
      <PageHead eyebrow="Billing" title="Payments" sub="Money successfully received from tenants, with the bill it paid and its receipt." />
      <p className="alert" style={{ marginTop: 0 }}>A payment is recorded only after it succeeds (or the landlord records it). Pending online checkouts are not counted as collected money.</p>

      {/* Summary */}
      {rawPayments.length > 0 && (
        <div className="bill-stats" style={{ marginBottom: 0 }}>
          <div className="bill-stat bill-stat--good">
            <span className="bill-stat__label">Total Collected</span>
            <span className="bill-stat__value">{money(totalCollected)}</span>
          </div>
          <div className="bill-stat">
            <span className="bill-stat__label">Total Payments</span>
            <span className="bill-stat__value">{rawPayments.length}</span>
          </div>
        </div>
      )}

      <ViewToolbar
        view={viewMode}
        onViewChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by receipt, tenant, unit, method…"
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
                    <h3 className="request-card__title" style={{ fontFamily: 'monospace', fontSize: '.95rem' }}>
                      {r.receipt_no || 'No receipt'}
                    </h3>
                    <div className="request-card__sub">{r.tenant_name} · {r.unit_name}</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div style={{ background: 'var(--page-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--page-line)' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--emerald, #10b981)' }}>
                    {money(r.amount)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '.84rem', flexWrap: 'wrap', gap: 6 }}>
                    <span className="muted">For: <strong>{r.period_month}</strong></span>
                    <span className="muted">Via: <strong>{r.method?.replace('_', ' ') || '—'}</strong></span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '.82rem', color: 'var(--page-muted)' }}>
                    Paid: {dateFmt(r.paid_at)}
                  </div>
                </div>

                <div className="request-card__foot">
                  {r.status === 'paid' && (
                    <button className="btn btn--ghost btn--sm" onClick={() => receipt(r)}>📄 Download receipt</button>
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
              { key: 'method', label: 'Method', render: (r) => r.method.replace('_', ' ') },
              { key: 'paid_at', label: 'Paid', render: (r) => dateFmt(r.paid_at) },
              { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
            ]}
            actions={(r) => r.status === 'paid' && <button className="btn btn--ghost btn--sm" onClick={() => receipt(r)}>Download receipt</button>} />
        )}
      </State>
      {toast}
    </>
  )
}
