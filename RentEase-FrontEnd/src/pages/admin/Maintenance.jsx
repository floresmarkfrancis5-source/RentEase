import { useRef, useState } from 'react'
import { Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import { AuthImage, PhotoLightbox, RepairPhotoThumbnails, RepairPhotoBadge, compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'


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
      <Modal title={`Update Repair: ${item.title}`} onClose={onClose}>
        <form onSubmit={handleSubmit} onPaste={handlePaste} className="stack" noValidate>
          <div style={{ padding: '12px 14px', background: 'var(--page-raised)', borderRadius: '10px', border: '1px solid var(--page-line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <strong style={{ fontSize: '.9rem' }}>{item.tenant_name} · {item.unit_name}</strong>
              <small className="muted">{dateFmt(item.created_at)}</small>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '.86rem' }}>
              <strong>{item.category && item.category !== 'Other' ? item.category : item.title}</strong> · <StatusPill value={item.priority === 'high' ? 'urgent' : item.priority} />
            </p>
            <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--page-muted)', whiteSpace: 'pre-wrap' }}>
              {item.description}
            </p>
          </div>

          {/* Tenant's reported issue photos */}
          {tenantPhotos.length > 0 && (
            <div className="field">
              <span className="field__label">Tenant's Issue Photos ({tenantPhotos.length})</span>
              <div style={{ marginTop: '4px' }}>
                <RepairPhotoThumbnails images={tenantPhotos} onSelectImage={setActivePhoto} maxPreview={6} />
              </div>
              <span className="field__hint">Click any photo to zoom in full size.</span>
            </div>
          )}

          {/* Existing landlord resolution photos if any */}
          {existingLandlordPhotos.length > 0 && (
            <div className="field">
              <span className="field__label" style={{ color: '#15803d' }}>
                ✓ Previously Attached Resolution Photos ({existingLandlordPhotos.length})
              </span>
              <div style={{ marginTop: '4px' }}>
                <RepairPhotoThumbnails images={existingLandlordPhotos} onSelectImage={setActivePhoto} maxPreview={6} />
              </div>
            </div>
          )}

          <label className="field">
            <span className="field__label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Note to tenant</span>
            <textarea
              rows={3}
              placeholder="e.g. Plumber has replaced the pipe and checked water flow. The repair is fully completed."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
            <span className="field__hint">The tenant will receive an automated email notification with your update and note.</span>
          </label>

          {/* Landlord photo attachment section */}
          <div className="field">
            <span className="field__label">
              Attach resolution / proof of repair photos {status === 'resolved' ? '(Recommended)' : '(Optional)'}
            </span>
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
              <span className="repair-dropzone__icon">🔧📸</span>
              <p className="repair-dropzone__title">
                Attach proof of fixed work: Click, drag & drop, or paste <span className="repair-dropzone__kbd">Ctrl+V</span>
              </p>
              <p className="repair-dropzone__hint">
                Attach photos of the completed repair or invoice for your tenant to see (PNG, JPG, WebP)
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

            {resolutionPhotos.length > 0 && (
              <div className="repair-previews">
                {resolutionPhotos.map((p, idx) => (
                  <div key={idx} className="repair-preview-card" title={p.name} style={{ borderColor: 'rgba(34, 197, 94, 0.7)' }}>
                    <img src={p.data} alt={p.name} />
                    <button
                      type="button"
                      className="repair-preview-card__del"
                      onClick={(e) => { e.stopPropagation(); removeResolutionPhoto(idx) }}
                      title="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {resolutionPhotos.length > 0 && (
              <span className="field__hint" style={{ marginTop: '6px', display: 'block', color: '#15803d' }}>
                ✓ {resolutionPhotos.length} resolution photo{resolutionPhotos.length > 1 ? 's' : ''} will be attached upon saving.
              </span>
            )}
          </div>

          {error && <p className="alert alert--error" role="alert">{error}</p>}

          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn--accent" disabled={busy}>
              {busy ? 'Saving…' : 'Save & Notify Tenant'}
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
  const [sortBy, setSortBy] = useState('newest')
  const [toast, flash] = useToast()

  const rawData = data || []

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
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.tenant_name && r.tenant_name.toLowerCase().includes(q)) ||
        (r.unit_name && r.unit_name.toLowerCase().includes(q))
      if (!match) return false
    }
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === 'priority') {
      const weight = { high: 3, medium: 2, low: 1 }
      return (weight[b.priority] || 0) - (weight[a.priority] || 0)
    }
    if (sortBy === 'unit-asc') return (a.unit_name || '').localeCompare(b.unit_name || '')
    if (sortBy === 'tenant-asc') return (a.tenant_name || '').localeCompare(b.tenant_name || '')
    return 0
  })

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Maintenance requests"
        sub="Repair requests from your tenants. When resolving an issue, you can attach photos of the completed work."
      />

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
                { value: 'newest', label: 'Sort: Newest first' },
                { value: 'oldest', label: 'Sort: Oldest first' },
                { value: 'priority', label: 'Sort: Priority (Urgent first)' },
                { value: 'unit-asc', label: 'Sort: Unit (A-Z)' },
                { value: 'tenant-asc', label: 'Sort: Tenant (A-Z)' },
              ]}
              filter={statusFilter}
              onFilterChange={setStatusFilter}
              filterOptions={[
                { value: 'all', label: 'All Statuses' },
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
                {filteredData.map((r) => (
                  <div key={r.id} className="request-card">
                    <div className="request-card__head">
                      <div>
                        <h4 className="request-card__title">{r.title}</h4>
                        <span className="request-card__sub">
                          👤 {r.tenant_name} · <strong>{r.unit_name}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <StatusPill value={r.priority === 'high' ? 'urgent' : r.priority} />
                        <StatusPill value={r.status} />
                      </div>
                    </div>

                    <div className="request-card__body">
                      {r.description}
                    </div>

                    {r.images && r.images.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'var(--page-line)', borderRadius: '8px' }}>
                        <small className="muted" style={{ display: 'block', marginBottom: 6 }}>
                          Attached photos ({r.images.length}):
                        </small>
                        <RepairPhotoThumbnails images={r.images} onSelectImage={setActivePhoto} maxPreview={4} />
                      </div>
                    )}

                    {r.admin_notes && (
                      <div style={{ fontSize: '.84rem', color: 'var(--page-muted)', fontStyle: 'italic', background: 'var(--page-raised)', padding: '8px 10px', borderRadius: '6px' }}>
                        Note: {r.admin_notes}
                      </div>
                    )}

                    <div className="request-card__foot">
                      <small className="muted">Sent {dateFmt(r.created_at)}</small>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>
                          Update
                        </button>
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ color: '#ef4444' }}
                          onClick={() => deleteRequest(r)}
                          title="Delete request"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
                  { key: 'created_at', label: 'Sent', render: (r) => dateFmt(r.created_at) },
                ]}
                actions={(r) => (
                  <>
                    <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>
                      Update
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ color: '#ef4444' }}
                      onClick={() => deleteRequest(r)}
                      title="Delete request"
                    >
                      Delete
                    </button>
                  </>
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
