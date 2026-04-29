import { useState } from 'react';
import { UNIT_TYPES, FACTIONS } from '../data/militaryUnits';
import { CUAS_SYSTEMS, CUAS_TYPE_COLORS, CUAS_TYPE_LABELS } from '../data/counterUAS';
import {
  DRONE_GROUPS,
  UAS_CATEGORY_LABELS, UAS_CATEGORY_COLORS,
  THREAT_LEVEL_COLORS_UAS, GROUP_COLORS,
} from '../data/droneTypes';
import { MISSILE_THREATS, THREAT_LEVEL_COLORS, TRAJ_LABELS, TRAJ_COLORS } from '../data/missileThreat';
import {
  GRAPHIC_TYPES, PHASE_LINE_NAMES, GRAPHIC_COLOR_PRESETS,
} from '../data/planningGraphics';
import { EXERCISE_BOUNDARIES } from '../data/exerciseBoundaries';

const BTN = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block',
      width: '100%',
      padding: '7px 10px',
      marginBottom: 3,
      background: active ? '#00FF7F22' : 'transparent',
      border: `1px solid ${active ? '#00FF7F' : '#223344'}`,
      color: active ? '#00FF7F' : '#7799AA',
      fontFamily: 'monospace',
      fontSize: 11,
      cursor: 'pointer',
      textAlign: 'left',
      letterSpacing: '0.04em',
    }}
  >
    {children}
  </button>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      color: '#334455',
      fontSize: 9,
      letterSpacing: '0.18em',
      marginBottom: 5,
      textTransform: 'uppercase',
      borderBottom: '1px solid #1A2A3A',
      paddingBottom: 3,
    }}>
      {title}
    </div>
    {children}
  </div>
);

// Group capability badges
function GroupBadges({ defeat, detect }) {
  const groups = [1, 2, 3, 4, 5];
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 5, marginBottom: 2 }}>
      {groups.map(g => {
        const canDefeat = defeat?.includes(g);
        const canDetect = detect?.includes(g) && !canDefeat;
        return (
          <div
            key={g}
            title={
              canDefeat ? `GROUP ${g}: DEFEAT` :
              canDetect ? `GROUP ${g}: DETECT only` :
              `GROUP ${g}: No capability`
            }
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
              fontSize: 9,
              fontWeight: 'bold',
              background: canDefeat ? '#FF6B0033' : canDetect ? '#ADFF2F22' : 'transparent',
              border: `1px solid ${canDefeat ? '#FF6B00' : canDetect ? '#ADFF2F55' : '#223344'}`,
              color: canDefeat ? '#FF6B00' : canDetect ? '#ADFF2F' : '#334455',
            }}
          >
            G{g}
          </div>
        );
      })}
    </div>
  );
}

// Expanded detail card for selected C-UAS
function CUASDetailCard({ sys }) {
  if (!sys) return null;
  const typeColor = CUAS_TYPE_COLORS[sys.type] ?? '#888';
  return (
    <div style={{
      background: '#050D18',
      border: `1px solid ${typeColor}44`,
      padding: '10px',
      marginTop: 6,
      fontFamily: 'monospace',
    }}>
      <div style={{ color: typeColor, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
        {sys.name}
      </div>
      <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>
        {CUAS_TYPE_LABELS[sys.type]} &nbsp;|&nbsp; {sys.developer}
      </div>
      <div style={{ color: '#556677', fontSize: 9, marginBottom: 2 }}>
        Platform: {sys.platform}
      </div>
      {sys.rangeKm > 0 && (
        <div style={{ color: '#556677', fontSize: 9, marginBottom: 2 }}>
          Range: <span style={{ color: typeColor }}>{sys.rangeKm} km</span>
          &nbsp;|&nbsp;
          Alt: <span style={{ color: typeColor }}>{sys.altitudeFtAGL?.toLocaleString()} ft AGL</span>
        </div>
      )}

      {/* Group capability legend */}
      <div style={{ fontSize: 9, color: '#334455', marginTop: 6, marginBottom: 2 }}>
        UAS GROUP CAPABILITY:
      </div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(g => {
          const canDefeat = sys.defeat?.includes(g);
          const canDetect = sys.detect?.includes(g) && !canDefeat;
          const label = canDefeat ? 'DEFEAT' : canDetect ? 'DETECT' : '–';
          const bg = canDefeat ? '#FF6B0022' : canDetect ? '#ADFF2F11' : 'transparent';
          const border = canDefeat ? '#FF6B00' : canDetect ? '#ADFF2F44' : '#1A2A3A';
          const color = canDefeat ? '#FF6B00' : canDetect ? '#ADFF2F' : '#334455';
          return (
            <div key={g} style={{
              padding: '2px 6px',
              background: bg,
              border: `1px solid ${border}`,
              fontSize: 8,
              fontFamily: 'monospace',
            }}>
              <span style={{ color: '#556677' }}>G{g}:</span>{' '}
              <span style={{ color, fontWeight: canDefeat ? 'bold' : 'normal' }}>{label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ color: '#556677', fontSize: 9, lineHeight: 1.5, marginBottom: 4 }}>
        {sys.description}
      </div>
      {sys.notes && (
        <div style={{ color: '#334455', fontSize: 9, lineHeight: 1.5, borderTop: '1px solid #1A2A3A', paddingTop: 4 }}>
          NOTE: {sys.notes}
        </div>
      )}
    </div>
  );
}

// ── UAS Threat detail card ──
function UASThreatCard({ drone }) {
  if (!drone) return null;
  const catColor = UAS_CATEGORY_COLORS[drone.category] ?? '#FF6600';
  const threatColor = THREAT_LEVEL_COLORS_UAS[drone.threat] ?? '#FF6600';
  const groupColor = GROUP_COLORS[drone.group] ?? '#FF6600';
  return (
    <div style={{ background: '#050D18', border: `1px solid ${catColor}44`, padding: '10px', marginTop: 6, fontFamily: 'monospace' }}>
      <div style={{ color: catColor, fontSize: 11, fontWeight: 'bold', marginBottom: 3 }}>{drone.name}</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ color: threatColor, border: `1px solid ${threatColor}`, padding: '1px 5px', fontSize: 8 }}>{drone.threat}</span>
        <span style={{ color: groupColor, border: `1px solid ${groupColor}44`, padding: '1px 5px', fontSize: 8 }}>GROUP {drone.group}</span>
        <span style={{ color: '#445566', fontSize: 8 }}>{UAS_CATEGORY_LABELS[drone.category]}</span>
      </div>
      <div style={{ color: '#445566', fontSize: 9, marginBottom: 2 }}>{drone.country}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 9, marginBottom: 6 }}>
        <span style={{ color: '#445566' }}>Speed:</span>     <span style={{ color: catColor }}>{drone.speedMs} m/s ({Math.round(drone.speedMs * 1.944)} kts)</span>
        <span style={{ color: '#445566' }}>Altitude:</span>  <span style={{ color: catColor }}>{drone.aglMeters.toLocaleString()} m AGL</span>
        <span style={{ color: '#445566' }}>Range:</span>     <span style={{ color: catColor }}>{drone.rangeKm} km</span>
        <span style={{ color: '#445566' }}>Endurance:</span> <span style={{ color: '#888' }}>{drone.enduranceMin >= 60 ? `${Math.floor(drone.enduranceMin/60)}h ${drone.enduranceMin%60}m` : `${drone.enduranceMin}m`}</span>
        <span style={{ color: '#445566' }}>Weight:</span>    <span style={{ color: '#888' }}>{drone.weightKg} kg</span>
        <span style={{ color: '#445566' }}>RCS:</span>       <span style={{ color: '#888' }}>{drone.rcs}</span>
      </div>
      <div style={{ marginBottom: 5 }}>
        <div style={{ color: '#334455', fontSize: 9, marginBottom: 2 }}>WARHEAD / EFFECT:</div>
        <div style={{ color: drone.warhead === 'None' ? '#334455' : '#FF6B00', fontSize: 9, lineHeight: 1.5 }}>{drone.warhead}</div>
      </div>
      <div style={{ marginBottom: 5 }}>
        <div style={{ color: '#334455', fontSize: 9, marginBottom: 2 }}>PAYLOAD / SENSORS:</div>
        <div style={{ color: '#556677', fontSize: 9, lineHeight: 1.5 }}>{drone.payload}</div>
      </div>
      <div style={{ marginBottom: 5 }}>
        <div style={{ color: '#334455', fontSize: 9, marginBottom: 2 }}>GUIDANCE:</div>
        <div style={{ color: '#556677', fontSize: 9, lineHeight: 1.5 }}>{drone.guidanceMode}</div>
      </div>
      {drone.interceptedBy?.length > 0 ? (
        <div style={{ marginBottom: 5 }}>
          <div style={{ color: '#334455', fontSize: 9, marginBottom: 2 }}>C-UAS DEFEAT CAPABLE:</div>
          <div style={{ color: '#00FF7F', fontSize: 9, lineHeight: 1.6 }}>
            {drone.interceptedBy.map(id => {
              const s = CUAS_SYSTEMS.find(c => c.id === id);
              return s ? s.name : id;
            }).join(' · ')}
          </div>
        </div>
      ) : null}
      <div style={{ color: '#556677', fontSize: 9, lineHeight: 1.5, marginBottom: 3 }}>{drone.description}</div>
      {drone.notes && (
        <div style={{ color: '#334455', fontSize: 9, lineHeight: 1.5, borderTop: '1px solid #1A2A3A', paddingTop: 4 }}>
          NOTE: {drone.notes}
        </div>
      )}
    </div>
  );
}

// ── UAS Threat browser panel (grouped by group number) ──
function UASThreatPanel({ selectedDrone, setSelectedDrone, waypointCount }) {
  const [expandedGroup, setExpandedGroup] = useState(1);
  return (
    <Section title="UAS Threat Library">
      {[1, 2, 3, 4, 5].map(g => {
        const systems = DRONE_GROUPS[g] ?? [];
        if (!systems.length) return null;
        const gc = GROUP_COLORS[g];
        const isExp = expandedGroup === g;
        return (
          <div key={g} style={{ marginBottom: 5 }}>
            <button
              onClick={() => setExpandedGroup(isExp ? null : g)}
              style={{
                width: '100%', padding: '4px 8px',
                background: isExp ? `${gc}18` : 'transparent',
                border: `1px solid ${isExp ? gc + '66' : '#1A2A3A'}`,
                color: gc, fontFamily: 'monospace', fontSize: 9,
                cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between',
                letterSpacing: '0.08em',
              }}
            >
              <span>GROUP {g} {g === 1 ? '≤20 lbs / <1,200ft' : g === 2 ? '21–55 lbs / <3,500ft' : g === 3 ? '<1,320 lbs / <18k ft' : g === 4 ? 'MALE / ARMED' : 'STRATEGIC UCAV'}</span>
              <span style={{ color: '#334455' }}>{isExp ? '▲' : '▼'} {systems.length}</span>
            </button>
            {isExp && (
              <div style={{ paddingLeft: 4, paddingTop: 3 }}>
                {systems.map(d => {
                  const catColor = UAS_CATEGORY_COLORS[d.category] ?? '#FF6600';
                  const threatColor = THREAT_LEVEL_COLORS_UAS[d.threat] ?? '#FF6600';
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDrone(d)}
                      style={{
                        width: '100%', padding: '4px 7px', marginBottom: 3,
                        background: selectedDrone?.id === d.id ? `${catColor}22` : 'transparent',
                        border: `1px solid ${selectedDrone?.id === d.id ? catColor : '#1A2A3A'}`,
                        color: selectedDrone?.id === d.id ? catColor : '#6688AA',
                        fontFamily: 'monospace', fontSize: 9, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{d.name}</span>
                        <span style={{ color: threatColor, fontSize: 8 }}>{d.threat}</span>
                      </div>
                      <div style={{ color: '#334455', fontSize: 8, marginTop: 1 }}>
                        {d.speedMs}m/s · {d.rangeKm}km · {UAS_CATEGORY_LABELS[d.category]?.split(' ')[0]}
                        {d.count > 1 && <span style={{ color: d.color }}> ×{d.count}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <UASThreatCard drone={selectedDrone} />
      <div style={{ color: '#334455', fontSize: 9, margin: '6px 0' }}>
        Waypoints: <span style={{ color: '#00FF7F' }}>{waypointCount}</span>
        <span style={{ color: '#334455' }}> — click map to place</span>
      </div>
    </Section>
  );
}

// Group the systems by type for organized display
const TYPE_ORDER = ['strategic', 'kinetic', 'laser', 'hpm', 'rf-jam', 'rf-takeover', 'net', 'radar', 'detection', 'command'];

function groupByType(systems) {
  const groups = {};
  TYPE_ORDER.forEach(t => { groups[t] = []; });
  systems.forEach(s => {
    if (!groups[s.type]) groups[s.type] = [];
    groups[s.type].push(s);
  });
  return groups;
}

// Group missiles by trajectory type
const TRAJ_ORDER = ['ballistic', 'hypersonic', 'cruise', 'rocket'];
function groupMissilesByTraj(missiles) {
  const g = {};
  TRAJ_ORDER.forEach(t => { g[t] = []; });
  missiles.forEach(m => {
    if (!g[m.type]) g[m.type] = [];
    g[m.type].push(m);
  });
  return g;
}

function MissileDetailCard({ sys }) {
  if (!sys) return null;
  const trajColor = TRAJ_COLORS[sys.type] ?? '#FF3300';
  const threatColor = THREAT_LEVEL_COLORS[sys.threat] ?? '#FF6600';
  return (
    <div style={{ background: '#050D18', border: `1px solid ${trajColor}44`, padding: '10px', marginTop: 6, fontFamily: 'monospace' }}>
      <div style={{ color: trajColor, fontSize: 11, fontWeight: 'bold', marginBottom: 3 }}>{sys.name}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ color: threatColor, fontSize: 9, border: `1px solid ${threatColor}`, padding: '1px 5px' }}>
          {sys.threat}
        </span>
        <span style={{ color: '#445566', fontSize: 9 }}>{sys.nato || sys.category}</span>
        <span style={{ color: '#334455', fontSize: 9 }}>{sys.country}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: 9, marginBottom: 5 }}>
        <span style={{ color: '#445566' }}>Range:</span>       <span style={{ color: trajColor }}>{sys.rangeKm} km</span>
        <span style={{ color: '#445566' }}>Speed:</span>       <span style={{ color: trajColor }}>Mach {sys.speedMach}</span>
        <span style={{ color: '#445566' }}>Apogee:</span>      <span style={{ color: trajColor }}>{sys.apogeeKm} km</span>
        <span style={{ color: '#445566' }}>CEP:</span>         <span style={{ color: trajColor }}>{sys.cepMeters} m</span>
        <span style={{ color: '#445566' }}>Warhead:</span>     <span style={{ color: '#888' }}>{sys.warheadKg} kg</span>
        <span style={{ color: '#445566' }}>Trajectory:</span> <span style={{ color: '#888' }}>{TRAJ_LABELS[sys.type]}</span>
      </div>
      {sys.interceptedBy?.length > 0 ? (
        <div style={{ marginBottom: 5 }}>
          <div style={{ color: '#334455', fontSize: 9, marginBottom: 2 }}>INTERCEPT CAPABLE:</div>
          <div style={{ color: '#00FF7F', fontSize: 9, lineHeight: 1.6 }}>
            {sys.interceptedBy.map(id => {
              const sys2 = CUAS_SYSTEMS.find(c => c.id === id);
              return sys2 ? sys2.name : id;
            }).join(' · ')}
          </div>
        </div>
      ) : (
        <div style={{ color: '#CC0000', fontSize: 9, fontWeight: 'bold', marginBottom: 5 }}>
          ⚠ NO CURRENT INTERCEPT CAPABILITY
        </div>
      )}
      <div style={{ color: '#556677', fontSize: 9, lineHeight: 1.5, marginBottom: 3 }}>{sys.description}</div>
      {sys.notes && (
        <div style={{ color: '#334455', fontSize: 9, lineHeight: 1.5, borderTop: '1px solid #1A2A3A', paddingTop: 4 }}>
          NOTE: {sys.notes}
        </div>
      )}
    </div>
  );
}

export default function ToolPanel({
  mode, setMode,
  faction, setFaction,
  selectedUnit, setSelectedUnit,
  selectedCUAS, setSelectedCUAS,
  detectionLayerAssets,
  layerColorSwatches,
  selectedLayerAsset, setSelectedLayerAsset,
  onAddCustomLayerAsset,
  selectedDrone, setSelectedDrone,
  selectedMissile, setSelectedMissile,
  threatMode, setThreatMode,
  waypointCount,
  onSimulate,
  onClearAll,
  radarNetworkVisible,
  onToggleRadarNetwork,
  countryBoundariesVisible,
  stateBoundariesVisible,
  onToggleCountryBoundaries,
  onToggleStateBoundaries,
  exerciseBoundaryNames,
  onRenameExerciseBoundary,
  dataLinkConnected,
  dataLinkTrackCount,
  dataLinkVisible,
  dataLinkUrl,
  onToggleDataLink,
  kmzLayers,
  kmzLoadStatus,
  onImportKmz,
  onRemoveKmzLayer,
  onToggleKmzLayer,
  // planning graphics
  selectedGraphicType, setSelectedGraphicType,
  graphicLabel, setGraphicLabel,
  graphicColor, setGraphicColor,
  graphicPointCount,
  onFinishGraphic,
  onUndoGraphicPoint,
}) {
  const [expandedType, setExpandedType] = useState('strategic');
  const [expandedTraj, setExpandedTraj] = useState('ballistic');
  const [expandedImpactTraj, setExpandedImpactTraj] = useState('ballistic');
  const [showCustomLayerForm, setShowCustomLayerForm] = useState(false);
  const [customLayer, setCustomLayer] = useState({
    name: '',
    domain: 'radar',
    rangeKm: 25,
    altitudeFtAGL: 10000,
    quality: 0.75,
    color: '#00E5FF',
    description: '',
  });
  const grouped = groupByType(CUAS_SYSTEMS);
  const missileGrouped = groupMissilesByTraj(MISSILE_THREATS);
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    background: '#050D18',
    border: '1px solid #223344',
    color: '#AABBCC',
    fontFamily: 'monospace',
    fontSize: 10,
    padding: '5px 6px',
  };
  const setCustomField = (key, value) => setCustomLayer(prev => ({ ...prev, [key]: value }));
  const addCustomLayer = () => {
    const name = customLayer.name.trim();
    if (!name) return;
    const rangeKm = Math.max(0.1, Number(customLayer.rangeKm) || 0.1);
    const altitudeFtAGL = Math.max(0, Number(customLayer.altitudeFtAGL) || 0);
    const quality = Math.max(0.05, Math.min(0.98, Number(customLayer.quality) || 0.75));
    const domainLabel = {
      radar: 'Radar',
      rf: 'RF',
      eoir: 'EO/IR',
      acoustic: 'Acoustic',
      'cyber-osint': 'Cyber/OSINT',
    }[customLayer.domain] ?? 'Detection';

    onAddCustomLayerAsset({
      ...customLayer,
      name,
      rangeKm,
      altitudeFtAGL,
      quality,
      description: customLayer.description.trim() || `${domainLabel} capability added by planner.`,
    });
    setCustomLayer(prev => ({ ...prev, name: '', description: '' }));
    setShowCustomLayerForm(false);
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: 300,
      height: '100vh',
      background: 'rgba(3, 8, 15, 0.95)',
      borderRight: '1px solid #0D1E2E',
      padding: '14px 10px 80px 10px',
      overflowY: 'auto',
      zIndex: 10,
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#00FF7F', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', letterSpacing: '0.12em' }}>
          SUWALKI SENTINEL
        </div>
        <div style={{ color: '#334455', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.08em' }}>
          MULTI-DOMAIN PLANNING TOOL v2.0 — C-UAS GRID
        </div>
      </div>

      <Section title="Mode">
        <BTN active={mode === 'los'} onClick={() => setMode('los')}>[01] LOS ANALYSIS</BTN>
        <BTN active={mode === 'place-unit'} onClick={() => setMode('place-unit')}>[02] PLACE UNIT</BTN>
        <BTN active={mode === 'place-cuas'} onClick={() => setMode('place-cuas')}>[03] PLACE C-UAS / IAMD</BTN>
        <BTN active={mode === 'draw-path'} onClick={() => setMode('draw-path')}>[04] SIMULATE THREAT</BTN>
        <BTN active={mode === 'impact-analysis'} onClick={() => setMode('impact-analysis')}>[05] IMPACT ANALYSIS</BTN>
        <BTN active={mode === 'place-layer'} onClick={() => setMode('place-layer')}>[06] DETECTION LAYERS</BTN>
        <BTN active={mode === 'plan-graphics'} onClick={() => setMode('plan-graphics')}>[07] PLAN GRAPHICS</BTN>
      </Section>

      {/* Radar network toggle */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          color: '#334455', fontSize: 9, letterSpacing: '0.18em', marginBottom: 6,
          textTransform: 'uppercase', borderBottom: '1px solid #1A2A3A', paddingBottom: 3,
        }}>
          RADAR NETWORK (15 SENSORS)
        </div>
        <button
          onClick={onToggleRadarNetwork}
          style={{
            width: '100%', padding: '6px 10px',
            background: radarNetworkVisible ? '#00BFFF18' : 'transparent',
            border: `1px solid ${radarNetworkVisible ? '#00BFFF' : '#223344'}`,
            color: radarNetworkVisible ? '#00BFFF' : '#445566',
            fontFamily: 'monospace', fontSize: 10, cursor: 'pointer',
            textAlign: 'left', letterSpacing: '0.06em',
          }}
        >
          {radarNetworkVisible ? '◆ NETWORK VISIBLE' : '◇ NETWORK HIDDEN'}
          <span style={{ float: 'right', fontSize: 9, color: '#334455' }}>
            {radarNetworkVisible ? 'NATO + RU' : 'TOGGLE ON'}
          </span>
        </button>
        {radarNetworkVisible && (
          <div style={{ marginTop: 5, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['#00BFFF', 'NATO'], ['#FF3300', 'RUSSIA']].map(([col, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, border: `1px solid ${col}` }} />
                <span style={{ color: col, fontSize: 8, fontFamily: 'monospace' }}>{label}</span>
              </div>
            ))}
            <span style={{ color: '#223344', fontSize: 8, fontFamily: 'monospace' }}>ICAO+RK4 physics</span>
          </div>
        )}
      </div>

      <Section title="Exercise Boundaries">
        <div style={{ color: '#667788', fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>
          Toggle country and state/region overlays. Rename labels here for exercise control names.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
          <button
            onClick={onToggleCountryBoundaries}
            style={{
              padding: '6px 5px',
              background: countryBoundariesVisible ? '#00BFFF18' : 'transparent',
              border: `1px solid ${countryBoundariesVisible ? '#00BFFF' : '#223344'}`,
              color: countryBoundariesVisible ? '#00BFFF' : '#556677',
              fontFamily: 'monospace',
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            {countryBoundariesVisible ? '◆ COUNTRY' : '◇ COUNTRY'}
          </button>
          <button
            onClick={onToggleStateBoundaries}
            style={{
              padding: '6px 5px',
              background: stateBoundariesVisible ? '#39FF1418' : 'transparent',
              border: `1px solid ${stateBoundariesVisible ? '#39FF14' : '#223344'}`,
              color: stateBoundariesVisible ? '#39FF14' : '#556677',
              fontFamily: 'monospace',
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            {stateBoundariesVisible ? '◆ STATE' : '◇ STATE'}
          </button>
        </div>
        <div style={{ maxHeight: 160, overflowY: 'auto', paddingRight: 3 }}>
          {EXERCISE_BOUNDARIES.map(boundary => (
            <label key={boundary.id} style={{
              display: 'block',
              color: boundary.type === 'country' ? '#88CCFF' : '#88FFAA',
              fontSize: 8,
              marginBottom: 6,
            }}>
              {boundary.type === 'country' ? 'COUNTRY' : 'STATE/REGION'} · {boundary.defaultName}
              <input
                value={exerciseBoundaryNames[boundary.id] ?? boundary.defaultName}
                onChange={event => onRenameExerciseBoundary(boundary.id, event.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 2,
                  background: '#050D18',
                  border: '1px solid #223344',
                  color: '#D9ECFF',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  padding: '4px 5px',
                }}
              />
            </label>
          ))}
        </div>
      </Section>

      {/* Data Link toggle */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          color: '#334455', fontSize: 9, letterSpacing: '0.18em', marginBottom: 6,
          textTransform: 'uppercase', borderBottom: '1px solid #1A2A3A', paddingBottom: 3,
        }}>
          OPEN ARCHITECTURE — DATA LINK
        </div>
        <button
          onClick={onToggleDataLink}
          style={{
            width: '100%', padding: '6px 10px',
            background: dataLinkVisible ? '#00FF7F18' : 'transparent',
            border: `1px solid ${dataLinkConnected ? '#00FF7F' : '#445566'}`,
            color: dataLinkConnected ? '#00FF7F' : '#556677',
            fontFamily: 'monospace', fontSize: 10, cursor: 'pointer',
            textAlign: 'left', letterSpacing: '0.06em',
          }}
        >
          {dataLinkConnected ? '◆' : '◇'} TRACK FEED
          <span style={{ float: 'right', fontSize: 9, color: dataLinkConnected ? '#00FF7F88' : '#334455' }}>
            {dataLinkConnected ? `${dataLinkTrackCount} LIVE` : 'OFFLINE'}
          </span>
        </button>
        {dataLinkConnected && (
          <div style={{ marginTop: 3, fontSize: 8, color: '#334455', fontFamily: 'monospace' }}>
            {dataLinkUrl} &nbsp;·&nbsp; POST /api/tracks/ingest
          </div>
        )}
      </div>

      {/* ── UNIT PLACEMENT ── */}
      {mode === 'place-unit' && (
        <Section title="Unit Type">
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[FACTIONS.FRIENDLY, FACTIONS.ENEMY].map(f => (
              <button
                key={f}
                onClick={() => setFaction(f)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  background: faction === f
                    ? (f === FACTIONS.FRIENDLY ? '#003388' : '#880000')
                    : 'transparent',
                  border: `1px solid ${f === FACTIONS.FRIENDLY ? '#0055AA' : '#AA0000'}`,
                  color: '#EEE',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {f === FACTIONS.FRIENDLY ? '◆ BLUE FORCE' : '◆ RED FORCE'}
              </button>
            ))}
          </div>
          {UNIT_TYPES.map(u => (
            <BTN key={u.id} active={selectedUnit?.id === u.id} onClick={() => setSelectedUnit(u)}>
              {u.label}
            </BTN>
          ))}
        </Section>
      )}

      {mode === 'place-layer' && (
        <Section title="Detection Architecture">
          <div style={{ color: '#667788', fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>
            Build layered detection using radar, RF, EO/IR, acoustic, and cyber/OSINT assets. Click map to place selected layer.
          </div>
          <button
            onClick={() => setShowCustomLayerForm(prev => !prev)}
            style={{
              width: '100%',
              padding: '7px 8px',
              marginBottom: 8,
              background: showCustomLayerForm ? '#00E5FF18' : 'transparent',
              border: `1px solid ${showCustomLayerForm ? '#00E5FF' : '#223344'}`,
              color: showCustomLayerForm ? '#00E5FF' : '#AABBCC',
              fontFamily: 'monospace',
              fontSize: 10,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            + ADD PLANNER CAPABILITY
          </button>
          {showCustomLayerForm && (
            <div style={{ border: '1px solid #123044', background: '#050D18', padding: 8, marginBottom: 10 }}>
              <label style={{ display: 'block', color: '#667788', fontSize: 9, marginBottom: 6 }}>
                Capability Name
                <input
                  value={customLayer.name}
                  onChange={e => setCustomField('name', e.target.value)}
                  placeholder="e.g. Polish Passive RF Net"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <label style={{ color: '#667788', fontSize: 9 }}>
                  Domain
                  <select value={customLayer.domain} onChange={e => setCustomField('domain', e.target.value)} style={inputStyle}>
                    <option value="radar">Radar</option>
                    <option value="rf">RF Sensing</option>
                    <option value="eoir">EO/IR</option>
                    <option value="acoustic">Acoustic</option>
                    <option value="cyber-osint">Cyber/OSINT</option>
                  </select>
                </label>
                <label style={{ color: '#667788', fontSize: 9 }}>
                  Color
                  <input
                    type="color"
                    value={customLayer.color}
                    onChange={e => setCustomField('color', e.target.value)}
                    style={{ ...inputStyle, height: 28, padding: 1 }}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <label style={{ color: '#667788', fontSize: 9 }}>
                  Range km
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customLayer.rangeKm}
                    onChange={e => setCustomField('rangeKm', e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={{ color: '#667788', fontSize: 9 }}>
                  Ceiling ft AGL
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={customLayer.altitudeFtAGL}
                    onChange={e => setCustomField('altitudeFtAGL', e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
              <label style={{ display: 'block', color: '#667788', fontSize: 9, marginBottom: 6 }}>
                Confidence / Quality {Math.round(Number(customLayer.quality) * 100)}%
                <input
                  type="range"
                  min="0.05"
                  max="0.98"
                  step="0.01"
                  value={customLayer.quality}
                  onChange={e => setCustomField('quality', e.target.value)}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ display: 'block', color: '#667788', fontSize: 9, marginBottom: 8 }}>
                Notes
                <textarea
                  value={customLayer.description}
                  onChange={e => setCustomField('description', e.target.value)}
                  placeholder="Known limits, cue source, assumptions..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <button
                onClick={addCustomLayer}
                disabled={!customLayer.name.trim()}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  background: customLayer.name.trim() ? '#00E5FF22' : 'transparent',
                  border: `1px solid ${customLayer.name.trim() ? '#00E5FF' : '#223344'}`,
                  color: customLayer.name.trim() ? '#00E5FF' : '#445566',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  cursor: customLayer.name.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                CREATE CAPABILITY
              </button>
            </div>
          )}
          {detectionLayerAssets.map(layer => {
            const active = selectedLayerAsset?.id === layer.id;
            const color = active ? selectedLayerAsset.color : layer.color;
            return (
              <div key={layer.id} style={{
                marginBottom: 7,
                padding: active ? '7px 8px' : 0,
                background: active ? `${color}14` : 'transparent',
                border: active ? `1px solid ${color}` : 'none',
              }}>
                <button
                  onClick={() => setSelectedLayerAsset(prev => ({ ...layer, color: prev?.id === layer.id ? prev.color : layer.color }))}
                  style={{
                    width: '100%',
                    padding: active ? 0 : '7px 8px',
                    marginBottom: active ? 6 : 0,
                    background: active ? 'transparent' : 'transparent',
                    border: active ? 'none' : `1px solid #1A2A3A`,
                    color: active ? color : '#7799AA',
                    fontFamily: 'monospace',
                    fontSize: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span>{layer.name}</span>
                    <span style={{ color: '#445566', flexShrink: 0 }}>{layer.rangeKm}km</span>
                  </div>
                  <div style={{ color: '#445566', fontSize: 8, marginTop: 3 }}>
                    {layer.description}
                  </div>
                </button>
                {active && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ color: '#667788', fontSize: 9 }}>Layer color</span>
                      <input
                        type="color"
                        value={selectedLayerAsset.color}
                        onChange={e => setSelectedLayerAsset(prev => ({ ...prev, color: e.target.value }))}
                        style={{ width: 34, height: 24, background: 'transparent', border: '1px solid #223344', padding: 0 }}
                      />
                      <span style={{ color: selectedLayerAsset.color, fontSize: 9 }}>{selectedLayerAsset.color.toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {layerColorSwatches.map(swatch => (
                        <button
                          key={swatch}
                          onClick={() => setSelectedLayerAsset(prev => ({ ...prev, color: swatch }))}
                          title={swatch}
                          style={{
                            width: 22,
                            height: 22,
                            background: swatch,
                            border: selectedLayerAsset.color === swatch ? '2px solid #FFFFFF' : '1px solid #223344',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* ── C-UAS PLACEMENT ── */}
      {mode === 'place-cuas' && (
        <>
          <div style={{ color: '#667788', fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>
            Place tactical C-UAS, air defense, and strategic IAMD/BMD capabilities such as Aegis, THAAD, and Patriot.
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, fontFamily: 'monospace' }}>
              <div style={{ width: 10, height: 10, background: '#FF6B0022', border: '1px solid #FF6B00' }} />
              <span style={{ color: '#FF6B00' }}>DEFEAT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, fontFamily: 'monospace' }}>
              <div style={{ width: 10, height: 10, background: '#ADFF2F11', border: '1px solid #ADFF2F55' }} />
              <span style={{ color: '#ADFF2F' }}>DETECT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, fontFamily: 'monospace' }}>
              <div style={{ width: 10, height: 10, background: 'transparent', border: '1px solid #223344' }} />
              <span style={{ color: '#334455' }}>NO CAP</span>
            </div>
          </div>

          {/* Systems grouped by type */}
          {TYPE_ORDER.map(type => {
            const systems = grouped[type];
            if (!systems || systems.length === 0) return null;
            const typeColor = CUAS_TYPE_COLORS[type] ?? '#888';
            const isExpanded = expandedType === type;
            return (
              <div key={type} style={{ marginBottom: 6 }}>
                {/* Type header (collapsible) */}
                <button
                  onClick={() => setExpandedType(isExpanded ? null : type)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    background: isExpanded ? `${typeColor}18` : 'transparent',
                    border: `1px solid ${isExpanded ? typeColor + '66' : '#1A2A3A'}`,
                    color: typeColor,
                    fontFamily: 'monospace',
                    fontSize: 9,
                    cursor: 'pointer',
                    textAlign: 'left',
                    letterSpacing: '0.12em',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{CUAS_TYPE_LABELS[type] ?? type.toUpperCase()}</span>
                  <span style={{ color: '#334455' }}>{isExpanded ? '▲' : '▼'} {systems.length}</span>
                </button>

                {isExpanded && (
                  <div style={{ paddingLeft: 4, paddingTop: 3 }}>
                    {systems.map(sys => (
                      <div key={sys.id} style={{ marginBottom: 4 }}>
                        <button
                          onClick={() => setSelectedCUAS(sys)}
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            background: selectedCUAS?.id === sys.id ? `${typeColor}22` : 'transparent',
                            border: `1px solid ${selectedCUAS?.id === sys.id ? typeColor : '#1A2A3A'}`,
                            color: selectedCUAS?.id === sys.id ? typeColor : '#6688AA',
                            fontFamily: 'monospace',
                            fontSize: 10,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{sys.name}</span>
                            {sys.rangeKm > 0 && (
                              <span style={{ color: '#445566', fontSize: 9 }}>{sys.rangeKm}km</span>
                            )}
                          </div>
                          <GroupBadges defeat={sys.defeat} detect={sys.detect} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <CUASDetailCard sys={selectedCUAS} />
        </>
      )}

      {/* ── SIMULATE THREAT ── */}
      {mode === 'draw-path' && (
        <>
          {/* Threat type toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[['uas', 'UAS / DRONE'], ['missile', 'MISSILE / ROCKET']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setThreatMode(val)}
                style={{
                  flex: 1,
                  padding: '5px 4px',
                  background: threatMode === val ? '#FF220022' : 'transparent',
                  border: `1px solid ${threatMode === val ? '#FF2200' : '#1A2A3A'}`,
                  color: threatMode === val ? '#FF4400' : '#445566',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* UAS sub-panel */}
          {threatMode === 'uas' && (
            <UASThreatPanel
              selectedDrone={selectedDrone}
              setSelectedDrone={setSelectedDrone}
              waypointCount={waypointCount}
            />
          )}

          {/* Missile sub-panel */}
          {threatMode === 'missile' && (
            <Section title="Missile Threat">
              {TRAJ_ORDER.map(traj => {
                const threats = missileGrouped[traj];
                if (!threats || threats.length === 0) return null;
                const tc = TRAJ_COLORS[traj];
                const isExp = expandedTraj === traj;
                return (
                  <div key={traj} style={{ marginBottom: 5 }}>
                    <button
                      onClick={() => setExpandedTraj(isExp ? null : traj)}
                      style={{
                        width: '100%', padding: '4px 8px',
                        background: isExp ? `${tc}18` : 'transparent',
                        border: `1px solid ${isExp ? tc + '66' : '#1A2A3A'}`,
                        color: tc, fontFamily: 'monospace', fontSize: 9,
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', justifyContent: 'space-between',
                        letterSpacing: '0.1em',
                      }}
                    >
                      <span>{TRAJ_LABELS[traj]}</span>
                      <span style={{ color: '#334455' }}>{isExp ? '▲' : '▼'} {threats.length}</span>
                    </button>
                    {isExp && (
                      <div style={{ paddingLeft: 4, paddingTop: 3 }}>
                        {threats.map(m => {
                          const threatColor = THREAT_LEVEL_COLORS[m.threat] ?? '#FF6600';
                          return (
                            <button
                              key={m.id}
                              onClick={() => setSelectedMissile(m)}
                              style={{
                                width: '100%', padding: '4px 7px', marginBottom: 3,
                                background: selectedMissile?.id === m.id ? `${tc}22` : 'transparent',
                                border: `1px solid ${selectedMissile?.id === m.id ? tc : '#1A2A3A'}`,
                                color: selectedMissile?.id === m.id ? tc : '#6688AA',
                                fontFamily: 'monospace', fontSize: 9, cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{m.name}</span>
                                <span style={{ color: threatColor, fontSize: 8 }}>{m.threat}</span>
                              </div>
                              <div style={{ color: '#334455', fontSize: 8, marginTop: 1 }}>
                                Mach {m.speedMach} · {m.rangeKm}km · {m.cepMeters}m CEP
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <MissileDetailCard sys={selectedMissile} />
              <div style={{ color: '#334455', fontSize: 9, margin: '6px 0' }}>
                {waypointCount === 0 && 'Click map to place LAUNCH point.'}
                {waypointCount === 1 && <span style={{ color: '#FFAA00' }}>Click map to place TARGET.</span>}
                {waypointCount >= 2 && <span style={{ color: '#00FF7F' }}>Launch + Target set. Ready.</span>}
              </div>
            </Section>
          )}

          {/* Simulate button */}
          {waypointCount >= 2 && (
            <button
              onClick={onSimulate}
              style={{
                width: '100%', padding: '8px',
                background: '#FF220022', border: '1px solid #FF4400',
                color: '#FF4400', fontFamily: 'monospace', fontSize: 12,
                cursor: 'pointer', letterSpacing: '0.1em', marginTop: 4,
              }}
            >
              ► LAUNCH SIMULATION
            </button>
          )}
        </>
      )}

      {/* ── IMPACT ANALYSIS ── */}
      {mode === 'impact-analysis' && (
        <>
          <div style={{
            padding: '8px 10px', marginBottom: 10,
            background: '#0A0005', border: '1px solid #CC000044',
            fontFamily: 'monospace', fontSize: 9, color: '#CC4444', lineHeight: 1.7,
          }}>
            <div style={{ color: '#FF4444', fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: 4 }}>
              ⚠ IMPACT ANALYSIS MODE
            </div>
            1. Select missile threat below<br />
            2. Click map → LAUNCH ORIGIN<br />
            3. Click map → TARGET AREA<br />
            <span style={{ color: '#556677' }}>Computes: flight time, shelter deadlines, blast zones</span>
          </div>

          <Section title="Select Missile Threat">
            {TRAJ_ORDER.map(traj => {
              const threats = missileGrouped[traj];
              if (!threats || threats.length === 0) return null;
              const tc = TRAJ_COLORS[traj];
              const isExp = expandedImpactTraj === traj;
              return (
                <div key={traj} style={{ marginBottom: 5 }}>
                  <button
                    onClick={() => setExpandedImpactTraj(isExp ? null : traj)}
                    style={{
                      width: '100%', padding: '4px 8px',
                      background: isExp ? `${tc}18` : 'transparent',
                      border: `1px solid ${isExp ? tc + '66' : '#1A2A3A'}`,
                      color: tc, fontFamily: 'monospace', fontSize: 9,
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between',
                      letterSpacing: '0.1em',
                    }}
                  >
                    <span>{TRAJ_LABELS[traj]}</span>
                    <span style={{ color: '#334455' }}>{isExp ? '▲' : '▼'} {threats.length}</span>
                  </button>
                  {isExp && (
                    <div style={{ paddingLeft: 4, paddingTop: 3 }}>
                      {threats.map(m => {
                        const threatColor = THREAT_LEVEL_COLORS[m.threat] ?? '#FF6600';
                        return (
                          <button
                            key={m.id}
                            onClick={() => setSelectedMissile(m)}
                            style={{
                              width: '100%', padding: '4px 7px', marginBottom: 3,
                              background: selectedMissile?.id === m.id ? `${tc}22` : 'transparent',
                              border: `1px solid ${selectedMissile?.id === m.id ? tc : '#1A2A3A'}`,
                              color: selectedMissile?.id === m.id ? tc : '#6688AA',
                              fontFamily: 'monospace', fontSize: 9, cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{m.name}</span>
                              <span style={{ color: threatColor, fontSize: 8 }}>{m.threat}</span>
                            </div>
                            <div style={{ color: '#334455', fontSize: 8, marginTop: 1 }}>
                              Mach {m.speedMach} · {m.rangeKm} km · {m.warheadKg} kg
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <MissileDetailCard sys={selectedMissile} />
          </Section>
        </>
      )}

      {mode === 'los' && (
        <div style={{ color: '#334455', fontSize: 9, lineHeight: 1.7, fontFamily: 'monospace' }}>
          Click to place RADAR NODE.<br />
          Click again to place TARGET.<br />
          Terrain LOS analysis computed.
        </div>
      )}

      {/* ── PLAN GRAPHICS ── */}
      {mode === 'plan-graphics' && (
        <>
          {/* Graphic type selector */}
          <Section title="Graphic Type">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {GRAPHIC_TYPES.map(g => {
                const active = selectedGraphicType === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGraphicType(g.id)}
                    style={{
                      padding: '4px 8px',
                      background: active ? `${g.defaultColor}22` : 'transparent',
                      border: `1px solid ${active ? g.defaultColor : '#223344'}`,
                      color: active ? g.defaultColor : '#556677',
                      fontFamily: 'monospace',
                      fontSize: 9,
                      cursor: 'pointer',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {g.shortLabel}
                  </button>
                );
              })}
            </div>
            {/* Description for selected type */}
            {(() => {
              const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
              return gt ? (
                <div style={{ color: '#445566', fontSize: 9, lineHeight: 1.6, fontFamily: 'monospace', marginBottom: 8 }}>
                  {gt.label}: {gt.instructions}
                </div>
              ) : null;
            })()}
          </Section>

          {/* Label input */}
          <Section title="Label">
            <input
              value={graphicLabel}
              onChange={e => setGraphicLabel(e.target.value)}
              placeholder="e.g. PL BLUE"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#050D18', border: '1px solid #223344',
                color: '#AABBCC', fontFamily: 'monospace', fontSize: 11,
                padding: '6px 8px', marginBottom: 6,
              }}
            />
            {/* Quick-labels for phase lines */}
            {selectedGraphicType === 'phase-line' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {PHASE_LINE_NAMES.map(({ name, color }) => (
                  <button
                    key={name}
                    onClick={() => { setGraphicLabel(name); setGraphicColor(color); }}
                    style={{
                      padding: '3px 7px',
                      background: graphicLabel === name ? `${color}22` : 'transparent',
                      border: `1px solid ${color}66`,
                      color, fontFamily: 'monospace', fontSize: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Color picker */}
          <Section title="Color">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
              {GRAPHIC_COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => setGraphicColor(c)}
                  title={c}
                  style={{
                    width: 22, height: 22, background: c,
                    border: graphicColor === c ? '2px solid #FFFFFF' : '1px solid #223344',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input
                type="color"
                value={graphicColor}
                onChange={e => setGraphicColor(e.target.value)}
                style={{ width: 22, height: 22, background: 'transparent', border: '1px solid #223344', padding: 0, cursor: 'pointer' }}
              />
            </div>
          </Section>

          {/* Drawing status + controls */}
          <Section title="Drawing">
            <div style={{
              padding: '8px 10px', background: '#050D18', border: '1px solid #0D1E2E',
              fontFamily: 'monospace', fontSize: 9, marginBottom: 8,
            }}>
              <div style={{ color: '#334455', marginBottom: 3 }}>
                Points placed: <span style={{ color: graphicPointCount > 0 ? graphicColor : '#334455' }}>{graphicPointCount}</span>
              </div>
              {(() => {
                const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                if (!gt) return null;
                const need = gt.minPoints - graphicPointCount;
                if (graphicPointCount === 0) return <div style={{ color: '#445566' }}>Click map to begin.</div>;
                if (need > 0) return <div style={{ color: '#FFAA00' }}>Need {need} more point{need !== 1 ? 's' : ''} to finish.</div>;
                return <div style={{ color: '#00FF7F' }}>Ready — add more points or finish.</div>;
              })()}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onUndoGraphicPoint}
                disabled={graphicPointCount === 0}
                style={{
                  flex: 1, padding: '6px 0',
                  background: 'transparent',
                  border: `1px solid ${graphicPointCount > 0 ? '#445566' : '#1A2A3A'}`,
                  color: graphicPointCount > 0 ? '#7799AA' : '#334455',
                  fontFamily: 'monospace', fontSize: 9,
                  cursor: graphicPointCount > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                ◀ UNDO
              </button>
              <button
                onClick={onFinishGraphic}
                disabled={(() => {
                  const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                  return !gt || graphicPointCount < gt.minPoints;
                })()}
                style={{
                  flex: 2, padding: '6px 0',
                  background: (() => {
                    const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                    return gt && graphicPointCount >= gt.minPoints ? `${graphicColor}22` : 'transparent';
                  })(),
                  border: `1px solid ${(() => {
                    const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                    return gt && graphicPointCount >= gt.minPoints ? graphicColor : '#1A2A3A';
                  })()}`,
                  color: (() => {
                    const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                    return gt && graphicPointCount >= gt.minPoints ? graphicColor : '#334455';
                  })(),
                  fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em',
                  cursor: (() => {
                    const gt = GRAPHIC_TYPES.find(g => g.id === selectedGraphicType);
                    return gt && graphicPointCount >= gt.minPoints ? 'pointer' : 'not-allowed';
                  })(),
                }}
              >
                ✓ FINISH GRAPHIC
              </button>
            </div>
          </Section>
        </>
      )}

      {/* ── KMZ / KML IMPORT ── */}
      <div style={{ marginBottom: 70 }}>
        <div style={{
          color: '#334455', fontSize: 9, letterSpacing: '0.18em', marginBottom: 6,
          textTransform: 'uppercase', borderBottom: '1px solid #1A2A3A', paddingBottom: 3,
        }}>
          IMPORT KMZ / KML
        </div>

        {/* File picker trigger */}
        <label style={{ display: 'block', cursor: 'pointer' }}>
          <input
            type="file"
            accept=".kmz,.kml"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(f => onImportKmz(f));
              e.target.value = '';
            }}
          />
          <div style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 10px',
            background: 'transparent',
            border: '1px solid #2A4A5A',
            color: '#4A8A9A',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: '0.08em',
            textAlign: 'center',
            cursor: 'pointer',
          }}>
            + BROWSE KMZ / KML FILES
          </div>
        </label>

        {kmzLoadStatus && (
          <div style={{
            marginTop: 6,
            padding: '5px 7px',
            background: kmzLoadStatus.level === 'error' ? '#331111' : kmzLoadStatus.level === 'warning' ? '#332600' : '#061422',
            border: `1px solid ${kmzLoadStatus.level === 'error' ? '#AA3333' : kmzLoadStatus.level === 'warning' ? '#AA8800' : '#2A4A5A'}`,
            color: kmzLoadStatus.level === 'error' ? '#FF7777' : kmzLoadStatus.level === 'warning' ? '#FFCC66' : '#77BBDD',
            fontFamily: 'monospace',
            fontSize: 8,
            lineHeight: 1.4,
          }}>
            {kmzLoadStatus.message}
          </div>
        )}

        {/* Loaded layer list */}
        {kmzLayers.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {kmzLayers.map(layer => (
              <div
                key={layer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  borderBottom: '1px solid #0D1E2A',
                  fontSize: 9,
                  fontFamily: 'monospace',
                }}
              >
                {/* Visibility toggle */}
                <button
                  onClick={() => onToggleKmzLayer(layer.id)}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    background: layer.visible ? '#00BFFF22' : 'transparent',
                    border: `1px solid ${layer.visible ? '#00BFFF' : '#334455'}`,
                    color: layer.visible ? '#00BFFF' : '#445566',
                    fontFamily: 'monospace',
                    fontSize: 8,
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  {layer.visible ? '●' : '○'}
                </button>

                {/* Layer name */}
                <span
                  style={{
                    flex: 1,
                    color: layer.visible ? '#7799AA' : '#445566',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={layer.name}
                >
                  {layer.name}
                  {Number.isFinite(layer.entityCount) && (
                    <span style={{ color: '#334455' }}> · {layer.entityCount}</span>
                  )}
                </span>

                {/* Remove */}
                <button
                  onClick={() => onRemoveKmzLayer(layer.id)}
                  title="Remove layer"
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid #442222',
                    color: '#883333',
                    fontFamily: 'monospace',
                    fontSize: 8,
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {kmzLayers.length === 0 && (
          <div style={{ color: '#2A3A4A', fontSize: 8, marginTop: 4, fontFamily: 'monospace' }}>
            Supports KMZ + KML (placemarks, lines, polygons, ground overlays).
            Compatible with Google Earth exports.
          </div>
        )}
      </div>

      {/* Clear */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, width: 300, padding: '10px', background: 'rgba(3,8,15,0.97)', borderTop: '1px solid #0D1E2E', boxSizing: 'border-box', zIndex: 11 }}>
        <button
          onClick={onClearAll}
          style={{
            width: '100%',
            padding: '7px',
            background: 'transparent',
            border: '1px solid #662222',
            color: '#883333',
            fontFamily: 'monospace',
            fontSize: 10,
            cursor: 'pointer',
            letterSpacing: '0.08em',
          }}
        >
          CLEAR ALL ENTITIES
        </button>
      </div>
    </div>
  );
}
