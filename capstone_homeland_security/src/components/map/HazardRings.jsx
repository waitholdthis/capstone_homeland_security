import { Circle, Tooltip } from 'react-leaflet'
import { HAZARD_ZONES } from '../../data/hazardZones'

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters} m`
}

export default function HazardRings({ incident }) {
  const zone = HAZARD_ZONES[incident.scenarioType]
  if (!zone || !incident.coordinates) return null

  const distances = zone.distances[incident.severity] || zone.distances.high
  const center = incident.coordinates

  // Render outermost ring first so inner rings paint on top
  return (
    <>
      {[...distances].reverse().map((radius, reverseIdx) => {
        const idx = distances.length - 1 - reverseIdx
        const ring = zone.rings[idx]
        const isOuter = idx === distances.length - 1
        return (
          <Circle
            key={ring.key}
            center={center}
            radius={radius}
            pathOptions={{
              color: zone.colors[idx],
              fillColor: zone.colors[idx],
              fillOpacity: zone.opacities[idx],
              weight: isOuter ? 1.5 : 2,
              dashArray: isOuter ? '6 4' : undefined,
            }}
          >
            <Tooltip sticky>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                {ring.label}: {formatDistance(radius)}
              </span>
            </Tooltip>
          </Circle>
        )
      })}
    </>
  )
}
