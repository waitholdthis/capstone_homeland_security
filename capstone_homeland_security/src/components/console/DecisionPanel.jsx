import { useState } from 'react'
import { DECISION_CATEGORIES } from '../../data/decisionCategories'
import { DOCTRINE_REFERENCES, DECISION_TEMPLATES } from '../../data/doctrine'
import { useIncidents } from '../../context/IncidentContext'

export default function DecisionPanel({ incident }) {
  const { dispatch } = useIncidents()
  const [expandedCategory, setExpandedCategory] = useState(null)
  const [recordingFor, setRecordingFor] = useState(null)
  const [decisionForm, setDecisionForm] = useState({ summary: '', rationale: '', authorizedBy: '' })
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const scenarioKey = incident.scenarioType

  function toggleCategory(catId) {
    setExpandedCategory((prev) => (prev === catId ? null : catId))
    setRecordingFor(null)
    setSelectedTemplate(null)
  }

  function handleRecord(catId) {
    if (!decisionForm.summary) return
    dispatch({
      type: 'RECORD_DECISION',
      payload: {
        incidentId: incident.id,
        decision: {
          category: DECISION_CATEGORIES[catId].title,
          categoryId: catId,
          summary: decisionForm.summary,
          rationale: decisionForm.rationale,
          authorizedBy: decisionForm.authorizedBy || 'Operator',
        },
      },
    })
    setDecisionForm({ summary: '', rationale: '', authorizedBy: '' })
    setRecordingFor(null)
    setSelectedTemplate(null)
  }

  function handleTemplateClick(template) {
    setSelectedTemplate(template.id)
    setDecisionForm((f) => ({
      ...f,
      summary: template.summary,
      rationale: template.rationale,
    }))
  }

  const categoryDecisionCounts = {}
  for (const d of incident.decisions) {
    categoryDecisionCounts[d.categoryId] = (categoryDecisionCounts[d.categoryId] || 0) + 1
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-5 bg-cyan-500 rounded-full" />
        <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Decision Definition</h2>
      </div>

      {Object.entries(DECISION_CATEGORIES).map(([catId, cat]) => {
        const scenarioData = cat.scenarios[scenarioKey]
        if (!scenarioData) return null
        const isExpanded = expandedCategory === catId
        const count = categoryDecisionCounts[catId] || 0
        const doctrineRefs = DOCTRINE_REFERENCES[catId]?.[scenarioKey] || []
        const templates = DECISION_TEMPLATES[catId]?.[scenarioKey] || []

        return (
          <div key={catId} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCategory(catId)}
              className="w-full flex items-center justify-between p-3 text-left cursor-pointer hover:bg-slate-800/50 transition-colors bg-transparent border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{cat.icon}</span>
                <span className="text-sm font-medium text-slate-200">{cat.title}</span>
                {count > 0 && (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-mono">{count}</span>
                )}
              </div>
              <span className={`text-slate-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-slate-800">
                <p className="text-xs text-slate-500 mt-2 mb-3">{cat.description}</p>

                {/* Key Questions */}
                <div className="mb-3">
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Key Decision Questions</h4>
                  <ul className="space-y-1.5">
                    {scenarioData.questions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="text-cyan-500 mt-0.5 shrink-0">&#9656;</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Info Requirements */}
                <div className="mb-3">
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Information Requirements</h4>
                  <ul className="space-y-1">
                    {scenarioData.infoRequirements.map((req, i) => (
                      <li key={i} className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-slate-600 rounded-full shrink-0" />
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Applicable Doctrine */}
                {doctrineRefs.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Applicable Doctrine</h4>
                    <div className="space-y-1.5">
                      {doctrineRefs.map((ref) => (
                        <div key={ref.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">{ref.doctrine}</span>
                            <span className="text-[10px] text-emerald-300/70 font-mono">{ref.citation}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{ref.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Past Decisions for this category */}
                {incident.decisions.filter((d) => d.categoryId === catId).length > 0 && (
                  <div className="mb-3 border-t border-slate-800 pt-2">
                    <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Recorded Decisions</h4>
                    {incident.decisions
                      .filter((d) => d.categoryId === catId)
                      .map((d) => (
                        <div key={d.id} className="bg-slate-800/40 rounded p-2 mb-1.5 text-xs">
                          <p className="text-slate-200 font-medium">{d.summary}</p>
                          {d.rationale && <p className="text-slate-500 mt-0.5">{d.rationale}</p>}
                          <p className="text-slate-600 text-[10px] mt-1">
                            By {d.authorizedBy} at {new Date(d.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                  </div>
                )}

                {/* Record Decision */}
                {recordingFor === catId ? (
                  <div className="border-t border-slate-800 pt-3 space-y-2">
                    {/* Doctrine-Based Templates */}
                    {templates.length > 0 && (
                      <div className="mb-2">
                        <h4 className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Doctrine-Based Templates</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {templates.map((tpl) => (
                            <button
                              key={tpl.id}
                              onClick={() => handleTemplateClick(tpl)}
                              className={`text-[10px] px-2 py-1 rounded border cursor-pointer transition-colors ${
                                selectedTemplate === tpl.id
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400'
                              }`}
                            >
                              {tpl.summary.length > 60 ? tpl.summary.slice(0, 57) + '...' : tpl.summary}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Decision summary *"
                      value={decisionForm.summary}
                      onChange={(e) => setDecisionForm((f) => ({ ...f, summary: e.target.value }))}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                    />
                    <textarea
                      placeholder="Rationale / justification"
                      value={decisionForm.rationale}
                      onChange={(e) => setDecisionForm((f) => ({ ...f, rationale: e.target.value }))}
                      rows={2}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
                    />
                    <input
                      type="text"
                      placeholder="Authorized by (name/role)"
                      value={decisionForm.authorizedBy}
                      onChange={(e) => setDecisionForm((f) => ({ ...f, authorizedBy: e.target.value }))}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRecord(catId)}
                        disabled={!decisionForm.summary}
                        className="px-3 py-1.5 bg-cyan-500 text-slate-950 text-xs font-semibold rounded cursor-pointer hover:bg-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-0"
                      >
                        Record Decision
                      </button>
                      <button
                        onClick={() => { setRecordingFor(null); setSelectedTemplate(null) }}
                        className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs rounded cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setRecordingFor(catId)}
                    className="w-full mt-1 px-3 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded text-xs font-medium cursor-pointer hover:bg-cyan-500/20 transition-colors"
                  >
                    + Record Decision
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
