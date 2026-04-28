import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import ms from 'milsymbol';
import "cesium/Build/Cesium/Widgets/widgets.css";
import ToolPanel from './components/ToolPanel';
import SimulationControls from './components/SimulationControls';
import ImpactWarningPanel from './components/ImpactWarningPanel';
import { FACTIONS, UNIT_TYPES } from './data/militaryUnits';
import { CUAS_SYSTEMS } from './data/counterUAS';
import { DRONE_TYPES } from './data/droneTypes';
import { MISSILE_THREATS } from './data/missileThreat';

const BACKEND = 'http://localhost:8000';
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
const DEFAULT_PLANNING_ENV = {
  visibility: 'clear',
  precipitation: 'none',
  clutter: 'moderate',
  ew: 'none',
  operatorConfidence: 0.85,
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

function radarHorizonKm(sensorHeightM, targetAltM) {
  const sensorTerm = Math.sqrt(Math.max(sensorHeightM, 0));
  const targetTerm = Math.sqrt(Math.max(targetAltM, 0));
  return 3.57 * (sensorTerm + targetTerm);
}

function sensorTypeQuality(sensorType) {
  const qualities = {
    radar: 0.92,
    kinetic: 0.82,
    laser: 0.78,
    rf: 0.68,
    ew: 0.64,
    passive: 0.72,
    net: 0.74,
  };
  return qualities[sensorType] ?? 0.72;
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
  const ewSensitive = ['radar', 'rf', 'ew', 'net'].includes(sensor.type);
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
  const quality = sensorTypeQuality(sensor.type);
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
  entity._draggable = true;
  entity._dragKind = options.kind ?? 'entity';
  entity._dragGroup = options.group ?? makeDragGroup(options.kind ?? 'entity');
  entity._waypointIndex = options.waypointIndex;
  entity._dragDisplayOffsetM = options.displayOffsetM ?? 0;
  entity._waypointAltitudeOffsetM = options.waypointAltitudeOffsetM ?? 0;
  return entity;
}

function updateEntityMapPosition(entity, lat, lon, alt, cartesian) {
  const nextPosition = cartesian ?? Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  entity.position = nextPosition;

  if (entity._cuasData) {
    entity._cuasData = { ...entity._cuasData, lat, lon, terrainAlt: alt };
  }
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
  const dragRef = useRef({ active: false, moved: false, group: null, entity: null });

  const [mode, setMode] = useState('los');
  const [faction, setFaction] = useState(FACTIONS.FRIENDLY);
  const [selectedUnit, setSelectedUnit] = useState(UNIT_TYPES[0]);
  const [selectedCUAS, setSelectedCUAS] = useState(CUAS_SYSTEMS[0]);
  const [selectedDrone, setSelectedDrone] = useState(DRONE_TYPES[0]);
  const [selectedMissile, setSelectedMissile] = useState(MISSILE_THREATS[0]);
  const [threatMode, setThreatMode] = useState('uas'); // 'uas' | 'missile'
  const [planningEnv, setPlanningEnv] = useState(DEFAULT_PLANNING_ENV);
  const [losAnalysis, setLosAnalysis] = useState(null);
  const [losPending, setLosPending] = useState(false);
  const [losAwaitingTarget, setLosAwaitingTarget] = useState(false);

  // Impact analysis state
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [impactMissile, setImpactMissile] = useState(null);
  const impactEntitiesRef = useRef([]);
  const impactClickRef = useRef(null); // first click = launch

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
  const simRef = useRef({
    path: [], paths: [], entities: [], cuasList: [], sensorEvents: [],
    threat: null, threatMode: 'uas', env: DEFAULT_PLANNING_ENV,
    alertedIds: new Set(), lastFusionUpdate: 0, startWall: null, speed: 1, raf: null,
  });

  const refreshWaypointPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || waypointsRef.current.length < 2) return;

    if (pathLineRef.current) viewer.entities.remove(pathLineRef.current);

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
      if (handlerRef.current) handlerRef.current.destroy();
      viewer.destroy();
    };
  }, []);

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
      if (pickedEntity?._draggable) return;

      const cartesian = viewer.scene.pickPosition(click.position);
      if (!Cesium.defined(cartesian)) return;
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);

      // ── LOS ANALYSIS ──
      if (mode === 'los') {
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
        const height = sampled[0].height ?? 0;
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
            const t = i / sampleCount;
            profilePoints.push(Cesium.Cartographic.fromRadians(
              Cesium.Math.lerp(firstPoint.cartographic.longitude, targetCartographic.longitude, t),
              Cesium.Math.lerp(firstPoint.cartographic.latitude, targetCartographic.latitude, t),
            ));
          }
          const sampledProfile = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, profilePoints);
          const heights = sampledProfile.map(p => p.height ?? 0);
          let result;
          try {
            const res = await fetch(`${BACKEND}/analyze-gap`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                observer_alt: firstPoint.terrainHeight + observerAglM,
                target_alt: height + targetAglM,
                terrain_profile: heights,
              }),
            });
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
          setLosPending(false);
          firstPointRef.current = null;
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
        placedRef.current.push(markDraggable(viewer.entities.add({
          position: cartesian,
          billboard: { image, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scale: 1.0, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: selectedUnit.label, font: '11px monospace', pixelOffset: new Cesium.Cartesian2(0, -(canvas.height + 4)), fillColor: faction === FACTIONS.FRIENDLY ? Cesium.Color.CYAN : Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
        }), { kind: 'unit' }));
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
          }), { kind: 'cuas', group: dragGroup });
          b._cuasData = {
            id: selectedCUAS.id,
            name: selectedCUAS.name,
            type: selectedCUAS.type,
            rangeKm: selectedCUAS.rangeKm,
            altitudeFtAGL: selectedCUAS.altitudeFtAGL,
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
          }), { kind: 'cuas', group: dragGroup });
          ring._cuasData = {
            id: selectedCUAS.id,
            name: selectedCUAS.name,
            type: selectedCUAS.type,
            rangeKm: selectedCUAS.rangeKm,
            altitudeFtAGL: selectedCUAS.altitudeFtAGL,
            lat,
            lon,
            terrainAlt: cartographic.height ?? 0,
          };
          entities.push(ring);
        }
        placedRef.current.push(...entities);
        return;
      }

      // ── DRAW UAS PATH ──
      if (mode === 'draw-path' && threatMode === 'uas') {
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
        const droneAlt = sampled[0].height + (selectedDrone?.aglMeters ?? 100);
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
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
        const terrainAlt = sampled[0].height;

        if (!missileClickRef.current) {
          // First click: launch point
          missileClickRef.current = { lat, lon, alt: terrainAlt };
          const e = markDraggable(viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(lon, lat, terrainAlt + 10),
            point: { pixelSize: 14, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: `LAUNCH: ${selectedMissile?.name ?? 'MISSILE'}`, font: 'bold 12px monospace', pixelOffset: new Cesium.Cartesian2(0, -22), fillColor: Cesium.Color.RED, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE },
          }), { kind: 'waypoint', waypointIndex: 0, displayOffsetM: 10 });
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
          }), { kind: 'waypoint', waypointIndex: 1, displayOffsetM: 10 });
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
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]);
        const terrainAlt = sampled[0].height;

        if (!impactClickRef.current) {
          // Clear previous impact entities
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

          // Call backend impact analysis
          let analysis;
          try {
            const res = await fetch(`${BACKEND}/analyze-impact`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                launch_lat: launch.lat, launch_lon: launch.lon, launch_alt: launch.alt,
                target_lat: lat, target_lon: lon, target_alt: terrainAlt,
                trajectory_type: missile.type,
                speed_mach: missile.speedMach,
                apogee_km: missile.apogeeKm,
                warhead_kg: missile.warheadKg ?? 50,
                warhead_type: missile.type === 'rocket' ? 'he' : 'he',
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

          setImpactAnalysis(analysis);
          setImpactMissile(missile);
        }
        return;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }, [mode, faction, selectedUnit, selectedCUAS, selectedDrone, selectedMissile, threatMode, refreshWaypointPreview]);

  // ---- Launch simulation ----
  const handleSimulate = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer || waypointsRef.current.length < 2) return;

    let path;

    if (threatMode === 'uas') {
      const drone = selectedDrone ?? DRONE_TYPES[0];
      // Sample terrain
      const wps = waypointsRef.current;
      const allCarts = [];
      for (let seg = 0; seg < wps.length - 1; seg++) {
        for (let i = 0; i < 20; i++) {
          const t = i / 20;
          allCarts.push(Cesium.Cartographic.fromDegrees(
            wps[seg].lon + (wps[seg + 1].lon - wps[seg].lon) * t,
            wps[seg].lat + (wps[seg + 1].lat - wps[seg].lat) * t,
          ));
        }
      }
      allCarts.push(Cesium.Cartographic.fromDegrees(wps[wps.length - 1].lon, wps[wps.length - 1].lat));
      const sampledAll = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, allCarts);
      const terrainHeights = sampledAll.map(p => p.height);

      try {
        const res = await fetch(`${BACKEND}/simulate-path`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ waypoints: wps, speed_ms: drone.speedMs, agl_meters: drone.aglMeters, terrain_heights: terrainHeights }),
        });
        path = await res.json();
      } catch {
        path = buildClientUASPath(wps, drone.speedMs, drone.aglMeters);
      }
    } else {
      // Missile: two-point arc
      const missile = selectedMissile ?? MISSILE_THREATS[0];
      const launch = waypointsRef.current[0];
      const target = waypointsRef.current[1];
      path = await fetchMissilePath(missile, launch, target);
    }

    // Collect C-UAS systems on map
    const cuasList = [...new Map(
      placedRef.current
        .filter(e => e._cuasData && e._cuasData.rangeKm > 0)
        .map(e => [`${e._cuasData.id}-${e._cuasData.lat}-${e._cuasData.lon}`, e._cuasData])
    ).values()];

    // Create threat dot entity/entities
    const threat = threatMode === 'uas' ? selectedDrone : selectedMissile;
    const threatColor = cesiumColorFromHex(threat?.color ?? '#FF3300');
    const count = threatMode === 'uas' ? (selectedDrone?.count ?? 1) : 1;
    const simPaths = threatMode === 'uas'
      ? Array.from({ length: count }, (_, i) => makeErraticUASPath(path, selectedDrone, i))
      : [path];
    const intel = estimateImpactIntelligence(simPaths, threat, threatMode, cuasList, planningEnv);

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
    for (let i = 0; i < count; i++) {
      const start = simPaths[i][0];
      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.alt),
        point: {
          pixelSize: threat?.pixelSize ?? 12,
          color: threatColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      droneEntities.push(ent);
    }

    simRef.current = {
      path,
      paths: simPaths,
      entities: droneEntities,
      cuasList,
      sensorEvents: intel?.events ?? [],
      threat,
      threatMode,
      env: planningEnv,
      alertedIds: new Set(),
      lastFusionUpdate: 0,
      startWall: null,
      speed: simSpeed,
      raf: null,
    };
    setSimActive(true);
    setSimPlaying(false);
    setSimElapsed(0);
    setIntercepts([]);
    setThreatIntel(intel);
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
            .filter(event => event.trackIndex === i && event.entry_time_s <= elapsed)
            .forEach(event => {
              if (simRef.current.alertedIds.has(event.id)) return;
              simRef.current.alertedIds.add(event.id);
              setIntercepts(prev => [...prev, {
                time_s: event.entry_time_s,
                cuas_id: event.sensor_id,
                cuas_name: event.sensor_name,
                sensor_type: event.sensor_type,
                lat: event.lat,
                lon: event.lon,
                alt: event.alt,
                time_to_impact_s: event.time_to_impact_s,
                closest_km: event.closest_km,
                confidence: event.confidence,
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
    };
    setSimActive(false);
    setSimPlaying(false);
    setSimElapsed(0);
    setIntercepts([]);
    setThreatIntel(null);
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
    impactEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    impactEntitiesRef.current = [];
    impactClickRef.current = null;
    setImpactAnalysis(null);
    setImpactMissile(null);
    setLosAnalysis(null);
    setLosPending(false);
    setLosAwaitingTarget(false);
    setWaypointCount(0);
    firstPointRef.current = null;
  }, [handleStop]);

  useEffect(() => { simRef.current.speed = simSpeed; }, [simSpeed]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <div ref={cesiumContainer} style={{ width: '100vw', height: '100vh' }} />
      <ToolPanel
        mode={mode} setMode={setMode}
        faction={faction} setFaction={setFaction}
        selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit}
        selectedCUAS={selectedCUAS} setSelectedCUAS={setSelectedCUAS}
        selectedDrone={selectedDrone} setSelectedDrone={setSelectedDrone}
        selectedMissile={selectedMissile} setSelectedMissile={setSelectedMissile}
        threatMode={threatMode} setThreatMode={setThreatMode}
        waypointCount={waypointCount}
        onSimulate={handleSimulate}
        onClearAll={handleClearAll}
      />
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
        onClose={() => {
          setImpactAnalysis(null);
          setImpactMissile(null);
          impactEntitiesRef.current.forEach(e => viewerRef.current?.entities.remove(e));
          impactEntitiesRef.current = [];
          impactClickRef.current = null;
        }}
      />
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

async function fetchMissilePath(missile, launch, target) {
  const endpoints = {
    ballistic: '/simulate-ballistic',
    rocket:    '/simulate-rocket',
    hypersonic:'/simulate-hypersonic',
    cruise:    '/simulate-cruise-missile',
  };
  const endpoint = endpoints[missile.type] ?? '/simulate-ballistic';

  if (missile.type === 'cruise') {
    const wps = [
      { lat: launch.lat, lon: launch.lon, alt: launch.alt },
      { lat: target.lat, lon: target.lon, alt: target.alt },
    ];
    try {
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: wps, speed_mach: missile.speedMach, agl_meters: missile.apogeeKm * 1000, terrain_heights: [launch.alt, target.alt] }),
      });
      return await res.json();
    } catch {
      return getMissilePreviewPath(launch, target, missile);
    }
  }

  try {
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        launch_lat: launch.lat, launch_lon: launch.lon, launch_alt: launch.alt,
        target_lat: target.lat, target_lon: target.lon, target_alt: target.alt,
        apogee_km: missile.apogeeKm, speed_mach: missile.speedMach,
      }),
    });
    return await res.json();
  } catch {
    return getMissilePreviewPath(launch, target, missile);
  }
}
