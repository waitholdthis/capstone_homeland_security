import { Link } from 'react-router-dom'
import { useIncidents } from '../context/IncidentContext'
import IncidentMap from '../components/map/IncidentMap'

const SCENARIO_LABELS = {
  cbrn: 'CBRN',
  terrorism: 'CT',
  natural_disaster: 'NATDIS',
}

const SCENARIO_BADGE_STYLES = {
  cbrn: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  terrorism: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  natural_disaster: 'bg-green-400/10 text-green-400 border-green-400/20',
}

export default function MapPage() {
  const { state } = useIncidents()
  const allIncidents = state.incidents
  const mappable = allIncidents.filter((i) => i.coordinates)
  const unmappedCount = allIncidents.length - mappable.length

  // Count by scenario type (mappable only)
  const typeCounts = mappable.reduce((acc, i) => {
    acc[i.scenarioType] = (acc[i.scenarioType] || 0) + 1
    return acc
  }, {})

  if (allIncidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <svg className="w-12 h-12 text-faint mb-4" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <p className="text-secondary text-sm mb-1">No incidents to display</p>
        <p className="text-faint text-xs mb-4">Create an incident to see it on the map with ERG hazard zones.</p>
        <Link to="/incident/new" className="text-cyan-400 text-xs hover:underline font-medium">
          + Create Incident
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="bg-surface-alt border-b border-line px-5 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-muted font-mono">
            <Link to="/" className="hover:text-cyan-400 transition-colors no-underline text-muted">Dashboard</Link>
            <span>/</span>
            <span className="text-secondary">Incident Map</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span key={type} className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${SCENARIO_BADGE_STYLES[type] || ''}`}>
              {count} {SCENARIO_LABELS[type] || type}
            </span>
          ))}
          <span className="text-[9px] font-mono text-muted ml-1">
            {mappable.length} mapped
          </span>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <IncidentMap incidents={allIncidents} />
      </div>

      {/* Unmapped warning */}
      {unmappedCount > 0 && (
        <div className="bg-surface-alt border-t border-line px-5 py-2 flex items-center gap-2 shrink-0">
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-[10px] text-amber-400/80 font-mono">
            {unmappedCount} incident{unmappedCount > 1 ? 's' : ''} without coordinates — not shown on map.
            Incidents created before map feature or with unresolvable addresses will not appear.
          </span>
        </div>
      )}
    </div>
  )
}
