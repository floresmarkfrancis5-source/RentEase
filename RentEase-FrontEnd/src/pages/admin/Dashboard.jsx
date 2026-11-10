import { Link } from 'react-router-dom'
import Glass from '../../components/Glass'
import { PageHead, State, useLoad } from '../../components/ui'
import { dateFmt, money } from '../../lib/api'
import HelpTip from '../../components/HelpTip'
import { helpFor, useLanguage } from '../../context/LanguageContext'

function Stat({ label, value, sub, tone }) {
  const { language, t } = useLanguage()
  const help = helpFor(label, language)
  return (
    <Glass className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span className="stat__label">{t(label)}{help && <HelpTip text={help} label={language === 'tl' ? `Tulong tungkol sa: ${t(label)}` : `Help about: ${label}`} />}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{t(sub)}</span>}
    </Glass>
  )
}

export default function Dashboard() {
  const { t } = useLanguage()
  const { data: d, error, loading } = useLoad('/api/admin/dashboard')
  const max = d ? Math.max(1, ...d.monthly.flatMap((m) => [m.billed, m.collected])) : 1

  return (
    <>
      <PageHead eyebrow="Landlord" title="Dashboard" sub="Collections, balances and occupancy at a glance." />
      <State loading={loading} error={error}>
        {d && (
          <>
            {/* Expiry + overdue alerts */}
            {d.expiring_leases?.length > 0 && (
              <div className="alert alert--warn" style={{ marginBottom: 14 }}>
                ⏰ <strong>{d.expiring_leases.length} lease{d.expiring_leases.length > 1 ? 's' : ''}</strong> expiring within 30 days.{' '}
                <Link to="/admin/leases" className="btn btn--ghost btn--sm">View leases →</Link>
              </div>
            )}
            {d.overdue.count > 0 && (
              <div className="alert alert--error" style={{ marginBottom: 14 }}>
                ⚠ <strong>{d.overdue.count} overdue bill{d.overdue.count > 1 ? 's' : ''}</strong> totalling {money(d.overdue.amount)}.{' '}
                <Link to="/admin/bills?status=overdue" className="btn btn--ghost btn--sm">View bills →</Link>
              </div>
            )}

            <div className="stats">
              <Stat label="Collected this month" value={money(d.collected.this_month)} sub={`${d.collected.payments_count} ${t('payments all time')}`} />
              <Stat label="Outstanding" value={money(d.outstanding.amount)} sub={`${d.outstanding.count} ${t('unpaid bills')}`} />
              <Stat label="Overdue" value={money(d.overdue.amount)} sub={`${d.overdue.count} ${t('late bills')}`} tone={d.overdue.count ? 'bad' : ''} />
              <Stat label="Occupancy" value={`${d.units.occupied}/${d.units.total}`} sub={`${d.units.vacant} ${t('vacant')} · ${d.properties} ${t('properties')}`} />
              <Stat label="Tenants" value={d.tenants} />
              <Stat label="Open repairs" value={d.open_maintenance} tone={d.open_maintenance ? 'warn' : ''} />
              {d.financials && <Stat label="Monthly Income" value={money(d.financials.total_monthly_rent)} sub={`${d.financials.active_leases_count} ${t('active leases')}`} />}
              {d.financials && Number(d.financials.estimated_annual_income) > 0 && <Stat label="Est. Annual Income" value={money(d.financials.estimated_annual_income)} sub="from active leases" />}
            </div>

            <div className="cols2">
              <Glass className="panel">
                <h2 className="panel__title">{t('Billed vs collected')}</h2>
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
                <p className="legend"><i className="dot dot--billed" /> {t('Billed')} <i className="dot dot--paid" /> {t('Collected')}</p>
              </Glass>

              <Glass className="panel">
                <h2 className="panel__title">{t('Recent payments')}</h2>
                {d.recent_payments.length === 0 ? <p className="muted">{t('No payments yet.')}</p> : (
                  <ul className="list">
                    {d.recent_payments.map((p) => (
                      <li key={p.id}>
                        <span><strong>{p.tenant_name}</strong> <span className="muted">· {p.unit_name} · {p.method?.replace('_', ' ')}</span><br /><small className="muted">{dateFmt(p.paid_at)} · {p.receipt_no}</small></span>
                        <strong>{money(p.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </Glass>
            </div>

            {/* Overdue bills list */}
            {d.overdue_bills?.length > 0 && (
              <Glass className="panel" style={{ marginTop: 18 }}>
                <h2 className="panel__title">⚠ {t('Overdue bills')}</h2>
                <ul className="list">
                  {d.overdue_bills.map((b) => (
                    <li key={b.id}>
                      <span>
                        <strong>{b.tenant_name}</strong>
                        <span className="muted"> · {b.unit_name} · {b.period_month}</span>
                        <br /><small style={{ color: 'var(--danger)' }}>{b.days_late} day{b.days_late !== 1 ? 's' : ''} late (due {dateFmt(b.due_date)})</small>
                      </span>
                      <strong style={{ color: 'var(--danger)' }}>{money(b.amount)}</strong>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 10 }}>
                  <Link to="/admin/bills?status=overdue" className="btn btn--ghost btn--sm">{t('All overdue bills →')}</Link>
                </div>
              </Glass>
            )}

            {/* Expiring leases list */}
            {d.expiring_leases?.length > 0 && (
              <Glass className="panel" style={{ marginTop: 18 }}>
                <h2 className="panel__title">⏰ {t('Leases expiring soon')}</h2>
                <ul className="list">
                  {d.expiring_leases.map((l) => (
                    <li key={l.id}>
                      <span>
                        <strong>{l.tenant_name}</strong>
                        <span className="muted"> · {l.unit_name} · {l.property_name}</span>
                        <br /><small style={{ color: Number(l.days_left) <= 7 ? 'var(--danger)' : '#92611a' }}>
                          {Number(l.days_left) <= 0
                            ? `Expired ${Math.abs(Number(l.days_left))} day(s) ago`
                            : `Expires in ${l.days_left} day(s)`
                          } · {dateFmt(l.end_date)}
                        </small>
                      </span>
                      <Link to="/admin/leases" className="btn btn--ghost btn--sm">{t('Renew')}</Link>
                    </li>
                  ))}
                </ul>
              </Glass>
            )}
          </>
        )}
      </State>
    </>
  )
}
