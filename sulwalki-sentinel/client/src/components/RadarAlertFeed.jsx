import { useEffect, useRef } from 'react';

const NATION_COLOR = {
  'US/NATO':        '#00BFFF',
  'Poland/NATO':    '#4488FF',
  'Lithuania/NATO': '#00BFFF',
  'Germany/NATO':   '#88AAFF',
  'Russia':         '#FF3300',
};

function fmt(s) {
  if (s == null) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `T+${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function fmtMs(v) {
  if (v == null) return '—';
  return v >= 1000 ? `${(v/1000).toFixed(2)} km/s` : `${Math.round(v)} m/s`;
}

function Row({ label, val, color = '#556677', valColor = '#AABBCC' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
      <span style={{ color, fontSize: 8, fontFamily: 'monospace' }}>{label}</span>
      <span style={{ color: valColor, fontSize: 8, fontFamily: 'monospace', fontWeight: 'bold' }}>{val}</span>
    </div>
  );
}

function DetectionCard({ event, index }) {
  const isFirst = index === 0;
  const nation = event.nation ?? '?';
  const nc = NATION_COLOR[nation] ?? '#AABBCC';
  const tti = event.time_to_impact_s;

  return (
    <div style={{
      marginBottom: 6,
      padding: '7px 9px',
      background: isFirst ? '#0A1822' : '#060E18',
      border: `1px solid ${nc}${isFirst ? '88' : '33'}`,
      boxShadow: isFirst ? `0 0 10px ${nc}22` : 'none',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <span style={{ color: nc, fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.06em' }}>
            {isFirst ? '◆ ' : '◇ '}{event.sensor_name ?? event.sensor_id}
          </span>
          {event.cued_by && (
            <span style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace', marginLeft: 5 }}>
              [CUED]
            </span>
          )}
        </div>
        <span style={{
          color: nc,
          fontSize: 9,
          fontFamily: 'monospace',
          background: nc + '22',
          padding: '1px 5px',
          border: `1px solid ${nc}44`,
        }}>
          {fmt(event.time_s)}
        </span>
      </div>

      {/* Detection data */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 8px' }}>
        <Row label="NATION"   val={nation}                          valColor={nc} />
        <Row label="BAND"     val={event.freq_band ?? '?'}          valColor="#6688AA" />
        <Row label="ALT"      val={event.alt_m != null ? `${Math.round(event.alt_m).toLocaleString()} m` : '—'} />
        <Row label="SPEED"    val={fmtMs(event.speed_ms)}           valColor="#AABBCC" />
        <Row label="MACH"     val={event.mach != null ? `M ${event.mach.toFixed(2)}` : '—'} valColor="#FFAA00" />
        <Row label="RANGE"    val={event.range_km != null ? `${event.range_km.toFixed(1)} km` : '—'} />
        <Row label="P(det)"   val={event.p_detect != null ? `${Math.round(event.p_detect*100)}%` : '—'} valColor={event.p_detect > 0.8 ? '#00FF7F' : '#FFAA00'} />
        <Row label="TTI"      val={tti != null ? `${Math.round(tti)}s` : '—'} valColor={tti < 30 ? '#FF3300' : tti < 120 ? '#FFAA00' : '#AABBCC'} />
      </div>

      {/* Downstream cue alerts */}
      {event.cue_alerts?.length > 0 && (
        <div style={{ marginTop: 5, borderTop: '1px solid #0D1E2E', paddingTop: 4 }}>
          <div style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace', marginBottom: 3, letterSpacing: '0.1em' }}>
            ▶ CUEING DOWNSTREAM SENSORS:
          </div>
          {event.cue_alerts.map((cue, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
              <span style={{ color: '#4488AA', fontSize: 8, fontFamily: 'monospace' }}>
                → {cue.sensor_name ?? cue.sensor_id}
              </span>
              <span style={{ color: '#556677', fontSize: 8, fontFamily: 'monospace' }}>
                ETA +{Math.round(cue.eta_s ?? 0)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sensor coverage summary row
function CoverageRow({ event }) {
  const nc = NATION_COLOR[event.nation] ?? '#AABBCC';
  const tti = event.time_to_impact_s;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 6px', marginBottom: 2,
      background: '#060E18', border: '1px solid #0D1E2E',
    }}>
      <span style={{ color: nc, fontSize: 8, fontFamily: 'monospace' }}>
        {event.sensor_name}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ color: '#556677', fontSize: 8, fontFamily: 'monospace' }}>{fmt(event.time_s)}</span>
        <span style={{
          color: tti < 30 ? '#FF3300' : '#556677',
          fontSize: 8, fontFamily: 'monospace'
        }}>
          {tti != null ? `${Math.round(tti)}s TTI` : '—'}
        </span>
        <span style={{
          color: event.p_detect > 0.8 ? '#00FF7F' : '#FFAA00',
          fontSize: 8, fontFamily: 'monospace'
        }}>
          {event.p_detect != null ? `${Math.round(event.p_detect*100)}%` : '—'}
        </span>
      </div>
    </div>
  );
}

export default function RadarAlertFeed({ events = [], simElapsed = 0, visible = true }) {
  const feedRef = useRef(null);

  // Auto-scroll to bottom as new detections arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!visible) return null;

  // Events that have triggered so far
  const triggered = events.filter(e => e.time_s <= simElapsed);
  const pending   = events.filter(e => e.time_s  > simElapsed);

  // Split: full detail for first 3, summary for rest
  const detailed = triggered.slice(-3);
  const summary  = triggered.slice(0, Math.max(triggered.length - 3, 0));

  if (events.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 90,
      right: 20,
      width: 310,
      maxHeight: 420,
      background: 'rgba(3, 8, 15, 0.97)',
      border: '1px solid #0D3D5544',
      zIndex: 18,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '7px 10px',
        background: '#050F1A',
        borderBottom: '1px solid #0D3D55',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#00BFFF', fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '0.12em' }}>
            RADAR NETWORK ALERT FEED
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              color: '#ADFF2F', fontSize: 8, fontFamily: 'monospace',
              background: '#ADFF2F22', padding: '1px 5px', border: '1px solid #ADFF2F44',
            }}>
              {triggered.length} DETECT
            </span>
            <span style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace' }}>
              {pending.length} PENDING
            </span>
          </div>
        </div>
        {/* Summary stats */}
        {triggered.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <span style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace' }}>
              FIRST: <span style={{ color: '#00BFFF' }}>{triggered[0]?.sensor_name}</span>
            </span>
            <span style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace' }}>
              {fmt(triggered[0]?.time_s)}
            </span>
          </div>
        )}
      </div>

      {/* Feed body */}
      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}>

        {/* Summary rows for older events */}
        {summary.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#223344', fontSize: 8, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.1em' }}>
              PRIOR DETECTIONS
            </div>
            {summary.map((evt, i) => <CoverageRow key={evt.sensor_id + i} event={evt} />)}
          </div>
        )}

        {/* Detailed cards for recent events */}
        {detailed.length > 0 && (
          <div>
            {summary.length > 0 && (
              <div style={{ color: '#223344', fontSize: 8, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.1em' }}>
                CURRENT / RECENT
              </div>
            )}
            {detailed.map((evt, i) => (
              <DetectionCard key={evt.sensor_id + i} event={evt} index={i} />
            ))}
          </div>
        )}

        {/* Pending sensors */}
        {pending.length > 0 && (
          <div style={{ marginTop: 6, borderTop: '1px solid #0D1E2E', paddingTop: 6 }}>
            <div style={{ color: '#223344', fontSize: 8, fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.1em' }}>
              SENSORS IN PROJECTED PATH
            </div>
            {pending.map((evt, i) => (
              <div key={evt.sensor_id + i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '3px 6px', marginBottom: 2,
                background: 'transparent', border: '1px solid #0D1E2E',
                opacity: 0.6,
              }}>
                <span style={{ color: '#334455', fontSize: 8, fontFamily: 'monospace' }}>
                  ◌ {evt.sensor_name}
                </span>
                <span style={{ color: '#223344', fontSize: 8, fontFamily: 'monospace' }}>
                  {fmt(evt.time_s)} · {Math.round(evt.time_to_impact_s ?? 0)}s TTI
                </span>
              </div>
            ))}
          </div>
        )}

        {events.length > 0 && triggered.length === 0 && (
          <div style={{ color: '#223344', fontSize: 9, fontFamily: 'monospace', textAlign: 'center', padding: 12 }}>
            Monitoring {events.length} sensor{events.length !== 1 ? 's' : ''} in projected path...
          </div>
        )}
      </div>

      <style>{`
        @keyframes radarPulse {
          from { opacity: 1; }
          to   { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
