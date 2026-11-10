import { useMemo, useState } from 'react'
import { Field, Modal, PageHead, State, Table, clean, useLoad, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'
import { compressImageFile } from '../../components/PhotoLightbox'
import ViewToolbar from '../../components/ViewToolbar'
import ContractTemplateEditor from '../../components/ContractTemplateEditor'
import { DEFAULT_LEASE_TEMPLATE, parseLeaseTemplate } from '../../lib/leaseContract'

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
  const { data, error, loading, reload } = useLoad('/api/admin/properties')
  const [edit, setEdit] = useState(null) // {} = new, row = editing
  const [map, setMap] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')
  const [toast, flash] = useToast()

  const rawProperties = data || []

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
    if (!window.confirm(`Delete ${p.name}?`)) return
    try { flash((await api(`/api/admin/properties/${p.id}`, { method: 'DELETE', auth: true })).message); reload() } catch (e) { flash(e.message, 'bad') }
  }

  return (
    <>
      <PageHead eyebrow="Manage" title="Properties" sub="Apartments and boarding houses you rent out.">
        <button className="btn btn--accent" onClick={() => setEdit({})}>+ Add property</button>
      </PageHead>

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
        <span className="muted" style={{ fontSize: '.84rem' }}>
          {filteredProperties.length} {filteredProperties.length === 1 ? 'property' : 'properties'}
        </span>
      </ViewToolbar>

      <State loading={loading} error={error} empty={data?.length === 0 && 'No properties yet. Add your first one.'}>
        {data && filteredProperties.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--page-muted)' }}>
            No properties match your search and filter criteria.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="cards-grid">
            {filteredProperties.map((p) => {
              const totalUnits = Number(p.units_count || 0)
              const occupiedUnits = Number(p.occupied_count || 0)
              const vacantUnits = Math.max(0, totalUnits - occupiedUnits)
              const addr = [p.address, p.barangay, p.city].filter(Boolean).join(', ')

              return (
                <div key={p.id} className="property-card">
                  <div className="property-card__img-wrap">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="property-card__img" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07))', color: 'var(--page-muted)' }}>
                        <span style={{ fontSize: '2.5rem' }}>🏢</span>
                      </div>
                    )}
                    <span
                      className="tag"
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'rgba(0,0,0,0.65)',
                        color: '#fff',
                        backdropFilter: 'blur(6px)',
                        fontSize: '.75rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {p.type === 'boarding_house' ? 'Boarding House' : 'Apartment'}
                    </span>
                  </div>

                  <div className="property-card__body">
                    <h3 className="property-card__title">{p.name}</h3>
                    {addr && <p className="property-card__addr">📍 {addr}</p>}
                    {p.description && (
                      <p
                        style={{
                          fontSize: '.82rem',
                          color: 'var(--page-muted)',
                          margin: '0 0 12px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.4,
                        }}
                      >
                        {p.description}
                      </p>
                    )}
                    <div className="property-card__stats">
                      <span>Units: <strong>{totalUnits}</strong></span>
                      <span>Occupied: <strong>{occupiedUnits}</strong></span>
                      <span>Vacant: <strong style={{ color: vacantUnits > 0 ? 'var(--emerald, #10b981)' : 'var(--page-muted)' }}>{vacantUnits}</strong></span>
                    </div>
                  </div>

                  <div className="property-card__foot">
                    <button className="btn btn--ghost btn--sm" onClick={() => setMap(p)}>🗺️ Map</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setEdit(p)}>✏️ Edit</button>
                    <button className="btn btn--ghost btn--sm" style={{ color: 'var(--red, #ef4444)' }} onClick={() => del(p)}>🗑️ Delete</button>
                  </div>
                </div>
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
              { key: 'units', label: 'Occupied', render: (r) => `${r.occupied_count}/${r.units_count}` },
            ]}
            actions={(r) => (
              <>
                <button className="btn btn--ghost btn--sm" onClick={() => setMap(r)}>Map</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setEdit(r)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(r)}>Delete</button>
              </>
            )} />
        )}
      </State>
      {edit && <PropertyForm key={edit.id || 'new'} property={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {map && <MapView p={map} onClose={() => setMap(null)} />}
      {toast}
    </>
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
