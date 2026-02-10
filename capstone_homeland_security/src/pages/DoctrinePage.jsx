import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DOCTRINE_REFERENCES, DOCTRINE_COMPLIANCE_CHECKLIST } from '../data/doctrine'
import { DECISION_CATEGORIES } from '../data/decisionCategories'

const SCENARIO_TABS = [
  { key: 'cbrn', label: 'CBRN', icon: '☢', fullName: 'Chemical, Biological, Radiological, Nuclear', color: 'amber' },
  { key: 'terrorism', label: 'Terrorism', icon: '🛡', fullName: 'Counter-Terrorism Response', color: 'blue' },
  { key: 'natural_disaster', label: 'Natural Disaster', icon: '🌊', fullName: 'Natural Disaster Response', color: 'green' },
]

const TAB_COLORS = {
  amber: { active: 'bg-amber-500/20 text-amber-400 border-amber-500/50', hover: 'hover:bg-amber-500/10 hover:text-amber-400' },
  blue: { active: 'bg-blue-500/20 text-blue-400 border-blue-500/50', hover: 'hover:bg-blue-500/10 hover:text-blue-400' },
  green: { active: 'bg-green-500/20 text-green-400 border-green-500/50', hover: 'hover:bg-green-500/10 hover:text-green-400' },
}

// Collect all unique doctrines across all categories for a given scenario
function getUniqueDoctrines(scenarioKey) {
  const seen = new Map()
  for (const catId of Object.keys(DOCTRINE_REFERENCES)) {
    const refs = DOCTRINE_REFERENCES[catId]?.[scenarioKey] || []
    for (const ref of refs) {
      if (!seen.has(ref.doctrine)) {
        seen.set(ref.doctrine, [])
      }
      seen.get(ref.doctrine).push({ ...ref, categoryId: catId })
    }
  }
  return seen
}

export default function DoctrinePage() {
  const [activeTab, setActiveTab] = useState('cbrn')
  const activeScenario = SCENARIO_TABS.find((t) => t.key === activeTab)
  const doctrineMap = getUniqueDoctrines(activeTab)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link to="/" className="text-xs text-slate-500 hover:text-cyan-400 no-underline">Dashboard</Link>
          <span className="text-xs text-slate-700">/</span>
          <span className="text-xs text-slate-400">Doctrine Reference</span>
        </div>
        <h1 className="text-xl font-bold text-slate-100">Doctrine Reference Library</h1>
        <p className="text-sm text-slate-400 mt-1">
          Real homeland security doctrine mapped to AEGIS decision categories by scenario type
        </p>
      </div>

      {/* Scenario Tabs */}
      <div className="flex gap-2">
        {SCENARIO_TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const colors = TAB_COLORS[tab.color]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                isActive
                  ? colors.active
                  : `bg-transparent border-slate-700 text-slate-400 ${colors.hover}`
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Scenario Description */}
      <div className={`rounded-xl border p-4 ${
        activeScenario.color === 'amber' ? 'border-amber-500/20 bg-amber-500/5' :
        activeScenario.color === 'blue' ? 'border-blue-500/20 bg-blue-500/5' :
        'border-green-500/20 bg-green-500/5'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{activeScenario.icon}</span>
          <div>
            <h2 className={`text-sm font-bold ${
              activeScenario.color === 'amber' ? 'text-amber-400' :
              activeScenario.color === 'blue' ? 'text-blue-400' :
              'text-green-400'
            }`}>{activeScenario.fullName}</h2>
            <p className="text-xs text-slate-400">
              {doctrineMap.size} doctrine sources referenced across {Object.keys(DECISION_CATEGORIES).length} decision categories
            </p>
          </div>
        </div>
      </div>

      {/* Doctrine by Category */}
      {Object.entries(DECISION_CATEGORIES).map(([catId, cat]) => {
        const refs = DOCTRINE_REFERENCES[catId]?.[activeTab] || []
        if (refs.length === 0) return null

        return (
          <section key={catId} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">{cat.icon}</span>
              <h2 className="text-sm font-bold text-slate-200">{cat.title}</h2>
              <span className="text-[10px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full font-mono">
                {refs.length} references
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {refs.map((ref) => (
                <div key={ref.id} className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded shrink-0 mt-0.5">
                      {ref.doctrine}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-emerald-300/70 mb-1">{ref.citation}</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{ref.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {/* Unique Doctrine Sources Summary */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-4">Doctrine Sources Summary</h2>
        <p className="text-xs text-slate-500 mb-3">
          All unique doctrine sources referenced for {activeScenario.fullName} scenarios
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[...doctrineMap.entries()].map(([doctrineName, refs]) => (
            <div key={doctrineName} className="bg-slate-800/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-emerald-400">{doctrineName}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {refs.length} {refs.length === 1 ? 'citation' : 'citations'}
                </span>
              </div>
              <div className="space-y-1">
                {refs.map((ref) => (
                  <div key={ref.id} className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-600">&#9656;</span>
                    <span className="text-slate-400">{DECISION_CATEGORIES[ref.categoryId]?.title}</span>
                    <span className="text-slate-600">—</span>
                    <span className="text-slate-500 truncate">{ref.citation}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Doctrine Compliance Checklist Preview */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-slate-300 mb-1">Doctrine Compliance Checklist</h2>
        <p className="text-xs text-slate-500 mb-4">
          These items are verified during incident operations in the Governance panel
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DOCTRINE_COMPLIANCE_CHECKLIST.map((check) => (
            <div key={check.id} className="flex items-start gap-2 bg-slate-800/30 rounded-lg p-3">
              <span className="text-slate-600 mt-0.5 shrink-0">○</span>
              <div>
                <p className="text-xs text-slate-300">{check.item}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{check.category} — {check.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
