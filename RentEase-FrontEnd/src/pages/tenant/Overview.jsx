import { Link } from 'react-router-dom'
import Glass from '../../components/Glass'
import { PageHead, State, StatusPill, useLoad } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { dateFmt, money } from '../../lib/api'

export default function Overview() {
  const { user } = useAuth()
  const { data: d, error, loading } = useLoad('/api/my/summary')
  return (
    <>
      <PageHead eyebrow="My rent" title={`Hello, ${user.full_name?.split(' ')[0] || 'there'}`} sub="Your balance, next due date and recent payments." />
      <State loading={loading} error={error}>
        {d && !d.lease && <Glass className="empty"><p>You do not have an active lease yet. Please contact your landlord.</p></Glass>}
        {d?.lease && (
          <>
            <div className="stats">
              <Glass className="stat"><span className="stat__label">Balance due</span><span className="stat__value">{money(d.balance)}</span></Glass>
              <Glass className={`stat ${d.overdue.count ? 'stat--bad' : ''}`}><span className="stat__label">Overdue</span><span className="stat__value">{money(d.overdue.amount)}</span><span className="stat__sub">{d.overdue.count} bill(s)</span></Glass>
              <Glass className="stat"><span className="stat__label">Your home</span><span className="stat__value stat__value--sm">{d.lease.unit_name}</span><span className="stat__sub">{d.lease.property_name} · {money(d.lease.monthly_rent)}/mo</span></Glass>
            </div>
            {d.next_due && (
              <Glass className="panel due">
                <div><p className="eyebrow">Next due</p><h2 className="panel__title">{d.next_due.description}</h2>
                  <p className="muted">{money(d.next_due.amount)} · due {dateFmt(d.next_due.due_date)} <StatusPill value={d.next_due.status} /></p></div>
                <Link className="btn btn--accent" to="/tenant/bills">Pay now</Link>
              </Glass>
            )}
            <Glass className="panel">
              <h2 className="panel__title">Recent payments</h2>
              {d.recent_payments.length === 0 ? <p className="muted">No payments yet.</p> : (
                <ul className="list">{d.recent_payments.map((p) => (
                  <li key={p.id}><span>{p.bill_description}<br /><small className="muted">{dateFmt(p.paid_at)} · {p.receipt_no}</small></span><strong>{money(p.amount)}</strong></li>
                ))}</ul>
              )}
            </Glass>
          </>
        )}
      </State>
    </>
  )
}
