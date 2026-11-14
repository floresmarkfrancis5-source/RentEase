import { useState } from 'react'
import { Link } from 'react-router-dom'
import AssistantAvatar from '../../components/AssistantAvatar'
import Glass from '../../components/Glass'
import LandlordReport from '../../components/LandlordReport'
import { PageHead, State, useLoad } from '../../components/ui'
import { dateFmt, money } from '../../lib/api'
import HelpTip from '../../components/HelpTip'
import { helpFor, useLanguage } from '../../context/LanguageContext'

function Stat({ label, value, sub, variant = 'neutral' }) {
  const { language, t } = useLanguage()
  const help = helpFor(label, language)
  return (
    <Glass className={`stat dashboard-stat dashboard-stat--${variant}`}>
      <span className="stat__label">{t(label)}{help && <HelpTip text={help} label={language === 'tl' ? `Tulong tungkol sa: ${t(label)}` : `Help about: ${label}`} />}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{t(sub)}</span>}
    </Glass>
  )
}

export default function Dashboard() {
  const { t } = useLanguage()
  const { data: d, error, loading } = useLoad('/api/admin/dashboard')
  const [reportOpen, setReportOpen] = useState(false)
  const max = d ? Math.max(1, ...d.monthly.flatMap((m) => [m.billed, m.collected])) : 1

  return (
    <>
      <PageHead eyebrow="Landlord" title="Dashboard" sub="Collections, balances and occupancy at a glance.">
        <Link to="/admin/properties?action=add" className="btn btn--ghost">{t('Add property')}</Link>
        <Link to="/admin/bills" className="btn btn--ghost">{t('Generate bills')}</Link>
        <button type="button" className="btn btn--accent" onClick={() => setReportOpen(true)}>{t('Download report')}</button>
      </PageHead>
      <State loading={loading} error={error}>
        {d && (
          <>
            <Glass className="dashboard-assistant">
              <span className="dashboard-assistant__icon" aria-hidden="true">
                <AssistantAvatar className="assistant-avatar--dashboard" gears />
              </span>
              <div className="dashboard-assistant__copy">
                <span className="dashboard-assistant__eyebrow">{t('RentEase Assistant')}</span>
                <h2>{t('A little help with your rentals?')}</h2>
                <p>{t('Ask about your properties, units, tenants, or rent—or prepare a draft to review before making changes.')}</p>
              </div>
              <Link to="/admin/assistant" className="btn btn--accent">
                {t('Open Assistant')} <span aria-hidden="true">→</span>
              </Link>
            </Glass>

            <div className="stats stats--primary">
              <Stat label="Collected this month" value={money(d.collected.this_month)} sub={`${d.collected.payments_count} ${t('payments all time')}`} variant="collected" />
              <Stat label="Outstanding" value={money(d.outstanding.amount)} sub={`${d.outstanding.count} ${t('unpaid bills')}`} variant="outstanding" />
              <Stat label="Overdue" value={money(d.overdue.amount)} sub={`${d.overdue.count} ${t('late bills')}`} variant={d.overdue.count ? 'overdue' : 'neutral'} />
              <Stat label="Occupancy" value={`${d.units.occupied}/${d.units.total}`} sub={`${d.units.vacant} ${t('vacant')} · ${d.properties} ${t('properties')}`} variant="occupancy" />
            </div>

            {(d.overdue_bills?.length > 0 || d.expiring_leases?.length > 0) && (
              <Glass className="panel dashboard-attention">
                <div className="dashboard-attention__head">
                  <div>
                    <span className="dashboard-attention__eyebrow">{t('Action items')}</span>
                    <h2 className="panel__title">{t('Needs attention')}</h2>
                  </div>
                  <span className="dashboard-attention__count">{d.overdue.count + d.expiring_leases.length} {t('items')}</span>
                </div>
                <div className="dashboard-attention__grid">
                  {d.overdue_bills?.length > 0 && (
                    <section className="dashboard-attention__group">
                      <div className="dashboard-attention__group-head">
                        <h3>{t('Overdue bills')}</h3>
                        <span className="dashboard-attention__badge dashboard-attention__badge--danger">{d.overdue.count}</span>
                      </div>
                      <ul className="list">
                        {d.overdue_bills.slice(0, 3).map((bill) => (
                          <li key={bill.id}>
                            <span><strong>{bill.tenant_name}</strong><span className="muted"> · {bill.unit_name} · {bill.days_late} {t('days late')}</span></span>
                            <strong className="dashboard-attention__amount">{money(bill.amount)}</strong>
                          </li>
                        ))}
                      </ul>
                      <Link to="/admin/bills?status=overdue" className="btn btn--ghost btn--sm">{t('View overdue bills →')}</Link>
                    </section>
                  )}
                  {d.expiring_leases?.length > 0 && (
                    <section className="dashboard-attention__group">
                      <div className="dashboard-attention__group-head">
                        <h3>{t('Leases expiring soon')}</h3>
                        <span className="dashboard-attention__badge">{d.expiring_leases.length}</span>
                      </div>
                      <ul className="list">
                        {d.expiring_leases.slice(0, 3).map((lease) => (
                          <li key={lease.id}>
                            <span><strong>{lease.tenant_name}</strong><span className="muted"> · {lease.unit_name} · {lease.property_name}</span></span>
                            <span className={Number(lease.days_left) <= 7 ? 'dashboard-attention__urgent' : 'dashboard-attention__due'}>
                              {Number(lease.days_left) <= 0 ? t('Expired') : `${lease.days_left} ${t('days left')}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link to="/admin/leases" className="btn btn--ghost btn--sm">{t('View leases →')}</Link>
                    </section>
                  )}
                </div>
              </Glass>
            )}

            <section className="dashboard-secondary" aria-labelledby="dashboard-secondary-title">
              <h2 id="dashboard-secondary-title" className="dashboard-secondary__title">{t('Portfolio details')}</h2>
              <div className="stats stats--secondary">
                <Stat label="Tenants" value={d.tenants} variant="tenants" />
                <Stat label="Open repairs" value={d.open_maintenance} variant={d.open_maintenance ? 'repairs' : 'neutral'} />
                {d.financials && <Stat label="Monthly Income" value={money(d.financials.total_monthly_rent)} sub={`${d.financials.active_leases_count} ${t('active leases')}`} variant="income" />}
                {d.financials && Number(d.financials.estimated_annual_income) > 0 && <Stat label="Est. Annual Income" value={money(d.financials.estimated_annual_income)} sub="from active leases" variant="annual" />}
              </div>
            </section>

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
          </>
        )}
      </State>
      {reportOpen && <LandlordReport onClose={() => setReportOpen(false)} />}
    </>
  )
}
