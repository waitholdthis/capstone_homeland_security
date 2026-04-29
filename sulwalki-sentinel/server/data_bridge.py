"""
Suwalki Sentinel — Open Architecture Data Bridge

Provides:
  - In-memory track registry with TTL-based expiry
  - WebSocket connection manager (fan-out broadcast to all clients)
  - CoT (Cursor on Target) XML parser → internal track format
  - JSON schema export for third-party integration documentation

Track affiliation follows MIL-STD-2525D:
  friendly | hostile | suspect | neutral | unknown | pending
"""

import asyncio
import json
import math
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket

# ─── Internal Track Model ─────────────────────────────────────────────────────

AFFILIATION_COLORS = {
    'friendly': '#00BFFF',
    'hostile':  '#FF3300',
    'suspect':  '#FF6600',
    'neutral':  '#00FF7F',
    'pending':  '#FFD700',
    'unknown':  '#AAAAAA',
}

COT_TYPE_TO_AFFILIATION = {
    'f': 'friendly',
    'h': 'hostile',
    's': 'suspect',
    'n': 'neutral',
    'u': 'unknown',
    'p': 'pending',
    'j': 'suspect',   # joker
    'k': 'hostile',   # faker
}

COT_TYPE_TO_CLASSIFICATION = {
    'G':   'personnel',
    'G-E': 'personnel',
    'G-U': 'personnel',
    'A':   'aircraft',
    'A-C': 'aircraft',     # cargo
    'A-F': 'aircraft',     # fighter
    'A-H': 'aircraft',     # helicopter
    'A-M': 'missile',
    'A-U': 'uas',          # UAS / drone
    'S':   'vessel',
    'S-X': 'vessel',
    'G-V': 'vehicle',
    'G-V-C': 'vehicle',
    'G-V-A': 'vehicle',
}


def _parse_cot_type(cot_type: str):
    """Parse CoT type string (e.g. 'a-h-G-U-C') → (affiliation, classification)."""
    parts = cot_type.split('-')
    # parts[0] = 'a' (atom) | 'b' (bits) | etc.
    # parts[1] = affiliation letter
    # parts[2:] = battle dimension / descriptor
    affil = 'unknown'
    classif = 'unknown'

    if len(parts) >= 2:
        affil = COT_TYPE_TO_AFFILIATION.get(parts[1].lower(), 'unknown')

    if len(parts) >= 3:
        # Try progressively shorter dimension keys
        dim = '-'.join(parts[2:])
        while dim:
            if dim in COT_TYPE_TO_CLASSIFICATION:
                classif = COT_TYPE_TO_CLASSIFICATION[dim]
                break
            dim = '-'.join(dim.split('-')[:-1])

    return affil, classif


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# ─── Track Registry ───────────────────────────────────────────────────────────

class TrackRegistry:
    """Thread-safe in-memory track store. Tracks expire after their TTL."""

    def __init__(self):
        self._tracks: Dict[str, Dict] = {}

    def upsert(self, track: Dict) -> Dict:
        """Insert or update a track. Returns the normalised track dict."""
        tid = track['track_id']
        now = time.time()
        track.setdefault('received_at', now)
        track['updated_at'] = now
        track['color'] = AFFILIATION_COLORS.get(
            track.get('affiliation', 'unknown'), '#AAAAAA'
        )
        self._tracks[tid] = track
        return track

    def remove(self, track_id: str) -> bool:
        return bool(self._tracks.pop(track_id, None))

    def prune_expired(self) -> List[str]:
        """Remove TTL-expired tracks. Returns list of removed IDs."""
        now = time.time()
        expired = [
            tid for tid, t in self._tracks.items()
            if (now - t.get('updated_at', now)) > t.get('ttl_s', 30)
        ]
        for tid in expired:
            del self._tracks[tid]
        return expired

    def all(self) -> List[Dict]:
        return list(self._tracks.values())

    def get(self, track_id: str) -> Optional[Dict]:
        return self._tracks.get(track_id)

    def count(self) -> int:
        return len(self._tracks)

    def by_source(self) -> Dict[str, List[Dict]]:
        result: Dict[str, List[Dict]] = {}
        for t in self._tracks.values():
            src = t.get('source_system', 'unknown')
            result.setdefault(src, []).append(t)
        return result


# ─── WebSocket Fan-out Manager ────────────────────────────────────────────────

class WebSocketManager:
    """Manages all active WebSocket clients and broadcasts messages to them."""

    def __init__(self):
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, message: Dict):
        payload = json.dumps(message)
        dead: Set[WebSocket] = set()
        async with self._lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        if dead:
            async with self._lock:
                self._clients -= dead

    async def send_to(self, ws: WebSocket, message: Dict):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            await self.disconnect(ws)

    def connection_count(self) -> int:
        return len(self._clients)


# ─── CoT XML Parser ───────────────────────────────────────────────────────────

def parse_cot_xml(xml_str: str) -> Optional[Dict]:
    """
    Parse a Cursor on Target (CoT) XML event into our internal track format.
    Returns None if the XML cannot be parsed as a valid CoT event.

    Supports CoT 2.0 schema (MITRE CoT standard, NATO STANAG 4609 compatible).
    """
    try:
        root = ET.fromstring(xml_str.strip())
    except ET.ParseError:
        return None

    if root.tag not in ('event', '{http://www.mitre.org/CoT}event'):
        return None

    uid      = root.get('uid', '')
    cot_type = root.get('type', 'a-u')
    how      = root.get('how', 'm-g')
    time_str = root.get('time', _iso_now())
    stale    = root.get('stale', '')

    point = root.find('point')
    if point is None:
        return None

    try:
        lat = float(point.get('lat', 0))
        lon = float(point.get('lon', 0))
        hae = float(point.get('hae', 0))   # height above ellipsoid (m)
        ce  = float(point.get('ce', 0))    # circular error (m)
    except ValueError:
        return None

    affil, classif = _parse_cot_type(cot_type)

    # Extract optional detail fields
    detail   = root.find('detail') or ET.Element('detail')
    contact  = detail.find('contact')
    callsign = contact.get('callsign', uid) if contact is not None else uid
    track_el = detail.find('track')
    speed_ms = None
    heading  = None
    if track_el is not None:
        try:
            speed_ms = float(track_el.get('speed', 0)) or None
            heading  = float(track_el.get('course', 0)) or None
        except ValueError:
            pass

    # TTL from stale time
    ttl_s = 30
    if stale:
        try:
            fmt = '%Y-%m-%dT%H:%M:%SZ'
            stale_dt = datetime.strptime(stale, fmt).replace(tzinfo=timezone.utc)
            time_dt  = datetime.strptime(time_str, fmt).replace(tzinfo=timezone.utc)
            ttl_s    = max(int((stale_dt - time_dt).total_seconds()), 5)
        except ValueError:
            pass

    return {
        'track_id':       uid or f'cot-{int(time.time()*1000)}',
        'affiliation':    affil,
        'classification': classif,
        'lat':            lat,
        'lon':            lon,
        'alt_m':          hae,
        'speed_ms':       speed_ms,
        'heading_deg':    heading,
        'source_system':  how,          # CoT 'how' field used as source indicator
        'callsign':       callsign,
        'cot_type':       cot_type,
        'ce_m':           ce,
        'timestamp_utc':  time_str,
        'ttl_s':          ttl_s,
        'format':         'cot',
        'metadata':       {},
    }


# ─── JSON Schema for integration documentation ────────────────────────────────

TRACK_SCHEMA = {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    'title': 'Suwalki Sentinel Track',
    'description': (
        'Standardized track format for ingestion via POST /api/tracks/ingest '
        'or WebSocket /ws/tracks. All external systems should conform to this schema.'
    ),
    'type': 'object',
    'required': ['track_id', 'lat', 'lon'],
    'properties': {
        'track_id':       {'type': 'string', 'description': 'Unique track identifier (UUID or system-defined)'},
        'affiliation':    {'type': 'string', 'enum': ['friendly', 'hostile', 'suspect', 'neutral', 'pending', 'unknown'], 'default': 'unknown'},
        'classification': {'type': 'string', 'enum': ['uas', 'aircraft', 'missile', 'vehicle', 'vessel', 'personnel', 'unknown'], 'default': 'unknown'},
        'lat':            {'type': 'number', 'description': 'WGS-84 latitude (decimal degrees)'},
        'lon':            {'type': 'number', 'description': 'WGS-84 longitude (decimal degrees)'},
        'alt_m':          {'type': 'number', 'description': 'Altitude MSL in metres', 'default': 0},
        'speed_ms':       {'type': ['number', 'null'], 'description': 'Speed in m/s'},
        'heading_deg':    {'type': ['number', 'null'], 'description': 'True heading 0–360°'},
        'source_system':  {'type': 'string', 'description': 'Identifier of the reporting system (e.g. "Skyview DIVR Mk-II")'},
        'callsign':       {'type': ['string', 'null'], 'description': 'Human-readable label for this track'},
        'timestamp_utc':  {'type': 'string', 'format': 'date-time', 'description': 'ISO 8601 UTC observation time'},
        'ttl_s':          {'type': 'integer', 'description': 'Time-to-live in seconds before track expires', 'default': 30},
        'metadata':       {'type': 'object', 'description': 'Arbitrary key-value pairs for system-specific extensions'},
    },
    'examples': [
        {
            'track_id': 'TRK-001',
            'affiliation': 'hostile',
            'classification': 'uas',
            'lat': 54.38,
            'lon': 22.12,
            'alt_m': 120,
            'speed_ms': 22.0,
            'heading_deg': 270,
            'source_system': 'Skyview DIVR Mk-II',
            'callsign': 'BANDIT-01',
            'timestamp_utc': '2025-04-28T14:32:00Z',
            'ttl_s': 30,
            'metadata': {'group': 1, 'model': 'DJI Mavic 3'},
        }
    ],
}

# ─── Singleton instances shared across the application ───────────────────────

track_registry = TrackRegistry()
ws_manager     = WebSocketManager()
