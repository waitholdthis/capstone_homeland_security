from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- models ----------

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
