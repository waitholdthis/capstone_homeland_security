import { Link, useLocation } from 'react-router-dom'
import { useIncidents } from '../../context/IncidentContext'
import StatusIndicator from '../shared/StatusIndicator'

const SCENARIO_COLORS = {
  cbrn: 'amber',
  terrorism: 'blue',
  natural_disaster: 'green',
}

const SCENARIO_LABELS = {
  cbrn: 'CBRN',
  terrorism: 'CT',
  natural_disaster: 'NATDIS',
}

export default function Sidebar() {
  const { state } = useIncidents()
  const location = useLocation()
  const activeIncidents = state.incidents.filter((i) => i.status === 'active')
  const completedIncidents = state.incidents.filter((i) => i.status === 'completed')

  return (
    <aside className="w-60 bg-surface-alt border-r border-line flex flex-col overflow-y-auto shrink-0">
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Active Incidents</h3>
          {activeIncidents.length > 0 && (
            <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">{activeIncidents.length}</span>
          )}
        </div>
        {activeIncidents.length === 0 ? (
          <p className="text-[11px] text-faint italic pl-1">No active incidents</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeIncidents.map((incident) => {
              const isActive = location.pathname === `/console/${incident.id}`
              return (
                <Link
                  key={incident.id}
                  to={`/console/${incident.id}`}
                  className={`block rounded-lg p-2.5 border transition-colors no-underline ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/30'
                      : 'bg-surface-inset border-line hover:border-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusIndicator color={SCENARIO_COLORS[incident.scenarioType] || 'cyan'} pulse />
                    <span className="text-xs font-medium text-body truncate">{incident.name}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-[9px] font-mono text-muted">{SCENARIO_LABELS[incident.scenarioType] || incident.scenarioType}</span>
                    <span className="text-[9px] text-faint">|</span>
                    <span className="text-[9px] text-muted font-mono">{incident.decisions.length} decisions</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="h-px bg-line mx-4" />

      {completedIncidents.length > 0 && (
        <>
          <div className="p-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Completed</h3>
              <span className="text-[9px] font-mono text-faint">{completedIncidents.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {completedIncidents.slice(0, 5).map((incident) => (
                <Link
                  key={incident.id}
                  to={`/review/${incident.id}`}
                  className="block bg-surface-inset rounded-lg p-2.5 border border-line hover:border-secondary transition-colors no-underline"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusIndicator color="slate" />
                    <span className="text-xs text-secondary truncate">{incident.name}</span>
                  </div>
                  <span className="text-[9px] text-faint font-mono pl-4">{SCENARIO_LABELS[incident.scenarioType]}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="h-px bg-line mx-4" />
        </>
      )}

      <div className="p-4 pb-3">
        <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">Reference</h3>
        <Link
          to="/doctrine"
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors no-underline text-xs font-medium ${
            location.pathname === '/doctrine'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-secondary hover:text-emerald-400 hover:bg-emerald-500/5 border border-transparent'
          }`}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          Doctrine Library
        </Link>
        <Link
          to="/map"
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors no-underline text-xs font-medium mt-1.5 ${
            location.pathname === '/map'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
              : 'text-secondary hover:text-cyan-400 hover:bg-cyan-500/5 border border-transparent'
          }`}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
          Incident Map
        </Link>
      </div>

      <div className="mt-auto p-4 border-t border-line">
        <div className="text-[9px] text-faint space-y-0.5 font-mono">
          <p className="text-muted font-semibold">AEGIS v1.0</p>
          <p>ALL OUTPUTS ADVISORY ONLY</p>
          <p>HUMAN AUTHORITY REQUIRED</p>
        </div>
      </div>
    </aside>
  )
}
