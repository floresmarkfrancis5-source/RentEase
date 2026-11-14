import { Link } from 'react-router-dom'
import Glass from '../../components/Glass'
import { Field, Modal, PageHead, State, StatusPill, useLoad } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { dateFmt, money } from '../../lib/api'
import { api } from '../../lib/api'
import { billingFirstDueDate, defaultMoveInDate, leaseContractHtml } from '../../lib/leaseContract'
import LeaseContractPaper from '../../components/LeaseContractPaper'
import { useState } from 'react'
import AnnouncementBoard from '../../components/AnnouncementBoard'

function EarlyMoveInModal({ lease, onClose, onDone }) {
  const [startDate, setStartDate] = useState(defaultMoveInDate(0))
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstDue = billingFirstDueDate({ ...lease, start_date: startDate })
  const scheduledDate = new Date(`${lease.start_date}T12:00:00`)
  scheduledDate.setDate(scheduledDate.getDate() - 1)
  const maxEarlyDate = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}-${String(scheduledDate.getDate()).padStart(2, '0')}`
  const dateParts = startDate.split('-').map(Number)
  const monthDays = dateParts.length === 3 ? new Date(dateParts[0], dateParts[1], 0).getDate() : 0
  const occupiedDays = dateParts[2] ? monthDays - dateParts[2] + 1 : 0
  const billingDateInvalid = (lease.billing_style === 'first_of_month' && dateParts[2] !== 1)
    || (lease.billing_style === 'anniversary' && dateParts[2] > 28)
  const proratedAmount = Number(lease.prorate_first_month) === 1 && occupiedDays > 0
    ? Number((Number(lease.monthly_rent) * occupiedDays / monthDays).toFixed(2))
    : Number(lease.monthly_rent)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/my/early-move-requests', {
        method: 'POST',
        auth: true,
        body: { requested_start_date: startDate, reason, acknowledge_terms: acknowledged },
      })
      await onDone()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Request an early move-in" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">Your landlord must approve this request. If approved, your lease starts on the approved date and keeps its original end date.</p>
        <Field label="Requested move-in date">
          <input type="date" required min={defaultMoveInDate(0)} max={maxEarlyDate} value={startDate}
            onChange={(event) => setStartDate(event.target.value)} />
        </Field>
        {billingDateInvalid && <p className="field__error" role="alert">
          {lease.billing_style === 'first_of_month'
            ? 'This lease requires move-in to begin on the first day of a month.'
            : 'Anniversary billing requires a move-in date on or before the 28th.'}
        </p>}
        <p className="muted" style={{ margin: 0 }}>
          First bill estimate: {money(proratedAmount)} due {firstDue}. {Number(lease.prorate_first_month) === 1 ? `Prorated for ${occupiedDays} of ${monthDays} days.` : 'First month is not prorated.'}
          {' '}Later bills follow the saved {lease.billing_style === 'anniversary' ? 'anniversary' : lease.billing_style === 'first_of_month' ? 'first-of-month' : `calendar (day ${lease.due_day})`} schedule. Grace period: {lease.grace_period_days} day(s). Late fee: {Number(lease.late_fee) > 0 ? `${money(lease.late_fee)} after grace` : 'none'}.
        </p>
        <Field label="Reason for moving in early">
          <textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <label className="field field--checkbox">
          <span className="field__label">Confirm revised lease and billing terms</span>
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span className="field__hint">I agree to the requested earlier start date, understand the original end date will not change, and accept the first rent estimate and stored billing terms shown above.</span>
        </label>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy || billingDateInvalid || !acknowledged || reason.trim().length < 3}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ContractOffer({ offer, onAccepted }) {
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setBusy(true)
    setError('')
    try {
      await api(`/api/my/leases/${offer.id}/accept`, { method: 'POST', auth: true, body: { agree: true } })
      await onAccepted()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="tenant-contract-details tenant-contract-details--offer">
      <summary>
        <span>
          <strong>Lease contract to review</strong>
          <small>{offer.property_name} · {offer.unit_name} · Move-in {dateFmt(offer.start_date)}</small>
        </span>
        <span className="tenant-contract-details__status">Review required</span>
      </summary>
      <Glass className="panel tenant-contract-details__content">
        <p className="muted">{money(offer.monthly_rent)} per month · Deposit {money(offer.deposit)} · Offer expires on the move-in date.</p>
        <LeaseContractPaper lease={offer} />
        <label className="field field--checkbox" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span className="field__label">I have read and agree to this lease contract.</span>
        </label>
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={() => leaseContractHtml(offer)}>Print or save contract as PDF</button>
          <button type="button" className="btn btn--accent" disabled={!agreed || busy} onClick={accept}>{busy ? 'Recording agreement…' : 'Agree to contract'}</button>
        </div>
      </Glass>
    </details>
  )
}

const CONTRACT_TERM_LABELS = { monthly: 'Month-to-month', annually: 'Annual', custom: 'Custom term' }

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(String(dateStr).replace(' ', 'T')) - Date.now()) / 86400000)
}

export default function Overview() {
  const { user } = useAuth()
  const { data: d, error, loading, reload } = useLoad('/api/my/summary')
  const earlyMoves = useLoad('/api/my/early-move-requests')
  const [requestEarlyMove, setRequestEarlyMove] = useState(false)
  const lease = d?.lease || null
  const expiryDays = daysUntil(lease?.end_date)
  const pendingEarlyMove = (earlyMoves.data || []).find((request) => request.status === 'pending')
  const canRequestEarlyMove = d?.upcoming_lease && d.upcoming_lease.start_date > defaultMoveInDate(0) && !pendingEarlyMove
  const attentionMoves = earlyMoves.data?.filter((request) => ['rejected', 'expired'].includes(request.status)) || []
  const leaseExpiring = lease?.status === 'active' && expiryDays !== null && expiryDays <= 30
  const quickActions = [
    { href: '/tenant/bills', label: 'My bills', detail: 'View balances and payments', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6' },
    { href: '/tenant/chats', label: 'Message landlord', detail: 'Open your rental chats', icon: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z' },
    { href: '/tenant/maintenance', label: 'Report a repair', detail: 'Send or follow a request', icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z' },
    { href: '/tenant/transfers', label: 'Move request', detail: 'Request a move or transfer', icon: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3' },
  ]

  return (
    <>
      <PageHead eyebrow="My rent" title={`Hello, ${user.full_name?.split(' ')[0] || 'there'}`} sub="Here’s what needs your attention and the shortcuts you use most." />
      <AnnouncementBoard compact collapsible />
      <State loading={loading} error={error}>
        {d && (
          <div className="tenant-overview">
            {!lease && !d.upcoming_lease && !d.contract_offers?.length && (
              <Glass className="empty"><p>You do not have an active lease yet. Please contact your landlord.</p></Glass>
            )}

            {lease && (
              <Glass className={`tenant-next-bill${d.overdue?.count ? ' tenant-next-bill--overdue' : ''}`}>
                <div className="tenant-next-bill__copy">
                  <span className="eyebrow">{d.next_due ? 'Your next bill' : 'Your rent overview'}</span>
                  {d.next_due ? (
                    <>
                      <h2>{d.next_due.description}</h2>
                      <p>{money(d.next_due.amount)} <span aria-hidden="true">·</span> Due {dateFmt(d.next_due.due_date)} <StatusPill value={d.next_due.status} /></p>
                    </>
                  ) : (
                    <>
                      <h2>{d.overdue?.count ? 'You have overdue bills' : 'You’re all caught up'}</h2>
                      <p>{d.overdue?.count
                        ? `${d.overdue.count} bill(s) need attention, totaling ${money(d.overdue.amount)}.`
                        : 'There are no unpaid bills to take care of right now.'}</p>
                    </>
                  )}
                  {d.overdue?.count > 0 && (
                    <span className="tenant-next-bill__warning">{d.overdue.count} overdue {d.overdue.count === 1 ? 'bill' : 'bills'} · {money(d.overdue.amount)}</span>
                  )}
                </div>
                <Link className="btn btn--accent" to="/tenant/bills">{d.next_due ? 'View bill' : 'View my bills'}</Link>
              </Glass>
            )}

            <section className="tenant-quick-actions" aria-labelledby="tenant-quick-actions-title">
              <div className="tenant-overview__section-head">
                <div>
                  <h2 id="tenant-quick-actions-title">Quick actions</h2>
                  <p>Go straight to what you need.</p>
                </div>
              </div>
              <div className="tenant-quick-actions__grid">
                {quickActions.map((action) => (
                  <Link className="tenant-quick-action" to={action.href} key={action.href}>
                    <span className="tenant-quick-action__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none"><path d={action.icon} /></svg>
                    </span>
                    <span className="tenant-quick-action__text"><strong>{action.label}</strong><small>{action.detail}</small></span>
                    <span className="tenant-quick-action__arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>

            {lease && (
              <section className="tenant-overview__stats" aria-label="Account summary">
                <div className="tenant-overview__section-head">
                  <div>
                    <h2>At a glance</h2>
                    <p>Your current rent and balance summary.</p>
                  </div>
                </div>
                <div className="stats">
                  <Glass className="stat">
                    <span className="stat__label">Balance due</span>
                    <span className="stat__value">{money(d.balance)}</span>
                  </Glass>
                  <Glass className={`stat ${d.overdue?.count ? 'stat--bad' : ''}`}>
                    <span className="stat__label">Overdue</span>
                    <span className="stat__value">{money(d.overdue?.amount || 0)}</span>
                    <span className="stat__sub">{d.overdue?.count || 0} bill(s)</span>
                  </Glass>
                  <Glass className="stat">
                    <span className="stat__label">Your home</span>
                    <span className="stat__value stat__value--sm">{lease.unit_name}</span>
                    <span className="stat__sub">{lease.property_name} · {money(lease.monthly_rent)}/mo</span>
                  </Glass>
                </div>
              </section>
            )}

            {(leaseExpiring || d.expired_contract_offers?.length > 0 || d.upcoming_lease || pendingEarlyMove || attentionMoves.length > 0 || d.contract_offers?.length > 0) && (
              <section className="tenant-attention" aria-labelledby="tenant-attention-title">
                <div className="tenant-overview__section-head">
                  <div>
                    <h2 id="tenant-attention-title">Needs your attention</h2>
                    <p>Important updates about your rent and lease.</p>
                  </div>
                </div>
                <div className="tenant-attention__list">
                  {leaseExpiring && (
                    <div className={`tenant-attention__item${expiryDays <= 7 ? ' tenant-attention__item--urgent' : ''}`} role="status">
                      <span className="tenant-attention__mark" aria-hidden="true">!</span>
                      <p>{expiryDays <= 0
                        ? `Your lease expired ${Math.abs(expiryDays)} day(s) ago. Please contact your landlord.`
                        : `Your lease expires in ${expiryDays} day(s). Contact your landlord about renewal.`}</p>
                    </div>
                  )}
                  {d.expired_contract_offers?.length > 0 && (
                    <div className="tenant-attention__item" role="status">
                      <span className="tenant-attention__mark" aria-hidden="true">!</span>
                      <p>A lease contract offer expired before its move-in date. Contact your landlord to request a new contract.</p>
                    </div>
                  )}
                  {d.upcoming_lease && (
                    <div className="tenant-attention__item">
                      <span className="tenant-attention__mark tenant-attention__mark--info" aria-hidden="true">i</span>
                      <div>
                        <strong>Move-in scheduled</strong>
                        <p>{d.upcoming_lease.property_name} · {d.upcoming_lease.unit_name}. Your lease begins {dateFmt(d.upcoming_lease.start_date)}.</p>
                        {canRequestEarlyMove && <button className="btn btn--ghost btn--sm" onClick={() => setRequestEarlyMove(true)}>Request early move-in</button>}
                      </div>
                    </div>
                  )}
                  {pendingEarlyMove && (
                    <div className="tenant-attention__item">
                      <span className="tenant-attention__mark tenant-attention__mark--info" aria-hidden="true">…</span>
                      <p>Your early move-in request for {dateFmt(pendingEarlyMove.requested_start_date)} is awaiting landlord review.</p>
                    </div>
                  )}
                  {attentionMoves.map((request) => (
                    <div className="tenant-attention__item" key={request.id}>
                      <span className="tenant-attention__mark" aria-hidden="true">!</span>
                      <p>
                        Your early move-in request for {dateFmt(request.requested_start_date)} was {request.status}. Your scheduled lease date remains {dateFmt(request.scheduled_start_date)}.
                        {request.admin_note ? ` Landlord note: ${request.admin_note}` : ''}
                      </p>
                    </div>
                  ))}
                  {d.contract_offers?.length > 0 && (
                    <div className="tenant-attention__item">
                      <span className="tenant-attention__mark tenant-attention__mark--info" aria-hidden="true">i</span>
                      <p>A lease contract is waiting for your review. Open Lease documents below to read and respond.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {lease && (
              <section className="tenant-recent-payments">
                <div className="tenant-overview__section-head">
                  <div>
                    <h2>Recent payments</h2>
                    <p>Your latest confirmed rent payments.</p>
                  </div>
                  <Link to="/tenant/bills">View all bills <span aria-hidden="true">→</span></Link>
                </div>
                <Glass className="panel">
                  {!d.recent_payments?.length ? <p className="muted">No confirmed payments yet. Completed payments will appear here.</p> : (
                    <ul className="list">{d.recent_payments.map((payment) => (
                      <li key={payment.id}>
                        <span>{payment.bill_description}<br /><small className="muted">{dateFmt(payment.paid_at)} · {payment.receipt_no}</small></span>
                        <strong>{money(payment.amount)}</strong>
                      </li>
                    ))}</ul>
                  )}
                </Glass>
              </section>
            )}

            {lease && (
              <details className="tenant-lease-details">
                <summary>
                  <span><strong>Your lease details</strong><small>{lease.property_name} · {lease.unit_name} · {money(lease.monthly_rent)}/mo</small></span>
                  <StatusPill value={lease.status} />
                </summary>
                <div className="tenant-lease-details__body">
                  <div className="tenant-lease-details__grid">
                    {[
                      { label: 'Unit', value: lease.unit_name },
                      { label: 'Property', value: lease.property_name },
                      { label: 'Monthly Rent', value: money(lease.monthly_rent), accent: true },
                      { label: 'Deposit', value: money(lease.deposit) },
                      { label: 'Due Day', value: `Day ${lease.due_day} of the month` },
                      { label: 'Start Date', value: dateFmt(lease.start_date) },
                      { label: 'End Date', value: lease.end_date ? dateFmt(lease.end_date) : 'Open-ended' },
                      { label: 'Contract Type', value: CONTRACT_TERM_LABELS[lease.contract_term] || lease.contract_term || 'Monthly' },
                      ...(lease.contract_months ? [{ label: 'Contract Duration', value: `${lease.contract_months} months` }] : []),
                      ...(Number(lease.estimated_annual_income) > 0 ? [{ label: 'Annual Rent', value: money(lease.estimated_annual_income), accent: true }] : []),
                      ...(Number(lease.advance_payment) > 0 ? [{ label: 'Advance Payment', value: money(lease.advance_payment) }] : []),
                      ...(Number(lease.down_payment) > 0 ? [{ label: 'Down Payment', value: money(lease.down_payment) }] : []),
                    ].map((item) => (
                      <div key={item.label}>
                        <span>{item.label}</span>
                        <strong className={item.accent ? 'tenant-lease-details__accent' : ''}>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </State>
      {d && (d.contract_offers?.length > 0 || d.upcoming_lease?.contract_json || lease?.contract_json) && (
        <section className="tenant-contracts" aria-labelledby="tenant-contracts-title">
          <div className="tenant-contracts__head">
            <h2 id="tenant-contracts-title">Lease documents</h2>
            <p className="muted">Review or print your rental agreement whenever you need it.</p>
          </div>
          {d.contract_offers?.map((offer) => <ContractOffer key={offer.id} offer={offer} onAccepted={reload} />)}
          {d.upcoming_lease?.contract_json && (
            <details className="tenant-contract-details">
              <summary>
                <span>
                  <strong>Accepted move-in contract</strong>
                  <small>{d.upcoming_lease.property_name} · {d.upcoming_lease.unit_name}</small>
                </span>
                <span className="tenant-contract-details__status">View document</span>
              </summary>
              <div className="tenant-contract-details__document">
                <LeaseContractPaper lease={d.upcoming_lease} />
                <button className="btn btn--ghost" onClick={() => leaseContractHtml(d.upcoming_lease)}>Print or save accepted contract as PDF</button>
              </div>
            </details>
          )}
          {lease?.contract_json && (
            <details className="tenant-contract-details">
              <summary>
                <span>
                  <strong>Your rental agreement</strong>
                  <small>{lease.property_name} · {lease.unit_name}</small>
                </span>
                <span className="tenant-contract-details__status">View document</span>
              </summary>
              <div className="tenant-contract-details__document">
                <LeaseContractPaper lease={lease} />
                <button className="btn btn--ghost" onClick={() => leaseContractHtml(lease)}>Print or save your contract as PDF</button>
              </div>
            </details>
          )}
        </section>
      )}
      {requestEarlyMove && d?.upcoming_lease && (
        <EarlyMoveInModal
          lease={d.upcoming_lease}
          onClose={() => setRequestEarlyMove(false)}
          onDone={() => Promise.all([earlyMoves.reload(), reload()])}
        />
      )}
    </>
  )
}
