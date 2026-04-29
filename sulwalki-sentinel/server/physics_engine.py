"""
Suwalki Sentinel — Physics Engine
Real trajectory simulation using ICAO Standard Atmosphere and RK4 integration.
"""

import math
import numpy as np
from typing import Dict, List, Optional, Tuple

# ─── Constants ────────────────────────────────────────────────────────────────
G       = 9.80665     # m/s²   WGS-84 standard gravity
R_EARTH = 6_371_008.8 # m      mean Earth radius
R_GAS   = 287.058     # J/kg·K dry air gas constant
GAMMA   = 1.4         # specific heat ratio

# ─── ICAO Standard Atmosphere (0–86 km) ──────────────────────────────────────
# (base_alt_m, base_temp_K, lapse_K/m, base_pressure_Pa)
_ISA_LAYERS: List[Tuple] = [
    (0,     288.15, -6.5e-3, 101_325.00),
    (11000, 216.65,  0.0,     22_632.10),
    (20000, 216.65,  1.0e-3,   5_474.89),
    (32000, 228.65,  2.8e-3,     868.019),
    (47000, 270.65,  0.0,        110.906),
    (51000, 270.65, -2.8e-3,      66.9388),
    (71000, 214.65, -2.0e-3,       3.95642),
    (86000, 186.87,  0.0,          0.37338),
]

def icao_atmosphere(alt_m: float) -> Tuple[float, float, float]:
    """Return (density kg/m³, temperature K, speed_of_sound m/s). Valid 0–86 km."""
    alt = float(np.clip(alt_m, 0.0, 86_000.0))
    base_alt, T_base, lapse, p_base = _ISA_LAYERS[0]
    for row in _ISA_LAYERS[1:]:
        if alt < row[0]:
            break
        base_alt, T_base, lapse, p_base = row

    dh = alt - base_alt
    if abs(lapse) < 1e-12:
        T = T_base
        p = p_base * math.exp(-G * dh / (R_GAS * T))
    else:
        T = T_base + lapse * dh
        p = p_base * (T / T_base) ** (-G / (lapse * R_GAS))

    rho = p / (R_GAS * T)
    sos = math.sqrt(GAMMA * R_GAS * T)
    return float(rho), float(T), float(sos)


# ─── Drag Coefficient Models ──────────────────────────────────────────────────

def cd_ballistic(mach: float) -> float:
    """Cd for a ballistic reentry body (von Kármán nose cone, typical SRBM)."""
    if   mach < 0.50: return 0.27
    elif mach < 0.85: return 0.27 + 0.03 * (mach - 0.50) / 0.35
    elif mach < 1.00: return 0.30 + 0.38 * (mach - 0.85) / 0.15   # transonic rise
    elif mach < 1.20: return 0.68 - 0.25 * (mach - 1.00) / 0.20   # supersonic drop
    elif mach < 3.00: return 0.43 - 0.12 * (mach - 1.20) / 1.80
    elif mach < 6.00: return 0.31 - 0.05 * (mach - 3.00) / 3.00
    else:             return 0.26   # hypersonic regime


def cd_cruise(mach: float) -> float:
    """Cd for cruise missile — aerodynamic body, turbofan powered, low drag."""
    if   mach < 0.70: return 0.10
    elif mach < 0.90: return 0.10 + 0.07 * (mach - 0.70) / 0.20
    elif mach < 1.05: return 0.17 + 0.28 * (mach - 0.90) / 0.15   # transonic
    elif mach < 2.00: return 0.45 - 0.18 * (mach - 1.05) / 0.95
    else:             return 0.27


def cd_rocket(mach: float) -> float:
    """Cd for unguided rocket / artillery shell."""
    if   mach < 0.80: return 0.35
    elif mach < 1.00: return 0.35 + 0.30 * (mach - 0.80) / 0.20
    elif mach < 2.00: return 0.65 - 0.25 * (mach - 1.00)
    elif mach < 4.00: return 0.40 - 0.06 * (mach - 2.00) / 2.00
    else:             return 0.34


# ─── RK4 Integrator in 2-D (downrange × altitude) ────────────────────────────

def _eom(state: np.ndarray, mass_kg: float, cd_area: float, cd_fn) -> np.ndarray:
    """
    Equations of motion: state = [r, z, vr, vz]
    Returns d/dt = [vr, vz, ar, az] including gravity and aerodynamic drag.
    """
    _, z, vr, vz = state
    alt = float(max(0.0, z))
    rho, _, sos = icao_atmosphere(alt)
    v = float(math.hypot(vr, vz))
    mach = v / sos if sos > 0 else 0.0

    drag_acc = (0.5 * rho * v * v * cd_fn(mach) * cd_area) / mass_kg if v > 1e-4 else 0.0
    unit_r = vr / v if v > 1e-4 else 0.0
    unit_z = vz / v if v > 1e-4 else 0.0

    ar = -drag_acc * unit_r
    az = -G - drag_acc * unit_z
    return np.array([vr, vz, ar, az])


def _rk4_step(state: np.ndarray, dt: float,
              mass_kg: float, cd_area: float, cd_fn) -> np.ndarray:
    k1 = _eom(state, mass_kg, cd_area, cd_fn)
    k2 = _eom(state + 0.5*dt*k1, mass_kg, cd_area, cd_fn)
    k3 = _eom(state + 0.5*dt*k2, mass_kg, cd_area, cd_fn)
    k4 = _eom(state + dt*k3, mass_kg, cd_area, cd_fn)
    return state + (dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)


def _run_traj(v0: float, theta: float, launch_alt: float,
              mass_kg: float, cd_area: float, cd_fn,
              dt: float = 0.5) -> List[Dict]:
    """Integrate trajectory from given v0 and launch angle θ (radians)."""
    state = np.array([0.0, launch_alt,
                      v0 * math.cos(theta),
                      v0 * math.sin(theta)])
    points = []
    t = 0.0

    while t <= 3600.0:
        r, z, vr, vz = state
        alt = float(max(0.0, z))
        rho, _, sos = icao_atmosphere(alt)
        v = float(math.hypot(vr, vz))
        mach = v / sos if sos > 0 else 0.0

        points.append({
            'time_s':   round(t, 2),
            'range_m':  round(float(r), 1),
            'alt_m':    round(alt, 1),
            'speed_ms': round(v, 1),
            'mach':     round(mach, 3),
        })

        # Stop when below launch altitude (hit terrain)
        if t > 5.0 and z < launch_alt - 100.0:
            break

        state = _rk4_step(state, dt, mass_kg, cd_area, cd_fn)
        t += dt

    return points


# ─── Ballistic BVP Solver ─────────────────────────────────────────────────────

def solve_ballistic(range_m: float, launch_alt_m: float, target_alt_m: float,
                    apogee_km: float, mass_kg: float, cd: float,
                    frontal_area_m2: float, dt: float = 0.5) -> List[Dict]:
    """
    Physics-based ballistic trajectory via boundary-value problem solver.

    Method:
      1. Compute vacuum launch angle θ from published apogee H and range R:
            tan(θ) = 4H / R     [standard ballistic formula]
      2. Binary-search on launch speed v0 until the RK4 trajectory achieves
         the correct downrange distance under real atmospheric drag.
      3. Return the full time-stepped trajectory.
    """
    cd_area = cd * frontal_area_m2
    H = apogee_km * 1000.0

    # Vacuum launch angle
    theta = math.atan(4.0 * H / max(range_m, 1.0))
    theta = float(np.clip(theta, math.radians(5), math.radians(82)))

    # Vacuum v0 as first estimate
    v0_vac = math.sqrt(G * range_m / math.sin(2.0 * theta))

    def final_range(v0: float) -> float:
        pts = _run_traj(v0, theta, launch_alt_m, mass_kg, cd_area, cd_ballistic, dt)
        return pts[-1]['range_m'] if pts else 0.0

    # Binary search — drag shortens range, so we need v0 > v0_vac
    lo, hi = v0_vac * 0.75, v0_vac * 2.5
    v_best = v0_vac
    for _ in range(52):
        mid = (lo + hi) / 2.0
        fr = final_range(mid)
        if abs(fr - range_m) < 150.0:
            v_best = mid
            break
        if fr < range_m:
            lo = mid
        else:
            hi = mid
        v_best = mid

    return _run_traj(v_best, theta, launch_alt_m, mass_kg, cd_area, cd_ballistic, dt)


# ─── Lat/Lon Projection ───────────────────────────────────────────────────────

def project_latlon(launch_lat: float, launch_lon: float,
                   target_lat: float, target_lon: float,
                   traj: List[Dict]) -> List[Dict]:
    """
    Project 2-D (range_m, alt_m) trajectory onto the great-circle between
    launch and target.  Returns list with 'lat', 'lon', 'alt' added.
    """
    dlat = math.radians(target_lat - launch_lat)
    dlon = math.radians(target_lon - launch_lon)
    lat_mid = math.radians((launch_lat + target_lat) / 2.0)

    x_east  = R_EARTH * dlon * math.cos(lat_mid)
    y_north = R_EARTH * dlat
    total_m = math.hypot(x_east, y_north)
    if total_m < 1.0:
        total_m = 1.0

    out = []
    for pt in traj:
        frac = min(max(pt['range_m'] / total_m, 0.0), 1.0)
        out.append({
            **pt,
            'lat': round(launch_lat + (target_lat - launch_lat) * frac, 6),
            'lon': round(launch_lon + (target_lon - launch_lon) * frac, 6),
            'alt': round(pt['alt_m'], 1),
        })
    return out


# ─── CEP → Probability Rings ──────────────────────────────────────────────────

def cep_rings(cep_m: float) -> Dict:
    """
    Compute impact probability ring radii from CEP (50% radius).
    Rayleigh distribution: P(r < R) = 1 − exp(−R²/2σ²)
    where σ = CEP / √(2 ln 2)
    """
    sigma = cep_m / math.sqrt(2.0 * math.log(2.0))

    def r_for_p(p: float) -> float:
        return sigma * math.sqrt(-2.0 * math.log(1.0 - p))

    return {
        'r50_m':   round(cep_m, 1),
        'r90_m':   round(r_for_p(0.90), 1),
        'r95_m':   round(r_for_p(0.95), 1),
        'r99_m':   round(r_for_p(0.99), 1),
        'sigma_m': round(sigma, 1),
    }


# ─── Impact Energy ────────────────────────────────────────────────────────────

def impact_energy(speed_ms: float, warhead_kg: float, total_mass_kg: float) -> Dict:
    """Terminal kinetic energy + chemical energy of warhead."""
    ke = 0.5 * total_mass_kg * speed_ms ** 2
    ke_mj = ke / 1e6
    chem_mj = warhead_kg * 4.184   # 1 kg TNT ≈ 4.184 MJ
    _, _, sos_sl = icao_atmosphere(0)
    return {
        'impact_speed_ms':  round(speed_ms, 1),
        'impact_mach':      round(speed_ms / sos_sl, 2),
        'ke_mj':            round(ke_mj, 2),
        'ke_ktonne':        round(ke / 4.184e12, 7),
        'chem_mj':          round(chem_mj, 1),
        'total_energy_mj':  round(ke_mj + chem_mj, 1),
    }


# ─── Radar Detection Geometry ─────────────────────────────────────────────────

def radar_horizon_km(sensor_alt_m: float, target_alt_m: float) -> float:
    """
    Maximum LOS range using the 4/3 Earth effective radius refraction model
    (standard for radar propagation analysis):
    R = √(2·k·Re·h_sensor) + √(2·k·Re·h_target),  k = 4/3
    """
    k = 4.0 / 3.0
    Re = k * R_EARTH
    return (math.sqrt(2 * Re * max(float(sensor_alt_m), 1.0)) +
            math.sqrt(2 * Re * max(float(target_alt_m), 1.0))) / 1000.0


def effective_range_km(max_range_km: float, ref_rcs_m2: float,
                        tgt_rcs_m2: float) -> float:
    """
    Radar range equation — R ∝ σ^(1/4):
    R_eff = R_max · (σ_target / σ_ref)^0.25
    """
    if ref_rcs_m2 <= 0 or tgt_rcs_m2 <= 0:
        return float(max_range_km)
    return float(max_range_km) * (tgt_rcs_m2 / ref_rcs_m2) ** 0.25


def detect_on_traj(traj: List[Dict], sensor: Dict,
                   target_rcs_m2: float) -> Optional[Dict]:
    """
    Return the FIRST point on the trajectory where the sensor can detect
    the threat, or None.

    Required sensor fields:
      id, name, lat, lon, elevationM, maxRangeKm, minAltM, maxAltM, refRcsM2
    Optional: nation, frequencyBand
    """
    s_lat  = sensor['lat']
    s_lon  = sensor['lon']
    s_alt  = sensor.get('elevationM', 50)
    s_rmax = sensor.get('maxRangeKm', 100)
    s_rref = sensor.get('refRcsM2', 1.0)
    s_mina = sensor.get('minAltM', 0)
    s_maxa = sensor.get('maxAltM', 100_000)

    eff_km = effective_range_km(s_rmax, s_rref, target_rcs_m2)

    for pt in traj:
        t_lat = pt['lat']
        t_lon = pt['lon']
        t_alt = pt.get('alt_m', pt.get('alt', 0))

        # Haversine ground range
        dlat = math.radians(t_lat - s_lat)
        dlon = math.radians(t_lon - s_lon)
        a    = (math.sin(dlat/2)**2
                + math.cos(math.radians(s_lat)) * math.cos(math.radians(t_lat))
                * math.sin(dlon/2)**2)
        gnd_km = 2 * R_EARTH * math.atan2(math.sqrt(a), math.sqrt(1-a)) / 1000.0

        # Radar horizon check
        horiz_km = radar_horizon_km(s_alt, t_alt)

        if gnd_km <= min(eff_km, horiz_km) and s_mina <= t_alt <= s_maxa:
            # Swerling-2 detection probability proxy
            snr_r4 = (eff_km / max(gnd_km, 0.05)) ** 4
            p_d = min(1.0 - math.exp(-0.5 * snr_r4), 0.99)
            v = pt.get('speed_ms', 0)
            _, _, sos_sl = icao_atmosphere(0)
            return {
                'sensor_id':    sensor.get('id', '?'),
                'sensor_name':  sensor.get('name', 'Unknown'),
                'nation':       sensor.get('nation', '?'),
                'freq_band':    sensor.get('frequencyBand', '?'),
                'time_s':       pt['time_s'],
                'lat':          t_lat,
                'lon':          t_lon,
                'alt_m':        t_alt,
                'speed_ms':     v,
                'mach':         round(v / sos_sl, 2) if sos_sl > 0 else 0,
                'range_km':     round(gnd_km, 2),
                'p_detect':     round(p_d, 3),
                'eff_range_km': round(eff_km, 1),
                'horiz_km':     round(horiz_km, 1),
            }
    return None


def network_detections(traj: List[Dict], sensors: List[Dict],
                        target_rcs_m2: float) -> List[Dict]:
    """
    Run detection analysis against every sensor in the network.
    Returns events sorted by time, each with downstream cue alerts.
    """
    events = [e for e in
              (detect_on_traj(traj, s, target_rcs_m2) for s in sensors)
              if e is not None]
    events.sort(key=lambda e: e['time_s'])

    flight_end = traj[-1]['time_s'] if traj else 0.0
    for i, evt in enumerate(events):
        evt['time_to_impact_s'] = round(flight_end - evt['time_s'], 1)
        evt['cued_by'] = None if i == 0 else events[0]['sensor_id']
        evt['cue_alerts'] = (
            [{'sensor_id': s['sensor_id'],
              'sensor_name': s['sensor_name'],
              'eta_s': round(s['time_s'] - evt['time_s'], 1)}
             for s in events[1:4]]
            if i == 0 else []
        )
    return events


# ─── Missile Physics Profiles ─────────────────────────────────────────────────
# Per-missile physical parameters for the RK4 solver.
# Mass is total vehicle mass at burnout (the phase we simulate ballistically).
# Frontal area = π·(d/2)²  for typical body diameter.

MISSILE_PHYSICS: Dict[str, Dict] = {
    # SRBM
    'iskander-m':   {'mass_kg': 3800, 'cd': 0.30, 'frontal_area_m2': 0.665, 'rcs_m2': 0.05},
    'iskander-k':   {'mass_kg': 3800, 'cd': 0.28, 'frontal_area_m2': 0.665, 'rcs_m2': 0.02},
    # Cruise
    'kalibr-3m14':  {'mass_kg': 2200, 'cd': 0.12, 'frontal_area_m2': 0.196, 'rcs_m2': 0.02},
    'kh-101':       {'mass_kg': 2400, 'cd': 0.10, 'frontal_area_m2': 0.196, 'rcs_m2': 0.004},
    'kh-55':        {'mass_kg': 1700, 'cd': 0.14, 'frontal_area_m2': 0.196, 'rcs_m2': 0.05},
    # Hypersonic
    'kinzhal':      {'mass_kg': 4000, 'cd': 0.28, 'frontal_area_m2': 0.385, 'rcs_m2': 0.03},
    'zircon':       {'mass_kg': 2000, 'cd': 0.25, 'frontal_area_m2': 0.196, 'rcs_m2': 0.01},
    # Ballistic
    'ss-1-scud-b':  {'mass_kg': 6400, 'cd': 0.40, 'frontal_area_m2': 0.950, 'rcs_m2': 0.15},
    'ss-21-tochka': {'mass_kg': 2010, 'cd': 0.35, 'frontal_area_m2': 0.385, 'rcs_m2': 0.08},
    # Rocket / MLRS
    '9m549-mrls':   {'mass_kg':  258, 'cd': 0.45, 'frontal_area_m2': 0.049, 'rcs_m2': 0.02},
    '9m55-smerch':  {'mass_kg':  800, 'cd': 0.42, 'frontal_area_m2': 0.095, 'rcs_m2': 0.03},
    # Default fallback
    '_default_ballistic': {'mass_kg': 1000, 'cd': 0.35, 'frontal_area_m2': 0.196, 'rcs_m2': 0.05},
    '_default_cruise':    {'mass_kg':  800, 'cd': 0.12, 'frontal_area_m2': 0.196, 'rcs_m2': 0.03},
    '_default_rocket':    {'mass_kg':  200, 'cd': 0.45, 'frontal_area_m2': 0.049, 'rcs_m2': 0.02},
}

def get_missile_physics(missile_id: str, traj_type: str) -> Dict:
    if missile_id in MISSILE_PHYSICS:
        return MISSILE_PHYSICS[missile_id]
    if traj_type == 'cruise':
        return MISSILE_PHYSICS['_default_cruise']
    if traj_type == 'rocket':
        return MISSILE_PHYSICS['_default_rocket']
    return MISSILE_PHYSICS['_default_ballistic']
