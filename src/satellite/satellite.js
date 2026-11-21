/**
 * LunarSite EVA — Example Lunar Relay Satellite Simulator (Phase 3)
 *
 * Models a single satellite in a circular polar orbit around the Moon.
 * This is an illustrative "example relay orbit" — NOT a real mission orbit design.
 *
 * Physics & Equations:
 *   Circular orbit:
 *     a = R_MOON + h
 *     T = 2π √(a³ / μ)
 *   Inertial polar orbit (fixed x-z plane):
 *     θ(t) = θ₀ + 2πt / T
 *     r_i(t) = (a cos θ, 0, a sin θ)
 *   Moon-fixed frame (right-handed rotation by -φ about +z polar axis,
 *   where φ = 2πt / T_sidereal is the Moon's eastward sidereal rotation):
 *     x' =  x_i cos φ + y_i sin φ
 *     y' = -x_i sin φ + y_i cos φ
 *     z' =  z_i
 *
 * Constants & Sources:
 *   R_MOON             = 1737.4 km         (IAU/IAG WGCCRE mean lunar radius, Archinal et al. 2018; JPL Horizons DE441)
 *   MU_MOON            = 4902.8 km³/s²     (NASA JPL DE440/DE441 lunar GM)
 *   MOON_SIDEREAL_DAYS = 27.321661 days    (IAU/JPL sidereal rotation period)
 *
 * Earth-link geometric approximation (canSeeEarth):
 *   Approximates Earth direction in the Moon-fixed frame as the fixed unit vector
 *   (1, 0, 0) (mean sub-Earth point at lat=0°, lon=0°). Lunar libration (~±8° lon,
 *   ±7° lat) and finite Earth distance are not modelled.
 *
 * Not modelled: orbital perturbations (mascons, third-body), plane precession,
 * terrain horizon occlusion, link budget / antenna pointing.
 */

// ── Constants ───────────────────────────────────────────────────────
/** Moon mean radius (km). IAU/IAG WGCCRE reference sphere / JPL Horizons. */
export const R_MOON = 1737.4;

/** Moon standard gravitational parameter (km³/s²). NASA JPL DE440/DE441. */
export const MU_MOON = 4902.8;

/** Moon sidereal rotation period (days). */
export const MOON_SIDEREAL_DAYS = 27.321661;

/** Minimum and maximum valid altitude bounds for this illustrative model (km). */
export const MIN_ALTITUDE_KM = 10;
export const MAX_ALTITUDE_KM = 50000;

const TWO_PI = 2 * Math.PI;
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MS_PER_MIN = 60 * 1000;

export const EARTH_LINK_ASSUMPTION =
  'First-order geometric Earth-link approximation: fixed sub-Earth direction (1, 0, 0) in Moon-fixed frame; lunar libration (~±8° lon, ±7° lat) not modelled.';

// ── Validation & Helpers ────────────────────────────────────────────

/**
 * Validate orbital altitude (km). Rejects non-finite, non-positive, or out-of-bounds values.
 */
export function validateAltitudeKm(altitudeKm) {
  if (
    typeof altitudeKm !== 'number' ||
    !Number.isFinite(altitudeKm) ||
    altitudeKm < MIN_ALTITUDE_KM ||
    altitudeKm > MAX_ALTITUDE_KM
  ) {
    throw new RangeError(
      `Invalid satellite altitudeKm: ${String(altitudeKm)}. Expected finite value in [${MIN_ALTITUDE_KM}, ${MAX_ALTITUDE_KM}] km.`
    );
  }
}

/**
 * Orbital period for a circular lunar orbit (seconds).
 * T = 2π √((R + h)³ / μ)
 */
export function orbitalPeriodS(altitudeKm) {
  validateAltitudeKm(altitudeKm);
  const a = R_MOON + altitudeKm;
  return TWO_PI * Math.sqrt((a * a * a) / MU_MOON);
}

/**
 * Compute satellite position in the Moon-fixed frame at time t (seconds after epoch).
 *
 * Inertial polar orbit in the x-z plane rotated by -φ around +z (Moon rotates eastward
 * at +φ = 2πt / T_sidereal). Vector length |r'| = a is preserved identically.
 */
export function satPositionMoonFixed(t, altitudeKm, startAngleRad) {
  validateAltitudeKm(altitudeKm);
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new RangeError(`Invalid time t: ${String(t)}`);
  }
  const a = R_MOON + altitudeKm;
  const T = orbitalPeriodS(altitudeKm);

  const theta = startAngleRad + (TWO_PI * t) / T;
  const xi = a * Math.cos(theta);
  const yi = 0;
  const zi = a * Math.sin(theta);

  const phi = (TWO_PI * t) / (MOON_SIDEREAL_DAYS * 86400);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  return {
    x: xi * cosPhi + yi * sinPhi,
    y: -xi * sinPhi + yi * cosPhi,
    z: zi,
  };
}

/**
 * Site position and cached local ENU (East, North, Up) orthonormal basis vectors
 * in Moon-fixed Cartesian coordinates.
 *
 * Convention matches Phase 1: geodetic latitude in [-90, 90], east-positive longitude.
 *   up    = ( cos(lat)cos(lon),  cos(lat)sin(lon), sin(lat))
 *   east  = (-sin(lon),          cos(lon),         0       )
 *   north = (-sin(lat)cos(lon), -sin(lat)sin(lon), cos(lat))
 */
export function sitePosition(latDeg, lonDeg) {
  if (
    typeof latDeg !== 'number' ||
    !Number.isFinite(latDeg) ||
    latDeg < -90 ||
    latDeg > 90
  ) {
    throw new RangeError(`Invalid site latitude: ${String(latDeg)}`);
  }
  if (typeof lonDeg !== 'number' || !Number.isFinite(lonDeg)) {
    throw new RangeError(`Invalid site longitude: ${String(lonDeg)}`);
  }

  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const clat = Math.cos(lat);
  const slat = Math.sin(lat);
  const clon = Math.cos(lon);
  const slon = Math.sin(lon);

  const ux = clat * clon;
  const uy = clat * slon;
  const uz = slat;

  return {
    x: R_MOON * ux,
    y: R_MOON * uy,
    z: R_MOON * uz,
    ux,
    uy,
    uz,
    ex: -slon,
    ey: clon,
    ez: 0,
    nx: -slat * clon,
    ny: -slat * slon,
    nz: clat,
  };
}

/**
 * Topocentric elevation (deg, [-90, 90]) and azimuth (deg, [0, 360), 0=N, 90=E)
 * of the satellite as seen from a surface site with cached ENU basis.
 */
export function satelliteElevationAzimuth(satPos, sitePos) {
  if (
    !satPos ||
    !Number.isFinite(satPos.x) ||
    !Number.isFinite(satPos.y) ||
    !Number.isFinite(satPos.z)
  ) {
    throw new RangeError('Invalid satellite position coordinates.');
  }

  const dx = satPos.x - sitePos.x;
  const dy = satPos.y - sitePos.y;
  const dz = satPos.z - sitePos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-6) return { elevation: 90, azimuth: 0 };

  const dotUp = dx * sitePos.ux + dy * sitePos.uy + dz * sitePos.uz;
  const sinEl = Math.max(-1, Math.min(1, dotUp / dist));
  const elevation = Math.asin(sinEl) * RAD_TO_DEG;

  const dotEast = dx * sitePos.ex + dy * sitePos.ey + dz * sitePos.ez;
  const dotNorth = dx * sitePos.nx + dy * sitePos.ny + dz * sitePos.nz;

  let azimuth = Math.atan2(dotEast, dotNorth) * RAD_TO_DEG;
  if (azimuth < 0) azimuth += 360;
  if (azimuth >= 360 || Object.is(azimuth, -0)) azimuth = 0;

  return { elevation, azimuth };
}

/**
 * First-order geometric check: can the satellite see Earth along +x = (1, 0, 0)?
 *
 * The satellite is occluded by the Moon if and only if:
 *   satPos.x < 0 (far side) AND sqrt(satPos.y^2 + satPos.z^2) <= R_MOON.
 * (Exact tangent sqrt(y^2 + z^2) === R_MOON on the far side is treated as occluded.)
 */
export function canSeeEarth(satPos) {
  if (
    !satPos ||
    !Number.isFinite(satPos.x) ||
    !Number.isFinite(satPos.y) ||
    !Number.isFinite(satPos.z)
  ) {
    throw new RangeError('Invalid satellite position coordinates.');
  }
  if (satPos.x >= 0) return true;
  const perpDist = Math.sqrt(satPos.y * satPos.y + satPos.z * satPos.z);
  return perpDist > R_MOON;
}

/**
 * Linearly interpolate direct Earth elevation at timestamp `tSec` from a
 * site's 2-hour Horizons series. Returns null if out of range or bracketing
 * samples are missing/non-finite.
 */
export function interpolateEarthElevation(site, tSec) {
  const earthElev = site.earth?.elevation ?? site.earth_elev;
  if (!Array.isArray(earthElev) || earthElev.length === 0) return null;
  if (!site.start || !site.step_hours) return null;

  const earthT0 = Date.parse(site.start) / 1000;
  const earthStepS = site.step_hours * 3600;
  if (!Number.isFinite(earthT0) || !Number.isFinite(earthStepS) || earthStepS <= 0) {
    return null;
  }

  const pos = (tSec - earthT0) / earthStepS;
  if (pos < 0 || pos > earthElev.length - 1) return null;

  const i0 = Math.floor(pos);
  const i1 = Math.min(i0 + 1, earthElev.length - 1);
  const v0 = earthElev[i0];
  const v1 = earthElev[i1];
  if (typeof v0 !== 'number' || !Number.isFinite(v0)) return null;
  if (i0 === i1) return v0;
  if (typeof v1 !== 'number' || !Number.isFinite(v1)) return null;

  const frac = pos - i0;
  return v0 + frac * (v1 - v0);
}

// ── Main Simulation API ─────────────────────────────────────────────

/**
 * Simulate an example circular polar lunar relay satellite over [startTime, endTime].
 *
 * Preserves all existing frontend return properties while adding interpolated pass
 * timestamps, durations, peak-elevation azimuth/time, and explicit model metadata.
 */
export function simulate(site, startTime, endTime, altitudeKm = 100, startAngleDeg = 0) {
  validateAltitudeKm(altitudeKm);
  const t0 = new Date(startTime).getTime() / 1000;
  const t1 = new Date(endTime).getTime() / 1000;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) {
    throw new RangeError(`Invalid simulation window: start=${String(startTime)}, end=${String(endTime)}`);
  }

  const stepS = 120; // 2 minutes
  const stepMinutes = 2;
  const startAngleRad = startAngleDeg * DEG;

  const sitePos = sitePosition(site.lat, site.lon);
  const periodS = orbitalPeriodS(altitudeKm);
  const periodMinutes = periodS / 60;

  const elevations = [];
  const azimuths = [];
  const satelliteVisible = [];
  const satelliteSeesEarth = [];
  const relayUsable = [];
  const timestamps = [];
  const timesMs = [];

  for (let t = t0; t <= t1; t += stepS) {
    const satPos = satPositionMoonFixed(t - t0, altitudeKm, startAngleRad);
    const { elevation, azimuth } = satelliteElevationAzimuth(satPos, sitePos);
    const visible = elevation > 0;
    const earthLink = canSeeEarth(satPos);

    elevations.push(elevation);
    azimuths.push(azimuth);
    satelliteVisible.push(visible);
    satelliteSeesEarth.push(earthLink);
    relayUsable.push(visible && earthLink);
    const ms = t * 1000;
    timesMs.push(ms);
    timestamps.push(new Date(ms).toISOString());
  }

  // ── Detect passes (elevation > 0) with interpolated crossing estimates ──
  const passes = [];
  let inPass = false;
  let passStart = -1;
  let passMaxEl = -Infinity;
  let passMaxIdx = -1;

  const finalizePass = (startIdx, endIdx, maxElev, maxIdx) => {
    let startMs = timesMs[startIdx];
    let startInterpolated = false;
    if (startIdx > 0 && elevations[startIdx - 1] <= 0) {
      const e0 = elevations[startIdx - 1];
      const e1 = elevations[startIdx];
      const frac = (0 - e0) / (e1 - e0);
      startMs = timesMs[startIdx - 1] + frac * (timesMs[startIdx] - timesMs[startIdx - 1]);
      startInterpolated = true;
    }

    let endMs = timesMs[endIdx];
    let endInterpolated = false;
    if (endIdx < elevations.length - 1 && elevations[endIdx + 1] <= 0) {
      const e0 = elevations[endIdx];
      const e1 = elevations[endIdx + 1];
      const frac = e0 / (e0 - e1);
      endMs = timesMs[endIdx] + frac * (timesMs[endIdx + 1] - timesMs[endIdx]);
      endInterpolated = true;
    }

    const durationMinutes =
      endMs > startMs ? (endMs - startMs) / MS_PER_MIN : stepMinutes;

    passes.push({
      startIdx,
      endIdx,
      maxElev,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationMinutes,
      startInterpolated,
      endInterpolated,
      inProgressAtStart: startIdx === 0,
      inProgressAtEnd: endIdx === elevations.length - 1,
      maxElevTime: timestamps[maxIdx],
      maxElevAzimuth: azimuths[maxIdx],
    });
  };

  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] > 0) {
      if (!inPass) {
        inPass = true;
        passStart = i;
        passMaxEl = elevations[i];
        passMaxIdx = i;
      } else if (elevations[i] > passMaxEl) {
        passMaxEl = elevations[i];
        passMaxIdx = i;
      }
    } else if (inPass) {
      finalizePass(passStart, i - 1, passMaxEl, passMaxIdx);
      inPass = false;
    }
  }
  if (inPass) {
    finalizePass(passStart, elevations.length - 1, passMaxEl, passMaxIdx);
  }

  // ── Longest gap without satellite visibility (minutes) ──
  let longestGapMinutes = 0;
  if (elevations.length <= 1) {
    longestGapMinutes = 0;
  } else if (passes.length === 0) {
    longestGapMinutes = (elevations.length - 1) * stepMinutes;
  } else {
    if (passes[0].startIdx > 0) {
      longestGapMinutes = passes[0].startIdx * stepMinutes;
    }
    for (let i = 1; i < passes.length; i++) {
      const gap = (passes[i].startIdx - passes[i - 1].endIdx - 1) * stepMinutes;
      if (gap > longestGapMinutes) longestGapMinutes = gap;
    }
    const tailGap = (elevations.length - 1 - passes[passes.length - 1].endIdx) * stepMinutes;
    if (tailGap > longestGapMinutes) longestGapMinutes = tailGap;
  }

  // ── Summary stats ──
  const totalDays = (t1 - t0) / 86400;
  const passesPerDay = totalDays > 0 ? passes.length / totalDays : 0;
  const avgPassMinutes =
    passes.length > 0
      ? passes.reduce((s, p) => s + p.durationMinutes, 0) / passes.length
      : 0;

  let satVisCount = 0;
  let relayCount = 0;
  for (let i = 0; i < elevations.length; i++) {
    if (satelliteVisible[i]) satVisCount++;
    if (relayUsable[i]) relayCount++;
  }
  const satVisiblePercent = elevations.length > 0 ? (satVisCount / elevations.length) * 100 : 0;
  const relayUsablePercent = elevations.length > 0 ? (relayCount / elevations.length) * 100 : 0;

  // ── Combined coverage: direct Earth (interpolated) OR usable relay ──
  let combinedPercent = null;
  const hasEarthSeries =
    Array.isArray(site.earth?.elevation ?? site.earth_elev) &&
    (site.earth?.elevation ?? site.earth_elev).length > 0 &&
    site.start &&
    site.step_hours;

  if (hasEarthSeries && elevations.length > 0) {
    let validCombinedSteps = 0;
    let combinedCount = 0;
    for (let i = 0; i < elevations.length; i++) {
      const tSec = t0 + i * stepS;
      const interpEarthEl = interpolateEarthElevation(site, tSec);
      if (interpEarthEl === null) continue;
      validCombinedSteps++;
      if (interpEarthEl > 0 || relayUsable[i]) combinedCount++;
    }
    combinedPercent = validCombinedSteps > 0 ? (combinedCount / validCombinedSteps) * 100 : null;
  }

  return {
    elevations,
    azimuths,
    satelliteVisible,
    satelliteSeesEarth,
    relayUsable,
    timestamps,
    stepMinutes,
    periodMinutes,
    passes,
    longestGapMinutes,
    passesPerDay,
    avgPassMinutes,
    satVisiblePercent,
    relayUsablePercent,
    combinedPercent,
    earthLinkAssumption: EARTH_LINK_ASSUMPTION,
    earthInterpolationMethod: hasEarthSeries
      ? 'Linear interpolation of 2-hour Horizons Earth elevation to 2-minute satellite timestamps'
      : null,
  };
}
