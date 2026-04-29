import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import ms from 'milsymbol';
import "cesium/Build/Cesium/Widgets/widgets.css";
import ToolPanel from './components/ToolPanel';
import SimulationControls from './components/SimulationControls';
import ImpactWarningPanel from './components/ImpactWarningPanel';
import RadarAlertFeed from './components/RadarAlertFeed';
import DataLinkPanel from './components/DataLinkPanel';
import { FACTIONS, UNIT_TYPES } from './data/militaryUnits';
import { CUAS_SYSTEMS } from './data/counterUAS';
import { DRONE_TYPES } from './data/droneTypes';
import { MISSILE_THREATS } from './data/missileThreat';
import { RADAR_SYSTEMS } from './data/radarSystems';
import { GRAPHIC_TYPE_MAP } from './data/planningGraphics';
import { EXERCISE_BOUNDARIES } from './data/exerciseBoundaries';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const WS_TRACKS_URL = import.meta.env.VITE_WS_TRACKS_URL ?? 'ws://localhost:8000/ws/tracks';
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
const getInitialPanelPosition = (width, height, offsetX, offsetY) => {
  if (typeof window === 'undefined') return { x: offsetX, y: offsetY };
  return {
    x: Math.max(8, window.innerWidth - width - offsetX),
    y: Math.max(8, window.innerHeight - height - offsetY),
  };
};
const DEFAULT_PLANNING_ENV = {
  visibility: 'clear',
  precipitation: 'none',
  clutter: 'moderate',
  ew: 'none',
  operatorConfidence: 0.85,
};

const DETECTION_LAYER_ASSETS = [
  {
    id: 'layer-radar',
    name: 'Radar Search Layer',
    domain: 'radar',
    type: 'radar',
    rangeKm: 75,
    altitudeFtAGL: 30000,
    color: '#ADFF2F',
    quality: 0.9,
    description: 'Active radar search layer for wide-area detection and track initiation.',
  },
  {
    id: 'layer-rf',
    name: 'RF Sensing Layer',
    domain: 'rf',
    type: 'rf',
    rangeKm: 20,
    altitudeFtAGL: 12000,
    color: '#00BFFF',
    quality: 0.72,
    description: 'Passive RF collection for C2/video/control-link detection and classification.',
  },
  {
    id: 'layer-eoir',
    name: 'EO/IR Layer',
    domain: 'eoir',
    type: 'eoir',
    rangeKm: 8,
    altitudeFtAGL: 10000,
    color: '#FFD166',
    quality: 0.78,
    description: 'Electro-optical / infrared confirmation layer for visual ID and terminal track refinement.',
  },
  {
    id: 'layer-acoustic',
    name: 'Acoustic Layer',
    domain: 'acoustic',
    type: 'acoustic',
    rangeKm: 3,
    altitudeFtAGL: 2500,
    color: '#C77DFF',
    quality: 0.62,
    description: 'Short-range acoustic layer for low-altitude small UAS detection in cluttered airspace.',
  },
  {
    id: 'layer-cyber-osint',
    name: 'Cyber / OSINT Layer',
    domain: 'cyber-osint',
    type: 'cyber-osint',
    rangeKm: 150,
    altitudeFtAGL: 60000,
    color: '#FFFFFF',
    quality: 0.58,
    description: 'Non-kinetic intelligence layer for launch indicators, network/cyber cues, and external reporting.',
  },
];

const LAYER_COLOR_SWATCHES = ['#00E5FF', '#39FF14', '#FFD60A', '#FF4D6D', '#B967FF', '#FFFFFF'];

const DETECTION_DOMAIN_LABELS = {
  radar: 'RADAR',
  rf: 'RF',
  eoir: 'EO/IR',
  acoustic: 'ACOUSTIC',
  'cyber-osint': 'CYBER/OSINT',
};

if (CESIUM_ION_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
}

// ---------- helpers ----------

function milSymbolCanvas(sidc, opts = {}) {
  try {
    return new ms.Symbol(sidc, { size: 36, ...opts }).asCanvas();
  } catch { return null; }
}

function geodesicDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToLat(meters) {
  return meters / 111000;
}

function metersToLon(meters, lat) {
  return meters / (111000 * Math.max(Math.cos((lat * Math.PI) / 180), 0.15));
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] == null ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function weightedAverage(values) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function pathPointAtTime(path, elapsed) {
  if (!path.length) return null;
  if (elapsed <= path[0].time_s) return path[0];
  if (elapsed >= path[path.length - 1].time_s) return path[path.length - 1];

  let idx = path.findIndex(p => p.time_s > elapsed);
  if (idx <= 0) idx = 1;
  const p0 = path[idx - 1];
  const p1 = path[idx];
  const denom = Math.max(p1.time_s - p0.time_s, 0.001);
  const t = (elapsed - p0.time_s) / denom;
  return {
    time_s: elapsed,
    lat: p0.lat + (p1.lat - p0.lat) * t,
    lon: p0.lon + (p1.lon - p0.lon) * t,
    alt: p0.alt + (p1.alt - p0.alt) * t,
  };
}

function ensureTimedPath(path, speedMs = 250) {
  if (!Array.isArray(path) || path.length < 2) return [];

  let elapsed = Number.isFinite(path[0].time_s) ? Number(path[0].time_s) : 0;
  return path.map((point, index) => {
    if (index === 0) {
      return {
        ...point,
        time_s: elapsed,
        alt: Number.isFinite(point.alt) ? point.alt : 0,
      };
    }

    const previous = path[index - 1];
    const fallbackDelta = geodesicDistanceKm(previous.lat, previous.lon, point.lat, point.lon) * 1000 / Math.max(speedMs, 1);
    const givenTime = Number(point.time_s);
    elapsed = Number.isFinite(givenTime) && givenTime > elapsed
      ? givenTime
      : elapsed + Math.max(fallbackDelta, 0.1);

    return {
      ...point,
      time_s: elapsed,
      alt: Number.isFinite(point.alt) ? point.alt : 0,
    };
  });
}

function resampleTimedPath(path, maxPoints = 240) {
  if (!Array.isArray(path) || path.length <= maxPoints) return path;
  const endTime = path[path.length - 1]?.time_s ?? 0;
  if (endTime <= 0) return path.filter((_, index) => index % Math.ceil(path.length / maxPoints) === 0);

  return Array.from({ length: maxPoints }, (_, index) => {
    const t = index / (maxPoints - 1);
    return pathPointAtTime(path, endTime * t);
  }).filter(Boolean);
}

function routeDistanceKm(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += geodesicDistanceKm(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  return distance;
}

function classifyImpactWarning(seconds) {
  if (seconds <= 0) return { level: 'IMPACT', color: '#CC0000' };
  if (seconds <= 5) return { level: 'TAKE COVER NOW', color: '#FF0000' };
  if (seconds <= 20) return { level: 'RUN TO COVER', color: '#FF4400' };
  if (seconds <= 35) return { level: 'MOVE TO SHELTER', color: '#FF8800' };
  if (seconds <= 120) return { level: 'PREPARE TO SHELTER', color: '#FFAA00' };
  return { level: 'MONITOR', color: '#ADFF2F' };
}

function estimateWarheadKg(threat, threatMode) {
  if (threatMode === 'missile') return Math.max(threat?.warheadKg ?? 50, 0.1);
  const text = `${threat?.category ?? ''} ${threat?.warhead ?? ''}`.toLowerCase();
  if (text.includes('none')) return 0.1;
  if (text.includes('grenade') || text.includes('vog')) return 0.7;
  if (text.includes('shaped') || text.includes('rpg')) return 2.5;
  if (text.includes('loitering') || text.includes('kamikaze')) return Math.max(1, Math.min((threat?.weightKg ?? 8) * 0.35, 15));
  if (text.includes('armed') || text.includes('munition')) return Math.max(2, Math.min((threat?.weightKg ?? 20) * 0.25, 25));
  return Math.max(0.2, Math.min((threat?.weightKg ?? 2) * 0.15, 5));
}

function buildProtectionAssessment(path, threat, threatMode) {
  const flightTime = path[path.length - 1]?.time_s ?? 0;
  const distanceKm = routeDistanceKm(path);
  const warheadKg = estimateWarheadKg(threat, threatMode);
  const cbrt = Math.cbrt(Math.max(warheadKg, 0.1));
  const warning = classifyImpactWarning(flightTime);
  const speedMs = distanceKm > 0 && flightTime > 0 ? (distanceKm * 1000) / flightTime : 0;
  const impactPoint = path[path.length - 1] ?? {};

  return {
    flight_time_s: Number(flightTime.toFixed(1)),
    dist_km: Number(distanceKm.toFixed(2)),
    trajectory_path: path,
    target_lat: impactPoint.lat,
    target_lon: impactPoint.lon,
    impact_time_s: flightTime,
    confidence: threatMode === 'missile' ? 0.72 : 0.55,
    uncertainty_m: threatMode === 'missile' ? (threat?.cepMeters ?? 100) : Math.max(30, (threat?.group ?? 1) * 45),
    sensor_count: 0,
    warning_level: warning.level,
    warning_color: warning.color,
    blast_radii: {
      lethal_m: Math.round(15 * cbrt),
      severe_m: Math.round(35 * cbrt),
      moderate_m: Math.round(70 * cbrt),
      light_m: Math.round(150 * cbrt),
    },
    shelter_windows: {
      react_deadline_s: Number((flightTime - 5).toFixed(1)),
      cover_deadline_s: Number((flightTime - 20).toFixed(1)),
      shelter_deadline_s: Number((flightTime - 35).toFixed(1)),
    },
    protection_guidance: [
      flightTime > 35
        ? 'Move personnel to hardened overhead cover or below-grade shelter now.'
        : 'Do not spend time relocating far; use the nearest hard cover immediately.',
      flightTime > 20
        ? 'Disperse exposed personnel, get below rooflines, and avoid windows, fuel, and ammunition stacks.'
        : 'Drop behind the nearest substantial barrier, vehicle engine block, wall, berm, or trench edge.',
      flightTime > 5
        ? 'Leaders should issue a short countdown and confirm prone/covered posture before impact.'
        : 'Immediate prone posture: face down, helmet on, mouth open, protect head and neck.',
      threatMode === 'uas'
        ? 'For UAS threats, prioritize overhead concealment, thermal/signature reduction, and dispersion.'
        : 'For missile/rocket threats, prioritize blast fragmentation cover and avoid secondary hazards.',
    ],
    impact_energy: {
      impact_speed_ms: Number(speedMs.toFixed(1)),
      impact_mach: Number((speedMs / 343).toFixed(2)),
      chem_mj: Number((warheadKg * 4.184).toFixed(1)),
      total_energy_mj: Number((warheadKg * 4.184).toFixed(1)),
    },
    physics_model: 'client launch estimate',
  };
}

function radarHorizonKm(sensorHeightM, targetAltM) {
  const sensorTerm = Math.sqrt(Math.max(sensorHeightM, 0));
  const targetTerm = Math.sqrt(Math.max(targetAltM, 0));
  return 3.57 * (sensorTerm + targetTerm);
}

function sensorTypeQuality(sensorType) {
  const qualities = {
    radar: 0.92,
    strategic: 0.9,
    kinetic: 0.82,
    laser: 0.78,
    rf: 0.68,
    eoir: 0.78,
    acoustic: 0.62,
    'cyber-osint': 0.58,
    ew: 0.64,
    passive: 0.72,
    net: 0.74,
  };
  return qualities[sensorType] ?? 0.72;
}

function detectionDomainsForSystem(system) {
  if (system?.domains?.length) return system.domains;
  if (system?.domain) return [system.domain];
  const text = `${system?.type ?? ''} ${system?.name ?? ''} ${system?.description ?? ''}`.toLowerCase();
  const domains = new Set();
  if (text.includes('radar') || system?.type === 'radar') domains.add('radar');
  if (text.includes('rf') || text.includes('radio') || text.includes('datalink') || system?.type?.startsWith('rf')) domains.add('rf');
  if (text.includes('eo') || text.includes('ir') || text.includes('optical') || text.includes('thermal') || text.includes('camera') || system?.type === 'laser') domains.add('eoir');
  if (text.includes('acoustic')) domains.add('acoustic');
  if (text.includes('cyber') || text.includes('osint') || text.includes('forensic') || text.includes('network') || system?.type === 'command') domains.add('cyber-osint');
  if (system?.type === 'detection' && !domains.size) domains.add('rf');
  return domains.size ? [...domains] : ['radar'];
}

function environmentDetectionFactor(sensor, point, env = DEFAULT_PLANNING_ENV) {
  const visibility = {
    clear: 1,
    haze: 0.88,
    night: 0.82,
    smoke: 0.62,
    storm: 0.54,
  }[env.visibility] ?? 1;
  const precipitation = {
    none: 1,
    light: 0.92,
    heavy: 0.72,
    snow: 0.66,
  }[env.precipitation] ?? 1;
  const clutter = {
    low: 1,
    moderate: point.alt < 250 ? 0.88 : 0.96,
    high: point.alt < 500 ? 0.68 : 0.86,
  }[env.clutter] ?? 1;
  const ewBase = {
    none: 1,
    light: 0.9,
    heavy: 0.72,
    denied: 0.48,
  }[env.ew] ?? 1;
  const ewSensitive = ['radar', 'rf', 'rf-jam', 'rf-takeover', 'ew', 'net', 'cyber-osint'].includes(sensor.type);
  const ew = ewSensitive ? ewBase : Math.max(0.82, ewBase);
  return clamp(visibility * precipitation * clutter * ew * (env.operatorConfidence ?? 0.85), 0.18, 1.05);
}

function sensorDetectionProbability(sensor, point, env = DEFAULT_PLANNING_ENV) {
  const horizontalKm = geodesicDistanceKm(point.lat, point.lon, sensor.lat, sensor.lon);
  if (horizontalKm > sensor.rangeKm) return 0;

  const terrainM = sensor.terrainAlt ?? 0;
  const sensorHeightM = terrainM + 4;
  const targetAltM = Math.max(point.alt - terrainM, 0);
  const horizonKm = radarHorizonKm(sensorHeightM, targetAltM);
  if (horizontalKm > Math.min(sensor.rangeKm, horizonKm)) return 0;

  const ceilingM = (sensor.altitudeFtAGL ?? 0) * 0.3048;
  if (ceilingM && point.alt > terrainM + ceilingM) return 0;

  const rangeScore = clamp(1 - horizontalKm / Math.max(sensor.rangeKm, 0.001), 0, 1);
  const horizonScore = clamp(1 - horizontalKm / Math.max(horizonKm, 0.001), 0, 1);
  const quality = sensor.quality ?? sensorTypeQuality(sensor.type);
  return clamp((0.25 + rangeScore * 0.55 + horizonScore * 0.2) * quality * environmentDetectionFactor(sensor, point, env), 0.03, 0.98);
}

function interpolateCrossingTime(p0, p1, sensor, entering) {
  const d0 = geodesicDistanceKm(p0.lat, p0.lon, sensor.lat, sensor.lon);
  const d1 = geodesicDistanceKm(p1.lat, p1.lon, sensor.lat, sensor.lon);
  const span = d1 - d0;
  if (Math.abs(span) < 0.0001) return entering ? p1.time_s : p0.time_s;
  const t = Math.max(0, Math.min(1, (sensor.rangeKm - d0) / span));
  return p0.time_s + (p1.time_s - p0.time_s) * t;
}

function sensorCanSeePoint(sensor, point, env = DEFAULT_PLANNING_ENV) {
  return sensorDetectionProbability(sensor, point, env) > 0;
}

function computeSensorEvents(paths, sensors, env = DEFAULT_PLANNING_ENV) {
  const endTime = Math.max(...paths.map(path => path[path.length - 1]?.time_s ?? 0), 0);
  const events = [];

  paths.forEach((path, trackIndex) => {
    sensors.forEach(sensor => {
      let inside = false;
      let entryTime = null;
      let exitTime = null;
      let closestKm = Number.POSITIVE_INFINITY;
      let closestPoint = null;

      for (let i = 0; i < path.length; i++) {
        const point = path[i];
        const horizontalKm = geodesicDistanceKm(point.lat, point.lon, sensor.lat, sensor.lon);
        if (horizontalKm < closestKm) {
          closestKm = horizontalKm;
          closestPoint = point;
        }

        const canSee = sensorCanSeePoint(sensor, point, env);
        if (canSee && !inside) {
          inside = true;
          entryTime = i > 0 ? interpolateCrossingTime(path[i - 1], point, sensor, true) : point.time_s;
        }
        if (!canSee && inside) {
          exitTime = i > 0 ? interpolateCrossingTime(path[i - 1], point, sensor, false) : point.time_s;
          break;
        }
      }

      if (entryTime != null) {
        const rangeQuality = Math.max(0, 1 - closestKm / Math.max(sensor.rangeKm, 0.001));
        const dwellS = Math.max((exitTime ?? endTime) - entryTime, 0);
        const dwellQuality = Math.min(dwellS / 20, 1);
        const closestProbability = closestPoint ? sensorDetectionProbability(sensor, closestPoint, env) : 0.25;
        const confidence = Math.min(0.98, Math.max(0.18, closestProbability * 0.72 + rangeQuality * 0.12 + dwellQuality * 0.16));

        events.push({
          id: `${trackIndex}-${sensor.id}-${sensor.lat}-${sensor.lon}`,
          trackIndex,
          sensor_id: sensor.id,
          sensor_name: sensor.name,
          sensor_type: sensor.type ?? 'sensor',
          entry_time_s: entryTime,
          exit_time_s: exitTime,
          time_to_impact_s: Math.max(endTime - entryTime, 0),
          closest_km: closestKm,
          confidence,
          lat: closestPoint?.lat ?? sensor.lat,
          lon: closestPoint?.lon ?? sensor.lon,
          alt: closestPoint?.alt ?? 0,
        });
      }
    });
  });

  return events
    .sort((a, b) => a.entry_time_s - b.entry_time_s)
    .map((event, index, sorted) => ({
      ...event,
      downstream_sensors: sorted
        .filter(next => next.trackIndex === event.trackIndex && next.entry_time_s > event.entry_time_s)
        .slice(0, 3)
        .map(next => ({
          sensor_name: next.sensor_name,
          eta_s: next.entry_time_s - event.entry_time_s,
          time_to_impact_s: next.time_to_impact_s,
          confidence: next.confidence,
        })),
    }));
}

function perturbPath(path, threat, threatMode, sampleIndex) {
  if (!path.length) return [];

  const baseCepM = threatMode === 'missile'
    ? (threat?.cepMeters ?? 100)
    : Math.max(25, (threat?.group ?? 1) * 45 + (threat?.speedMs ?? 25) * 2);
  const maneuverM = threatMode === 'missile'
    ? Math.max(25, baseCepM * 0.45)
    : Math.max(50, (threat?.speedMs ?? 25) * 4);
  const phase = randBetween(0, Math.PI * 2) + sampleIndex * 0.19;
  const wave = randBetween(0.8, 2.6);
  const finalLatOffsetM = randBetween(-baseCepM, baseCepM);
  const finalLonOffsetM = randBetween(-baseCepM, baseCepM);
  const timeScale = threatMode === 'missile'
    ? randBetween(0.94, 1.08)
    : randBetween(0.86, 1.18);

  return path.map((point, index) => {
    const progress = path.length === 1 ? 0 : index / (path.length - 1);
    const endpointWeight = smoothstep(progress);
    const maneuver = Math.sin(progress * Math.PI * 2 * wave + phase) * Math.sin(Math.PI * progress) * maneuverM;
    const next = path[Math.min(path.length - 1, index + 1)];
    const prev = path[Math.max(0, index - 1)];
    const dLat = next.lat - prev.lat;
    const dLon = next.lon - prev.lon;
    const len = Math.hypot(dLat, dLon) || 1;
    const normalLat = -dLon / len;
    const normalLon = dLat / len;

    return {
      ...point,
      time_s: point.time_s * timeScale,
      lat: point.lat + normalLat * metersToLat(maneuver) + metersToLat(finalLatOffsetM * endpointWeight),
      lon: point.lon + normalLon * metersToLon(maneuver, point.lat) + metersToLon(finalLonOffsetM * endpointWeight, point.lat),
      alt: Math.max(5, point.alt + randBetween(-8, 8) * Math.sin(Math.PI * progress)),
    };
  });
}

function buildMonteCarloAssessment(paths, sensors, threat, threatMode, env = DEFAULT_PLANNING_ENV, samplesPerTrack = 24) {
  const samplePaths = [];
  paths.forEach((path, trackIndex) => {
    for (let i = 0; i < samplesPerTrack; i++) {
      samplePaths.push({ trackIndex, path: perturbPath(path, threat, threatMode, i) });
    }
  });

  const impactPoints = samplePaths.map(sample => sample.path[sample.path.length - 1]).filter(Boolean);
  const centerLat = mean(impactPoints.map(point => point.lat));
  const centerLon = mean(impactPoints.map(point => point.lon));
  const impactTimes = impactPoints.map(point => point.time_s);
  const radialErrorsM = impactPoints.map(point => geodesicDistanceKm(centerLat, centerLon, point.lat, point.lon) * 1000);

  const sampleEvents = samplePaths.flatMap(sample =>
    computeSensorEvents([sample.path], sensors, env).map(event => ({
      ...event,
      trackIndex: sample.trackIndex,
    }))
  );
  const firstDetectionTimes = samplePaths.map(sample => {
    const events = computeSensorEvents([sample.path], sensors, env);
    return events[0]?.entry_time_s ?? null;
  }).filter(value => value != null);
  const leadTimes = samplePaths.map(sample => {
    const end = sample.path[sample.path.length - 1]?.time_s ?? 0;
    const events = computeSensorEvents([sample.path], sensors, env);
    return events[0] ? end - events[0].entry_time_s : 0;
  });
  const sensorHits = sensors.map(sensor => {
    const hits = sampleEvents.filter(event => event.sensor_id === sensor.id);
    return {
      sensor_id: sensor.id,
      sensor_name: sensor.name,
      probability: samplePaths.length ? hits.length / samplePaths.length : 0,
      avg_confidence: hits.length ? mean(hits.map(event => event.confidence)) : 0,
      median_entry_s: hits.length ? quantile(hits.map(event => event.entry_time_s), 0.5) : null,
    };
  }).sort((a, b) => b.probability - a.probability);

  return {
    samples: samplePaths.length,
    impact_p50_m: Math.round(quantile(radialErrorsM, 0.5)),
    impact_p90_m: Math.round(quantile(radialErrorsM, 0.9)),
    time_p10_s: quantile(impactTimes, 0.1),
    time_p50_s: quantile(impactTimes, 0.5),
    time_p90_s: quantile(impactTimes, 0.9),
    first_detection_p50_s: firstDetectionTimes.length ? quantile(firstDetectionTimes, 0.5) : null,
    lead_time_p10_s: quantile(leadTimes, 0.1),
    lead_time_p50_s: quantile(leadTimes, 0.5),
    lead_time_p90_s: quantile(leadTimes, 0.9),
    sensor_hits: sensorHits,
  };
}

function computeCoverageGaps(paths, sensors, env = DEFAULT_PLANNING_ENV) {
  const gaps = [];
  let totalUncoveredS = 0;
  let longestGapS = 0;
  let coveredSamples = 0;
  let totalSamples = 0;

  paths.forEach((path, trackIndex) => {
    let openGap = null;
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const coverage = sensors
        .map(sensor => ({ sensor, probability: sensorDetectionProbability(sensor, point, env) }))
        .filter(item => item.probability > 0);
      const fusedCoverage = coverage.length
        ? 1 - coverage.reduce((miss, item) => miss * (1 - item.probability), 1)
        : 0;
      totalSamples += 1;
      if (fusedCoverage > 0.35) coveredSamples += 1;

      if (fusedCoverage <= 0.2 && !openGap) {
        openGap = { trackIndex, start_s: point.time_s, start_lat: point.lat, start_lon: point.lon };
      }
      if ((fusedCoverage > 0.2 || i === path.length - 1) && openGap) {
        const endPoint = point;
        const duration = Math.max(endPoint.time_s - openGap.start_s, 0);
        totalUncoveredS += duration;
        longestGapS = Math.max(longestGapS, duration);
        gaps.push({
          ...openGap,
          end_s: endPoint.time_s,
          end_lat: endPoint.lat,
          end_lon: endPoint.lon,
          duration_s: duration,
        });
        openGap = null;
      }
    }
  });

  return {
    coverage_ratio: totalSamples ? coveredSamples / totalSamples : 0,
    total_uncovered_s: totalUncoveredS,
    longest_gap_s: longestGapS,
    gaps: gaps.sort((a, b) => b.duration_s - a.duration_s).slice(0, 5),
  };
}

function computeDetectionArchitecture(paths, sensors, env = DEFAULT_PLANNING_ENV) {
  const domains = Object.keys(DETECTION_DOMAIN_LABELS);
  const layers = domains.map(domain => {
    const domainSensors = sensors.filter(sensor => sensor.domains?.includes(domain));
    let covered = 0;
    let samples = 0;
    let firstDetection = null;
    let peakProbability = 0;

    paths.forEach(path => {
      path.forEach(point => {
        const fused = domainSensors.length
          ? 1 - domainSensors.reduce((miss, sensor) => miss * (1 - sensorDetectionProbability(sensor, point, env)), 1)
          : 0;
        samples += 1;
        if (fused > 0.25) covered += 1;
        if (fused > peakProbability) peakProbability = fused;
        if (fused > 0.35 && firstDetection == null) firstDetection = point.time_s;
      });
    });

    return {
      domain,
      label: DETECTION_DOMAIN_LABELS[domain],
      sensor_count: domainSensors.length,
      coverage_ratio: samples ? covered / samples : 0,
      first_detection_s: firstDetection,
      peak_probability: peakProbability,
      status: domainSensors.length === 0
        ? 'MISSING'
        : (samples ? covered / samples : 0) > 0.65
          ? 'STRONG'
          : (samples ? covered / samples : 0) > 0.25
            ? 'PARTIAL'
            : 'GAP',
    };
  });

  const activeLayers = layers.filter(layer => layer.sensor_count > 0).length;
  const strongLayers = layers.filter(layer => layer.status === 'STRONG').length;
  const weakest = [...layers].sort((a, b) => a.coverage_ratio - b.coverage_ratio)[0];

  return {
    active_layers: activeLayers,
    strong_layers: strongLayers,
    resilience_score: layers.length ? (strongLayers * 0.16 + activeLayers * 0.08 + mean(layers.map(layer => layer.coverage_ratio)) * 0.44) : 0,
    weakest_layer: weakest,
    layers,
  };
}

function computeLiveTrackFusion(paths, sensors, threat, threatMode, elapsed, env = DEFAULT_PLANNING_ENV) {
  const currentPoints = paths.map(path => pathPointAtTime(path, elapsed)).filter(Boolean);
  if (!currentPoints.length) return null;

  const endTime = Math.max(...paths.map(path => path[path.length - 1]?.time_s ?? 0), 0);
  const finalPoints = paths.map(path => path[path.length - 1]).filter(Boolean);
  const active = currentPoints.flatMap((point, trackIndex) =>
    sensors
      .map(sensor => ({
        trackIndex,
        sensor_id: sensor.id,
        sensor_name: sensor.name,
        probability: sensorDetectionProbability(sensor, point, env),
        range_km: geodesicDistanceKm(point.lat, point.lon, sensor.lat, sensor.lon),
      }))
      .filter(item => item.probability > 0.05)
  );
  const fusedProbability = active.length
    ? 1 - active.reduce((miss, item) => miss * (1 - item.probability), 1)
    : 0;
  const center = currentPoints.reduce((acc, point) => ({
    lat: acc.lat + point.lat / currentPoints.length,
    lon: acc.lon + point.lon / currentPoints.length,
    alt: acc.alt + point.alt / currentPoints.length,
  }), { lat: 0, lon: 0, alt: 0 });
  const impactCenter = finalPoints.reduce((acc, point) => ({
    lat: acc.lat + point.lat / finalPoints.length,
    lon: acc.lon + point.lon / finalPoints.length,
  }), { lat: 0, lon: 0 });
  const maneuverRisk = threatMode === 'missile'
    ? clamp((threat?.speedMach ?? 1) / 12, 0.2, 0.95)
    : clamp((threat?.speedMs ?? 25) / 90, 0.15, 0.8);
  const uncertaintyNowM = Math.round(
    (threatMode === 'missile' ? (threat?.cepMeters ?? 100) : Math.max(40, (threat?.group ?? 1) * 50))
      * (1.8 - fusedProbability)
      * (1 + maneuverRisk * 0.45),
  );

  return {
    lat: center.lat,
    lon: center.lon,
    alt: center.alt,
    active_sensor_count: new Set(active.map(item => item.sensor_id)).size,
    fused_probability: clamp(fusedProbability, 0, 0.99),
    time_to_impact_s: Math.max(endTime - elapsed, 0),
    impact_lat: impactCenter.lat,
    impact_lon: impactCenter.lon,
    uncertainty_now_m: uncertaintyNowM,
    top_active: active.sort((a, b) => b.probability - a.probability).slice(0, 4),
  };
}

function estimateImpactIntelligence(paths, threat, threatMode, sensors, env = DEFAULT_PLANNING_ENV) {
  const finalPoints = paths.map(path => path[path.length - 1]).filter(Boolean);
  if (!finalPoints.length) return null;

  const center = finalPoints.reduce((acc, point) => ({
    lat: acc.lat + point.lat / finalPoints.length,
    lon: acc.lon + point.lon / finalPoints.length,
    alt: acc.alt + point.alt / finalPoints.length,
    time_s: Math.max(acc.time_s, point.time_s),
  }), { lat: 0, lon: 0, alt: 0, time_s: 0 });

  const events = computeSensorEvents(paths, sensors, env);
  const monteCarlo = buildMonteCarloAssessment(paths, sensors, threat, threatMode, env);
  const coverage = computeCoverageGaps(paths, sensors, env);
  const architecture = computeDetectionArchitecture(paths, sensors, env);
  const baseCepM = threatMode === 'missile'
    ? (threat?.cepMeters ?? 100)
    : Math.max(20, (threat?.group ?? 1) * 35 + (threat?.speedMs ?? 25) * 1.5);
  const sensorConfidence = events.length
    ? events.reduce((sum, event) => sum + event.confidence, 0) / events.length
    : 0.18;
  const geometryBonus = Math.min(new Set(events.map(e => e.sensor_id)).size * 0.08, 0.24);
  const confidence = Math.min(0.96, sensorConfidence + geometryBonus);
  const uncertainty_m = Math.max(
    Math.round(baseCepM * (1.65 - confidence) + (events.length ? 0 : baseCepM)),
    monteCarlo.impact_p90_m,
  );
  const sensorHitScores = monteCarlo.sensor_hits
    .filter(hit => hit.probability > 0.05)
    .map(hit => ({ value: hit.avg_confidence, weight: hit.probability }));
  const fusedConfidence = clamp(
    confidence * 0.55
      + (sensorHitScores.length ? weightedAverage(sensorHitScores) : 0.15) * 0.25
      + coverage.coverage_ratio * 0.2,
    0.05,
    0.98,
  );

  return {
    target_lat: center.lat,
    target_lon: center.lon,
    impact_time_s: center.time_s,
    confidence: fusedConfidence,
    uncertainty_m,
    sensor_count: new Set(events.map(e => e.sensor_id)).size,
    first_detection_s: events[0]?.entry_time_s ?? null,
    first_time_to_impact_s: events[0]?.time_to_impact_s ?? center.time_s,
    monte_carlo: monteCarlo,
    coverage,
    architecture,
    live_track: computeLiveTrackFusion(paths, sensors, threat, threatMode, 0, env),
    environment: env,
    events,
  };
}

function analyzeLOSProfileLocal(terrainProfile, observerAlt, targetAlt) {
  if (!terrainProfile.length) {
    return {
      is_detected: false,
      status: 'NO TERRAIN PROFILE',
      intensity: 1,
      obstruction_count: 0,
      first_obstruction_index: null,
      min_clearance_m: null,
      max_obstruction_m: null,
      obstruction_indices: [],
    };
  }

  const clearances = terrainProfile.map((height, index) => {
    const t = terrainProfile.length === 1 ? 0 : index / (terrainProfile.length - 1);
    const rayAlt = observerAlt + (targetAlt - observerAlt) * t;
    return rayAlt - height;
  });
  const obstructionIndices = clearances
    .map((clearance, index) => clearance < 0 ? index : null)
    .filter(index => index !== null);
  const minClearance = Math.min(...clearances);
  const isDetected = obstructionIndices.length === 0;

  return {
    is_detected: isDetected,
    status: isDetected ? 'TARGET DETECTED' : `LOS BLOCKED: ${obstructionIndices.length} OBSTRUCTIONS`,
    intensity: obstructionIndices.length / terrainProfile.length,
    obstruction_count: obstructionIndices.length,
    first_obstruction_index: obstructionIndices[0] ?? null,
    min_clearance_m: Number(minClearance.toFixed(1)),
    max_obstruction_m: Number(Math.max(0, -minClearance).toFixed(1)),
    obstruction_indices: obstructionIndices,
    clearances,
  };
}

function normalizeLOSResult(result, terrainProfile, observerAlt, targetAlt) {
  const local = analyzeLOSProfileLocal(terrainProfile, observerAlt, targetAlt);
  return {
    ...local,
    ...result,
    clearances: local.clearances,
    obstruction_indices: result?.obstruction_indices ?? local.obstruction_indices,
  };
}

function withTimeout(promise, ms, label = 'operation') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function makeErraticUASPath(basePath, drone, formationIndex = 0) {
  if (!basePath?.length) return [];

  const behavior = ['weave', 'jink', 'pop-up', 'terrain-hop'][Math.floor(Math.random() * 4)];
  const group = drone?.group ?? 1;
  const agility = Math.max(0.65, 1.9 - group * 0.2);
  const lateralMeters = randBetween(80, 260) * agility * (formationIndex === 0 ? 1 : randBetween(0.7, 1.35));
  const verticalMeters = randBetween(12, 55) * agility;
  const waves = randBetween(1.2, 3.8) + formationIndex * 0.23;
  const phase = randBetween(0, Math.PI * 2);
  const jinkCount = Math.floor(randBetween(2, 5));
  const jinks = Array.from({ length: jinkCount }, () => ({
    center: randBetween(0.12, 0.88),
    width: randBetween(0.025, 0.075),
    strength: randBetween(-1.4, 1.4),
  }));

  return basePath.map((point, index) => {
    const progress = basePath.length === 1 ? 0 : index / (basePath.length - 1);
    const endpointBlend = Math.sin(Math.PI * progress);
    const prev = basePath[Math.max(0, index - 1)];
    const next = basePath[Math.min(basePath.length - 1, index + 1)];
    const dLat = next.lat - prev.lat;
    const dLon = next.lon - prev.lon;
    const len = Math.hypot(dLat, dLon) || 1;
    const normalLat = -dLon / len;
    const normalLon = dLat / len;

    let lateral = Math.sin(progress * Math.PI * 2 * waves + phase) * lateralMeters;
    let vertical = Math.cos(progress * Math.PI * 2 * (waves * 0.7) + phase) * verticalMeters;

    if (behavior === 'jink' || behavior === 'terrain-hop') {
      for (const jink of jinks) {
        const dist = Math.abs(progress - jink.center);
        if (dist < jink.width) {
          const punch = smoothstep(1 - dist / jink.width) * jink.strength;
          lateral += punch * lateralMeters * 1.6;
          vertical += Math.abs(punch) * verticalMeters * 0.8;
        }
      }
    }

    if (behavior === 'pop-up') {
      const popup = Math.exp(-((progress - 0.62) ** 2) / 0.012);
      vertical += popup * verticalMeters * 3.8;
      lateral += Math.sin(progress * Math.PI * 10 + phase) * lateralMeters * 0.35;
    }

    if (behavior === 'terrain-hop') {
      vertical += Math.sin(progress * Math.PI * 12 + phase) * verticalMeters * 0.85;
    }

    lateral *= endpointBlend;
    vertical *= endpointBlend;

    return {
      ...point,
      lat: point.lat + normalLat * metersToLat(lateral),
      lon: point.lon + normalLon * metersToLon(lateral, point.lat),
      alt: Math.max(5, point.alt + vertical),
      behavior,
    };
  });
}

function cesiumColorFromHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Cesium.Color(r, g, b, 1.0);
}

// Client-side fallback: terrain-following UAS path
function buildClientUASPath(waypoints, speedMs) {
  const path = [];
  let totalTime = 0;
  for (let seg = 0; seg < waypoints.length - 1; seg++) {
    const wp0 = waypoints[seg];
    const wp1 = waypoints[seg + 1];
    const distKm = geodesicDistanceKm(wp0.lat, wp0.lon, wp1.lat, wp1.lon);
    const segDur = (distKm * 1000) / speedMs;
    const steps = Math.max(Math.ceil(segDur), 5);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      path.push({
        time_s: totalTime + segDur * t,
        lat: wp0.lat + (wp1.lat - wp0.lat) * t,
        lon: wp0.lon + (wp1.lon - wp0.lon) * t,
        alt: wp0.alt + (wp1.alt - wp0.alt) * t,
      });
    }
    totalTime += segDur;
  }
  const last = waypoints[waypoints.length - 1];
  path.push({ time_s: totalTime, lat: last.lat, lon: last.lon, alt: last.alt });
  return path;
}

// Client-side ballistic arc fallback
function buildClientBallisticPath(launch, target, apogeeKm, speedMach) {
  const MACH = 343;
  const distKm = geodesicDistanceKm(launch.lat, launch.lon, target.lat, target.lon);
  const flightTime = (distKm * 1000) / (speedMach * MACH);
  const apogeeM = apogeeKm * 1000;
  const STEPS = 200;
  const path = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const midAlt = (launch.alt + target.alt) / 2 + apogeeM;
    const c = launch.alt;
    const b = 4 * (midAlt - launch.alt) - 2 * (target.alt - launch.alt);
    const a = (target.alt - launch.alt) - b;
    path.push({
      time_s: flightTime * t,
      lat: launch.lat + (target.lat - launch.lat) * t,
      lon: launch.lon + (target.lon - launch.lon) * t,
      alt: a * t * t + b * t + c,
    });
  }
  return path;
}

// Hypersonic glide arc fallback
function buildClientHypersonicPath(launch, target, apogeeKm, speedMach) {
  const MACH = 343;
  const distKm = geodesicDistanceKm(launch.lat, launch.lon, target.lat, target.lon);
  const flightTime = (distKm * 1000) / (speedMach * MACH);
  const apogeeM = apogeeKm * 1000;
  const STEPS = 300;
  const path = [];
  const peakT = 0.3;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    let alt;
    if (t <= peakT) {
      alt = launch.alt + (apogeeM * t) / peakT;
    } else {
      const s = (t - peakT) / (1 - peakT);
      const smooth = s * s * (3 - 2 * s);
      alt = (launch.alt + apogeeM) + (target.alt - launch.alt - apogeeM) * smooth;
    }
    path.push({
      time_s: flightTime * t,
      lat: launch.lat + (target.lat - launch.lat) * t,
      lon: launch.lon + (target.lon - launch.lon) * t,
      alt,
    });
  }
  return path;
}

// Draw a 3D arc trail on the globe showing the flight path
function drawPathTrail(viewer, path, color, width = 2) {
  const positions = path.map(p =>
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)
  );
  return viewer.entities.add({
    polyline: {
      positions,
      width,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color }),
      clampToGround: false,
    },
  });
}

function makeDragGroup(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function markDraggable(entity, options = {}) {
  entity._selectable = true;
  entity._draggable = options.draggable !== false;
  entity._dragKind = options.kind ?? 'entity';
  entity._dragGroup = options.group ?? makeDragGroup(options.kind ?? 'entity');
  entity._waypointIndex = options.waypointIndex;
  entity._dragDisplayOffsetM = options.displayOffsetM ?? 0;
  entity._waypointAltitudeOffsetM = options.waypointAltitudeOffsetM ?? 0;
  entity._deleteLabel = options.label ?? options.kind ?? 'map item';
  if (options.graphicOffsets) {
    entity._graphicGeometry = options.graphicGeometry ?? 'point';
    entity._graphicOffsets = options.graphicOffsets;
  }
  return entity;
}

function setEntityLabelText(entity, text) {
  if (!entity?.label) return;
  entity.label.text = text;
  entity._deleteLabel = text;
}

function updateEntityMapPosition(entity, lat, lon, alt, cartesian) {
  if (entity._graphicOffsets?.length) {
    const positions = entity._graphicOffsets.map(offset =>
      Cesium.Cartesian3.fromDegrees(lon + offset.dLon, lat + offset.dLat, alt + offset.dAlt)
    );
    if (entity.polyline) {
      entity.polyline.positions = positions;
    } else if (entity.polygon) {
      entity.polygon.hierarchy = new Cesium.PolygonHierarchy(positions);
    } else {
      entity.position = positions[0];
    }
    return;
  }

  const nextPosition = cartesian ?? Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  entity.position = nextPosition;

  if (entity._cuasData) {
    entity._cuasData = { ...entity._cuasData, lat, lon, terrainAlt: alt };
  }
  if (entity._unitData) {
    entity._unitData = { ...entity._unitData, lat, lon, alt };
  }
}

function entityGeo(entity) {
  const value = entity?.position?.getValue?.(Cesium.JulianDate.now()) ?? entity?.position;
  if (!value) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(value);
  return {
    lat: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
    lon: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
    alt: Number((cartographic.height ?? 0).toFixed(1)),
  };
}

function makeGraphicAnchor(points) {
  return points.reduce((acc, point) => ({
    lat: acc.lat + point.lat / points.length,
    lon: acc.lon + point.lon / points.length,
    alt: acc.alt + point.alt / points.length,
  }), { lat: 0, lon: 0, alt: 0 });
}

function makeGraphicOffsets(points, anchor) {
  return points.map(point => ({
    dLat: point.lat - anchor.lat,
    dLon: point.lon - anchor.lon,
    dAlt: point.alt - anchor.alt,
  }));
}

function cartesianToGraphicPoint(cartesian) {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    alt: cartographic.height ?? 0,
  };
}

function LOSResultPanel({ analysis, pending, awaitingTarget }) {
  if (!pending && !awaitingTarget && !analysis) return null;

  const color = pending
    ? '#FFAA00'
    : analysis?.is_detected
      ? '#00FF7F'
      : '#FF3333';

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      right: 20,
      width: 300,
      background: 'rgba(3, 8, 15, 0.96)',
      border: `1px solid ${color}88`,
      boxShadow: `0 0 18px ${color}33`,
      zIndex: 15,
      padding: '10px 12px',
      fontFamily: 'monospace',
    }}>
      <div style={{ color, fontSize: 10, letterSpacing: '0.16em', marginBottom: 8 }}>
        LINE OF SIGHT
      </div>
      {pending && (
        <div style={{ color: '#FFAA00', fontSize: 12 }}>SAMPLING TERRAIN...</div>
      )}
      {!pending && awaitingTarget && (
        <div style={{ color: '#8899AA', fontSize: 11, lineHeight: 1.5 }}>
          Radar node set. Click a target point to compute LOS.
        </div>
      )}
      {!pending && analysis && (
        <>
          <div style={{
            color,
            fontSize: 14,
            fontWeight: 'bold',
            marginBottom: 8,
          }}>
            {analysis.status}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px', fontSize: 10 }}>
            <span style={{ color: '#445566' }}>Range</span>
            <span style={{ color: '#AABBCC', textAlign: 'right' }}>{analysis.distance_km.toFixed(2)} km</span>
            <span style={{ color: '#445566' }}>Radar AGL</span>
            <span style={{ color: '#AABBCC', textAlign: 'right' }}>{analysis.observer_agl_m} m</span>
            <span style={{ color: '#445566' }}>Target AGL</span>
            <span style={{ color: '#AABBCC', textAlign: 'right' }}>{analysis.target_agl_m} m</span>
            <span style={{ color: '#445566' }}>Obstructions</span>
            <span style={{ color, textAlign: 'right' }}>{analysis.obstruction_count}</span>
            <span style={{ color: '#445566' }}>Min clearance</span>
            <span style={{ color, textAlign: 'right' }}>
              {analysis.min_clearance_m == null ? 'N/A' : `${analysis.min_clearance_m} m`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- component ----------

export default function App() {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const handlerRef = useRef(null);
  const firstPointRef = useRef(null);
  const losEntitiesRef = useRef([]);
  const markupEntitiesRef = useRef([]);
  const dragRef = useRef({ active: false, moved: false, group: null, entity: null });
  const selectedMapItemRef = useRef(null);

  const [mode, setMode] = useState('los');
  const [faction, setFaction] = useState(FACTIONS.FRIENDLY);
  const [selectedUnit, setSelectedUnit] = useState(UNIT_TYPES[0]);
  const [selectedCUAS, setSelectedCUAS] = useState(CUAS_SYSTEMS[0]);
  const [customLayerAssets, setCustomLayerAssets] = useState([]);
  const [selectedLayerAsset, setSelectedLayerAsset] = useState(DETECTION_LAYER_ASSETS[0]);
  const [selectedDrone, setSelectedDrone] = useState(DRONE_TYPES[0]);
  const [selectedMissile, setSelectedMissile] = useState(MISSILE_THREATS[0]);
  const [threatMode, setThreatMode] = useState('uas'); // 'uas' | 'missile'
  const [planningEnv, setPlanningEnv] = useState(DEFAULT_PLANNING_ENV);
  const [selectedMapItem, setSelectedMapItem] = useState(null);
  const [losAnalysis, setLosAnalysis] = useState(null);
  const [losPending, setLosPending] = useState(false);
  const [losAwaitingTarget, setLosAwaitingTarget] = useState(false);

  // Impact analysis state
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [impactMissile, setImpactMissile] = useState(null);
  const [impactPanelPosition, setImpactPanelPosition] = useState(() => getInitialPanelPosition(320, 520, 20, 20));
  const impactEntitiesRef = useRef([]);
  const impactAnimationRef = useRef({ raf: null, entity: null, startWall: null, path: [] });
  const impactClickRef = useRef(null); // first click = launch

  // Radar network
  const [radarNetworkVisible, setRadarNetworkVisible] = useState(true);
  const radarEntitiesRef = useRef([]);

  // Exercise boundaries
  const [countryBoundariesVisible, setCountryBoundariesVisible] = useState(true);
  const [stateBoundariesVisible, setStateBoundariesVisible] = useState(true);
  const [exerciseBoundaryNames, setExerciseBoundaryNames] = useState(() => Object.fromEntries(
    EXERCISE_BOUNDARIES.map(boundary => [boundary.id, boundary.defaultName])
  ));
  const boundaryEntitiesRef = useRef([]);

  // Planning graphics
  const [selectedGraphicType, setSelectedGraphicType] = useState('phase-line');
  const [graphicLabel, setGraphicLabel] = useState('PL BLUE');
  const [graphicColor, setGraphicColor] = useState('#00FFFF');
  const [graphicPointCount, setGraphicPointCount] = useState(0);
  const graphicPointsRef = useRef([]);
  const graphicPreviewRef = useRef({ dots: [], line: null });

  // Open architecture — external track feed
  const [externalTracks, setExternalTracks] = useState({});   // track_id → track
  const [dataLinkConnected, setDataLinkConnected] = useState(false);
  const [dataLinkVisible, setDataLinkVisible] = useState(false);
  const externalTrackEntitiesRef = useRef({});                 // track_id → Cesium entity
  const wsRef = useRef(null);

  // KMZ / KML layer import
  const [kmzLayers, setKmzLayers] = useState([]);             // { id, name, visible }
  const kmzSourcesRef = useRef({});                           // id → CesiumKmlDataSource
  const kmzObjectUrlsRef = useRef({});
  const [kmzLoadStatus, setKmzLoadStatus] = useState(null);

  // Scenario persistence + reporting
  const [scenarios, setScenarios] = useState([]);
  const [scenarioStatus, setScenarioStatus] = useState(null);
  const [reportPanel, setReportPanel] = useState(null);

  // Missile sim: first click = launch, second click = target
  const missileClickRef = useRef(null); // { lat, lon, alt }

  const placedRef = useRef([]);
  const waypointsRef = useRef([]);
  const waypointEntitiesRef = useRef([]);
  const [waypointCount, setWaypointCount] = useState(0);
  const pathLineRef = useRef(null);
  const trailRef = useRef(null);
  const impactEstimateRef = useRef(null);

  const [simActive, setSimActive] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simElapsed, setSimElapsed] = useState(0);
  const [intercepts, setIntercepts] = useState([]);
  const [threatIntel, setThreatIntel] = useState(null);
  const [simSensorEvents, setSimSensorEvents] = useState([]);
  const [radarFeedPosition, setRadarFeedPosition] = useState(() => getInitialPanelPosition(310, 420, 20, 90));
  const simRef = useRef({
    path: [], paths: [], entities: [], cuasList: [], sensorEvents: [],
    threat: null, threatMode: 'uas', env: DEFAULT_PLANNING_ENV,
    alertedIds: new Set(), lastFusionUpdate: 0, startWall: null, speed: 1, raf: null, runId: 0,
  });

  const detectionLayerAssets = [...DETECTION_LAYER_ASSETS, ...customLayerAssets];

  const handleAddCustomLayerAsset = useCallback((asset) => {
    const normalized = {
      ...asset,
      id: `custom-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: asset.domain,
      rangeKm: Number(asset.rangeKm),
      altitudeFtAGL: Number(asset.altitudeFtAGL),
      quality: Number(asset.quality),
    };
    setCustomLayerAssets(prev => [...prev, normalized]);
    setSelectedLayerAsset(normalized);
  }, []);

  const refreshWaypointPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (pathLineRef.current) viewer.entities.remove(pathLineRef.current);
    pathLineRef.current = null;

    if (waypointsRef.current.length < 2) return;

    if (threatMode === 'missile') {
      const launch = waypointsRef.current[0];
      const target = waypointsRef.current[1];
      const previewPath = getMissilePreviewPath(launch, target, selectedMissile);
      const arcColor = cesiumColorFromHex(selectedMissile?.color ?? '#FF3300');
      pathLineRef.current = viewer.entities.add({
        polyline: {
          positions: previewPath.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color: arcColor }),
          clampToGround: false,
        },
      });
      return;
    }

    pathLineRef.current = viewer.entities.add({
      polyline: {
        positions: waypointsRef.current.map(wp => Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt)),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGERED }),
      },
    });
  }, [selectedMissile, threatMode]);

  const selectMapItem = useCallback((entity) => {
    if (!entity?._selectable) {
      selectedMapItemRef.current = null;
      setSelectedMapItem(null);
      return;
    }

    const item = {
      group: entity._dragGroup,
      kind: entity._dragKind,
      label: entity._deleteLabel ?? entity._dragKind ?? 'map item',
      editableLabel: entity._dragKind === 'unit',
    };
    selectedMapItemRef.current = item;
    setSelectedMapItem(item);
  }, []);

  const renameSelectedMapItem = useCallback((name) => {
    const viewer = viewerRef.current;
    const selected = selectedMapItemRef.current;
    const label = name.trim();
    if (!viewer || !selected || !selected.editableLabel || !label) return;

    viewer.entities.values
      .filter(entity => entity._dragGroup === selected.group)
      .forEach(entity => setEntityLabelText(entity, label));

    const next = { ...selected, label };
    selectedMapItemRef.current = next;
    setSelectedMapItem(next);
    viewer.scene.requestRender();
  }, []);

  const deleteSelectedMapItem = useCallback(() => {
    const viewer = viewerRef.current;
    const selected = selectedMapItemRef.current;
    if (!viewer || !selected) return;

    const groupEntities = viewer.entities.values.filter(e => e._dragGroup === selected.group);
    const waypointIndexes = groupEntities
      .map(e => e._waypointIndex)
      .filter(index => index != null)
      .sort((a, b) => b - a);

    groupEntities.forEach(entity => {
      viewer.entities.remove(entity);
      placedRef.current = placedRef.current.filter(e => e !== entity);
      waypointEntitiesRef.current = waypointEntitiesRef.current.filter(e => e !== entity);
      markupEntitiesRef.current = markupEntitiesRef.current.filter(e => e !== entity);
    });

    waypointIndexes.forEach(index => {
      waypointsRef.current.splice(index, 1);
    });

    if (waypointIndexes.length > 0) {
      waypointEntitiesRef.current.forEach((entity, index) => {
        entity._waypointIndex = index;
        if (entity.label) {
          const text = threatMode === 'missile'
            ? (index === 0 ? `LAUNCH: ${selectedMissile?.name ?? 'MISSILE'}` : 'TARGET')
            : `WP${index + 1}`;
          entity.label.text = text;
        }
      });
      setWaypointCount(waypointsRef.current.length);
      if (threatMode === 'missile' && waypointsRef.current.length < 2) {
        missileClickRef.current = waypointsRef.current[0] ?? null;
      }
      refreshWaypointPreview();
    }

    selectedMapItemRef.current = null;
    setSelectedMapItem(null);
  }, [refreshWaypointPreview, selectedMissile, threatMode]);

  const stopImpactAnimation = useCallback((removeEntity = true) => {
    if (impactAnimationRef.current.raf) {
      cancelAnimationFrame(impactAnimationRef.current.raf);
    }
    if (removeEntity && impactAnimationRef.current.entity) {
      viewerRef.current?.entities.remove(impactAnimationRef.current.entity);
    }
    impactAnimationRef.current = { raf: null, entity: null, startWall: null, path: [] };
  }, []);

  // ── Open architecture — WebSocket track feed ───────────────────────────────

  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(WS_TRACKS_URL);
      wsRef.current = ws;

      ws.onopen = () => setDataLinkConnected(true);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'snapshot') {
            const map = {};
            (msg.tracks ?? []).forEach(t => { map[t.track_id] = t; });
            setExternalTracks(map);
          } else if (msg.type === 'track_update') {
            setExternalTracks(prev => ({ ...prev, [msg.track.track_id]: msg.track }));
          } else if (msg.type === 'tracks_expired') {
            setExternalTracks(prev => {
              const next = { ...prev };
              (msg.ids ?? []).forEach(id => delete next[id]);
              return next;
            });
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setDataLinkConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current = null;
      ws?.close();
    };
  }, []);

  // ── Sync external tracks → Cesium entities ────────────────────────────────

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const AFFIL_CESIUM = {
      friendly: Cesium.Color.fromCssColorString('#00BFFF'),
      hostile:  Cesium.Color.fromCssColorString('#FF3300'),
      suspect:  Cesium.Color.fromCssColorString('#FF6600'),
      neutral:  Cesium.Color.fromCssColorString('#00FF7F'),
      pending:  Cesium.Color.fromCssColorString('#FFD700'),
      unknown:  Cesium.Color.fromCssColorString('#AAAAAA'),
    };

    const currentIds = new Set(Object.keys(externalTracks));
    const entityIds = new Set(Object.keys(externalTrackEntitiesRef.current));

    // Remove stale entities
    entityIds.forEach(id => {
      if (!currentIds.has(id)) {
        viewer.entities.remove(externalTrackEntitiesRef.current[id]);
        delete externalTrackEntitiesRef.current[id];
      }
    });

    // Upsert live tracks
    Object.values(externalTracks).forEach(track => {
      const pos = Cesium.Cartesian3.fromDegrees(track.lon, track.lat, track.alt_m ?? 0);
      const color = AFFIL_CESIUM[track.affiliation] ?? AFFIL_CESIUM.unknown;
      const label = track.callsign || track.track_id;

      if (externalTrackEntitiesRef.current[track.track_id]) {
        const entity = externalTrackEntitiesRef.current[track.track_id];
        entity.position = pos;
        if (entity.label) entity.label.text = label;
      } else {
        const entity = viewer.entities.add({
          position: pos,
          point: {
            pixelSize: 8,
            color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
          },
          label: {
            text: label,
            font: '9px monospace',
            fillColor: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entity._selectable = false;  // don't allow drag/delete of external tracks
        externalTrackEntitiesRef.current[track.track_id] = entity;
      }
    });
  }, [externalTracks]);

  // ── Planning graphics helpers ──────────────────────────────────────────────

  const clearGraphicPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      graphicPreviewRef.current.dots.forEach(e => viewer.entities.remove(e));
      if (graphicPreviewRef.current.line) viewer.entities.remove(graphicPreviewRef.current.line);
    }
    graphicPreviewRef.current = { dots: [], line: null };
  }, []);

  const finishGraphic = useCallback(() => {
    const viewer = viewerRef.current;
    const points = graphicPointsRef.current;
    const gt = GRAPHIC_TYPE_MAP[selectedGraphicType];
    if (!viewer || !gt || points.length < gt.minPoints) return;

    clearGraphicPreview();

    const color = cesiumColorFromHex(graphicColor);
    const label = graphicLabel.trim() || gt.shortLabel;
    const group = makeDragGroup('graphic');
    const displayPoints = points.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt + 8 }));
    const graphicAnchor = makeGraphicAnchor(displayPoints);

    const positions = displayPoints.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)
    );

    // Closed shapes (NAI, OBJ)
    if (gt.closed && positions.length >= 3) {
      const poly = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: new Cesium.ColorMaterialProperty(color.withAlpha(0.12)),
          outline: true, outlineColor: color, outlineWidth: gt.lineWidth,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      markupEntitiesRef.current.push(
        markDraggable(poly, {
          kind: 'graphic',
          group,
          label,
          graphicGeometry: 'polygon',
          graphicOffsets: makeGraphicOffsets(displayPoints, graphicAnchor),
        })
      );
    }

    // Line graphics (everything except checkpoint)
    if (positions.length >= 2 && gt.id !== 'checkpoint') {
      let material;
      if (gt.arrowHead) {
        material = new Cesium.PolylineArrowMaterialProperty(color);
      } else if (gt.dashed) {
        material = new Cesium.PolylineDashMaterialProperty({ color, dashLength: 16 });
      } else {
        material = color;
      }

      const linePositions = gt.closed
        ? [...positions, positions[0]]  // close the polygon outline
        : positions;
      const linePoints = gt.closed
        ? [...displayPoints, displayPoints[0]]
        : displayPoints;

      const line = viewer.entities.add({
        polyline: {
          positions: linePositions,
          width: gt.lineWidth,
          material,
          clampToGround: !gt.arrowHead,
        },
      });
      markupEntitiesRef.current.push(
        markDraggable(line, {
          kind: 'graphic',
          group,
          label,
          graphicGeometry: 'polyline',
          graphicOffsets: makeGraphicOffsets(linePoints, graphicAnchor),
        })
      );
    }

    // Labels
    const addLabel = (pos, text, offset = new Cesium.Cartesian2(0, -18)) => {
      const labelPoint = cartesianToGraphicPoint(pos);
      const e = viewer.entities.add({
        position: pos,
        label: {
          text,
          font: 'bold 11px monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: offset,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      markupEntitiesRef.current.push(
        markDraggable(e, {
          kind: 'graphic',
          group,
          label: text,
          graphicGeometry: 'point',
          graphicOffsets: makeGraphicOffsets([labelPoint], graphicAnchor),
        })
      );
    };

    if (gt.id === 'checkpoint') {
      // Single point + label
      const pos = Cesium.Cartesian3.fromDegrees(points[0].lon, points[0].lat, points[0].alt + 12);
      const dot = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 14,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: label,
          font: 'bold 11px monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      markupEntitiesRef.current.push(
        markDraggable(dot, {
          kind: 'graphic',
          group,
          label,
          graphicGeometry: 'point',
          graphicOffsets: makeGraphicOffsets([{ lat: points[0].lat, lon: points[0].lon, alt: points[0].alt + 12 }], graphicAnchor),
        })
      );
    } else if (!gt.closed) {
      // Midpoint label for all open line graphics
      const mid = positions[Math.floor(positions.length / 2)];
      addLabel(mid, label);

      // Phase line and FSCL: also label both endpoints
      if (gt.endLabels) {
        addLabel(positions[0], label);
        addLabel(positions[positions.length - 1], label);
      }
    } else {
      // Closed shape: centroid label
      const cx = points.reduce((s, p) => s + p.lon, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const alt = points.reduce((s, p) => s + p.alt, 0) / points.length;
      addLabel(
        Cesium.Cartesian3.fromDegrees(cx, cy, alt + 20),
        label,
        new Cesium.Cartesian2(0, 0)
      );
    }

    // Reset drawing state
    graphicPointsRef.current = [];
    setGraphicPointCount(0);
  }, [selectedGraphicType, graphicLabel, graphicColor, clearGraphicPreview]);

  const undoLastGraphicPoint = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || graphicPointsRef.current.length === 0) return;

    graphicPointsRef.current.pop();
    const newCount = graphicPointsRef.current.length;
    setGraphicPointCount(newCount);

    // Remove last preview dot
    const lastDot = graphicPreviewRef.current.dots.pop();
    if (lastDot) viewer.entities.remove(lastDot);

    // Rebuild preview line from remaining points
    if (graphicPreviewRef.current.line) {
      viewer.entities.remove(graphicPreviewRef.current.line);
      graphicPreviewRef.current.line = null;
    }
    if (newCount >= 2) {
      const gt = GRAPHIC_TYPE_MAP[selectedGraphicType];
      const color = cesiumColorFromHex(graphicColor);
      const positions = graphicPointsRef.current.map(p =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt + 8)
      );
      const closed = gt?.closed && positions.length >= 3;
      graphicPreviewRef.current.line = viewer.entities.add({
        polyline: {
          positions: closed ? [...positions, positions[0]] : positions,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color, dashLength: 10 }),
          clampToGround: true,
        },
      });
    }
  }, [selectedGraphicType, graphicColor]);

  const startImpactAnimation = useCallback((analysis, missile) => {
    const viewer = viewerRef.current;
    const path = analysis?.trajectory_path ?? [];
    if (!viewer || path.length < 2) return;

    stopImpactAnimation();

    const color = cesiumColorFromHex(missile?.color ?? '#FF3300');
    const start = path[0];
    const mover = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.alt),
      point: {
        pixelSize: missile?.pixelSize ?? 14,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${missile?.name ?? 'THREAT'}\nIN FLIGHT`,
        font: 'bold 10px monospace',
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    impactEntitiesRef.current.push(mover);

    const endTime = path[path.length - 1].time_s ?? analysis.flight_time_s ?? 0;
    impactAnimationRef.current = {
      raf: null,
      entity: mover,
      startWall: performance.now(),
      path,
    };

    const tick = () => {
      const elapsed = (performance.now() - impactAnimationRef.current.startWall) / 1000;
      const point = pathPointAtTime(path, elapsed);
      if (point) {
        mover.position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.alt);
        const remaining = Math.max(endTime - elapsed, 0);
        mover.label.text = remaining <= 0.05
          ? `${missile?.name ?? 'THREAT'}\nIMPACT`
          : `${missile?.name ?? 'THREAT'}\nTTI ${remaining.toFixed(1)}s`;
      }

      if (elapsed < endTime) {
        impactAnimationRef.current.raf = requestAnimationFrame(tick);
      } else {
        impactAnimationRef.current.raf = null;
      }
    };

    impactAnimationRef.current.raf = requestAnimationFrame(tick);
  }, [stopImpactAnimation]);

  // ---- Cesium init ----
  useEffect(() => {
    if (!cesiumContainer.current) return;
    const viewer = new Cesium.Viewer(cesiumContainer.current, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false, timeline: false,
      baseLayerPicker: false, selectionIndicator: false, infoBox: false,
    });
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(23.2, 54.1, 120000.0),
      orientation: { pitch: -0.6 },
    });
    viewerRef.current = viewer;
    return () => {
      if (impactAnimationRef.current.raf) cancelAnimationFrame(impactAnimationRef.current.raf);
      if (handlerRef.current) handlerRef.current.destroy();
      viewer.destroy();
    };
  }, []);

  // ---- Pre-seed radar network on globe ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove existing radar entities
    radarEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    radarEntitiesRef.current = [];

    if (!radarNetworkVisible) return;

    RADAR_SYSTEMS.forEach(radar => {
      const color = cesiumColorFromHex(radar.color);
      const radiusM = radar.maxRangeKm * 1000;
      const ceilM = Math.max(radar.maxAltM ?? 15000, radiusM * 0.1);

      // Coverage dome (ellipsoid hemisphere)
      const dome = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(radar.lon, radar.lat, radar.elevationM ?? 50),
        ellipsoid: {
          radii: new Cesium.Cartesian3(radiusM, radiusM, Math.min(ceilM, radiusM)),
          minimumCone: 0,
          maximumCone: Cesium.Math.PI_OVER_TWO,
          material: new Cesium.ColorMaterialProperty(color.withAlpha(radar.nation === 'Russia' ? 0.05 : 0.04)),
          outline: true,
          outlineColor: color.withAlpha(0.45),
          outlineWidth: 1,
          slicePartitions: 32, stackPartitions: 12, subdivisions: 64,
        },
      });

      // Sensor marker point
      const marker = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(radar.lon, radar.lat, (radar.elevationM ?? 50) + 10),
        point: {
          pixelSize: radar.nation === 'Russia' ? 9 : 8,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: radar.name,
          font: '9px monospace',
          pixelOffset: new Cesium.Cartesian2(0, -18),
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(5e4, 1.0, 4e5, 0.0),
        },
      });

      // Attach sensor data so it participates in the detection pipeline
      const sensorData = {
        id:             radar.id,
        name:           radar.name,
        type:           radar.type ?? 'radar',
        domains:        radar.domains ?? ['radar'],
        rangeKm:        radar.maxRangeKm,
        altitudeFtAGL:  ((radar.maxAltM ?? 15000) / 0.3048),
        quality:        radar.quality ?? 0.85,
        lat:            radar.lat,
        lon:            radar.lon,
        terrainAlt:     radar.elevationM ?? 50,
        // Physics fields
        refRcsM2:       radar.refRcsM2 ?? 1.0,
        maxRangeKm:     radar.maxRangeKm,
        elevationM:     radar.elevationM ?? 50,
        maxAltM:        radar.maxAltM ?? 15000,
        minAltM:        radar.minAltM ?? 0,
        frequencyBand:  radar.frequencyBand ?? '?',
        nation:         radar.nation ?? 'UNK',
      };
      dome._cuasData   = sensorData;
      marker._cuasData = sensorData;

      radarEntitiesRef.current.push(dome, marker);
    });
  }, [radarNetworkVisible]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    boundaryEntitiesRef.current.forEach(entity => viewer.entities.remove(entity));
    boundaryEntitiesRef.current = [];

    EXERCISE_BOUNDARIES.forEach(boundary => {
      const visible = boundary.type === 'country' ? countryBoundariesVisible : stateBoundariesVisible;
      if (!visible) return;

      const color = cesiumColorFromHex(boundary.color);
      boundary.lines.forEach((line, index) => {
        boundaryEntitiesRef.current.push(viewer.entities.add({
          polyline: {
            positions: line.map(([lat, lon]) => Cesium.Cartesian3.fromDegrees(lon, lat, 250)),
            width: boundary.type === 'country' ? 3 : 2,
            material: boundary.type === 'country'
              ? new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.18, color })
              : new Cesium.PolylineDashMaterialProperty({ color: color.withAlpha(0.9), dashLength: 14 }),
            clampToGround: true,
          },
          properties: {
            layer: 'exercise-boundary',
            boundaryId: boundary.id,
            segment: index,
          },
        }));
      });

      boundaryEntitiesRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(boundary.labelPoint.lon, boundary.labelPoint.lat, boundary.type === 'country' ? 1400 : 900),
        label: {
          text: exerciseBoundaryNames[boundary.id] ?? boundary.defaultName,
          font: boundary.type === 'country' ? 'bold 13px monospace' : 'bold 10px monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: boundary.type === 'country'
            ? new Cesium.NearFarScalar(5e4, 1.0, 8e5, 0.35)
            : new Cesium.NearFarScalar(5e4, 0.9, 5e5, 0.0),
        },
        properties: {
          layer: 'exercise-boundary-label',
          boundaryId: boundary.id,
        },
      }));
    });

    viewer.scene.requestRender();
  }, [countryBoundariesVisible, stateBoundariesVisible, exerciseBoundaryNames]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable;
      if (isTyping) return;

      deleteSelectedMapItem();
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelectedMapItem]);

  // ---- Click handler ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (handlerRef.current) handlerRef.current.destroy();

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      const entity = picked?.id;
      if (!entity?._draggable) return;

      selectMapItem(entity);
      dragRef.current = {
        active: true,
        moved: false,
        group: entity._dragGroup,
        entity,
      };
      viewer.scene.screenSpaceCameraController.enableRotate = false;
      viewer.scene.screenSpaceCameraController.enableTranslate = false;
      viewer.scene.canvas.style.cursor = 'grabbing';
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement) => {
      const drag = dragRef.current;
      if (!drag.active) return;

      const cartesian = viewer.scene.pickPosition(movement.endPosition);
      if (!Cesium.defined(cartesian)) return;

      drag.moved = true;
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const terrainAlt = cartographic.height ?? 0;
      const groupEntities = viewer.entities.values.filter(e => e._dragGroup === drag.group);

      groupEntities.forEach(entity => {
        const displayAlt = terrainAlt + (entity._dragDisplayOffsetM ?? 0);
        updateEntityMapPosition(entity, lat, lon, displayAlt);

        if (entity._waypointIndex != null && waypointsRef.current[entity._waypointIndex]) {
          waypointsRef.current[entity._waypointIndex] = {
            lat,
            lon,
            alt: terrainAlt + (entity._waypointAltitudeOffsetM ?? 0),
          };
        }
      });

      refreshWaypointPreview();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (dragRef.current.active) {
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
        viewer.scene.canvas.style.cursor = '';
      }
      window.setTimeout(() => {
        dragRef.current = { active: false, moved: false, group: null, entity: null };
      }, 0);
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction(async (click) => {
      if (dragRef.current.moved) return;
      const pickedEntity = viewer.scene.pick(click.position)?.id;
      if (pickedEntity?._draggable) {
        selectMapItem(pickedEntity);
        return;
      }
      selectMapItem(null);

      // pickPosition needs a rendered depth value — fall back to ellipsoid when tiles haven't loaded
      let cartesian = viewer.scene.pickPosition(click.position);
      if (!Cesium.defined(cartesian)) {
        const ray = viewer.camera.getPickRay(click.position);
        if (Cesium.defined(ray)) cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      }
      if (!Cesium.defined(cartesian)) return;
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);

      // Safe terrain height — falls back to depth-buffer height when provider isn't ready
      const sampleHeight = async (cart) => {
        try {
          const [s] = await withTimeout(
            Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cart]),
            1800,
            'terrain height',
          );
          return s.height ?? cart.height ?? 0;
        } catch {
          return cart.height ?? 0;
        }
      };

      // ── LOS ANALYSIS ──
      if (mode === 'los') {
        const height = await sampleHeight(cartographic);
        const observerAglM = 10;
        const targetAglM = 50;
        if (!firstPointRef.current) {
          losEntitiesRef.current.forEach(e => viewer.entities.remove(e));
          losEntitiesRef.current = [];
          setLosAnalysis(null);
          setLosPending(false);
          setLosAwaitingTarget(true);

          const observerCartographic = Cesium.Cartographic.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            height + observerAglM,
          );
          const observerCartesian = Cesium.Cartesian3.fromRadians(
            observerCartographic.longitude,
            observerCartographic.latitude,
            observerCartographic.height,
          );
          firstPointRef.current = {
            terrainHeight: height,
            cartographic: observerCartographic,
            cartesian: observerCartesian,
            lat,
            lon,
          };
          const e = viewer.entities.add({
            position: observerCartesian,
            point: { pixelSize: 12, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              text: `RADAR NODE\n+${observerAglM}m AGL`,
              font: 'bold 12px monospace',
              pixelOffset: new Cesium.Cartesian2(0, -28),
              fillColor: Cesium.Color.LIME,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            },
          });
          losEntitiesRef.current.push(e);
        } else {
          setLosPending(true);
          setLosAwaitingTarget(false);

          try {
            const firstPoint = firstPointRef.current;
            const targetCartographic = Cesium.Cartographic.fromRadians(
              cartographic.longitude,
              cartographic.latitude,
              height + targetAglM,
            );
            const targetCartesian = Cesium.Cartesian3.fromRadians(
              targetCartographic.longitude,
              targetCartographic.latitude,
              targetCartographic.height,
            );
            const distanceKm = geodesicDistanceKm(firstPoint.lat, firstPoint.lon, lat, lon);
            const sampleCount = Math.min(240, Math.max(64, Math.ceil(distanceKm * 18)));
            const profilePoints = [];
            for (let i = 0; i <= sampleCount; i++) {
              const t = sampleCount === 0 ? 0 : i / sampleCount;
              profilePoints.push(Cesium.Cartographic.fromRadians(
                Cesium.Math.lerp(firstPoint.cartographic.longitude, targetCartographic.longitude, t),
                Cesium.Math.lerp(firstPoint.cartographic.latitude, targetCartographic.latitude, t),
              ));
            }
            let sampledProfile;
            try {
              sampledProfile = await withTimeout(
                Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, profilePoints),
                2500,
                'LOS terrain profile',
              );
            } catch {
              sampledProfile = profilePoints.map((p, index) => {
                const t = sampleCount === 0 ? 0 : index / sampleCount;
                return {
                  longitude: p.longitude,
                  latitude: p.latitude,
                  height: Cesium.Math.lerp(firstPoint.terrainHeight, height, t),
                };
              });
            }
            const heights = sampledProfile.map(p => p.height ?? 0);
            let result;
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), 1800);
              const res = await fetch(`${BACKEND}/analyze-gap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                  observer_alt: firstPoint.terrainHeight + observerAglM,
                  target_alt: height + targetAglM,
                  terrain_profile: heights,
                }),
              }).finally(() => window.clearTimeout(timeoutId));
              result = normalizeLOSResult(await res.json(), heights, firstPoint.terrainHeight + observerAglM, height + targetAglM);
            } catch (err) {
              console.error('Backend offline:', err);
              result = normalizeLOSResult(null, heights, firstPoint.terrainHeight + observerAglM, height + targetAglM);
            }

            const statusColor = result.is_detected ? Cesium.Color.LIME : Cesium.Color.RED;
            const rayPositions = profilePoints.map((point, index) => {
              const t = sampleCount === 0 ? 0 : index / sampleCount;
              const rayAlt = Cesium.Math.lerp(firstPoint.terrainHeight + observerAglM, height + targetAglM, t);
              return Cesium.Cartesian3.fromRadians(point.longitude, point.latitude, rayAlt);
            });

            for (let i = 0; i < rayPositions.length - 1; i++) {
              const blocked = result.clearances[i] < 0 || result.clearances[i + 1] < 0;
              losEntitiesRef.current.push(viewer.entities.add({
                polyline: {
                  positions: [rayPositions[i], rayPositions[i + 1]],
                  width: blocked ? 5 : 4,
                  material: blocked
                    ? new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.RED })
                    : new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.18, color: Cesium.Color.LIME }),
                  clampToGround: false,
                },
              }));
            }

            losEntitiesRef.current.push(
              viewer.entities.add({
                position: targetCartesian,
                point: { pixelSize: 12, color: statusColor, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
                label: {
                  text: `${result.is_detected ? 'TARGET VISIBLE' : 'TARGET MASKED'}\n${result.distance_km?.toFixed?.(2) ?? distanceKm.toFixed(2)} km`,
                  font: 'bold 12px monospace',
                  fillColor: statusColor,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -34),
                },
              }),
            );

            if (!result.is_detected && result.first_obstruction_index != null) {
              const obstructionPoint = sampledProfile[result.first_obstruction_index];
              losEntitiesRef.current.push(viewer.entities.add({
                position: Cesium.Cartesian3.fromRadians(
                  obstructionPoint.longitude,
                  obstructionPoint.latitude,
                  (obstructionPoint.height ?? 0) + 8,
                ),
                point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
                label: {
                  text: `FIRST OBSTRUCTION\n${result.max_obstruction_m}m ABOVE LOS`,
                  font: 'bold 10px monospace',
                  fillColor: Cesium.Color.RED,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -24),
                },
              }));
            }

            setLosAnalysis({
              ...result,
              distance_km: distanceKm,
              observer_agl_m: observerAglM,
              target_agl_m: targetAglM,
            });
            firstPointRef.current = null;
          } catch (err) {
            console.error('LOS analysis failed:', err);
            setLosAnalysis({
              is_detected: false,
              status: 'LOS ANALYSIS FAILED',
              distance_km: geodesicDistanceKm(firstPointRef.current.lat, firstPointRef.current.lon, lat, lon),
              observer_agl_m: observerAglM,
              target_agl_m: targetAglM,
              obstruction_count: 0,
              min_clearance_m: null,
              max_obstruction_m: null,
              clearances: [],
            });
          } finally {
            setLosPending(false);
          }
        }
        return;
      }

      // ── PLACE UNIT ──
      if (mode === 'place-unit' && selectedUnit) {
        const sidc = selectedUnit.sidcs[faction];
        const canvas = milSymbolCanvas(sidc);
        if (!canvas) return;
        const image = new Image();
        image.src = canvas.toDataURL();
        await new Promise(r => { image.onload = r; });
        const dragGroup = makeDragGroup('unit');
        const unitEntity = markDraggable(viewer.entities.add({
          position: cartesian,
          billboard: { image, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scale: 1.0, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: selectedUnit.label, font: '11px monospace', pixelOffset: new Cesium.Cartesian2(0, -(canvas.height + 4)), fillColor: faction === FACTIONS.FRIENDLY ? Cesium.Color.CYAN : Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
        }), { kind: 'unit', group: dragGroup, label: selectedUnit.label });
        unitEntity._unitData = {
          id: selectedUnit.id,
          name: selectedUnit.label,
          faction,
          lat,
          lon,
          alt: cartographic.height ?? 0,
        };
        placedRef.current.push(unitEntity);
        return;
      }

      // ── PLACE C-UAS ──
      if (mode === 'place-cuas' && selectedCUAS) {
        const canvas = milSymbolCanvas(selectedCUAS.sidc);
        const cColor = cesiumColorFromHex(selectedCUAS.color);
        const dragGroup = makeDragGroup('cuas');
        const entities = [];
        if (canvas) {
          const img = new Image();
          img.src = canvas.toDataURL();
          await new Promise(r => { img.onload = r; });
          const b = markDraggable(viewer.entities.add({
            position: cartesian,
            billboard: { image: img, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: selectedCUAS.name, font: 'bold 11px monospace', pixelOffset: new Cesium.Cartesian2(0, -42), fillColor: cColor, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
          }), { kind: 'cuas', group: dragGroup, label: selectedCUAS.name });
          b._cuasData = {
            id: selectedCUAS.id,
            name: selectedCUAS.name,
            type: selectedCUAS.type,
            domains: detectionDomainsForSystem(selectedCUAS),
            rangeKm: selectedCUAS.rangeKm,
            altitudeFtAGL: selectedCUAS.altitudeFtAGL,
            quality: selectedCUAS.quality,
            lat,
            lon,
            terrainAlt: cartographic.height ?? 0,
          };
          entities.push(b);
        }
        if (selectedCUAS.rangeKm > 0) {
          const radiusM = selectedCUAS.rangeKm * 1000;
          const ring = markDraggable(viewer.entities.add({
            position: cartesian,
            ellipsoid: {
              radii: new Cesium.Cartesian3(radiusM, radiusM, radiusM),
              minimumCone: 0,
              maximumCone: Cesium.Math.PI_OVER_TWO,
              material: new Cesium.ColorMaterialProperty(cColor.withAlpha(0.08)),
              outline: true,
              outlineColor: cColor.withAlpha(0.75),
              outlineWidth: 1,
              slicePartitions: 32, stackPartitions: 16, subdivisions: 64,
            },
          }), { kind: 'cuas', group: dragGroup, label: selectedCUAS.name });
          ring._cuasData = {
            id: selectedCUAS.id,
            name: selectedCUAS.name,
            type: selectedCUAS.type,
            domains: detectionDomainsForSystem(selectedCUAS),
            rangeKm: selectedCUAS.rangeKm,
            altitudeFtAGL: selectedCUAS.altitudeFtAGL,
            quality: selectedCUAS.quality,
            lat,
            lon,
            terrainAlt: cartographic.height ?? 0,
          };
          entities.push(ring);
        }
        placedRef.current.push(...entities);
        return;
      }

      // ── PLACE DETECTION LAYER ──
      if (mode === 'place-layer' && selectedLayerAsset) {
        const layer = selectedLayerAsset;
        const layerColor = cesiumColorFromHex(layer.color);
        const dragGroup = makeDragGroup(layer.domain);
        const entities = [];

        const marker = markDraggable(viewer.entities.add({
          position: cartesian,
          point: {
            pixelSize: 13,
            color: layerColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: layer.name,
            font: 'bold 11px monospace',
            pixelOffset: new Cesium.Cartesian2(0, -26),
            fillColor: layerColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
        }), { kind: 'layer', group: dragGroup, label: layer.name });
        marker._cuasData = {
          id: layer.id,
          name: layer.name,
          type: layer.type,
          domains: [layer.domain],
          rangeKm: layer.rangeKm,
          altitudeFtAGL: layer.altitudeFtAGL,
          quality: layer.quality,
          lat,
          lon,
          terrainAlt: cartographic.height ?? 0,
        };
        entities.push(marker);

        const radiusM = layer.rangeKm * 1000;
        const ceilingM = Math.max((layer.altitudeFtAGL ?? 0) * 0.3048, radiusM * 0.12, 150);
        const ring = markDraggable(viewer.entities.add({
          position: cartesian,
          ellipsoid: {
            radii: new Cesium.Cartesian3(radiusM, radiusM, ceilingM),
            minimumCone: 0,
            maximumCone: Cesium.Math.PI_OVER_TWO,
            material: new Cesium.ColorMaterialProperty(layerColor.withAlpha(0.075)),
            outline: true,
            outlineColor: layerColor.withAlpha(0.75),
            outlineWidth: 1.5,
            slicePartitions: 48,
            stackPartitions: 20,
            subdivisions: 96,
          },
        }), { kind: 'layer', group: dragGroup, label: layer.name });
        ring._cuasData = { ...marker._cuasData };
        entities.push(ring);

        placedRef.current.push(...entities);
        return;
      }

      // ── DRAW UAS PATH ──
      if (mode === 'draw-path' && threatMode === 'uas') {
        const terrainH = await sampleHeight(cartographic);
        const droneAlt = terrainH + (selectedDrone?.aglMeters ?? 100);
        waypointsRef.current.push({ lat, lon, alt: droneAlt });
        const newCount = waypointsRef.current.length;
        setWaypointCount(newCount);

        const wpPos = Cesium.Cartesian3.fromDegrees(lon, lat, droneAlt);
        const dot = markDraggable(viewer.entities.add({
          position: wpPos,
          point: { pixelSize: 8, color: Cesium.Color.ORANGERED, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: `WP${newCount}`, font: '10px monospace', pixelOffset: new Cesium.Cartesian2(0, -16), fillColor: Cesium.Color.ORANGERED },
        }), {
          kind: 'waypoint',
          label: `WP${newCount}`,
          waypointIndex: newCount - 1,
          waypointAltitudeOffsetM: selectedDrone?.aglMeters ?? 100,
          displayOffsetM: selectedDrone?.aglMeters ?? 100,
        });
        waypointEntitiesRef.current.push(dot);

        if (pathLineRef.current) viewer.entities.remove(pathLineRef.current);
        if (newCount >= 2) {
          pathLineRef.current = viewer.entities.add({
            polyline: {
              positions: waypointsRef.current.map(wp => Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt)),
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGERED }),
            },
          });
        }
        return;
      }

      // ── MISSILE LAUNCH / TARGET (2-click) ──
      if (mode === 'draw-path' && threatMode === 'missile') {
        const terrainAlt = await sampleHeight(cartographic);

        if (!missileClickRef.current) {
          // First click: launch point
          missileClickRef.current = { lat, lon, alt: terrainAlt };
          const e = markDraggable(viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 10),
            point: { pixelSize: 14, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: `LAUNCH: ${selectedMissile?.name ?? 'MISSILE'}`, font: 'bold 12px monospace', pixelOffset: new Cesium.Cartesian2(0, -22), fillColor: Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
          }), { kind: 'waypoint', label: `LAUNCH: ${selectedMissile?.name ?? 'MISSILE'}`, waypointIndex: 0, displayOffsetM: 10 });
          waypointEntitiesRef.current.push(e);
          setWaypointCount(1);
        } else {
          // Second click: target — immediately compute and show trajectory preview
          const launch = missileClickRef.current;
          const target = { lat, lon, alt: terrainAlt };
          missileClickRef.current = null;

          const e = markDraggable(viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 10),
            point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: 'TARGET', font: 'bold 12px monospace', pixelOffset: new Cesium.Cartesian2(0, -22), fillColor: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
          }), { kind: 'waypoint', label: 'TARGET', waypointIndex: 1, displayOffsetM: 10 });
          waypointEntitiesRef.current.push(e);
          setWaypointCount(2);

          // Store as two-point missile waypoints
          waypointsRef.current = [launch, target];

          // Draw preview arc
          const previewPath = getMissilePreviewPath(launch, target, selectedMissile);
          if (pathLineRef.current) viewer.entities.remove(pathLineRef.current);
          const arcColor = cesiumColorFromHex(selectedMissile?.color ?? '#FF3300');
          pathLineRef.current = viewer.entities.add({
            polyline: {
              positions: previewPath.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)),
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: arcColor }),
              clampToGround: false,
            },
          });
        }
        return;
      }

      // ── IMPACT ANALYSIS (2-click: launch → target) ──
      if (mode === 'impact-analysis') {
        const terrainAlt = await sampleHeight(cartographic);

        if (!impactClickRef.current) {
          // Clear previous impact entities
          stopImpactAnimation(false);
          impactEntitiesRef.current.forEach(e => viewer.entities.remove(e));
          impactEntitiesRef.current = [];
          setImpactAnalysis(null);

          impactClickRef.current = { lat, lon, alt: terrainAlt };
          const e = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 20),
            point: { pixelSize: 16, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: 'LAUNCH ORIGIN', font: 'bold 12px monospace', pixelOffset: new Cesium.Cartesian2(0, -26), fillColor: Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
          });
          impactEntitiesRef.current.push(e);
        } else {
          const launch = impactClickRef.current;
          const target = { lat, lon, alt: terrainAlt };
          impactClickRef.current = null;

          const missile = selectedMissile ?? MISSILE_THREATS[0];

          // Collect all sensors (placed + pre-seeded radar network)
          const allSensors = [
            ...placedRef.current
              .filter(e => e._cuasData?.rangeKm > 0)
              .map(e => e._cuasData),
            ...radarEntitiesRef.current
              .filter(e => e._cuasData?.refRcsM2)  // de-dup: only dome entities have refRcsM2
              .map(e => e._cuasData),
          ];
          // Deduplicate by sensor id
          const sensorMap = new Map(allSensors.map(s => [s.id, s]));
          const sensorList = [...sensorMap.values()].map(s => ({
            id: s.id, name: s.name, lat: s.lat, lon: s.lon,
            elevationM: s.elevationM ?? s.terrainAlt ?? 50,
            maxRangeKm: s.maxRangeKm ?? s.rangeKm,
            minAltM: s.minAltM ?? 0,
            maxAltM: s.maxAltM ?? 100000,
            refRcsM2: s.refRcsM2 ?? 1.0,
            nation: s.nation ?? 'UNK',
            frequencyBand: s.frequencyBand ?? '?',
          }));

          // Call backend impact analysis
          let analysis;
          try {
            const res = await fetch(`${BACKEND}/analyze-impact-v2`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                launch_lat: launch.lat, launch_lon: launch.lon, launch_alt: launch.alt,
                target_lat: lat, target_lon: lon, target_alt: terrainAlt,
                trajectory_type: missile.type,
                speed_mach: missile.speedMach,
                apogee_km: missile.apogeeKm,
                warhead_kg: missile.warheadKg ?? 50,
                warhead_type: missile.type === 'rocket' ? 'he' : 'he',
                missile_id: missile.id ?? '_default_ballistic',
                cep_meters: missile.cepMeters ?? 50,
                sensors: sensorList,
              }),
            });
            analysis = await res.json();
          } catch {
            // Client fallback
            const MACH = 343;
            const dist = geodesicDistanceKm(launch.lat, launch.lon, lat, lon);
            const ft = (dist * 1000) / (missile.speedMach * MACH);
            const W = missile.warheadKg ?? 50;
            const cbrt = Math.cbrt(W);
            analysis = {
              flight_time_s: ft, dist_km: dist,
              trajectory_path: getMissilePreviewPath(launch, target, missile),
              blast_radii: { lethal_m: 15*cbrt, severe_m: 35*cbrt, moderate_m: 70*cbrt, light_m: 150*cbrt },
              shelter_windows: { react_deadline_s: ft-5, cover_deadline_s: ft-20, shelter_deadline_s: ft-35 },
              warning_level: ft < 35 ? 'TAKE COVER NOW' : ft < 120 ? 'PREPARE TO SHELTER' : 'MONITOR',
              warning_color: ft < 35 ? '#FF0000' : ft < 120 ? '#FFAA00' : '#ADFF2F',
            };
          }

          // Draw trajectory arc
          const arcColor = cesiumColorFromHex(missile.color ?? '#FF3300');
          const arcEntity = viewer.entities.add({
            polyline: {
              positions: analysis.trajectory_path.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)),
              width: 3,
              material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: arcColor }),
              clampToGround: false,
            },
          });
          impactEntitiesRef.current.push(arcEntity);

          // Draw impact point with pulsing indicator
          const impactPos = Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 5);
          const impactMarker = viewer.entities.add({
            position: impactPos,
            point: { pixelSize: 20, color: Cesium.Color.RED.withAlpha(0.9), outlineColor: Cesium.Color.WHITE, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              text: `IMPACT POINT\n${missile.name}`,
              font: 'bold 11px monospace',
              pixelOffset: new Cesium.Cartesian2(0, -30),
              fillColor: Cesium.Color.RED,
              outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            },
          });
          impactEntitiesRef.current.push(impactMarker);

          // Draw concentric blast zone rings (flat ellipses on terrain)
          const zoneConfig = [
            { key: 'light_m',    color: '#FFE066', alpha: 0.08, label: 'LIGHT DAMAGE' },
            { key: 'moderate_m', color: '#FFAA00', alpha: 0.12, label: 'MODERATE BLAST' },
            { key: 'severe_m',   color: '#FF6600', alpha: 0.16, label: 'SEVERE BLAST' },
            { key: 'lethal_m',   color: '#FF0000', alpha: 0.22, label: 'LETHAL ZONE' },
          ];

          for (const zone of zoneConfig) {
            const rM = analysis.blast_radii[zone.key];
            const zColor = cesiumColorFromHex(zone.color);
            const ring = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 1),
              ellipse: {
                semiMajorAxis: rM,
                semiMinorAxis: rM,
                material: new Cesium.ColorMaterialProperty(zColor.withAlpha(zone.alpha)),
                outline: true,
                outlineColor: zColor.withAlpha(0.85),
                outlineWidth: 1.5,
                height: terrainAlt + 2,
              },
            });
            // Label outermost ring
            if (zone.key === 'light_m') {
              const labelPos = Cesium.Cartesian3.fromDegrees(lon, lat + (rM / 111000), terrainAlt + 5);
              const labelE = viewer.entities.add({
                position: labelPos,
                label: {
                  text: `${zone.label}: ${rM >= 1000 ? (rM/1000).toFixed(1)+'km' : rM+'m'}`,
                  font: '9px monospace',
                  fillColor: zColor,
                  outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -8),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              });
              impactEntitiesRef.current.push(labelE);
            }
            impactEntitiesRef.current.push(ring);
          }

          // Draw CEP probability rings (dashed outlines at impact point)
          if (analysis.cep_rings) {
            const cepConfigs = [
              { r: analysis.cep_rings.r99_m, color: '#FF3300', dash: [4, 8] },
              { r: analysis.cep_rings.r90_m, color: '#FFD700', dash: [6, 6] },
              { r: analysis.cep_rings.r50_m, color: '#ADFF2F', dash: [8, 4] },
            ];
            for (const { r, color } of cepConfigs) {
              const cepColor = cesiumColorFromHex(color);
              const cepRing = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 3),
                ellipse: {
                  semiMajorAxis: r,
                  semiMinorAxis: r,
                  material: new Cesium.ColorMaterialProperty(cepColor.withAlpha(0.0)),
                  outline: true,
                  outlineColor: cepColor.withAlpha(0.7),
                  outlineWidth: 1,
                  height: terrainAlt + 4,
                },
              });
              impactEntitiesRef.current.push(cepRing);
            }
            // Label the 90% ring
            const r90 = analysis.cep_rings.r90_m;
            const cepLabel = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat + r90 / 111000, terrainAlt + 5),
              label: {
                text: `90% ≤ ${r90 >= 1000 ? (r90/1000).toFixed(1)+'km' : r90+'m'}`,
                font: '8px monospace',
                fillColor: cesiumColorFromHex('#FFD700'),
                outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            impactEntitiesRef.current.push(cepLabel);
          }

          setImpactAnalysis(analysis);
          setImpactMissile(missile);
          startImpactAnimation(analysis, missile);
        }
        return;
      }

      // ── PLAN GRAPHICS (multi-click drawing) ──
      if (mode === 'plan-graphics') {
        const gt = GRAPHIC_TYPE_MAP[selectedGraphicType];
        if (!gt) return;

        const terrainAlt = await sampleHeight(cartographic);
        const point = { lat, lon, alt: terrainAlt };

        graphicPointsRef.current.push(point);
        const newCount = graphicPointsRef.current.length;
        setGraphicPointCount(newCount);

        // Preview dot
        const dotColor = cesiumColorFromHex(graphicColor);
        const dot = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 10),
          point: {
            pixelSize: 6,
            color: dotColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        graphicPreviewRef.current.dots.push(dot);

        // Update preview line
        if (graphicPreviewRef.current.line) {
          viewer.entities.remove(graphicPreviewRef.current.line);
          graphicPreviewRef.current.line = null;
        }
        if (newCount >= 2) {
          const positions = graphicPointsRef.current.map(p =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt + 8)
          );
          const closed = gt.closed && newCount >= 3;
          graphicPreviewRef.current.line = viewer.entities.add({
            polyline: {
              positions: closed ? [...positions, positions[0]] : positions,
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: dotColor, dashLength: 10 }),
              clampToGround: true,
            },
          });
        }

        // Single-point types finish immediately
        if (!gt.multiPoint) {
          finishGraphic();
        }
        return;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }, [mode, faction, selectedUnit, selectedCUAS, selectedLayerAsset, selectedDrone, selectedMissile, threatMode, selectedGraphicType, graphicColor, graphicLabel, refreshWaypointPreview, selectMapItem, startImpactAnimation, stopImpactAnimation, finishGraphic]);

  // ---- Launch simulation ----
  const handleSimulate = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || waypointsRef.current.length < 2) return;

    cancelAnimationFrame(simRef.current.raf);
    simRef.current.entities.forEach(e => viewer.entities.remove(e));
    simRef.current.raf = null;
    simRef.current.startWall = null;
    setSimActive(false);
    setSimPlaying(false);
    setSimElapsed(0);
    setIntercepts([]);
    setSimSensorEvents([]);

    const threat = threatMode === 'uas' ? (selectedDrone ?? DRONE_TYPES[0]) : (selectedMissile ?? MISSILE_THREATS[0]);
    const speedMs = threatMode === 'uas'
      ? Math.max(threat.speedMs ?? 25, 1)
      : Math.max((threat.speedMach ?? 3) * 343, 1);
    const path = ensureTimedPath(
      threatMode === 'uas'
        ? buildClientUASPath(waypointsRef.current, speedMs)
        : getMissilePreviewPath(waypointsRef.current[0], waypointsRef.current[1], threat),
      speedMs,
    );

    if (path.length < 2) return;

    // Collect sensors: placed C-UAS + pre-seeded radar network
    const placedSensors = [...new Map(
      placedRef.current
        .filter(e => e._cuasData && e._cuasData.rangeKm > 0)
        .map(e => [`${e._cuasData.id}-${e._cuasData.lat}-${e._cuasData.lon}`, e._cuasData])
    ).values()];
    const radarSensors = [...new Map(
      radarEntitiesRef.current
        .filter(e => e._cuasData?.refRcsM2)
        .map(e => [e._cuasData.id, e._cuasData])
    ).values()];
    const cuasList = [...placedSensors, ...radarSensors];

    // Create threat dot entity/entities
    const threatColor = cesiumColorFromHex(threat?.color ?? '#FF3300');
    const count = threatMode === 'uas' ? (selectedDrone?.count ?? 1) : 1;
    const simPaths = threatMode === 'uas'
      ? Array.from({ length: count }, (_, i) => makeErraticUASPath(path, selectedDrone, i))
      : [path];
    const protectionAssessment = buildProtectionAssessment(path, threat, threatMode);
    // Draw glowing trail showing flight path
    if (Array.isArray(trailRef.current)) {
      trailRef.current.forEach(e => viewer.entities.remove(e));
    } else if (trailRef.current) {
      viewer.entities.remove(trailRef.current);
    }
    trailRef.current = simPaths.map((simPath, i) =>
      drawPathTrail(viewer, simPath, threatColor.withAlpha(i === 0 ? 0.5 : 0.22), i === 0 ? 2 : 1)
    );
    placedRef.current.push(...trailRef.current);

    const droneEntities = [];
    const threatLabel = threat?.name ?? (threatMode === 'uas' ? 'UAS' : 'THREAT');
    for (let i = 0; i < count; i++) {
      const start = simPaths[i][0];
      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.alt),
        point: {
          pixelSize: Math.max(threat?.pixelSize ?? 12, threatMode === 'missile' ? 18 : 14),
          color: threatColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${threatLabel}\nLAUNCHED`,
          font: 'bold 12px monospace',
          fillColor: threatColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      droneEntities.push(ent);
    }
    const runId = Date.now();

    simRef.current = {
      path,
      paths: simPaths,
      entities: droneEntities,
      cuasList,
      sensorEvents: [],
      threat,
      threatMode,
      env: planningEnv,
      alertedIds: new Set(),
      lastFusionUpdate: 0,
      startWall: performance.now(),
      speed: simSpeed,
      raf: null,
      runId,
    };
    setSimActive(true);
    setSimPlaying(true);
    setSimElapsed(0);
    setIntercepts([]);
    setSimSensorEvents([]);
    setThreatIntel(protectionAssessment);
    setImpactAnalysis(protectionAssessment);
    setImpactMissile(threat);
    viewer.flyTo([...droneEntities, ...trailRef.current], { duration: 0.75 }).catch(() => {});
    viewer.scene.requestRender();

    // Kick off the animation loop immediately — no separate PLAY click needed
    const animPaths = simPaths;
    const tick = () => {
      if (!simRef.current.startWall) return;
      const elapsed = ((performance.now() - simRef.current.startWall) / 1000) * simRef.current.speed;
      setSimElapsed(elapsed);
      const endTime = Math.max(...animPaths.map(p => p[p.length - 1]?.time_s ?? 0), 0);
      if (endTime > 0 && elapsed >= endTime) {
        setSimPlaying(false);
        simRef.current.startWall = null;
        return;
      }
      simRef.current.entities.forEach((ent, i) => {
        const pt = pathPointAtTime(animPaths[i] ?? animPaths[0], elapsed);
        if (!pt) return;
        ent.position = Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, pt.alt);
        if (ent.label) ent.label.text = `${threatLabel}\nT+${elapsed.toFixed(1)}s`;
        simRef.current.sensorEvents
          .filter(ev => ev.trackIndex === i && ev.time_s <= elapsed)
          .forEach(ev => {
            if (simRef.current.alertedIds.has(ev.id)) return;
            simRef.current.alertedIds.add(ev.id);
            setIntercepts(prev => [...prev, {
              time_s: ev.time_s, cuas_id: ev.sensor_id, cuas_name: ev.sensor_name,
              sensor_type: ev.sensor_type, lat: ev.lat, lon: ev.lon, alt: ev.alt,
              time_to_impact_s: ev.time_to_impact_s, closest_km: ev.closest_km,
              confidence: ev.confidence, downstream_sensors: ev.downstream_sensors,
            }]);
          });
      });
      viewer.scene.requestRender();
      simRef.current.raf = requestAnimationFrame(tick);
    };
    simRef.current.raf = requestAnimationFrame(tick);

    window.setTimeout(() => {
      if (simRef.current.runId !== runId) return;

      try {
        const analysisPaths = simPaths.map(simPath => resampleTimedPath(simPath, 240));
        const intel = estimateImpactIntelligence(analysisPaths, threat, threatMode, cuasList, planningEnv);

        if (simRef.current.runId !== runId) return;

        if (impactEstimateRef.current) {
          viewer.entities.remove(impactEstimateRef.current);
          impactEstimateRef.current = null;
        }
        if (intel) {
          impactEstimateRef.current = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(intel.target_lon, intel.target_lat, 0),
            ellipse: {
              semiMajorAxis: Math.max(intel.uncertainty_m, 15),
              semiMinorAxis: Math.max(intel.monte_carlo?.impact_p50_m ?? intel.uncertainty_m * 0.55, 10),
              material: new Cesium.ColorMaterialProperty(threatColor.withAlpha(0.12)),
              outline: true,
              outlineColor: threatColor.withAlpha(0.85),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: `PREDICTED IMPACT\nP90 ${intel.uncertainty_m}m`,
              font: 'bold 10px monospace',
              fillColor: threatColor,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -22),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        const mappedSensorEvents = (intel?.events ?? []).map((e, idx, arr) => {
          const sensor = cuasList.find(s => s.id === e.sensor_id);
          return {
            ...e,
            time_s:     e.entry_time_s,
            nation:     sensor?.nation ?? '?',
            freq_band:  sensor?.frequencyBand ?? '?',
            range_km:   e.closest_km,
            p_detect:   e.confidence,
            cue_alerts: (e.downstream_sensors ?? []).map(ds => ({
              sensor_name: ds.sensor_name,
              sensor_id:   ds.sensor_id ?? ds.sensor_name,
              eta_s:       ds.eta_s,
            })),
            cued_by: idx > 0 ? arr[0].sensor_id : null,
          };
        });

        simRef.current.sensorEvents = mappedSensorEvents;
        setSimSensorEvents(mappedSensorEvents);
        setThreatIntel({
          ...protectionAssessment,
          ...intel,
          protection_guidance: protectionAssessment.protection_guidance,
          shelter_windows: protectionAssessment.shelter_windows,
          blast_radii: protectionAssessment.blast_radii,
        });
      } catch (err) {
        console.error('simulation intelligence failed:', err);
      }
    }, 50);
  }, [threatMode, selectedDrone, selectedMissile, simSpeed, planningEnv]);

  // ---- Play / Pause ----
  const handlePlay = useCallback(() => {
    const sim = simRef.current;
    if (!simPlaying) {
      sim.startWall = performance.now() - (simElapsed * 1000) / sim.speed;
      const tick = () => {
        if (!simRef.current.startWall) return;
        const elapsed = ((performance.now() - simRef.current.startWall) / 1000) * simRef.current.speed;
        setSimElapsed(elapsed);
        const paths = simRef.current.paths.length ? simRef.current.paths : [simRef.current.path];
        const endTime = Math.max(...paths.map(p => p[p.length - 1]?.time_s ?? 0));
        if (elapsed >= endTime) { setSimPlaying(false); return; }

        if (elapsed - simRef.current.lastFusionUpdate >= 1 || simRef.current.lastFusionUpdate === 0) {
          simRef.current.lastFusionUpdate = elapsed;
          const liveTrack = computeLiveTrackFusion(
            paths,
            simRef.current.cuasList,
            simRef.current.threat,
            simRef.current.threatMode,
            elapsed,
            simRef.current.env,
          );
          setThreatIntel(prev => prev ? { ...prev, live_track: liveTrack } : prev);
        }

        simRef.current.entities.forEach((ent, i) => {
          const point = pathPointAtTime(paths[i] ?? paths[0], elapsed);
          if (!point) return;
          ent.position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.alt);

          simRef.current.sensorEvents
            .filter(event => event.trackIndex === i && event.time_s <= elapsed)
            .forEach(event => {
              if (simRef.current.alertedIds.has(event.id)) return;
              simRef.current.alertedIds.add(event.id);
              setIntercepts(prev => [...prev, {
                time_s:           event.time_s,
                cuas_id:          event.sensor_id,
                cuas_name:        event.sensor_name,
                sensor_type:      event.sensor_type,
                lat:              event.lat,
                lon:              event.lon,
                alt:              event.alt,
                time_to_impact_s: event.time_to_impact_s,
                closest_km:       event.closest_km,
                confidence:       event.confidence,
                downstream_sensors: event.downstream_sensors,
              }]);
            });
        });

        simRef.current.raf = requestAnimationFrame(tick);
      };
      simRef.current.raf = requestAnimationFrame(tick);
      setSimPlaying(true);
    } else {
      cancelAnimationFrame(sim.raf);
      sim.startWall = null;
      setSimPlaying(false);
    }
  }, [simPlaying, simElapsed]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(simRef.current.raf);
    simRef.current.entities.forEach(e => viewerRef.current?.entities.remove(e));
    if (impactEstimateRef.current) {
      viewerRef.current?.entities.remove(impactEstimateRef.current);
      impactEstimateRef.current = null;
    }
    simRef.current = {
      path: [],
      paths: [],
      entities: [],
      cuasList: [],
      sensorEvents: [],
      threat: null,
      threatMode: 'uas',
      env: DEFAULT_PLANNING_ENV,
      alertedIds: new Set(),
      lastFusionUpdate: 0,
      startWall: null,
      speed: 1,
      raf: null,
      runId: 0,
    };
    setSimActive(false);
    setSimPlaying(false);
    setSimElapsed(0);
    setIntercepts([]);
    setThreatIntel(null);
    setSimSensorEvents([]);
    setImpactAnalysis(null);
    setImpactMissile(null);
  }, []);

  // ── KMZ / KML import ──────────────────────────────────────────────────────

  const loadKmzFile = useCallback(async (file) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const id = `kmz-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const objectUrl = URL.createObjectURL(file);
    setKmzLoadStatus({ level: 'loading', message: `Loading ${file.name}...` });
    try {
      const dataSource = await Cesium.KmlDataSource.load(objectUrl, {
        camera: viewer.scene.camera,
        canvas: viewer.scene.canvas,
        clampToGround: true,
        sourceUri: objectUrl,
      });
      await viewer.dataSources.add(dataSource);
      kmzSourcesRef.current[id] = dataSource;
      kmzObjectUrlsRef.current[id] = objectUrl;

      const entityCount = dataSource.entities.values.length;
      setKmzLayers(prev => [...prev, { id, name: file.name, visible: true, entityCount }]);
      setKmzLoadStatus({
        level: entityCount > 0 ? 'success' : 'warning',
        message: entityCount > 0
          ? `Loaded ${file.name} (${entityCount} item${entityCount === 1 ? '' : 's'}).`
          : `Loaded ${file.name}, but no visible placemarks were found.`,
      });

      window.setTimeout(() => setKmzLoadStatus(null), 4500);
      const flew = await viewer.flyTo(dataSource, { duration: 1.0 }).then(() => true).catch(() => false);
      if (!flew && entityCount > 0) {
        const first = dataSource.entities.values.find(entity => entity.position);
        if (first) viewer.flyTo(first, { duration: 1.0 }).catch(() => {});
      }
      viewer.scene.requestRender();
    } catch (err) {
      console.error('KMZ load failed:', err);
      URL.revokeObjectURL(objectUrl);
      setKmzLoadStatus({
        level: 'error',
        message: `Could not load ${file.name}. Check that it is valid KML/KMZ.`,
      });
      window.setTimeout(() => setKmzLoadStatus(null), 6500);
    }
  }, []);

  const removeKmzLayer = useCallback((id) => {
    const viewer = viewerRef.current;
    const ds = kmzSourcesRef.current[id];
    if (viewer && ds) viewer.dataSources.remove(ds, true);
    if (kmzObjectUrlsRef.current[id]) URL.revokeObjectURL(kmzObjectUrlsRef.current[id]);
    delete kmzSourcesRef.current[id];
    delete kmzObjectUrlsRef.current[id];
    setKmzLayers(prev => prev.filter(l => l.id !== id));
  }, []);

  const toggleKmzLayerVisibility = useCallback((id) => {
    const ds = kmzSourcesRef.current[id];
    if (ds) ds.show = !ds.show;
    setKmzLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const handleClearAll = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    handleStop();
    placedRef.current.forEach(e => viewer.entities.remove(e));
    losEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    waypointEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    if (pathLineRef.current) { viewer.entities.remove(pathLineRef.current); pathLineRef.current = null; }
    if (impactEstimateRef.current) { viewer.entities.remove(impactEstimateRef.current); impactEstimateRef.current = null; }
    placedRef.current = [];
    losEntitiesRef.current = [];
    waypointEntitiesRef.current = [];
    trailRef.current = null;
    waypointsRef.current = [];
    missileClickRef.current = null;
    stopImpactAnimation(false);
    impactEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    impactEntitiesRef.current = [];
    impactClickRef.current = null;
    setImpactAnalysis(null);
    setImpactMissile(null);
    setLosAnalysis(null);
    setLosPending(false);
    setLosAwaitingTarget(false);
    selectedMapItemRef.current = null;
    setSelectedMapItem(null);
    setWaypointCount(0);
    firstPointRef.current = null;
    // Planning graphics
    graphicPreviewRef.current.dots.forEach(e => viewer.entities.remove(e));
    if (graphicPreviewRef.current.line) viewer.entities.remove(graphicPreviewRef.current.line);
    graphicPreviewRef.current = { dots: [], line: null };
    markupEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    markupEntitiesRef.current = [];
    graphicPointsRef.current = [];
    setGraphicPointCount(0);
  }, [handleStop, stopImpactAnimation]);

  const collectScenarioState = useCallback(() => {
    const seenGroups = new Set();
    const units = [];
    const capabilities = [];

    placedRef.current.forEach(entity => {
      if (!entity?._dragGroup || seenGroups.has(entity._dragGroup)) return;
      seenGroups.add(entity._dragGroup);
      const geo = entityGeo(entity);
      if (!geo) return;

      if (entity._unitData || entity._dragKind === 'unit') {
        units.push({
          ...(entity._unitData ?? {}),
          name: entity._deleteLabel ?? entity._unitData?.name ?? 'Unit',
          faction: entity._unitData?.faction ?? 'friendly',
          ...geo,
        });
        return;
      }

      if (entity._cuasData) {
        capabilities.push({
          ...entity._cuasData,
          name: entity._deleteLabel ?? entity._cuasData.name,
          kind: entity._dragKind,
          ...geo,
        });
      }
    });

    return {
      version: 1,
      saved_at: new Date().toISOString(),
      units,
      capabilities,
      waypoints: waypointsRef.current,
      custom_layer_assets: customLayerAssets,
      selected_threat: threatMode === 'missile' ? selectedMissile : selectedDrone,
      threat_mode: threatMode,
      planning_env: planningEnv,
      exercise_boundaries: {
        country_visible: countryBoundariesVisible,
        state_visible: stateBoundariesVisible,
        names: exerciseBoundaryNames,
      },
      los_analysis: losAnalysis,
      impact_analysis: impactAnalysis,
      simulation: simActive || threatIntel || simSensorEvents.length > 0 ? {
        active: simActive,
        elapsed_s: simElapsed,
        speed: simSpeed,
        intercepts,
        sensor_events: simSensorEvents,
        threat_intel: threatIntel,
      } : null,
    };
  }, [
    countryBoundariesVisible, customLayerAssets, exerciseBoundaryNames, impactAnalysis,
    intercepts, losAnalysis, planningEnv, selectedDrone, selectedMissile, simActive,
    simElapsed, simSensorEvents, simSpeed, stateBoundariesVisible, threatIntel, threatMode,
  ]);

  const refreshScenarios = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/scenarios`);
      const data = await res.json();
      setScenarios(data.scenarios ?? []);
    } catch (err) {
      console.error('scenario list failed:', err);
      setScenarioStatus({ level: 'error', message: 'Could not load saved scenarios.' });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshScenarios();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshScenarios]);

  const saveScenario = useCallback(async ({ name, description }) => {
    setScenarioStatus({ level: 'loading', message: 'Saving scenario...' });
    try {
      const res = await fetch(`${BACKEND}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, state: collectScenarioState() }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') throw new Error(data.detail ?? 'save failed');
      setScenarioStatus({ level: 'success', message: `Saved ${data.scenario.name}.` });
      await refreshScenarios();
    } catch (err) {
      console.error('scenario save failed:', err);
      setScenarioStatus({ level: 'error', message: 'Scenario save failed. Is the backend running?' });
    }
  }, [collectScenarioState, refreshScenarios]);

  const restoreScenario = useCallback(async (scenarioId) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setScenarioStatus({ level: 'loading', message: 'Loading scenario...' });
    try {
      const res = await fetch(`${BACKEND}/api/scenarios/${scenarioId}`);
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') throw new Error(data.detail ?? 'load failed');
      const state = data.scenario.state ?? {};

      handleClearAll();
      setCustomLayerAssets(state.custom_layer_assets ?? []);
      setThreatMode(state.threat_mode ?? 'uas');
      if (state.threat_mode === 'missile' && state.selected_threat?.id) {
        setSelectedMissile(MISSILE_THREATS.find(item => item.id === state.selected_threat.id) ?? MISSILE_THREATS[0]);
      } else if (state.selected_threat?.id) {
        setSelectedDrone(DRONE_TYPES.find(item => item.id === state.selected_threat.id) ?? DRONE_TYPES[0]);
      }
      setPlanningEnv(state.planning_env ?? DEFAULT_PLANNING_ENV);
      if (state.exercise_boundaries) {
        setCountryBoundariesVisible(Boolean(state.exercise_boundaries.country_visible));
        setStateBoundariesVisible(Boolean(state.exercise_boundaries.state_visible));
        setExerciseBoundaryNames(state.exercise_boundaries.names ?? {});
      }

      for (const unit of state.units ?? []) {
        const unitType = UNIT_TYPES.find(u => u.id === unit.id) ?? UNIT_TYPES[0];
        const factionValue = unit.faction ?? FACTIONS.FRIENDLY;
        const canvas = milSymbolCanvas(unitType.sidcs[factionValue] ?? unitType.sidcs[FACTIONS.FRIENDLY]);
        if (!canvas) continue;
        const image = new Image();
        image.src = canvas.toDataURL();
        await new Promise(resolve => { image.onload = resolve; });
        const group = makeDragGroup('unit');
        const entity = markDraggable(viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(unit.lon, unit.lat, unit.alt ?? 0),
          billboard: { image, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scale: 1.0, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text: unit.name ?? unitType.label,
            font: '11px monospace',
            pixelOffset: new Cesium.Cartesian2(0, -(canvas.height + 4)),
            fillColor: factionValue === FACTIONS.FRIENDLY ? Cesium.Color.CYAN : Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
        }), { kind: 'unit', group, label: unit.name ?? unitType.label });
        entity._unitData = { ...unit, faction: factionValue };
        placedRef.current.push(entity);
      }

      for (const cap of state.capabilities ?? []) {
        const color = cesiumColorFromHex(cap.color ?? '#00BFFF');
        const position = Cesium.Cartesian3.fromDegrees(cap.lon, cap.lat, cap.alt ?? cap.terrainAlt ?? 0);
        const group = makeDragGroup(cap.kind ?? 'capability');
        const entities = [];

        const marker = markDraggable(viewer.entities.add({
          position,
          point: cap.kind === 'layer' ? {
            pixelSize: 13,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } : undefined,
          label: {
            text: cap.name,
            font: 'bold 11px monospace',
            pixelOffset: new Cesium.Cartesian2(0, -28),
            fillColor: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
        }), { kind: cap.kind ?? 'cuas', group, label: cap.name });
        marker._cuasData = { ...cap };
        entities.push(marker);

        if ((cap.rangeKm ?? 0) > 0) {
          const radiusM = cap.rangeKm * 1000;
          const ceilingM = Math.max((cap.altitudeFtAGL ?? 0) * 0.3048, cap.kind === 'layer' ? radiusM * 0.12 : radiusM, 150);
          const ring = markDraggable(viewer.entities.add({
            position,
            ellipsoid: {
              radii: new Cesium.Cartesian3(radiusM, radiusM, ceilingM),
              minimumCone: 0,
              maximumCone: Cesium.Math.PI_OVER_TWO,
              material: new Cesium.ColorMaterialProperty(color.withAlpha(0.075)),
              outline: true,
              outlineColor: color.withAlpha(0.75),
              outlineWidth: 1.5,
              slicePartitions: 48,
              stackPartitions: 20,
              subdivisions: 96,
            },
          }), { kind: cap.kind ?? 'cuas', group, label: cap.name });
          ring._cuasData = { ...cap };
          entities.push(ring);
        }
        placedRef.current.push(...entities);
      }

      waypointsRef.current = state.waypoints ?? [];
      waypointEntitiesRef.current = waypointsRef.current.map((wp, index) => markDraggable(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt ?? 0),
        point: { pixelSize: 8, color: Cesium.Color.ORANGERED, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `WP${index + 1}`, font: '10px monospace', pixelOffset: new Cesium.Cartesian2(0, -16), fillColor: Cesium.Color.ORANGERED },
      }), { kind: 'waypoint', label: `WP${index + 1}`, waypointIndex: index }));
      setWaypointCount(waypointsRef.current.length);

      if (waypointsRef.current.length >= 2) {
        pathLineRef.current = viewer.entities.add({
          polyline: {
            positions: waypointsRef.current.map(wp => Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt ?? 0)),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGERED }),
          },
        });
      }

      setScenarioStatus({ level: 'success', message: `Loaded ${data.scenario.name}.` });
      viewer.scene.requestRender();
    } catch (err) {
      console.error('scenario load failed:', err);
      setScenarioStatus({ level: 'error', message: 'Scenario load failed.' });
    }
  }, [handleClearAll]);

  const deleteScenario = useCallback(async (scenarioId) => {
    setScenarioStatus({ level: 'loading', message: 'Deleting scenario...' });
    try {
      await fetch(`${BACKEND}/api/scenarios/${scenarioId}`, { method: 'DELETE' });
      setScenarioStatus({ level: 'success', message: 'Scenario deleted.' });
      await refreshScenarios();
    } catch (err) {
      console.error('scenario delete failed:', err);
      setScenarioStatus({ level: 'error', message: 'Scenario delete failed.' });
    }
  }, [refreshScenarios]);

  const publishScenarioReport = useCallback(async (scenarioId) => {
    setScenarioStatus({ level: 'loading', message: 'Publishing report...' });
    try {
      const res = await fetch(`${BACKEND}/api/scenarios/${scenarioId}/report`);
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') throw new Error(data.detail ?? 'report failed');
      setReportPanel(data);
      setScenarioStatus({ level: 'success', message: 'Report generated.' });
    } catch (err) {
      console.error('scenario report failed:', err);
      setScenarioStatus({ level: 'error', message: 'Report generation failed.' });
    }
  }, []);

  useEffect(() => { simRef.current.speed = simSpeed; }, [simSpeed]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <div ref={cesiumContainer} style={{ width: '100vw', height: '100vh' }} />
      <ToolPanel
        mode={mode} setMode={setMode}
        faction={faction} setFaction={setFaction}
        selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit}
        selectedCUAS={selectedCUAS} setSelectedCUAS={setSelectedCUAS}
        detectionLayerAssets={detectionLayerAssets}
        layerColorSwatches={LAYER_COLOR_SWATCHES}
        selectedLayerAsset={selectedLayerAsset}
        setSelectedLayerAsset={setSelectedLayerAsset}
        onAddCustomLayerAsset={handleAddCustomLayerAsset}
        selectedDrone={selectedDrone} setSelectedDrone={setSelectedDrone}
        selectedMissile={selectedMissile} setSelectedMissile={setSelectedMissile}
        threatMode={threatMode} setThreatMode={setThreatMode}
        waypointCount={waypointCount}
        onSimulate={handleSimulate}
        onClearAll={handleClearAll}
        radarNetworkVisible={radarNetworkVisible}
        onToggleRadarNetwork={() => setRadarNetworkVisible(v => !v)}
        countryBoundariesVisible={countryBoundariesVisible}
        stateBoundariesVisible={stateBoundariesVisible}
        onToggleCountryBoundaries={() => setCountryBoundariesVisible(v => !v)}
        onToggleStateBoundaries={() => setStateBoundariesVisible(v => !v)}
        exerciseBoundaryNames={exerciseBoundaryNames}
        onRenameExerciseBoundary={(id, name) => setExerciseBoundaryNames(prev => ({ ...prev, [id]: name }))}
        dataLinkConnected={dataLinkConnected}
        dataLinkTrackCount={Object.keys(externalTracks).length}
        dataLinkVisible={dataLinkVisible}
        dataLinkUrl={WS_TRACKS_URL}
        onToggleDataLink={() => setDataLinkVisible(v => !v)}
        kmzLayers={kmzLayers}
        kmzLoadStatus={kmzLoadStatus}
        onImportKmz={loadKmzFile}
        onRemoveKmzLayer={removeKmzLayer}
        onToggleKmzLayer={toggleKmzLayerVisibility}
        scenarios={scenarios}
        scenarioStatus={scenarioStatus}
        onSaveScenario={saveScenario}
        onRefreshScenarios={refreshScenarios}
        onLoadScenario={restoreScenario}
        onDeleteScenario={deleteScenario}
        onPublishScenarioReport={publishScenarioReport}
        selectedGraphicType={selectedGraphicType}
        setSelectedGraphicType={setSelectedGraphicType}
        graphicLabel={graphicLabel}
        setGraphicLabel={setGraphicLabel}
        graphicColor={graphicColor}
        setGraphicColor={setGraphicColor}
        graphicPointCount={graphicPointCount}
        onFinishGraphic={finishGraphic}
        onUndoGraphicPoint={undoLastGraphicPoint}
      />
      {selectedMapItem && (
        <SelectedMapItemPanel
          key={selectedMapItem.group}
          item={selectedMapItem}
          onDelete={deleteSelectedMapItem}
          onRename={renameSelectedMapItem}
        />
      )}
      <SimulationControls
        active={simActive}
        playing={simPlaying}
        speed={simSpeed}
        setSpeed={setSimSpeed}
        onPlay={handlePlay}
        onStop={handleStop}
        intercepts={intercepts}
        elapsed={simElapsed}
        threatIntel={threatIntel}
        planningEnv={planningEnv}
        setPlanningEnv={setPlanningEnv}
      />
      <ImpactWarningPanel
        analysis={impactAnalysis}
        missile={impactMissile}
        position={impactPanelPosition}
        onPositionChange={setImpactPanelPosition}
        onClose={() => {
          setImpactAnalysis(null);
          setImpactMissile(null);
          stopImpactAnimation(false);
          impactEntitiesRef.current.forEach(e => viewerRef.current?.entities.remove(e));
          impactEntitiesRef.current = [];
          impactClickRef.current = null;
        }}
      />
      <RadarAlertFeed
        events={simSensorEvents}
        simElapsed={simElapsed}
        visible={simActive}
        position={radarFeedPosition}
        onPositionChange={setRadarFeedPosition}
      />
      {dataLinkVisible && (
        <DataLinkPanel
          connected={dataLinkConnected}
          tracks={Object.values(externalTracks)}
          connectionUrl={WS_TRACKS_URL}
        />
      )}
      {reportPanel && (
        <ScenarioReportPanel
          report={reportPanel}
          onClose={() => setReportPanel(null)}
        />
      )}
      {mode === 'los' && (
        <LOSResultPanel
          analysis={losAnalysis}
          pending={losPending}
          awaitingTarget={losAwaitingTarget}
        />
      )}
    </div>
  );
}

function SelectedMapItemPanel({ item, onDelete, onRename }) {
  const [draft, setDraft] = useState(item.label ?? '');

  const submitRename = (event) => {
    event.preventDefault();
    onRename(draft);
  };

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 320,
      zIndex: 16,
      background: 'rgba(3, 8, 15, 0.94)',
      border: '1px solid #FFAA0044',
      color: '#FFAA00',
      fontFamily: 'monospace',
      fontSize: 11,
      padding: '8px 10px',
      boxShadow: '0 0 18px #FFAA0022',
      minWidth: item.editableLabel ? 360 : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>
          SELECTED: <span style={{ color: '#F2D38A' }}>{item.label}</span>
        </span>
        <button
          onClick={onDelete}
          style={{
            background: '#331111',
            border: '1px solid #AA3333',
            color: '#FF7777',
            fontFamily: 'monospace',
            fontSize: 10,
            padding: '3px 7px',
            cursor: 'pointer',
          }}
        >
          DELETE
        </button>
        <span style={{ color: '#667788' }}>or press Del</span>
      </div>
      {item.editableLabel && (
        <form onSubmit={submitRename} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Unit name"
            style={{
              flex: 1,
              background: '#050D18',
              border: '1px solid #223344',
              color: '#D9ECFF',
              fontFamily: 'monospace',
              fontSize: 10,
              padding: '5px 6px',
            }}
          />
          <button
            type="submit"
            style={{
              background: '#113322',
              border: '1px solid #00AA66',
              color: '#00FF99',
              fontFamily: 'monospace',
              fontSize: 10,
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            RENAME
          </button>
        </form>
      )}
    </div>
  );
}

function ScenarioReportPanel({ report, onClose }) {
  const markdown = report.report_markdown ?? '';
  const downloadReport = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mdpt-scenario-report-${report.scenario_id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'absolute',
      top: 24,
      right: 24,
      width: 520,
      maxWidth: 'calc(100vw - 340px)',
      maxHeight: 'calc(100vh - 48px)',
      zIndex: 24,
      background: 'rgba(3, 8, 15, 0.98)',
      border: '1px solid #00BFFF66',
      boxShadow: '0 0 24px #00BFFF22',
      color: '#AABBCC',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '9px 12px',
        borderBottom: '1px solid #0D3D55',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ color: '#00BFFF', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em' }}>
            PUBLISHED SCENARIO REPORT
          </div>
          <div style={{ color: '#445566', fontSize: 8 }}>{report.generated_at}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={downloadReport} style={{
            background: '#061422',
            border: '1px solid #00BFFF66',
            color: '#00BFFF',
            fontFamily: 'monospace',
            fontSize: 9,
            padding: '5px 8px',
            cursor: 'pointer',
          }}>
            DOWNLOAD MD
          </button>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: '1px solid #442222',
            color: '#AA4444',
            fontFamily: 'monospace',
            fontSize: 9,
            padding: '5px 8px',
            cursor: 'pointer',
          }}>
            CLOSE
          </button>
        </div>
      </div>
      <pre style={{
        margin: 0,
        padding: 12,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.45,
        fontSize: 10,
      }}>
        {markdown}
      </pre>
    </div>
  );
}

// ---------- missile path helpers ----------

function getMissilePreviewPath(launch, target, missile) {
  if (!missile) return [];
  if (missile.type === 'ballistic' || missile.type === 'rocket') {
    return buildClientBallisticPath(launch, target, missile.apogeeKm, missile.speedMach);
  }
  if (missile.type === 'hypersonic') {
    return buildClientHypersonicPath(launch, target, missile.apogeeKm, missile.speedMach);
  }
  // cruise: straight line at low AGL
  const steps = 100;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return {
      lat: launch.lat + (target.lat - launch.lat) * t,
      lon: launch.lon + (target.lon - launch.lon) * t,
      alt: (launch.alt + target.alt) / 2 + (missile.apogeeKm * 1000),
    };
  });
}
