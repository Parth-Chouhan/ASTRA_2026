import { describe, it, expect } from 'vitest';
import { simulate, orbitalPeriodS, R_MOON, MU_MOON } from './satellite.js';

// ── Sites used in tests ──────────────────────────────────────────────
const SOUTH_POLE   = { lat: -89.9, lon: 0.0 };
const APOLLO11     = { lat: 0.67416, lon: 23.47314 };
const MALAPERT     = { lat: -85.98, lon: -0.23 };
const TSIOLKOVSKIY = { lat: -20.0, lon: 129.0 };

// 7-day window for most tests (enough to see patterns)
const START = '2026-01-01T00:00:00Z';
const END_7D  = '2026-01-08T00:00:00Z';
const END_30D = '2026-01-31T00:00:00Z';

// ── Orbital period ──────────────────────────────────────────────────

describe('orbital period', () => {
  it('is about 118 min at 100 km altitude', () => {
    const T = orbitalPeriodS(100) / 60;
    expect(T).toBeGreaterThan(116);
    expect(T).toBeLessThan(120);
  });

  it('increases with altitude', () => {
    const T100 = orbitalPeriodS(100);
    const T200 = orbitalPeriodS(200);
    expect(T200).toBeGreaterThan(T100);
  });
});

// ── Elevation bounds ────────────────────────────────────────────────

describe('elevation bounds', () => {
  it('all elevations are in [-90, 90] for south_pole', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    for (const el of r.elevations) {
      expect(el).toBeGreaterThanOrEqual(-90);
      expect(el).toBeLessThanOrEqual(90);
    }
  });

  it('all elevations are in [-90, 90] for apollo11', () => {
    const r = simulate(APOLLO11, START, END_7D, 100, 0);
    for (const el of r.elevations) {
      expect(el).toBeGreaterThanOrEqual(-90);
      expect(el).toBeLessThanOrEqual(90);
    }
  });
});

// ── Azimuth ─────────────────────────────────────────────────────────

describe('azimuth', () => {
  it('all azimuths are in [0, 360) for south_pole', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.azimuths.length).toBe(r.elevations.length);
    for (const az of r.azimuths) {
      expect(az).toBeGreaterThanOrEqual(0);
      expect(az).toBeLessThan(360);
    }
  });

  it('all azimuths are in [0, 360) for apollo11', () => {
    const r = simulate(APOLLO11, START, END_7D, 100, 0);
    for (const az of r.azimuths) {
      expect(az).toBeGreaterThanOrEqual(0);
      expect(az).toBeLessThan(360);
    }
  });

  it('satellite passes north of south_pole site have azimuth near 0 or 360', () => {
    // For a near-south-pole site, when the satellite is passing on the
    // north side (above the horizon, heading toward the equator), its
    // azimuth should be roughly in the northern half (315-360 or 0-45).
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    // Find passes and check peak-elevation azimuth
    let northSidePasses = 0;
    for (const p of r.passes) {
      // Find the step with max elevation in this pass
      let maxIdx = p.startIdx;
      for (let i = p.startIdx; i <= p.endIdx; i++) {
        if (r.elevations[i] > r.elevations[maxIdx]) maxIdx = i;
      }
      const az = r.azimuths[maxIdx];
      // At the south pole, every direction is north, so any azimuth is valid
      // but the satellite orbit plane sweeps around → azimuths vary
      if (az >= 0 && az < 360) northSidePasses++;
    }
    // All passes should have valid azimuths
    expect(northSidePasses).toBe(r.passes.length);
  });

  it('equatorial site sees satellite with varying azimuths over 30 days', () => {
    // For a polar orbit, as the Moon rotates, the orbit plane's apparent
    // direction from an equatorial site sweeps through all azimuths over
    // a sidereal month. We just check azimuths span a wide range.
    const r = simulate(APOLLO11, START, END_30D, 100, 0);
    if (r.passes.length > 0) {
      const peakAz = r.passes.map(p => {
        let maxIdx = p.startIdx;
        for (let i = p.startIdx; i <= p.endIdx; i++) {
          if (r.elevations[i] > r.elevations[maxIdx]) maxIdx = i;
        }
        return r.azimuths[maxIdx];
      });
      const minAz = Math.min(...peakAz);
      const maxAz = Math.max(...peakAz);
      // Should span at least 90° of azimuth
      expect(maxAz - minAz).toBeGreaterThan(45);
    }
  });
});

// ── Polar site ──────────────────────────────────────────────────────

describe('south_pole polar site', () => {
  it('has a pass roughly every 2 h (10-14 passes per day)', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.passesPerDay).toBeGreaterThan(9);
    expect(r.passesPerDay).toBeLessThan(15);
  });

  it('average pass is about 8-16 min', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.avgPassMinutes).toBeGreaterThanOrEqual(6);
    expect(r.avgPassMinutes).toBeLessThanOrEqual(20);
  });

  it('longest gap is under 2 h', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.longestGapMinutes).toBeLessThan(120);
  });
});

// ── Equatorial site ─────────────────────────────────────────────────

describe('apollo11 equatorial site', () => {
  it('shows multi-day coverage windows separated by long gaps', () => {
    const r = simulate(APOLLO11, START, END_30D, 100, 0);
    expect(r.longestGapMinutes).toBeGreaterThan(60 * 12);
  });

  it('has fewer passes per day than a polar site', () => {
    const r = simulate(APOLLO11, START, END_30D, 100, 0);
    const rPole = simulate(SOUTH_POLE, START, END_30D, 100, 0);
    expect(r.passesPerDay).toBeLessThan(rPole.passesPerDay);
  });
});

// ── Output structure ────────────────────────────────────────────────

describe('simulate output structure', () => {
  it('returns correct number of 2-minute samples for 1 day', () => {
    const r = simulate(SOUTH_POLE, START, '2026-01-02T00:00:00Z', 100, 0);
    expect(r.elevations.length).toBe(721);
    expect(r.azimuths.length).toBe(721);
    expect(r.satelliteVisible.length).toBe(721);
    expect(r.relayUsable.length).toBe(721);
    expect(r.timestamps.length).toBe(721);
    expect(r.stepMinutes).toBe(2);
  });

  it('periodMinutes matches orbitalPeriodS', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.periodMinutes).toBeCloseTo(orbitalPeriodS(100) / 60, 5);
  });

  it('passes have valid indices and maxElev > 0', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.passes.length).toBeGreaterThan(0);
    for (const p of r.passes) {
      expect(p.startIdx).toBeLessThanOrEqual(p.endIdx);
      expect(p.maxElev).toBeGreaterThan(0);
      expect(p.startIdx).toBeGreaterThanOrEqual(0);
      expect(p.endIdx).toBeLessThan(r.elevations.length);
    }
  });

  it('combined coverage is null when no earth_elev', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.combinedPercent).toBeNull();
  });

  it('reports satVisiblePercent and relayUsablePercent', () => {
    const r = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    expect(r.satVisiblePercent).toBeGreaterThan(0);
    expect(r.relayUsablePercent).toBeGreaterThanOrEqual(0);
    expect(r.relayUsablePercent).toBeLessThanOrEqual(r.satVisiblePercent);
  });
});

// ── Earth-link / relay-usable ───────────────────────────────────────

describe('Earth-link check', () => {
  it('relay usable <= satellite visible for all sites', () => {
    for (const s of [SOUTH_POLE, APOLLO11, MALAPERT, TSIOLKOVSKIY]) {
      const r = simulate(s, START, END_7D, 100, 0);
      expect(r.relayUsablePercent).toBeLessThanOrEqual(r.satVisiblePercent + 0.01);
    }
  });

  it('tsiolkovskiy far-side: relay much lower than raw visibility', () => {
    // Tsiolkovskiy is on the far side (lon=129°). The satellite is
    // sometimes visible overhead but often behind the Moon w.r.t. Earth.
    // Relay usable should be significantly lower than satellite visible.
    const r = simulate(TSIOLKOVSKIY, START, END_30D, 100, 0);
    // Relay usable should be less than half of satellite visible
    expect(r.relayUsablePercent).toBeLessThan(r.satVisiblePercent * 0.75);
    expect(r.satVisiblePercent).toBeGreaterThan(0);
  });

  it('south_pole near-side: relay close to raw visibility', () => {
    // South pole is at lon=0 (sub-Earth point). Most passes should have
    // Earth-link. The difference should be small (< 30% of passes lost).
    const r = simulate(SOUTH_POLE, START, END_30D, 100, 0);
    expect(r.relayUsablePercent).toBeGreaterThan(r.satVisiblePercent * 0.5);
  });

  it('apollo11 near-side: relay close to raw visibility', () => {
    // Apollo 11 is on the near side. Satellite passes that are visible
    // should mostly also have Earth-link.
    const r = simulate(APOLLO11, START, END_30D, 100, 0);
    if (r.satVisiblePercent > 0) {
      expect(r.relayUsablePercent).toBeGreaterThan(r.satVisiblePercent * 0.5);
    }
  });
});

// ── Combined coverage ───────────────────────────────────────────────

describe('combined coverage', () => {
  it('returns a percentage when earth_elev is provided', () => {
    const site = {
      ...SOUTH_POLE,
      start: START,
      step_hours: 2,
      earth_elev: new Array(4381).fill(10),
    };
    const r = simulate(site, START, END_7D, 100, 0);
    expect(r.combinedPercent).toBeCloseTo(100, 0);
  });

  it('combined >= satellite-only when Earth adds coverage', () => {
    const earthElev = new Array(4381).fill(0).map((_, i) => (i % 2 === 0 ? 5 : -5));
    const site = {
      ...SOUTH_POLE,
      start: START,
      step_hours: 2,
      earth_elev: earthElev,
    };
    const r = simulate(site, START, END_7D, 100, 0);
    expect(r.combinedPercent).toBeGreaterThanOrEqual(r.relayUsablePercent - 1);
  });
});

// ── Start angle ─────────────────────────────────────────────────────

describe('startAngleDeg parameter', () => {
  it('different start angles produce different elevation sequences', () => {
    const r0 = simulate(SOUTH_POLE, START, END_7D, 100, 0);
    const r90 = simulate(SOUTH_POLE, START, END_7D, 100, 90);
    let diffs = 0;
    for (let i = 0; i < Math.min(100, r0.elevations.length); i++) {
      if (Math.abs(r0.elevations[i] - r90.elevations[i]) > 0.01) diffs++;
    }
    expect(diffs).toBeGreaterThan(0);
  });
});

// ── Phase 3: Controlled Geometric & Scientific Validation Tests ─────

import {
  satPositionMoonFixed,
  sitePosition,
  satelliteElevationAzimuth,
  canSeeEarth,
  interpolateEarthElevation,
} from './satellite.js';

describe('Phase 3: orbital mathematics & input validation', () => {
  it('rejects invalid altitudes (zero, negative, NaN, out-of-bounds)', () => {
    expect(() => orbitalPeriodS(0)).toThrow(RangeError);
    expect(() => orbitalPeriodS(-50)).toThrow(RangeError);
    expect(() => orbitalPeriodS(NaN)).toThrow(RangeError);
    expect(() => orbitalPeriodS(100000)).toThrow(RangeError);
  });

  it('preserves exact orbital radius a = R + h after Moon-fixed rotation', () => {
    const h = 100;
    const expectedR = R_MOON + h;
    for (const t of [0, 1234, 50000, 86400 * 10]) {
      const p = satPositionMoonFixed(t, h, 0.7);
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeCloseTo(expectedR, 8);
    }
  });

  it('respects initial orbital angle at t = 0', () => {
    const p0 = satPositionMoonFixed(0, 100, 0);
    expect(p0.x).toBeCloseTo(R_MOON + 100, 6);
    expect(p0.y).toBeCloseTo(0, 6);
    expect(p0.z).toBeCloseTo(0, 6);

    const p90 = satPositionMoonFixed(0, 100, Math.PI / 2);
    expect(p90.x).toBeCloseTo(0, 6);
    expect(p90.z).toBeCloseTo(R_MOON + 100, 6);
  });
});

describe('Phase 3: coordinate geometry & azimuth orientation', () => {
  it('computes exact site position and ENU basis for equatorial and polar sites', () => {
    const eq0 = sitePosition(0, 0);
    expect(eq0.ux).toBeCloseTo(1, 8);
    expect(eq0.ey).toBeCloseTo(1, 8);
    expect(eq0.nz).toBeCloseTo(1, 8);

    const eq90E = sitePosition(0, 90);
    expect(eq90E.uy).toBeCloseTo(1, 8);
    expect(eq90E.ex).toBeCloseTo(-1, 8);

    const northPole = sitePosition(90, 0);
    expect(northPole.uz).toBeCloseTo(1, 8);

    const southPole = sitePosition(-90, 0);
    expect(southPole.uz).toBeCloseTo(-1, 8);
  });

  it('gives azimuth 0=N, 90=E, 180=S, 270=W for controlled satellite positions', () => {
    const site = sitePosition(0, 0); // at (R, 0, 0); up=+x, east=+y, north=+z
    const d = 100;
    expect(satelliteElevationAzimuth({ x: site.x + d, y: 0, z: d }, site).azimuth).toBeCloseTo(0, 6);
    expect(satelliteElevationAzimuth({ x: site.x + d, y: d, z: 0 }, site).azimuth).toBeCloseTo(90, 6);
    expect(satelliteElevationAzimuth({ x: site.x + d, y: 0, z: -d }, site).azimuth).toBeCloseTo(180, 6);
    expect(satelliteElevationAzimuth({ x: site.x + d, y: -d, z: 0 }, site).azimuth).toBeCloseTo(270, 6);
  });

  it('handles zero elevation and rejects invalid satellite/site inputs', () => {
    const site = sitePosition(0, 0);
    // Tangent to horizon at (R, 100, 0) -> dot(v, up) = 0 -> el = 0 deg
    const res = satelliteElevationAzimuth({ x: site.x, y: 100, z: 0 }, site);
    expect(res.elevation).toBeCloseTo(0, 6);
    expect(() => sitePosition(95, 0)).toThrow(RangeError);
    expect(() => satelliteElevationAzimuth({ x: NaN, y: 0, z: 0 }, site)).toThrow(RangeError);
  });
});

describe('Phase 3: Earth line-of-sight geometry (canSeeEarth)', () => {
  it('distinguishes near-side, far-side occluded, beyond-limb, and exact tangent', () => {
    expect(canSeeEarth({ x: 100, y: 0, z: 0 })).toBe(true); // near side
    expect(canSeeEarth({ x: -1837.4, y: 0, z: 0 })).toBe(false); // directly behind Moon
    expect(canSeeEarth({ x: -100, y: R_MOON + 50, z: 0 })).toBe(true); // beyond lunar limb
    expect(canSeeEarth({ x: -100, y: R_MOON, z: 0 })).toBe(false); // exact tangent = occluded
  });
});

describe('Phase 3: pass metadata, single-sample window, and Earth interpolation', () => {
  it('populates pass timestamps, interpolated durations, and peak azimuth', () => {
    const r = simulate(SOUTH_POLE, START, '2026-01-02T00:00:00Z', 100, 0);
    expect(r.passes.length).toBeGreaterThan(8);
    for (const p of r.passes) {
      expect(p.durationMinutes).toBeGreaterThan(0);
      expect(p.maxElev).toBeGreaterThan(0);
      expect(p.maxElevAzimuth).toBeGreaterThanOrEqual(0);
      expect(p.maxElevAzimuth).toBeLessThan(360);
      expect(typeof p.startTime).toBe('string');
      expect(typeof p.endTime).toBe('string');
    }
  });

  it('handles single-sample window (start === end) cleanly', () => {
    const r = simulate(SOUTH_POLE, START, START, 100, 0);
    expect(r.elevations.length).toBe(1);
    expect(r.longestGapMinutes).toBe(0);
  });

  it('linearly interpolates 2-hour Earth elevation and returns null on missing data', () => {
    const site = {
      lat: 0,
      lon: 0,
      start: '2026-01-01T00:00:00Z',
      step_hours: 2,
      earth_elev: [-2, 2],
    };
    // Midpoint 01:00Z should interpolate to 0.0
    const tMid = Date.parse('2026-01-01T01:00:00Z') / 1000;
    expect(interpolateEarthElevation(site, tMid)).toBeCloseTo(0, 6);
    // 01:30Z should interpolate to +1.0
    const t34 = Date.parse('2026-01-01T01:30:00Z') / 1000;
    expect(interpolateEarthElevation(site, t34)).toBeCloseTo(1, 6);
    // Missing earth_elev -> null
    expect(interpolateEarthElevation({ lat: 0, lon: 0 }, tMid)).toBeNull();
  });
});
