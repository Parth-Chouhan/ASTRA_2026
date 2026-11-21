import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { dir, azElTo3D, latLonToMoonFixed, localAzElToMoonFixed } from './skyDomeMath.js';

describe('dir(az, el) shared sky dome placement', () => {
  it('dir(0, 0) = (0, 0, -1) [North]', () => {
    const d = dir(0, 0);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(-1, 6);
  });

  it('dir(90, 0) = (1, 0, 0) [East]', () => {
    const d = dir(90, 0);
    expect(d.x).toBeCloseTo(1, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });

  it('dir(180, 0) = (0, 0, 1) [South]', () => {
    const d = dir(180, 0);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(1, 6);
  });

  it('dir(270, 0) = (-1, 0, 0) [West]', () => {
    const d = dir(270, 0);
    expect(d.x).toBeCloseTo(-1, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });

  it('dir(*, 90) = (0, 1, 0) [Zenith]', () => {
    for (const az of [0, 45, 90, 180, 270, 315]) {
      const d = dir(az, 90);
      expect(d.x).toBeCloseTo(0, 6);
      expect(d.y).toBeCloseTo(1, 6);
      expect(d.z).toBeCloseTo(0, 6);
    }
  });

  it('acceptance: Sun at az near 90 and el near 0 is over the E label', () => {
    const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data.json'), 'utf-8'));
    const apollo = data.sites.find((s) => s.id === 'apollo11');
    // Find timestamp where Sun is closest to az=90, el=0 (idx 2754: az=89.88°, el=-0.01°)
    let bestIdx = 0;
    let bestErr = Infinity;
    for (let i = 0; i < apollo.sun_elev.length; i++) {
      const err = Math.abs(apollo.sun_az[i] - 90) + Math.abs(apollo.sun_elev[i]);
      if (err < bestErr) { bestErr = err; bestIdx = i; }
    }
    const sunDir = dir(apollo.sun_az[bestIdx], apollo.sun_elev[bestIdx]);
    const eastLabelDir = dir(90, 0);
    expect(sunDir.x).toBeCloseTo(eastLabelDir.x, 2);
    expect(sunDir.y).toBeCloseTo(eastLabelDir.y, 2);
    expect(sunDir.z).toBeCloseTo(eastLabelDir.z, 2);
  });

  it('at apollo11 around 2026-01-01 12:00 the Sun is almost overhead', () => {
    const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data.json'), 'utf-8'));
    const apollo = data.sites.find((s) => s.id === 'apollo11');
    const p = azElTo3D(apollo.sun_az[6], apollo.sun_elev[6], 50);
    expect(p.y).toBeGreaterThan(49.5);
  });

  it('at south_pole the Sun and Earth stay near the horizon ring', () => {
    const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data.json'), 'utf-8'));
    const sp = data.sites.find((s) => s.id === 'south_pole');
    for (let i = 0; i < sp.sun_elev.length; i += 24) {
      const sun = azElTo3D(sp.sun_az[i], sp.sun_elev[i], 50);
      const earth = azElTo3D(sp.earth_az[i], sp.earth_elev[i], 50);
      expect(Math.abs(sun.y)).toBeLessThan(2);
      expect(Math.abs(earth.y)).toBeLessThan(7);
    }
  });
});

describe('localAzElToMoonFixed (Moon overview frame)', () => {
  it('at lat 0, lon 0: az 0, el 0 gives +z (0, 0, 1)', () => {
    const v = localAzElToMoonFixed(0, 0, 0, 0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(1, 6);
  });

  it('at any site: el 90 gives the site up vector', () => {
    for (const [lat, lon] of [[0, 0], [0.67416, 23.47314], [-89.9, 0]]) {
      const up = latLonToMoonFixed(lat, lon, 1);
      const v = localAzElToMoonFixed(lat, lon, 42, 90);
      expect(v.x).toBeCloseTo(up.x, 6);
      expect(v.y).toBeCloseTo(up.y, 6);
      expect(v.z).toBeCloseTo(up.z, 6);
    }
  });

  it('sanity: at apollo11 local noon Sun points at site and Earth is near (1, 0, 0)', () => {
    const data = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data.json'), 'utf-8'));
    const apollo = data.sites.find((s) => s.id === 'apollo11');
    const siteUp = latLonToMoonFixed(apollo.lat, apollo.lon, 1);
    const sunDir = localAzElToMoonFixed(apollo.lat, apollo.lon, apollo.sun_az[6], apollo.sun_elev[6]);
    const earthDir = localAzElToMoonFixed(apollo.lat, apollo.lon, apollo.earth_az[6], apollo.earth_elev[6]);
    const sunDot = sunDir.x * siteUp.x + sunDir.y * siteUp.y + sunDir.z * siteUp.z;
    expect(sunDot).toBeGreaterThan(0.99);  // Sun right overhead -> site lit
    expect(earthDir.x).toBeGreaterThan(0.95); // Earth near sub-Earth (+x) face
  });
});
