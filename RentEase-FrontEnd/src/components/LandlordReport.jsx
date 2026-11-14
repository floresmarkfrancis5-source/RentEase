import { useEffect, useState } from 'react'
import { api, dateFmt, money } from '../lib/api'
import { useLanguage } from '../context/LanguageContext'

function ReportTable({ title, columns, rows, emptyLabel }) {
  const { t } = useLanguage()
  return (
    <section className="landlord-report__section">
      <h3>{t(title)} <span className="landlord-report__count">{rows.length}</span></h3>
      {rows.length ? (
        <div className="landlord-report__table-wrap">
          <table className="landlord-report__table">
            <thead>
              <tr>{columns.map((column) => <th key={column.label} scope="col">{t(column.label)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `${title}-${index}`}>
                  {columns.map((column) => <td key={column.label}>{column.value(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="landlord-report__empty">{t(emptyLabel)}</p>}
    </section>
  )
}

function Metric({ label, value, detail }) {
  const { t } = useLanguage()
  return (
    <div className="landlord-report__metric">
      <span>{t(label)}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export default function LandlordReport({ onClose }) {
  const { t } = useLanguage()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/admin/reports/landlord', { auth: true })
      .then(({ data }) => {
        if (!active) return
        setReport(data)
        setLoading(false)
        return api('/api/admin/reports/landlord/summary', { auth: true }).then(({ data: result }) => {
          if (active) setSummary(result)
        }).catch((requestError) => {
          if (active) setSummaryError(requestError.message)
        }).finally(() => {
          if (active) setSummaryLoading(false)
        })
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setLoading(false)
          setSummaryLoading(false)
        }
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const activity = report?.activity
  const inPeriod = (value) => value && value.slice(0, 10) >= report.period.start && value.slice(0, 10) <= report.period.end
  const propertiesCreated = report?.properties.filter((item) => inPeriod(item.created_at)) || []
  const unitsCreated = report?.units.filter((item) => inPeriod(item.created_at)) || []
  const propertiesUpdated = report?.properties.filter((item) => inPeriod(item.updated_at)) || []
  const unitsUpdated = report?.units.filter((item) => inPeriod(item.updated_at)) || []
  const propertyColumns = [
    { label: 'Property', value: (row) => row.name },
    { label: 'Type', value: (row) => row.type.replace('_', ' ') },
    { label: 'Location', value: (row) => [row.address, row.barangay, row.city].filter(Boolean).join(', ') },
    { label: 'Units', value: (row) => row.unit_count },
    { label: 'Occupied / vacant', value: (row) => `${row.occupied_units} / ${row.vacant_units}` },
    { label: 'Added', value: (row) => dateFmt(row.created_at) },
    { label: 'Last updated', value: (row) => dateFmt(row.updated_at) },
  ]
  const unitColumns = [
    { label: 'Property', value: (row) => row.property_name },
    { label: 'Unit', value: (row) => row.unit_name },
    { label: 'Monthly rent', value: (row) => money(row.monthly_rent) },
    { label: 'Occupancy', value: (row) => row.occupancy_status },
    { label: 'Condition', value: (row) => row.condition_tag.replaceAll('_', ' ') },
    { label: 'Tenant', value: (row) => row.tenant_name || '—' },
    { label: 'Last updated', value: (row) => dateFmt(row.updated_at) },
  ]
  const leaseColumns = [
    { label: 'Tenant', value: (row) => row.tenant_name },
    { label: 'Property / unit', value: (row) => `${row.property_name} · ${row.unit_name}` },
    { label: 'Status', value: (row) => row.status },
    { label: 'Term', value: (row) => `${dateFmt(row.start_date)} – ${dateFmt(row.end_date)}` },
    { label: 'Monthly rent', value: (row) => money(row.monthly_rent) },
    { label: 'Deposit', value: (row) => money(row.deposit) },
  ]
  const paymentColumns = [
    { label: 'Date', value: (row) => dateFmt(row.paid_at || row.created_at) },
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Status / method', value: (row) => `${row.status} · ${row.method.replace('_', ' ')}` },
    { label: 'Receipt', value: (row) => row.receipt_no || '—' },
    { label: 'Amount', value: (row) => money(row.amount) },
  ]
  const billColumns = [
    { label: 'Created', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Bill / period', value: (row) => `${row.description || t('Rent')} · ${row.period_month}` },
    { label: 'Due date / status', value: (row) => `${dateFmt(row.due_date)} · ${row.status}` },
    { label: 'Amount', value: (row) => money(row.amount) },
  ]
  const openBillColumns = [
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Billing period', value: (row) => row.period_month },
    { label: 'Due date / status', value: (row) => `${dateFmt(row.due_date)} · ${row.status}` },
    { label: 'Days overdue', value: (row) => row.status === 'overdue' ? row.days_late : '—' },
    { label: 'Amount', value: (row) => money(row.amount) },
  ]
  const leaseEventColumns = [
    { label: 'Date', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Event', value: (row) => row.summary },
  ]
  const transferColumns = [
    { label: 'Requested', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant', value: (row) => row.tenant_name },
    { label: 'Move', value: (row) => `${row.current_property} / ${row.current_unit} → ${row.requested_property} / ${row.requested_unit}` },
    { label: 'Status', value: (row) => `${row.status}${row.decided_at ? ` · ${dateFmt(row.decided_at)}` : ''}` },
  ]
  const earlyMoveColumns = [
    { label: 'Requested', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant', value: (row) => row.tenant_name },
    { label: 'Property / unit', value: (row) => `${row.property_name} · ${row.unit_name}` },
    { label: 'Requested move-in', value: (row) => dateFmt(row.requested_start_date) },
    { label: 'Status', value: (row) => `${row.status}${row.decided_at ? ` · ${dateFmt(row.decided_at)}` : ''}` },
  ]
  const maintenanceColumns = [
    { label: 'Opened', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Request', value: (row) => row.title },
    { label: 'Priority / status', value: (row) => `${row.priority} · ${row.status}` },
    { label: 'Resolved', value: (row) => dateFmt(row.resolved_at) },
  ]
  const openMaintenanceColumns = [
    { label: 'Opened', value: (row) => dateFmt(row.created_at) },
    { label: 'Tenant / unit', value: (row) => `${row.tenant_name} · ${row.property_name} / ${row.unit_name}` },
    { label: 'Request', value: (row) => row.title },
    { label: 'Priority / status', value: (row) => `${row.priority} · ${row.status}` },
  ]

  return (
    <div className="landlord-report-modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="landlord-report" role="dialog" aria-modal="true" aria-labelledby="landlord-report-title">
        <div className="landlord-report__toolbar">
          <span>{t('Landlord portfolio report')}</span>
          <div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()} disabled={!report}>
              {t('Print / Save PDF')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label={t('Close')}>
              {t('Close')}
            </button>
          </div>
        </div>

        <div className="landlord-report__paper">
          {loading && <p className="landlord-report__status" role="status">{t('Preparing your report…')}</p>}
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          {report && <>
            <header className="landlord-report__cover">
              <span>{t('RentEase · Landlord report')}</span>
              <h1 id="landlord-report-title">{t('Portfolio overview')}</h1>
              <p>{dateFmt(report.period.start)} – {dateFmt(report.period.end)}</p>
              <small>{t('Generated')} {dateFmt(report.period.generated_at)}</small>
            </header>

            <section className="landlord-report__section">
              <h2>{t('Executive summary')}</h2>
              {summaryLoading && <p className="landlord-report__status" role="status">{t('Gemini is preparing a summary from portfolio totals…')}</p>}
              {summaryError && <p className="landlord-report__notice" role="status">{t('The factual report is ready, but the AI summary could not be generated.')}{' '}{summaryError}</p>}
              {summary && <>
                <p className="landlord-report__summary">{summary.summary}</p>
                <p className="landlord-report__notice">{t('The AI summary uses aggregate portfolio figures only; tenant details stay in the factual tables.')}</p>
                {summary.observations.length > 0 && <ul className="landlord-report__observations">
                  {summary.observations.map((observation, index) => <li key={index}>{observation}</li>)}
                </ul>}
              </>}
              <div className="landlord-report__metrics">
                <Metric label="Properties" value={report.snapshot.properties} />
                <Metric label="Units" value={report.snapshot.units.total} detail={`${report.snapshot.units.occupied} occupied · ${report.snapshot.units.vacant} vacant`} />
                <Metric label="Active leases" value={report.snapshot.financials.active_leases_count} />
                <Metric label="Monthly rent" value={money(report.snapshot.financials.total_monthly_rent)} />
                <Metric label="Collected in period" value={money(report.ai_metrics.collected)} detail={`${report.ai_metrics.payments_count} paid payments`} />
                <Metric label="Outstanding" value={money(report.snapshot.outstanding.amount)} detail={`${report.snapshot.outstanding.count} bills`} />
                <Metric label="Overdue" value={money(report.snapshot.overdue.amount)} detail={`${report.snapshot.overdue.count} bills`} />
                <Metric label="Open repairs" value={report.snapshot.open_maintenance} />
              </div>
            </section>

            <ReportTable title="Property portfolio" columns={propertyColumns} rows={report.properties} emptyLabel="No properties to report." />
            <ReportTable title="Unit inventory" columns={unitColumns} rows={report.units} emptyLabel="No units to report." />
            <ReportTable title="Lease register" columns={leaseColumns} rows={report.leases} emptyLabel="No leases to report." />

            <section className="landlord-report__section">
              <h2>{t('Current items requiring follow-up')}</h2>
              <ReportTable title="Unpaid and overdue bills" columns={openBillColumns} rows={activity.open_bills} emptyLabel="No unpaid bills." />
              <ReportTable title="Open maintenance requests" columns={openMaintenanceColumns} rows={activity.open_maintenance} emptyLabel="No open maintenance requests." />
            </section>

            <section className="landlord-report__section">
              <h2>{t('Activity in this period')}</h2>
              <div className="landlord-report__activity-summary">
                <span>{propertiesCreated.length} {t('new properties')}</span>
                <span>{unitsCreated.length} {t('new units')}</span>
                <span>{activity.lease_events.length} {t('lease events')}</span>
                <span>{activity.bills.length} {t('bills created')}</span>
                <span>{activity.transfers.length} {t('transfer requests')}</span>
                <span>{activity.early_move_ins.length} {t('early move-in requests')}</span>
                <span>{activity.maintenance.length} {t('repair records')}</span>
                <span>{propertiesUpdated.length} {t('properties updated')}</span>
                <span>{unitsUpdated.length} {t('units updated')}</span>
              </div>
              <p className="landlord-report__notice">{t(report.history_note)}</p>
            </section>

            <ReportTable title="Payments recorded" columns={paymentColumns} rows={activity.payments} emptyLabel="No payment records in this period." />
            <ReportTable title="Bills created" columns={billColumns} rows={activity.bills} emptyLabel="No bills were created in this period." />
            <ReportTable title="Lease changes" columns={leaseEventColumns} rows={activity.lease_events} emptyLabel="No lease events in this period." />
            <ReportTable title="Transfer requests" columns={transferColumns} rows={activity.transfers} emptyLabel="No transfer requests in this period." />
            <ReportTable title="Early move-in requests" columns={earlyMoveColumns} rows={activity.early_move_ins} emptyLabel="No early move-in requests in this period." />
            <ReportTable title="Maintenance activity" columns={maintenanceColumns} rows={activity.maintenance} emptyLabel="No maintenance activity in this period." />
            <ReportTable title="Properties added in this period" columns={propertyColumns} rows={propertiesCreated} emptyLabel="No properties were added in this period." />
            <ReportTable title="Units added in this period" columns={unitColumns} rows={unitsCreated} emptyLabel="No units were added in this period." />
            <ReportTable title="Properties updated in this period" columns={propertyColumns} rows={propertiesUpdated} emptyLabel="No property updates were recorded in this period." />
            <ReportTable title="Units updated in this period" columns={unitColumns} rows={unitsUpdated} emptyLabel="No unit updates were recorded in this period." />
            <footer className="landlord-report__footer">
              {t('Confidential landlord report · Generated by RentEase')}
            </footer>
          </>}
        </div>
      </section>
    </div>
  )
}
