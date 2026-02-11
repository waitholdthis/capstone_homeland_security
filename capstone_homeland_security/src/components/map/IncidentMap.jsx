import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import IncidentMarker from './IncidentMarker'
import HazardRings from './HazardRings'
import { HAZARD_ZONES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../data/hazardZones'

function FitBounds({ incidents }) {
  const map = useMap()

  useEffect(() => {
    if (incidents.length === 0) return
    const bounds = L.latLngBounds(incidents.map((i) => i.coordinates))
    map.fitBounds(bounds.pad(0.3), { maxZoom: 14 })
  }, [incidents, map])

  return null
}

function MapLegend({ activeTypes }) {
  if (activeTypes.length === 0) return null

  return (
    <div style={{
      position: 'absolute', bottom: 24, right: 12, zIndex: 1000,
      background: 'rgba(2,6,23,0.9)', border: '1px solid #1e293b',
      borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(8px)',
      maxWidth: 220,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: '0.1em',
        textTransform: 'uppercase', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace",
      }}>
        Hazard Zones
      </div>
      {activeTypes.map((type) => {
        const zone = HAZARD_ZONES[type]
        if (!zone) return null
        return (
          <div key={type} style={{ marginBottom: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#e2e8f0', marginBottom: 3,
            }}>
              {zone.label}
            </div>
            {zone.rings.map((ring, idx) => (
              <div key={ring.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: zone.colors[idx],
                  opacity: idx === zone.rings.length - 1 ? 0.4 : 0.7,
                  border: idx === zone.rings.length - 1 ? '1px dashed rgba(255,255,255,0.3)' : 'none',
                }} />
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                  {ring.label}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function IncidentMap({ incidents }) {
  const mappable = incidents.filter((i) => i.coordinates)
  const activeTypes = [...new Set(mappable.map((i) => i.scenarioType))]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {mappable.length > 0 && <FitBounds incidents={mappable} />}
        {mappable.map((incident) => (
          <HazardRings key={`zones-${incident.id}`} incident={incident} />
        ))}
        {mappable.map((incident) => (
          <IncidentMarker key={`marker-${incident.id}`} incident={incident} />
        ))}
      </MapContainer>
      <MapLegend activeTypes={activeTypes} />
    </div>
  )
}
