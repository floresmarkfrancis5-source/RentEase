import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { useLanguage } from '../context/LanguageContext'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const PHILIPPINES_CENTER = [12.8797, 121.774]

function validPoint(property) {
  const lat = Number(property.latitude)
  const lng = Number(property.longitude)
  return property.latitude !== null && property.latitude !== '' &&
    property.longitude !== null && property.longitude !== '' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function popupContent(property, onViewUnits, onEdit, t) {
  const content = document.createElement('div')
  content.className = 'property-map__popup'

  const title = document.createElement('strong')
  title.textContent = property.name
  content.appendChild(title)

  const address = [property.address, property.barangay, property.city].filter(Boolean).join(', ')
  if (address) {
    const location = document.createElement('span')
    location.textContent = address
    content.appendChild(location)
  }

  const occupied = Number(property.occupied_count || 0)
  const total = Number(property.units_count || 0)
  const units = document.createElement('span')
  units.textContent = `${occupied} ${t('occupied')} · ${Math.max(0, total - occupied)} ${t('vacant')} · ${total} ${t('units')}`
  content.appendChild(units)

  const actions = document.createElement('div')
  actions.className = 'property-map__popup-actions'
  const viewButton = document.createElement('button')
  viewButton.type = 'button'
  viewButton.textContent = t('View units')
  viewButton.addEventListener('click', () => onViewUnits(property))
  actions.appendChild(viewButton)

  const editButton = document.createElement('button')
  editButton.type = 'button'
  editButton.textContent = t('Edit location')
  editButton.addEventListener('click', () => onEdit(property))
  actions.appendChild(editButton)
  content.appendChild(actions)
  return content
}

export default function PropertyPortfolioMap({ properties, onViewUnits, onEdit }) {
  const { t } = useLanguage()
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const located = useMemo(() => properties.filter(validPoint), [properties])

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return undefined

    const map = L.map(hostRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      keyboard: true,
    }).setView(PHILIPPINES_CENTER, 5)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const markers = L.featureGroup()

    located.forEach((property) => {
      const marker = L.marker([Number(property.latitude), Number(property.longitude)], {
        title: property.name,
        alt: `${property.name}, ${[property.address, property.city].filter(Boolean).join(', ')}`,
        keyboard: true,
        icon: L.divIcon({
          className: 'property-map__marker-host',
          html: '<span class="property-map__marker" aria-hidden="true"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -26],
        }),
      })
      marker.bindPopup(popupContent(property, onViewUnits, onEdit, t), { minWidth: 210 })
      marker.addTo(markers)
    })
    markers.addTo(map)

    if (located.length === 1) {
      map.setView(markers.getBounds().getCenter(), 14)
    } else if (located.length > 1) {
      map.fitBounds(markers.getBounds(), { padding: [36, 36], maxZoom: 14 })
    } else {
      map.setView(PHILIPPINES_CENTER, 5)
    }
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0)
    return () => {
      window.clearTimeout(resizeTimer)
      markers.remove()
    }
  }, [located, onViewUnits, onEdit, t])

  return (
    <section className="property-portfolio-map" aria-labelledby="property-map-title">
      <div className="property-portfolio-map__head">
        <div>
          <h2 id="property-map-title">{t('Portfolio map')}</h2>
          <p>{t('Explore all properties with saved map locations.')}</p>
        </div>
        <span className="property-portfolio-map__coverage">
          {located.length} {t('of')} {properties.length} {t('located')}
        </span>
      </div>
      <div className="property-portfolio-map__canvas" ref={hostRef} role="application" aria-label={t('Map of your properties')} />
      {located.length === 0 ? (
        <p className="property-portfolio-map__note">{t('No properties have saved map coordinates yet. Edit a property to set its location.')}</p>
      ) : located.length < properties.length ? (
        <div className="property-portfolio-map__missing">
          <span>{t('Some properties are missing map locations:')}</span>
          {properties.filter((property) => !validPoint(property)).map((property) => (
            <button type="button" key={property.id} onClick={() => onEdit(property)}>{property.name} · {t('Add location')}</button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
