import { useMemo, useState } from 'react'
import { Field, Modal, PageHead, State, StatusPill, Table, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, money } from '../../lib/api'
import ViewToolbar from '../../components/ViewToolbar'
import UnitDetailModal from '../../components/UnitDetailModal'

export default function Transfers() {
  const { data, error, loading, reload } = useLoad('/api/my/transfer-requests')
  const units = useLoad('/api/my/available-units')
  const summary = useLoad('/api/my/summary')
  const [open, setOpen] = useState(false)
  const [selectedUnitForTransfer, setSelectedUnitForTransfer] = useState(null)
  const [inspectUnit, setInspectUnit] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [sortBy, setSortBy] = useState('price-asc') // 'price-asc' | 'price-desc' | 'name-asc' | 'capacity-desc'
  const [toast, flash] = useToast()

  const pending = data?.some((r) => r.status === 'pending')
  const availableList = units.data || []
  const currentLease = summary.data?.lease || null

  // Monthly limit: check if any request was submitted this calendar month
  const now = new Date()
  const requestedThisMonth = data?.some((r) => {
    const d = new Date(String(r.created_at).replace(' ', 'T'))
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  // Next month reset date
  const nextMonthReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })

  const send = async (values) => {
    const r = await api('/api/my/transfer-requests', { method: 'POST', auth: true, body: values })
    flash(r.message)
    reload()
  }

  const deleteRequest = async (r) => {
    if (!window.confirm('Are you sure you want to cancel and delete this transfer request?')) return
    try {
      const res = await api(`/api/my/transfer-requests/${r.id}`, { method: 'DELETE', auth: true })
      flash(res.message || 'Transfer request cancelled.')
      reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  // Filter & sort available units
  const filteredUnits = useMemo(() => {
    let result = [...availableList]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (u) =>
          u.unit_name.toLowerCase().includes(q) ||
          u.property_name.toLowerCase().includes(q) ||
          (u.notes && u.notes.toLowerCase().includes(q)) ||
          (u.property_address && u.property_address.toLowerCase().includes(q))
      )
    }

    if (propertyFilter !== 'all') {
      result = result.filter((u) => String(u.property_id) === propertyFilter)
    }

    result.sort((a, b) => {
      if (sortBy === 'price-asc') return Number(a.monthly_rent) - Number(b.monthly_rent)
      if (sortBy === 'price-desc') return Number(b.monthly_rent) - Number(a.monthly_rent)
      if (sortBy === 'name-asc') return a.unit_name.localeCompare(b.unit_name)
      if (sortBy === 'capacity-desc') return Number(b.capacity || 1) - Number(a.capacity || 1)
      return 0
    })

    return result
  }, [availableList, search, propertyFilter, sortBy])

  const [reqViewMode, setReqViewMode] = useState('grid') // 'grid' | 'list'
  const [reqSearch, setReqSearch] = useState('')
  const [reqStatusFilter, setReqStatusFilter] = useState('all')
  const [reqSort, setReqSort] = useState('newest')

  // Group filtered units by property (preserves sort order in Icons/Grid view)
  const groupedByProperty = useMemo(() => {
    const map = new Map()
    for (const u of filteredUnits) {
      const propKey = String(u.property_id || u.property_name)
      if (!map.has(propKey)) {
        map.set(propKey, {
          name: u.property_name,
          address: [u.property_address, u.property_barangay, u.property_city].filter(Boolean).join(', '),
          units: [],
        })
      }
      map.get(propKey).units.push(u)
    }
    return Array.from(map.values())
  }, [filteredUnits])

  // Filter & sort my transfer requests
  const filteredRequests = useMemo(() => {
    let result = [...(data || [])]

    if (reqSearch.trim()) {
      const q = reqSearch.toLowerCase()
      result = result.filter(
        (r) =>
          (r.current_unit_name && r.current_unit_name.toLowerCase().includes(q)) ||
          (r.current_property_name && r.current_property_name.toLowerCase().includes(q)) ||
          (r.requested_unit_name && r.requested_unit_name.toLowerCase().includes(q)) ||
          (r.requested_property_name && r.requested_property_name.toLowerCase().includes(q)) ||
          (r.reason && r.reason.toLowerCase().includes(q))
      )
    }

    if (reqStatusFilter !== 'all') {
      result = result.filter((r) => r.status === reqStatusFilter)
    }

    result.sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      if (reqSort === 'newest') return tb - ta
      if (reqSort === 'oldest') return ta - tb
      if (reqSort === 'unit-asc') return (a.requested_unit_name || '').localeCompare(b.requested_unit_name || '')
      if (reqSort === 'status') return (a.status || '').localeCompare(b.status || '')
      return 0
    })

    return result
  }, [data, reqSearch, reqStatusFilter, reqSort])

  // Property filter options
  const propertyFilterOptions = useMemo(() => {
    const map = new Map()
    map.set('all', 'All Properties')
    for (const u of availableList) {
      if (!map.has(String(u.property_id))) {
        map.set(String(u.property_id), u.property_name)
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [availableList])

  const handleStartTransfer = (unit) => {
    setSelectedUnitForTransfer(unit)
    setOpen(true)
  }

  return (
    <>
      <PageHead
        eyebrow="My rent"
        title="Unit transfers"
        sub="Browse available units across properties. Click any unit to see its photos, details, and request a transfer."
      >
        <button
          className="btn btn--accent"
          onClick={() => {
            setSelectedUnitForTransfer(availableList[0] || null)
            setOpen(true)
          }}
          disabled={pending || requestedThisMonth || !availableList.length || !currentLease}
          title={requestedThisMonth ? `You already submitted a transfer request this month. You can request again on ${nextMonthReset}.` : pending ? 'You already have a pending request' : ''}
        >
          + Request unit transfer
        </button>
      </PageHead>

      {/* Current Lease Status Banner */}
      {summary.data && (
        <div style={{ padding: '14px 18px', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ fontSize: '.76rem', color: 'var(--page-muted)', textTransform: 'uppercase', letterSpacing: '.6px', display: 'block', fontWeight: 600 }}>
              Your Current Lease
            </span>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 2 }}>
              {currentLease ? (
                <>
                  {currentLease.unit_name} · <span className="muted" style={{ fontWeight: 500 }}>{currentLease.property_name}</span> ({money(currentLease.monthly_rent)}/mo)
                </>
              ) : (
                <span className="muted">No active lease found. You need an active lease to request a transfer.</span>
              )}
            </div>
          </div>
          {pending && (
            <span className="tag tag--warn" style={{ fontSize: '.84rem', padding: '6px 12px' }}>
              ⏳ You have a pending transfer request awaiting landlord review.
            </span>
          )}
          {!pending && requestedThisMonth && (
            <span className="tag tag--warn" style={{ fontSize: '.84rem', padding: '6px 12px' }}>
              📅 1 request per month limit. Next request allowed on {nextMonthReset}.
            </span>
          )}
        </div>
      )}

      {/* SECTION 1: AVAILABLE UNITS TO TRANSFER TO */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: '1.28rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--page-text)' }}>
              Available Units for Transfer
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>
              Vacant units in good condition ready for immediate transfer. Click any unit for full photos and details.
            </p>
          </div>
        </div>

        {/* Customizable View Toolbar (Icons vs List, Search & Sort) */}
        <ViewToolbar
          view={viewMode}
          onViewChange={setViewMode}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search unit, property or address…"
          sort={sortBy}
          onSortChange={setSortBy}
          sortOptions={[
            { value: 'price-asc', label: 'Sort: Rent (Low to High)' },
            { value: 'price-desc', label: 'Sort: Rent (High to Low)' },
            { value: 'name-asc', label: 'Sort: Unit Name (A-Z)' },
            { value: 'capacity-desc', label: 'Sort: Capacity (Largest)' },
          ]}
          filter={propertyFilter}
          onFilterChange={setPropertyFilter}
          filterOptions={propertyFilterOptions}
        />

        {availableList.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}>🏢</span>
            <strong style={{ fontSize: '1.05rem', display: 'block', marginBottom: 4 }}>No Vacant Units Available</strong>
            <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>
              All units are currently occupied or undergoing maintenance. Please check back later.
            </p>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)' }}>
            <p className="muted" style={{ margin: 0 }}>No units match your search or filter criteria.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* ICONS / GRID VIEW: Grouped & separated by properties */
          <div>
            {groupedByProperty.map((group, idx) => (
              <div key={idx} className="property-group">
                <div className="property-group__head">
                  <div>
                    <h3 className="property-group__title">
                      <span>📍</span> {group.name}
                    </h3>
                    {group.address && <span className="property-group__address">{group.address}</span>}
                  </div>
                  <span className="property-group__count">
                    {group.units.length} unit{group.units.length > 1 ? 's' : ''} available
                  </span>
                </div>

                <div className="cards-grid">
                  {group.units.map((u) => {
                    const isCurrent = currentLease && String(currentLease.unit_id) === String(u.id)
                    return (
                      <div
                        key={u.id}
                        className="unit-card"
                        onClick={() => setInspectUnit(u)}
                        title="Click to view unit details"
                      >
                        <div className="unit-card__img-wrap">
                          {u.image_url ? (
                            <img src={u.image_url} alt={u.unit_name} className="unit-card__img" />
                          ) : (
                            <div className="unit-card__placeholder">
                              <span className="unit-card__placeholder-icon">🏠</span>
                              <span>Available Unit</span>
                            </div>
                          )}
                          <div className="unit-card__badge-top-left">
                            <span className="tag tag--ok" style={{ fontSize: '.74rem', padding: '3px 8px', backdropFilter: 'blur(4px)' }}>
                              ✓ Vacant
                            </span>
                          </div>
                          {u.capacity && (
                            <div className="unit-card__badge-top-right">
                              <span style={{ fontSize: '.74rem', padding: '3px 8px', background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: '6px', backdropFilter: 'blur(4px)' }}>
                                👥 {u.capacity} {u.capacity > 1 ? 'pax' : 'pax'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="unit-card__body">
                          <div className="unit-card__title-row">
                            <h4 className="unit-card__title">{u.unit_name}</h4>
                            <span className="tag tag--ghost" style={{ fontSize: '.72rem' }}>
                              {(u.condition_tag || 'Good').replace('_', ' ')}
                            </span>
                          </div>
                          <div className="unit-card__property">
                            📍 {u.property_name}
                          </div>

                          <div className="unit-card__price-row">
                            <span className="unit-card__price">{money(u.monthly_rent)}</span>
                            <span className="unit-card__period">/ month</span>
                          </div>

                          <div className="unit-card__specs">
                            <span className="unit-card__spec-pill">
                              👥 {u.capacity || 1} occupant{Number(u.capacity) > 1 ? 's' : ''}
                            </span>
                            {u.notes && (
                              <span className="unit-card__spec-pill" title={u.notes} style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                📝 {u.notes}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="unit-card__foot">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            style={{ flex: 1 }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setInspectUnit(u)
                            }}
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            className="btn btn--accent btn--sm"
                            style={{ flex: 1 }}
                            disabled={pending || isCurrent || !currentLease}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartTransfer(u)
                            }}
                          >
                            Transfer here
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* LIST / TABLE VIEW */
          <Table
            rows={filteredUnits}
            columns={[
              {
                key: 'photo',
                label: 'Photo',
                render: (r) =>
                  r.image_url ? (
                    <img
                      src={r.image_url}
                      alt={r.unit_name}
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--page-line)', display: 'block', cursor: 'pointer' }}
                      onClick={() => setInspectUnit(r)}
                    />
                  ) : (
                    <div
                      style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--page-raised)', border: '1px solid var(--page-line)', display: 'grid', placeItems: 'center', fontSize: '1.2rem', cursor: 'pointer' }}
                      onClick={() => setInspectUnit(r)}
                    >
                      🏠
                    </div>
                  ),
              },
              {
                key: 'unit_name',
                label: 'Unit',
                render: (r) => (
                  <div>
                    <strong style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setInspectUnit(r)}>
                      {r.unit_name}
                    </strong>
                    <br />
                    <small className="muted">{r.property_name}</small>
                  </div>
                ),
              },
              {
                key: 'monthly_rent',
                label: 'Rent',
                align: 'right',
                render: (r) => <strong>{money(r.monthly_rent)}</strong>,
              },
              {
                key: 'capacity',
                label: 'Capacity',
                render: (r) => `${r.capacity || 1} person${Number(r.capacity) > 1 ? 's' : ''}`,
              },
              {
                key: 'condition_tag',
                label: 'Condition',
                render: (r) => <StatusPill value={r.condition_tag} />,
              },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setInspectUnit(r)}>
                  Details
                </button>
                <button
                  className="btn btn--accent btn--sm"
                  disabled={pending || !currentLease}
                  onClick={() => handleStartTransfer(r)}
                >
                  Transfer
                </button>
              </>
            )}
          />
        )}
      </div>

      {/* SECTION 2: MY TRANSFER REQUESTS HISTORY */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--page-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--page-text)' }}>
              My Transfer Requests
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>
              History of your transfer requests and their current review status. You can cancel pending requests at any time.
            </p>
          </div>
        </div>

        <State loading={loading} error={error} empty={data?.length === 0 && 'You have not submitted any transfer requests yet.'}>
          {data && data.length > 0 && (
            <>
              <ViewToolbar
                view={reqViewMode}
                onViewChange={setReqViewMode}
                search={reqSearch}
                onSearchChange={setReqSearch}
                searchPlaceholder="Search my requests…"
                sort={reqSort}
                onSortChange={setReqSort}
                sortOptions={[
                  { value: 'newest', label: 'Sort: Newest first' },
                  { value: 'oldest', label: 'Sort: Oldest first' },
                  { value: 'unit-asc', label: 'Sort: Unit (A-Z)' },
                  { value: 'status', label: 'Sort: Status' },
                ]}
                filter={reqStatusFilter}
                onFilterChange={setReqStatusFilter}
                filterOptions={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />

              {filteredRequests.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center', background: 'var(--page-raised)', borderRadius: '12px', border: '1px solid var(--page-line)' }}>
                  <p className="muted" style={{ margin: 0 }}>No transfer requests match your filter.</p>
                </div>
              ) : reqViewMode === 'grid' ? (
                <div className="cards-grid">
                  {filteredRequests.map((r) => (
                    <div key={r.id} className="request-card">
                      <div className="request-card__head">
                        <div>
                          <h4 className="request-card__title">{r.requested_unit_name}</h4>
                          <span className="request-card__sub">Requested on {dateFmt(r.created_at)}</span>
                        </div>
                        <StatusPill value={r.status} />
                      </div>

                      <div style={{ padding: '10px 12px', background: 'var(--page-line)', borderRadius: '8px', fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div>
                          <small className="muted" style={{ display: 'block' }}>From</small>
                          <strong>{r.current_unit_name}</strong> ({r.current_property_name})
                        </div>
                        <span style={{ fontSize: '1.2rem', color: 'var(--accent)', margin: '0 4px' }}>➔</span>
                        <div>
                          <small className="muted" style={{ display: 'block' }}>To</small>
                          <strong style={{ color: 'var(--accent)' }}>{r.requested_unit_name}</strong> ({r.requested_property_name})
                        </div>
                      </div>

                      {r.reason && (
                        <div className="request-card__body">
                          <small className="muted" style={{ display: 'block', marginBottom: 2 }}>Reason:</small>
                          "{r.reason}"
                        </div>
                      )}

                      {r.admin_note && (
                        <div style={{ padding: '8px 10px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderRadius: '6px', fontSize: '.84rem' }}>
                          <strong>Landlord note:</strong> {r.admin_note}
                        </div>
                      )}

                      <div className="request-card__foot">
                        <span className="muted" style={{ fontSize: '.78rem' }}>ID #{r.id}</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          style={{ color: '#ef4444' }}
                          onClick={() => deleteRequest(r)}
                          title="Cancel & delete request"
                        >
                          🗑️ {r.status === 'pending' ? 'Cancel request' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Table
                  rows={filteredRequests}
                  columns={[
                    {
                      key: 'current_unit_name',
                      label: 'Current unit',
                      render: (r) => `${r.current_unit_name} · ${r.current_property_name}`,
                    },
                    {
                      key: 'requested_unit_name',
                      label: 'Requested unit',
                      render: (r) => (
                        <strong>
                          {r.requested_unit_name} · <span className="muted" style={{ fontWeight: 400 }}>{r.requested_property_name}</span>
                        </strong>
                      ),
                    },
                    { key: 'reason', label: 'Reason', render: (r) => r.reason || <span className="muted">—</span> },
                    { key: 'created_at', label: 'Requested', render: (r) => dateFmt(r.created_at) },
                    { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
                    {
                      key: 'admin_note',
                      label: 'Landlord note',
                      render: (r) => r.admin_note ? <span>{r.admin_note}</span> : <span className="muted">—</span>,
                    },
                  ]}
                  actions={(r) => (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ color: '#ef4444' }}
                      onClick={() => deleteRequest(r)}
                      title="Cancel & delete request"
                    >
                      🗑️ {r.status === 'pending' ? 'Cancel' : 'Delete'}
                    </button>
                  )}
                />
              )}
            </>
          )}
        </State>
      </div>

      {/* UNIT DETAILS WINDOW MODAL */}
      {inspectUnit && (
        <UnitDetailModal
          unit={inspectUnit}
          currentLease={currentLease}
          onClose={() => setInspectUnit(null)}
          actionLabel="🚀 Transfer to this unit"
          actionDisabled={pending || !currentLease}
          actionHint={
            pending
              ? 'You already have a pending transfer request. Cancel it below to select this unit.'
              : !currentLease
              ? 'You need an active lease to transfer units.'
              : ''
          }
          onAction={(u) => handleStartTransfer(u)}
        />
      )}

      {/* TRANSFER SUBMISSION MODAL */}
      {open && (
        <TransferModal
          units={availableList}
          defaultUnitId={selectedUnitForTransfer?.id}
          onSubmit={send}
          onClose={() => {
            setOpen(false)
            setSelectedUnitForTransfer(null)
          }}
        />
      )}

      {toast}
    </>
  )
}

function TransferModal({ units, defaultUnitId, onSubmit, onClose }) {
  const [unitId, setUnitId] = useState(defaultUnitId || units[0]?.id || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selectedUnit = units.find((u) => String(u.id) === String(unitId))

  async function submit(e) {
    e.preventDefault()
    if (!unitId) {
      setError('Please choose a unit.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit({ requested_unit_id: unitId, reason })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Request Unit Transfer" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Choose an available unit to move to">
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_name} · {u.property_name} · {money(u.monthly_rent)}/month (Capacity: {u.capacity || 1})
              </option>
            ))}
          </select>
        </Field>

        {selectedUnit?.image_url && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--page-line)', maxHeight: 180, display: 'flex', justifyContent: 'center', background: 'var(--page-raised)' }}>
            <img src={selectedUnit.image_url} alt={selectedUnit.unit_name} style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
          </div>
        )}

        {selectedUnit && (
          <div style={{ padding: '12px 14px', background: 'var(--page-raised)', borderRadius: '10px', border: '1px solid var(--page-line)', fontSize: '.86rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong>{selectedUnit.unit_name} ({selectedUnit.property_name})</strong>
              <strong style={{ color: 'var(--accent)' }}>{money(selectedUnit.monthly_rent)}/mo</strong>
            </div>
            <div className="muted">
              Capacity: {selectedUnit.capacity || 1} occupants · Condition: {(selectedUnit.condition_tag || 'Good').replace('_', ' ')}
            </div>
            {selectedUnit.notes && (
              <div style={{ marginTop: 6, color: 'var(--page-text)' }}>
                {selectedUnit.notes}
              </div>
            )}
          </div>
        )}

        <Field label="Reason for transfer (optional)">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Need more space, closer to work/school, or preferred floor level..."
          />
        </Field>

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy}>
            {busy ? 'Sending request…' : 'Submit Transfer Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
