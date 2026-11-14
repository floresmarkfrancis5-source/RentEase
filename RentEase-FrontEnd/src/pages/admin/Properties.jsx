import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Field, Modal, PageHead, State, Table, clean, useLoad, useToast } from '../../components/ui'
import { api, dateFmt } from '../../lib/api'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'
import { compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'
import PropertyPortfolioMap from '../../components/PropertyPortfolioMap'
import ContractTemplateEditor from '../../components/ContractTemplateEditor'
import { DEFAULT_LEASE_TEMPLATE, parseLeaseTemplate } from '../../lib/leaseContract'
import { useLanguage } from '../../context/LanguageContext'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
export function MapView({ p, onClose }) {
  const has = p.latitude && p.longitude
  const q = has ? `${p.latitude},${p.longitude}` : encodeURIComponent([p.address, p.barangay, p.city].filter(Boolean).join(' '))
  return (
    <Modal title={p.name} onClose={onClose}>
      <p className="muted">{[p.address, p.barangay, p.city].filter(Boolean).join(', ')}</p>
      {/* With a Google key the official Embed API is used; without one the free keyless embed still shows the map. */}
      <iframe className="map" title={`Map of ${p.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
        src={MAPS_KEY
          ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(MAPS_KEY)}&q=${q}`
          : `https://maps.google.com/maps?q=${q}&z=16&output=embed`} />
      <a className="btn btn--accent" style={{ marginTop: 14 }} target="_blank" rel="noreferrer"
        href={`https://www.google.com/maps/search/?api=1&query=${q}`}>Open in Google Maps</a>
    </Modal>
  )
}

export default function Properties() {
  const { t } = useLanguage()
  const { data, error, loading, reload } = useLoad('/api/admin/properties')
  const archived = useLoad('/api/admin/properties?archived=1')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [edit, setEdit] = useState(null) // {} = new, row = editing
  const [map, setMap] = useState(null)
  const [showPortfolioMap, setShowPortfolioMap] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches)
  const [openPropertyActions, setOpenPropertyActions] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')
  const [toast, flash] = useToast()

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 600px)')
    const updateViewport = () => setIsMobile(mediaQuery.matches)
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', updateViewport)
    else mediaQuery.addListener(updateViewport)
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', updateViewport)
      else mediaQuery.removeListener(updateViewport)
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('action') !== 'add') return
    setEdit({})
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const rawProperties = data || []
  const portfolio = useMemo(() => rawProperties.reduce((summary, property) => {
    const units = Number(property.units_count || 0)
    const occupied = Number(property.occupied_count || 0)
    summary.units += units
    summary.occupied += occupied
    return summary
  }, { units: 0, occupied: 0 }), [rawProperties])
  const portfolioVacant = Math.max(0, portfolio.units - portfolio.occupied)
  const portfolioOccupancy = portfolio.units ? Math.round((portfolio.occupied / portfolio.units) * 100) : 0

  const filteredProperties = useMemo(() => {
    let result = [...rawProperties]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.address && p.address.toLowerCase().includes(q)) ||
          (p.city && p.city.toLowerCase().includes(q)) ||
          (p.barangay && p.barangay.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      )
    }

    if (typeFilter !== 'all') {
      result = result.filter((p) => p.type === typeFilter)
    }

    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'units-desc') return Number(b.units_count || 0) - Number(a.units_count || 0)
      if (sortBy === 'units-asc') return Number(a.units_count || 0) - Number(b.units_count || 0)
      if (sortBy === 'occupied-desc') return Number(b.occupied_count || 0) - Number(a.occupied_count || 0)
      if (sortBy === 'city-asc') return (a.city || '').localeCompare(b.city || '')
      return 0
    })

    return result
  }, [rawProperties, search, typeFilter, sortBy])

  const save = async (v) => {
    const body = clean(v)
    const r = edit.id
      ? await api(`/api/admin/properties/${edit.id}`, { method: 'PUT', auth: true, body })
      : await api('/api/admin/properties', { method: 'POST', auth: true, body })
    flash(r.message); reload()
  }
  const del = async (p) => {
    if (!window.confirm(`Archive ${p.name}? Its history will be preserved and can be restored later.`)) return
    try {
      flash((await api(`/api/admin/properties/${p.id}`, { method: 'DELETE', auth: true })).message)
      reload()
      archived.reload()
    } catch (e) { flash(e.message, 'bad') }
  }
  const restore = async (p) => {
    if (!window.confirm(`Restore ${p.name}? It will return to active property views.`)) return
    try {
      flash((await api(`/api/admin/properties/${p.id}/restore`, { method: 'POST', auth: true })).message)
      reload()
      archived.reload()
    } catch (e) { flash(e.message, 'bad') }
  }
  const viewUnits = useCallback((property) => {
    navigate(`/admin/units?property_id=${encodeURIComponent(property.id)}`)
  }, [navigate])
  const editProperty = useCallback((property) => setEdit(property), [])

  return (
    <div className="admin-properties-page">
      <PageHead eyebrow="Manage" title="Properties" sub="Apartments and boarding houses you rent out.">
        <button className="btn btn--accent" onClick={() => setEdit({})}>+ Add property</button>
        <button type="button" className="btn btn--ghost" onClick={() => setShowArchived(true)}>
          {t('Archived')} {archived.data?.length ? `(${archived.data.length})` : ''}
        </button>
        {isMobile && rawProperties.length > 0 && (
          <button type="button" className="btn btn--ghost property-map-trigger" onClick={() => setShowPortfolioMap(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15" /></svg>
            <span>{t('Map view')}</span>
          </button>
        )}
      </PageHead>

      {data && rawProperties.length > 0 && (
        <>
          <section className="property-portfolio-summary" aria-label={t('Portfolio summary')}>
            <div className="property-portfolio-summary__lead">
              <strong>{rawProperties.length}</strong>
              <span>{rawProperties.length === 1 ? t('property') : t('properties')}</span>
            </div>
            <span className="property-portfolio-summary__divider" aria-hidden="true" />
            <div><strong>{portfolio.units}</strong><span>{t('units')}</span></div>
            <div><strong>{portfolio.occupied}</strong><span>{t('occupied')}</span></div>
            <div><strong>{portfolioVacant}</strong><span>{t('vacant')}</span></div>
            <div className="property-portfolio-summary__occupancy">
              <span>{t('Portfolio occupancy')}</span>
              <strong>{portfolioOccupancy}%</strong>
              <div className="property-portfolio-summary__track" role="progressbar"
                aria-label={t('Portfolio occupancy')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={portfolioOccupancy}>
                <span style={{ width: `${portfolioOccupancy}%` }} />
              </div>
            </div>
          </section>
          {!isMobile && <PropertyPortfolioMap properties={rawProperties} onViewUnits={viewUnits} onEdit={editProperty} />}
        </>
      )}

      <div className="properties-toolbar">
        <ViewToolbar
        view={viewMode}
        onViewChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search properties by name, city, address…"
        filter={typeFilter}
        onFilterChange={setTypeFilter}
        filterOptions={[
          { value: 'all', label: 'All Property Types' },
          { value: 'apartment', label: 'Apartment' },
          { value: 'boarding_house', label: 'Boarding House' },
        ]}
        sort={sortBy}
        onSortChange={setSortBy}
        sortOptions={[
          { value: 'name-asc', label: 'Name (A to Z)' },
          { value: 'name-desc', label: 'Name (Z to A)' },
          { value: 'units-desc', label: 'Most Units' },
          { value: 'units-asc', label: 'Fewest Units' },
          { value: 'occupied-desc', label: 'Highest Occupancy' },
          { value: 'city-asc', label: 'City (A to Z)' },
        ]}
        >
          <span className="properties-results-count properties-results-count--toolbar">
            {filteredProperties.length} {filteredProperties.length === 1 ? t('property') : t('properties')}
          </span>
        </ViewToolbar>
        <p className="properties-results-count properties-results-count--mobile" role="status">
          {t('Showing')} {filteredProperties.length} {filteredProperties.length === 1 ? t('property') : t('properties')}
        </p>
      </div>

      <State loading={loading} error={error} empty={data?.length === 0 && t('No properties yet. Add your first one.')}>
        {data && filteredProperties.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            {t('No properties match your search and filter criteria.')}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid">
            {filteredProperties.map((p) => {
              const totalUnits = Number(p.units_count || 0)
              const occupiedUnits = Number(p.occupied_count || 0)
              const vacantUnits = Math.max(0, totalUnits - occupiedUnits)
              const addr = [p.address, p.barangay, p.city].filter(Boolean).join(', ')
              const occupancy = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0

              return (
                <article key={p.id}
                  className={`property-card${openPropertyActions === p.id ? ' property-card--actions-open' : ''}`}
                  tabIndex={0} aria-label={`${p.name} ${t('property')}`}>
                  <div className="property-card__img-wrap">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="property-card__img" />
                    ) : (
                      <div className="property-card__placeholder" role="img" aria-label={t('Property photo not added')}>
                        <svg viewBox="0 0 96 76" aria-hidden="true">
                          <path d="M17 66V21h26v45M43 32h36v34M10 66h76M26 31h8m-8 9h8m-8 9h8m-8 9h8m19-17h8m-8 10h8m-8 10h8m9-20h8m-8 10h8m-8 10h8" />
                        </svg>
                        <span>{t('Property photo not added')}</span>
                      </div>
                    )}
                    <span className="property-card__type">
                      {p.type === 'boarding_house' ? t('Boarding House') : t('Apartment')}
                    </span>
                    <button
                      type="button"
                      className="property-card__options-toggle"
                      aria-expanded={openPropertyActions === p.id}
                      aria-controls={`property-actions-${p.id}`}
                      aria-label={`${t(openPropertyActions === p.id ? 'Close' : 'Options')}: ${p.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpenPropertyActions((current) => current === p.id ? null : p.id)
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {openPropertyActions === p.id
                          ? <path d="m6 6 12 12M18 6 6 18" />
                          : <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
                      </svg>
                      <span>{t(openPropertyActions === p.id ? 'Close' : 'Options')}</span>
                    </button>
                    <div className="property-card__overlay" id={`property-actions-${p.id}`}>
                      <span className="property-card__overlay-label">{t('Manage property')}</span>
                      <div className="property-card__actions">
                        <button type="button" className="property-card__action property-card__action--primary"
                          onClick={() => { setOpenPropertyActions(null); viewUnits(p) }}>{t('View units')}</button>
                        <button type="button" className="property-card__action" onClick={() => { setOpenPropertyActions(null); setEdit(p) }}>{t('Edit')}</button>
                        <button type="button" className="property-card__action property-card__action--delete"
                          onClick={() => { setOpenPropertyActions(null); del(p) }}>{t('Archive')}</button>
                      </div>
                    </div>
                  </div>

                  <div className="property-card__body">
                    <h3 className="property-card__title">{p.name}</h3>
                    {addr && <p className="property-card__addr">{addr}</p>}
                    <div className="property-card__stats">
                      <span><strong>{totalUnits}</strong> {t('units')}</span>
                      <span><strong>{occupiedUnits}</strong> {t('occupied')}</span>
                      <span><strong>{vacantUnits}</strong> {t('vacant')}</span>
                    </div>
                    <div className="property-card__occupancy">
                      <span>{occupancy}% {t('occupied')}</span>
                      <div className="property-card__occupancy-track" role="progressbar"
                        aria-label={`${p.name} occupancy`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={occupancy}>
                        <span style={{ width: `${occupancy}%` }} />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <Table rows={filteredProperties}
            columns={[
              {
                key: 'photo',
                label: 'Photo',
                render: (r) => r.image_url ? (
                  <img src={r.image_url} alt={r.name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--page-line)', display: 'block' }} />
                ) : (
                  <span className="muted" style={{ fontSize: '.78rem' }}>—</span>
                )
              },
              { key: 'name', label: 'Name', render: (r) => <strong>{r.name}</strong> },
              { key: 'type', label: 'Type', render: (r) => r.type === 'boarding_house' ? 'Boarding house' : 'Apartment' },
              { key: 'address', label: 'Address', render: (r) => [r.address, r.barangay, r.city].filter(Boolean).join(', ') },
              { key: 'units', label: 'Occupied / units', render: (r) => `${r.occupied_count}/${r.units_count}` },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setMap(r)}>Map</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(r)}>{t('Archive')}</button>
              </>
            )} />
        )}
      </State>
      {edit && <PropertyForm key={edit.id || 'new'} property={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {map && <MapView p={map} onClose={() => setMap(null)} />}
      {showPortfolioMap && (
        <Modal title="Portfolio map" onClose={() => setShowPortfolioMap(false)} className="property-map-modal">
          <PropertyPortfolioMap
            properties={rawProperties}
            onViewUnits={viewUnits}
            onEdit={(property) => {
              setShowPortfolioMap(false)
              editProperty(property)
            }}
          />
        </Modal>
      )}
      {showArchived && (
        <Modal title="Archived properties" onClose={() => setShowArchived(false)}>
          <State loading={archived.loading} error={archived.error} empty={archived.data?.length === 0 && t('No archived properties.')}>
            {archived.data && (
              <Table rows={archived.data}
                columns={[
                  { key: 'name', label: 'Name', render: (p) => <strong>{p.name}</strong> },
                  { key: 'address', label: 'Address', render: (p) => [p.address, p.barangay, p.city].filter(Boolean).join(', ') },
                  { key: 'units_count', label: 'Units', render: (p) => p.units_count },
                  { key: 'archived_at', label: 'Archived on', render: (p) => dateFmt(p.archived_at) },
                ]}
                actions={(p) => (
                  <button type="button" className="btn btn--accent btn--sm" onClick={() => restore(p)}>{t('Restore')}</button>
                )} />
            )}
          </State>
        </Modal>
      )}
      {toast}
    </div>
  )
}

function PropertyForm({ property, onSubmit, onClose }) {
  const [values, setValues] = useState(() => ({
    name: property.name || '',
    type: property.type || 'apartment',
    address: property.address || '',
    city: property.city || '',
    barangay: property.barangay || '',
    latitude: property.latitude ?? '',
    longitude: property.longitude ?? '',
    description: property.description || '',
    image_url: property.image_url || '',
    contract_template: parseLeaseTemplate(property.contract_template || DEFAULT_LEASE_TEMPLATE),
  }))
  const [preview, setPreview] = useState(property.image_url || '')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err.message)
      setErrors(err.fields || {})
    } finally { setBusy(false) }
  }

  return (
    <Modal title={property.id ? 'Edit property' : 'Add property'} onClose={onClose}>
      <form className="stack property-form" onSubmit={submit} noValidate>
        <Field label="Property photo (optional)" hint="Visual preview for tenants. Uploaded to Cloudinary CDN.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {preview && (
              <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                <img src={preview} alt="Property preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--page-line)' }} />
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
        <Field label="Property name" error={errors.name}>
          <input type="text" value={values.name} onChange={(event) => update({ name: event.target.value })} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Type" error={errors.type}>
          <select value={values.type} onChange={(event) => update({ type: event.target.value })} aria-invalid={!!errors.type}>
            <option value="apartment">Apartment</option>
            <option value="boarding_house">Boarding house</option>
          </select>
        </Field>
        <Field label="Street address" error={errors.address} hint="Enter a house number, street, or building.">
          <input type="text" value={values.address} placeholder="House number, street, or building"
            onChange={(event) => update({ address: event.target.value })} aria-invalid={!!errors.address} />
        </Field>
        <PropertyLocationPicker address={values.address} city={values.city} barangay={values.barangay} latitude={values.latitude}
          longitude={values.longitude} onChange={update} />
        <div className="property-location__coordinates-values" aria-hidden="true">
          <input type="hidden" name="latitude" value={values.latitude} />
          <input type="hidden" name="longitude" value={values.longitude} />
          <input type="hidden" name="city" value={values.city} />
        </div>
        <Field label="Description" error={errors.description}>
          <textarea rows={3} value={values.description} onChange={(event) => update({ description: event.target.value })} aria-invalid={!!errors.description} />
        </Field>
        <ContractTemplateEditor value={values.contract_template} onChange={(contract_template) => update({ contract_template })} />
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
