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
  geometricPowerProxy,
  validateAlignedSeries,
  longestContinuousBelowHorizonHours,
  estimateNextCrossings,
  computeDailySunlitCalendar,
  computeWindowMetrics,
  compareSitesMetrics,
  POWER_PROXY_LABEL,
} from './metrics.js';

// ─── Legacy Synthetic Tests (Preserved) ──────────────────────────

describe('sunlitPercent (legacy)', () => {
  it('returns 0 for all-dark array', () => {
    expect(sunlitPercent([-5, -3, -1, 0, -2])).toBe(0);
  });

  it('returns 100 for all-lit array', () => {
    expect(sunlitPercent([10, 20, 0.5, 45, 1])).toBe(100);
  });

  it('handles mixed array correctly (0 counts as NOT above)', () => {
    expect(sunlitPercent([5, -1, 0, 10, 3])).toBe(60);
  });

  it('respects startIdx and windowLen', () => {
    expect(sunlitPercent([5, -1, 0, 10, 3], 1, 3)).toBeCloseTo(33.333, 1);
  });

  it('clamps when window crosses array end', () => {
    expect(sunlitPercent([5, -1, 10], 1, 100)).toBe(50);
  });
});

describe('earthVisiblePercent & bothAvailablePercent (legacy)', () => {
  it('earthVisiblePercent handles all-below and all-above', () => {
    expect(earthVisiblePercent([-5, -3, 0])).toBe(0);
    expect(earthVisiblePercent([5, 3, 0.1])).toBe(100);
  });

  it('bothAvailablePercent handles disjoint and mixed arrays', () => {
    expect(bothAvailablePercent([5, -1, 0, 10], [-1, 5, 0, -2])).toBe(0);
    expect(bothAvailablePercent([5, 5, -1, 10], [3, -1, 5, 10])).toBe(50);
  });
});

describe('longestDarknessHours & longestEarthGapHours (legacy)', () => {
  it('computes runs correctly and treats 0 as dark', () => {
    expect(longestDarknessHours([-5, -3, -1, 0, -2], 2)).toBe(10);
    expect(longestDarknessHours([10, 20, 0.5, 45], 2)).toBe(0);
    expect(longestDarknessHours([5, 1, -1, 0, -3, 10, 5], 2)).toBe(6);
    expect(longestDarknessHours([5, 0, 0, 5], 3)).toBe(6);
    expect(longestEarthGapHours([-5, -3, -1, 0], 2)).toBe(8);
    expect(longestEarthGapHours([10, 20, 0.5], 2)).toBe(0);
  });
});

describe('hoursToNextSunsetOrEarthset (legacy)', () => {
  it('finds next sunset and earthset', () => {
    const r1 = hoursToNextSunsetOrEarthset([5, 3, -1, -2, 5], [5, 5, 5, 5, 5], 0, 2);
    expect(r1.sunsetHours).toBe(4);
    expect(r1.earthsetHours).toBeNull();

    const r2 = hoursToNextSunsetOrEarthset([5, 5, 5, 5], [5, 5, -1, 5], 0, 2);
    expect(r2.earthsetHours).toBe(4);
  });
});

describe('perDaySunlitPercent & perDayBothPercent (legacy)', () => {
  it('computes daily percentages at 2h steps', () => {
    const arr = [...new Array(12).fill(10), ...new Array(12).fill(-5)];
    expect(perDaySunlitPercent(arr, 2)).toEqual([100, 0]);

    const sun = new Array(24).fill(10);
    const earth = [...new Array(12).fill(0), ...new Array(12).fill(5)];
    expect(perDayBothPercent(sun, earth, 2)).toEqual([0, 100]);
  });
});

// ─── Phase 2 Hand-Calculated Scientific Tests ────────────────────

describe('Phase 2: missing data, completeness, and irregular timestamps', () => {
  it('never treats null/NaN as darkness or visibility and reports completeness separately', () => {
    const timestamps = [
      '2026-01-01T00:00:00Z',
      '2026-01-01T02:00:00Z',
      '2026-01-01T04:00:00Z',
      '2026-01-01T06:00:00Z',
    ];
    const sunElev = [10, null, -5, -10];
    const earthElev = [20, 20, NaN, -5];

    const res = computeWindowMetrics({ timestamps, sunElev, earthElev, expectedStepHours: 2 });
    // Sun: 3 valid (10, -5, -10) -> 1/3 lit = 33.333%
    expect(res.completeness.validSunSamples).toBe(3);
    expect(res.completeness.missingSunSamples).toBe(1);
    expect(res.completeness.sunPercent).toBe(75);
    expect(res.sunlitPercent).toBeCloseTo(33.3333, 3);

    // Earth: 3 valid (20, 20, -5) -> 2/3 visible = 66.667%
    expect(res.completeness.validEarthSamples).toBe(3);
    expect(res.earthVisiblePercent).toBeCloseTo(66.6667, 3);

    // Both: only indices 0 and 3 have both valid -> (10,20) lit+vis, (-10,-5) neither -> 50%
    expect(res.completeness.validBothSamples).toBe(2);
    expect(res.bothAvailablePercent).toBe(50);

    // Longest darkness: indices 2..3 (04:00 -> 06:00) = 2.0h; index 1 (null) is NOT counted
    expect(res.longestDarknessHours).toBe(2);
  });

  it('breaks continuous darkness across irregular unobserved gaps', () => {
    const timestamps = [
      '2026-01-01T00:00:00Z',
      '2026-01-01T02:00:00Z',
      // 10-hour unobserved gap here
      '2026-01-01T12:00:00Z',
      '2026-01-01T14:00:00Z',
    ];
    const timesMs = timestamps.map((t) => Date.parse(t));
    // With maxGapHours = 3, the 10h gap breaks continuity -> longest run is 2h, not 14h
    expect(longestContinuousBelowHorizonHours(timesMs, [-5, -5, -5, -5], 3)).toBe(2);
  });
});

describe('Phase 2: sunrise/sunset & Earthset transitions with linear interpolation', () => {
  it('linearly interpolates sunset and earthset between bracketing valid samples', () => {
    const timestamps = [
      '2026-01-01T00:00:00Z',
      '2026-01-01T02:00:00Z',
      '2026-01-01T04:00:00Z',
    ];
    // Sun drops from +3 to -1 between 00:00 and 02:00 -> crossing at 3/(3-(-1)) * 2h = 1.5h (01:30Z)
    const sunElev = [3, -1, -5];
    // Earth drops from +2 to -2 between 02:00 and 04:00 -> crossing at 03:00Z (3.0h from 00:00Z)
    const earthElev = [4, 2, -2];

    const res = estimateNextCrossings({
      timestamps,
      sunElev,
      earthElev,
      fromTime: '2026-01-01T00:00:00Z',
      interpolate: true,
    });
    expect(res.sunset.hoursFromStart).toBeCloseTo(1.5, 6);
    expect(res.sunset.timestamp).toBe('2026-01-01T01:30:00.000Z');
    expect(res.sunset.interpolated).toBe(true);

    expect(res.earthset.hoursFromStart).toBeCloseTo(3.0, 6);
    expect(res.earthset.timestamp).toBe('2026-01-01T03:00:00.000Z');
    expect(res.earthset.interpolated).toBe(true);
  });

  it('finds next rise-then-set when starting in darkness', () => {
    const timestamps = [
      '2026-01-01T00:00:00Z',
      '2026-01-01T02:00:00Z',
      '2026-01-01T04:00:00Z',
      '2026-01-01T06:00:00Z',
    ];
    // Dark at 00:00, rises at 02:00 (+2), sets between 04:00 (+1) and 06:00 (-1) -> 05:00Z (5h)
    const res = estimateNextCrossings({
      timestamps,
      sunElev: [-2, 2, 1, -1],
      earthElev: [10, 10, 10, 10],
      fromTime: '2026-01-01T00:00:00Z',
      interpolate: true,
    });
    expect(res.sunset.hoursFromStart).toBeCloseTo(5.0, 6);
    expect(res.earthset).toBeNull();
  });
});

describe('Phase 2: partial days, leap years, empty & single-sample datasets, boundaries', () => {
  it('handles leap day (2024-02-29) and partial days accurately', () => {
    const timestamps = [
      '2024-02-28T22:00:00Z',
      '2024-02-29T00:00:00Z',
      '2024-02-29T02:00:00Z',
      '2024-03-01T00:00:00Z',
    ];
    const sunElev = [-5, 10, -2, 5];
    const cal = computeDailySunlitCalendar({ timestamps, sunElev, expectedStepHours: 2 });
    expect(cal.map((d) => d.date)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(cal[0].sunlitPercent).toBe(0);
    expect(cal[0].isPartialDay).toBe(true);
    expect(cal[1].sunlitPercent).toBe(50);
    expect(cal[1].isPartialDay).toBe(true);
    expect(cal[2].sunlitPercent).toBe(100);
  });

  it('handles empty and single-sample datasets without errors', () => {
    const empty = computeWindowMetrics({ timestamps: [], sunElev: [], earthElev: [] });
    expect(empty.sunlitPercent).toBeNull();
    expect(empty.earthVisiblePercent).toBeNull();
    expect(empty.bothAvailablePercent).toBeNull();
    expect(empty.longestDarknessHours).toBe(0);
    expect(empty.completeness.totalSamples).toBe(0);

    const single = computeWindowMetrics({
      timestamps: ['2026-01-01T00:00:00Z'],
      sunElev: [-5],
      earthElev: [30],
    });
    expect(single.sunlitPercent).toBe(0);
    expect(single.earthVisiblePercent).toBe(100);
    expect(single.longestDarknessHours).toBe(0);
    expect(single.nextSunset).toBeNull();
  });

  it('rejects misaligned array lengths and non-increasing timestamps (no silent trimming)', () => {
    expect(() =>
      validateAlignedSeries(['2026-01-01T00:00:00Z'], [10, 20], [10])
    ).toThrow(/length mismatch/i);

    expect(() =>
      validateAlignedSeries(
        ['2026-01-01T02:00:00Z', '2026-01-01T00:00:00Z'],
        [10, 20],
        [10, 20]
      )
    ).toThrow(/strictly increasing/i);
  });

  it('computes geometric power proxy and labels it honestly', () => {
    expect(geometricPowerProxy(90)).toBeCloseTo(1, 6);
    expect(geometricPowerProxy(30)).toBeCloseTo(0.5, 6);
    expect(geometricPowerProxy(0)).toBe(0);
    expect(geometricPowerProxy(-15)).toBe(0);
    expect(geometricPowerProxy(NaN)).toBeNull();
    expect(POWER_PROXY_LABEL).toMatch(/not actual electrical power/i);
  });
});

// ─── Real Phase 1 Validated Dataset Verification ─────────────────

describe('Phase 1 validated dataset integration', () => {
  const pubJson = JSON.parse(readFileSync(resolve(__dirname, '../../public/data.json'), 'utf-8'));
  const valJson = JSON.parse(
    readFileSync(resolve(__dirname, '../../data/validation_data.json'), 'utf-8')
  );

  const findPub = (id) => pubJson.sites.find((s) => s.id === id);
  const findVal = (id) => valJson.sites.find((s) => s.id === id);

  it('apollo11: Earth visible 100% and 100% completeness over full year', () => {
    const site = findPub('apollo11');
    expect(site).toBeDefined();
    expect(earthVisiblePercent(site.earth_elev)).toBe(100);

    const res = computeWindowMetrics({
      timestamps: site.timestamps,
      sunElev: site.sun.elevation,
      earthElev: site.earth.elevation,
      expectedStepHours: site.step_hours,
    });
    expect(res.completeness.totalSamples).toBe(4381);
    expect(res.completeness.bothPercent).toBe(100);
    expect(res.earthVisiblePercent).toBe(100);
    expect(res.longestEarthGapHours).toBe(0);
  });

  it('tsiolkovskiy (validation_data.json): Earth visible 0%', () => {
    const site = findVal('tsiolkovskiy');
    expect(site).toBeDefined();
    expect(earthVisiblePercent(site.earth_elev)).toBe(0);
  });

  it('south_pole (validation_data.json): Sun up ~52-53%', () => {
    const site = findVal('south_pole');
    expect(site).toBeDefined();
    const pct = sunlitPercent(site.sun_elev);
    expect(pct).toBeGreaterThanOrEqual(52);
    expect(pct).toBeLessThanOrEqual(53);
  });

  it('compareSitesMetrics verifies equivalent window & resolution between Apollo 11 and Malapert', () => {
    const cmp = compareSitesMetrics(findPub('apollo11'), findPub('malapert'), {
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-31T22:00:00Z',
    });
    expect(cmp.equivalentWindow).toBe(true);
    expect(cmp.equivalentResolution).toBe(true);
    expect(cmp.siteA.metrics.completeness.totalSamples).toBe(
      cmp.siteB.metrics.completeness.totalSamples
    );
  });
});
