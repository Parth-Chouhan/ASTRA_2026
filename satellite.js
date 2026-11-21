/**
 * Lunar Relay Satellite Simulator
 *
 * Models a single satellite in a circular polar orbit around the Moon.
 * This is an "example relay orbit" – not a real mission design.
 *
 * Physics:
 *   Circular orbit: a = R + altitude, T = 2π√(a³/μ)
 *   Polar orbit in a fixed inertial plane; the Moon rotates beneath it
 *   at one revolution per 27.32 days (sidereal period).
 *
 * Not modelled: orbit perturbations, orbit plane precession, atmospheric
 * drag (none on the Moon).
 *
 * Earth-link approximation (see canSeeEarth):
 *   The Earth direction in the Moon-fixed frame is approximated as the
 *   fixed unit vector (1, 0, 0), i.e. the sub-Earth point at lon=0, lat=0.
 *   Libration is ignored (~±8° in longitude, ±7° in latitude).
 *   The satellite can see Earth unless it is behind the Moon:
 *     dot(sat, earthDir) < 0  AND  distance from the Earth line < R.
 *   This is a rough check – in reality the visible hemisphere boundary
 *   shifts with libration, and the precise limb depends on the observer's
 *   distance.  For a low-orbit satellite the error from ignoring libration
 *   is small (a few %).
 *
 * Constants verified against:
 *   R  = 1737.4 km   — IAU/IAG WGCCRE reference sphere (usgs.gov, Archinal+ 2018)
 *   μ  = 4902.8 km³/s² — NASA JPL DE440 ephemeris (ssd.jpl.nasa.gov)
 */

// ── Constants ───────────────────────────────────────────────────────
/** Moon mean radius (km). IAU/IAG reference sphere. */
export const R_MOON = 1737.4;

/** Moon standard gravitational parameter (km³/s²). NASA JPL DE440. */
export const MU_MOON = 4902.8;

/** Moon sidereal rotation period (days). */
export const MOON_SIDEREAL_DAYS = 27.321661;

const TWO_PI = 2 * Math.PI;
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Orbital period for a circular orbit (seconds).
 * T = 2π √(a³ / μ)
 */
export function orbitalPeriodS(altitudeKm) {
  const a = R_MOON + altitudeKm;
  return TWO_PI * Math.sqrt((a * a * a) / MU_MOON);
}

/**
 * Compute the satellite position in the Moon-fixed frame at time t (seconds
 * after epoch).
 *
 * Inertial frame: polar orbit in the x-z plane.
 *   sat_inertial = a * (cos θ, 0, sin θ)
 *
 * Moon-fixed frame: rotate by -φ about the polar axis (z), where
 *   φ = 2π t / T_sidereal is the Moon's rotation angle.
 * Since the site convention is x=cos(lat)cos(lon), y=cos(lat)sin(lon),
 * z=sin(lat), the polar axis is z. We rotate the inertial satellite
 * position by -φ around z to get Moon-fixed coordinates:
 *   x_fixed =  x_i cos φ + y_i sin φ
 *   y_fixed = -x_i sin φ + y_i cos φ
 *   z_fixed =  z_i
 *
 * @param {number} t           – seconds since epoch
 * @param {number} altitudeKm  – orbit altitude above Moon surface
 * @param {number} startAngleRad – initial true anomaly (radians)
 * @returns {{ x: number, y: number, z: number }}
 */
export function satPositionMoonFixed(t, altitudeKm, startAngleRad) {
  const a = R_MOON + altitudeKm;
  const T = orbitalPeriodS(altitudeKm);

  // Orbital angle (inertial)
  const theta = startAngleRad + TWO_PI * t / T;

  // Satellite in inertial frame (polar orbit in x-z plane)
  const xi = a * Math.cos(theta);
  const yi = 0;
  const zi = a * Math.sin(theta);

  // Moon rotation angle since epoch
  const phi = TWO_PI * t / (MOON_SIDEREAL_DAYS * 86400);

  // Rotate into Moon-fixed frame (around z-axis, by -phi)
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  return {
    x:  xi * cosPhi + yi * sinPhi,
    y: -xi * sinPhi + yi * cosPhi,
    z:  zi,
  };
}

/**
 * Site position on the Moon surface in Moon-fixed Cartesian coordinates.
 * Uses the convention: x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat).
 * East-positive longitude, geodetic latitude.
 *
 * @param {number} latDeg
 * @param {number} lonDeg
 * @returns {{ x: number, y: number, z: number, ux: number, uy: number, uz: number }}
 *   Position (x,y,z) and unit up vector (ux,uy,uz).
 */
function sitePosition(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const clat = Math.cos(lat);
  const slat = Math.sin(lat);
  const clon = Math.cos(lon);
  const slon = Math.sin(lon);

  // Unit radial (up) vector
  const ux = clat * clon;
  const uy = clat * slon;
  const uz = slat;

  return {
    x: R_MOON * ux,
    y: R_MOON * uy,
    z: R_MOON * uz,
    ux, uy, uz,
  };
}

/**
 * Elevation and azimuth of the satellite as seen from a surface site.
 *
 * elevation = asin( dot(sat - site, up) / |sat - site| )
 * azimuth: from north toward east, [0, 360).
 *
 * To compute azimuth we need the local east and north unit vectors:
 *   east  = (-sin(lon), cos(lon), 0)                   (tangent along longitude)
 *   north = (-sin(lat)cos(lon), -sin(lat)sin(lon), cos(lat))  (tangent along latitude toward north)
 *
 * @returns {{ elevation: number, azimuth: number }} degrees
 */
function satelliteElevationAzimuth(satPos, sitePos, latRad, lonRad) {
  const dx = satPos.x - sitePos.x;
  const dy = satPos.y - sitePos.y;
  const dz = satPos.z - sitePos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-6) return { elevation: 90, azimuth: 0 };

  const dotUp = dx * sitePos.ux + dy * sitePos.uy + dz * sitePos.uz;
  const sinEl = dotUp / dist;
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;

  // Local east and north unit vectors
  const slat = Math.sin(latRad);
  const clat = Math.cos(latRad);
  const slon = Math.sin(lonRad);
  const clon = Math.cos(lonRad);

  const ex = -slon, ey = clon, ez = 0;
  const nx = -slat * clon, ny = -slat * slon, nz = clat;

  const dotEast  = dx * ex + dy * ey + dz * ez;
  const dotNorth = dx * nx + dy * ny + dz * nz;

  let azimuth = Math.atan2(dotEast, dotNorth) * RAD_TO_DEG;
  if (azimuth < 0) azimuth += 360;

  return { elevation, azimuth };
}

/**
 * Check whether the satellite can see the Earth.
 *
 * APPROXIMATION: Earth direction in the Moon-fixed frame is the fixed unit
 * vector (1, 0, 0), i.e. the sub-Earth point at lon=0, lat=0.
 * Libration is ignored (~±8° in longitude, ±7° in latitude).
 *
 * The satellite can see Earth UNLESS it is behind the Moon:
 *   - The satellite's projection onto the Earth direction is negative
 *     (satellite is on the far side), AND
 *   - The satellite's perpendicular distance from the Earth-Moon line
 *     is less than the Moon's radius (it's geometrically occluded).
 *
 * @param {{ x: number, y: number, z: number }} satPos – Moon-fixed position (km)
 * @returns {boolean} true if the satellite has line-of-sight to Earth
 */
function canSeeEarth(satPos) {
  // Earth direction = (1, 0, 0) in Moon-fixed frame (sub-Earth point)
  // dot(sat, earthDir) = sat.x
  if (satPos.x >= 0) return true; // near side → can see Earth

  // Satellite is on the far side (x < 0).
  // Perpendicular distance from the Earth-Moon line (the x-axis):
  const perpDist = Math.sqrt(satPos.y * satPos.y + satPos.z * satPos.z);

  // If the satellite sticks out beyond the Moon's limb, it can still see Earth
  return perpDist > R_MOON;
}

// ── Main API ────────────────────────────────────────────────────────

/**
 * Simulate a relay satellite and compute elevation/azimuth samples, passes, gaps,
 * and combined coverage (Earth-visible OR relay-usable satellite).
 *
 * @param {{ lat: number, lon: number, earth_elev?: number[], start?: string, step_hours?: number }} site
 *   Site object with lat/lon in degrees.
 * @param {string|Date} startTime  – ISO string or Date
 * @param {string|Date} endTime    – ISO string or Date
 * @param {number} [altitudeKm=100] – orbit altitude in km
 * @param {number} [startAngleDeg=0] – initial orbital angle in degrees
 * @returns {{
 *   elevations: number[],       – elevation samples every 2 min (degrees)
 *   azimuths: number[],         – azimuth samples every 2 min (degrees, 0=N, 90=E)
 *   satelliteVisible: boolean[], – true when satellite above lander's horizon (el > 0)
 *   relayUsable: boolean[],     – true when visible AND satellite can see Earth
 *   timestamps: string[],
 *   stepMinutes: number,
 *   periodMinutes: number,
 *   passes: { startIdx: number, endIdx: number, maxElev: number }[],
 *   longestGapMinutes: number,
 *   passesPerDay: number,
 *   avgPassMinutes: number,
 *   satVisiblePercent: number,  – % of steps where satellite is above horizon
 *   relayUsablePercent: number, – % of steps where relay is usable (visible + sees Earth)
 *   combinedPercent: number|null – % of steps where Earth OR usable relay is available
 * }}
 */
export function simulate(site, startTime, endTime, altitudeKm = 100, startAngleDeg = 0) {
  const t0 = new Date(startTime).getTime() / 1000;
  const t1 = new Date(endTime).getTime() / 1000;
  const stepS = 120; // 2 minutes
  const stepMinutes = 2;
  const startAngleRad = startAngleDeg * DEG;

  const latRad = site.lat * DEG;
  const lonRad = site.lon * DEG;
  const sitePos = sitePosition(site.lat, site.lon);
  const periodS = orbitalPeriodS(altitudeKm);
  const periodMinutes = periodS / 60;

  const elevations = [];
  const azimuths = [];
  const satelliteVisible = [];
  const relayUsable = [];
  const timestamps = [];

  for (let t = t0; t <= t1; t += stepS) {
    const satPos = satPositionMoonFixed(t - t0, altitudeKm, startAngleRad);
    const { elevation, azimuth } = satelliteElevationAzimuth(satPos, sitePos, latRad, lonRad);
    const visible = elevation > 0;
    const earthLink = canSeeEarth(satPos);

    elevations.push(elevation);
    azimuths.push(azimuth);
    satelliteVisible.push(visible);
    relayUsable.push(visible && earthLink);
    timestamps.push(new Date(t * 1000).toISOString());
  }

  // ── Detect passes (elevation > 0) ──
  const passes = [];
  let inPass = false;
  let passStart = -1;
  let passMaxEl = -Infinity;

  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] > 0) {
      if (!inPass) {
        inPass = true;
        passStart = i;
        passMaxEl = elevations[i];
      } else {
        if (elevations[i] > passMaxEl) passMaxEl = elevations[i];
      }
    } else {
      if (inPass) {
        passes.push({ startIdx: passStart, endIdx: i - 1, maxElev: passMaxEl });
        inPass = false;
      }
    }
  }
  if (inPass) {
    passes.push({ startIdx: passStart, endIdx: elevations.length - 1, maxElev: passMaxEl });
  }

  // ── Longest gap between passes (minutes) ──
  let longestGapMinutes = 0;
  if (passes.length === 0) {
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
      ? passes.reduce((s, p) => s + (p.endIdx - p.startIdx + 1), 0) * stepMinutes / passes.length
      : 0;

  // Satellite-visible % and relay-usable %
  let satVisCount = 0, relayCount = 0;
  for (let i = 0; i < elevations.length; i++) {
    if (satelliteVisible[i]) satVisCount++;
    if (relayUsable[i]) relayCount++;
  }
  const satVisiblePercent = elevations.length > 0 ? (satVisCount / elevations.length) * 100 : 0;
  const relayUsablePercent = elevations.length > 0 ? (relayCount / elevations.length) * 100 : 0;

  // ── Combined coverage: Earth-visible OR relay-usable ──
  let combinedPercent = null;
  if (site.earth_elev && site.earth_elev.length > 0 && site.start && site.step_hours) {
    const earthT0 = new Date(site.start).getTime() / 1000;
    const earthStepS = site.step_hours * 3600;
    let combined = 0;
    for (let i = 0; i < elevations.length; i++) {
      const tSec = t0 + i * stepS;
      const eIdx = Math.round((tSec - earthT0) / earthStepS);
      const earthUp =
        eIdx >= 0 && eIdx < site.earth_elev.length && site.earth_elev[eIdx] > 0;
      // Combined = direct Earth link OR usable relay (satellite visible + sees Earth)
      if (earthUp || relayUsable[i]) combined++;
    }
    combinedPercent = elevations.length > 0 ? (combined / elevations.length) * 100 : 0;
  }

  return {
    elevations,
    azimuths,
    satelliteVisible,
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
  };
}
