from contextlib import asynccontextmanager
import asyncio
import io
import json
from datetime import datetime, timezone
from pathlib import Path
import time
import uuid
import zipfile
import xml.etree.ElementTree as ET

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, List, Optional
import numpy as np
import math
from physics_engine import (
    icao_atmosphere, solve_ballistic, project_latlon,
    cep_rings, impact_energy, network_detections,
    get_missile_physics, cd_cruise, cd_rocket,
    radar_horizon_km, effective_range_km,
    _run_traj, _rk4_step,
)
from data_bridge import track_registry, ws_manager, parse_cot_xml, TRACK_SCHEMA


# ─── Lifespan: background TTL pruner ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    async def _prune_loop():
        while True:
            await asyncio.sleep(5)
            expired = track_registry.prune_expired()
            if expired:
                await ws_manager.broadcast({
                    'type': 'tracks_expired',
                    'ids': expired,
                })
    task = asyncio.create_task(_prune_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- models ----------

BASE_DIR = Path(__file__).resolve().parent.parent
SCENARIO_DIR = BASE_DIR / "data" / "scenarios"

class LOSRequest(BaseModel):
    observer_alt: float
    target_alt: float
    terrain_profile: List[float]

class Waypoint(BaseModel):
    lat: float
    lon: float
    alt: float

class SimPathRequest(BaseModel):
    waypoints: List[Waypoint]
    speed_ms: float
    agl_meters: float
    terrain_heights: List[float]

class BallisticRequest(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float         # terrain height at launch
    target_lat: float
    target_lon: float
    target_alt: float         # terrain height at target
    apogee_km: float          # apogee altitude above ground in km
    speed_mach: float         # average speed in Mach
    steps: int = 200

class CruiseMissileRequest(BaseModel):
    waypoints: List[Waypoint]
    speed_mach: float
    agl_meters: float
    terrain_heights: List[float]

class HypersonicRequest(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float
    target_lat: float
    target_lon: float
    target_alt: float
    apogee_km: float
    speed_mach: float
    steps: int = 300

class RocketRequest(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float
    target_lat: float
    target_lon: float
    target_alt: float
    apogee_km: float
    speed_mach: float
    steps: int = 100

class CUASSystem(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    rangeKm: float

class InterceptRequest(BaseModel):
    flight_path: List[dict]
    cuas_systems: List[CUASSystem]

class ScenarioPayload(BaseModel):
    name: str
    description: str = ""
    state: dict[str, Any] = {}

# ---------- helpers ----------

MACH_TO_MS = 343.0  # m/s per Mach at sea level

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def lerp(a, b, t):
    return a + (b - a) * t

def ballistic_arc(t: float, launch_alt: float, target_alt: float, apogee_m: float) -> float:
    """
    Parabolic altitude profile.
    t=0 → launch_alt, t=0.5 → apogee, t=1 → target_alt
    """
    mid_alt = (launch_alt + target_alt) / 2 + apogee_m
    # Quadratic through (0, launch), (0.5, mid), (1, target)
    # f(t) = a*t^2 + b*t + c
    # c = launch_alt
    # a + b + c = target_alt  → a + b = target_alt - launch_alt
    # 0.25a + 0.5b + c = mid_alt → 0.25a + 0.5b = mid_alt - launch_alt
    c = launch_alt
    b = 4 * (mid_alt - launch_alt) - 2 * (target_alt - launch_alt)
    a = (target_alt - launch_alt) - b
    return a * t**2 + b * t + c

def hypersonic_arc(t: float, launch_alt: float, target_alt: float, apogee_m: float) -> float:
    """
    Hypersonic trajectory: steeper climb, longer glide, sharper terminal dive.
    Apogee shifted toward t=0.35 (earlier peak, longer glide phase).
    """
    peak_t = 0.3
    if t <= peak_t:
        # Climb phase: 0 → apogee
        s = t / peak_t
        return lerp(launch_alt, launch_alt + apogee_m, s)
    else:
        # Glide + terminal phase
        s = (t - peak_t) / (1.0 - peak_t)
        # Slight S-curve for maneuvering glide
        s_smooth = s * s * (3 - 2 * s)
        return lerp(launch_alt + apogee_m, target_alt, s_smooth)

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def _scenario_path(scenario_id: str) -> Path:
    safe_id = "".join(ch for ch in scenario_id if ch.isalnum() or ch in ("-", "_"))
    return SCENARIO_DIR / f"{safe_id}.json"

def _load_scenario_doc(scenario_id: str) -> dict[str, Any] | None:
    path = _scenario_path(scenario_id)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)

def _scenario_summary(doc: dict[str, Any]) -> dict[str, Any]:
    state = doc.get("state", {})
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "description": doc.get("description", ""),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "capability_count": len(state.get("capabilities", [])),
        "unit_count": len(state.get("units", [])),
        "waypoint_count": len(state.get("waypoints", [])),
        "has_impact_analysis": bool(state.get("impact_analysis")),
        "has_simulation": bool(state.get("simulation")),
    }

def _domain_counts(capabilities: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for cap in capabilities:
        domains = cap.get("domains") or [cap.get("type") or "unknown"]
        for domain in domains:
            key = str(domain or "unknown").upper()
            counts[key] = counts.get(key, 0) + 1
    return counts

def _gap_assessment(state: dict[str, Any]) -> dict[str, Any]:
    capabilities = state.get("capabilities", [])
    waypoints = state.get("waypoints", [])
    simulation = state.get("simulation") or {}
    impact = state.get("impact_analysis") or {}
    domains = _domain_counts(capabilities)
    coverage = (simulation.get("threat_intel") or {}).get("coverage") or {}
    gaps = coverage.get("gaps") or []
    longest_gap_s = coverage.get("longest_gap_s")
    coverage_ratio = coverage.get("coverage_ratio")

    findings: list[str] = []
    recommendations: list[str] = []

    required_domains = ["RADAR", "RF", "EOIR", "ACOUSTIC", "CYBER-OSINT"]
    missing_domains = [d for d in required_domains if domains.get(d, 0) == 0]
    if missing_domains:
        findings.append(f"Detection architecture is missing organic {', '.join(missing_domains)} layer coverage.")
        recommendations.append("Add complementary sensors for each missing domain to reduce single-sensor dependency and improve classification confidence.")

    radar_like = domains.get("RADAR", 0) + domains.get("IAMD", 0)
    if radar_like < 2:
        findings.append("Radar/IAMD layer has limited redundancy; one outage or terrain mask could create an immediate surveillance gap.")
        recommendations.append("Add at least one overlapping radar or IAMD sensor with a different location, band, or elevation geometry.")

    if len(capabilities) < 3:
        findings.append("Current capability density is low for layered defense planning.")
        recommendations.append("Build a layered baseline with detect, classify, track, decide, and defeat functions before validating against threat paths.")

    if waypoints and len(waypoints) < 2:
        findings.append("Threat path has only one waypoint; time-to-impact and coverage gap analysis require an origin and terminal point.")
        recommendations.append("Add at least two threat waypoints, then rerun the simulation to populate detection timelines.")

    if isinstance(coverage_ratio, (int, float)) and coverage_ratio < 0.7:
        findings.append(f"Simulated sensor coverage is {coverage_ratio:.0%}, below a robust planning threshold.")
        recommendations.append("Reposition sensors to overlap the longest blind segment, then rerun the threat simulation.")

    if isinstance(longest_gap_s, (int, float)) and longest_gap_s > 30:
        findings.append(f"Longest blind gap is {longest_gap_s:.1f} seconds.")
        recommendations.append("Prioritize short-range RF/EOIR/acoustic fills near the blind segment and add cueing from the first detecting radar.")

    detections = impact.get("radar_detections") or []
    flight_time = impact.get("flight_time_s")
    if impact and not detections:
        findings.append("Impact analysis exists but no radar detections are recorded for the impact track.")
        recommendations.append("Validate sensor placement, range, altitude limits, and radar horizon against the launch-to-impact geometry.")

    if isinstance(flight_time, (int, float)) and flight_time < 120:
        findings.append(f"Warning timeline is compressed at {flight_time:.1f} seconds from launch to impact.")
        recommendations.append("Pre-plan protected positions, rehearse immediate action drills, and place early-warning sensors closer to likely launch corridors.")

    if not findings:
        findings.append("No critical architecture gaps were detected from the saved scenario data.")
        recommendations.append("Stress-test the plan with faster threats, lower-altitude ingress, weather degradation, and sensor outages.")

    return {
        "domain_counts": domains,
        "missing_domains": missing_domains,
        "findings": findings,
        "recommendations": recommendations,
        "coverage_ratio": coverage_ratio,
        "longest_gap_s": longest_gap_s,
        "blind_gaps": gaps[:5],
    }

def _format_report(doc: dict[str, Any]) -> str:
    state = doc.get("state", {})
    capabilities = state.get("capabilities", [])
    units = state.get("units", [])
    waypoints = state.get("waypoints", [])
    impact = state.get("impact_analysis") or {}
    simulation = state.get("simulation") or {}
    threat = state.get("selected_threat") or {}
    kill_chain = state.get("kill_chain_status") or {}
    gap = _gap_assessment(state)
    lines = [
        "# MDPT SCENARIO REPORT",
        "",
        f"REPORT TYPE: Military planning gap analysis",
        f"SCENARIO: {doc.get('name', 'Untitled Scenario')}",
        f"SCENARIO ID: {doc.get('id')}",
        f"GENERATED: {_utc_now_iso()}",
        f"LAST UPDATED: {doc.get('updated_at')}",
        "",
        "## 1. EXECUTIVE SUMMARY",
        "",
        f"- Units placed: {len(units)}",
        f"- Detection / weapon capabilities placed: {len(capabilities)}",
        f"- Threat waypoints: {len(waypoints)}",
        f"- Selected threat: {threat.get('name', 'Not specified')}",
        f"- Coverage ratio: {gap['coverage_ratio']:.0%}" if isinstance(gap["coverage_ratio"], (int, float)) else "- Coverage ratio: Not simulated",
        f"- Longest blind gap: {gap['longest_gap_s']:.1f} seconds" if isinstance(gap["longest_gap_s"], (int, float)) else "- Longest blind gap: Not simulated",
        "",
        "## 2. MISSION / SCENARIO DESCRIPTION",
        "",
        doc.get("description") or "No narrative description was provided by the planner.",
        "",
        "## 3. FRIENDLY / ENEMY UNIT LAYOUT",
        "",
    ]

    if units:
        for unit in units:
            lines.append(f"- {unit.get('name', 'Unit')} | faction={unit.get('faction', 'unknown')} | lat={unit.get('lat')} lon={unit.get('lon')}")
    else:
        lines.append("- No maneuver units saved in this scenario.")

    lines.extend(["", "## 4. SENSOR AND WEAPON ARCHITECTURE", ""])
    if capabilities:
        for cap in capabilities:
            domains = ", ".join(cap.get("domains") or [cap.get("type", "unknown")])
            lines.append(
                f"- {cap.get('name', 'Capability')} | type={cap.get('type', 'unknown')} | domains={domains} | "
                f"range={cap.get('rangeKm', 'n/a')} km | ceiling={cap.get('altitudeFtAGL', 'n/a')} ft AGL | "
                f"quality={cap.get('quality', 'n/a')} | lat={cap.get('lat')} lon={cap.get('lon')}"
            )
    else:
        lines.append("- No detection or weapon capabilities saved.")

    lines.extend(["", "## 5. LAYER COVERAGE SUMMARY", ""])
    if gap["domain_counts"]:
        for domain, count in sorted(gap["domain_counts"].items()):
            lines.append(f"- {domain}: {count}")
    else:
        lines.append("- No layer domains available.")

    lines.extend(["", "## 6. THREAT AND IMPACT ANALYSIS", ""])
    if impact:
        lines.extend([
            f"- Flight time: {impact.get('flight_time_s', 'n/a')} seconds",
            f"- Distance: {impact.get('dist_km', 'n/a')} km",
            f"- Warning level: {impact.get('warning_level', 'n/a')}",
            f"- Physics model: {impact.get('physics_model', 'n/a')}",
        ])
        blast = impact.get("blast_radii") or {}
        if blast:
            lines.append(f"- Blast radii: lethal {blast.get('lethal_m')} m; severe {blast.get('severe_m')} m; moderate {blast.get('moderate_m')} m; light {blast.get('light_m')} m")
        if impact.get("radar_detections"):
            lines.append(f"- Radar detections: {len(impact.get('radar_detections'))}")
    else:
        lines.append("- No impact analysis saved. Run impact analysis to populate flight time, blast effects, radar timeline, and shelter windows.")

    lines.extend(["", "## 7. DEFENSIVE KILL CHAIN CHECKLIST", ""])
    if kill_chain:
        for chain_name, steps in kill_chain.items():
            if not isinstance(steps, dict):
                continue
            complete = sum(1 for value in steps.values() if value)
            total = len(steps)
            pct = round((complete / total) * 100) if total else 0
            lines.append(f"- {chain_name.upper()}: {complete}/{total} complete ({pct}%)")
            open_steps = [step for step, value in steps.items() if not value]
            if open_steps:
                lines.append(f"  Open items: {', '.join(open_steps)}")
    else:
        lines.append("- No checklist status saved.")

    lines.extend(["", "## 8. GAP ANALYSIS", ""])
    for finding in gap["findings"]:
        lines.append(f"- {finding}")

    if gap["blind_gaps"]:
        lines.extend(["", "### Blind Gap Detail", ""])
        for item in gap["blind_gaps"]:
            lines.append(f"- {item.get('start_s')}s to {item.get('end_s')}s | duration={item.get('duration_s')}s | segment={item.get('segment', 'n/a')}")

    lines.extend(["", "## 9. RECOMMENDED ACTIONS", ""])
    for idx, rec in enumerate(gap["recommendations"], start=1):
        lines.append(f"{idx}. {rec}")

    lines.extend([
        "",
        "## 10. COMMANDER / PLANNER NOTES",
        "",
        "- Treat all automated calculations as planning estimates until validated against authoritative system performance data, terrain products, weather, ROE, and current intelligence.",
        "- Re-run this scenario after any sensor relocation, threat change, weather degradation, or asset outage.",
    ])

    return "\n".join(lines)

# ---------- endpoints ----------

@app.post("/analyze-gap")
async def analyze_gap(data: LOSRequest):
    if not data.terrain_profile:
        return {
            "is_detected": False,
            "status": "NO TERRAIN PROFILE",
            "intensity": 1.0,
            "obstruction_count": 0,
            "first_obstruction_index": None,
            "min_clearance_m": None,
            "max_obstruction_m": None,
        }

    ray = np.linspace(data.observer_alt, data.target_alt, len(data.terrain_profile))
    terrain_array = np.array(data.terrain_profile)
    clearance = ray - terrain_array
    gaps = np.where(clearance < 0)[0]
    is_detected = len(gaps) == 0
    max_obstruction = abs(float(np.min(clearance))) if len(gaps) else 0.0
    return {
        "is_detected": is_detected,
        "status": "TARGET DETECTED" if is_detected else f"LOS BLOCKED: {len(gaps)} OBSTRUCTIONS",
        "intensity": round(len(gaps) / len(data.terrain_profile), 3),
        "obstruction_count": int(len(gaps)),
        "first_obstruction_index": int(gaps[0]) if len(gaps) else None,
        "min_clearance_m": round(float(np.min(clearance)), 1),
        "max_obstruction_m": round(max_obstruction, 1),
        "obstruction_indices": gaps.astype(int).tolist(),
    }


@app.post("/simulate-path")
async def simulate_path(data: SimPathRequest):
    """Terrain-following path for UAS/drone simulation."""
    wps = data.waypoints
    speed = max(data.speed_ms, 1.0)
    agl = data.agl_meters
    heights = data.terrain_heights

    n_segs = len(wps) - 1
    samples_per_seg = max(len(heights) // n_segs, 1) if n_segs > 0 else len(heights)

    path = []
    total_time = 0.0
    h_idx = 0

    for seg in range(n_segs):
        wp0 = wps[seg]
        wp1 = wps[seg + 1]
        dist_km = haversine_km(wp0.lat, wp0.lon, wp1.lat, wp1.lon)
        seg_duration = (dist_km * 1000.0) / speed
        steps = max(int(seg_duration), 5)

        seg_heights = heights[h_idx: h_idx + samples_per_seg]
        h_idx += samples_per_seg

        for i in range(steps):
            t = i / steps
            terrain_t = t * (len(seg_heights) - 1)
            ti = int(terrain_t)
            tf = terrain_t - ti
            terrain_h = seg_heights[min(ti + 1, len(seg_heights) - 1)] * tf + seg_heights[ti] * (1 - tf) if len(seg_heights) > 1 else (seg_heights[0] if seg_heights else 0)
            path.append({
                "time_s": round(total_time + seg_duration * t, 2),
                "lat": wp0.lat + (wp1.lat - wp0.lat) * t,
                "lon": wp0.lon + (wp1.lon - wp0.lon) * t,
                "alt": terrain_h + agl,
            })
        total_time += seg_duration

    last = wps[-1]
    final_h = heights[-1] if heights else 0
    path.append({"time_s": round(total_time, 2), "lat": last.lat, "lon": last.lon, "alt": final_h + agl})
    return path


@app.post("/simulate-ballistic")
async def simulate_ballistic(data: BallisticRequest):
    """
    Compute a parabolic ballistic trajectory.
    Returns time-stamped positions along the arc.
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon, data.target_lat, data.target_lon)
    speed_ms = data.speed_mach * MACH_TO_MS
    flight_time = (dist_km * 1000.0) / speed_ms

    apogee_m = data.apogee_km * 1000.0
    launch_alt = data.launch_alt
    target_alt = data.target_alt

    path = []
    for i in range(data.steps + 1):
        t = i / data.steps
        lat = lerp(data.launch_lat, data.target_lat, t)
        lon = lerp(data.launch_lon, data.target_lon, t)
        alt = ballistic_arc(t, launch_alt, target_alt, apogee_m)
        path.append({
            "time_s": round(flight_time * t, 2),
            "lat": lat,
            "lon": lon,
            "alt": round(alt, 1),
        })

    return path


@app.post("/simulate-cruise-missile")
async def simulate_cruise_missile(data: CruiseMissileRequest):
    """Terrain-following cruise missile — same model as UAS but faster."""
    wps = data.waypoints
    speed_ms = data.speed_mach * MACH_TO_MS
    agl = data.agl_meters
    heights = data.terrain_heights

    n_segs = max(len(wps) - 1, 1)
    samples_per_seg = max(len(heights) // n_segs, 1)

    path = []
    total_time = 0.0
    h_idx = 0

    for seg in range(len(wps) - 1):
        wp0 = wps[seg]
        wp1 = wps[seg + 1]
        dist_km = haversine_km(wp0.lat, wp0.lon, wp1.lat, wp1.lon)
        seg_dur = (dist_km * 1000.0) / speed_ms
        steps = max(int(seg_dur * 5), 20)  # higher resolution for fast missiles

        seg_h = heights[h_idx: h_idx + samples_per_seg]
        h_idx += samples_per_seg

        for i in range(steps):
            t = i / steps
            hi = int(t * (len(seg_h) - 1)) if len(seg_h) > 1 else 0
            terrain_h = seg_h[hi] if seg_h else 0
            path.append({
                "time_s": round(total_time + seg_dur * t, 3),
                "lat": lerp(wp0.lat, wp1.lat, t),
                "lon": lerp(wp0.lon, wp1.lon, t),
                "alt": terrain_h + agl,
            })
        total_time += seg_dur

    last = wps[-1]
    path.append({"time_s": round(total_time, 3), "lat": last.lat, "lon": last.lon, "alt": (heights[-1] if heights else 0) + agl})
    return path


@app.post("/simulate-hypersonic")
async def simulate_hypersonic(data: HypersonicRequest):
    """
    Hypersonic glide vehicle trajectory.
    Steep climb to apogee at ~t=0.3, long glide phase, sharp terminal dive.
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon, data.target_lat, data.target_lon)
    speed_ms = data.speed_mach * MACH_TO_MS
    flight_time = (dist_km * 1000.0) / speed_ms

    apogee_m = data.apogee_km * 1000.0

    path = []
    for i in range(data.steps + 1):
        t = i / data.steps
        lat = lerp(data.launch_lat, data.target_lat, t)
        lon = lerp(data.launch_lon, data.target_lon, t)
        alt = hypersonic_arc(t, data.launch_alt, data.target_alt, apogee_m)
        path.append({
            "time_s": round(flight_time * t, 3),
            "lat": lat,
            "lon": lon,
            "alt": round(alt, 1),
        })

    return path


@app.post("/simulate-rocket")
async def simulate_rocket(data: RocketRequest):
    """
    Short-range rocket/MLRS — steep ballistic arc.
    Similar to ballistic but with shorter range and different apogee ratio.
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon, data.target_lat, data.target_lon)
    speed_ms = data.speed_mach * MACH_TO_MS
    flight_time = (dist_km * 1000.0) / speed_ms
    apogee_m = data.apogee_km * 1000.0

    path = []
    for i in range(data.steps + 1):
        t = i / data.steps
        # Rockets have sharper arc than ballistic missiles
        lat = lerp(data.launch_lat, data.target_lat, t)
        lon = lerp(data.launch_lon, data.target_lon, t)
        alt = ballistic_arc(t, data.launch_alt, data.target_alt, apogee_m)
        path.append({
            "time_s": round(flight_time * t, 3),
            "lat": lat,
            "lon": lon,
            "alt": round(alt, 1),
        })

    return path


@app.post("/check-intercepts")
async def check_intercepts(data: InterceptRequest):
    """Batch intercept analysis: find first time each C-UAS system engages the threat."""
    events = []
    fired = set()
    for point in data.flight_path:
        for sys in data.cuas_systems:
            key = f"{sys.id}-{sys.lat}-{sys.lon}"
            if key in fired:
                continue
            dist = haversine_km(point["lat"], point["lon"], sys.lat, sys.lon)
            if dist <= sys.rangeKm:
                fired.add(key)
                events.append({
                    "time_s": point["time_s"],
                    "cuas_id": sys.id,
                    "cuas_name": sys.name,
                    "lat": point["lat"],
                    "lon": point["lon"],
                    "alt": point.get("alt", 0),
                })
    return events


# ─── Scenario Persistence + Report Publishing ───────────────────────────────

@app.get("/api/scenarios")
async def list_scenarios():
    SCENARIO_DIR.mkdir(parents=True, exist_ok=True)
    scenarios = []
    for path in sorted(SCENARIO_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with path.open("r", encoding="utf-8") as handle:
                scenarios.append(_scenario_summary(json.load(handle)))
        except (json.JSONDecodeError, OSError):
            continue
    return {"scenarios": scenarios, "count": len(scenarios)}


@app.post("/api/scenarios")
async def save_scenario(payload: ScenarioPayload):
    SCENARIO_DIR.mkdir(parents=True, exist_ok=True)
    scenario_id = str(uuid.uuid4())
    now = _utc_now_iso()
    doc = {
        "id": scenario_id,
        "name": payload.name.strip() or "Untitled Scenario",
        "description": payload.description.strip(),
        "created_at": now,
        "updated_at": now,
        "state": payload.state,
    }
    with _scenario_path(scenario_id).open("w", encoding="utf-8") as handle:
        json.dump(doc, handle, indent=2)
    return {"status": "ok", "scenario": _scenario_summary(doc)}


@app.get("/api/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str):
    doc = _load_scenario_doc(scenario_id)
    if not doc:
        return {"status": "error", "detail": "scenario not found"}
    return {"status": "ok", "scenario": doc}


@app.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str):
    path = _scenario_path(scenario_id)
    if not path.exists():
        return {"status": "error", "detail": "scenario not found"}
    path.unlink()
    return {"status": "ok", "id": scenario_id}


@app.get("/api/scenarios/{scenario_id}/report")
async def get_scenario_report(scenario_id: str):
    doc = _load_scenario_doc(scenario_id)
    if not doc:
        return {"status": "error", "detail": "scenario not found"}
    gap = _gap_assessment(doc.get("state", {}))
    return {
        "status": "ok",
        "scenario_id": scenario_id,
        "generated_at": _utc_now_iso(),
        "gap_analysis": gap,
        "report_markdown": _format_report(doc),
    }


class ImpactAnalysisRequest(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float
    target_lat: float
    target_lon: float
    target_alt: float
    trajectory_type: str        # 'ballistic' | 'cruise' | 'hypersonic' | 'rocket'
    speed_mach: float
    apogee_km: float
    warhead_kg: float           # TNT-equivalent kg
    warhead_type: str = 'he'    # 'he' | 'thermobaric' | 'shaped_charge' | 'cluster'


@app.post("/analyze-impact")
async def analyze_impact(data: ImpactAnalysisRequest):
    """
    Compute:
      - Full trajectory path
      - Flight time in seconds
      - Blast effect radii (lethal, severe, moderate, light)
      - Shelter deadline windows
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon, data.target_lat, data.target_lon)
    speed_ms = data.speed_mach * MACH_TO_MS
    flight_time_s = (dist_km * 1000.0) / speed_ms

    # ── Trajectory path ──
    apogee_m = data.apogee_km * 1000.0
    STEPS = 300
    path = []
    for i in range(STEPS + 1):
        t = i / STEPS
        lat = lerp(data.launch_lat, data.target_lat, t)
        lon = lerp(data.launch_lon, data.target_lon, t)
        if data.trajectory_type == 'hypersonic':
            alt = hypersonic_arc(t, data.launch_alt, data.target_alt, apogee_m)
        elif data.trajectory_type == 'cruise':
            alt = data.launch_alt + apogee_m  # cruise AGL
        else:
            alt = ballistic_arc(t, data.launch_alt, data.target_alt, apogee_m)
        path.append({"time_s": round(flight_time_s * t, 2), "lat": lat, "lon": lon, "alt": round(alt, 1)})

    # ── Blast radii (Hopkinson-Cranz scaling) ──
    # W = TNT equivalent in kg
    W = max(data.warhead_kg, 0.1)

    # Thermobaric multiplier: ~2.5x overpressure radius vs HE
    # Shaped charge: focused blast, lethal zone smaller but penetration higher
    type_mult = {'thermobaric': 2.2, 'he': 1.0, 'shaped_charge': 0.6, 'cluster': 1.3}
    mult = type_mult.get(data.warhead_type, 1.0)

    # Scaled distance factor: cube root of TNT equivalent
    W_cbrt = W ** (1.0 / 3.0)

    # Personnel in open — 50% lethality radius (psi threshold ~12 psi overpressure)
    lethal_radius_m    = round(15.0 * W_cbrt * mult, 1)
    # Severe structural / personnel injury (3–12 psi)
    severe_radius_m    = round(35.0 * W_cbrt * mult, 1)
    # Moderate blast damage / eardrum rupture zone (1–3 psi)
    moderate_radius_m  = round(70.0 * W_cbrt * mult, 1)
    # Light damage: glass breakage, minor injuries (0.5–1 psi)
    light_radius_m     = round(150.0 * W_cbrt * mult, 1)

    # ── Shelter windows ──
    # Assumptions (standard NATO shelter planning):
    #   - Walking to hardened shelter (50m away): 35 sec at 1.4 m/s
    #   - Running to trench/vehicle (100m away): 20 sec at 5 m/s
    #   - React, don life-saving posture (prone behind cover): 5 sec
    WALK_SHELTER_S  = 35   # reach hardened shelter
    RUN_COVER_S     = 20   # reach trench / vehicle hull-down
    REACT_S         = 5    # immediate prone/cover response

    def classify(remaining):
        if remaining <= 0:
            return 'IMPACT', '#CC0000'
        if remaining <= REACT_S:
            return 'TAKE COVER NOW', '#FF0000'
        if remaining <= RUN_COVER_S:
            return 'RUN TO COVER', '#FF4400'
        if remaining <= WALK_SHELTER_S:
            return 'MOVE TO SHELTER', '#FF8800'
        if remaining <= 120:
            return 'PREPARE TO SHELTER', '#FFAA00'
        return 'MONITOR', '#ADFF2F'

    warning_level, warning_color = classify(flight_time_s)

    return {
        "flight_time_s": round(flight_time_s, 1),
        "dist_km": round(dist_km, 2),
        "trajectory_path": path,
        "blast_radii": {
            "lethal_m":   lethal_radius_m,
            "severe_m":   severe_radius_m,
            "moderate_m": moderate_radius_m,
            "light_m":    light_radius_m,
        },
        "shelter_windows": {
            "react_deadline_s":   round(flight_time_s - REACT_S, 1),
            "cover_deadline_s":   round(flight_time_s - RUN_COVER_S, 1),
            "shelter_deadline_s": round(flight_time_s - WALK_SHELTER_S, 1),
        },
        "warning_level": warning_level,
        "warning_color": warning_color,
    }


# ─── Physics-Based Trajectory ────────────────────────────────────────────────

class PhysicsTrajectoryRequest(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float
    target_lat: float
    target_lon: float
    target_alt: float
    missile_id: str = '_default_ballistic'
    trajectory_type: str = 'ballistic'   # ballistic|cruise|hypersonic|rocket
    speed_mach: float = 3.0
    apogee_km: float = 20.0
    warhead_kg: float = 100.0
    cep_meters: float = 50.0
    dt: float = 0.5


@app.post("/physics-trajectory")
async def physics_trajectory(data: PhysicsTrajectoryRequest):
    """
    Real physics-based trajectory using ICAO atmosphere and RK4 integration.
    Returns full time-stepped path with speed, Mach, altitude, and CEP rings.
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon,
                           data.target_lat, data.target_lon)
    range_m = dist_km * 1000.0
    phys = get_missile_physics(data.missile_id, data.trajectory_type)

    if data.trajectory_type in ('ballistic', 'hypersonic'):
        traj_2d = solve_ballistic(
            range_m       = range_m,
            launch_alt_m  = data.launch_alt,
            target_alt_m  = data.target_alt,
            apogee_km     = data.apogee_km,
            mass_kg       = phys['mass_kg'],
            cd            = phys['cd'],
            frontal_area_m2 = phys['frontal_area_m2'],
            dt            = data.dt,
        )
    elif data.trajectory_type == 'cruise':
        # Cruise: constant AGL, powered (speed controlled by thrust=drag balance)
        speed_ms = data.speed_mach * 343.0
        agl = data.apogee_km * 1000.0
        n = max(int(range_m / speed_ms), 10)
        traj_2d = [
            {'time_s': round(i * range_m / (n * speed_ms), 2),
             'range_m': round(i * range_m / n, 1),
             'alt_m': data.launch_alt + agl,
             'speed_ms': round(speed_ms, 1),
             'mach': round(data.speed_mach, 3)}
            for i in range(n + 1)
        ]
    else:  # rocket
        traj_2d = solve_ballistic(
            range_m, data.launch_alt, data.target_alt,
            data.apogee_km, phys['mass_kg'], phys['cd'],
            phys['frontal_area_m2'], data.dt,
        )

    traj = project_latlon(data.launch_lat, data.launch_lon,
                          data.target_lat, data.target_lon, traj_2d)

    flight_time_s = traj[-1]['time_s'] if traj else 0.0
    impact_spd = traj[-1]['speed_ms'] if traj else data.speed_mach * 343.0
    rings = cep_rings(data.cep_meters)
    energy = impact_energy(impact_spd, data.warhead_kg, phys['mass_kg'])
    rcs = phys.get('rcs_m2', 0.05)

    return {
        'trajectory_path':  traj,
        'flight_time_s':    round(flight_time_s, 1),
        'dist_km':          round(dist_km, 2),
        'impact_speed_ms':  round(impact_spd, 1),
        'rcs_m2':           rcs,
        'cep_rings':        rings,
        'impact_energy':    energy,
        'physics_model':    'ICAO+RK4',
    }


# ─── Radar Network Detection ──────────────────────────────────────────────────

class RadarSensorIn(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    elevationM: float = 50.0
    maxRangeKm: float
    minAltM: float = 0.0
    maxAltM: float = 100_000.0
    refRcsM2: float = 1.0
    nation: str = 'UNK'
    frequencyBand: str = '?'


class RadarTrackRequest(BaseModel):
    trajectory: List[dict]
    sensors: List[RadarSensorIn]
    target_rcs_m2: float = 0.05


@app.post("/radar-track")
async def radar_track(data: RadarTrackRequest):
    """
    Given a trajectory and a list of sensor positions, return all radar
    detection events sorted by time, including downstream cue alerts.
    Uses the full physics radar range equation and 4/3-Earth horizon model.
    """
    sensors = [s.model_dump() for s in data.sensors]
    events = network_detections(data.trajectory, sensors, data.target_rcs_m2)
    return {'detections': events, 'sensor_count': len(sensors)}


# ─── Enhanced Analyze-Impact ──────────────────────────────────────────────────
# Patch the existing /analyze-impact to return physics data too.
# We add new fields; the original response fields are unchanged.

class ImpactAnalysisRequestV2(BaseModel):
    launch_lat: float
    launch_lon: float
    launch_alt: float
    target_lat: float
    target_lon: float
    target_alt: float
    trajectory_type: str = 'ballistic'
    speed_mach: float = 3.0
    apogee_km: float = 20.0
    warhead_kg: float = 100.0
    warhead_type: str = 'he'
    missile_id: str = '_default_ballistic'
    cep_meters: float = 50.0
    sensors: Optional[List[RadarSensorIn]] = None


@app.post("/analyze-impact-v2")
async def analyze_impact_v2(data: ImpactAnalysisRequestV2):
    """
    Full physics-based impact analysis:
      - Real ballistic trajectory (ICAO+RK4)
      - Blast radii (Hopkinson-Cranz)
      - Shelter windows
      - CEP probability rings
      - Impact kinetic energy
      - Radar detection events (if sensors provided)
    """
    dist_km = haversine_km(data.launch_lat, data.launch_lon,
                           data.target_lat, data.target_lon)
    range_m = dist_km * 1000.0
    phys = get_missile_physics(data.missile_id, data.trajectory_type)

    # ── Physics trajectory ──
    if data.trajectory_type in ('ballistic', 'rocket', 'hypersonic'):
        traj_2d = solve_ballistic(range_m, data.launch_alt, data.target_alt,
                                  data.apogee_km, phys['mass_kg'], phys['cd'],
                                  phys['frontal_area_m2'])
    else:
        speed_ms = data.speed_mach * 343.0
        agl = data.apogee_km * 1000.0
        n = max(int(range_m / speed_ms), 10)
        traj_2d = [
            {'time_s': round(i*range_m/(n*speed_ms), 2),
             'range_m': round(i*range_m/n, 1),
             'alt_m': data.launch_alt + agl,
             'speed_ms': round(speed_ms, 1), 'mach': round(data.speed_mach, 3)}
            for i in range(n + 1)
        ]

    traj = project_latlon(data.launch_lat, data.launch_lon,
                          data.target_lat, data.target_lon, traj_2d)
    flight_time_s = traj[-1]['time_s'] if traj else (range_m / (data.speed_mach * 343.0))
    impact_spd = traj[-1]['speed_ms'] if traj else data.speed_mach * 343.0

    # ── Blast radii (Hopkinson-Cranz) ──
    W = max(data.warhead_kg, 0.1)
    type_mult = {'thermobaric': 2.2, 'he': 1.0, 'shaped_charge': 0.6, 'cluster': 1.3}
    mult = type_mult.get(data.warhead_type, 1.0)
    cbrt = W ** (1.0 / 3.0)

    # ── Shelter windows ──
    REACT = 5; COVER = 20; SHELTER = 35

    def classify(t):
        if t <= 0:   return 'IMPACT', '#CC0000'
        if t <= REACT:   return 'TAKE COVER NOW', '#FF0000'
        if t <= COVER:   return 'RUN TO COVER', '#FF4400'
        if t <= SHELTER: return 'MOVE TO SHELTER', '#FF8800'
        if t <= 120:     return 'PREPARE TO SHELTER', '#FFAA00'
        return 'MONITOR', '#ADFF2F'

    level, color = classify(flight_time_s)

    # ── CEP rings & impact energy ──
    rings = cep_rings(data.cep_meters)
    energy = impact_energy(impact_spd, data.warhead_kg, phys['mass_kg'])
    rcs = phys.get('rcs_m2', 0.05)

    # ── Radar detections ──
    detections = []
    if data.sensors:
        sensors = [s.model_dump() for s in data.sensors]
        detections = network_detections(traj, sensors, rcs)

    return {
        'trajectory_path':  traj,
        'flight_time_s':    round(flight_time_s, 1),
        'dist_km':          round(dist_km, 2),
        'blast_radii': {
            'lethal_m':   round(15.0 * cbrt * mult, 1),
            'severe_m':   round(35.0 * cbrt * mult, 1),
            'moderate_m': round(70.0 * cbrt * mult, 1),
            'light_m':    round(150.0 * cbrt * mult, 1),
        },
        'shelter_windows': {
            'react_deadline_s':   round(flight_time_s - REACT, 1),
            'cover_deadline_s':   round(flight_time_s - COVER, 1),
            'shelter_deadline_s': round(flight_time_s - SHELTER, 1),
        },
        'warning_level':  level,
        'warning_color':  color,
        'cep_rings':      rings,
        'impact_energy':  energy,
        'rcs_m2':         rcs,
        'radar_detections': detections,
        'physics_model':  'ICAO+RK4',
    }


# ─── Open Architecture — Data Bridge ─────────────────────────────────────────

class TrackIngest(BaseModel):
    track_id: str
    lat: float
    lon: float
    affiliation: str = 'unknown'
    classification: str = 'unknown'
    alt_m: float = 0.0
    speed_ms: Optional[float] = None
    heading_deg: Optional[float] = None
    source_system: str = 'external'
    callsign: Optional[str] = None
    timestamp_utc: Optional[str] = None
    ttl_s: int = 30
    metadata: dict = {}


class CotBody(BaseModel):
    xml: str


@app.websocket('/ws/tracks')
async def websocket_tracks(ws: WebSocket):
    """
    WebSocket fan-out endpoint. On connect: sends full track snapshot.
    Stays open; server pushes track_update / tracks_expired messages.
    Clients may send JSON track objects to ingest them (same schema as POST /api/tracks/ingest).
    """
    await ws_manager.connect(ws)
    # Send current snapshot
    await ws_manager.send_to(ws, {
        'type': 'snapshot',
        'tracks': track_registry.all(),
        'count': track_registry.count(),
    })
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                if isinstance(data, dict) and 'track_id' in data and 'lat' in data and 'lon' in data:
                    track = track_registry.upsert(data)
                    await ws_manager.broadcast({'type': 'track_update', 'track': track})
            except Exception:
                pass
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)


@app.post('/api/tracks/ingest')
async def ingest_track(track: TrackIngest):
    """Ingest a single track from any external system (JSON format)."""
    payload = track.model_dump()
    stored = track_registry.upsert(payload)
    await ws_manager.broadcast({'type': 'track_update', 'track': stored})
    return {'status': 'ok', 'track_id': stored['track_id'], 'total': track_registry.count()}


@app.post('/api/tracks/ingest/cot')
async def ingest_cot(body: CotBody):
    """Ingest a Cursor on Target (CoT) XML event from ATAK, TAK Server, or any CoT-compliant source."""
    track = parse_cot_xml(body.xml)
    if track is None:
        return {'status': 'error', 'detail': 'invalid CoT XML'}
    stored = track_registry.upsert(track)
    await ws_manager.broadcast({'type': 'track_update', 'track': stored})
    return {'status': 'ok', 'track_id': stored['track_id'], 'total': track_registry.count()}


@app.get('/api/tracks')
async def get_tracks():
    """Return all live tracks (TTL-pruned snapshot)."""
    return {
        'tracks': track_registry.all(),
        'count': track_registry.count(),
        'by_source': track_registry.by_source(),
    }


@app.get('/api/schema/track')
async def get_schema():
    """JSON Schema for the Suwalki Sentinel track format — use for integration documentation."""
    return TRACK_SCHEMA


# ─── KMZ / KML ingestion ─────────────────────────────────────────────────────

# KML namespace variants
_KML_NS = [
    '{http://www.opengis.net/kml/2.2}',
    '{http://earth.google.com/kml/2.2}',
    '{http://earth.google.com/kml/2.1}',
    '',  # no namespace
]

def _kml_find(el, tag):
    for ns in _KML_NS:
        found = el.find(f'{ns}{tag}')
        if found is not None:
            return found
    return None

def _kml_findall(el, tag):
    for ns in _KML_NS:
        results = el.findall(f'.//{ns}{tag}')
        if results:
            return results
    return []

def _kml_text(el, tag):
    child = _kml_find(el, tag)
    return child.text.strip() if child is not None and child.text else ''


def _parse_kml_bytes(kml_bytes: bytes, source_name: str) -> list:
    """Extract Placemarks from KML bytes → list of internal track dicts."""
    try:
        root = ET.fromstring(kml_bytes)
    except ET.ParseError:
        return []

    tracks = []
    placemarks = _kml_findall(root, 'Placemark')
    for pm in placemarks:
        name = _kml_text(pm, 'name') or f'KMZ-{int(time.time()*1000)}'
        description = _kml_text(pm, 'description')

        # Try Point geometry first
        point_el = _kml_find(pm, 'Point')
        if point_el is not None:
            coords_el = _kml_find(point_el, 'coordinates')
            if coords_el is not None and coords_el.text:
                parts = coords_el.text.strip().split(',')
                try:
                    lon = float(parts[0])
                    lat = float(parts[1])
                    alt = float(parts[2]) if len(parts) > 2 else 0.0
                    tracks.append({
                        'track_id':       f'kmz-{source_name}-{name}'.replace(' ', '_')[:64],
                        'callsign':       name,
                        'lat':            lat,
                        'lon':            lon,
                        'alt_m':          alt,
                        'affiliation':    'unknown',
                        'classification': 'unknown',
                        'source_system':  source_name,
                        'timestamp_utc':  None,
                        'ttl_s':          3600,  # KMZ placemarks are static; 1h TTL
                        'format':         'kml',
                        'metadata':       {'description': description},
                    })
                except (ValueError, IndexError):
                    pass
    return tracks


@app.post('/api/import/kmz')
async def import_kmz(file: UploadFile = File(...)):
    """
    Accept a KMZ or KML file upload and ingest all Point placemarks as tracks.
    Non-point geometry (lines, polygons) is acknowledged but not tracked.
    For full visual rendering of KMZ, load the file directly in the client UI.
    """
    raw = await file.read()
    source = file.filename or 'kmz-upload'
    kml_bytes = None

    if file.filename and file.filename.lower().endswith('.kmz'):
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                # KMZ standard: primary KML is doc.kml or the first .kml entry
                kml_names = [n for n in zf.namelist() if n.lower().endswith('.kml')]
                primary = next((n for n in kml_names if n.lower() in ('doc.kml', 'index.kml')), kml_names[0] if kml_names else None)
                if primary:
                    kml_bytes = zf.read(primary)
        except zipfile.BadZipFile:
            return {'status': 'error', 'detail': 'not a valid KMZ (zip) file'}
    else:
        kml_bytes = raw  # treat as raw KML

    if not kml_bytes:
        return {'status': 'error', 'detail': 'no KML content found in file'}

    tracks = _parse_kml_bytes(kml_bytes, source)
    ingested = []
    for track in tracks:
        stored = track_registry.upsert(track)
        ingested.append(stored)

    if ingested:
        await ws_manager.broadcast({'type': 'snapshot', 'tracks': track_registry.all(), 'count': track_registry.count()})

    return {
        'status': 'ok',
        'file': source,
        'placemarks_ingested': len(ingested),
        'total_tracks': track_registry.count(),
        'track_ids': [t['track_id'] for t in ingested],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
