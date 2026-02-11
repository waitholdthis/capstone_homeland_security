import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { MARKER_COLORS } from '../../data/hazardZones'

const SCENARIO_LABELS = {
  cbrn: 'CBRN',
  terrorism: 'Terrorism',
  natural_disaster: 'Natural Disaster',
}

const SEVERITY_COLORS = {
  low: '#4ade80',
  moderate: '#facc15',
  high: '#fb923c',
  critical: '#f87171',
}

function createMarkerIcon(scenarioType) {
  const color = MARKER_COLORS[scenarioType] || '#06b6d4'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="6" fill="#0f172a" opacity="0.4"/>
    <circle cx="14" cy="14" r="4" fill="white"/>
  </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -42],
  })
}

export default function IncidentMarker({ incident }) {
  if (!incident.coordinates) return null

  const color = MARKER_COLORS[incident.scenarioType] || '#06b6d4'
  const sevColor = SEVERITY_COLORS[incident.severity] || '#fb923c'

  const popupStyle = {
    fontFamily: "'Inter', sans-serif",
    color: '#e2e8f0',
    lineHeight: 1.5,
  }

  return (
    <Marker position={incident.coordinates} icon={createMarkerIcon(incident.scenarioType)}>
      <Popup>
        <div style={{ ...popupStyle, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color }}>
            {incident.name}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
            {SCENARIO_LABELS[incident.scenarioType] || incident.scenarioType}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px',
              borderRadius: 4, border: `1px solid ${sevColor}33`,
              backgroundColor: `${sevColor}1a`, color: sevColor,
              fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase',
            }}>
              {incident.severity}
            </span>
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              backgroundColor: 'rgba(30,41,59,0.8)', color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {incident.decisions?.length || 0} decisions
            </span>
          </div>
          {incident.location && (
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              {incident.location}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <a
              href={incident.status === 'completed' ? `/review/${incident.id}` : `/console/${incident.id}`}
              style={{
                fontSize: 10, fontWeight: 600, color: '#22d3ee',
                textDecoration: 'none', padding: '3px 8px', borderRadius: 4,
                border: '1px solid rgba(34,211,238,0.2)', backgroundColor: 'rgba(34,211,238,0.08)',
              }}
            >
              {incident.status === 'completed' ? 'Review' : 'Open Console'}
            </a>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
