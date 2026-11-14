import { useRef, useState } from 'react'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import { PhotoLightbox, RepairFeaturedPhoto, RepairPhotoThumbnails, compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'

const REPAIR_CATEGORIES = [
  ['Gas leak or fire damage', 'Urgent'],
  ['Electrical (wiring, outlets, breaker)', 'Urgent'],
  ['Plumbing (leaks, pipes, drains, toilet)', 'Urgent'],
  ['Water supply (pump, tank, no water)', 'Urgent'],
  ['Doors, windows, and locks', 'Medium'],
  ['Roof and ceiling', 'Medium'],
  ['Water heater or aircon (if provided)', 'Medium'],
  ['Pests and mold', 'Medium'],
  ['Walls, floors, and paint', 'Low'],
  ['Other', 'Low'],
]

function NewRepairModal({ onClose, onSuccess }) {
  const [category, setCategory] = useState(REPAIR_CATEGORIES[0][0])
  const [customTitle, setCustomTitle] = useState('')
  const [customPriority, setCustomPriority] = useState('low')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const addFiles = async (files) => {
    setError('')
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!validFiles.length) {
      setError('Please select or paste valid image files.')
      return
    }
    if (photos.length + validFiles.length > 10) {
      setError('You can attach up to 10 photos per repair request.')
      return
    }

    try {
      const processed = await Promise.all(validFiles.map((f) => compressImageFile(f)))
      setPhotos((prev) => [...prev, ...processed])
    } catch (err) {
      setError(err.message || 'Failed to process some images.')
    }
  }

  // Handle clipboard paste (Ctrl+V) anywhere inside the modal
  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile()
        if (f) {
          const ext = f.type === 'image/png' ? 'png' : 'jpg'
          const namedFile = new File([f], `screenshot_${Date.now()}_${i + 1}.${ext}`, { type: f.type })
          imageFiles.push(namedFile)
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      addFiles(imageFiles)
    }
  }

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if ((category === 'Other' && customTitle.trim().length < 3) || !description.trim()) {
      setError(category === 'Other' ? 'Describe the repair and provide its details.' : 'Please describe what happened and where.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = {
        category,
        title: category === 'Other' ? customTitle.trim() : category,
        ...(category === 'Other' ? { priority: customPriority } : {}),
        description: description.trim(),
        images: photos.map((p) => ({ name: p.name, data: p.data })),
      }
      const res = await api('/api/my/maintenance', { method: 'POST', auth: true, body: payload })
      onSuccess(res.message || 'Repair request sent to your landlord.')
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to send repair request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="New repair request" onClose={onClose}>
      <form onSubmit={handleSubmit} onPaste={handlePaste} className="stack" noValidate>
        <label className="field">
          <span className="field__label">Repair category and default urgency</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {REPAIR_CATEGORIES.map(([name, urgency]) => <option key={name} value={name}>{name} · {urgency}</option>)}
          </select>
          <span className="field__hint">Preset categories have a fixed urgency. For Other, you can choose the urgency that fits the request.</span>
        </label>

        {category === 'Other' && <label className="field">
          <span className="field__label">What needs fixing?</span>
          <input type="text" maxLength={120} required placeholder="Describe the repair"
            value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
        </label>}
        {category === 'Other' && <label className="field">
          <span className="field__label">Urgency</span>
          <select value={customPriority} onChange={(e) => setCustomPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">Urgent</option>
          </select>
        </label>}

        <label className="field">
          <span className="field__label">Details and location</span>
          <textarea
            rows={3}
            required
            placeholder="Describe the issue, what happened, and where it is in the unit..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">Attach photos & screenshots</span>
          <div
            tabIndex={0}
            className={`repair-dropzone ${isDragOver ? 'is-dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
            }}
          >
            <span className="repair-dropzone__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
            <p className="repair-dropzone__title">
              Click to browse, drag & drop, or paste <span className="repair-dropzone__kbd">Ctrl+V</span>
            </p>
            <p className="repair-dropzone__hint">
              You can paste multiple screenshots directly from your clipboard or upload photos from your device (PNG, JPG, WebP)
            </p>
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

          {photos.length > 0 && (
            <div className="repair-previews">
              {photos.map((p, idx) => (
                <div key={idx} className="repair-preview-card" title={p.name}>
                  <img src={p.data} alt={p.name} />
                  <button
                    type="button"
                    className="repair-preview-card__del"
                    onClick={(e) => { e.stopPropagation(); removePhoto(idx) }}
                    title="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length > 0 && (
            <span className="field__hint" style={{ marginTop: '6px', display: 'block' }}>
              {photos.length} photo{photos.length > 1 ? 's' : ''} attached.
            </span>
          )}
        </div>

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn--accent" disabled={busy}>
            {busy ? 'Sending request…' : 'Send request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RepairDetailModal({ item, onClose, onSelectPhoto }) {
  if (!item) return null
  const tenantPhotos = (item.images || []).filter((i) => (i.uploader_role || 'tenant') === 'tenant')
  const landlordPhotos = (item.images || []).filter((i) => i.uploader_role === 'landlord')

  return (
    <Modal title={`Repair Details: ${item.title}`} onClose={onClose}>
      <div className="stack">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <StatusPill value={item.status} />
          <StatusPill value={item.priority === 'high' ? 'urgent' : item.priority} />
          <span className="muted" style={{ fontSize: '.84rem', marginLeft: 'auto' }}>Sent {dateFmt(item.created_at)}</span>
        </div>

        <div style={{ padding: '14px', background: 'var(--page-raised)', borderRadius: '10px', border: '1px solid var(--page-line)' }}>
          <strong style={{ display: 'block', fontSize: '.9rem', marginBottom: '6px' }}>Issue Description</strong>
          <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--page-text)', whiteSpace: 'pre-wrap' }}>
            {item.description}
          </p>
        </div>

        {/* Reported photos */}
        {tenantPhotos.length > 0 && (
          <div>
            <strong style={{ fontSize: '.88rem', display: 'block', marginBottom: '8px' }}>
              Your Attached Photos ({tenantPhotos.length})
            </strong>
            <RepairPhotoThumbnails images={tenantPhotos} onSelectImage={onSelectPhoto} maxPreview={8} />
            <small className="muted">Click any photo to zoom in full size.</small>
          </div>
        )}

        {/* Landlord notes & resolution photos */}
        {(item.admin_notes || landlordPhotos.length > 0) && (
          <div style={{ padding: '14px', background: 'color-mix(in srgb, var(--accent) 8%, var(--page-raised))', borderRadius: '10px', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--page-line))' }}>
            <strong style={{ display: 'block', fontSize: '.9rem', marginBottom: '6px', color: 'var(--accent)' }}>
              Note & Resolution from Landlord
            </strong>
            {item.admin_notes && (
              <p style={{ margin: '0 0 10px', fontSize: '.9rem', whiteSpace: 'pre-wrap' }}>
                {item.admin_notes}
              </p>
            )}
            {landlordPhotos.length > 0 && (
              <div>
                <strong style={{ fontSize: '.84rem', display: 'block', marginBottom: '6px', color: '#15803d' }}>
                  ✓ Landlord's Resolution / Proof Photos ({landlordPhotos.length}):
                </strong>
                <RepairPhotoThumbnails images={landlordPhotos} onSelectImage={onSelectPhoto} maxPreview={8} />
              </div>
            )}
          </div>
        )}

        <div className="modal__foot">
          <button type="button" className="btn btn--accent" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

export default function Maintenance() {
  const { data, error, loading, reload } = useLoad('/api/my/maintenance')
  const leaseSummary = useLoad('/api/my/summary')
  const [open, setOpen] = useState(false)
  const [detailItem, setDetailItem] = useState(null)
  const [activePhoto, setActivePhoto] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [toast, flash] = useToast()

  const rawData = data || []
  const requestCounts = rawData.reduce((counts, request) => {
    counts.all += 1
    if (request.status === 'pending') counts.pending += 1
    if (request.status === 'in_progress') counts.inProgress += 1
    if (request.status === 'resolved') counts.resolved += 1
    return counts
  }, { all: 0, pending: 0, inProgress: 0, resolved: 0 })

  const deleteRequest = async (r) => {
    const action = r.status === 'pending' ? 'cancel and delete' : 'delete'
    if (!window.confirm(`Are you sure you want to ${action} "${r.title}"? This will permanently remove the request and its photos.`)) return
    try {
      const res = await api(`/api/my/maintenance/${r.id}`, {
        method: 'DELETE',
        auth: true,
      })
      flash(res.message || 'Request cancelled.')
      reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  const filteredData = (rawData || []).filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const match = [r.title, r.description, r.admin_notes]
        .some((value) => String(value || '').toLowerCase().includes(q))
      if (!match) return false
    }
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === 'priority') {
      const weight = { high: 3, medium: 2, low: 1 }
      return (weight[b.priority] || 0) - (weight[a.priority] || 0)
    }
    if (sortBy === 'title-asc') return (a.title || '').localeCompare(b.title || '')
    return 0
  })

  return (
    <>
      <PageHead eyebrow="My rent" title="Repair requests" sub="Tell your landlord what needs fixing, attach photos, and follow its status.">
        <button className="btn btn--accent" disabled={leaseSummary.loading || !leaseSummary.data?.lease} onClick={() => setOpen(true)}>+ New request</button>
      </PageHead>
      {leaseSummary.error && (
        <p className="alert alert--error" role="alert">Could not verify your active lease. Refresh this page before creating a repair request.</p>
      )}
      {!leaseSummary.loading && !leaseSummary.error && !leaseSummary.data?.lease && (
        <p className="alert" role="status">A repair request is available after your lease starts and you have an assigned unit. Contact your landlord if you need help before move-in.</p>
      )}

      {data && !error && rawData.length > 0 && (
        <section className="tenant-repair-summary" aria-label="Repair request overview">
          {[
            ['all', 'All requests', requestCounts.all, 'Every request'],
            ['pending', 'Pending', requestCounts.pending, 'Waiting for review'],
            ['in_progress', 'In progress', requestCounts.inProgress, 'Work underway'],
            ['resolved', 'Resolved', requestCounts.resolved, 'Completed requests'],
          ].map(([filter, label, count, hint]) => (
            <button
              type="button"
              key={filter}
              className={`tenant-repair-summary__item${statusFilter === filter ? ' is-active' : ''}${filter === 'resolved' ? ' is-resolved' : filter === 'in_progress' ? ' is-progress' : ''}`}
              onClick={() => setStatusFilter(filter)}
              aria-pressed={statusFilter === filter}
            >
              <span>{label}</span><strong>{count}</strong><small>{hint}</small>
            </button>
          ))}
        </section>
      )}

      <State loading={loading} error={error} empty={rawData.length === 0 && 'No requests yet.'}>
        {rawData.length > 0 && (
          <>
            <ViewToolbar
              view={viewMode}
              onViewChange={setViewMode}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search repair requests…"
              sort={sortBy}
              onSortChange={setSortBy}
              sortOptions={[
                { value: 'newest', label: 'Sort: Newest first' },
                { value: 'oldest', label: 'Sort: Oldest first' },
                { value: 'priority', label: 'Sort: Priority (Urgent first)' },
                { value: 'title-asc', label: 'Sort: Title (A-Z)' },
              ]}
              filter={statusFilter}
              onFilterChange={setStatusFilter}
              filterOptions={[
                { value: 'all', label: 'All Statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'resolved', label: 'Resolved' },
              ]}
            />

            {filteredData.length === 0 ? (
              <div className="tenant-repair-empty">
                <strong>No repair requests match these filters</strong>
                <span>Try another status or clear your search to see your requests.</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="cards-grid tenant-repair-grid">
                {filteredData.map((r) => {
                  const photos = r.images || []
                  const reportedPhotos = photos.filter((photo) => photo.uploader_role !== 'landlord')
                  const morePhotos = [...reportedPhotos.slice(1), ...photos.filter((photo) => photo.uploader_role === 'landlord')]
                  return (
                    <article key={r.id} className={`request-card tenant-repair-card${r.priority === 'high' && r.status !== 'resolved' ? ' is-urgent' : ''}${r.status === 'resolved' ? ' is-resolved' : ''}`}>
                    <RepairFeaturedPhoto images={photos} onSelectImage={setActivePhoto} />
                    <div className="request-card__head">
                      <div className="tenant-repair-card__identity">
                        <h3 className="request-card__title">{r.title}</h3>
                        <span className="request-card__sub">Submitted {dateFmt(r.created_at)}</span>
                      </div>
                      <div className="tenant-repair-card__badges">
                        <StatusPill value={r.priority === 'high' ? 'urgent' : r.priority} />
                        <StatusPill value={r.status} />
                      </div>
                    </div>

                    <p className="request-card__body tenant-repair-card__description">{r.description}</p>

                    {(morePhotos.length > 0 || r.admin_notes) && (
                      <details className="tenant-repair-card__updates">
                        <summary>
                          Additional updates
                          <span>{[morePhotos.length ? `${morePhotos.length} more photo${morePhotos.length === 1 ? '' : 's'}` : null, r.admin_notes ? 'landlord note' : null].filter(Boolean).join(' · ')}</span>
                        </summary>
                        <div className="tenant-repair-card__update-content">
                          {r.admin_notes && (
                            <div className="tenant-repair-card__landlord-note">
                              <strong>Note from landlord</strong>
                              <p>{r.admin_notes}</p>
                            </div>
                          )}
                          {reportedPhotos.length > 1 && (
                            <div className="tenant-repair-card__photos">
                              <strong>More photos from you</strong>
                              <RepairPhotoThumbnails images={reportedPhotos.slice(1)} onSelectImage={setActivePhoto} maxPreview={4} />
                            </div>
                          )}
                          {photos.some((photo) => photo.uploader_role === 'landlord') && (
                            <div className="tenant-repair-card__photos">
                              <strong>Landlord resolution photos</strong>
                              <RepairPhotoThumbnails images={photos.filter((photo) => photo.uploader_role === 'landlord')} onSelectImage={setActivePhoto} maxPreview={4} />
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    <div className="request-card__foot tenant-repair-card__foot">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetailItem(r)}>
                        View details
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm tenant-repair-card__delete"
                        onClick={() => deleteRequest(r)}
                        title={r.status === 'pending' ? 'Cancel and delete request' : 'Delete request'}
                      >
                        {r.status === 'pending' ? 'Cancel request' : 'Delete request'}
                      </button>
                    </div>
                    </article>
                  )
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
                      <div className="tenant-repair-table__request">
                        <strong>{r.title}</strong>
                        <small className="muted">{r.description}</small>
                      </div>
                    ),
                  },
                  { key: 'priority', label: 'Priority', render: (r) => <StatusPill value={r.priority === 'high' ? 'urgent' : r.priority} /> },
                  { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
                  { key: 'updates', label: 'Updates', render: (r) => <span className="muted">{[r.images?.length ? `${r.images.length} photo${r.images.length === 1 ? '' : 's'}` : null, r.admin_notes ? 'Landlord note' : null].filter(Boolean).join(' · ') || '—'}</span> },
                  { key: 'created_at', label: 'Sent', render: (r) => dateFmt(r.created_at) },
                ]}
                actions={(r) => (
                  <div className="tenant-repair-row-actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetailItem(r)}>
                      Details
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm tenant-repair-card__delete"
                      onClick={() => deleteRequest(r)}
                      title={r.status === 'pending' ? 'Cancel and delete request' : 'Delete request'}
                    >
                      {r.status === 'pending' ? 'Cancel request' : 'Delete request'}
                    </button>
                  </div>
                )}
              />
            )}
          </>
        )}
      </State>

      {open && (
        <NewRepairModal
          onClose={() => setOpen(false)}
          onSuccess={(msg) => { flash(msg); reload() }}
        />
      )}

      {detailItem && (
        <RepairDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onSelectPhoto={setActivePhoto}
        />
      )}

      {activePhoto && (
        <PhotoLightbox image={activePhoto} onClose={() => setActivePhoto(null)} />
      )}

      {toast}
    </>
  )
}
