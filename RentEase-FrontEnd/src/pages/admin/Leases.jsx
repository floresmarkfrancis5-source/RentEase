import { useMemo, useState } from 'react'
import { FormModal, Modal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, downloadPdf, money } from '../../lib/api'
import { printLeaseAgreement } from '../../lib/leaseAgreement'
import { useAuth } from '../../context/AuthContext'

const editableFields = [
  { name: 'end_date', label: 'Lease end date (optional)', type: 'date', hint: 'Leave empty for an open-ended lease.' },
  { name: 'monthly_rent', label: 'Monthly rent', type: 'number', min: 1, step: '0.01' },
  { name: 'deposit', label: 'Deposit', type: 'number', min: 0, step: '0.01' },
  { name: 'due_day', label: 'Due day of month (1–28)', type: 'number', min: 1, max: 28 },
]

export default function Leases() {
  const { user } = useAuth()
  const leases = useLoad('/api/admin/leases')
  const units = useLoad('/api/admin/units')
  const tenants = useLoad('/api/admin/tenants')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(null)
  const [toast, flash] = useToast()

  const newFields = [
    { name: 'unit_id', label: 'Unit', type: 'select', placeholder: 'Choose a vacant unit…',
      options: (units.data || []).filter((u) => u.occupancy_status === 'vacant' && u.condition_tag === 'good_condition').map((u) => ({ value: u.id, label: `${u.unit_name} · ${u.property_name}` })) },
    { name: 'tenant_id', label: 'Tenant', type: 'select', placeholder: 'Choose a tenant…',
      options: (tenants.data || []).filter((t) => t.is_active && !t.lease_id).map((t) => ({ value: t.id, label: t.full_name })) },
    { name: 'start_date', label: 'Start date', type: 'date', default: new Date().toISOString().slice(0, 10) },
    { name: 'end_date', label: 'End date (optional)', type: 'date' },
    { name: 'monthly_rent', label: 'Monthly rent (optional)', type: 'number', min: 1, step: '0.01', hint: 'Leave empty to use the unit rent.' },
    { name: 'deposit', label: 'Deposit', type: 'number', min: 0, step: '0.01', default: 0 },
    { name: 'due_day', label: 'Due day of month (1–28)', type: 'number', min: 1, max: 28, default: 5 },
  ]

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (leases.data || []).filter((lease) => {
      if (statusFilter !== 'all' && lease.status !== statusFilter) return false
      if (!term) return true
      return [lease.tenant_name, lease.tenant_email, lease.unit_name, lease.property_name]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [leases.data, search, statusFilter])

  async function saveNew(values) {
    const result = await api('/api/admin/leases', { method: 'POST', auth: true, body: clean(values) })
    flash(result.message)
    await Promise.all([leases.reload(), units.reload(), tenants.reload()])
  }

  async function saveTerms(values) {
    const isRenewal = form.kind === 'renew'
    const result = await api(`/api/admin/leases/${form.lease.id}${isRenewal ? '/renew' : ''}`, {
      method: isRenewal ? 'POST' : 'PATCH',
      auth: true,
      body: clean(values),
    })
    flash(result.message)
    setForm(null)
    await leases.reload()
  }

  async function endLease(lease) {
    if (!window.confirm(`End the lease of ${lease.tenant_name} for ${lease.unit_name} now? Existing bills will remain unchanged.`)) return
    try {
      const result = await api(`/api/admin/leases/${lease.id}/end`, { method: 'POST', auth: true, body: {} })
      flash(result.message)
      await Promise.all([leases.reload(), units.reload(), tenants.reload()])
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  const activeCount = (leases.data || []).filter((lease) => lease.status === 'active').length
  const endedCount = (leases.data || []).filter((lease) => lease.status === 'ended').length

  return (
    <>
      <PageHead eyebrow="Manage" title="Leases" sub="Manage rental terms, renewals, documents and the full lease history.">
        <button className="btn btn--accent" onClick={() => setForm({ kind: 'new' })}>+ New lease</button>
      </PageHead>
      <div className="lease-toolbar">
        <input aria-label="Search leases" placeholder="Search tenant, unit or property…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by lease status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All leases ({activeCount + endedCount})</option>
          <option value="active">Active ({activeCount})</option>
          <option value="ended">Ended ({endedCount})</option>
        </select>
      </div>
      <State loading={leases.loading} error={leases.error} empty={leases.data?.length === 0 && 'No leases yet. Add a property, unit and tenant first.'}>
        {leases.data && (
          <Table rows={rows}
            columns={[
              { key: 'tenant_name', label: 'Tenant', render: (lease) => <><strong>{lease.tenant_name}</strong><br /><small>{lease.tenant_email}</small></> },
              { key: 'unit_name', label: 'Unit / property', render: (lease) => <>{lease.unit_name}<br /><small>{lease.property_name}</small></> },
              { key: 'term', label: 'Term', render: (lease) => <>{dateFmt(lease.start_date)}<br /><small>to {dateFmt(lease.end_date)}</small></> },
              { key: 'monthly_rent', label: 'Rent', align: 'right', render: (lease) => money(lease.monthly_rent) },
              { key: 'due_day', label: 'Due day', render: (lease) => `Day ${lease.due_day}` },
              { key: 'status', label: 'Status', render: (lease) => <StatusPill value={lease.status} /> },
            ]}
            actions={(lease) => (
              <div className="lease-actions">
                <button className="btn btn--ghost btn--sm" onClick={() => setSelected(lease)}>Details</button>
                {lease.status === 'active' && <>
                  <button className="btn btn--ghost btn--sm" onClick={() => setForm({ kind: 'edit', lease })}>Edit terms</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setForm({ kind: 'renew', lease })}>Renew</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => endLease(lease)}>End</button>
                </>}
              </div>
            )} />
        )}
        {leases.data?.length > 0 && rows.length === 0 && <p className="muted state">No leases match your search and filter.</p>}
      </State>
      {form?.kind === 'new' && <FormModal title="Create lease" fields={newFields} onSubmit={saveNew} onClose={() => setForm(null)} />}
      {form?.kind === 'edit' && <FormModal title={`Edit lease terms · ${form.lease.tenant_name}`} fields={editableFields}
        initial={form.lease} onSubmit={saveTerms} onClose={() => setForm(null)} />}
      {form?.kind === 'renew' && <FormModal title={`Renew lease · ${form.lease.tenant_name}`} submitLabel="Renew lease"
        fields={[
          { name: 'end_date', label: 'New lease end date', type: 'date', hint: `Choose a date after ${dateFmt(form.lease.end_date) === '—' ? 'today' : dateFmt(form.lease.end_date)}.` },
          { name: 'monthly_rent', label: 'New monthly rent (optional)', type: 'number', min: 1, step: '0.01', hint: `Current rent: ${money(form.lease.monthly_rent)}` },
          { name: 'deposit', label: 'Deposit (optional)', type: 'number', min: 0, step: '0.01' },
          { name: 'due_day', label: 'Due day of month (optional)', type: 'number', min: 1, max: 28 },
        ]}
        onSubmit={saveTerms} onClose={() => setForm(null)} />}
      {selected && <LeaseDetails lease={{ ...selected, landlord_name: user?.full_name }} onClose={() => setSelected(null)} flash={flash} />}
      {toast}
    </>
  )
}

function LeaseDetails({ lease, onClose, flash }) {
  const history = useLoad(`/api/admin/leases/${lease.id}/history`)
  const documents = useLoad(`/api/admin/leases/${lease.id}/documents`)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const address = [lease.address, lease.property_barangay, lease.property_city].filter(Boolean).join(', ')

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Choose a PDF file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('PDFs must be no larger than 5 MB.')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const document = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the selected PDF.'))
        reader.readAsDataURL(file)
      })
      const result = await api(`/api/admin/leases/${lease.id}/documents`, {
        method: 'POST',
        auth: true,
        body: { name: file.name, document },
      })
      flash(result.message)
      await documents.reload()
    } catch (error) {
      setUploadError(error.message)
    } finally {
      setUploading(false)
    }
  }

  async function removeDocument(document) {
    if (!window.confirm(`Delete ${document.original_name}?`)) return
    try {
      const result = await api(`/api/admin/leases/${lease.id}/documents/${document.id}`, { method: 'DELETE', auth: true })
      flash(result.message)
      await documents.reload()
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  function print() {
    if (!printLeaseAgreement(lease)) flash('Allow pop-ups to print the lease agreement.', 'bad')
  }

  return (
    <Modal title="Lease details and history" onClose={onClose}>
      <div className="lease-detail-grid">
        <p><strong>Tenant</strong><span>{lease.tenant_name}<br /><small>{lease.tenant_email}</small></span></p>
        <p><strong>Unit</strong><span>{lease.unit_name} · {lease.property_name}</span></p>
        <p><strong>Address</strong><span>{address || '—'}</span></p>
        <p><strong>Lease term</strong><span>{dateFmt(lease.start_date)} – {dateFmt(lease.end_date)}</span></p>
        <p><strong>Monthly rent</strong><span>{money(lease.monthly_rent)}</span></p>
        <p><strong>Deposit</strong><span>{money(lease.deposit)}</span></p>
        <p><strong>Rent due</strong><span>Day {lease.due_day} of each month</span></p>
        <p><strong>Status</strong><span><StatusPill value={lease.status} /></span></p>
      </div>
      <div className="lease-detail-actions">
        <button className="btn btn--accent" onClick={print}>Print lease agreement</button>
        <label className={`btn btn--ghost${uploading ? ' is-disabled' : ''}`}>
          {uploading ? 'Uploading…' : 'Upload PDF'}
          <input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={upload} hidden />
        </label>
      </div>
      {uploadError && <p className="alert alert--error" role="alert">{uploadError}</p>}
      <h3>Lease documents</h3>
      <State loading={documents.loading} error={documents.error} empty={documents.data?.length === 0 && 'No PDF documents uploaded for this lease.'}>
        {documents.data?.map((doc) => (
          <div className="lease-document" key={doc.id}>
            <span><strong>{doc.original_name}</strong><small>{Math.max(1, Math.ceil(doc.byte_size / 1024))} KB · {dateFmt(doc.created_at)}</small></span>
            <div>
              <button className="btn btn--ghost btn--sm" onClick={() => downloadPdf(`/api/admin/leases/${lease.id}/documents/${doc.id}`, doc.original_name).catch((error) => flash(error.message, 'bad'))}>Download</button>
              <button className="btn btn--ghost btn--sm" onClick={() => removeDocument(doc)}>Delete</button>
            </div>
          </div>
        ))}
      </State>
      <h3>Lease history</h3>
      <State loading={history.loading} error={history.error} empty={history.data?.length === 0 && 'No lease history available.'}>
        {history.data?.map((event) => (
          <details className="lease-history" key={event.id}>
            <summary><span>{event.summary}</span><small>{dateFmt(event.created_at)}</small></summary>
            {(event.before_data || event.after_data) && <pre>{JSON.stringify({ before: event.before_data, after: event.after_data }, null, 2)}</pre>}
          </details>
        ))}
      </State>
      <div className="modal__foot"><button className="btn btn--ghost" onClick={onClose}>Close</button></div>
    </Modal>
  )
}
