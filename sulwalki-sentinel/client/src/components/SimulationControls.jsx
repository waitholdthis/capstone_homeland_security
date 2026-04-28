export default function SimulationControls({ active, playing, speed, setSpeed, onPlay, onStop, intercepts, elapsed, threatIntel }) {
  if (!active) return null;

  const fmt = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `T+${m}:${sec}`;
  };

  const fmtDuration = (s) => {
    const safe = Math.max(s ?? 0, 0);
    const m = Math.floor(safe / 60).toString().padStart(2, '0');
    const sec = Math.floor(safe % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
  const mc = threatIntel?.monte_carlo;
  const coverage = threatIntel?.coverage;
  const topSensors = mc?.sensor_hits?.filter(hit => hit.probability > 0.05).slice(0, 3) ?? [];

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 300,
      right: 0,
      background: 'rgba(5, 10, 18, 0.92)',
      borderTop: '1px solid #1A2A3A',
      padding: '10px 20px',
      zIndex: 10,
      fontFamily: 'monospace',
      display: 'flex',
      gap: 20,
      alignItems: 'stretch',
    }}>
      {/* Controls */}
      <div style={{ flexShrink: 0, width: 360 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button
            onClick={onPlay}
            style={{
              padding: '6px 14px',
              background: playing ? '#00FF7F22' : 'transparent',
              border: `1px solid ${playing ? '#00FF7F' : '#334'}`,
              color: playing ? '#00FF7F' : '#8899AA',
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {playing ? 'PAUSE' : 'PLAY'}
          </button>
          <button
            onClick={onStop}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #AA3333',
              color: '#AA3333',
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            STOP
          </button>

          <div style={{ color: '#445566', fontSize: 11, marginLeft: 8 }}>SPEED:</div>
          {[1, 5, 10].map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: '4px 8px',
                background: speed === s ? '#00FF7F22' : 'transparent',
                border: `1px solid ${speed === s ? '#00FF7F' : '#334'}`,
                color: speed === s ? '#00FF7F' : '#8899AA',
                fontFamily: 'monospace',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <div style={{ color: '#00FF7F', fontSize: 13 }}>
          {fmt(elapsed)}
        </div>
        {threatIntel && (
          <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.5 }}>
            <div style={{ color: '#445566', letterSpacing: '0.1em', marginBottom: 3 }}>IMPACT ESTIMATE</div>
            <div style={{ color: '#AABBCC' }}>
              {threatIntel.target_lat.toFixed(4)}N {threatIntel.target_lon.toFixed(4)}E
            </div>
            <div style={{ color: '#FFAA00' }}>
              TTI {fmtDuration(Math.max(threatIntel.impact_time_s - elapsed, 0))} · +/- {threatIntel.uncertainty_m}m
            </div>
            <div style={{ color: '#8899AA' }}>
              confidence {pct(threatIntel.confidence)} · sensors {threatIntel.sensor_count}
            </div>
            {mc && (
              <div style={{ color: '#789', marginTop: 4 }}>
                MC {mc.samples} runs · P50 {mc.impact_p50_m}m · P90 {mc.impact_p90_m}m
              </div>
            )}
            {coverage && (
              <div style={{ color: coverage.coverage_ratio > 0.65 ? '#00FF7F' : '#FFAA00' }}>
                coverage {pct(coverage.coverage_ratio)} · longest gap {fmtDuration(coverage.longest_gap_s)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#445566', fontSize: 10, marginBottom: 4, letterSpacing: '0.1em' }}>
          SENSOR WARNING LOG
        </div>
        <div style={{ maxHeight: 118, overflowY: 'auto' }}>
          {intercepts.length === 0
            ? <span style={{ color: '#334455', fontSize: 11 }}>
                No sensor crossings yet
                {threatIntel?.events?.length ? ` · ${threatIntel.events.length} predicted` : ''}
              </span>
            : intercepts.map((ev, i) => (
                <div key={i} style={{ color: '#FF6B00', fontSize: 11, marginBottom: 6, borderBottom: '1px solid #152434', paddingBottom: 5 }}>
                  <div>
                    {fmt(ev.time_s)} - <span style={{ color: '#FFD700' }}>{ev.cuas_name}</span>{' '}
                    detected track · TTI <span style={{ color: '#FFAA00' }}>{fmtDuration(ev.time_to_impact_s)}</span>
                  </div>
                  <div style={{ color: '#789', fontSize: 10 }}>
                    closest {ev.closest_km.toFixed(2)}km · confidence {pct(ev.confidence)} · {ev.lat.toFixed(4)}N {ev.lon.toFixed(4)}E
                  </div>
                  {ev.downstream_sensors?.length > 0 && (
                    <div style={{ color: '#AABBCC', fontSize: 10 }}>
                      Next: {ev.downstream_sensors.map(next =>
                        `${next.sensor_name} in ${fmtDuration(next.eta_s)}`
                      ).join(' | ')}
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      </div>

      <div style={{ width: 290, flexShrink: 0 }}>
        <div style={{ color: '#445566', fontSize: 10, marginBottom: 4, letterSpacing: '0.1em' }}>
          PLANNING GAP ANALYSIS
        </div>
        {!threatIntel ? (
          <div style={{ color: '#334455', fontSize: 11 }}>Run a simulation to calculate gaps</div>
        ) : (
          <div style={{ fontSize: 10, lineHeight: 1.55, maxHeight: 118, overflowY: 'auto' }}>
            <div style={{ color: '#AABBCC' }}>
              First warning lead P10/P50/P90:
            </div>
            <div style={{ color: '#FFAA00', marginBottom: 5 }}>
              {fmtDuration(mc?.lead_time_p10_s)} / {fmtDuration(mc?.lead_time_p50_s)} / {fmtDuration(mc?.lead_time_p90_s)}
            </div>

            {topSensors.length > 0 ? (
              topSensors.map(sensor => (
                <div key={sensor.sensor_id} style={{ color: '#789', marginBottom: 3 }}>
                  <span style={{ color: '#FFD700' }}>{sensor.sensor_name}</span>{' '}
                  hit {pct(sensor.probability)} · conf {pct(sensor.avg_confidence)}
                </div>
              ))
            ) : (
              <div style={{ color: '#FF5533', marginBottom: 5 }}>
                No reliable sensor coverage on current route
              </div>
            )}

            {coverage?.gaps?.length > 0 && (
              <div style={{ color: '#FF8866', marginTop: 5 }}>
                Blind gap: {fmt(coverage.gaps[0].start_s)} to {fmt(coverage.gaps[0].end_s)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
