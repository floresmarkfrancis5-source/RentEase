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
  const eligibilityLoading = loading || summary.loading || units.loading
  const requestCounts = useMemo(() => (data || []).reduce((counts, request) => {
    counts.all += 1
    if (request.status === 'pending') counts.pending += 1
    if (request.status === 'approved') counts.approved += 1
    if (request.status === 'rejected') counts.rejected += 1
    return counts
  }, { all: 0, pending: 0, approved: 0, rejected: 0 }), [data])

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
          (r.reason && r.reason.toLowerCase().includes(q)) ||
          (r.admin_note && r.admin_note.toLowerCase().includes(q))
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
        sub="Explore available homes, compare details, and track your transfer request in one place."
      >
        <button
          className="btn btn--accent"
          onClick={() => {
            setSelectedUnitForTransfer(availableList[0] || null)
            setOpen(true)
          }}
          disabled={eligibilityLoading || pending || requestedThisMonth || !availableList.length || !currentLease}
          title={requestedThisMonth ? `You already submitted a transfer request this month. You can request again on ${nextMonthReset}.` : pending ? 'You already have a pending request' : ''}
        >
          + Request unit transfer
        </button>
      </PageHead>

      {/* Current lease and eligibility */}
      {summary.error && <p className="alert alert--error" role="alert">Your current lease could not be loaded: {summary.error}</p>}
      {summary.data || summary.loading ? (
        <section className="tenant-transfer-lease" aria-label="Current lease and transfer eligibility">
          <div className="tenant-transfer-lease__current">
            <span className="tenant-transfer-lease__eyebrow">Your current home</span>
            {summary.loading ? (
              <>
                <h2>Checking your lease…</h2>
                <p>Please wait while we confirm your current unit.</p>
              </>
            ) : currentLease ? (
              <>
                <h2>{currentLease.unit_name}</h2>
                <p>{currentLease.property_name}</p>
                <strong>{money(currentLease.monthly_rent)} <small>/ month</small></strong>
              </>
            ) : (
              <>
                <h2>No active lease</h2>
                <p>You need an active lease before you can request a transfer.</p>
              </>
            )}
          </div>
          <div className={`tenant-transfer-eligibility${eligibilityLoading || pending || requestedThisMonth || !currentLease ? ' is-limited' : ' is-ready'}`} role="status">
            <strong>{eligibilityLoading ? 'Checking transfer eligibility' : pending ? 'Request under review' : requestedThisMonth ? 'Monthly request limit reached' : !currentLease ? 'Transfer unavailable' : 'Ready to explore'}</strong>
            <span>
              {eligibilityLoading
                ? 'We are checking your lease and recent requests before enabling transfer actions.'
                : pending
                ? 'You already have a pending request. Wait for your landlord’s decision or cancel it from your request history.'
                : requestedThisMonth
                  ? `You have used this month’s request. You can submit another starting ${nextMonthReset}.`
                  : !currentLease
                    ? 'Contact your landlord if you need help with your current housing.'
                    : 'You can submit one transfer request this month. Your landlord will review it.'}
            </span>
          </div>
        </section>
      ) : null}

      {/* SECTION 1: AVAILABLE UNITS TO TRANSFER TO */}
      <section className="tenant-transfer-section" aria-labelledby="tenant-transfer-available-title">
        <div className="tenant-transfer-section__head">
          <div>
            <h2 id="tenant-transfer-available-title">
              Available units
            </h2>
            <p>
              Compare rent, capacity, and photos. Select a unit to review its full details before requesting a transfer.
            </p>
          </div>
          <span className="tenant-transfer-section__count">{availableList.length} available</span>
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

        {units.loading ? (
          <div className="tenant-transfer-empty" role="status"><strong>Loading available units…</strong><p>Please wait while we check which units are ready for transfer.</p></div>
        ) : units.error ? (
          <p className="alert alert--error" role="alert">Available units could not be loaded: {units.error}</p>
        ) : availableList.length === 0 ? (
          <div className="tenant-transfer-empty">
            <strong>No units available right now</strong>
            <p>Your landlord has no vacant units ready for transfer at the moment. Please check again later.</p>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="tenant-transfer-empty">
            <strong>No units match your search</strong>
            <p>Try a different unit name, property, or filter.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setSearch(''); setPropertyFilter('all') }}>Clear filters</button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="tenant-transfer-property-groups">
            {groupedByProperty.map((group, idx) => (
              <section key={idx} className="property-group unit-property-group" aria-label={`${group.name} available units`}>
                <div className="property-group__head">
                  <div>
                    <h3 className="property-group__title">{group.name}</h3>
                    {group.address && <p className="property-group__address">{group.address}</p>}
                  </div>
                  <span className="property-group__count">{group.units.length} {group.units.length === 1 ? 'unit' : 'units'}</span>
                </div>

                <div className="cards-grid">
                  {group.units.map((u) => {
                    const isCurrent = currentLease && String(currentLease.unit_id) === String(u.id)
                    const openDetails = () => setInspectUnit(u)
                    return (
                      <article key={u.id} className="unit-card tenant-transfer-unit-card">
                        <button type="button" className="unit-card__image-button" onClick={openDetails} aria-label={`View details for ${u.unit_name}`}>
                          <div className="unit-card__img-wrap">
                            {u.image_url ? (
                              <img src={u.image_url} alt={`${u.unit_name} unit`} className="unit-card__img" />
                            ) : (
                              <div className="unit-card__placeholder" role="img" aria-label="No photo uploaded for this unit">
                                <svg viewBox="0 0 96 76" aria-hidden="true"><path d="M17 66V21h26v45M43 32h36v34M10 66h76M26 31h8m-8 9h8m-8 9h8m-8 9h8m19-17h8m-8 10h8m-8 10h8m9-20h8m-8 10h8m-8 10h8" /></svg>
                                <span>No photo</span>
                              </div>
                            )}
                            <span className="unit-card__badge-top-left unit-card__badge-top-left--vacant"><span className="tag">Available</span></span>
                            <span className="unit-card__badge-top-right"><span className="tenant-transfer-capacity">{u.capacity || 1} {Number(u.capacity || 1) === 1 ? 'person' : 'people'}</span></span>
                            <span className="unit-card__view-hint" aria-hidden="true">View unit details</span>
                          </div>
                        </button>
                        <div className="unit-card__body tenant-transfer-unit-card__body">
                          <div className="unit-card__title-row">
                            <h3 className="unit-card__title">{u.unit_name}</h3>
                            <span className="tag tag--ghost tenant-transfer-condition">{(u.condition_tag || 'Good').replace(/_/g, ' ')}</span>
                          </div>
                          <p className="unit-card__property">{u.property_name}</p>
                          <div className="tenant-transfer-unit-card__facts">
                            <div><span>Monthly rent</span><strong>{money(u.monthly_rent)}<small> / mo</small></strong></div>
                            <div><span>Capacity</span><strong>{u.capacity || 1} {Number(u.capacity || 1) === 1 ? 'person' : 'people'}</strong></div>
                          </div>
                          {u.notes && <p className="tenant-transfer-unit-card__notes" title={u.notes}>{u.notes}</p>}
                        </div>
                        <div className="unit-card__foot tenant-transfer-unit-card__foot">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={openDetails}>View details</button>
                          <button
                            type="button"
                            className="btn btn--accent btn--sm"
                            disabled={eligibilityLoading || pending || requestedThisMonth || isCurrent || !currentLease}
                            title={requestedThisMonth ? `Monthly request limit reached. Try again ${nextMonthReset}.` : pending ? 'You already have a pending request.' : isCurrent ? 'This is your current unit.' : undefined}
                            onClick={() => handleStartTransfer(u)}
                          >
                            Request transfer
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Table
            rows={filteredUnits}
            columns={[
              { key: 'photo', label: 'Photo', render: (r) => r.image_url
                ? <button type="button" className="tenant-transfer-table-photo" onClick={() => setInspectUnit(r)} aria-label={`View ${r.unit_name} photo`}><img src={r.image_url} alt="" /></button>
                : <button type="button" className="tenant-transfer-table-photo tenant-transfer-table-photo--empty" onClick={() => setInspectUnit(r)} aria-label={`View ${r.unit_name} details`}><svg viewBox="0 0 96 76" aria-hidden="true"><path d="M17 66V21h26v45M43 32h36v34M10 66h76M26 31h8m-8 9h8m-8 9h8m-8 9h8m19-17h8m-8 10h8m-8 10h8m9-20h8m-8 10h8m-8 10h8" /></svg></button> },
              { key: 'unit_name', label: 'Unit', render: (r) => <div className="tenant-transfer-table-unit"><strong>{r.unit_name}</strong><span>{r.property_name}</span></div> },
              { key: 'monthly_rent', label: 'Rent', align: 'right', render: (r) => <strong>{money(r.monthly_rent)}</strong> },
              { key: 'capacity', label: 'Capacity', render: (r) => `${r.capacity || 1} ${Number(r.capacity || 1) === 1 ? 'person' : 'people'}` },
              { key: 'condition_tag', label: 'Condition', render: (r) => <StatusPill value={r.condition_tag} /> },
            ]}
            actions={(r) => {
              const isCurrent = currentLease && String(currentLease.unit_id) === String(r.id)
              return (
                <div className="tenant-transfer-row-actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInspectUnit(r)}>Details</button>
                  <button type="button" className="btn btn--accent btn--sm" disabled={eligibilityLoading || pending || requestedThisMonth || isCurrent || !currentLease} onClick={() => handleStartTransfer(r)}>Request</button>
                </div>
              )
            }}
          />
        )}
      </section>

      {/* SECTION 2: MY TRANSFER REQUESTS HISTORY */}
      <section className="tenant-transfer-history" aria-labelledby="tenant-transfer-history-title">
        <div className="tenant-transfer-section__head">
          <div>
            <h2 id="tenant-transfer-history-title">My transfer requests</h2>
            <p>Follow your request status and review notes from your landlord.</p>
          </div>
        </div>

        <State loading={loading} error={error} empty={data?.length === 0 && 'You have not submitted any transfer requests yet.'}>
          {data && data.length > 0 && (
            <>
              <section className="tenant-transfer-summary" aria-label="Transfer request status summary">
                {[
                  ['all', 'All requests', requestCounts.all],
                  ['pending', 'Pending', requestCounts.pending],
                  ['approved', 'Approved', requestCounts.approved],
                  ['rejected', 'Declined', requestCounts.rejected],
                ].map(([filter, label, count]) => (
                  <button type="button" key={filter}
                    className={`tenant-transfer-summary__item${reqStatusFilter === filter ? ' is-active' : ''}${filter === 'pending' ? ' is-pending' : filter === 'approved' ? ' is-approved' : filter === 'rejected' ? ' is-rejected' : ''}`}
                    onClick={() => setReqStatusFilter(filter)} aria-pressed={reqStatusFilter === filter}>
                    <span>{label}</span><strong>{count}</strong>
                  </button>
                ))}
              </section>

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
                <div className="tenant-transfer-empty tenant-transfer-empty--compact">
                  <strong>No requests match your filters</strong>
                  <p>Try a different status or clear your search.</p>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setReqSearch(''); setReqStatusFilter('all') }}>Clear filters</button>
                </div>
              ) : reqViewMode === 'grid' ? (
                <div className="cards-grid tenant-transfer-request-grid">
                  {filteredRequests.map((r) => (
                    <article key={r.id} className={`request-card tenant-transfer-request${r.status === 'pending' ? ' is-pending' : r.status === 'approved' ? ' is-approved' : ''}`}>
                      <div className="tenant-transfer-request__head">
                        <div><span className="tenant-transfer-request__eyebrow">Transfer request</span><span className="request-card__sub">Submitted {dateFmt(r.created_at)}</span></div>
                        <StatusPill value={r.status} />
                      </div>
                      <div className="tenant-transfer-route">
                        <div><span>Moving from</span><strong>{r.current_unit_name}</strong><small>{r.current_property_name}</small></div>
                        <span className="tenant-transfer-route__arrow" aria-hidden="true">→</span>
                        <div className="tenant-transfer-route__destination"><span>Requesting</span><strong>{r.requested_unit_name}</strong><small>{r.requested_property_name}</small></div>
                      </div>
                      {r.reason && <details className="tenant-transfer-request__reason"><summary>Your reason</summary><p>{r.reason}</p></details>}
                      {r.admin_note && <div className="tenant-transfer-request__note"><strong>Landlord update</strong><p>{r.admin_note}</p></div>}
                      <div className="request-card__foot tenant-transfer-request__foot">
                        <span>Request #{r.id}</span>
                        <button type="button" className="btn btn--ghost btn--sm tenant-transfer-request__delete" onClick={() => deleteRequest(r)} title={r.status === 'pending' ? 'Cancel this pending request' : 'Delete this request record'}>
                          {r.status === 'pending' ? 'Cancel request' : 'Delete request'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Table
                  rows={filteredRequests}
                  columns={[
                    { key: 'current_unit_name', label: 'Current unit', render: (r) => <div className="tenant-transfer-table-unit"><strong>{r.current_unit_name}</strong><span>{r.current_property_name}</span></div> },
                    { key: 'requested_unit_name', label: 'Requested unit', render: (r) => <div className="tenant-transfer-table-unit"><strong>{r.requested_unit_name}</strong><span>{r.requested_property_name}</span></div> },
                    { key: 'reason', label: 'Reason', render: (r) => r.reason || <span className="muted">—</span> },
                    { key: 'created_at', label: 'Requested', render: (r) => dateFmt(r.created_at) },
                    { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
                    { key: 'admin_note', label: 'Landlord update', render: (r) => r.admin_note || <span className="muted">—</span> },
                  ]}
                  actions={(r) => <button type="button" className="btn btn--ghost btn--sm tenant-transfer-request__delete" onClick={() => deleteRequest(r)}>{r.status === 'pending' ? 'Cancel request' : 'Delete request'}</button>}
                />
              )}
            </>
          )}
        </State>
      </section>

      {/* UNIT DETAILS WINDOW MODAL */}
      {inspectUnit && (
        <UnitDetailModal
          unit={inspectUnit}
          currentLease={currentLease}
          onClose={() => setInspectUnit(null)}
          actionLabel="Transfer to this unit"
          actionIcon={<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3" /></svg>}
          actionDisabled={eligibilityLoading || pending || requestedThisMonth || !currentLease || (currentLease && String(currentLease.unit_id) === String(inspectUnit.id))}
          actionHint={
            eligibilityLoading
              ? 'Checking your lease and recent requests. Please wait.'
              : pending
              ? 'You already have a pending transfer request. Cancel it below to select this unit.'
              : requestedThisMonth
              ? `You have used this month’s transfer request. You can request again on ${nextMonthReset}.`
              : !currentLease
              ? 'You need an active lease to transfer units.'
              : String(currentLease.unit_id) === String(inspectUnit.id)
              ? 'This is your current unit.'
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
