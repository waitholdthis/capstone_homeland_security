import { useState } from 'react';
import { UNIT_TYPES, FACTIONS } from '../data/militaryUnits';
import { CUAS_SYSTEMS, CUAS_TYPE_COLORS, CUAS_TYPE_LABELS } from '../data/counterUAS';
import {
  DRONE_GROUPS,
  UAS_CATEGORY_LABELS, UAS_CATEGORY_COLORS,
  THREAT_LEVEL_COLORS_UAS, GROUP_COLORS,
} from '../data/droneTypes';
import { MISSILE_THREATS, THREAT_LEVEL_COLORS, TRAJ_LABELS, TRAJ_COLORS } from '../data/missileThreat';

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
const TYPE_ORDER = ['kinetic', 'laser', 'hpm', 'rf-jam', 'rf-takeover', 'net', 'radar', 'detection', 'command'];

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
}) {
  const [expandedType, setExpandedType] = useState('kinetic');
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
        <BTN active={mode === 'place-cuas'} onClick={() => setMode('place-cuas')}>[03] PLACE C-UAS SYSTEM</BTN>
        <BTN active={mode === 'draw-path'} onClick={() => setMode('draw-path')}>[04] SIMULATE THREAT</BTN>
        <BTN active={mode === 'impact-analysis'} onClick={() => setMode('impact-analysis')}>[05] IMPACT ANALYSIS</BTN>
        <BTN active={mode === 'place-layer'} onClick={() => setMode('place-layer')}>[06] DETECTION LAYERS</BTN>
      </Section>

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
