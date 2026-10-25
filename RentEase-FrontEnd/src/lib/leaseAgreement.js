const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]))

const formatDate = (value) => {
  if (!value) return 'Open-ended'
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(year, month - 1, day))
}

const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0)

export function printLeaseAgreement(lease) {
  const propertyAddress = [
    lease.address,
    lease.barangay || lease.property_barangay,
    lease.city || lease.property_city,
  ].filter(Boolean).join(', ')
  const rows = [
    ['Landlord', lease.landlord_name || ''],
    ['Tenant', lease.tenant_name],
    ['Tenant email', lease.tenant_email],
    ['Property', lease.property_name],
    ['Property address', propertyAddress],
    ['Unit', lease.unit_name],
    ['Lease begins', formatDate(lease.start_date)],
    ['Lease ends', formatDate(lease.end_date)],
    ['Monthly rent', formatMoney(lease.monthly_rent)],
    ['Security deposit', formatMoney(lease.deposit)],
    ['Rent due day', `Day ${lease.due_day} of each month`],
  ]
  const content = rows.map(([label, value]) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
  ).join('')
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.opener = null

  printWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Lease agreement - ${escapeHtml(lease.tenant_name)}</title>
        <style>
          body { max-width: 760px; margin: 40px auto; padding: 0 24px; color: #222; font: 15px/1.55 Georgia, serif; }
          h1, h2 { font-family: Arial, sans-serif; }
          h1 { margin-bottom: 4px; }
          .notice { padding: 10px 12px; border: 1px solid #999; font: 12px/1.5 Arial, sans-serif; }
          table { width: 100%; border-collapse: collapse; margin: 24px 0; }
          th, td { border: 1px solid #aaa; padding: 9px 12px; text-align: left; vertical-align: top; }
          th { width: 34%; background: #f3f0eb; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 70px; }
          .signature { padding-top: 8px; border-top: 1px solid #333; }
          .small { color: #555; font: 12px/1.5 Arial, sans-serif; }
          @media print { body { margin: 0 auto; } }
        </style>
      </head>
      <body>
        <p class="small">RENTEASE · LEASE DOCUMENT</p>
        <h1>Residential Lease Agreement</h1>
        <p class="notice"><strong>Draft template:</strong> Review and complete any additional terms required by both parties and applicable local law before signing. This printout is not legal advice.</p>
        <p>This document records the rental details agreed by the landlord and tenant named below.</p>
        <table><tbody>${content}</tbody></table>
        <h2>Agreement</h2>
        <p>The landlord agrees to provide use of the listed rental unit, and the tenant agrees to pay the rent and deposit shown above, follow the agreed due date, and care for the premises. Any additional house rules, utility arrangements, and other conditions should be written here and accepted by both parties.</p>
        <p>Additional terms: ________________________________________________________________</p>
        <p>________________________________________________________________________________</p>
        <div class="signatures">
          <div class="signature">Landlord signature · date</div>
          <div class="signature">Tenant signature · date</div>
        </div>
        <p class="small">Generated from RentEase lease records. Print date: ${escapeHtml(formatDate(new Date().toISOString().slice(0, 10)))}.</p>
      </body>
    </html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}
