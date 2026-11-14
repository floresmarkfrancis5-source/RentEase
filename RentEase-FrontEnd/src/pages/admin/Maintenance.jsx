import { useRef, useState } from 'react'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import { PhotoLightbox, RepairFeaturedPhoto, RepairPhotoThumbnails, compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'

function MaintenanceMoreActions({ request, onDelete }) {
  return (
    <details className="maintenance-action-menu">
      <summary aria-label={`More actions for ${request.title}`}>More</summary>
      <div className="maintenance-action-menu__items">
        <button type="button" className="is-danger" onClick={(event) => {
          event.currentTarget.closest('details')?.removeAttribute('open')
          onDelete(request)
        }}>
          Delete request
        </button>
      </div>
    </details>
  )
}

function daysOpen(createdAt) {
  if (!createdAt) return 0
  const created = new Date(String(createdAt).replace(' ', 'T'))
  if (Number.isNaN(created.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  created.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today - created) / 86400000))
}


function UpdateRepairModal({ item, onClose, onSave }) {
  const [status, setStatus] = useState(item.status || 'pending')
  const [adminNotes, setAdminNotes] = useState(item.admin_notes || '')
  const [resolutionPhotos, setResolutionPhotos] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activePhoto, setActivePhoto] = useState(null)
  const fileInputRef = useRef(null)

  const tenantPhotos = (item.images || []).filter((i) => (i.uploader_role || 'tenant') === 'tenant')
  const existingLandlordPhotos = (item.images || []).filter((i) => i.uploader_role === 'landlord')

  const addFiles = async (files) => {
    setError('')
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!validFiles.length) {
      setError('Please select or paste valid image files.')
      return
    }
    if (resolutionPhotos.length + validFiles.length > 8) {
      setError('You can attach up to 8 resolution photos.')
      return
    }

    try {
      const processed = await Promise.all(validFiles.map((f) => compressImageFile(f)))
      setResolutionPhotos((prev) => [...prev, ...processed])
    } catch (err) {
      setError(err.message || 'Failed to process some images.')
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile()
        if (f) {
          const ext = f.type === 'image/png' ? 'png' : 'jpg'
          const namedFile = new File([f], `resolution_proof_${Date.now()}_${i + 1}.${ext}`, { type: f.type })
          imageFiles.push(namedFile)
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      addFiles(imageFiles)
    }
  }

  const removeResolutionPhoto = (idx) => {
    setResolutionPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave({
        status,
        admin_notes: adminNotes.trim() || null,
        images: resolutionPhotos.map((p) => ({ name: p.name, data: p.data })),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal title="Update maintenance request" onClose={onClose} className="maintenance-update-modal">
        <form onSubmit={handleSubmit} onPaste={handlePaste} className="stack maintenance-update-form" noValidate>
          <section className="maintenance-update-summary" aria-label="Request information">
            <div className="maintenance-update-summary__heading">
              <div>
                <span className="maintenance-update-summary__eyebrow">Repair request</span>
                <h3>{item.title}</h3>
              </div>
              <div className="maintenance-update-summary__badges">
                <StatusPill value={item.priority === 'high' ? 'urgent' : item.priority} />
                <StatusPill value={item.status} />
              </div>
            </div>
            <div className="maintenance-update-summary__facts">
              <div><span>Tenant</span><strong>{item.tenant_name || '—'}</strong></div>
              <div><span>Unit</span><strong>{item.unit_name || '—'}</strong></div>
              {item.property_name && <div><span>Property</span><strong>{item.property_name}</strong></div>}
              <div><span>Reported</span><strong>{dateFmt(item.created_at)}</strong></div>
            </div>
            <div className="maintenance-update-summary__description">
              <span>Issue details</span>
              <p>{item.description || 'No description provided.'}</p>
            </div>
          </section>

          {(tenantPhotos.length > 0 || existingLandlordPhotos.length > 0) && (
            <details className="maintenance-update-photos">
              <summary>
                Review existing photos
                <span>{tenantPhotos.length + existingLandlordPhotos.length} attached</span>
              </summary>
              <div className="maintenance-update-photos__groups">
                {tenantPhotos.length > 0 && (
                  <div className="maintenance-update-photos__group">
                    <strong>Photos from tenant</strong>
                    <RepairPhotoThumbnails images={tenantPhotos} onSelectImage={setActivePhoto} maxPreview={6} />
                  </div>
                )}
                {existingLandlordPhotos.length > 0 && (
                  <div className="maintenance-update-photos__group">
                    <strong>Previously added resolution photos</strong>
                    <RepairPhotoThumbnails images={existingLandlordPhotos} onSelectImage={setActivePhoto} maxPreview={6} />
                  </div>
                )}
                <span className="field__hint">Select a photo to view it larger.</span>
              </div>
            </details>
          )}

          <section className="maintenance-update-section">
            <div className="maintenance-update-section__heading">
              <h3>Update progress</h3>
              <p>Choose the current stage of this repair.</p>
            </div>
            <div className="maintenance-status-options" role="radiogroup" aria-label="Request status">
              {[
                ['pending', 'Pending', 'Work has not started'],
                ['in_progress', 'In progress', 'Repair work is underway'],
                ['resolved', 'Resolved', 'The issue is fixed'],
              ].map(([value, label, description]) => (
                <label
                  key={value}
                  className={`maintenance-status-option${status === value ? ' is-selected' : ''}`}
                >
                  <input type="radio" name="maintenance-status" value={value} checked={status === value} onChange={() => setStatus(value)} />
                  <span className="maintenance-status-option__copy"><strong>{label}</strong><span>{description}</span></span>
                </label>
              ))}
            </div>
          </section>

          <label className="field maintenance-update-note">
            <span className="field__label">Message for tenant <span className="maintenance-update-optional">Optional</span></span>
            <textarea
              rows={3}
              placeholder="Share what was done, what happens next, or when the repair is expected."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
            <span className="field__hint">Your note is included in the tenant's update email when you save changes.</span>
          </label>

          <section className="maintenance-update-section maintenance-update-proof">
            <div className="maintenance-update-section__heading">
              <h3>Proof of repair</h3>
              <p>Add optional photos of completed work or an invoice. Recommended when resolving a request.</p>
            </div>
            <div
              tabIndex={0}
              role="button"
              aria-label="Add resolution photos. Select files, drag and drop, or paste images."
              className={`repair-dropzone maintenance-update-dropzone ${isDragOver ? 'is-dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragOver(false)
                if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
              }}
            >
              <span className="repair-dropzone__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path d="M4 5.5h3l1.4-2h7.2l1.4 2h3A2 2 0 0 1 22 7.5v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></svg>
              </span>
              <span className="repair-dropzone__title">Add photos</span>
              <span className="repair-dropzone__hint">Browse, drag and drop, or paste images. Up to 8 photos.</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>

            {resolutionPhotos.length > 0 && (
              <>
                <div className="repair-previews">
                  {resolutionPhotos.map((p, idx) => (
                    <div key={idx} className="repair-preview-card" title={p.name}>
                      <img src={p.data} alt={p.name} />
                      <button
                        type="button"
                        className="repair-preview-card__del"
                        onClick={(e) => { e.stopPropagation(); removeResolutionPhoto(idx) }}
                        aria-label={`Remove ${p.name}`}
                        title="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <span className="field__hint">{resolutionPhotos.length} photo{resolutionPhotos.length === 1 ? '' : 's'} will be added to the tenant's request.</span>
              </>
            )}
          </section>

          <div className="maintenance-update-notice" role="status">
            When you save a status, note, or photo change, the tenant receives an email update.
          </div>

          {error && <p className="alert alert--error" role="alert">{error}</p>}

          <div className="modal__foot maintenance-update-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn--accent" disabled={busy}>
              {busy ? 'Saving update…' : 'Save update'}
            </button>
          </div>
        </form>
      </Modal>

      {activePhoto && (
        <PhotoLightbox image={activePhoto} onClose={() => setActivePhoto(null)} />
      )}
    </>
  )
}

export default function Maintenance() {
  const { data, error, loading, reload } = useLoad('/api/admin/maintenance')
  const [edit, setEdit] = useState(null)
  const [activePhoto, setActivePhoto] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [sortBy, setSortBy] = useState('priority')
  const [toast, flash] = useToast()

  const rawData = data || []
  const counts = rawData.reduce((total, request) => {
    if (request.status !== 'resolved') total.open += 1
    if (request.status === 'in_progress') total.inProgress += 1
    if (request.status === 'resolved') total.resolved += 1
    if (request.status !== 'resolved' && request.priority === 'high') total.urgent += 1
    return total
  }, { open: 0, inProgress: 0, resolved: 0, urgent: 0 })

  const save = async (values) => {
    const res = await api(`/api/admin/maintenance/${edit.id}`, {
      method: 'PUT',
      auth: true,
      body: values,
    })
    flash(res.message || 'Request updated and tenant notified.')
    reload()
  }

  const deleteRequest = async (r) => {
    if (!window.confirm(`Delete maintenance request "${r.title}"?`)) return
    try {
      const res = await api(`/api/admin/maintenance/${r.id}`, {
        method: 'DELETE',
        auth: true,
      })
      flash(res.message || 'Maintenance request deleted.')
      reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  const filteredData = (rawData || []).filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const match =
        [r.title, r.category, r.description, r.tenant_name, r.unit_name, r.property_name]
          .some((value) => String(value || '').toLowerCase().includes(q))
      if (!match) return false
    }
    if (statusFilter === 'open' && r.status === 'resolved') return false
    if (statusFilter !== 'all' && statusFilter !== 'open' && r.status !== statusFilter) return false
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === 'priority') {
      const weight = { high: 3, medium: 2, low: 1 }
      const priorityDifference = (weight[b.priority] || 0) - (weight[a.priority] || 0)
      if (priorityDifference) return priorityDifference
      if (a.status !== 'resolved' && b.status !== 'resolved') return new Date(a.created_at) - new Date(b.created_at)
      return new Date(b.created_at) - new Date(a.created_at)
    }
    if (sortBy === 'unit-asc') return (a.unit_name || '').localeCompare(b.unit_name || '')
    if (sortBy === 'tenant-asc') return (a.tenant_name || '').localeCompare(b.tenant_name || '')
    return 0
  })
  const urgentRequests = [...rawData]
    .filter((r) => r.status !== 'resolved' && r.priority === 'high')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 3)

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Maintenance requests"
        sub="Track tenant-reported repairs, prioritize urgent issues, and keep tenants updated as work progresses."
      />

      {data && !error && (
        <section className="maintenance-summary" aria-label="Maintenance request overview">
          <button type="button" className={`maintenance-summary__item${statusFilter === 'open' && priorityFilter === 'all' ? ' is-active' : ''}`} onClick={() => { setStatusFilter('open'); setPriorityFilter('all') }} aria-pressed={statusFilter === 'open' && priorityFilter === 'all'}>
            <span>Open requests</span><strong>{counts.open}</strong><small>Waiting or in progress</small>
          </button>
          <button type="button" className={`maintenance-summary__item is-danger${priorityFilter === 'high' && statusFilter === 'open' ? ' is-active' : ''}`} onClick={() => { setStatusFilter('open'); setPriorityFilter('high') }} aria-pressed={priorityFilter === 'high' && statusFilter === 'open'}>
            <span>Urgent</span><strong>{counts.urgent}</strong><small>Needs prompt attention</small>
          </button>
          <button type="button" className={`maintenance-summary__item is-progress${statusFilter === 'in_progress' && priorityFilter === 'all' ? ' is-active' : ''}`} onClick={() => { setStatusFilter('in_progress'); setPriorityFilter('all') }} aria-pressed={statusFilter === 'in_progress' && priorityFilter === 'all'}>
            <span>In progress</span><strong>{counts.inProgress}</strong><small>Work underway</small>
          </button>
          <button type="button" className={`maintenance-summary__item is-resolved${statusFilter === 'resolved' && priorityFilter === 'all' ? ' is-active' : ''}`} onClick={() => { setStatusFilter('resolved'); setPriorityFilter('all') }} aria-pressed={statusFilter === 'resolved' && priorityFilter === 'all'}>
            <span>Resolved</span><strong>{counts.resolved}</strong><small>Completed requests</small>
          </button>
        </section>
      )}

      {urgentRequests.length > 0 && (
        <section className="maintenance-attention" aria-labelledby="maintenance-attention-title">
          <div className="maintenance-attention__heading">
            <div>
              <h2 id="maintenance-attention-title">Urgent requests</h2>
              <p>High-priority issues that are still open.</p>
            </div>
            <span>{counts.urgent}</span>
          </div>
          <ul>
            {urgentRequests.map((request) => (
              <li key={request.id}>
                <div className="maintenance-attention__issue">
                  <strong>{request.title}</strong>
                  <span>{request.tenant_name} · {request.unit_name}{request.property_name ? ` · ${request.property_name}` : ''}</span>
                </div>
                <span className="maintenance-attention__age">{daysOpen(request.created_at) === 0 ? 'Today' : `${daysOpen(request.created_at)}d waiting`}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(request)}>Update</button>
              </li>
            ))}
          </ul>
          {counts.urgent > urgentRequests.length && <button type="button" className="maintenance-attention__all" onClick={() => { setStatusFilter('open'); setPriorityFilter('high') }}>View all {counts.urgent} urgent requests</button>}
        </section>
      )}

      <State loading={loading} error={error} empty={rawData.length === 0 && 'No requests. Nothing is broken.'}>
        {rawData.length > 0 && (
          <>
            <ViewToolbar
              view={viewMode}
              onViewChange={setViewMode}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search request, tenant or unit…"
              sort={sortBy}
              onSortChange={setSortBy}
              sortOptions={[
                { value: 'priority', label: 'Sort: Priority and waiting time' },
                { value: 'newest', label: 'Sort: Newest first' },
                { value: 'oldest', label: 'Sort: Oldest first' },
                { value: 'unit-asc', label: 'Sort: Unit (A-Z)' },
                { value: 'tenant-asc', label: 'Sort: Tenant (A-Z)' },
              ]}
              filter={statusFilter}
              onFilterChange={setStatusFilter}
              filterOptions={[
                { value: 'all', label: 'All Statuses' },
                { value: 'open', label: 'Open requests' },
                { value: 'pending', label: 'Pending' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'resolved', label: 'Resolved' },
              ]}
            >
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">All Priorities</option>
                <option value="high">Urgent / High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </ViewToolbar>

            {filteredData.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)' }}>
                <p className="muted" style={{ margin: 0 }}>No maintenance requests match your filters.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="cards-grid">
                {filteredData.map((r) => {
                  const age = daysOpen(r.created_at)
                  const photos = r.images || []
                  const reportedPhotos = photos.filter((photo) => photo.uploader_role !== 'landlord')
                  const morePhotos = [...reportedPhotos.slice(1), ...photos.filter((photo) => photo.uploader_role === 'landlord')]
                  return <article key={r.id} className={`request-card maintenance-card${r.status !== 'resolved' && r.priority === 'high' ? ' is-urgent' : ''}`}>
                    <RepairFeaturedPhoto images={photos} onSelectImage={setActivePhoto} />
                    <div className="request-card__head">
                      <div className="maintenance-card__identity">
                        <h4 className="request-card__title">{r.title}</h4>
                        <span className="request-card__sub">{r.tenant_name} · <strong>{r.unit_name}</strong>{r.property_name ? ` · ${r.property_name}` : ''}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <StatusPill value={r.priority === 'high' ? 'urgent' : r.priority} />
                        <StatusPill value={r.status} />
                      </div>
                    </div>

                    <div className="maintenance-card__meta">
                      <span>{r.category && r.category !== 'Other' ? r.category : 'Repair request'}</span>
                      <span>{r.status === 'resolved' ? `Submitted ${dateFmt(r.created_at)}` : age === 0 ? 'Submitted today' : `Waiting ${age} day${age === 1 ? '' : 's'}`}</span>
                    </div>

                    <div className="request-card__body maintenance-card__description">{r.description}</div>

                    {(morePhotos.length > 0 || r.admin_notes) && (
                      <details className="maintenance-card__details">
                        <summary>
                          Additional updates
                          {(morePhotos.length > 0 || r.admin_notes) && <span>{[morePhotos.length ? `${morePhotos.length} more photo${morePhotos.length === 1 ? '' : 's'}` : null, r.admin_notes ? 'landlord note' : null].filter(Boolean).join(' · ')}</span>}
                        </summary>
                        <div className="maintenance-card__details-content">
                          {reportedPhotos.length > 1 && (
                            <div>
                              <small className="muted">More photos from tenant</small>
                              <RepairPhotoThumbnails images={reportedPhotos.slice(1)} onSelectImage={setActivePhoto} maxPreview={3} />
                            </div>
                          )}
                          {photos.some((photo) => photo.uploader_role === 'landlord') && (
                            <div>
                              <small className="muted">Landlord resolution photos</small>
                              <RepairPhotoThumbnails images={photos.filter((photo) => photo.uploader_role === 'landlord')} onSelectImage={setActivePhoto} maxPreview={3} />
                            </div>
                          )}
                          {r.admin_notes && <p><strong>Landlord note:</strong> {r.admin_notes}</p>}
                        </div>
                      </details>
                    )}

                    <div className="request-card__foot maintenance-card__foot">
                      <button type="button" className="btn btn--accent btn--sm" onClick={() => setEdit(r)}>
                        Update request
                      </button>
                      <MaintenanceMoreActions request={r} onDelete={deleteRequest} />
                    </div>
                  </article>
                })}
              </div>
            ) : (
              <Table
                rows={filteredData}
                columns={[
                  {
                    key: 'title',
                    label: 'Request',
                    render: (r) => (
                      <>
                        <strong>{r.title}</strong>
                        <br />
                        <small className="muted">{r.description}</small>
                      </>
                    ),
                  },
                  {
                    key: 'tenant_name',
                    label: 'Tenant',
                    render: (r) => `${r.tenant_name} · ${r.unit_name}`,
                  },
                  {
                    key: 'photos',
                    label: 'Photos',
                    render: (r) => <RepairPhotoThumbnails images={r.images} onSelectImage={setActivePhoto} maxPreview={3} />,
                  },
                  { key: 'priority', label: 'Priority', render: (r) => <StatusPill value={r.priority === 'high' ? 'urgent' : r.priority} /> },
                  { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
                  { key: 'created_at', label: 'Waiting', render: (r) => r.status === 'resolved' ? dateFmt(r.created_at) : daysOpen(r.created_at) === 0 ? 'Today' : `${daysOpen(r.created_at)} days` },
                ]}
                actions={(r) => (
                  <div className="maintenance-row-actions">
                    <button className="btn btn--accent btn--sm" onClick={() => setEdit(r)}>
                      Update
                    </button>
                    <MaintenanceMoreActions request={r} onDelete={deleteRequest} />
                  </div>
                )}
              />
            )}
          </>
        )}
      </State>

      {edit && (
        <UpdateRepairModal
          item={edit}
          onClose={() => setEdit(null)}
          onSave={save}
        />
      )}

      {activePhoto && (
        <PhotoLightbox image={activePhoto} onClose={() => setActivePhoto(null)} />
      )}

      {toast}
    </>
  )
}
