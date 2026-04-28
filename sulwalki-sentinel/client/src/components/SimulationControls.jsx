export default function SimulationControls({ active, playing, speed, setSpeed, onPlay, onStop, intercepts, elapsed }) {
  if (!active) return null;

  const fmt = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `T+${m}:${sec}`;
  };

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
      alignItems: 'flex-start',
    }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
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
          {playing ? '⏸ PAUSE' : '▶ PLAY'}
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
          ■ STOP
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
            {s}×
          </button>
        ))}

        <div style={{ color: '#00FF7F', fontSize: 13, marginLeft: 12 }}>
          {fmt(elapsed)}
        </div>
      </div>

      {/* Intercept log */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#445566', fontSize: 10, marginBottom: 4, letterSpacing: '0.1em' }}>
          INTERCEPT LOG
        </div>
        <div style={{ maxHeight: 52, overflowY: 'auto' }}>
          {intercepts.length === 0
            ? <span style={{ color: '#334455', fontSize: 11 }}>No intercepts detected</span>
            : intercepts.map((ev, i) => (
                <div key={i} style={{ color: '#FF6B00', fontSize: 11 }}>
                  {fmt(ev.time_s)} — <span style={{ color: '#FFD700' }}>{ev.cuas_name}</span>{' '}
                  intercept @ {ev.lat.toFixed(4)}°N {ev.lon.toFixed(4)}°E
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
