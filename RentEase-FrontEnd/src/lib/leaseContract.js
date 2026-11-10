const DEFAULT_CLAUSES = [
  { id: 'parties', title: 'PARTIES', enabled: true, text: 'This Rental Agreement (the “Agreement”) is made on {{effective_date}} by and between {{landlord}} (the “Landlord”) and {{tenant}} (the “Tenant”) for the premises identified in this Agreement. Together, they are the “Parties.”' },
  { id: 'consideration', title: 'CONSIDERATION', enabled: true, text: 'The Tenant agrees to pay the rent and other amounts stated in this Agreement in exchange for the right to occupy the premises. The Landlord agrees to provide possession of the premises on the lease start date, subject to these terms.' },
  { id: 'term', title: 'TERM', enabled: true, text: 'The lease begins on {{start_date}} and ends on {{end_date}}. Renewal or extension requires written agreement by both Parties.' },
  { id: 'premises', title: 'PREMISES, USE AND OCCUPANCY', enabled: true, text: 'The premises are {{unit}} at {{property}}, located at {{address}}. The premises may be used for residential purposes only. The Tenant will keep the premises in reasonable condition and promptly report damage or repairs.' },
  { id: 'costs', title: 'COSTS AND PAYMENT', enabled: true, text: 'Monthly rent is {{rent}}, first due on {{first_due_date}} and thereafter according to {{billing_schedule}}. The Tenant has a grace period of {{grace_days}} days. The late fee is {{late_fee}} after that period. The security deposit is {{deposit}} and advance rent is {{advance}}. Electricity is paid by {{electricity}}, water by {{water}}, and internet by {{internet}}. Deposit deductions and any remaining refund will be documented within {{refund_days}} days after move-out.' },
  { id: 'rules', title: 'HOUSE RULES', enabled: true, text: 'The Tenant agrees to follow the house rules listed below.' },
]

export const DEFAULT_LEASE_TEMPLATE = {
  enabled: false,
  clauses: DEFAULT_CLAUSES,
  rules: [],
  utilities: { electricity: 'Tenant', water: 'Tenant', internet: 'Tenant' },
  notices: { entry_hours: 24, termination_days: 30, unpaid_months: 2, refund_days: 30, grace_days: 3, late_fee: 0 },
}

export function parseLeaseTemplate(value) {
  if (!value) return structuredClone(DEFAULT_LEASE_TEMPLATE)
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return {
      enabled: !!parsed.enabled,
      clauses: Array.isArray(parsed.clauses) ? parsed.clauses : structuredClone(DEFAULT_CLAUSES),
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      utilities: { ...DEFAULT_LEASE_TEMPLATE.utilities, ...(parsed.utilities || {}) },
      notices: { ...DEFAULT_LEASE_TEMPLATE.notices, ...(parsed.notices || {}) },
    }
  } catch {
    return structuredClone(DEFAULT_LEASE_TEMPLATE)
  }
}

export function defaultMoveInDate(days = 5) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function billingDefaultMoveInDate(style, days = 5) {
  const start = defaultMoveInDate(days)
  const [year, month, day] = start.split('-').map(Number)
  const needsFirstOfMonth = (style === 'first_of_month' && day !== 1) || (style === 'anniversary' && day > 28)
  if (!needsFirstOfMonth) return start
  const date = new Date(year, month, 1, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function annualEndDate(startDate) {
  if (!startDate) return ''
  const [year, month, day] = startDate.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  date.setFullYear(date.getFullYear() + 1)
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function billingFirstDueDate(lease) {
  const start = String(lease.start_date || '').slice(0, 10)
  if (!start) return ''
  const [year, month, day] = start.split('-').map(Number)
  const style = lease.billing_style || 'calendar'
  let dueDay = Number(lease.due_day || 1)
  if (style === 'first_of_month') dueDay = 1
  if (style === 'anniversary') dueDay = day
  let due = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(dueDay, new Date(year, month, 0).getDate())).padStart(2, '0')}`
  if (due < start) due = start
  return readableDate(due)
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]))

function readableDate(value) {
  const [year, month, day] = String(value || '').split(/[- T]/).map(Number)
  if (!year || !month || !day) return ''
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(year, month - 1, day, 12))
}

export function leaseContractHtml(lease) {
  const { clauses: contractClauses, rules } = leaseContractDetails(lease)
  const clauses = contractClauses.map((clause, index) =>
    `<section class="contract-section"><h2>${escapeHtml(clause.title)}</h2><p>${escapeHtml(clause.text).replace(/\n/g, '<br>')}</p></section>`,
  ).join('')
  const renderedRules = rules.length
    ? `<ul>${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>`
    : '<div class="rule-lines"><p>________________________________________________________________________</p><p>________________________________________________________________________</p><p>________________________________________________________________________</p></div>'
  const acceptance = lease.tenant_accepted_at
    ? `<p class="contract-acceptance">Tenant acceptance recorded electronically on ${escapeHtml(readableDate(lease.tenant_accepted_at))}.</p>`
    : ''
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Annual Lease Contract</title>
    <style>
      @page{size:A4;margin:16mm}
      *{box-sizing:border-box}
      body{margin:0;background:#eee9df;color:#171512;font:11pt/1.48 Georgia,'Times New Roman',serif}
      .paper{max-width:190mm;min-height:265mm;margin:16px auto;padding:12mm 15mm;border:8px double #eadfc7;background:#fffdf8;box-shadow:0 5px 24px #0002}
      h1{margin:0 0 10mm;text-align:center;font:700 23pt/1.15 'Times New Roman',serif;letter-spacing:.3px;text-transform:uppercase}
      .contract-section{margin:0 0 5mm;break-inside:avoid}
      h2{margin:0 0 2mm;font:700 10.5pt/1.3 Georgia,serif;text-decoration:underline;text-transform:uppercase}
      p{margin:0;text-align:justify}
      ul{margin:2mm 0 0;padding-left:7mm}
      li{margin:0 0 2mm}
      .rule-lines p{margin:3mm 0}
      .contract-acceptance{margin-top:5mm;font-style:italic}
      .agreement-note{margin-top:6mm}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:24mm;margin:18mm 5mm 0}
      .signature{text-align:center;border-top:1px solid #222;padding-top:2mm;font-size:9pt}
      @media print{body{background:#fff}.paper{max-width:none;min-height:0;margin:0;padding:0;border:6px double #eadfc7;box-shadow:none}.contract-section{break-inside:avoid}}
    </style></head>
    <body><article class="paper"><h1>Rental Agreement</h1>
    ${clauses}<section class="contract-section"><h2>House Rules</h2>${renderedRules}</section>
    ${acceptance}<p class="agreement-note">By signing below, the Parties confirm that they have read and agree to the terms of this Agreement.</p>
    <div class="signatures"><div class="signature">Tenant’s Signature · Date</div><div class="signature">Landlord’s Signature · Date</div></div></article></body></html>`)
  popup.document.close()
  popup.focus()
  popup.print()
  return true
}

export function leaseContractDetails(lease) {
  const template = parseLeaseTemplate(lease.contract_json)
  const utilities = template.utilities || DEFAULT_LEASE_TEMPLATE.utilities
  const notices = template.notices || DEFAULT_LEASE_TEMPLATE.notices
  const address = [lease.address, lease.property_barangay, lease.property_city].filter(Boolean).join(', ')
  const values = {
    landlord: lease.landlord_name || 'Landlord',
    tenant: lease.tenant_name || 'Tenant',
    property: lease.property_name || 'Property',
    address: address || 'Property address',
    unit: lease.unit_name || 'Unit',
    start_date: readableDate(lease.start_date),
    end_date: readableDate(lease.end_date),
    effective_date: readableDate(lease.created_at) || readableDate(lease.start_date),
    rent: `PHP ${Number(lease.monthly_rent || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    deposit: `PHP ${Number(lease.deposit || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    advance: `PHP ${Number(lease.advance_payment || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    due_day: lease.due_day || 5,
    termination_notice_days: notices.termination_days || 30,
    unpaid_months: notices.unpaid_months ?? 2,
    entry_hours: notices.entry_hours || 24,
    refund_days: notices.refund_days || 30,
    grace_days: Number(lease.grace_period_days ?? notices.grace_days ?? 3),
    late_fee: Number(lease.late_fee ?? notices.late_fee ?? 0) > 0
      ? `PHP ${Number(lease.late_fee ?? notices.late_fee).toLocaleString('en-PH', { minimumFractionDigits: 2 })} after the grace period`
      : 'No late fee',
    first_due_date: billingFirstDueDate(lease),
    billing_schedule: lease.billing_style === 'anniversary'
      ? 'the lease start day of each month'
      : lease.billing_style === 'first_of_month'
        ? 'the first day of each month'
        : `day ${lease.due_day || 1} of each month`,
    electricity: utilities.electricity || 'Tenant',
    water: utilities.water || 'Tenant',
    internet: utilities.internet || 'Tenant',
  }
  const clauses = template.clauses
    .filter((clause) => clause.enabled !== false)
    .map((clause) => {
      const text = String(clause.text || '').replace(/\{\{([a-z_]+)\}\}/g, (_, key) => values[key] ?? '')
      return { title: clause.title, text }
    })
  return { clauses, rules: template.rules }
}