import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  sunlitPercent,
  earthVisiblePercent,
  bothAvailablePercent,
  longestDarknessHours,
  longestEarthGapHours,
  hoursToNextSunsetOrEarthset,
  perDaySunlitPercent,
  perDayBothPercent,
} from './metrics.js';

// ─── Synthetic arrays ────────────────────────────────────────────

describe('sunlitPercent', () => {
  it('returns 0 for all-dark array', () => {
    const arr = [-5, -3, -1, 0, -2];
    expect(sunlitPercent(arr)).toBe(0);
  });

  it('returns 100 for all-lit array', () => {
    const arr = [10, 20, 0.5, 45, 1];
    expect(sunlitPercent(arr)).toBe(100);
  });

  it('handles mixed array correctly', () => {
    // 3 above, 2 not (0 counts as NOT above)
    const arr = [5, -1, 0, 10, 3];
    expect(sunlitPercent(arr)).toBe(60);
  });

  it('elevation exactly 0 counts as NOT above horizon', () => {
    const arr = [0, 0, 0, 0];
    expect(sunlitPercent(arr)).toBe(0);
  });

  it('respects startIdx and windowLen', () => {
    // Window [1..3]: values -1, 0, 10 → only 10 > 0 → 1/3 ≈ 33.33
    const arr = [5, -1, 0, 10, 3];
    expect(sunlitPercent(arr, 1, 3)).toBeCloseTo(33.333, 1);
  });

  it('clamps when window crosses array end', () => {
    const arr = [5, -1, 10];
    // startIdx=1, windowLen=100 → effective window [1..3) = [-1, 10] → 50%
    expect(sunlitPercent(arr, 1, 100)).toBe(50);
  });
});

describe('earthVisiblePercent', () => {
  it('returns 0 for all-below array', () => {
    expect(earthVisiblePercent([-5, -3, 0])).toBe(0);
  });

  it('returns 100 for all-above array', () => {
    expect(earthVisiblePercent([5, 3, 0.1])).toBe(100);
  });
});

describe('bothAvailablePercent', () => {
  it('returns 0 when sun and earth never both up', () => {
    const sun = [5, -1, 0, 10];
    const earth = [-1, 5, 0, -2];
    expect(bothAvailablePercent(sun, earth)).toBe(0);
  });

  it('returns correct percent for mixed', () => {
    const sun = [5, 5, -1, 10];
    const earth = [3, -1, 5, 10];
    // Both up at index 0 (5,3) and 3 (10,10) → 2/4 = 50%
    expect(bothAvailablePercent(sun, earth)).toBe(50);
  });
});

describe('longestDarknessHours', () => {
  it('returns full window for all-dark', () => {
    const arr = [-5, -3, -1, 0, -2];
    expect(longestDarknessHours(arr, 2)).toBe(10); // 5 steps * 2h
  });

  it('returns 0 for all-lit', () => {
    const arr = [10, 20, 0.5, 45];
    expect(longestDarknessHours(arr, 2)).toBe(0);
  });

  it('single gap of known length', () => {
    // gap at indices 2,3,4 (len=3) → 3*2 = 6h
    const arr = [5, 1, -1, 0, -3, 10, 5];
    expect(longestDarknessHours(arr, 2)).toBe(6);
  });

  it('elevation 0 counts as dark (sun <= 0)', () => {
    const arr = [5, 0, 0, 5];
    expect(longestDarknessHours(arr, 3)).toBe(6); // 2 steps * 3h
  });
});

describe('longestEarthGapHours', () => {
  it('returns full window for all-below', () => {
    const arr = [-5, -3, -1, 0];
    expect(longestEarthGapHours(arr, 2)).toBe(8);
  });

  it('returns 0 for all-above', () => {
    const arr = [10, 20, 0.5];
    expect(longestEarthGapHours(arr, 2)).toBe(0);
  });
});

describe('hoursToNextSunsetOrEarthset', () => {
  it('finds next sunset when sun is currently up', () => {
    // Sun up at 0, sets at index 2
    const sun = [5, 3, -1, -2, 5];
    const earth = [5, 5, 5, 5, 5];
    const result = hoursToNextSunsetOrEarthset(sun, earth, 0, 2);
    expect(result.sunsetHours).toBe(4); // 2 steps * 2h
    expect(result.earthsetHours).toBeNull(); // earth never sets
  });

  it('finds next earthset when earth is currently up', () => {
    const sun = [5, 5, 5, 5];
    const earth = [5, 5, -1, 5];
    const result = hoursToNextSunsetOrEarthset(sun, earth, 0, 2);
    expect(result.earthsetHours).toBe(4);
  });

  it('returns null for both if neither sets', () => {
    const sun = [5, 5, 5];
    const earth = [5, 5, 5];
    const result = hoursToNextSunsetOrEarthset(sun, earth, 0, 2);
    expect(result.sunsetHours).toBeNull();
    expect(result.earthsetHours).toBeNull();
  });
});

describe('perDaySunlitPercent', () => {
  it('computes daily percentages with stepHours=2 (12 steps/day)', () => {
    // 12 steps per day at 2h intervals, all lit first day, all dark second
    const arr = new Array(24).fill(0);
    for (let i = 0; i < 12; i++) arr[i] = 10;  // day 1: all lit
    for (let i = 12; i < 24; i++) arr[i] = -5;  // day 2: all dark
    const result = perDaySunlitPercent(arr, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(0);
  });
});

describe('perDayBothPercent', () => {
  it('computes daily both-available percentages', () => {
    const sun = new Array(24).fill(10);
    const earth = new Array(24).fill(0);
    // First day: earth all at 0 (not above) → both = 0%
    for (let i = 12; i < 24; i++) earth[i] = 5; // second day: all up
    const result = perDayBothPercent(sun, earth, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(100);
  });
});

// ─── Real data verification ─────────────────────────────────────

describe('real data verification', () => {
  let sites;

  // Load data.json from the repo root
  try {
    const dataPath = resolve(__dirname, '../../../data/data.json');
    const raw = readFileSync(dataPath, 'utf-8');
    const json = JSON.parse(raw);
    sites = json.sites;
  } catch {
    // Allow tests to be skipped if data.json is missing
  }

  const findSite = (id) => sites?.find((s) => s.id === id);

  it('apollo11: Earth visible 100% (full year)', () => {
    if (!sites) return; // skip if no data
    const site = findSite('apollo11');
    expect(site).toBeDefined();
    const pct = earthVisiblePercent(site.earth_elev);
    expect(pct).toBe(100);
  });

  it('tsiolkovskiy: Earth visible 0% (full year)', () => {
    if (!sites) return;
    const site = findSite('tsiolkovskiy');
    expect(site).toBeDefined();
    const pct = earthVisiblePercent(site.earth_elev);
    expect(pct).toBe(0);
  });

  it('south_pole: Sun up ~52-53% (full year)', () => {
    if (!sites) return;
    const site = findSite('south_pole');
    expect(site).toBeDefined();
    const pct = sunlitPercent(site.sun_elev);
    expect(pct).toBeGreaterThanOrEqual(52);
    expect(pct).toBeLessThanOrEqual(53);
  });
});
