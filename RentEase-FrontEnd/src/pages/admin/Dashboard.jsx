import Glass from '../../components/Glass'
import { PageHead, State, useLoad } from '../../components/ui'
import { dateFmt, money } from '../../lib/api'

function Stat({ label, value, sub, tone }) {
  return (
    <Glass className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </Glass>
  )
}

export default function Dashboard() {
  const { data: d, error, loading } = useLoad('/api/admin/dashboard')
  const max = d ? Math.max(1, ...d.monthly.flatMap((m) => [m.billed, m.collected])) : 1

  return (
    <>
      <PageHead eyebrow="Landlord" title="Dashboard" sub="Collections, balances and occupancy at a glance." />
      <State loading={loading} error={error}>
        {d && (
          <>
            <div className="stats">
              <Stat label="Collected this month" value={money(d.collected.this_month)} sub={`${d.collected.payments_count} payments all time`} />
              <Stat label="Outstanding" value={money(d.outstanding.amount)} sub={`${d.outstanding.count} unpaid bills`} />
              <Stat label="Overdue" value={money(d.overdue.amount)} sub={`${d.overdue.count} late bills`} tone={d.overdue.count ? 'bad' : ''} />
              <Stat label="Occupancy" value={`${d.units.occupied}/${d.units.total}`} sub={`${d.units.vacant} vacant · ${d.properties} properties`} />
              <Stat label="Tenants" value={d.tenants} />
              <Stat label="Open repairs" value={d.open_maintenance} tone={d.open_maintenance ? 'warn' : ''} />
            </div>

            <div className="cols2">
              <Glass className="panel">
                <h2 className="panel__title">Billed vs collected</h2>
                <div className="bars" role="img" aria-label="Billed versus collected for the last six months">
                  {d.monthly.map((m) => (
                    <div className="bars__col" key={m.month}>
                      <div className="bars__pair">
                        <i className="bars__bar bars__bar--billed" style={{ height: `${(m.billed / max) * 100}%` }} title={`Billed ${money(m.billed)}`} />
                        <i className="bars__bar bars__bar--paid" style={{ height: `${(m.collected / max) * 100}%` }} title={`Collected ${money(m.collected)}`} />
                      </div>
                      <span>{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <p className="legend"><i className="dot dot--billed" /> Billed <i className="dot dot--paid" /> Collected</p>
              </Glass>

              <Glass className="panel">
                <h2 className="panel__title">Recent payments</h2>
                {d.recent_payments.length === 0 ? <p className="muted">No payments yet.</p> : (
                  <ul className="list">
                    {d.recent_payments.map((p) => (
                      <li key={p.id}>
                        <span><strong>{p.tenant_name}</strong> <span className="muted">· {p.unit_name} · {p.method}</span><br /><small className="muted">{dateFmt(p.paid_at)} · {p.receipt_no}</small></span>
                        <strong>{money(p.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </Glass>
            </div>
          </>
        )}
      </State>
    </>
  )
}
