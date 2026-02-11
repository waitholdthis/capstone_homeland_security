import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIncidents } from '../context/IncidentContext'
import { SCENARIO_TYPES, SEVERITY_LEVELS } from '../data/scenarios'

const STEPS = ['Select Scenario', 'Enter Details', 'Confirm & Launch']

export default function NewIncidentPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    scenarioType: '',
    name: '',
    location: '',
    severity: 'high',
    description: '',
    specificData: {},
  })
  const { dispatch } = useIncidents()
  const navigate = useNavigate()

  const selectedScenario = Object.values(SCENARIO_TYPES).find((s) => s.id === form.scenarioType)

  function handleScenarioSelect(id) {
    setForm((f) => ({ ...f, scenarioType: id, specificData: {} }))
    setStep(1)
  }

  function handleFieldChange(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSpecificChange(key, value) {
    setForm((f) => ({ ...f, specificData: { ...f.specificData, [key]: value } }))
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  async function geocodeAddress(address) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
          q: address,
          format: 'json',
          limit: '1',
        })}`,
        { headers: { 'User-Agent': 'AEGIS-IncidentSupport/1.0' } }
      )
      const data = await response.json()
      if (data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
      }
    } catch { /* geocoding failed — non-blocking */ }
    return null
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    const id = crypto.randomUUID()
    const coordinates = await geocodeAddress(form.location)
    dispatch({
      type: 'CREATE_INCIDENT',
      payload: {
        id,
        scenarioType: form.scenarioType,
        name: form.name,
        location: form.location,
        severity: form.severity,
        description: form.description,
        specificData: form.specificData,
        coordinates,
      },
    })
    navigate(`/console/${id}`)
  }

  const scenarioColorMap = {
    cbrn: { border: 'border-amber-500/30 hover:border-amber-400/60', bg: 'bg-amber-500/5', text: 'text-amber-400', accent: 'border-l-amber-500' },
    terrorism: { border: 'border-blue-500/30 hover:border-blue-400/60', bg: 'bg-blue-500/5', text: 'text-blue-400', accent: 'border-l-blue-500' },
    natural_disaster: { border: 'border-green-500/30 hover:border-green-400/60', bg: 'bg-green-500/5', text: 'text-green-400', accent: 'border-l-green-500' },
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${
                  i <= step ? 'bg-cyan-500 text-slate-950' : 'bg-surface-inset text-muted'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-xs ${i <= step ? 'text-body font-semibold' : 'text-faint'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-12 h-px ${i < step ? 'bg-cyan-500' : 'bg-line'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Scenario */}
      {step === 0 && (
        <div>
          <h2 className="text-lg font-bold text-heading mb-1 tracking-tight">Select Scenario Type</h2>
          <p className="text-xs text-muted mb-6">Choose the type of incident to activate the appropriate decision framework.</p>
          <div className="grid grid-cols-3 gap-3">
            {Object.values(SCENARIO_TYPES).map((scenario) => {
              const colors = scenarioColorMap[scenario.id]
              return (
                <button
                  key={scenario.id}
                  onClick={() => handleScenarioSelect(scenario.id)}
                  className={`text-left p-5 rounded-lg border border-l-2 ${colors.border} ${colors.bg} ${colors.accent} cursor-pointer transition-all hover:scale-[1.01]`}
                >
                  <span className="text-2xl block mb-3">{scenario.icon}</span>
                  <h3 className={`text-sm font-bold mb-1 ${colors.text}`}>{scenario.label}</h3>
                  <p className="text-[10px] text-muted leading-relaxed">{scenario.description}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 2: Enter Details */}
      {step === 1 && selectedScenario && (
        <div>
          <h2 className="text-lg font-bold text-heading mb-1 tracking-tight">Incident Details</h2>
          <p className="text-xs text-muted mb-6">
            Configuring <span className={scenarioColorMap[form.scenarioType].text}>{selectedScenario.label}</span> incident parameters.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-secondary mb-1.5 uppercase tracking-wider">Incident Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="e.g., Downtown Chemical Release"
                className="w-full bg-surface-inset border border-line rounded-lg px-4 py-2.5 text-sm text-body placeholder:text-faint"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-secondary mb-1.5 uppercase tracking-wider">Location *</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => handleFieldChange('location', e.target.value)}
                  placeholder="e.g., 123 Main St, Denver, CO"
                  className="w-full bg-surface-inset border border-line rounded-lg px-4 py-2.5 text-sm text-body placeholder:text-faint"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-secondary mb-1.5 uppercase tracking-wider">Severity Level</label>
                <select
                  value={form.severity}
                  onChange={(e) => handleFieldChange('severity', e.target.value)}
                  className="w-full bg-surface-inset border border-line rounded-lg px-4 py-2.5 text-sm text-body"
                >
                  {Object.entries(SEVERITY_LEVELS).map(([key, level]) => (
                    <option key={key} value={key}>{level.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-secondary mb-1.5 uppercase tracking-wider">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                rows={3}
                placeholder="Brief description of the incident..."
                className="w-full bg-surface-inset border border-line rounded-lg px-4 py-2.5 text-sm text-body placeholder:text-faint resize-none"
              />
            </div>

            {/* Scenario-specific fields */}
            <div className="pt-3 border-t border-line-subtle">
              <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">
                {selectedScenario.label}-Specific Parameters
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {selectedScenario.specificFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] font-semibold text-secondary mb-1.5 uppercase tracking-wider">{field.label}</label>
                    <input
                      type="text"
                      value={form.specificData[field.key] || ''}
                      onChange={(e) => handleSpecificChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-surface-inset border border-line rounded-lg px-4 py-2.5 text-sm text-body placeholder:text-faint"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => setStep(0)}
              className="px-5 py-2 bg-surface-inset text-secondary border border-line rounded-lg text-xs cursor-pointer hover:bg-line transition-colors font-medium"
            >
              Back
            </button>
            <button
              onClick={() => form.name && form.location && setStep(2)}
              disabled={!form.name || !form.location}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Launch */}
      {step === 2 && selectedScenario && (
        <div>
          <h2 className="text-lg font-bold text-heading mb-1 tracking-tight">Confirm & Launch</h2>
          <p className="text-xs text-muted mb-6">Review incident details before activating the decision support console.</p>

          <div className={`rounded-lg border border-l-2 p-6 ${scenarioColorMap[form.scenarioType].bg} ${scenarioColorMap[form.scenarioType].border} ${scenarioColorMap[form.scenarioType].accent}`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{selectedScenario.icon}</span>
              <div>
                <h3 className="text-base font-bold text-heading">{form.name}</h3>
                <p className="text-[10px] text-secondary font-mono uppercase tracking-wider">{selectedScenario.fullName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[9px] text-muted uppercase tracking-widest font-bold">Location</span>
                <p className="text-body">{form.location}</p>
              </div>
              <div>
                <span className="text-[9px] text-muted uppercase tracking-widest font-bold">Severity</span>
                <p className="text-body capitalize">{form.severity}</p>
              </div>
              {form.description && (
                <div className="col-span-2">
                  <span className="text-[9px] text-muted uppercase tracking-widest font-bold">Description</span>
                  <p className="text-body">{form.description}</p>
                </div>
              )}
              {Object.entries(form.specificData).filter(([, v]) => v).map(([key, value]) => {
                const fieldDef = selectedScenario.specificFields.find((f) => f.key === key)
                return (
                  <div key={key}>
                    <span className="text-[9px] text-muted uppercase tracking-widest font-bold">{fieldDef?.label || key}</span>
                    <p className="text-body">{value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="advisory-banner rounded-lg p-3 mt-4">
            <p className="text-[10px] text-cyan-400/80 font-medium tracking-wide">
              ALL AI-GENERATED ANALYSIS WITHIN THE CONSOLE IS ADVISORY ONLY. HUMAN DECISION AUTHORITY IS REQUIRED FOR ALL ACTIONS.
            </p>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2 bg-surface-inset text-secondary border border-line rounded-lg text-xs cursor-pointer hover:bg-line transition-colors font-medium"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Geocoding & Launching...' : 'Launch Decision Console'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
