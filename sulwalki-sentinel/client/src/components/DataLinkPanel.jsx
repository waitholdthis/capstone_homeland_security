// DataLinkPanel — shows live external track feed status and inbound track list.
// Receives data via WebSocket from /ws/tracks.

const AFFIL_COLORS = {
  friendly: '#00BFFF',
  hostile:  '#FF3300',
  suspect:  '#FF6600',
  neutral:  '#00FF7F',
  pending:  '#FFD700',
  unknown:  '#AAAAAA',
};

function TrackRow({ track }) {
  const color = AFFIL_COLORS[track.affiliation] ?? '#AAAAAA';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 0',
      borderBottom: '1px solid #0D1E2A',
      fontSize: 10,
      fontFamily: 'monospace',
    }}>
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 5px ${color}88`,
      }} />
      <span style={{ color, minWidth: 60, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {track.callsign || track.track_id}
      </span>
      <span style={{ color: '#445566', flexShrink: 0 }}>
        {track.classification !== 'unknown' ? track.classification.toUpperCase() : ''}
      </span>
      <span style={{ color: '#334455', marginLeft: 'auto', flexShrink: 0 }}>
        {track.lat?.toFixed(3)}°N {Math.abs(track.lon)?.toFixed(3)}°{track.lon >= 0 ? 'E' : 'W'}
      </span>
    </div>
  );
}

export default function DataLinkPanel({ connected, tracks, connectionUrl }) {
  const bySource = {};
  tracks.forEach(t => {
    const src = t.source_system || 'unknown';
    if (!bySource[src]) bySource[src] = 0;
    bySource[src]++;
  });

  const affiliCounts = {};
  tracks.forEach(t => {
    const a = t.affiliation || 'unknown';
    affiliCounts[a] = (affiliCounts[a] || 0) + 1;
  });

  const sortedTracks = [...tracks].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      right: 20,
      width: 280,
      maxHeight: '75vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(3, 8, 15, 0.96)',
      border: `1px solid ${connected ? '#00FF7F44' : '#FF330044'}`,
      boxShadow: `0 0 18px ${connected ? '#00FF7F22' : '#FF330022'}`,
      zIndex: 15,
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid #0D1E2A',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: connected ? '#00FF7F' : '#FF3300',
          boxShadow: `0 0 6px ${connected ? '#00FF7F' : '#FF3300'}`,
          animation: connected ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{ color: connected ? '#00FF7F' : '#FF3300', fontSize: 10, letterSpacing: '0.14em' }}>
          DATA LINK {connected ? 'ACTIVE' : 'OFFLINE'}
        </span>
        <span style={{ color: '#334455', marginLeft: 'auto', fontSize: 9 }}>
          {tracks.length} TRACKS
        </span>
      </div>

      {/* Connection info */}
      <div style={{ padding: '5px 10px', borderBottom: '1px solid #0D1E2A', flexShrink: 0 }}>
        <div style={{ color: '#334455', fontSize: 8, letterSpacing: '0.1em' }}>ENDPOINT</div>
        <div style={{ color: '#445566', fontSize: 9, wordBreak: 'break-all' }}>{connectionUrl}</div>
      </div>

      {/* Source breakdown */}
      {Object.keys(bySource).length > 0 && (
        <div style={{ padding: '5px 10px', borderBottom: '1px solid #0D1E2A', flexShrink: 0 }}>
          <div style={{ color: '#334455', fontSize: 8, letterSpacing: '0.1em', marginBottom: 4 }}>SOURCES</div>
          {Object.entries(bySource).map(([src, count]) => (
            <div key={src} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 1 }}>
              <span style={{ color: '#556677' }}>{src}</span>
              <span style={{ color: '#7799AA' }}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Affiliation summary */}
      {tracks.length > 0 && (
        <div style={{ padding: '5px 10px', borderBottom: '1px solid #0D1E2A', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {Object.entries(affiliCounts).map(([affil, count]) => (
            <span key={affil} style={{ fontSize: 9, color: AFFIL_COLORS[affil] ?? '#AAAAAA' }}>
              {affil.toUpperCase()} ×{count}
            </span>
          ))}
        </div>
      )}

      {/* Track list */}
      <div style={{ overflowY: 'auto', padding: '4px 10px', flex: 1 }}>
        {sortedTracks.length === 0 ? (
          <div style={{ color: '#334455', fontSize: 10, padding: '8px 0', textAlign: 'center' }}>
            {connected ? 'AWAITING TRACK DATA' : 'NOT CONNECTED'}
          </div>
        ) : (
          sortedTracks.map(t => <TrackRow key={t.track_id} track={t} />)
        )}
      </div>

      {/* Integration tip */}
      <div style={{
        padding: '5px 10px',
        borderTop: '1px solid #0D1E2A',
        flexShrink: 0,
      }}>
        <div style={{ color: '#2A3A4A', fontSize: 8, lineHeight: 1.5 }}>
          POST JSON → /api/tracks/ingest<br />
          POST CoT XML → /api/tracks/ingest/cot<br />
          WS → ws://localhost:8000/ws/tracks
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
