import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const PSGC_BASE = 'https://psgc.gitlab.io/api'
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const manila = [14.5995, 120.9842]
const cityMemory = { value: null, promise: null }
const barangayMemory = new Map()
let nominatimQueue = Promise.resolve()
let lastNominatimRequest = 0

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

function normalizePlace(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bcity\s+of\s+/g, '').replace(/\b(city|municipality|municipal)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function findPlace(options, value) {
  const normalized = normalizePlace(value)
  return normalized ? options.find((item) => normalizePlace(item.name) === normalized) : null
}

function nominatim(url) {
  const request = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    lastNominatimRequest = Date.now()
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      referrerPolicy: 'origin',
    })
    if (!response.ok) throw new Error('OpenStreetMap search is unavailable right now.')
    return response.json()
  })
  nominatimQueue = request.catch(() => {})
  return request
}

function readCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null')
    return cached && Date.now() - cached.savedAt < CACHE_TTL ? cached.value : null
  } catch { return null }
}

function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })) } catch { /* optional cache */ }
}

async function loadCities() {
  if (cityMemory.value) return cityMemory.value
  if (!cityMemory.promise) {
    cityMemory.promise = (async () => {
      const cached = readCache('rentease-psgc-cities')
      if (cached) return cached
      const response = await fetch(`${PSGC_BASE}/cities-municipalities/`)
      if (!response.ok) throw new Error('City list is unavailable')
      const cities = await response.json()
      writeCache('rentease-psgc-cities', cities)
      return cities
    })().then((cities) => { cityMemory.value = cities; return cities })
      .finally(() => { cityMemory.promise = null })
  }
  return cityMemory.promise
}

async function loadBarangays(code) {
  if (!code) return []
  if (barangayMemory.has(code)) return barangayMemory.get(code)
  const promise = (async () => {
    const cacheKey = `rentease-psgc-barangays-${code}`
    const cached = readCache(cacheKey)
    if (cached) return cached
    const response = await fetch(`${PSGC_BASE}/cities-municipalities/${encodeURIComponent(code)}/barangays/`)
    if (!response.ok) throw new Error('Barangay list is unavailable')
    const barangays = await response.json()
    writeCache(cacheKey, barangays)
    return barangays
  })()
  barangayMemory.set(code, promise)
  try {
    const barangays = await promise
    barangayMemory.set(code, barangays)
    return barangays
  } catch (error) {
    barangayMemory.delete(code)
    throw error
  }
}

function parsePoint(latitude, longitude) {
  if (latitude === '' || longitude === '' || latitude == null || longitude == null) return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? [lat, lng]
    : null
}

function locality(address = {}) {
  const city = address.city || address.town || address.municipality || address.village || address.county || ''
  const barangay = address.barangay || address.suburb || address.neighbourhood || ''
  const street = [address.house_number, address.road || address.pedestrian || address.residential].filter(Boolean).join(' ')
  const addressLine = [street, address.neighbourhood || address.suburb].filter(Boolean).join(', ')
  return { city, barangay, address: addressLine }
}

function SearchablePlace({ label, value, options, onChange, onSelect, onManual, onBackToList, manual, placeholder, disabled, loading }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  useEffect(() => setQuery(value), [value])
  const filtered = options
    .filter((item) => `${item.name} ${item.label || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8)
  const typed = query.trim()
  const exactMatch = findPlace(options, typed)

  if (manual) {
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input type="text" value={value} disabled={disabled} maxLength={100} placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)} />
        {onBackToList && <button type="button" className="location-combobox__back" onClick={onBackToList}>Back to list</button>}
      </label>
    )
  }

  return (
    <div className="location-combobox">
      <label className="field">
        <span className="field__label">{label}</span>
        <input type="text" role="combobox" aria-expanded={open && filtered.length > 0}
          aria-autocomplete="list" autoComplete="off" value={query} disabled={disabled} maxLength={100}
          placeholder={loading ? 'Loading official list…' : placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
            if (event.key === 'Enter' && open && filtered[0]) {
              event.preventDefault()
              onSelect(filtered[0])
              setOpen(false)
            } else if (event.key === 'Enter' && open && typed) {
              event.preventDefault()
              onManual(typed)
              setOpen(false)
            }
          }} />
      </label>
      {open && (filtered.length > 0 || typed) && (
        <ul className="location-combobox__list" role="listbox">
          {filtered.map((item) => (
            <li key={item.code || item.name} role="option" aria-selected={item.name === value}>
              <button type="button" onMouseDown={(event) => event.preventDefault()}
                onClick={() => { onSelect(item); setOpen(false) }}>{item.label || item.name}</button>
            </li>
          ))}
          {typed && !exactMatch && (
            <li role="option"><button type="button" onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onManual(typed); setOpen(false) }}>Use “{typed}”</button></li>
          )}
          <li role="option"><button type="button" onMouseDown={(event) => event.preventDefault()}
            onClick={() => { onManual(typed); setOpen(false) }}>Can’t find it? Type it manually</button></li>
        </ul>
      )}
    </div>
  )
}

export default function PropertyLocationPicker({ address, city, barangay: savedBarangay = '', latitude, longitude, onChange }) {
  const mapHost = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const reverseTimerRef = useRef(null)
  const reverseSequenceRef = useRef(0)
  const [point, setPoint] = useState(() => parsePoint(latitude, longitude))
  const [search, setSearch] = useState([address, city].filter(Boolean).join(', '))
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [cities, setCities] = useState([])
  const [barangays, setBarangays] = useState([])
  const [selectedCity, setSelectedCity] = useState(null)
  const [barangay, setBarangay] = useState(savedBarangay)
  const [cityManual, setCityManual] = useState(false)
  const [barangayManual, setBarangayManual] = useState(false)
  const [loadingCities, setLoadingCities] = useState(true)
  const [loadingBarangays, setLoadingBarangays] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [geoError, setGeoError] = useState('')

  useEffect(() => {
    let active = true
    loadCities().then((data) => {
      if (active) setCities(data.map((item) => ({
        ...item,
        name: item.name,
        label: [item.name, item.provinceName].filter(Boolean).join(', '),
      })))
    }).catch(() => {
      if (active) setPlaceError('Official city list could not be loaded. You can still type a city manually.')
    }).finally(() => { if (active) setLoadingCities(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!cities.length) return
    const match = findPlace(cities, city)
    setSelectedCity(match || null)
    setCityManual(!!city && !match)
  }, [city, cities])

  useEffect(() => {
    if (!selectedCity?.code) {
      setBarangays([])
      setLoadingBarangays(false)
      return undefined
    }
    let active = true
    setLoadingBarangays(true)
    loadBarangays(selectedCity.code).then((data) => {
      if (active) setBarangays(data.map((item) => ({ ...item, name: item.name })))
    }).catch(() => {
      if (active) {
        setBarangays([])
        setPlaceError('Official barangay list is unavailable. You can type a barangay manually.')
      }
    }).finally(() => { if (active) setLoadingBarangays(false) })
    return () => { active = false }
  }, [selectedCity])

  useEffect(() => {
    if (!savedBarangay) {
      setBarangay('')
      setBarangayManual(cityManual)
      return
    }
    setBarangay(savedBarangay)
    if (cityManual) {
      setBarangayManual(true)
      return
    }
    if (barangays.length) setBarangayManual(!findPlace(barangays, savedBarangay))
  }, [savedBarangay, cityManual, barangays])

  useEffect(() => {
    const initial = parsePoint(latitude, longitude)
    const center = initial || manila
    const map = L.map(mapHost.current, { scrollWheelZoom: false }).setView(center, initial ? 15 : 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)
    const marker = initial ? L.marker(center, { draggable: true }).addTo(map) : null
    marker?.on('dragend', () => setLocation(marker.getLatLng().lat, marker.getLatLng().lng))
    map.on('click', (event) => setLocation(event.latlng.lat, event.latlng.lng))
    mapRef.current = map
    markerRef.current = marker
    window.setTimeout(() => map.invalidateSize(), 0)
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current)
    }
    // Map is initialized once; later external coordinate changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const next = parsePoint(latitude, longitude)
    setPoint(next)
    if (next && mapRef.current) {
      if (!markerRef.current) {
        markerRef.current = L.marker(next, { draggable: true }).addTo(mapRef.current)
        markerRef.current.on('dragend', () => setLocation(markerRef.current.getLatLng().lat, markerRef.current.getLatLng().lng))
      } else markerRef.current.setLatLng(next)
      mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 15))
    }
  }, [latitude, longitude])

  function setLocation(lat, lng, place, reverse = true) {
    const next = [lat, lng]
    setPoint(next)
    if (!markerRef.current && mapRef.current) {
      markerRef.current = L.marker(next, { draggable: true }).addTo(mapRef.current)
      markerRef.current.on('dragend', () => setLocation(markerRef.current.getLatLng().lat, markerRef.current.getLatLng().lng))
    } else if (markerRef.current) markerRef.current.setLatLng(next)
    onChange({
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      ...(place || {}),
    })
    if (reverse) {
      if (reverseTimerRef.current) window.clearTimeout(reverseTimerRef.current)
      const sequence = ++reverseSequenceRef.current
      reverseTimerRef.current = window.setTimeout(() => reverseGeocode(lat, lng, sequence), 700)
    }
  }

  async function applyReverseLocality(details) {
    const cityMatch = findPlace(cities, details.city)
    if (!cityMatch) return
    setSelectedCity(cityMatch)
    setCityManual(false)
    onChange({ city: cityMatch.name })
    if (!details.barangay) return
    try {
      const options = (await loadBarangays(cityMatch.code)).map((item) => ({ ...item, name: item.name }))
      const barangayMatch = findPlace(options, details.barangay)
      if (barangayMatch) {
        setBarangay(barangayMatch.name)
        setBarangayManual(false)
        onChange({ barangay: barangayMatch.name })
      }
    } catch {
      // Keep the user's existing barangay when the official list is unavailable.
    }
  }

  async function reverseGeocode(lat, lng, sequence) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18', 'accept-language': 'en' })
      const result = await nominatim(url)
      if (sequence !== reverseSequenceRef.current) return
      await applyReverseLocality(locality(result.address))
    } catch {
      setSearchError('Could not identify the pin location. Choose or type the city and barangay manually.')
    }
  }

  async function recenterToPlace(query) {
    if (point) return
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.search = new URLSearchParams({ q: `${query}, Philippines`, format: 'jsonv2', limit: '1', 'accept-language': 'en' })
    try {
      const [result] = await nominatim(url)
      if (result && mapRef.current) mapRef.current.setView([Number(result.lat), Number(result.lon)], 13)
    } catch {
      setPlaceError('Could not locate that area on the map. You can still set the pin manually.')
    }
  }

  async function searchAddress(event) {
    event.preventDefault()
    const query = search.trim()
    if (!query) return
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '5', 'accept-language': 'en' })
      const matches = await nominatim(url)
      setResults(matches)
      if (matches.length === 0) setSearchError('No matching address found. You can still set the pin manually.')
    } catch (error) {
      setSearchError(error.message || 'Could not search for that address.')
    } finally { setSearching(false) }
  }

  function selectResult(result) {
    const details = locality(result.address)
    setSearch(result.display_name)
    setResults([])
    reverseSequenceRef.current += 1
    setLocation(Number(result.lat), Number(result.lon), details.address ? { address: details.address } : {}, false)
    applyReverseLocality(details)
    mapRef.current?.setView([Number(result.lat), Number(result.lon)], 16)
  }

  function selectCity(item) {
    reverseSequenceRef.current += 1
    setSelectedCity(item)
    setCityManual(false)
    setBarangay('')
    setBarangayManual(false)
    onChange({ city: item.name, barangay: '' })
    if (barangay) {
      setBarangay('')
    }
    recenterToPlace([item.name, item.provinceName].filter(Boolean).join(', '))
  }

  function selectManualCity(value) {
    reverseSequenceRef.current += 1
    setSelectedCity(null)
    setCityManual(true)
    setBarangay('')
    setBarangayManual(true)
    onChange({ city: value, barangay: '' })
  }

  function selectBarangay(item) {
    reverseSequenceRef.current += 1
    setBarangay(item.name)
    setBarangayManual(false)
    onChange({ barangay: item.name })
    recenterToPlace([item.name, selectedCity?.name, selectedCity?.provinceName].filter(Boolean).join(', '))
  }

  function locateMe() {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError('Location is not supported by this browser. You can move the pin manually.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation(coords.latitude, coords.longitude)
        mapRef.current?.setView([coords.latitude, coords.longitude], 16)
      },
      () => setGeoError('Could not access your location. Check permission or move the pin manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  const cityOptions = cities
  const barangayOptions = barangays

  return (
    <section className="property-location" aria-label="Property location">
      <div className="property-location__heading">
        <div><strong>Property location</strong><p className="field__hint">Search an address or move the pin. You can also type locations manually.</p></div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={locateMe}>◎ Use my location</button>
      </div>
      <form className="property-location__search" onSubmit={searchAddress}>
        <input aria-label="Search address" type="text" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Search street, building, or landmark" />
        <button type="submit" className="btn btn--accent" disabled={searching || !search.trim()}>{searching ? 'Searching…' : 'Search'}</button>
      </form>
      {searchError && <p className="field__hint property-location__notice" role="status">{searchError}</p>}
      {results.length > 0 && (
        <ul className="property-location__results" aria-label="Address search results">
          {results.map((result) => (
            <li key={result.place_id}><button type="button" onClick={() => selectResult(result)}>{result.display_name}</button></li>
          ))}
        </ul>
      )}
      <div className="property-location__map" ref={mapHost} aria-label="Interactive property map" />
      <p className="field__hint">Click the map or drag the pin to set the exact property location.</p>
      {geoError && <p className="field__hint property-location__notice" role="status">{geoError}</p>}
      <div className="two property-location__places">
        <SearchablePlace label="City / municipality" value={city} options={cityOptions}
          onChange={(value) => onChange({ city: value })}
          onSelect={selectCity} onManual={selectManualCity}
          onBackToList={() => { setCityManual(false); setSelectedCity(null); onChange({ city: '', barangay: '' }); setBarangay(''); setBarangayManual(false) }}
          manual={cityManual} placeholder="Type or select a city" loading={loadingCities} />
        <SearchablePlace label="Barangay" value={barangay} options={barangayOptions}
          onChange={(value) => { setBarangay(value); onChange({ barangay: value }) }}
          onSelect={selectBarangay} onManual={(value) => { setBarangay(value); setBarangayManual(true); onChange({ barangay: value }) }}
          onBackToList={selectedCity ? () => { setBarangayManual(false); setBarangay(''); onChange({ barangay: '' }) } : null}
          manual={cityManual || barangayManual || !selectedCity} placeholder={selectedCity ? 'Type or select a barangay' : 'Type a barangay'} loading={loadingBarangays} />
      </div>
      {placeError && <p className="field__hint property-location__notice" role="status">{placeError}</p>}
      <div className="property-location__coordinates" aria-live="polite">
        <span><strong>Latitude</strong> {point ? point[0].toFixed(6) : 'Not selected'}</span>
        <span><strong>Longitude</strong> {point ? point[1].toFixed(6) : 'Not selected'}</span>
      </div>
    </section>
  )
}
