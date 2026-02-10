import { Link } from 'react-router-dom'
import { useIncidents } from '../../context/IncidentContext'
import StatusIndicator from '../shared/StatusIndicator'

const SCENARIO_COLORS = {
  cbrn: 'amber',
  terrorism: 'blue',
  natural_disaster: 'green',
}

export default function Sidebar() {
  const { state } = useIncidents()
  const activeIncidents = state.incidents.filter((i) => i.status === 'active')
  const completedIncidents = state.incidents.filter((i) => i.status === 'completed')

  return (
    <aside className="w-64 bg-slate-900/50 border-r border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto shrink-0">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Active Incidents</h3>
        {activeIncidents.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No active incidents</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeIncidents.map((incident) => (
              <Link
                key={incident.id}
                to={`/console/${incident.id}`}
                className="block bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 hover:border-cyan-500/30 transition-colors no-underline"
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusIndicator color={SCENARIO_COLORS[incident.scenarioType] || 'cyan'} pulse />
                  <span className="text-sm font-medium text-slate-200 truncate">{incident.name}</span>
                </div>
                <span className="text-xs text-slate-500 capitalize">{incident.scenarioType.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {completedIncidents.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Completed</h3>
          <div className="flex flex-col gap-2">
            {completedIncidents.slice(0, 5).map((incident) => (
              <Link
                key={incident.id}
                to={`/review/${incident.id}`}
                className="block bg-slate-800/30 rounded-lg p-3 border border-slate-800 hover:border-slate-600 transition-colors no-underline"
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusIndicator color="slate" />
                  <span className="text-sm text-slate-400 truncate">{incident.name}</span>
                </div>
                <span className="text-xs text-slate-600 capitalize">{incident.scenarioType.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-slate-800">
        <Link
          to="/doctrine"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors no-underline text-xs font-medium"
        >
          <span>📖</span>
          <span>Doctrine Reference</span>
        </Link>
      </div>

      <div className="mt-auto pt-4 border-t border-slate-800">
        <div className="text-[10px] text-slate-600 space-y-1">
          <p>AEGIS Framework v1.0</p>
          <p>All AI outputs are ADVISORY only</p>
          <p>Human authority required for all decisions</p>
        </div>
      </div>
    </aside>
  )
}
