/**
 * Lunar Landing Site Evaluator – Metrics Module
 *
 * All elevation-based metrics assume a **flat spherical horizon**:
 *   "above horizon" means elevation > 0.
 *   elevation === 0 is treated as ON (not above) the horizon, so it counts
 *   as NOT sunlit / NOT visible.
 *
 * This simplification ignores local topography (crater rims, massifs) that
 * could occlude or reveal a body earlier/later than a flat horizon predicts.
 */

/**
 * Clamp a window so it does not exceed the array length.
 * @param {number} startIdx  – first index of the window (default 0)
 * @param {number} windowLen – desired window length (default arr.length)
 * @param {number} arrLen    – the array's actual length
 * @returns {{ start: number, end: number }}  inclusive start, exclusive end
 */
function clampWindow(startIdx, windowLen, arrLen) {
  const start = Math.max(0, Math.min(startIdx, arrLen));
  const end = Math.min(start + windowLen, arrLen);
  return { start, end };
}

/**
 * Percentage of steps where the Sun is above the (flat) horizon.
 * @param {number[]} sunElev   – sun elevation array
 * @param {number}   startIdx  – window start (default 0)
 * @param {number}   windowLen – window length  (default sunElev.length)
 * @returns {number} 0–100
 */
export function sunlitPercent(sunElev, startIdx = 0, windowLen = sunElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, sunElev.length);
  const count = end - start;
  if (count <= 0) return 0;
  let lit = 0;
  for (let i = start; i < end; i++) {
    if (sunElev[i] > 0) lit++;
  }
  return (lit / count) * 100;
}

/**
 * Percentage of steps where the Earth is above the (flat) horizon.
 */
export function earthVisiblePercent(earthElev, startIdx = 0, windowLen = earthElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, earthElev.length);
  const count = end - start;
  if (count <= 0) return 0;
  let vis = 0;
  for (let i = start; i < end; i++) {
    if (earthElev[i] > 0) vis++;
  }
  return (vis / count) * 100;
}

/**
 * Percentage of steps where **both** Sun and Earth are above the horizon.
 */
export function bothAvailablePercent(sunElev, earthElev, startIdx = 0, windowLen = sunElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, sunElev.length);
  const count = end - start;
  if (count <= 0) return 0;
  let both = 0;
  for (let i = start; i < end; i++) {
    if (sunElev[i] > 0 && earthElev[i] > 0) both++;
  }
  return (both / count) * 100;
}

/**
 * Longest consecutive run of darkness (sun_elev <= 0) in hours.
 * Flat-horizon assumption: sun_elev <= 0 ⇒ dark.
 */
export function longestDarknessHours(sunElev, stepHours, startIdx = 0, windowLen = sunElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, sunElev.length);
  let maxRun = 0;
  let run = 0;
  for (let i = start; i < end; i++) {
    if (sunElev[i] <= 0) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return maxRun * stepHours;
}

/**
 * Longest consecutive run where the Earth is not visible (earth_elev <= 0) in hours.
 */
export function longestEarthGapHours(earthElev, stepHours, startIdx = 0, windowLen = earthElev.length) {
  const { start, end } = clampWindow(startIdx, windowLen, earthElev.length);
  let maxRun = 0;
  let run = 0;
  for (let i = start; i < end; i++) {
    if (earthElev[i] <= 0) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  return maxRun * stepHours;
}

/**
 * Hours from currentIdx to the next time the Sun or Earth drops to <= 0.
 * Returns { sunsetHours, earthsetHours }. A value is null if the body
 * does not set within the remaining data.
 */
export function hoursToNextSunsetOrEarthset(sunElev, earthElev, currentIdx, stepHours) {
  let sunsetHours = null;
  let earthsetHours = null;

  // Find next sunset: Sun currently > 0 then drops to <= 0
  for (let i = currentIdx + 1; i < sunElev.length; i++) {
    if (sunElev[i] <= 0 && sunElev[currentIdx] > 0) {
      sunsetHours = (i - currentIdx) * stepHours;
      break;
    }
    // If Sun is already <= 0 at currentIdx, look for next rise-then-set cycle
    if (sunElev[currentIdx] <= 0) {
      // Find next rise first
      let riseIdx = null;
      for (let j = currentIdx + 1; j < sunElev.length; j++) {
        if (sunElev[j] > 0) { riseIdx = j; break; }
      }
      if (riseIdx !== null) {
        for (let j = riseIdx + 1; j < sunElev.length; j++) {
          if (sunElev[j] <= 0) {
            sunsetHours = (j - currentIdx) * stepHours;
            break;
          }
        }
      }
      break; // only need one pass for this case
    }
  }

  // Find next earthset: Earth currently > 0 then drops to <= 0
  for (let i = currentIdx + 1; i < earthElev.length; i++) {
    if (earthElev[i] <= 0 && earthElev[currentIdx] > 0) {
      earthsetHours = (i - currentIdx) * stepHours;
      break;
    }
    if (earthElev[currentIdx] <= 0) {
      let riseIdx = null;
      for (let j = currentIdx + 1; j < earthElev.length; j++) {
        if (earthElev[j] > 0) { riseIdx = j; break; }
      }
      if (riseIdx !== null) {
        for (let j = riseIdx + 1; j < earthElev.length; j++) {
          if (earthElev[j] <= 0) {
            earthsetHours = (j - currentIdx) * stepHours;
            break;
          }
        }
      }
      break;
    }
  }

  return { sunsetHours, earthsetHours };
}

/**
 * Per-day sunlit percentage. Each "day" = 24 / stepHours steps.
 * Flat-horizon assumption: sun_elev > 0 ⇒ sunlit.
 * @returns {number[]} array of daily percentages (0–100)
 */
export function perDaySunlitPercent(sunElev, stepHours) {
  const stepsPerDay = Math.round(24 / stepHours);
  const days = [];
  for (let d = 0; d < sunElev.length; d += stepsPerDay) {
    const end = Math.min(d + stepsPerDay, sunElev.length);
    const count = end - d;
    let lit = 0;
    for (let i = d; i < end; i++) {
      if (sunElev[i] > 0) lit++;
    }
    days.push((lit / count) * 100);
  }
  return days;
}

/**
 * Per-day "both available" percentage. Each "day" = 24 / stepHours steps.
 * Both Sun and Earth must be > 0 (flat-horizon assumption).
 * @returns {number[]} array of daily percentages (0–100)
 */
export function perDayBothPercent(sunElev, earthElev, stepHours) {
  const stepsPerDay = Math.round(24 / stepHours);
  const days = [];
  for (let d = 0; d < sunElev.length; d += stepsPerDay) {
    const end = Math.min(d + stepsPerDay, sunElev.length);
    const count = end - d;
    let both = 0;
    for (let i = d; i < end; i++) {
      if (sunElev[i] > 0 && earthElev[i] > 0) both++;
    }
    days.push((both / count) * 100);
  }
  return days;
}
