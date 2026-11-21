/**
 * LunarSite EVA — Scientific Metrics Engine (Phase 2)
 *
 * Assumptions & Scientific Conventions:
 * - Flat spherical horizon: "above horizon" means elevation > 0 deg.
 *   elevation === 0 is treated as ON (not above) the horizon (not sunlit / not visible).
 * - Local topography (crater rims, massifs) is NOT modelled here.
 * - All timestamp-aware Phase 2 functions compute durations from actual UTC timestamps,
 *   never treat missing/invalid observations as darkness or visibility, and report
 *   data completeness separately.
 * - Linear interpolation for crossing times (sunset / Earthset) is approximate and
 *   explicitly labelled as such.
 * - Power proxy = max(0, sin(sun_elevation)) is a geometric proxy, NOT actual power.
 * - No numerical viability score is introduced.
 *
 * Backward Compatibility:
 * - All Phase 0/1 legacy exports (sunlitPercent, earthVisiblePercent, bothAvailablePercent,
 *   longestDarknessHours, longestEarthGapHours, hoursToNextSunsetOrEarthset,
 *   perDaySunlitPercent, perDayBothPercent) preserve their exact signatures and contracts
 *   for existing frontend consumers.
 */

const MS_PER_HOUR = 3600 * 1000;
const DEG_TO_RAD = Math.PI / 180;

export const POWER_PROXY_LABEL =
  'Geometric power proxy: max(0, sin(Sun elevation)) — rough indicator, not actual electrical power';

export const INTERPOLATION_NOTE =
  'Estimated by linear interpolation between bracketing valid observations (approximate)';

// ─── Helpers ──────────────────────────────────────────────────────

function isValidElevation(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}

function parseTimestampMs(ts) {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function clampWindow(startIdx, windowLen, arrLen) {
  const start = Math.max(0, Math.min(startIdx, arrLen));
  const end = Math.min(start + windowLen, arrLen);
  return { start, end };
}

// ─── Legacy Frontend-Compatible Exports (Preserved) ───────────────

export function sunlitPercent(sunElev, startIdx = 0, windowLen = sunElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, sunElev.length);
  let valid = 0;
  let lit = 0;
  for (let i = start; i < end; i++) {
    if (!isValidElevation(sunElev[i])) continue;
    valid++;
    if (sunElev[i] > 0) lit++;
  }
  return valid <= 0 ? 0 : (lit / valid) * 100;
}

export function earthVisiblePercent(earthElev, startIdx = 0, windowLen = earthElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, earthElev.length);
  let valid = 0;
  let vis = 0;
  for (let i = start; i < end; i++) {
    if (!isValidElevation(earthElev[i])) continue;
    valid++;
    if (earthElev[i] > 0) vis++;
  }
  return valid <= 0 ? 0 : (vis / valid) * 100;
}

export function bothAvailablePercent(sunElev, earthElev, startIdx = 0, windowLen = sunElev.length) {
  const len = Math.min(sunElev.length, earthElev.length);
  const { start, end } = clampWindow(startIdx, windowLen, len);
  let valid = 0;
  let both = 0;
  for (let i = start; i < end; i++) {
    if (!isValidElevation(sunElev[i]) || !isValidElevation(earthElev[i])) continue;
    valid++;
    if (sunElev[i] > 0 && earthElev[i] > 0) both++;
  }
  return valid <= 0 ? 0 : (both / valid) * 100;
}

export function longestDarknessHours(sunElev, stepHours, startIdx = 0, windowLen = sunElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, sunElev.length);
  let maxRun = 0;
  let run = 0;
  for (let i = start; i < end; i++) {
    if (!isValidElevation(sunElev[i])) {
      run = 0;
    } else if (sunElev[i] <= 0) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return maxRun * stepHours;
}

export function longestEarthGapHours(earthElev, stepHours, startIdx = 0, windowLen = earthElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, earthElev.length);
  let maxRun = 0;
  let run = 0;
  for (let i = start; i < end; i++) {
    if (!isValidElevation(earthElev[i])) {
      run = 0;
    } else if (earthElev[i] <= 0) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return maxRun * stepHours;
}

export function hoursToNextSunsetOrEarthset(sunElev, earthElev, currentIdx, stepHours) {
  const findNextSet = (arr) => {
    if (currentIdx < 0 || currentIdx >= arr.length || !isValidElevation(arr[currentIdx])) {
      return null;
    }
    if (arr[currentIdx] > 0) {
      for (let i = currentIdx + 1; i < arr.length; i++) {
        if (isValidElevation(arr[i]) && arr[i] <= 0) {
          return (i - currentIdx) * stepHours;
        }
      }
      return null;
    }
    let riseIdx = null;
    for (let j = currentIdx + 1; j < arr.length; j++) {
      if (isValidElevation(arr[j]) && arr[j] > 0) {
        riseIdx = j;
        break;
      }
    }
    if (riseIdx === null) return null;
    for (let j = riseIdx + 1; j < arr.length; j++) {
      if (isValidElevation(arr[j]) && arr[j] <= 0) {
        return (j - currentIdx) * stepHours;
      }
    }
    return null;
  };

  return {
    sunsetHours: findNextSet(sunElev),
    earthsetHours: findNextSet(earthElev),
  };
}

export function perDaySunlitPercent(sunElev, stepHours) {
  const stepsPerDay = Math.round(24 / stepHours);
  const days = [];
  for (let d = 0; d < sunElev.length; d += stepsPerDay) {
    const end = Math.min(d + stepsPerDay, sunElev.length);
    let valid = 0;
    let lit = 0;
    for (let i = d; i < end; i++) {
      if (!isValidElevation(sunElev[i])) continue;
      valid++;
      if (sunElev[i] > 0) lit++;
    }
    days.push(valid <= 0 ? 0 : (lit / valid) * 100);
  }
  return days;
}

export function perDayBothPercent(sunElev, earthElev, stepHours) {
  const stepsPerDay = Math.round(24 / stepHours);
  const len = Math.min(sunElev.length, earthElev.length);
  const days = [];
  for (let d = 0; d < len; d += stepsPerDay) {
    const end = Math.min(d + stepsPerDay, len);
    let valid = 0;
    let both = 0;
    for (let i = d; i < end; i++) {
      if (!isValidElevation(sunElev[i]) || !isValidElevation(earthElev[i])) continue;
      valid++;
      if (sunElev[i] > 0 && earthElev[i] > 0) both++;
    }
    days.push(valid <= 0 ? 0 : (both / valid) * 100);
  }
  return days;
}

// ─── Phase 2 Scientific Timestamp-Aware Metrics Engine ────────────

/**
 * Geometric power proxy: max(0, sin(sunElevDeg)).
 * Explicitly a geometric proxy, NOT actual electrical power.
 * Returns null for missing/invalid elevation.
 */
export function geometricPowerProxy(sunElevDeg) {
  if (!isValidElevation(sunElevDeg)) return null;
  return Math.max(0, Math.sin(sunElevDeg * DEG_TO_RAD));
}

/**
 * Validate alignment and chronological ordering of timestamps, sunElev, and earthElev.
 * Throws an Error on length mismatch, invalid timestamps, or non-increasing timestamps.
 * Never silently trims arrays.
 */
export function validateAlignedSeries(timestamps, sunElev, earthElev) {
  if (!Array.isArray(timestamps) || !Array.isArray(sunElev) || !Array.isArray(earthElev)) {
    throw new Error('timestamps, sunElev, and earthElev must all be arrays.');
  }
  if (timestamps.length !== sunElev.length || timestamps.length !== earthElev.length) {
    throw new Error(
      `Array length mismatch (no silent trimming): timestamps=${timestamps.length}, ` +
        `sunElev=${sunElev.length}, earthElev=${earthElev.length}`
    );
  }
  const timesMs = new Array(timestamps.length);
  for (let i = 0; i < timestamps.length; i++) {
    const ms = parseTimestampMs(timestamps[i]);
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid timestamp at index ${i}: ${String(timestamps[i])}`);
    }
    if (i > 0 && ms <= timesMs[i - 1]) {
      throw new Error(
        `Timestamps must be strictly increasing: index ${i - 1} (${timestamps[i - 1]}) >= index ${i} (${timestamps[i]})`
      );
    }
    timesMs[i] = ms;
  }
  return timesMs;
}

/**
 * Compute longest continuous run (in hours) where elevation <= 0 using actual timestamps.
 *
 * Rules:
 * - A run of valid dark samples [i0 .. i1] has duration (t[i1] - t[i0]) / MS_PER_HOUR.
 *   For a single isolated dark sample, duration is 0 hours (instantaneous observation).
 * - Missing/invalid samples break continuity (never treated as darkness).
 * - If maxGapHours is specified, any timestamp jump > maxGapHours also breaks continuity
 *   so an unobserved data gap is never counted as continuous darkness.
 */
export function longestContinuousBelowHorizonHours(timesMs, elev, maxGapHours = Infinity) {
  let maxHours = 0;
  let runStartMs = null;
  let prevValidMs = null;

  for (let i = 0; i < elev.length; i++) {
    const v = elev[i];
    const t = timesMs[i];

    if (!isValidElevation(v)) {
      runStartMs = null;
      prevValidMs = null;
      continue;
    }

    if (v <= 0) {
      if (runStartMs === null) {
        runStartMs = t;
      } else if (prevValidMs !== null && (t - prevValidMs) / MS_PER_HOUR > maxGapHours) {
        // Unobserved gap exceeds continuity threshold; start a new run
        runStartMs = t;
      }
      const dur = (t - runStartMs) / MS_PER_HOUR;
      if (dur > maxHours) maxHours = dur;
      prevValidMs = t;
    } else {
      runStartMs = null;
      prevValidMs = null;
    }
  }

  return maxHours;
}

/**
 * Estimate next sunset and next Earthset from `fromTime` using actual timestamps.
 *
 * - If body is currently > 0 at the first valid sample >= fromTime, finds the next <= 0.
 * - If body is currently <= 0, finds the next rise (> 0) then the subsequent set (<= 0).
 * - When `interpolate` is true and bracketing samples are both valid with no missing
 *   samples between them, uses linear interpolation to estimate the 0-deg crossing time.
 */
export function estimateNextCrossings({
  timestamps,
  sunElev,
  earthElev,
  fromTime = null,
  interpolate = true,
  maxGapHours = Infinity,
}) {
  const timesMs = validateAlignedSeries(timestamps, sunElev, earthElev);
  if (timesMs.length === 0) {
    return {
      fromTime: fromTime ?? null,
      sunset: null,
      earthset: null,
      approximationNote: interpolate ? INTERPOLATION_NOTE : null,
    };
  }

  const fromMs = fromTime != null ? parseTimestampMs(fromTime) : timesMs[0];
  if (!Number.isFinite(fromMs)) {
    throw new Error(`Invalid fromTime: ${String(fromTime)}`);
  }

  // First index with timestamp >= fromMs
  let startIdx = timesMs.findIndex((t) => t >= fromMs);
  if (startIdx === -1) {
    return {
      fromTime: new Date(fromMs).toISOString(),
      sunset: null,
      earthset: null,
      approximationNote: interpolate ? INTERPOLATION_NOTE : null,
    };
  }

  const findCrossing = (elev) => {
    // Advance to first valid sample at or after startIdx
    let cur = startIdx;
    while (cur < elev.length && !isValidElevation(elev[cur])) cur++;
    if (cur >= elev.length) return null;

    let searchStart = cur;
    if (elev[cur] <= 0) {
      // Must rise above 0 first
      let roseAt = -1;
      for (let i = cur + 1; i < elev.length; i++) {
        if (isValidElevation(elev[i]) && elev[i] > 0) {
          roseAt = i;
          break;
        }
      }
      if (roseAt === -1) return null;
      searchStart = roseAt;
    }

    // Now find the first valid sample <= 0 after searchStart
    let lastPosIdx = searchStart;
    for (let i = searchStart + 1; i < elev.length; i++) {
      if (!isValidElevation(elev[i])) {
        lastPosIdx = -1; // missing data breaks direct bracketing
        continue;
      }
      if (elev[i] > 0) {
        lastPosIdx = i;
        continue;
      }
      // elev[i] <= 0
      let crossMs = timesMs[i];
      let usedInterp = false;
      if (
        interpolate &&
        lastPosIdx === i - 1 &&
        isValidElevation(elev[lastPosIdx]) &&
        elev[lastPosIdx] > 0 &&
        (timesMs[i] - timesMs[lastPosIdx]) / MS_PER_HOUR <= maxGapHours
      ) {
        const el0 = elev[lastPosIdx];
        const el1 = elev[i];
        const frac = el0 / (el0 - el1);
        crossMs = timesMs[lastPosIdx] + frac * (timesMs[i] - timesMs[lastPosIdx]);
        usedInterp = true;
      }
      return {
        timestamp: new Date(crossMs).toISOString(),
        hoursFromStart: (crossMs - fromMs) / MS_PER_HOUR,
        interpolated: usedInterp,
      };
    }
    return null;
  };

  return {
    fromTime: new Date(fromMs).toISOString(),
    sunset: findCrossing(sunElev),
    earthset: findCrossing(earthElev),
    approximationNote: interpolate ? INTERPOLATION_NOTE : null,
  };
}

/**
 * Compute daily Sunlit percentage grouped by actual UTC calendar day (YYYY-MM-DD).
 * Handles partial days, leap years (e.g., 2024-02-29), and missing observations.
 * Kept strictly separate from simultaneous Sun-and-Earth availability.
 */
export function computeDailySunlitCalendar({ timestamps, sunElev, expectedStepHours = 2 }) {
  if (!Array.isArray(timestamps) || !Array.isArray(sunElev) || timestamps.length !== sunElev.length) {
    throw new Error('timestamps and sunElev must be arrays of equal length.');
  }
  const expectedPerDay = expectedStepHours > 0 ? Math.round(24 / expectedStepHours) : null;
  const byDay = new Map();

  for (let i = 0; i < timestamps.length; i++) {
    const ms = parseTimestampMs(timestamps[i]);
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid timestamp at index ${i}: ${String(timestamps[i])}`);
    }
    const dayKey = new Date(ms).toISOString().slice(0, 10);
    let bucket = byDay.get(dayKey);
    if (!bucket) {
      bucket = { date: dayKey, totalSamples: 0, validSamples: 0, litSamples: 0 };
      byDay.set(dayKey, bucket);
    }
    bucket.totalSamples++;
    if (isValidElevation(sunElev[i])) {
      bucket.validSamples++;
      if (sunElev[i] > 0) bucket.litSamples++;
    }
  }

  return Array.from(byDay.values()).map((b) => ({
    date: b.date,
    sunlitPercent: b.validSamples > 0 ? (b.litSamples / b.validSamples) * 100 : null,
    validSamples: b.validSamples,
    totalSamples: b.totalSamples,
    completenessPercent: b.totalSamples > 0 ? (b.validSamples / b.totalSamples) * 100 : 0,
    isPartialDay: expectedPerDay !== null ? b.totalSamples < expectedPerDay : false,
  }));
}

/**
 * Compute full Phase 2 metrics over an optional UTC time window [startTime, endTime].
 */
export function computeWindowMetrics({
  timestamps,
  sunElev,
  earthElev,
  startTime = null,
  endTime = null,
  expectedStepHours = null,
  maxGapHours = Infinity,
}) {
  const allTimesMs = validateAlignedSeries(timestamps, sunElev, earthElev);
  const startMs = startTime != null ? parseTimestampMs(startTime) : -Infinity;
  const endMs = endTime != null ? parseTimestampMs(endTime) : Infinity;

  if (startTime != null && !Number.isFinite(startMs)) {
    throw new Error(`Invalid startTime: ${String(startTime)}`);
  }
  if (endTime != null && !Number.isFinite(endMs)) {
    throw new Error(`Invalid endTime: ${String(endTime)}`);
  }

  const winTimes = [];
  const winSun = [];
  const winEarth = [];
  const winIso = [];

  for (let i = 0; i < allTimesMs.length; i++) {
    if (allTimesMs[i] >= startMs && allTimesMs[i] <= endMs) {
      winTimes.push(allTimesMs[i]);
      winIso.push(timestamps[i]);
      winSun.push(sunElev[i]);
      winEarth.push(earthElev[i]);
    }
  }

  const totalSamples = winTimes.length;
  let validSun = 0;
  let litSun = 0;
  let validEarth = 0;
  let visEarth = 0;
  let validBoth = 0;
  let availBoth = 0;
  let powerSum = 0;
  let powerMax = 0;

  for (let i = 0; i < totalSamples; i++) {
    const sOk = isValidElevation(winSun[i]);
    const eOk = isValidElevation(winEarth[i]);
    if (sOk) {
      validSun++;
      if (winSun[i] > 0) litSun++;
      const p = geometricPowerProxy(winSun[i]);
      powerSum += p;
      if (p > powerMax) powerMax = p;
    }
    if (eOk) {
      validEarth++;
      if (winEarth[i] > 0) visEarth++;
    }
    if (sOk && eOk) {
      validBoth++;
      if (winSun[i] > 0 && winEarth[i] > 0) availBoth++;
    }
  }

  const gapLimit =
    maxGapHours !== Infinity
      ? maxGapHours
      : expectedStepHours != null
        ? expectedStepHours * 1.5
        : Infinity;

  const crossings = estimateNextCrossings({
    timestamps: winIso,
    sunElev: winSun,
    earthElev: winEarth,
    fromTime: winIso[0] ?? null,
    interpolate: true,
    maxGapHours: gapLimit,
  });

  return {
    window: {
      start: winIso[0] ?? null,
      end: winIso[winIso.length - 1] ?? null,
      durationHours:
        winTimes.length >= 2 ? (winTimes[winTimes.length - 1] - winTimes[0]) / MS_PER_HOUR : 0,
    },
    completeness: {
      totalSamples,
      validSunSamples: validSun,
      validEarthSamples: validEarth,
      validBothSamples: validBoth,
      missingSunSamples: totalSamples - validSun,
      missingEarthSamples: totalSamples - validEarth,
      sunPercent: totalSamples > 0 ? (validSun / totalSamples) * 100 : 0,
      earthPercent: totalSamples > 0 ? (validEarth / totalSamples) * 100 : 0,
      bothPercent: totalSamples > 0 ? (validBoth / totalSamples) * 100 : 0,
    },
    sunlitPercent: validSun > 0 ? (litSun / validSun) * 100 : null,
    earthVisiblePercent: validEarth > 0 ? (visEarth / validEarth) * 100 : null,
    bothAvailablePercent: validBoth > 0 ? (availBoth / validBoth) * 100 : null,
    longestDarknessHours: longestContinuousBelowHorizonHours(winTimes, winSun, gapLimit),
    longestEarthGapHours: longestContinuousBelowHorizonHours(winTimes, winEarth, gapLimit),
    nextSunset: crossings.sunset,
    nextEarthset: crossings.earthset,
    powerProxy: {
      mean: validSun > 0 ? powerSum / validSun : null,
      max: validSun > 0 ? powerMax : null,
      label: POWER_PROXY_LABEL,
    },
  };
}

/**
 * Compare two sites over an equivalent UTC time window and check sampling resolution parity.
 * Does NOT introduce any numerical viability score.
 */
export function compareSitesMetrics(siteA, siteB, { startTime = null, endTime = null } = {}) {
  const stepA = siteA.step_hours ?? null;
  const stepB = siteB.step_hours ?? null;

  const metricsA = computeWindowMetrics({
    timestamps: siteA.timestamps,
    sunElev: siteA.sun?.elevation ?? siteA.sun_elev,
    earthElev: siteA.earth?.elevation ?? siteA.earth_elev,
    startTime,
    endTime,
    expectedStepHours: stepA,
  });

  const metricsB = computeWindowMetrics({
    timestamps: siteB.timestamps,
    sunElev: siteB.sun?.elevation ?? siteB.sun_elev,
    earthElev: siteB.earth?.elevation ?? siteB.earth_elev,
    startTime,
    endTime,
    expectedStepHours: stepB,
  });

  return {
    equivalentWindow:
      metricsA.window.start === metricsB.window.start &&
      metricsA.window.end === metricsB.window.end,
    equivalentResolution: stepA === stepB,
    siteA: { id: siteA.id, name: siteA.name, stepHours: stepA, metrics: metricsA },
    siteB: { id: siteB.id, name: siteB.name, stepHours: stepB, metrics: metricsB },
  };
}
