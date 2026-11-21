import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { dir, azElTo3D } from './skyDomeMath.js';

/**
 * 3D Sky Dome (Three.js) — Lander View
 *
 * Every placement uses the single shared function:
 *   dir(az, el) = (cos(el)*sin(az), sin(el), -cos(el)*cos(az))
 * Procedural graphics only (no external textures): seeded starfield that fades
 * near the Sun, procedural cratered ground disc with distance rings & radial
 * lines, horizon haze, DirectionalLight from Sun, Sun glow sprite, lit procedural
 * blue-and-white Earth showing its real phase, and satellite with 30-step trail.
 */

const DOME_R = 50;
const STAR_R = 180;
const EYE_Y = 1.6;
const SUN_COLOR = 0xffd700;
const EARTH_COLOR = 0x4169e1;
const SAT_COLOR = 0xc0c8d8;
const STAR_COUNT = 2200;
const TRAIL_LEN = 30;

/** Seeded PRNG (mulberry32) so stars & procedural craters never shift between renders. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLabelSprite(text, color = '#93b4dc', size = 4.8) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 96, 64);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 48, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size * 1.3, size, 1);
  return { sprite, texture, material };
}

function makeSunGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 245, 180, 1)');
  grad.addColorStop(0.25, 'rgba(255, 215, 0, 0.7)');
  grad.addColorStop(0.6, 'rgba(255, 180, 0, 0.18)');
  grad.addColorStop(1, 'rgba(255, 180, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b2234';
  ctx.fillRect(0, 0, 512, 512);

  const rand = mulberry32(42);
  // Subtle regolith grain
  for (let i = 0; i < 3500; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const v = Math.floor(24 + rand() * 28);
    ctx.fillStyle = `rgba(${v}, ${v + 6}, ${v + 16}, 0.35)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Gentle procedural craters
  for (let i = 0; i < 48; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 6 + rand() * 24;
    const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(12, 16, 26, 0.45)');
    grad.addColorStop(0.75, 'rgba(28, 36, 52, 0.25)');
    grad.addColorStop(0.92, 'rgba(130, 145, 175, 0.22)');
    grad.addColorStop(1, 'rgba(27, 34, 52, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e4ea8';
  ctx.fillRect(0, 0, 256, 128);

  const rand = mulberry32(77);
  // Procedural continents/landmasses
  for (let i = 0; i < 24; i++) {
    const x = rand() * 256;
    const y = 20 + rand() * 88;
    const rx = 10 + rand() * 24;
    const ry = 6 + rand() * 14;
    ctx.fillStyle = 'rgba(56, 130, 96, 0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Swirling white cloud bands
  for (let i = 0; i < 55; i++) {
    const x = rand() * 256;
    const y = rand() * 128;
    const rx = 12 + rand() * 32;
    const ry = 2 + rand() * 7;
    ctx.fillStyle = `rgba(240, 248, 255, ${0.25 + rand() * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function makeElevationRing(elDeg, radius, color, opacity = 1, segments = 96) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const az = (i / segments) * 360;
    const p = azElTo3D(az, elDeg, radius);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return { line: new THREE.Line(geo, mat), geo, mat };
}

function buildTrackGeometry(azArr, elArr, startIdx, endIdx) {
  const pts = [];
  for (let i = startIdx; i < endIdx; i++) {
    const p = azElTo3D(azArr[i], elArr[i], DOME_R);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function headingToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const norm = ((deg % 360) + 360) % 360;
  return `${Math.round(norm)}° ${dirs[Math.round(norm / 45) % 8]}`;
}

export default function SkyDome3D({
  site,
  startIdx,
  endIdx,
  cursor,
  satResult,
  satIdx,
  satEl,
  satAz,
  onWebGLError,
  heightClass = 'h-[360px]',
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [showAxes, setShowAxes] = useState(false);
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (err) {
      onWebGLError?.(err?.message || 'WebGL failed to initialize');
      return;
    }

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 360;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040711);

    // Perspective camera (FOV 70) at origin looking north (-z)
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 400);
    camera.position.set(0, EYE_Y, 0.01);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, EYE_Y, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.01;
    controls.maxDistance = 18;
    controls.minPolarAngle = Math.PI / 2 - 0.12;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.update();

    const disposables = [];

    // Lighting: DirectionalLight from Sun + subtle ambient light
    const ambient = new THREE.AmbientLight(0x3a4a6b, 0.45);
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xfff6dc, 2.2);
    scene.add(sunLight);

    // Seeded starfield on a sphere
    const rand = mulberry32(1337);
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starBaseBright = new Float32Array(STAR_COUNT);
    const starColors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = rand();
      const v = rand();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const sx = STAR_R * Math.sin(phi) * Math.cos(theta);
      const sy = STAR_R * Math.cos(phi);
      const sz = STAR_R * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3] = sx;
      starPositions[i * 3 + 1] = sy;
      starPositions[i * 3 + 2] = sz;
      const b = 0.45 + rand() * 0.55;
      starBaseBright[i] = b;
      starColors[i * 3] = b;
      starColors[i * 3 + 1] = b;
      starColors[i * 3 + 2] = Math.min(1, b * 1.08);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 1.15, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    disposables.push(starGeo, starMat);

    // Ground disc with procedural crater texture + perspective cues
    const groundTex = makeGroundTexture();
    const groundGeo = new THREE.CircleGeometry(DOME_R, 72);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    disposables.push(groundTex, groundGeo, groundMat);

    // Concentric distance rings on ground
    for (const r of [10, 20, 30, 40]) {
      const ring = makeElevationRing(0, r, 0x2a3b59, 0.45, 72);
      ring.line.position.y = 0.02;
      scene.add(ring.line);
      disposables.push(ring.geo, ring.mat);
    }
    // Radial perspective lines every 30°
    const radialPts = [];
    for (let az = 0; az < 360; az += 30) {
      const d = dir(az, 0);
      radialPts.push(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(d.x * DOME_R, 0.02, d.z * DOME_R));
    }
    const radialGeo = new THREE.BufferGeometry().setFromPoints(radialPts);
    const radialMat = new THREE.LineBasicMaterial({ color: 0x263652, transparent: true, opacity: 0.45 });
    scene.add(new THREE.LineSegments(radialGeo, radialMat));
    disposables.push(radialGeo, radialMat);

    // Soft horizon haze cylinder
    const hazeGeo = new THREE.CylinderGeometry(DOME_R * 1.01, DOME_R * 1.01, 5, 64, 1, true);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0x3b6399,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.position.y = 2.2;
    scene.add(haze);
    disposables.push(hazeGeo, hazeMat);

    // Horizon ring + 30° & 60° elevation rings with degree labels
    const horizonRing = makeElevationRing(0, DOME_R, 0x4b6fa0, 1);
    scene.add(horizonRing.line);
    disposables.push(horizonRing.geo, horizonRing.mat);

    for (const el of [30, 60]) {
      const ring = makeElevationRing(el, DOME_R, 0x263c60, 0.55);
      scene.add(ring.line);
      disposables.push(ring.geo, ring.mat);

      const { sprite, texture, material } = makeLabelSprite(`${el}°`, '#5d7fb0', 3.4);
      const p = azElTo3D(0, el, DOME_R * 0.96);
      sprite.position.set(p.x, p.y, p.z);
      scene.add(sprite);
      disposables.push(texture, material);
    }

    // N / E / S / W cardinal labels placed via shared dir(az, el)
    for (const c of [{ label: 'N', az: 0 }, { label: 'E', az: 90 }, { label: 'S', az: 180 }, { label: 'W', az: 270 }]) {
      const { sprite, texture, material } = makeLabelSprite(c.label, '#93b4dc', 5);
      const d = dir(c.az, 3);
      sprite.position.set(d.x * DOME_R * 0.95, d.y * DOME_R * 0.95, d.z * DOME_R * 0.95);
      scene.add(sprite);
      disposables.push(texture, material);
    }

    // Debug axes helper
    const axesHelper = new THREE.AxesHelper(15);
    axesHelper.position.set(0, 0.05, 0);
    axesHelper.visible = false;
    scene.add(axesHelper);

    // Sun disc + additive radial glow sprite
    const sunGeo = new THREE.SphereGeometry(2.1, 24, 24);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 1 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sunMesh);
    disposables.push(sunGeo, sunMat);

    const glowTex = makeSunGlowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: SUN_COLOR,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sunGlow = new THREE.Sprite(glowMat);
    sunGlow.scale.set(13, 13, 1);
    scene.add(sunGlow);
    disposables.push(glowTex, glowMat);

    // Earth: lit sphere with procedural blue-and-white texture (shows real phase from Sun DirectionalLight)
    const earthTex = makeEarthTexture();
    const earthGeo = new THREE.SphereGeometry(2.0, 28, 28);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 1,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);
    disposables.push(earthTex, earthGeo, earthMat);

    // Satellite body + fading trail
    const satGeo = new THREE.SphereGeometry(0.95, 16, 16);
    const satMat = new THREE.MeshBasicMaterial({ color: SAT_COLOR, transparent: true, opacity: 1 });
    const satMesh = new THREE.Mesh(satGeo, satMat);
    scene.add(satMesh);
    disposables.push(satGeo, satMat);

    const satTrailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const satTrailLine = new THREE.Line(new THREE.BufferGeometry(), satTrailMat);
    scene.add(satTrailLine);
    disposables.push(satTrailMat);

    // Sun & Earth window track lines
    const sunTrackMat = new THREE.LineBasicMaterial({ color: SUN_COLOR, transparent: true, opacity: 0.22 });
    const sunTrackLine = new THREE.Line(new THREE.BufferGeometry(), sunTrackMat);
    scene.add(sunTrackLine);

    const earthTrackMat = new THREE.LineBasicMaterial({ color: EARTH_COLOR, transparent: true, opacity: 0.22 });
    const earthTrackLine = new THREE.Line(new THREE.BufferGeometry(), earthTrackMat);
    scene.add(earthTrackLine);
    disposables.push(sunTrackMat, earthTrackMat);

    sceneRef.current = {
      sunMesh, sunMat, sunGlow, glowMat, sunLight,
      earthMesh, earthMat,
      satMesh, satMat, satTrailLine,
      sunTrackLine, earthTrackLine,
      axesHelper,
      starGeo, starPositions, starBaseBright,
    };

    const resizeNow = () => {
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resizeNow);
    ro.observe(container);
    window.addEventListener('orientationchange', resizeNow);
    window.addEventListener('resize', resizeNow);

    const lookVec = new THREE.Vector3();
    let lastHeading = -1;
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      camera.getWorldDirection(lookVec);
      const az = Math.round(((Math.atan2(lookVec.x, -lookVec.z) * 180) / Math.PI + 360) % 360);
      if (az !== lastHeading) {
        lastHeading = az;
        setHeading(az);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('orientationchange', resizeNow);
      window.removeEventListener('resize', resizeNow);
      controls.dispose();
      axesHelper.dispose();
      sunTrackLine.geometry.dispose();
      earthTrackLine.geometry.dispose();
      satTrailLine.geometry.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [onWebGLError]);

  useEffect(() => {
    if (sceneRef.current?.axesHelper) {
      sceneRef.current.axesHelper.visible = showAxes;
    }
  }, [showAxes]);

  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !site) return;

    const newSunGeo = buildTrackGeometry(site.sun_az, site.sun_elev, startIdx, endIdx);
    refs.sunTrackLine.geometry.dispose();
    refs.sunTrackLine.geometry = newSunGeo;

    const newEarthGeo = buildTrackGeometry(site.earth_az, site.earth_elev, startIdx, endIdx);
    refs.earthTrackLine.geometry.dispose();
    refs.earthTrackLine.geometry = newEarthGeo;
  }, [site, startIdx, endIdx]);

  // Update Sun, Earth, Satellite, Lighting, Star fading, and Satellite Trail
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !site) return;

    const sEl = site.sun_elev[cursor];
    const sDir = dir(site.sun_az[cursor], sEl);
    const sPos = { x: sDir.x * DOME_R, y: sDir.y * DOME_R, z: sDir.z * DOME_R };
    refs.sunMesh.position.set(sPos.x, sPos.y, sPos.z);
    refs.sunGlow.position.set(sPos.x, sPos.y, sPos.z);
    refs.sunMat.opacity = sEl > 0 ? 1.0 : 0.22;
    refs.glowMat.opacity = sEl > 0 ? 0.9 : 0.12;

    // DirectionalLight shines from Sun direction
    refs.sunLight.position.set(sDir.x * 120, sDir.y * 120, sDir.z * 120);
    refs.sunLight.intensity = sEl > 0 ? 2.2 : 0.35;

    // Fade stars near the Sun
    const colorAttr = refs.starGeo.getAttribute('color');
    const pos = refs.starPositions;
    const base = refs.starBaseBright;
    for (let i = 0; i < STAR_COUNT; i++) {
      const dot = (pos[i * 3] * sDir.x + pos[i * 3 + 1] * sDir.y + pos[i * 3 + 2] * sDir.z) / STAR_R;
      const fade = sEl > 0 && dot > 0.85 ? Math.max(0.05, 1 - (dot - 0.85) / 0.15) : 1.0;
      const b = base[i] * fade;
      colorAttr.setXYZ(i, b, b, Math.min(1, b * 1.08));
    }
    colorAttr.needsUpdate = true;

    // Earth position
    const eEl = site.earth_elev[cursor];
    const ePos = azElTo3D(site.earth_az[cursor], eEl, DOME_R);
    refs.earthMesh.position.set(ePos.x, ePos.y, ePos.z);
    refs.earthMat.opacity = eEl > 0 ? 1.0 : 0.22;

    // Satellite position + 30-step fading trail
    if (satEl != null && satAz != null) {
      refs.satMesh.visible = true;
      const satPos = azElTo3D(satAz, satEl, DOME_R);
      refs.satMesh.position.set(satPos.x, satPos.y, satPos.z);
      refs.satMat.opacity = satEl > 0 ? 0.95 : 0.22;

      if (satResult && satIdx != null) {
        const trailStart = Math.max(0, satIdx - TRAIL_LEN + 1);
        const pts = [];
        const cols = [];
        const len = satIdx - trailStart + 1;
        for (let i = trailStart; i <= satIdx; i++) {
          const p = azElTo3D(satResult.azimuths[i], satResult.elevations[i], DOME_R);
          pts.push(p.x, p.y, p.z);
          const t = len > 1 ? (i - trailStart) / (len - 1) : 1;
          const v = 0.15 + 0.7 * t;
          cols.push(v * 0.75, v * 0.8, v * 0.9);
        }
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        tGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        refs.satTrailLine.geometry.dispose();
        refs.satTrailLine.geometry = tGeo;
        refs.satTrailLine.visible = true;
      }
    } else {
      refs.satMesh.visible = false;
      refs.satTrailLine.visible = false;
    }
  }, [site, cursor, satResult, satIdx, satEl, satAz]);

  return (
    <div className={`relative w-full ${heightClass} rounded-lg overflow-hidden border border-gray-800 bg-[#040711]`}>
      <div ref={mountRef} className="w-full h-full" aria-label="3D interactive lunar sky dome" />
      <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-auto">
        <span className="text-[11px] font-mono bg-[#0b1222]/80 border border-gray-700/80 text-blue-200 px-2 py-0.5 rounded">
          Looking: {headingToCompass(heading)}
        </span>
        <button
          onClick={() => setShowAxes((v) => !v)}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
            showAxes
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-[#0b1222]/80 border-gray-700/80 text-gray-400 hover:text-white'
          }`}
        >
          {showAxes ? 'Hide axes' : 'Axes'}
        </button>
      </div>
    </div>
  );
}
