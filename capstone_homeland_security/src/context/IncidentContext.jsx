import { createContext, useContext, useReducer, useEffect } from 'react'

const IncidentContext = createContext(null)

const STORAGE_KEY = 'aegis-incidents'

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : { incidents: [] }
  } catch {
    return { incidents: [] }
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* storage full or unavailable */ }
}

function incidentReducer(state, action) {
  let newState
  switch (action.type) {
    case 'CREATE_INCIDENT': {
      const incident = {
        ...action.payload,
        id: action.payload.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'active',
        decisions: [],
        civilLiberties: {},
        doctrineCompliance: {},
        agencyCoordination: {},
        auditLog: [
          {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action: 'Incident Created',
            details: `${action.payload.name} - ${action.payload.scenarioType} incident initiated`,
            user: 'System',
          },
        ],
      }
      newState = { ...state, incidents: [...state.incidents, incident] }
      break
    }
    case 'RECORD_DECISION': {
      const { incidentId, decision } = action.payload
      newState = {
        ...state,
        incidents: state.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                decisions: [
                  ...inc.decisions,
                  {
                    ...decision,
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                  },
                ],
                auditLog: [
                  ...inc.auditLog,
                  {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    action: `Decision Recorded: ${decision.category}`,
                    details: decision.summary,
                    user: decision.authorizedBy || 'Operator',
                  },
                ],
              }
            : inc
        ),
      }
      break
    }
    case 'UPDATE_CIVIL_LIBERTIES': {
      const { incidentId, checklistId, checked } = action.payload
      newState = {
        ...state,
        incidents: state.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                civilLiberties: { ...inc.civilLiberties, [checklistId]: checked },
                auditLog: [
                  ...inc.auditLog,
                  {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    action: `Civil Liberties: ${checklistId}`,
                    details: checked ? 'Verified' : 'Unverified',
                    user: 'Governance Officer',
                  },
                ],
              }
            : inc
        ),
      }
      break
    }
    case 'UPDATE_DOCTRINE_COMPLIANCE': {
      const { incidentId, checklistId, checked } = action.payload
      newState = {
        ...state,
        incidents: state.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                doctrineCompliance: { ...(inc.doctrineCompliance || {}), [checklistId]: checked },
                auditLog: [
                  ...inc.auditLog,
                  {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    action: `Doctrine Compliance: ${checklistId}`,
                    details: checked ? 'Verified' : 'Unverified',
                    user: 'Governance Officer',
                  },
                ],
              }
            : inc
        ),
      }
      break
    }
    case 'UPDATE_AGENCY_COORDINATION': {
      const { incidentId, agencyId, status: agencyStatus } = action.payload
      newState = {
        ...state,
        incidents: state.incidents.map((inc) =>
          inc.id === incidentId
            ? {
                ...inc,
                agencyCoordination: { ...inc.agencyCoordination, [agencyId]: agencyStatus },
                auditLog: [
                  ...inc.auditLog,
                  {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    action: `Agency Coordination: ${agencyId}`,
                    details: `Status updated to: ${agencyStatus}`,
                    user: 'Coordination Officer',
                  },
                ],
              }
            : inc
        ),
      }
      break
    }
    case 'COMPLETE_INCIDENT': {
      newState = {
        ...state,
        incidents: state.incidents.map((inc) =>
          inc.id === action.payload
            ? {
                ...inc,
                status: 'completed',
                completedAt: new Date().toISOString(),
                auditLog: [
                  ...inc.auditLog,
                  {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    action: 'Incident Completed',
                    details: 'Incident marked as completed and moved to review.',
                    user: 'Incident Commander',
                  },
                ],
              }
            : inc
        ),
      }
      break
    }
    case 'DELETE_INCIDENT': {
      newState = {
        ...state,
        incidents: state.incidents.filter((inc) => inc.id !== action.payload),
      }
      break
    }
    default:
      return state
  }
  saveState(newState)
  return newState
}

export function IncidentProvider({ children }) {
  const [state, dispatch] = useReducer(incidentReducer, null, loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  return (
    <IncidentContext.Provider value={{ state, dispatch }}>
      {children}
    </IncidentContext.Provider>
  )
}

export function useIncidents() {
  const context = useContext(IncidentContext)
  if (!context) throw new Error('useIncidents must be used within IncidentProvider')
  return context
}
