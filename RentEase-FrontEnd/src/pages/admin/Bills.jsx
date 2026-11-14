import { useEffect, useMemo, useState } from 'react'
import { FormModal, Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'

function BillMoreActions({ bill, onRemind, onDownload, onAdjust, onDelete }) {
  const menuId = `bill-actions-${bill.id}`

  function runAction(event, action) {
    event.currentTarget.closest('details')?.removeAttribute('open')
    action(bill)
  }

  return (
    <details className="bill-action-menu">
      <summary aria-label={`More actions for ${bill.tenant_name}`} aria-controls={menuId}>More</summary>
      <div id={menuId} className="bill-action-menu__items">
        {bill.status !== 'paid' && <button type="button" onClick={(event) => runAction(event, onRemind)}>Send reminder</button>}
        <button type="button" onClick={(event) => runAction(event, onDownload)}>Download statement</button>
        {bill.status !== 'paid' && (
          <>
            <button type="button" onClick={(event) => runAction(event, onAdjust)}>Adjust bill</button>
            <button type="button" className="is-danger" onClick={(event) => runAction(event, onDelete)}>Delete bill</button>
          </>
        )}
      </div>
    </details>
  )
}

export default function Bills() {
  const { user } = useAuth()
  const { settings, commit } = useSettings()
  const [paymentMethods, setPaymentMethods] = useState([])
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false)
  const [status, setStatus] = useState('')
  const [month, setMonth] = useState('')
  const { data, error, loading, reload } = useLoad(
    `/api/admin/bills${buildQuery({ month })}`
  )
  const [gen, setGen] = useState(false)
  const [pay, setPay] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailVersion, setDetailVersion] = useState(0)
  const [adjust, setAdjust] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('month-desc')
  const [toast, flash] = useToast()

  const rawBills = data || []

  useEffect(() => {
    setPaymentMethods(String(settings.payment_methods || '').split(',').filter(Boolean))
  }, [settings.payment_methods])

  const savedPaymentMethods = String(settings.payment_methods || '').split(',').filter(Boolean)
  const paymentMethodsChanged = paymentMethods.join(',') !== savedPaymentMethods.join(',')

  const savePaymentMethods = async () => {
    setSavingPaymentMethods(true)
    try {
      const r = await api('/api/admin/settings', {
        method: 'PUT',
        auth: true,
        body: { payment_methods: paymentMethods },
      })
      commit(r.data)
      flash(r.message || 'Payment setup saved.')
    } catch (e) {
      flash(e.fields?.payment_methods || e.message, 'bad')
    } finally {
      setSavingPaymentMethods(false)
    }
  }

  // Filter & sort
  const filteredBills = useMemo(() => {
    let result = [...rawBills]

    if (status === 'outstanding') {
      result = result.filter((bill) => bill.status === 'unpaid' || bill.status === 'overdue')
    } else if (status === 'attention') {
      result = result.filter(isBillNeedsAttention)
    } else if (status) {
      result = result.filter((bill) => bill.status === status)
    }

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
  }, [rawBills, search, sortBy, status])

  // Totals use every loaded bill for the selected month, independent of status/search filters.
  const stats = rawBills.reduce((acc, b) => {
    acc.total += Number(b.amount)
    if (b.status === 'paid') {
      acc.collected += Number(b.amount)
      acc.paidCount += 1
    }
    if (b.status === 'unpaid' || b.status === 'overdue') {
      acc.outstanding += Number(b.amount)
      acc.outstandingCount += 1
    }
    if (b.status === 'overdue') {
      acc.overdue += Number(b.amount)
      acc.overdueCount += 1
    }
    return acc
  }, { total: 0, collected: 0, outstanding: 0, overdue: 0, paidCount: 0, outstandingCount: 0, overdueCount: 0 })

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
    if (detail?.id === pay.id) setDetailVersion((version) => version + 1)
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

  const unpaidCount = rawBills.filter((b) => b.status === 'unpaid').length
  const overdueCount = rawBills.filter((b) => b.status === 'overdue').length
  const attentionBills = rawBills.filter(isBillNeedsAttention).sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return (a.due_date || '').localeCompare(b.due_date || '')
  })

  return (
    <>
      <PageHead eyebrow="Billing" title="Bills" sub="One bill per active lease per month. Generating twice never creates duplicates.">
        <button className="btn btn--accent" onClick={() => setGen(true)}>Generate bills</button>
      </PageHead>
      <details className="bills-payment-setup">
        <summary>Tenant payment options <span>Configure which online methods tenants can use</span></summary>
        <div className="bills-payment-setup__body">
          <div>
            <strong>{user?.full_name || 'Landlord'}</strong>
            <p className="muted">
              {user?.email || 'No email on profile'}{user?.phone ? ` · ${user.phone}` : ''}
            </p>
            <p className="bills-payment-setup__hint">Selected methods are offered at tenant checkout when online payments are available. This setting does not record a payment or determine whether the payment provider is in test or live mode.</p>
          </div>
          <div className="bills-payment-setup__controls">
            {[
              { value: 'gcash', label: 'GCash' },
              { value: 'paymaya', label: 'Maya' },
            ].map((method) => (
              <label key={method.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={paymentMethods.includes(method.value)}
                  onChange={(event) => setPaymentMethods((current) => event.target.checked
                    ? [...new Set([...current, method.value])]
                    : current.filter((value) => value !== method.value))}
                />
                {method.label}
              </label>
            ))}
            <button
              type="button"
              className="btn btn--accent btn--sm"
              disabled={!paymentMethodsChanged || savingPaymentMethods}
              onClick={savePaymentMethods}
            >
              {savingPaymentMethods ? 'Saving…' : 'Save payment setup'}
            </button>
          </div>
        </div>
      </details>
      <p className="bills-explainer">Bills show rent due; the Payments page shows money received and its receipt.</p>

      {data && (
        <section className="bill-summary" aria-label="Bill totals">
          <div className="bill-summary__heading">
            <h2>Bill totals</h2>
            <span>{month || 'All months'} · {rawBills.length} bills</span>
          </div>
          <div className="bill-summary__items">
            <button type="button" className={`bill-summary__item${status === '' ? ' is-active' : ''}`} onClick={() => { setStatus(''); setSearch('') }} aria-pressed={status === ''}>
              <span>Total billed</span><strong>{money(stats.total)}</strong><small>{rawBills.length} bills</small>
            </button>
            <button type="button" className={`bill-summary__item is-good${status === 'paid' ? ' is-active' : ''}`} onClick={() => { setStatus('paid'); setSearch('') }} aria-pressed={status === 'paid'}>
              <span>Collected</span><strong>{money(stats.collected)}</strong><small>{stats.paidCount} paid bills</small>
            </button>
            <button type="button" className={`bill-summary__item is-warning${status === 'outstanding' ? ' is-active' : ''}`} onClick={() => { setStatus('outstanding'); setSearch('') }} aria-pressed={status === 'outstanding'}>
              <span>Outstanding</span><strong>{money(stats.outstanding)}</strong><small>{stats.outstandingCount} unpaid bills</small>
            </button>
            <button type="button" className={`bill-summary__item is-danger${status === 'overdue' ? ' is-active' : ''}`} onClick={() => { setStatus('overdue'); setSearch('') }} aria-pressed={status === 'overdue'}>
              <span>Overdue</span><strong>{money(stats.overdue)}</strong><small>{stats.overdueCount} overdue bills</small>
            </button>
          </div>
        </section>
      )}

      {attentionBills.length > 0 && (
        <section className="bill-attention" aria-labelledby="bill-attention-title">
          <div className="bill-attention__heading">
            <div>
              <h2 id="bill-attention-title">Needs attention</h2>
              <p>Overdue bills and unpaid bills due within the next 7 days.</p>
            </div>
            <span>{attentionBills.length}</span>
          </div>
          <ul>
            {attentionBills.slice(0, 4).map((bill) => (
              <li key={bill.id}>
                <div className="bill-attention__tenant">
                  <strong>{bill.tenant_name}</strong>
                  <span>{bill.unit_name} · {bill.property_name} · {bill.period_month}</span>
                </div>
                <div className="bill-attention__due">
                  <strong>{money(bill.amount)}</strong>
                  <span className={bill.status === 'overdue' ? 'is-overdue' : ''}>
                    {bill.status === 'overdue'
                      ? `${overdueDays(bill.due_date)}d overdue`
                      : `Due ${dateFmt(bill.due_date)}`}
                  </span>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(bill)}>View</button>
              </li>
            ))}
          </ul>
          {attentionBills.length > 4 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStatus('attention'); setSearch('') }}>
              View all {attentionBills.length} attention bills
            </button>
          )}
        </section>
      )}

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
          { value: 'outstanding', label: `Outstanding (${stats.outstandingCount})` },
          { value: 'attention', label: `Needs attention (${attentionBills.length})` },
          { value: 'paid', label: `Paid (${stats.paidCount})` },
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
          <div className="cards-grid bills-cards-grid">
            {filteredBills.map((r) => (
              <article key={r.id} className="request-card bill-card">
                <div className="request-card__head">
                  <div className="bill-card__identity">
                    <h3 className="request-card__title">{r.tenant_name}</h3>
                    <div className="request-card__sub">{r.unit_name} · {r.property_name}</div>
                  </div>
                  <StatusPill value={r.status} />
                </div>

                <div className="bill-card__summary">
                  <div className="bill-card__period">{r.period_month}</div>
                  <strong className="bill-card__amount">{money(r.amount)}</strong>
                  <span className="bill-card__amount-label">Amount due</span>
                  {Number(r.late_fee_amount) > 0 && (
                    <small className="muted">Includes {money(r.late_fee_amount)} late fee</small>
                  )}
                  <div className="bill-card__due">
                    <span>Due {dateFmt(r.due_date)}</span>
                    {r.status === 'overdue' && (
                      <strong>{overdueDays(r.due_date)}d overdue</strong>
                    )}
                  </div>
                  {r.notes && (
                    <details className="bill-card__notes">
                      <summary>Bill note</summary>
                      <p>{r.notes}</p>
                    </details>
                  )}
                </div>

                <div className="request-card__foot bill-card__foot">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>View</button>
                  {r.status !== 'paid' && <button type="button" className="btn btn--accent btn--sm" onClick={() => setPay(r)}>Record payment</button>}
                  <BillMoreActions bill={r} onRemind={remind} onDownload={pdf} onAdjust={setAdjust} onDelete={del} />
                </div>
              </article>
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
              <div className="bill-table-actions">
                <button className="btn btn--ghost btn--sm" onClick={() => setDetail(r)}>View</button>
                {r.status !== 'paid' && <button className="btn btn--accent btn--sm" onClick={() => setPay(r)}>Record payment</button>}
                <BillMoreActions bill={r} onRemind={remind} onDownload={pdf} onAdjust={setAdjust} onDelete={del} />
              </div>
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

      {detail && <BillDetail key={`${detail.id}-${detailVersion}`} bill={detail} onClose={() => setDetail(null)} flash={flash} />}

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
  if (filters.month) q.push(`month=${encodeURIComponent(filters.month)}`)
  return q.length ? '?' + q.join('&') : ''
}

function overdueDays(dueDateStr) {
  if (!dueDateStr) return 0
  const due = new Date(String(dueDateStr).replace(' ', 'T'))
  const diff = Date.now() - due.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function daysUntilDue(dueDateStr) {
  const [year, month, day] = String(dueDateStr || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const dueUtc = Date.UTC(year, month - 1, day)
  return Math.round((dueUtc - todayUtc) / 86400000)
}

function isBillNeedsAttention(bill) {
  if (bill.status === 'overdue') return true
  const days = daysUntilDue(bill.due_date)
  return bill.status === 'unpaid' && days !== null && days >= 0 && days <= 7
}
