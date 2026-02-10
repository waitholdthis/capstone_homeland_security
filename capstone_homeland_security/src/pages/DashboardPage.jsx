import { Link } from 'react-router-dom'
import { useIncidents } from '../context/IncidentContext'
import { GUIDING_PRINCIPLES, FRAMEWORK_LAYERS } from '../data/scenarios'
import DashboardStats from '../components/dashboard/DashboardStats'
import RiskBadge from '../components/shared/RiskBadge'
import StatusIndicator from '../components/shared/StatusIndicator'

const LAYER_COLORS = {
  cyan: 'border-cyan-500/30 bg-cyan-500/5',
  purple: 'border-purple-500/30 bg-purple-500/5',
  emerald: 'border-emerald-500/30 bg-emerald-500/5',
}

const LAYER_TEXT = {
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
}

const SCENARIO_COLORS = {
  cbrn: 'amber',
  terrorism: 'blue',
  natural_disaster: 'green',
}

export default function DashboardPage() {
  const { state } = useIncidents()
  const activeIncidents = state.incidents.filter((i) => i.status === 'active')

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Protection Decision Support Framework</h1>
          <p className="text-sm text-slate-400 mt-1">
            AI-Enabled Governance & Incident Support — Homeland Security Decision Framework
          </p>
        </div>
        <Link
          to="/incident/new"
          className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors no-underline"
        >
          + New Incident
        </Link>
      </div>

      <DashboardStats />

      {/* Guiding Principles */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Five Guiding Principles</h2>
        <div className="grid grid-cols-5 gap-3">
          {GUIDING_PRINCIPLES.map((p) => (
            <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
              <span className="text-2xl block mb-2">{p.icon}</span>
              <h3 className="text-xs font-semibold text-cyan-400 mb-1">{p.title}</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Framework Layers */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Framework Architecture</h2>
        <div className="grid grid-cols-3 gap-4">
          {FRAMEWORK_LAYERS.map((layer) => (
            <div key={layer.id} className={`rounded-xl border p-5 ${LAYER_COLORS[layer.color]}`}>
              <h3 className={`text-sm font-bold mb-2 ${LAYER_TEXT[layer.color]}`}>{layer.title}</h3>
              <p className="text-xs text-slate-400 mb-3">{layer.description}</p>
              <p className="text-[11px] text-slate-500">{layer.details}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Doctrine Reference Link */}
      <section>
        <Link
          to="/doctrine"
          className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 hover:border-emerald-500/40 transition-colors no-underline group"
        >
          <div className="flex items-center gap-4">
            <span className="text-2xl">📖</span>
            <div>
              <h3 className="text-sm font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">Doctrine Reference Library</h3>
              <p className="text-xs text-slate-400">
                Browse NIMS, NRF, ICS, HSPD-5, PPD-8, EPA PAGs, FBI CONOPS, Stafford Act and more — mapped to each scenario type
              </p>
            </div>
          </div>
          <span className="text-emerald-500/50 text-lg group-hover:text-emerald-400 transition-colors">→</span>
        </Link>
      </section>

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Active Incidents</h2>
          <div className="space-y-3">
            {activeIncidents.map((incident) => (
              <Link
                key={incident.id}
                to={`/console/${incident.id}`}
                className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-cyan-500/30 transition-colors no-underline"
              >
                <div className="flex items-center gap-4">
                  <StatusIndicator color={SCENARIO_COLORS[incident.scenarioType]} pulse size="lg" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">{incident.name}</h3>
                    <p className="text-xs text-slate-500">
                      {incident.scenarioType.replace('_', ' ').toUpperCase()} — {incident.location} — {incident.decisions.length} decisions recorded
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <RiskBadge score={incident.severity === 'critical' ? 90 : incident.severity === 'high' ? 72 : incident.severity === 'moderate' ? 48 : 25} />
                  <span className="text-xs text-slate-500">{new Date(incident.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {state.incidents.length === 0 && (
        <div className="text-center py-16 bg-slate-900/30 border border-slate-800 border-dashed rounded-xl">
          <p className="text-slate-500 mb-4">No incidents have been created yet.</p>
          <Link
            to="/incident/new"
            className="inline-block px-6 py-2.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-colors no-underline"
          >
            Create Your First Incident
          </Link>
        </div>
      )}
    </div>
  )
}
