import { Field } from './ui'
import { annualEndDate } from '../lib/leaseContract'

export function billingStartDateError(startDate, style) {
  if (!startDate) return 'Choose a lease start date.'
  const day = Number(startDate.slice(-2))
  if (style === 'first_of_month' && day !== 1) return 'This billing schedule requires the lease to start on the first day of a month.'
  if (style === 'anniversary' && day > 28) return 'Anniversary billing requires a lease start date on or before the 28th.'
  return ''
}

export default function LeaseBillingFields({ values, onChange }) {
  const update = (patch) => onChange((current) => ({ ...current, ...patch }))
  return (
    <>
      <Field label="Rent billing schedule">
        <select value={values.billing_style} onChange={(event) => {
          const billing_style = event.target.value
          let start_date = values.start_date
          const day = Number(start_date?.slice(-2))
          if (billing_style === 'first_of_month' && day !== 1) {
            const date = start_date ? new Date(`${start_date}T12:00:00`) : new Date()
            date.setDate(1)
            date.setMonth(date.getMonth() + 1)
            start_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
          } else if (billing_style === 'anniversary' && day > 28) {
            const date = new Date(`${start_date}T12:00:00`)
            date.setDate(1)
            date.setMonth(date.getMonth() + 1)
            start_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
          }
          update({
            billing_style,
            ...(start_date !== values.start_date ? { start_date, end_date: annualEndDate(start_date) } : {}),
            ...(billing_style === 'anniversary' ? { due_day: Number(start_date.slice(-2)) } : {}),
            ...(billing_style === 'first_of_month' ? { due_day: 1, prorate_first_month: false } : {}),
          })
        }}>
          <option value="calendar">Calendar billing — fixed due day each month</option>
          <option value="anniversary">Anniversary billing — due on the lease start day</option>
          <option value="first_of_month">Start on the 1st only — rent due on the 1st</option>
        </select>
      </Field>
      {values.billing_style === 'calendar' && (
        <Field label="Rent due day (1–28)">
          <input type="number" min="1" max="28" required value={values.due_day} onChange={(event) => update({ due_day: event.target.value })} />
        </Field>
      )}
      {values.billing_style !== 'first_of_month' && (
        <Field label="Prorate the first partial month" checkbox>
          <input type="checkbox" checked={!!values.prorate_first_month} onChange={(event) => update({ prorate_first_month: event.target.checked })} />
        </Field>
      )}
      <div className="onboarding__grid">
        <Field label="Grace period (0–15 days)">
          <input type="number" min="0" max="15" required value={values.grace_period_days} onChange={(event) => update({ grace_period_days: event.target.value })} />
        </Field>
        <Field label="Late fee (PHP, optional)">
          <input type="number" min="0" max={Number(values.monthly_rent) || 999999.99} step="0.01" value={values.late_fee} onChange={(event) => update({ late_fee: event.target.value })} />
        </Field>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        A late fee is charged once after the grace period, only if configured, and cannot exceed one month of rent. These terms are saved on this lease.
      </p>
    </>
  )
}
