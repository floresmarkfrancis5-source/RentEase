import { useState } from 'react'
import { Field, Modal, PageHead, State, Table, clean, useLoad, useToast } from '../../components/ui'
import { api } from '../../lib/api'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'

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
  const [toast, flash] = useToast()

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
      <State loading={loading} error={error} empty={data?.length === 0 && 'No properties yet. Add your first one.'}>
        {data && (
          <Table rows={data}
            columns={[
              { key: 'name', label: 'Name', render: (r) => <strong>{r.name}</strong> },
              { key: 'type', label: 'Type', render: (r) => r.type.replace('_', ' ') },
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
  }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const update = (patch) => setValues((current) => ({ ...current, ...patch }))

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
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
