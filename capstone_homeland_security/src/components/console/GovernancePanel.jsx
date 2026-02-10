import { CIVIL_LIBERTIES_CHECKLIST, INTERAGENCY_PARTNERS } from '../../data/decisionCategories'
import { DOCTRINE_COMPLIANCE_CHECKLIST } from '../../data/doctrine'
import { useIncidents } from '../../context/IncidentContext'

const COORD_STATUSES = ['not-contacted', 'notified', 'coordinating', 'on-scene']
const COORD_LABELS = {
  'not-contacted': 'Not Contacted',
  'notified': 'Notified',
  'coordinating': 'Coordinating',
  'on-scene': 'On Scene',
}
const COORD_COLORS = {
  'not-contacted': 'text-slate-500 bg-slate-800',
  'notified': 'text-amber-400 bg-amber-400/10',
  'coordinating': 'text-blue-400 bg-blue-400/10',
  'on-scene': 'text-green-400 bg-green-400/10',
}

export default function GovernancePanel({ incident }) {
  const { dispatch } = useIncidents()
  const partners = INTERAGENCY_PARTNERS[incident.scenarioType] || []
  const completedChecks = Object.values(incident.civilLiberties).filter(Boolean).length
  const totalChecks = CIVIL_LIBERTIES_CHECKLIST.length

  const doctrineCompliance = incident.doctrineCompliance || {}
  const completedDoctrineChecks = Object.values(doctrineCompliance).filter(Boolean).length
  const totalDoctrineChecks = DOCTRINE_COMPLIANCE_CHECKLIST.length

  function handleCheckChange(checkId, checked) {
    dispatch({
      type: 'UPDATE_CIVIL_LIBERTIES',
      payload: { incidentId: incident.id, checklistId: checkId, checked },
    })
  }

  function handleDoctrineCheckChange(checkId, checked) {
    dispatch({
      type: 'UPDATE_DOCTRINE_COMPLIANCE',
      payload: { incidentId: incident.id, checklistId: checkId, checked },
    })
  }

  function handleAgencyStatusChange(agencyId, status) {
    dispatch({
      type: 'UPDATE_AGENCY_COORDINATION',
      payload: { incidentId: incident.id, agencyId, status },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-5 bg-emerald-500 rounded-full" />
        <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Governance & Oversight</h2>
      </div>

      {/* Decision Log */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">
          Decision Log ({incident.decisions.length})
        </h3>
        {incident.decisions.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No decisions recorded yet</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...incident.decisions].reverse().map((d) => (
              <div key={d.id} className="bg-slate-800/40 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-cyan-400 font-semibold">{d.category}</span>
                  <span className="text-[9px] text-slate-600 font-mono">{new Date(d.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-slate-200">{d.summary}</p>
                {d.rationale && <p className="text-[11px] text-slate-500 mt-0.5">{d.rationale}</p>}
                <p className="text-[10px] text-slate-600 mt-1">Authorized by: {d.authorizedBy}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Civil Liberties Checklist */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-400">Civil Liberties Checklist</h3>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            completedChecks === totalChecks
              ? 'bg-green-400/20 text-green-400'
              : 'bg-amber-400/20 text-amber-400'
          }`}>
            {completedChecks}/{totalChecks}
          </span>
        </div>
        <div className="space-y-1.5">
          {CIVIL_LIBERTIES_CHECKLIST.map((check) => (
            <label
              key={check.id}
              className="flex items-start gap-2 cursor-pointer group"
              title={check.description}
            >
              <input
                type="checkbox"
                checked={!!incident.civilLiberties[check.id]}
                onChange={(e) => handleCheckChange(check.id, e.target.checked)}
                className="mt-0.5 accent-emerald-500 shrink-0"
              />
              <div>
                <span className={`text-xs transition-colors ${
                  incident.civilLiberties[check.id] ? 'text-slate-400 line-through' : 'text-slate-300'
                }`}>
                  {check.item}
                </span>
                <span className="block text-[9px] text-slate-600">{check.category}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Doctrine Compliance Checklist */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-400">Doctrine Compliance</h3>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            completedDoctrineChecks === totalDoctrineChecks
              ? 'bg-green-400/20 text-green-400'
              : 'bg-amber-400/20 text-amber-400'
          }`}>
            {completedDoctrineChecks}/{totalDoctrineChecks}
          </span>
        </div>
        <div className="space-y-1.5">
          {DOCTRINE_COMPLIANCE_CHECKLIST.map((check) => (
            <label
              key={check.id}
              className="flex items-start gap-2 cursor-pointer group"
              title={check.description}
            >
              <input
                type="checkbox"
                checked={!!doctrineCompliance[check.id]}
                onChange={(e) => handleDoctrineCheckChange(check.id, e.target.checked)}
                className="mt-0.5 accent-emerald-500 shrink-0"
              />
              <div>
                <span className={`text-xs transition-colors ${
                  doctrineCompliance[check.id] ? 'text-slate-400 line-through' : 'text-slate-300'
                }`}>
                  {check.item}
                </span>
                <span className="block text-[9px] text-slate-600">{check.category}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Interagency Coordination */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">Interagency Coordination</h3>
        <div className="space-y-2">
          {partners.map((partner) => {
            const currentStatus = incident.agencyCoordination[partner.id] || 'not-contacted'
            return (
              <div key={partner.id} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200">{partner.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{partner.role}</p>
                </div>
                <select
                  value={currentStatus}
                  onChange={(e) => handleAgencyStatusChange(partner.id, e.target.value)}
                  className={`text-[10px] font-semibold rounded px-2 py-1 border-0 cursor-pointer ${COORD_COLORS[currentStatus]} focus:outline-none`}
                >
                  {COORD_STATUSES.map((s) => (
                    <option key={s} value={s}>{COORD_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">
          Audit Trail ({incident.auditLog.length})
        </h3>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {[...incident.auditLog].reverse().map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-[11px]">
              <span className="text-slate-600 font-mono shrink-0 w-16">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="min-w-0">
                <span className="text-slate-400">{entry.action}</span>
                <span className="text-slate-600"> — {entry.details}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
