import { useEffect, useRef, useState } from 'react';

const ZONE_COLORS = {
  lethal:   '#FF0000',
  severe:   '#FF6600',
  moderate: '#FFAA00',
  light:    '#FFE066',
};

function fmt(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Row({ label, value, valueColor = '#AABBCC' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={{ color: '#445566', fontSize: 8, fontFamily: 'monospace' }}>{label}</span>
      <span style={{ color: valueColor, fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}

function WarningBadge({ level, color }) {
  return (
    <div style={{
      padding: '6px 12px',
      background: color + '22',
      border: `2px solid ${color}`,
      color,
      fontFamily: 'monospace',
      fontSize: 13,
      fontWeight: 'bold',
      letterSpacing: '0.15em',
      textAlign: 'center',
      marginBottom: 10,
      animation: level !== 'MONITOR' ? 'pulse 1s infinite alternate' : 'none',
    }}>
      ⚠ {level}
    </div>
  );
}

export default function ImpactWarningPanel({ analysis, missile, onClose }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analysis) return;
    startRef.current = performance.now();

    const tick = () => {
      const e = (performance.now() - startRef.current) / 1000;
      setElapsed(e);
      if (e < analysis.flight_time_s + 3) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analysis]);

  if (!analysis) return null;

  const remaining = Math.max(analysis.flight_time_s - elapsed, 0);
  const impacted = elapsed >= analysis.flight_time_s;
  const { blast_radii, shelter_windows, warning_level, warning_color } = analysis;

  // Dynamic warning level based on countdown
  let dynLevel = warning_level;
  let dynColor = warning_color;
  if (impacted) {
    dynLevel = 'IMPACT DETECTED';
    dynColor = '#CC0000';
  } else if (remaining <= 5) {
    dynLevel = 'TAKE COVER NOW';
    dynColor = '#FF0000';
  } else if (remaining <= 20) {
    dynLevel = 'RUN TO COVER';
    dynColor = '#FF4400';
  } else if (remaining <= 35) {
    dynLevel = 'MOVE TO SHELTER';
    dynColor = '#FF8800';
  } else if (remaining <= 120) {
    dynLevel = 'PREPARE TO SHELTER';
    dynColor = '#FFAA00';
  }

  const progress = Math.min(elapsed / analysis.flight_time_s, 1);

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      right: 20,
      width: 320,
      background: 'rgba(3, 8, 15, 0.97)',
      border: `1px solid ${dynColor}88`,
      fontFamily: 'monospace',
      zIndex: 20,
      boxShadow: `0 0 24px ${dynColor}44`,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: dynColor + '22',
        borderBottom: `1px solid ${dynColor}44`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ color: dynColor, fontSize: 10, letterSpacing: '0.15em' }}>IMPACT WARNING SYSTEM</div>
          {missile && <div style={{ color: '#445566', fontSize: 9 }}>{missile.name}</div>}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#445566', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {/* Warning badge */}
        <WarningBadge level={dynLevel} color={dynColor} />

        {/* Countdown */}
        <div style={{
          textAlign: 'center',
          marginBottom: 10,
          padding: '8px',
          background: impacted ? '#CC000022' : '#00000044',
          border: `1px solid ${impacted ? '#CC0000' : '#1A2A3A'}`,
        }}>
          <div style={{ color: '#445566', fontSize: 9, letterSpacing: '0.1em', marginBottom: 2 }}>
            {impacted ? 'IMPACT OCCURRED' : 'TIME TO IMPACT'}
          </div>
          <div style={{
            color: impacted ? '#CC0000' : dynColor,
            fontSize: 36,
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}>
            {impacted ? '!! IMPACT !!' : fmt(remaining)}
          </div>
        </div>

        {/* Flight progress bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#334455', marginBottom: 2 }}>
            <span>LAUNCH</span>
            <span>IMPACT</span>
          </div>
          <div style={{ height: 6, background: '#0A1520', border: '1px solid #1A2A3A', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, #334455, ${dynColor})`,
              transition: 'width 0.1s linear',
            }} />
            {/* Shelter deadline markers */}
            {!impacted && analysis.flight_time_s > 0 && (
              <>
                {[
                  { label: 'SHELTER', t: shelter_windows.shelter_deadline_s / analysis.flight_time_s, color: '#FF8800' },
                  { label: 'COVER',   t: shelter_windows.cover_deadline_s   / analysis.flight_time_s, color: '#FF4400' },
                  { label: 'REACT',   t: shelter_windows.react_deadline_s   / analysis.flight_time_s, color: '#FF0000' },
                ].map(marker => marker.t > 0 && marker.t <= 1 && (
                  <div key={marker.label} style={{
                    position: 'absolute',
                    left: `${marker.t * 100}%`,
                    top: -2,
                    height: 10,
                    width: 1,
                    background: marker.color,
                  }} />
                ))}
              </>
            )}
          </div>
          <div style={{ color: '#334455', fontSize: 8, marginTop: 2 }}>
            Total flight: {fmt(analysis.flight_time_s)} · {analysis.dist_km} km
          </div>
        </div>

        {/* Shelter deadlines */}
        <div style={{ marginBottom: 10, padding: '6px 8px', background: '#050D18', border: '1px solid #0D1E2E' }}>
          <div style={{ color: '#334455', fontSize: 9, letterSpacing: '0.1em', marginBottom: 5 }}>
            SHELTER DEADLINES
          </div>
          {[
            { label: 'Reach hardened shelter (50m)', t: shelter_windows.shelter_deadline_s, color: '#FF8800', icon: '🏠' },
            { label: 'Run to trench / hull-down (100m)', t: shelter_windows.cover_deadline_s, color: '#FF4400', icon: '🏃' },
            { label: 'Immediate prone / hard cover', t: shelter_windows.react_deadline_s, color: '#FF0000', icon: '⬇' },
          ].map(({ label, t, color, icon }) => {
            const passed = elapsed >= t;
            const timeLeft = Math.max(t - elapsed, 0);
            return (
              <div key={label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 0',
                borderBottom: '1px solid #0D1E2E',
                opacity: passed && !impacted ? 0.4 : 1,
              }}>
                <span style={{ color: passed ? '#334455' : color, fontSize: 9 }}>
                  {passed ? '✓' : icon} {label}
                </span>
                <span style={{
                  color: passed ? '#334455' : color,
                  fontSize: 10,
                  fontWeight: 'bold',
                }}>
                  {passed ? 'PASSED' : fmt(timeLeft)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Blast zones */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ color: '#334455', fontSize: 9, letterSpacing: '0.1em', marginBottom: 5 }}>
            BLAST EFFECT ZONES (radius from impact)
          </div>
          {[
            { label: 'LETHAL — 50% casualty in open',   r: blast_radii.lethal_m,   color: ZONE_COLORS.lethal   },
            { label: 'SEVERE — blast injury / structure', r: blast_radii.severe_m,   color: ZONE_COLORS.severe   },
            { label: 'MODERATE — eardrum / debris',      r: blast_radii.moderate_m, color: ZONE_COLORS.moderate },
            { label: 'LIGHT — glass / minor injury',     r: blast_radii.light_m,    color: ZONE_COLORS.light    },
          ].map(({ label, r, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, background: color + '44', border: `1px solid ${color}`, flexShrink: 0 }} />
                <span style={{ color: '#556677', fontSize: 8 }}>{label}</span>
              </div>
              <span style={{ color, fontSize: 9, fontWeight: 'bold', flexShrink: 0, marginLeft: 6 }}>
                {r >= 1000 ? `${(r / 1000).toFixed(1)} km` : `${r} m`}
              </span>
            </div>
          ))}
        </div>

        {/* CEP Probability Rings */}
        {analysis.cep_rings && (
          <div style={{ marginBottom: 10, padding: '6px 8px', background: '#050D18', border: '1px solid #0D1E2E' }}>
            <div style={{ color: '#334455', fontSize: 9, letterSpacing: '0.1em', marginBottom: 5 }}>
              IMPACT PROBABILITY RINGS (Rayleigh)
            </div>
            {[
              { label: '50% (CEP)', r: analysis.cep_rings.r50_m, color: '#ADFF2F' },
              { label: '90%',       r: analysis.cep_rings.r90_m, color: '#FFD700' },
              { label: '95%',       r: analysis.cep_rings.r95_m, color: '#FF8800' },
              { label: '99%',       r: analysis.cep_rings.r99_m, color: '#FF3300' },
            ].map(({ label, r, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: '#445566', fontSize: 8, fontFamily: 'monospace' }}>{label}</span>
                <span style={{ color, fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {r >= 1000 ? `${(r/1000).toFixed(2)} km` : `${r} m`}
                </span>
              </div>
            ))}
            <div style={{ color: '#223344', fontSize: 8, marginTop: 3 }}>
              σ = {analysis.cep_rings.sigma_m} m
              {analysis.physics_model && (
                <span style={{ marginLeft: 8, color: '#1A3A4A' }}>[{analysis.physics_model}]</span>
              )}
            </div>
          </div>
        )}

        {/* Impact Energy */}
        {analysis.impact_energy && (
          <div style={{ marginBottom: 10, padding: '6px 8px', background: '#050D18', border: '1px solid #0D1E2E' }}>
            <div style={{ color: '#334455', fontSize: 9, letterSpacing: '0.1em', marginBottom: 5 }}>
              TERMINAL ENERGY
            </div>
            <Row label="Impact speed"  value={`${analysis.impact_energy.impact_speed_ms} m/s`}  valueColor="#FF6600" />
            <Row label="Impact Mach"   value={`M ${analysis.impact_energy.impact_mach}`}          valueColor="#FF6600" />
            <Row label="Kinetic energy" value={`${analysis.impact_energy.ke_mj} MJ`}             valueColor="#FF8800" />
            <Row label="Warhead (chem)" value={`${analysis.impact_energy.chem_mj} MJ`}           valueColor="#FFAA00" />
            <Row label="Total energy"  value={`${analysis.impact_energy.total_energy_mj} MJ`}    valueColor="#FF4400" />
          </div>
        )}

        {/* Radar Detections (from /analyze-impact-v2) */}
        {analysis.radar_detections?.length > 0 && (
          <div style={{ marginBottom: 10, padding: '6px 8px', background: '#050D18', border: '1px solid #0D1E2E' }}>
            <div style={{ color: '#334455', fontSize: 9, letterSpacing: '0.1em', marginBottom: 5 }}>
              RADAR DETECTION TIMELINE
            </div>
            {analysis.radar_detections.map((d, i) => (
              <div key={d.sensor_id + i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 3, opacity: 1,
              }}>
                <div>
                  <span style={{ color: d.nation === 'Russia' ? '#FF3300' : '#00BFFF', fontSize: 8, fontFamily: 'monospace' }}>
                    {i === 0 ? '◆' : '◇'} {d.sensor_name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: '#556677', fontSize: 8, fontFamily: 'monospace' }}>
                    T+{Math.round(d.time_s)}s
                  </span>
                  <span style={{ color: '#445566', fontSize: 8, fontFamily: 'monospace' }}>
                    {Math.round(d.time_to_impact_s)}s TTI
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Warhead info */}
        {missile && (
          <div style={{ fontSize: 9, color: '#334455', borderTop: '1px solid #0D1E2E', paddingTop: 6 }}>
            Warhead: <span style={{ color: '#556677' }}>{missile.warheadKg || missile.warhead?.split(';')[0]} kg</span>
            &nbsp;·&nbsp;
            Speed: <span style={{ color: '#556677' }}>Mach {missile.speedMach}</span>
            &nbsp;·&nbsp;
            CEP: <span style={{ color: '#556677' }}>{missile.cepMeters || '—'} m</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          from { opacity: 1; }
          to   { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
