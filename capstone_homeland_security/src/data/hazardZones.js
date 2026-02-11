/**
 * ERG-based hazard zone distances (meters) and map configuration.
 * Sources: DOT Emergency Response Guidebook, EPA PAGs, FBI CONOPS blast tables.
 */

export const HAZARD_ZONES = {
  cbrn: {
    label: 'CBRN Hazard Zones',
    rings: [
      { label: 'Isolation Zone', key: 'isolation' },
      { label: 'Protective Action Zone', key: 'protective' },
      { label: 'Monitoring Zone', key: 'monitoring' },
    ],
    distances: {
      low:      [100, 300, 800],
      moderate: [300, 800, 2000],
      high:     [600, 2000, 5000],
      critical: [1200, 5000, 10000],
    },
    colors: ['#ef4444', '#f59e0b', '#fcd34d'],
    opacities: [0.25, 0.15, 0.08],
  },
  terrorism: {
    label: 'Blast / Threat Zones',
    rings: [
      { label: 'Fragmentation Zone', key: 'fragmentation' },
      { label: 'Collapse Zone', key: 'collapse' },
      { label: 'Injury / Glass Zone', key: 'injury' },
    ],
    distances: {
      low:      [100, 200, 500],
      moderate: [200, 400, 1000],
      high:     [400, 800, 2000],
      critical: [600, 1500, 3500],
    },
    colors: ['#ef4444', '#3b82f6', '#93c5fd'],
    opacities: [0.25, 0.15, 0.08],
  },
  natural_disaster: {
    label: 'Disaster Impact Zones',
    rings: [
      { label: 'Immediate Impact Zone', key: 'immediate' },
      { label: 'Secondary Effect Zone', key: 'secondary' },
      { label: 'Extended Impact Zone', key: 'extended' },
    ],
    distances: {
      low:      [500, 1500, 4000],
      moderate: [1000, 3000, 8000],
      high:     [2000, 6000, 15000],
      critical: [5000, 12000, 30000],
    },
    colors: ['#ef4444', '#22c55e', '#86efac'],
    opacities: [0.25, 0.15, 0.08],
  },
}

export const MARKER_COLORS = {
  cbrn: '#f59e0b',
  terrorism: '#3b82f6',
  natural_disaster: '#22c55e',
}

export const DEFAULT_MAP_CENTER = [39.8, -98.6]
export const DEFAULT_MAP_ZOOM = 4
