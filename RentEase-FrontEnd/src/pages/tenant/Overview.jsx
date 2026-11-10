import { Link } from 'react-router-dom'
import Glass from '../../components/Glass'
import { Field, Modal, PageHead, State, StatusPill, useLoad } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { dateFmt, money } from '../../lib/api'
import { api } from '../../lib/api'
import { billingFirstDueDate, defaultMoveInDate, leaseContractHtml } from '../../lib/leaseContract'
import LeaseContractPaper from '../../components/LeaseContractPaper'
import { useState } from 'react'

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
    <Glass className="panel" style={{ marginTop: 16 }}>
      <h2 className="panel__title">Lease contract to review</h2>
      <p>{offer.property_name} · {offer.unit_name} · Move-in {dateFmt(offer.start_date)}</p>
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

  return (
    <>
      <PageHead eyebrow="My rent" title={`Hello, ${user.full_name?.split(' ')[0] || 'there'}`} sub="Your balance, next due date and recent payments." />
      <State loading={loading} error={error}>
        {d && !lease && !d.upcoming_lease && !d.contract_offers?.length && <Glass className="empty"><p>You do not have an active lease yet. Please contact your landlord.</p></Glass>}
        {d?.expired_contract_offers?.length > 0 && <div className="alert alert--warn" style={{ marginTop: 16 }}>
          A lease contract was not accepted by its move-in date and has expired. Contact your landlord to request a new contract with a new date.
        </div>}
        {d?.contract_offers?.map((offer) => <ContractOffer key={offer.id} offer={offer} onAccepted={reload} />)}
        {d?.upcoming_lease && (
          <Glass className="panel" style={{ marginTop: 16 }}>
            <h2 className="panel__title">Move-in scheduled</h2>
            <p>{d.upcoming_lease.property_name} · {d.upcoming_lease.unit_name}</p>
            <p>Your lease begins {dateFmt(d.upcoming_lease.start_date)}. Bills begin after the move-in date.</p>
            {d.upcoming_lease.contract_json && (
              <>
                <LeaseContractPaper lease={d.upcoming_lease} />
                <button className="btn btn--ghost" onClick={() => leaseContractHtml(d.upcoming_lease)}>Print or save accepted contract as PDF</button>
              </>
            )}
            {pendingEarlyMove && <p className="alert alert--warn">Your early move-in request for {dateFmt(pendingEarlyMove.requested_start_date)} is awaiting landlord review.</p>}
            {canRequestEarlyMove && (
              <button className="btn btn--accent" style={{ marginTop: 10 }} onClick={() => setRequestEarlyMove(true)}>Request early move-in</button>
            )}
          </Glass>
        )}
        {earlyMoves.data?.filter((request) => ['rejected', 'expired'].includes(request.status)).map((request) => (
          <p className="alert alert--warn" key={request.id}>
            Your early move-in request for {dateFmt(request.requested_start_date)} was {request.status}. Your scheduled lease date remains {dateFmt(request.scheduled_start_date)}.
            {request.admin_note ? ` Landlord note: ${request.admin_note}` : ''}
          </p>
        ))}
        {lease && (
          <>
            <div className="stats">
              <Glass className="stat">
                <span className="stat__label">Balance due</span>
                <span className="stat__value">{money(d.balance)}</span>
              </Glass>
              <Glass className={`stat ${d.overdue.count ? 'stat--bad' : ''}`}>
                <span className="stat__label">Overdue</span>
                <span className="stat__value">{money(d.overdue.amount)}</span>
                <span className="stat__sub">{d.overdue.count} bill(s)</span>
              </Glass>
              <Glass className="stat">
                <span className="stat__label">Your home</span>
                <span className="stat__value stat__value--sm">{lease.unit_name}</span>
                <span className="stat__sub">{lease.property_name} · {money(lease.monthly_rent)}/mo</span>
              </Glass>
            </div>

            {/* Lease info card */}
            <Glass className="panel" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <h2 className="panel__title" style={{ margin: 0 }}>Your lease details</h2>
                <StatusPill value={lease.status} />
              </div>

              {/* Expiry warning */}
              {lease.status === 'active' && expiryDays !== null && expiryDays <= 30 && (
                <div className={`alert ${expiryDays <= 7 ? 'alert--error' : 'alert--warn'}`} style={{ marginBottom: 14 }}>
                  {expiryDays <= 0
                    ? `Your lease expired ${Math.abs(expiryDays)} day(s) ago. Please contact your landlord.`
                    : `Your lease expires in ${expiryDays} day(s). Contact your landlord about renewal.`}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px 20px' }}>
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
                    <div style={{ fontSize: '.74rem', color: 'var(--page-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontWeight: 700, color: item.accent ? 'var(--accent, #6366f1)' : 'var(--page-text)', fontSize: item.accent ? '1rem' : '.92rem' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </Glass>

            {d.next_due && (
              <Glass className="panel due" style={{ marginTop: 20 }}>
                <div>
                  <p className="eyebrow">Next due</p>
                  <h2 className="panel__title">{d.next_due.description}</h2>
                  <p className="muted">{money(d.next_due.amount)} · due {dateFmt(d.next_due.due_date)} <StatusPill value={d.next_due.status} /></p>
                </div>
                <Link className="btn btn--accent" to="/tenant/bills">Pay now</Link>
              </Glass>
            )}

            <Glass className="panel" style={{ marginTop: 20 }}>
              <h2 className="panel__title">Recent payments</h2>
              {d.recent_payments.length === 0 ? <p className="muted">No payments yet.</p> : (
                <ul className="list">{d.recent_payments.map((p) => (
                  <li key={p.id}>
                    <span>{p.bill_description}<br /><small className="muted">{dateFmt(p.paid_at)} · {p.receipt_no}</small></span>
                    <strong>{money(p.amount)}</strong>
                  </li>
                ))}</ul>
              )}
            </Glass>
            {lease.contract_json && <div style={{ marginTop: 16 }}>
              <LeaseContractPaper lease={lease} />
              <button className="btn btn--ghost" onClick={() => leaseContractHtml(lease)}>Print or save your contract as PDF</button>
            </div>}
          </>
        )}
      </State>
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
