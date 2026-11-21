import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { R_MOON, satPositionMoonFixed } from '../satellite/satellite.js';
import { latLonToMoonFixed, localAzElToMoonFixed, moonFixedToThree } from './skyDomeMath.js';

/**
 * Moon Overview 3D (Three.js)
 *
 * Draws the Moon sphere (plain grey + procedural noise + lat/lon grid),
 * site marker, DirectionalLight from the Sun (showing real day/night terminator),
 * Earth at a fixed distance in its Moon-fixed direction, and the relay satellite
 * with its trail. Uses the same Moon-fixed frame as satellite.js (z = pole,
 * x = lon 0 on equator), mapped to Three.js with Moon z -> Three.js y.
 */

const MOON_R = 10;
const EARTH_DIST = 34;
const TRAIL_STEPS = 30;
const DEG = Math.PI / 180;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8b909a';
  ctx.fillRect(0, 0, 512, 256);

  const rand = mulberry32(2026);
  // Subtle procedural mare / crater shading
  for (let i = 0; i < 65; i++) {
    const x = rand() * 512;
    const y = rand() * 256;
    const r = 6 + rand() * 34;
    const dark = rand() > 0.45;
    ctx.fillStyle = dark ? 'rgba(65, 70, 80, 0.28)' : 'rgba(175, 180, 190, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 2500; i++) {
    const x = rand() * 512;
    const y = rand() * 256;
    const v = Math.floor(110 + rand() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v + 5},0.25)`;
    ctx.fillRect(x, y, 2, 2);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeLatLonGrid(radius) {
  const pts = [];
  // Latitude circles every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = 0; lon < 360; lon += 6) {
      const a = moonFixedToThree(latLonToMoonFixed(lat, lon, radius));
      const b = moonFixedToThree(latLonToMoonFixed(lat, lon + 6, radius));
      pts.push(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z));
    }
  }
  // Longitude meridians every 30°
  for (let lon = 0; lon < 360; lon += 30) {
    for (let lat = -90; lat < 90; lat += 6) {
      const a = moonFixedToThree(latLonToMoonFixed(lat, lon, radius));
      const b = moonFixedToThree(latLonToMoonFixed(lat + 6, lon, radius));
      pts.push(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x3f4c63, transparent: true, opacity: 0.4 });
  return { lines: new THREE.LineSegments(geo, mat), geo, mat };
}

export default function MoonOverview3D({
  site,
  timestamps,
  cursor,
  startIdx,
  satAltitude = 100,
  satStartAngle = 0,
  onWebGLError,
  heightClass = 'h-[360px]',
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

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

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 300);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = MOON_R * 1.4;
    controls.maxDistance = 85;

    const disposables = [];

    // Lighting: DirectionalLight from Sun shows real day/night terminator
    const ambient = new THREE.AmbientLight(0x283248, 0.25);
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xfff6e0, 2.5);
    scene.add(sunLight);

    // Moon sphere + lat/lon grid
    const moonTex = makeMoonTexture();
    const moonGeo = new THREE.SphereGeometry(MOON_R, 48, 36);
    const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 0.95, metalness: 0.02 });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moonMesh);
    disposables.push(moonTex, moonGeo, moonMat);

    const grid = makeLatLonGrid(MOON_R * 1.003);
    scene.add(grid.lines);
    disposables.push(grid.geo, grid.mat);

    // Site marker
    const siteGeo = new THREE.SphereGeometry(0.38, 16, 16);
    const siteMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const siteMesh = new THREE.Mesh(siteGeo, siteMat);
    scene.add(siteMesh);
    disposables.push(siteGeo, siteMat);

    // Earth indicator sphere at fixed distance
    const earthGeo = new THREE.SphereGeometry(1.5, 24, 24);
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x4169e1, roughness: 0.7 });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);
    disposables.push(earthGeo, earthMat);

    // Satellite + trail
    const satGeo = new THREE.SphereGeometry(0.35, 14, 14);
    const satMat = new THREE.MeshBasicMaterial({ color: 0xd8e0ee });
    const satMesh = new THREE.Mesh(satGeo, satMat);
    scene.add(satMesh);
    disposables.push(satGeo, satMat);

    const satTrailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
    const satTrailLine = new THREE.Line(new THREE.BufferGeometry(), satTrailMat);
    scene.add(satTrailLine);
    disposables.push(satTrailMat);

    sceneRef.current = {
      camera, controls, sunLight, siteMesh, earthMesh, satMesh, satTrailLine,
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

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('orientationchange', resizeNow);
      window.removeEventListener('resize', resizeNow);
      controls.dispose();
      satTrailLine.geometry.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [onWebGLError]);

  // Focus camera on the selected site whenever site changes
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !site) return;
    const siteM = latLonToMoonFixed(site.lat, site.lon, MOON_R * 1.015);
    const siteT = moonFixedToThree(siteM);
    refs.siteMesh.position.set(siteT.x, siteT.y, siteT.z);

    // Position camera looking directly at the site from 2.8 * MOON_R away
    const camM = latLonToMoonFixed(site.lat, site.lon, MOON_R * 2.9);
    const camT = moonFixedToThree(camM);
    refs.camera.position.set(camT.x, camT.y, camT.z);
    refs.controls.target.set(0, 0, 0);
    refs.controls.update();
  }, [site]);

  // Update Sun light (terminator), Earth direction, and Satellite + trail on time/orbit change
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !site || !timestamps) return;

    const sunM = localAzElToMoonFixed(site.lat, site.lon, site.sun_az[cursor], site.sun_elev[cursor]);
    const sunT = moonFixedToThree(sunM);
    refs.sunLight.position.set(sunT.x * 80, sunT.y * 80, sunT.z * 80);

    const earthM = localAzElToMoonFixed(site.lat, site.lon, site.earth_az[cursor], site.earth_elev[cursor]);
    const earthT = moonFixedToThree(earthM);
    refs.earthMesh.position.set(earthT.x * EARTH_DIST, earthT.y * EARTH_DIST, earthT.z * EARTH_DIST);

    // Satellite position & 30-step trail in the same Moon-fixed frame as satellite.js
    const t0 = new Date(timestamps[startIdx]).getTime() / 1000;
    const tCur = new Date(timestamps[cursor]).getTime() / 1000;
    const tRel = tCur - t0;
    const scale = MOON_R / R_MOON;
    const startRad = satStartAngle * DEG;

    const satM = satPositionMoonFixed(tRel, satAltitude, startRad);
    const satT = moonFixedToThree({ x: satM.x * scale, y: satM.y * scale, z: satM.z * scale });
    refs.satMesh.position.set(satT.x, satT.y, satT.z);

    const pts = [];
    const cols = [];
    for (let i = 0; i < TRAIL_STEPS; i++) {
      const dt = (i - (TRAIL_STEPS - 1)) * 120; // 2-min steps backward
      const pM = satPositionMoonFixed(tRel + dt, satAltitude, startRad);
      const pT = moonFixedToThree({ x: pM.x * scale, y: pM.y * scale, z: pM.z * scale });
      pts.push(pT.x, pT.y, pT.z);
      const f = 0.15 + 0.8 * (i / (TRAIL_STEPS - 1));
      cols.push(f * 0.8, f * 0.85, f);
    }
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    tGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    refs.satTrailLine.geometry.dispose();
    refs.satTrailLine.geometry = tGeo;
  }, [site, timestamps, cursor, startIdx, satAltitude, satStartAngle]);

  return (
    <div className={`relative w-full ${heightClass} rounded-lg overflow-hidden border border-gray-800 bg-[#040711]`}>
      <div ref={mountRef} className="w-full h-full" aria-label="3D Moon overview with terminator, site marker, Earth and relay satellite" />
    </div>
  );
}

