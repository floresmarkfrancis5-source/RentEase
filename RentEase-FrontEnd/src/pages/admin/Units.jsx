import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Field, Modal, PageHead, State, StatusPill, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, dateFmt, money } from '../../lib/api'
import { compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'
import UnitDetailModal from '../../components/UnitDetailModal'
import ContractTemplateEditor from '../../components/ContractTemplateEditor'
import { parseLeaseTemplate } from '../../lib/leaseContract'
import { useLanguage } from '../../context/LanguageContext'

const unitOccupancy = (unit) => unit.lease_status === 'offered' ? 'offered'
  : unit.lease_status === 'scheduled' ? 'scheduled' : unit.occupancy_status

export default function Units() {
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()
  const { data, error, loading, reload } = useLoad('/api/admin/units')
  const archived = useLoad('/api/admin/units?archived=1')
  const props = useLoad('/api/admin/properties')
  const [edit, setEdit] = useState(null)
  const [inspectUnit, setInspectUnit] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [occupancyFilter, setOccupancyFilter] = useState('all')
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false)
  const [sortBy, setSortBy] = useState('name-asc')
  const [toast, flash] = useToast()

  const rawUnits = data || []
  const propertiesList = props.data || []
  const summaryUnits = useMemo(() => propertyFilter === 'all'
    ? rawUnits
    : rawUnits.filter((unit) => String(unit.property_id) === propertyFilter), [rawUnits, propertyFilter])
  const inventorySummary = useMemo(() => summaryUnits.reduce((summary, unit) => {
    const occupancy = unitOccupancy(unit)
    if (occupancy === 'occupied') summary.occupied += 1
    if (occupancy === 'vacant') summary.vacant += 1
    if (occupancy === 'scheduled') summary.scheduled += 1
    if (Number(unit.open_repair_count) > 0 || unit.condition_tag === 'under_maintenance') summary.attention += 1
    return summary
  }, { occupied: 0, vacant: 0, scheduled: 0, attention: 0 }), [summaryUnits])

  useEffect(() => {
    const propertyId = searchParams.get('property_id')
    if (propertyId) setPropertyFilter(propertyId)
  }, [searchParams])

  const save = async (v) => {
    if (Array.isArray(v)) {
      let created = 0
      try {
        for (const unit of v) {
          await api('/api/admin/units', { method: 'POST', auth: true, body: clean(unit) })
          created += 1
        }
      } catch (error) {
        reload()
        const message = created
          ? `Added ${created} of ${v.length} units before an error: ${error.message}`
          : error.message
        flash(message, 'bad')
        throw new Error(message)
      }
      flash(`${created} units added`)
      reload()
      return
    }

    const body = clean(v)
    const r = edit.id
      ? await api(`/api/admin/units/${edit.id}`, { method: 'PUT', auth: true, body })
      : await api('/api/admin/units', { method: 'POST', auth: true, body })
    flash(r.message)
    reload()
  }

  const del = async (u) => {
    if (!window.confirm(`Archive unit ${u.unit_name}? Its history will be preserved and can be restored later.`)) return
    try {
      flash((await api(`/api/admin/units/${u.id}`, { method: 'DELETE', auth: true })).message)
      reload()
      archived.reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  const restore = async (u) => {
    if (!window.confirm(`Restore unit ${u.unit_name}? It will return to active unit views.`)) return
    try {
      flash((await api(`/api/admin/units/${u.id}/restore`, { method: 'POST', auth: true })).message)
      reload()
      archived.reload()
    } catch (e) {
      flash(e.message, 'bad')
    }
  }

  // Filter & sort units
  const filteredUnits = useMemo(() => {
    let result = [...rawUnits]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (u) =>
          String(u.unit_name || '').toLowerCase().includes(q) ||
          (u.property_name && u.property_name.toLowerCase().includes(q)) ||
          (u.tenant_name && u.tenant_name.toLowerCase().includes(q)) ||
          (u.notes && u.notes.toLowerCase().includes(q))
      )
    }

    if (propertyFilter !== 'all') {
      result = result.filter((u) => String(u.property_id) === propertyFilter)
    }

    if (occupancyFilter !== 'all') {
      result = result.filter((u) => unitOccupancy(u) === occupancyFilter)
    }
    if (needsAttentionOnly) {
      result = result.filter((u) => Number(u.open_repair_count) > 0 || u.condition_tag === 'under_maintenance')
    }

    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.unit_name.localeCompare(b.unit_name)
      if (sortBy === 'name-desc') return b.unit_name.localeCompare(a.unit_name)
      if (sortBy === 'price-asc') return Number(a.monthly_rent) - Number(b.monthly_rent)
      if (sortBy === 'price-desc') return Number(b.monthly_rent) - Number(a.monthly_rent)
      if (sortBy === 'occupancy') return unitOccupancy(a).localeCompare(unitOccupancy(b))
      if (sortBy === 'capacity-desc') return Number(b.capacity || 1) - Number(a.capacity || 1)
      return 0
    })

    return result
  }, [rawUnits, search, propertyFilter, occupancyFilter, needsAttentionOnly, sortBy])

  // Group filtered units by property (preserves sort order in Icons/Grid view)
  const groupedByProperty = useMemo(() => {
    const map = new Map()
    for (const u of filteredUnits) {
      const propKey = String(u.property_id || u.property_name)
      if (!map.has(propKey)) {
        map.set(propKey, {
          id: propKey,
          name: u.property_name,
          address: [u.property_address, u.property_barangay, u.property_city].filter(Boolean).join(', '),
          units: [],
        })
      }
      map.get(propKey).units.push(u)
    }
    return Array.from(map.values())
  }, [filteredUnits])

  // Property filter options
  const propertyFilterOptions = useMemo(() => {
    const list = [{ value: 'all', label: 'All Properties' }]
    for (const p of propertiesList) {
      list.push({ value: String(p.id), label: p.name })
    }
    return list
  }, [propertiesList])

  return (
    <div className="admin-units-page">
      <PageHead eyebrow="Manage" title="Units" sub="Rooms and apartments across your properties with real-time occupancy and photos.">
        <button className="btn btn--accent" onClick={() => setEdit({})} disabled={!propertiesList.length}>
          + {t('Add unit')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setShowArchived(true)}>
          {t('Archived')} {archived.data?.length ? `(${archived.data.length})` : ''}
        </button>
      </PageHead>

      {propertiesList.length === 0 && <p className="alert">{t('Add a property first, then its units.')}</p>}

      <State loading={loading} error={error} empty={rawUnits.length === 0 && t('No units yet. Add your first room or unit.')}>
        {rawUnits.length > 0 && (
          <>
            <section className="unit-inventory-summary" aria-label={t('Unit inventory summary')}>
              <button type="button" className={`unit-summary-item${occupancyFilter === 'all' && !needsAttentionOnly ? ' is-active' : ''}`}
                onClick={() => { setOccupancyFilter('all'); setNeedsAttentionOnly(false) }}
                aria-pressed={occupancyFilter === 'all' && !needsAttentionOnly}
                aria-label={`${summaryUnits.length} ${t('All units')}`}>
                <strong>{summaryUnits.length}</strong><span className="unit-summary-item__label-full">{t('All units')}</span><span className="unit-summary-item__label-mobile">{t('All')}</span>
              </button>
              <button type="button" className={`unit-summary-item${occupancyFilter === 'occupied' && !needsAttentionOnly ? ' is-active' : ''}`}
                onClick={() => { setOccupancyFilter('occupied'); setNeedsAttentionOnly(false) }}
                aria-pressed={occupancyFilter === 'occupied' && !needsAttentionOnly}
                aria-label={`${inventorySummary.occupied} ${t('Occupied')}`}>
                <strong>{inventorySummary.occupied}</strong><span className="unit-summary-item__label-full">{t('Occupied')}</span><span className="unit-summary-item__label-mobile">{t('Occupied')}</span>
              </button>
              <button type="button" className={`unit-summary-item${occupancyFilter === 'vacant' && !needsAttentionOnly ? ' is-active' : ''}`}
                onClick={() => { setOccupancyFilter('vacant'); setNeedsAttentionOnly(false) }}
                aria-pressed={occupancyFilter === 'vacant' && !needsAttentionOnly}
                aria-label={`${inventorySummary.vacant} ${t('Vacant')}`}>
                <strong>{inventorySummary.vacant}</strong><span className="unit-summary-item__label-full">{t('Vacant')}</span><span className="unit-summary-item__label-mobile">{t('Vacant')}</span>
              </button>
              <button type="button" className={`unit-summary-item${occupancyFilter === 'scheduled' && !needsAttentionOnly ? ' is-active' : ''}`}
                onClick={() => { setOccupancyFilter('scheduled'); setNeedsAttentionOnly(false) }}
                aria-pressed={occupancyFilter === 'scheduled' && !needsAttentionOnly}
                aria-label={`${inventorySummary.scheduled} ${t('Scheduled move-ins')}`}>
                <strong>{inventorySummary.scheduled}</strong><span className="unit-summary-item__label-full">{t('Scheduled move-ins')}</span><span className="unit-summary-item__label-mobile">{t('Move-ins')}</span>
              </button>
              <button type="button" className={`unit-summary-item unit-summary-item--attention${needsAttentionOnly ? ' is-active' : ''}`}
                onClick={() => { setOccupancyFilter('all'); setNeedsAttentionOnly(!needsAttentionOnly) }}
                aria-pressed={needsAttentionOnly}
                aria-label={`${inventorySummary.attention} ${t('Needs attention')}`}>
                <strong>{inventorySummary.attention}</strong><span className="unit-summary-item__label-full">{t('Needs attention')}</span><span className="unit-summary-item__label-mobile">{t('Attention')}</span>
              </button>
            </section>

            <ViewToolbar
              view={viewMode}
              onViewChange={setViewMode}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search unit, tenant, or property…"
              sort={sortBy}
              onSortChange={setSortBy}
              sortOptions={[
                { value: 'name-asc', label: 'Sort: Unit Name (A-Z)' },
                { value: 'name-desc', label: 'Sort: Unit Name (Z-A)' },
                { value: 'price-asc', label: 'Sort: Rent (Low to High)' },
                { value: 'price-desc', label: 'Sort: Rent (High to Low)' },
                { value: 'occupancy', label: 'Sort: Occupancy Status' },
                { value: 'capacity-desc', label: 'Sort: Capacity (Largest)' },
              ]}
              filter={propertyFilter}
              onFilterChange={setPropertyFilter}
              filterOptions={propertyFilterOptions}
            >
              <select value={occupancyFilter} onChange={(e) => { setOccupancyFilter(e.target.value); setNeedsAttentionOnly(false) }}>
                <option value="all">{t('All Occupancy')}</option>
                <option value="vacant">{t('Vacant (Available)')}</option>
                <option value="scheduled">{t('Move-in scheduled')}</option>
                <option value="occupied">{t('Occupied')}</option>
              </select>
              <span className="unit-toolbar-count">{filteredUnits.length} {t(filteredUnits.length === 1 ? 'unit' : 'units')}</span>
            </ViewToolbar>

            {filteredUnits.length === 0 ? (
              <div className="unit-empty-filter">
                <p>{t('No units match your search or filter criteria.')}</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="unit-property-groups">
                {groupedByProperty.map((group) => (
                  <section key={group.id} className="property-group unit-property-group" aria-labelledby={`unit-property-${group.id}`}>
                    <div className="property-group__head">
                      <div>
                        <h2 id={`unit-property-${group.id}`} className="property-group__title">{group.name}</h2>
                        {group.address && <p className="property-group__address">{group.address}</p>}
                      </div>
                      <span className="property-group__count">{group.units.length} {t(group.units.length === 1 ? 'unit' : 'units')}</span>
                    </div>
                    <div className="cards-grid">
                      {group.units.map((u) => {
                        const openDetails = () => setInspectUnit(u)
                        return (
                        <article key={u.id} className="unit-card" role="button" tabIndex={0}
                          aria-label={`${t('View unit details')}: ${u.unit_name}`}
                          aria-haspopup="dialog"
                          onClick={openDetails}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openDetails()
                            }
                          }}>
                          <div className="unit-card__img-wrap">
                            {u.image_url ? (
                              <img src={u.image_url} alt={`${u.unit_name} - ${t('Unit photo')}`} className="unit-card__img" />
                            ) : (
                              <div className="unit-card__placeholder" role="img" aria-label={t('No photo uploaded for this unit')}>
                                <svg viewBox="0 0 96 76" aria-hidden="true"><path d="M17 66V21h26v45M43 32h36v34M10 66h76M26 31h8m-8 9h8m-8 9h8m-8 9h8m19-17h8m-8 10h8m-8 10h8m9-20h8m-8 10h8m-8 10h8" /></svg>
                                <span>{t('No photo')}</span>
                              </div>
                            )}
                            <div className={`unit-card__badge-top-left${unitOccupancy(u) === 'vacant' ? ' unit-card__badge-top-left--vacant' : ''}${unitOccupancy(u) === 'occupied' ? ' unit-card__badge-top-left--occupied' : ''}`}>
                              <StatusPill value={unitOccupancy(u)} />
                            </div>
                            <div className="unit-card__view-hint" aria-hidden="true">{t('View unit details')}</div>
                            <div className="unit-card__glass">
                              <div className="unit-card__glass-head">
                                <h3 className="unit-card__title">{u.unit_name}</h3>
                                <div className="unit-card__rent"><strong>{money(u.monthly_rent)}</strong><span>{t('per month')}</span></div>
                              </div>
                              <div className="unit-card__glass-foot">
                                <span className="unit-card__glass-tenant">
                                  {u.lease_status === 'scheduled'
                                    ? `${u.tenant_name || t('Tenant not assigned')} · ${t('Move-in')} ${dateFmt(u.start_date)}`
                                    : u.lease_status === 'offered'
                                      ? t('Lease offer pending')
                                    : u.tenant_name || t('Ready for tenant move-in')}
                                </span>
                                {Number(u.open_repair_count) > 0 && (
                                  <span className="unit-card__glass-repairs">{u.open_repair_count} {t(Number(u.open_repair_count) === 1 ? 'open repair' : 'open repairs')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      )})}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="unit-property-groups unit-property-groups--list">
                {groupedByProperty.map((group) => (
                  <section key={group.id} className="property-group unit-property-group" aria-labelledby={`unit-list-property-${group.id}`}>
                    <div className="property-group__head">
                      <div>
                        <h2 id={`unit-list-property-${group.id}`} className="property-group__title">{group.name}</h2>
                        {group.address && <p className="property-group__address">{group.address}</p>}
                      </div>
                      <span className="property-group__count">{group.units.length} {t(group.units.length === 1 ? 'unit' : 'units')}</span>
                    </div>
                    <Table rows={group.units}
                      columns={[
                        { key: 'unit_name', label: 'Unit', render: (r) => <button type="button" className="unit-list-name" onClick={() => setInspectUnit(r)}>{r.unit_name}</button> },
                        { key: 'monthly_rent', label: 'Rent', align: 'right', render: (r) => money(r.monthly_rent) },
                        { key: 'occupancy_status', label: 'Occupancy', render: (r) => <StatusPill value={unitOccupancy(r)} /> },
                        { key: 'tenant_name', label: 'Tenant', render: (r) => r.tenant_name || <span className="muted">—</span> },
                        { key: 'condition_tag', label: 'Condition', render: (r) => <StatusPill value={r.condition_tag} /> },
                        { key: 'open_repair_count', label: 'Repairs', render: (r) => Number(r.open_repair_count) > 0
                          ? <span className="tag tag--warn">{r.open_repair_count} {t('open')}</span>
                          : <span className="muted">{t('None')}</span> },
                      ]}
                      actions={(r) => (
                        <div className="unit-list-actions">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setInspectUnit(r)}>{t('Details')}</button>
                          <button type="button" className="btn btn--accent btn--sm" onClick={() => setEdit(r)}>{t('Edit')}</button>
                          <button type="button" className="btn btn--ghost btn--sm unit-list-actions__delete" onClick={() => del(r)}>{t('Archive')}</button>
                        </div>
                      )} />
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </State>

      {/* Unit details with edit and archive actions. */}
      {inspectUnit && (
        <UnitDetailModal
          unit={inspectUnit}
          onClose={() => setInspectUnit(null)}
          actionLabel="Edit unit"
          onAction={(u) => setEdit(u)}
          secondaryLabel="Archive unit"
          onSecondaryAction={(u) => del(u)}
        />
      )}

      {showArchived && (
        <Modal title="Archived units" onClose={() => setShowArchived(false)}>
          <State loading={archived.loading} error={archived.error} empty={archived.data?.length === 0 && t('No archived units.')}>
            {archived.data && (
              <Table rows={archived.data}
                columns={[
                  { key: 'unit_name', label: 'Unit', render: (u) => <strong>{u.unit_name}</strong> },
                  { key: 'property_name', label: 'Property' },
                  { key: 'archive_reason', label: 'Archive status', render: (u) => u.archived_at ? t('Unit archived') : t('Property archived') },
                  { key: 'archived_at', label: 'Archived on', render: (u) => dateFmt(u.archived_at || u.property_archived_at) },
                ]}
                actions={(u) => u.property_archived_at
                  ? <span className="muted">{t('Restore the property first')}</span>
                  : <button type="button" className="btn btn--accent btn--sm" onClick={() => restore(u)}>{t('Restore')}</button>} />
            )}
          </State>
        </Modal>
      )}

      {/* UNIT EDIT / ADD FORM MODAL */}
      {edit && (
        <UnitForm
          key={edit.id || 'new'}
          unit={edit}
          properties={propertiesList}
          existingUnits={[...rawUnits, ...(archived.data || [])]}
          onSubmit={save}
          onClose={() => setEdit(null)}
        />
      )}

      {toast}
    </div>
  )
}

function UnitForm({ unit, properties, existingUnits, onSubmit, onClose }) {
  const nextAvailableNumber = (propertyId, prefix) => {
    const foldedPrefix = prefix.trim().toLocaleLowerCase()
    const highestNumber = existingUnits
      .filter((item) => String(item.property_id) === String(propertyId))
      .reduce((highest, item) => {
        const name = item.unit_name.toLocaleLowerCase()
        const suffix = name.startsWith(`${foldedPrefix} `) ? name.slice(foldedPrefix.length).trim() : ''
        return /^\d+$/.test(suffix) ? Math.max(highest, Number(suffix)) : highest
      }, 100)
    return highestNumber + 1
  }
  const [values, setValues] = useState(() => ({
    property_id: unit.property_id || properties[0]?.id || '',
    unit_name: unit.unit_name || 'Unit',
    quantity: '1',
    startNumber: String(nextAvailableNumber(unit.property_id || properties[0]?.id || '', unit.unit_name || 'Unit')),
    monthly_rent: unit.monthly_rent ?? '',
    default_deposit: unit.default_deposit ?? 0,
    default_due_day: unit.default_due_day ?? 5,
    capacity: unit.capacity ?? 1,
    condition_tag: unit.condition_tag || 'good_condition',
    notes: unit.notes || '',
    image_url: unit.image_url || '',
    contract_template: parseLeaseTemplate(unit.contract_template),
  }))
  const [preview, setPreview] = useState(unit.image_url || '')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [customizeContract, setCustomizeContract] = useState(!!unit.contract_template)
  const update = (patch) => setValues((current) => ({ ...current, ...patch }))

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 })
      setPreview(compressed.data)
      update({ image: compressed.data })
    } catch (err) {
      setError(err.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setErrors({})
    try {
      if (unit.id) {
        await onSubmit(values)
      } else {
        const prefix = values.unit_name.trim()
        const quantity = Number(values.quantity)
        const startNumber = Number(values.startNumber)
        if (!prefix || !Number.isInteger(quantity) || quantity < 1 || quantity > 100
          || !Number.isInteger(startNumber) || startNumber < 1 || startNumber + quantity - 1 > 99999999) {
          throw new Error('Enter a unit name, 1–100 units, and a valid starting number.')
        }
        const unitValues = { ...values }
        delete unitValues.quantity
        delete unitValues.startNumber
        const unitsToCreate = Array.from({ length: quantity }, (_, index) => ({
          ...unitValues,
          unit_name: `${prefix} ${startNumber + index}`,
        }))
        const existingNames = new Set(existingUnits
          .filter((item) => String(item.property_id) === String(values.property_id))
          .map((item) => item.unit_name.toLocaleLowerCase()))
        const duplicateNames = unitsToCreate
          .map((item) => item.unit_name)
          .filter((name) => existingNames.has(name.toLocaleLowerCase()))
        if (duplicateNames.length) {
          throw new Error(`These unit names already exist in this property: ${duplicateNames.join(', ')}. Choose another starting number.`)
        }
        await onSubmit(unitsToCreate)
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setErrors(err.fields || {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={unit.id ? `Edit ${unit.unit_name}` : 'Add New Unit'} onClose={onClose}>
      <form className="stack unit-form" onSubmit={submit} noValidate>
        <Field label="Unit photo (optional)" hint="Visual preview of what this room looks like. Uploaded to Cloudinary CDN.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {preview && (
              <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                <img src={preview} alt="Unit preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--page-line)' }} />
                <button
                  type="button"
                  onClick={() => { setPreview(''); update({ image: '', image_url: '' }) }}
                  style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 0, borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11, display: 'grid', placeItems: 'center' }}
                  title="Remove photo"
                >
                  ✕
                </button>
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleImageChange} />
          </div>
        </Field>

        <Field label="Property" error={errors.property_id}>
          <select value={values.property_id} onChange={(e) => update({
            property_id: e.target.value,
            ...(!unit.id ? { startNumber: String(nextAvailableNumber(e.target.value, values.unit_name)) } : {}),
          })} aria-invalid={!!errors.property_id}>
            <option value="">Choose property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        {unit.id ? (
          <Field label="Unit name / room" error={errors.unit_name}>
            <input type="text" value={values.unit_name} onChange={(e) => update({ unit_name: e.target.value })} aria-invalid={!!errors.unit_name} />
          </Field>
        ) : (
          <>
            <Field label="Unit name" hint="Each unit will use this name followed by its number, e.g. Water 101, Water 102.">
              <input type="text" maxLength={45} value={values.unit_name} onChange={(e) => update({
                unit_name: e.target.value,
                startNumber: String(nextAvailableNumber(values.property_id, e.target.value)),
              })} />
            </Field>
            <div className="onboarding__grid">
              <Field label="Number of units">
                <input type="number" min="1" max="100" step="1" value={values.quantity}
                  onChange={(e) => update({ quantity: e.target.value })} />
              </Field>
              <Field label="Starting number">
                <input type="number" min="1" max="99999999" step="1" value={values.startNumber}
                  onChange={(e) => update({ startNumber: e.target.value })} />
              </Field>
            </div>
            {Number(values.quantity) > 0 && Number(values.quantity) <= 100 && (
              <p className="muted" aria-live="polite">
                Names: {values.unit_name.trim() || 'Unit'} {values.startNumber}
                {Number(values.quantity) > 1 ? ` to ${values.unit_name.trim() || 'Unit'} ${Number(values.startNumber) + Number(values.quantity) - 1}` : ''}
              </p>
            )}
          </>
        )}

        <Field label="Monthly rent (PHP)" error={errors.monthly_rent}>
          <input type="number" step="0.01" min="0" value={values.monthly_rent} onChange={(e) => update({ monthly_rent: e.target.value })} aria-invalid={!!errors.monthly_rent} />
        </Field>

        <div className="onboarding__grid">
          <Field label="Default security deposit (PHP)">
            <input type="number" min="0" step="0.01" value={values.default_deposit} onChange={(e) => update({ default_deposit: e.target.value })} />
          </Field>
          <Field label="Default rent due day (1–28)">
            <input type="number" min="1" max="28" value={values.default_due_day} onChange={(e) => update({ default_due_day: e.target.value })} />
          </Field>
        </div>

        <Field label="Capacity (people)" error={errors.capacity}>
          <input type="number" min="1" value={values.capacity} onChange={(e) => update({ capacity: e.target.value })} aria-invalid={!!errors.capacity} />
        </Field>

        <Field label="Condition" error={errors.condition_tag}>
          <select value={values.condition_tag} onChange={(e) => update({ condition_tag: e.target.value })} aria-invalid={!!errors.condition_tag}>
            <option value="good_condition">Good condition</option>
            <option value="under_maintenance">Under maintenance</option>
          </select>
        </Field>

        <Field label="Notes & Amenities" error={errors.notes} hint="e.g. Inclusions like aircon, wifi, private bathroom, balcony...">
          <textarea rows={3} value={values.notes} onChange={(e) => update({ notes: e.target.value })} aria-invalid={!!errors.notes} />
        </Field>
        <label className="field field--checkbox">
          <input type="checkbox" checked={customizeContract} onChange={(event) => {
            setCustomizeContract(event.target.checked)
            if (!event.target.checked) update({ contract_template: null })
          }} />
          <span className="field__label">Use unit-specific contract wording instead of the property template</span>
        </label>
        {customizeContract && <ContractTemplateEditor value={values.contract_template} onChange={(contract_template) => update({ contract_template })} title="Unit contract clauses" />}

        {error && <p className="alert alert--error" role="alert">{error}</p>}

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? 'Saving…' : 'Save Unit'}</button>
        </div>
      </form>
    </Modal>
  )
}
