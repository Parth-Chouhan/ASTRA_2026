import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * LanderSimulation3D — Full-screen 3D lunar lander descent simulation.
 *
 * Uses real NASA/Solar System Scope moon texture with procedural fallback.
 * Renders mission-accurate data from the config page.
 *
 * Features:
 *  - Real moon texture (2K) with procedural fallback
 *  - Detailed terrain with craters, boulders, regolith
 *  - Sun/Earth positioned from actual ephemeris data
 *  - 4-phase landing: Rough Braking → Fine Braking → Terminal Descent → Touchdown
 *  - Dust particle effects on landing
 *  - 5 camera modes with cinematic default
 *  - Full mission-aware HUD
 */

const MOON_R = 100;
const PHASES = [
  { n: 'IDLE', d: 'Awaiting ignition — Pre-descent orbit' },
  { n: 'ROUGH BRAKING', d: '15 km → 7 km — Main engine burn' },
  { n: 'FINE BRAKING', d: '7 km → 2 km — Precision approach' },
  { n: 'TERMINAL DESCENT', d: '2 km → 100 m — Hazard avoidance' },
  { n: 'TOUCHDOWN', d: 'Final approach — 100 m to surface' },
  { n: 'LANDED', d: 'Touchdown confirmed ✓ — Systems nominal' },
];
const CAM_NAMES = ['Cinematic', 'Chase', 'Side', 'Ground', 'Cockpit', 'Free Orbit'];
const SPEEDS = [1, 2, 5, 10, 0.5];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Procedural Moon Texture (fallback) ───

function makeMoonTexture() {
  const W = 4096, H = 2048;
  const C = document.createElement('canvas'); C.width = W; C.height = H;
  const ctx = C.getContext('2d');
  const rng = mulberry32(2026);

  // Base highland gray with subtle warm tint variation
  const imgData = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const lat = (y / H - 0.5) * Math.PI;
      const poleWhite = Math.pow(Math.abs(Math.sin(lat)), 8) * 15;
      const base = 125 + (rng() - 0.5) * 25 + poleWhite;
      imgData.data[idx] = base + 3;
      imgData.data[idx + 1] = base + 2;
      imgData.data[idx + 2] = base - 2;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Mare (dark basalt) regions — approximate positions matching real Moon
  const mareRegions = [
    [0.19, 0.46, 0.09, 0.12, 0.45], // Oceanus Procellarum W
    [0.27, 0.42, 0.07, 0.09, 0.4],  // Oceanus Procellarum E
    [0.30, 0.52, 0.035, 0.04, 0.35],// Mare Humorum
    [0.37, 0.36, 0.08, 0.07, 0.5],  // Mare Imbrium
    [0.47, 0.42, 0.045, 0.04, 0.4], // Sinus Aestuum
    [0.52, 0.36, 0.045, 0.045, 0.45],// Mare Serenitatis
    [0.57, 0.43, 0.055, 0.05, 0.42],// Mare Tranquillitatis
    [0.62, 0.46, 0.04, 0.045, 0.35],// Mare Fecunditatis
    [0.56, 0.50, 0.025, 0.025, 0.4],// Mare Nectaris
    [0.44, 0.27, 0.13, 0.025, 0.3], // Mare Frigoris
    [0.60, 0.37, 0.025, 0.02, 0.35],// Lacus Somniorum
    [0.44, 0.40, 0.035, 0.03, 0.4], // Mare Vaporum
    [0.42, 0.46, 0.015, 0.015, 0.35],// Sinus Medii
    [0.50, 0.44, 0.03, 0.025, 0.35],// Sinus Asperitatis
    [0.69, 0.48, 0.035, 0.05, 0.3], // Mare Crisium
    [0.65, 0.42, 0.015, 0.02, 0.3], // Mare Marginis
  ];
  for (const [cx, cy, rx, ry, a] of mareRegions) {
    const grd = ctx.createRadialGradient(cx * W, cy * H, 0, cx * W, cy * H, Math.max(rx * W, ry * H));
    grd.addColorStop(0, `rgba(42,42,50,${a})`);
    grd.addColorStop(0.6, `rgba(48,48,56,${a * 0.7})`);
    grd.addColorStop(1, 'rgba(50,50,58,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(cx * W, cy * H, rx * W, ry * H, (rng() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Giant craters with ray systems (like Tycho, Copernicus)
  const rayCraters = [
    { x: 0.35, y: 0.72, r: 25, rays: 12, rayLen: 200 }, // Tycho-like
    { x: 0.38, y: 0.40, r: 20, rays: 8, rayLen: 100 },  // Copernicus-like
    { x: 0.52, y: 0.57, r: 15, rays: 6, rayLen: 70 },   // Kepler-like
  ];
  for (const cr of rayCraters) {
    // Ray system
    for (let i = 0; i < cr.rays; i++) {
      const angle = (i / cr.rays) * Math.PI * 2 + rng() * 0.3;
      const len = cr.rayLen * (0.5 + rng() * 0.5);
      ctx.beginPath();
      ctx.moveTo(cr.x * W, cr.y * H);
      const ex = cr.x * W + Math.cos(angle) * len;
      const ey = cr.y * H + Math.sin(angle) * len;
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(165,165,170,${0.06 + rng() * 0.08})`;
      ctx.lineWidth = 2 + rng() * 5;
      ctx.stroke();
    }
    // Crater
    ctx.beginPath();
    ctx.arc(cr.x * W, cr.y * H, cr.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(60,60,68,0.4)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cr.x * W + 2, cr.y * H + 2, cr.r * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(175,175,180,0.3)`;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Central peak
    ctx.beginPath();
    ctx.arc(cr.x * W, cr.y * H, cr.r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(155,155,160,0.4)`;
    ctx.fill();
  }

  // Large craters
  for (let i = 0; i < 50; i++) {
    const cx = rng() * W, cy = rng() * H, r = 15 + rng() * 50;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(65,65,70,${0.15 + rng() * 0.25})`; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 2, cy + 2, r * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(170,170,175,${0.12 + rng() * 0.18})`;
    ctx.lineWidth = 2 + rng() * 3; ctx.stroke();
    if (r > 30 && rng() > 0.5) {
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(145,145,150,0.3)`; ctx.fill();
    }
  }

  // Medium craters
  for (let i = 0; i < 300; i++) {
    const cx = rng() * W, cy = rng() * H, r = 3 + rng() * 15;
    const b = 90 + rng() * 45;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${b + 8},${b + 8},${b + 4})`; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 1, cy + 1, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${b - 15},${b - 15},${b - 18})`; ctx.fill();
  }

  // Small craters (thousands)
  for (let i = 0; i < 1200; i++) {
    const cx = rng() * W, cy = rng() * H, r = 0.8 + rng() * 4;
    const b = 100 + rng() * 50;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${b + 10},${b + 10},${b + 6})`; ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 0.4, cy + 0.4, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${b - 10},${b - 10},${b - 12})`; ctx.fill();
  }

  // Final noise overlay for regolith texture
  const id2 = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < id2.data.length; i += 4) {
    const n = (rng() - 0.5) * 10;
    id2.data[i] = Math.max(0, Math.min(255, id2.data[i] + n));
    id2.data[i + 1] = Math.max(0, Math.min(255, id2.data[i + 1] + n));
    id2.data[i + 2] = Math.max(0, Math.min(255, id2.data[i + 2] + n));
  }
  ctx.putImageData(id2, 0, 0);
  return new THREE.CanvasTexture(C);
}

function makeBumpTexture() {
  const W = 4096, H = 2048;
  const B = document.createElement('canvas'); B.width = W; B.height = H;
  const bx = B.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, W, H);
  const rng = mulberry32(99);
  // Large elevation features
  for (let i = 0; i < 60; i++) {
    const cx = rng() * W, cy = rng() * H, r = 20 + rng() * 80;
    const gr = bx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(0,0,0,${rng() * 0.4})`);
    gr.addColorStop(0.5, `rgba(190,190,190,${rng() * 0.3})`);
    gr.addColorStop(1, 'rgba(128,128,128,0)');
    bx.fillStyle = gr; bx.beginPath(); bx.arc(cx, cy, r, 0, Math.PI * 2); bx.fill();
  }
  // Medium bumps
  for (let i = 0; i < 400; i++) {
    const cx = rng() * W, cy = rng() * H, r = 3 + rng() * 18;
    const gr = bx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${rng() > 0.5 ? 0 : 200},${rng() > 0.5 ? 0 : 200},${rng() > 0.5 ? 0 : 200},${rng() * 0.35})`);
    gr.addColorStop(1, 'rgba(128,128,128,0)');
    bx.fillStyle = gr; bx.beginPath(); bx.arc(cx, cy, r, 0, Math.PI * 2); bx.fill();
  }
  // Fine grain noise
  const id = bx.getImageData(0, 0, W, H);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (rng() - 0.5) * 20;
    const v = Math.max(0, Math.min(255, id.data[i] + n));
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
  }
  bx.putImageData(id, 0, 0);
  return new THREE.CanvasTexture(B);
}

function makeEarthTexture() {
  const C = document.createElement('canvas'); C.width = 1024; C.height = 512;
  const x = C.getContext('2d');
  // Ocean gradient
  const bg = x.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#1a3d6b'); bg.addColorStop(0.5, '#1a4a7a'); bg.addColorStop(1, '#1a3d6b');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 512);
  // Continents with more detail
  x.fillStyle = '#2d7a3a';
  [[550, 240, 55, 95], [600, 150, 140, 45], [250, 180, 38, 110], [280, 310, 45, 55], [820, 320, 32, 22], [180, 240, 25, 70], [750, 300, 40, 35], [900, 350, 25, 40]].forEach(([cx, cy, rx, ry]) => {
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
  });
  x.fillStyle = '#3a8a4a';
  x.beginPath(); x.moveTo(650, 200); x.lineTo(670, 260); x.lineTo(635, 260); x.closePath(); x.fill();
  // Ice caps
  x.fillStyle = '#ddeeff'; x.fillRect(0, 0, 1024, 20); x.fillRect(0, 492, 1024, 20);
  // Clouds
  x.fillStyle = 'rgba(255,255,255,0.18)';
  const rng = mulberry32(55);
  for (let i = 0; i < 50; i++) {
    x.beginPath(); x.ellipse(rng() * 1024, rng() * 512, 15 + rng() * 90, 3 + rng() * 10, rng() * Math.PI, 0, Math.PI * 2); x.fill();
  }
  return new THREE.CanvasTexture(C);
}

// ─── Three.js Scene Builders ───

function buildStars(scene) {
  const N = 15000;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
  const rng = mulberry32(1337);
  for (let i = 0; i < N; i++) {
    const r = 5000 + rng() * 40000;
    const th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    const t = rng();
    const c = t < 0.25 ? [0.82, 0.88, 1] : t < 0.5 ? [1, 1, 0.95] : t < 0.75 ? [1, 0.9, 0.72] : [1, 0.65, 0.45];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    sz[i] = 0.4 + rng() * 2.5;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float size; attribute vec3 color;
      varying vec3 vc; uniform float time;
      void main(){
        vc=color;
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize=size*(0.7+0.3*sin(time*1.2+position.x*0.003+position.y*0.004))*(200./-mv.z);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      varying vec3 vc;
      void main(){
        float d=length(gl_PointCoord-vec2(.5));
        if(d>.5)discard;
        float a=1.-smoothstep(0.,.5,d);
        gl_FragColor=vec4(vc,a*0.9);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  scene.add(pts);
  return { points: pts, material: m, geometry: g };
}

function buildMoon(scene) {
  // Try loading real moon texture, fall back to procedural
  const geo = new THREE.SphereGeometry(MOON_R, 192, 192);
  const bumpTex = makeBumpTexture();
  const proceduralTex = makeMoonTexture();

  const mat = new THREE.MeshStandardMaterial({
    map: proceduralTex,
    bumpMap: bumpTex,
    bumpScale: 2.0,
    roughness: 0.95,
    metalness: 0,
    color: 0xc8c8c8,
  });

  // Attempt to load real NASA texture
  const loader = new THREE.TextureLoader();
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  loader.load(
    `${base}moon_texture.jpg`,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    },
    undefined,
    () => { /* Keep procedural fallback */ }
  );

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // ─ Surface Detail: Craters near landing zone ─
  const rng = mulberry32(42);
  const craterMat = new THREE.MeshStandardMaterial({
    color: 0x666666, roughness: 1, metalness: 0, transparent: true, opacity: 0.6,
  });
  for (let i = 0; i < 15; i++) {
    const a = rng() * Math.PI * 2, d = 5 + rng() * 40;
    const cr = 1 + rng() * 4;
    const craterRing = new THREE.Mesh(new THREE.RingGeometry(cr * 0.7, cr, 24), craterMat);
    craterRing.position.set(Math.cos(a) * d, MOON_R + 0.03, Math.sin(a) * d);
    craterRing.rotation.x = -Math.PI / 2;
    scene.add(craterRing);
  }

  // ─ Rocks with varied shapes ─
  const rockColors = [0x666666, 0x777777, 0x888888, 0x5a5a5a, 0x707070];
  for (let i = 0; i < 250; i++) {
    const a = rng() * Math.PI * 2, d = 1.5 + rng() * 50;
    const s = 0.05 + rng() * 0.8;
    const shapeIdx = Math.floor(rng() * 3);
    const rockGeo = shapeIdx === 0
      ? new THREE.DodecahedronGeometry(s, 0)
      : shapeIdx === 1
        ? new THREE.IcosahedronGeometry(s, 0)
        : new THREE.OctahedronGeometry(s, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: rockColors[Math.floor(rng() * rockColors.length)],
      roughness: 0.9 + rng() * 0.1, metalness: 0,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(Math.cos(a) * d, MOON_R + s * 0.25, Math.sin(a) * d);
    rock.rotation.set(rng() * 4, rng() * 4, rng() * 2);
    rock.scale.set(1, 0.5 + rng() * 0.8, 1 + rng() * 0.5);
    rock.castShadow = true;
    scene.add(rock);
  }

  // ─ Boulder clusters ─
  for (let c = 0; c < 8; c++) {
    const ca = rng() * Math.PI * 2, cd = 10 + rng() * 35;
    for (let b = 0; b < 4 + Math.floor(rng() * 5); b++) {
      const ba = ca + (rng() - 0.5) * 0.5, bd = cd + (rng() - 0.5) * 3;
      const bs = 0.3 + rng() * 1.2;
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(bs, 1),
        new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 1, metalness: 0 })
      );
      boulder.position.set(Math.cos(ba) * bd, MOON_R + bs * 0.3, Math.sin(ba) * bd);
      boulder.rotation.set(rng() * 3, rng() * 3, 0);
      boulder.scale.set(1, 0.4 + rng() * 0.4, 1);
      boulder.castShadow = true;
      scene.add(boulder);
    }
  }

  // Landing marker — animated glow ring
  const ringGeo = new THREE.RingGeometry(2.8, 3.1, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x40e090, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = MOON_R + 0.05; ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  // Inner ring
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 48),
    new THREE.MeshBasicMaterial({ color: 0x40e090, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
  ring2.position.y = MOON_R + 0.04; ring2.rotation.x = -Math.PI / 2;
  scene.add(ring2);
  // Cross bars
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 3.2), ringMat);
    bar.position.y = MOON_R + 0.06; bar.rotation.y = i * Math.PI / 4;
    scene.add(bar);
  }

  return { mesh, geo, mat, ring, ring2 };
}

function buildSun(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff8e0 })
  );
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vN;void main(){float i=pow(.55-dot(vN,vec3(0,0,1)),2.);gl_FragColor=vec4(1.,.95,.7,i*.4);}`,
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  mesh.add(new THREE.Mesh(new THREE.SphereGeometry(130, 32, 32), glowMat));
  scene.add(mesh);
  return mesh;
}

function buildEarth(scene) {
  const group = new THREE.Group();
  const tex = makeEarthTexture();
  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(22, 64, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 })
  );
  group.add(earthMesh);
  const atmosMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vN;void main(){float i=pow(.62-dot(vN,vec3(0,0,1)),2.5);gl_FragColor=vec4(.3,.55,1.,i*.6);}`,
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(23.5, 64, 64), atmosMat));
  scene.add(group);
  return { group, earthMesh };
}

function buildLander(scene) {
  const landerGroup = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.35, metalness: 0.65 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x162d55, roughness: 0.2, metalness: 0.3 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), gold);
  body.position.y = 2.5; body.castShadow = true;
  landerGroup.add(body);

  // Gold foil panels
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 2.25),
      new THREE.MeshStandardMaterial({ color: 0xddaa22, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide }));
    const a = i * Math.PI / 2;
    p.position.set(Math.cos(a) * 1.52, 2.5, Math.sin(a) * 1.52);
    p.rotation.y = a + Math.PI / 2;
    landerGroup.add(p);
  }

  // Top platform
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.3, 8), grey);
  top.position.y = 3.95; top.castShadow = true;
  landerGroup.add(top);

  // Solar panels (wider)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), dark);
    arm.rotation.z = Math.PI / 2; arm.position.set(side * 2.4, 3.8, 0);
    landerGroup.add(arm);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 2.0), blue);
    pan.position.set(side * 4.5, 3.8, 0); pan.castShadow = true;
    landerGroup.add(pan);
    for (let g = 0; g < 5; g++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.07, 0.015), dark);
      l.position.set(side * 4.5, 3.84, -0.7 + g * 0.35); landerGroup.add(l);
    }
    for (let g = 0; g < 7; g++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 2.0), dark);
      l.position.set(side * 4.5 - 1.5 + g * 0.5, 3.84, 0); landerGroup.add(l);
    }
  }

  // 4 Legs with cross braces
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), grey);
    strut.position.set(Math.cos(a) * 2.2, 1, Math.sin(a) * 2.2);
    strut.rotation.z = Math.cos(a) * 0.38; strut.rotation.x = -Math.sin(a) * 0.38;
    strut.castShadow = true; landerGroup.add(strut);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 12), grey);
    foot.position.set(Math.cos(a) * 3.2, -0.4, Math.sin(a) * 3.2);
    foot.castShadow = true; landerGroup.add(foot);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    brace.position.set(Math.cos(a) * 2.6, 1.8, Math.sin(a) * 2.6);
    brace.rotation.z = Math.cos(a) * 0.55; brace.rotation.x = -Math.sin(a) * 0.55;
    landerGroup.add(brace);
    // Cross brace
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x777777 }));
    cross.position.set(Math.cos(a) * 2.4, 0.6, Math.sin(a) * 2.4);
    cross.rotation.z = Math.cos(a) * 0.9; cross.rotation.x = -Math.sin(a) * 0.9;
    landerGroup.add(cross);
  }

  // Nozzle
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.25, metalness: 0.85, side: THREE.DoubleSide }));
  nozzle.position.y = 0.3; nozzle.rotation.x = Math.PI; landerGroup.add(nozzle);
  // Nozzle interior glow ring
  const nozzleRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 16),
    new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
  nozzleRing.position.y = -0.2; nozzleRing.rotation.x = Math.PI / 2;
  landerGroup.add(nozzleRing);

  // Antenna + dish
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
  ant.position.set(0.4, 5, 0.4); landerGroup.add(ant);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
  dish.position.set(0.4, 5.9, 0.4); dish.rotation.x = Math.PI; landerGroup.add(dish);

  // Cameras
  const camM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.5 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.4), camM);
  c1.position.set(1.52, 2.5, 0); landerGroup.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.4), camM);
  c2.position.set(0, 2.5, 1.52); landerGroup.add(c2);

  // Science instruments on top
  const inst1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.3 }));
  inst1.position.set(-0.5, 4.3, -0.5); landerGroup.add(inst1);
  const inst2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4 }));
  inst2.position.set(0.6, 4.4, -0.4); landerGroup.add(inst2);

  landerGroup.scale.setScalar(0.6);
  scene.add(landerGroup);
  return landerGroup;
}

function makeThruster() {
  const N = 400;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), sz = new Float32Array(N);
  const vels = [], lives = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
    sz[i] = 0.4 + Math.random() * 3;
    vels.push(new THREE.Vector3((Math.random() - 0.5) * 2.5, -(5 + Math.random() * 10), (Math.random() - 0.5) * 2.5));
    lives.push(Math.random());
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute float size;varying float vY;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*(100./-mv.z);gl_Position=projectionMatrix*mv;vY=position.y;}`,
    fragmentShader: `varying float vY;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float a=1.-smoothstep(0.,.5,d);float life=clamp(vY/-8.,0.,1.);vec3 col=mix(vec3(1.,.97,.9),mix(vec3(1.,.7,.15),vec3(1.,.3,.02),life),life);a*=(1.-life)*.9;gl_FragColor=vec4(col,a);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.userData = { vels, lives };
  return pts;
}

function makeDustSystem() {
  const N = 600;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), sz = new Float32Array(N);
  const vels = [], lives = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
    sz[i] = 0.3 + Math.random() * 2;
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 6;
    vels.push(new THREE.Vector3(Math.cos(a) * spd, 0.5 + Math.random() * 2, Math.sin(a) * spd));
    lives.push(-1);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute float size;varying float vLife;uniform float uScale;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*uScale*(80./-mv.z);gl_Position=projectionMatrix*mv;vLife=position.y;}`,
    fragmentShader: `varying float vLife;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float a=(1.-smoothstep(0.,.5,d))*.5;gl_FragColor=vec4(.75,.73,.7,a);}`,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uScale: { value: 1.0 } },
  });
  const pts = new THREE.Points(g, m);
  pts.userData = { vels, lives, active: false };
  pts.visible = false;
  return pts;
}

// ─── Positioning helpers ───

function positionCelestialBody(mesh, elevDeg, azDeg, distance) {
  const e = THREE.MathUtils.degToRad(elevDeg);
  const a = THREE.MathUtils.degToRad(azDeg);
  mesh.position.set(
    distance * Math.cos(e) * Math.cos(a),
    distance * Math.sin(e) + MOON_R,
    distance * Math.cos(e) * Math.sin(a)
  );
}

function getSunElevFromConfig(missionConfig) {
  if (missionConfig?.landingSunElev != null && typeof missionConfig.landingSunElev === 'number') {
    return missionConfig.landingSunElev;
  }
  return 32; // Default day
}

function getEarthElevFromConfig(missionConfig) {
  if (missionConfig?.landingEarthElev != null && typeof missionConfig.landingEarthElev === 'number') {
    return missionConfig.landingEarthElev;
  }
  return 45;
}

function getTodFromElev(sunElev) {
  if (sunElev > 10) return 0;  // Day
  if (sunElev > 0) return 1;   // Twilight
  return 2;                     // Night
}

// ═══════════════════════════════════════
//  WEB AUDIO SYNTHESIZER
// ═══════════════════════════════════════

let audioCtx = null;
let engineOscNode = null;
let engineGainNode = null;

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sawtooth'; osc1.frequency.value = 55;
    osc2.type = 'sawtooth'; osc2.frequency.value = 58;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 220;
    engineGainNode = audioCtx.createGain();
    engineGainNode.gain.value = 0;
    osc1.connect(filter); osc2.connect(filter);
    filter.connect(engineGainNode);
    engineGainNode.connect(audioCtx.destination);
    osc1.start(); osc2.start();
    engineOscNode = osc1;
  } catch {}
}

function updateEngineAudio(thrustPct) {
  if (!audioCtx || !engineGainNode) return;
  const targetGain = (thrustPct / 100) * 0.18;
  engineGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.12);
  if (engineOscNode) {
    engineOscNode.frequency.setTargetAtTime(50 + thrustPct * 0.6, audioCtx.currentTime, 0.1);
  }
}

function beepPhase(freq = 880, dur = 0.12, vol = 0.25) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur + 0.05);
  } catch {}
}

function playLandingAudio(hardLanding) {
  ensureAudio();
  if (!audioCtx) return;
  if (hardLanding) {
    beepPhase(220, 0.6, 0.35);
  } else {
    beepPhase(880, 0.1, 0.2);
    setTimeout(() => beepPhase(1100, 0.15, 0.25), 150);
    setTimeout(() => beepPhase(1320, 0.25, 0.3), 320);
  }
}

// ═══════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════

export default function LanderSimulation3D({
  initialCamera = 0,
  initialSpeed = 1,
  heightClass = 'h-[700px]',
  siteLat = null,
  siteLon = null,
  siteName = null,
  missionConfig = null,
  siteData = null,
  onBack = null,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  // Determine initial conditions from mission config
  const sunElev = getSunElevFromConfig(missionConfig);
  const earthElev = getEarthElevFromConfig(missionConfig);

  // Available time-of-day modes: allow Day (0), Twilight (1), Night (2)
  const availableTods = useMemo(() => [0, 1, 2], []);
  const initialTod = sunElev > 10 ? 0 : sunElev > 0 ? 1 : 2;

  // Use actual elevation values per mode (fall back to defaults when mode isn't physically valid)
  const SUN_ELS = [
    sunElev > 10 ? sunElev : 32.4,                       // Day
    sunElev > 0 && sunElev <= 10 ? sunElev : 3.1,        // Twilight
    sunElev <= 0 ? sunElev : -30.0,                       // Night
  ];
  const EARTH_ELS = [
    earthElev > 20 ? earthElev : 45.2,
    Math.min(earthElev, 25.0),
    Math.min(earthElev, 15.0),
  ];
  const TEMPS_STR = ['+127 °C', '+23 °C', '−173 °C'];
  const LIGHT_NAMES = ['DAY', 'TWILIGHT', 'NIGHT'];

  const simRef = useRef({
    on: false, t: 0, speed: initialSpeed,
    phase: 0, alt: 15000, hVel: 1680, vSpd: -120,
    fuel: 100, thrust: 0, tod: initialTod,
    cam: initialCamera, si: SPEEDS.indexOf(initialSpeed) >= 0 ? SPEEDS.indexOf(initialSpeed) : 0,
    cinematicAngle: 0,
    manual: false,
    manualThrust: 0,
    keys: { thrustUp: false, thrustDown: false, left: false, right: false },
  });

  const [tel, setTel] = useState({
    alt: 15000, hVel: 1680, vSpd: -120, fuel: 100, thrust: 0, phase: 0, t: 0,
  });
  const [tod, setTod] = useState(initialTod);
  const [cam, setCam] = useState(initialCamera);
  const [speed, setSpeed] = useState(initialSpeed);
  const [status, setStatus] = useState('STANDBY');
  const [toast, setToast] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualThrust, setManualThrust] = useState(0);
  const [landingResult, setLandingResult] = useState(null);

  // Format coordinates string
  const coordStr = siteLat != null && siteLon != null
    ? `${Math.abs(siteLat).toFixed(2)}°${siteLat >= 0 ? 'N' : 'S'} ${Math.abs(siteLon).toFixed(2)}°E`
    : '69.37°S 32.32°E';

  // Three.js setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch { return; }

    const w = container.clientWidth || 800, h = container.clientHeight || 600;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 80000);
    // Cinematic starting position - behind and above, looking at the Moon
    camera.position.set(25, MOON_R + 55, 45);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, MOON_R + 20, 0);
    controls.minDistance = 2;
    controls.maxDistance = 3000;
    controls.update();

    // Build scene
    const starData = buildStars(scene);
    const moonData = buildMoon(scene);

    // Rotate Moon so the landing site is at the top (where the lander descends)
    if (siteLat != null && siteLon != null) {
      const latRad = THREE.MathUtils.degToRad(siteLat);
      const lonRad = THREE.MathUtils.degToRad(siteLon);
      // Convert lat/lon to a unit vector on the sphere (Y-up, Z-forward)
      const siteVec = new THREE.Vector3(
        Math.cos(latRad) * Math.sin(lonRad),
        Math.sin(latRad),
        Math.cos(latRad) * Math.cos(lonRad)
      ).normalize();
      // Quaternion that rotates siteVec → straight up
      const q = new THREE.Quaternion().setFromUnitVectors(siteVec, new THREE.Vector3(0, 1, 0));
      moonData.mesh.quaternion.copy(q);
    }

    const sunMesh = buildSun(scene);
    const earthData = buildEarth(scene);
    const landerGroup = buildLander(scene);

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 50; sunLight.shadow.camera.far = 9000;
    const s = 150;
    sunLight.shadow.camera.left = -s; sunLight.shadow.camera.right = s;
    sunLight.shadow.camera.top = s; sunLight.shadow.camera.bottom = -s;
    scene.add(sunLight);
    const ambientLight = new THREE.AmbientLight(0x223344, 0.12);
    scene.add(ambientLight);
    scene.add(new THREE.HemisphereLight(0x445566, 0x111111, 0.08));
    // Rim light for Moon edge
    const rimLight = new THREE.DirectionalLight(0x334466, 0.3);
    rimLight.position.set(-500, MOON_R, -500);
    scene.add(rimLight);

    // Earthshine: soft blue-cyan light from Earth's position onto the lunar surface
    const earthshineLight = new THREE.DirectionalLight(0x5599ff, 0);
    earthshineLight.position.copy(earthData.group.position);
    scene.add(earthshineLight);

    // Position Sun and Earth from actual data
    const S = simRef.current;
    positionCelestialBody(sunMesh, SUN_ELS[S.tod], 45, 4000);
    positionCelestialBody(earthData.group, EARTH_ELS[S.tod], -30, 2200);
    sunLight.position.copy(sunMesh.position);
    earthshineLight.position.copy(earthData.group.position);
    landerGroup.position.set(0, MOON_R + S.alt * 0.003 + 0.5, 0);

    // Dust system
    const dustSystem = makeDustSystem();
    scene.add(dustSystem);

    function applyTOD() {
      const cfgs = [
        { si: 2.2,  sc: 0xffffff, ai: 0.14,  ac: 0x223344, exp: 1.2,  esi: 0.0 },
        { si: 0.65, sc: 0xffaa66, ai: 0.10,  ac: 0x1c2438, exp: 0.7,  esi: 0.15 },
        { si: 0.08, sc: 0x5588cc, ai: 0.28,  ac: 0x182844, exp: 0.95, esi: 1.1 },
      ];
      const c = cfgs[S.tod];
      sunLight.intensity = c.si; sunLight.color.set(c.sc);
      ambientLight.intensity = c.ai; ambientLight.color.set(c.ac);
      renderer.toneMappingExposure = c.exp;
      positionCelestialBody(sunMesh, SUN_ELS[S.tod], 45, 4000);
      positionCelestialBody(earthData.group, EARTH_ELS[S.tod], -30, 2200);
      sunLight.position.copy(sunMesh.position);
      earthshineLight.intensity = c.esi;
      earthshineLight.color.set(0x70a8ff);
      earthshineLight.position.copy(earthData.group.position);
    }
    applyTOD();

    let thrusterSystem = null;

    sceneRef.current = {
      renderer, scene, camera, controls, sunMesh, earthData, landerGroup,
      sunLight, ambientLight, starData, thrusterSystem, moonData, dustSystem,
      applyTOD, setThruster: (ts) => { sceneRef.current.thrusterSystem = ts; },
    };

    const clock = new THREE.Clock();

    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const refs = sceneRef.current;
      if (!refs) return;

      // Star twinkle
      refs.starData.material.uniforms.time.value = elapsed;
      // Earth rotation
      refs.earthData.earthMesh.rotation.y += dt * 0.04;
      // Landing ring pulse
      if (refs.moonData.ring) {
        refs.moonData.ring.material.opacity = 0.15 + Math.sin(elapsed * 2) * 0.08;
        refs.moonData.ring2.material.opacity = 0.1 + Math.sin(elapsed * 3) * 0.06;
      }

      // Audio update
      updateEngineAudio(simRef.current.thrust);

      // Simulation tick
      const S = simRef.current;
      if (S.on && S.phase > 0 && S.phase < 5) {
        const d = dt * S.speed;
        S.t += d;

        if (S.manual) {
          // Manual Pilot Mode
          if (S.keys.thrustUp)   S.manualThrust = Math.min(100, S.manualThrust + d * 60);
          if (S.keys.thrustDown) S.manualThrust = Math.max(0,   S.manualThrust - d * 60);
          if (S.keys.left)       S.hVel = Math.max(0, S.hVel - d * 40);
          if (S.keys.right)      S.hVel = Math.min(1680, S.hVel + d * 20);

          const gravity = 1.62;
          const thrustAccel = (S.manualThrust / 100) * 5.0;
          S.vSpd += (gravity - thrustAccel) * -d;
          S.alt += S.vSpd * d;
          S.hVel = Math.max(0, S.hVel - d * 8);
          if (S.fuel > 0 && S.manualThrust > 0) S.fuel -= d * (S.manualThrust / 100) * 0.6;
          S.fuel = Math.max(0, S.fuel);
          if (S.fuel === 0) S.manualThrust = 0;
          S.thrust = S.manualThrust;
          setManualThrust(S.manualThrust);

          if (S.phase === 1 && S.alt <= 7000) { S.phase = 2; showToast(2); }
          else if (S.phase === 2 && S.alt <= 2000) { S.phase = 3; showToast(3); }
          else if (S.phase === 3 && S.alt <= 100) { S.phase = 4; showToast(4); }

          if (S.alt < 50 && !refs.dustSystem.userData.active) {
            refs.dustSystem.visible = true;
            refs.dustSystem.userData.active = true;
            refs.dustSystem.position.set(0, MOON_R + 0.1, 0);
          }

          if (S.alt <= 0) {
            S.alt = 0; S.hVel = 0;
            const hardLanding = Math.abs(S.vSpd) > 3;
            S.vSpd = 0; S.thrust = 0; S.phase = 5; S.on = false;
            showToast(5);
            if (refs.thrusterSystem) refs.thrusterSystem.visible = false;
            setStatus('LANDED');
            const mins = Math.floor(S.t / 60), secs = Math.floor(S.t % 60);
            const timeStr = `T+ ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            setLandingResult({ hardLanding, fuel: S.fuel, time: timeStr, mode: 'MANUAL PILOT' });
            playLandingAudio(hardLanding);
          }
        } else {
          // Auto Pilot Mode
          switch (S.phase) {
            case 1: S.alt -= d * 200; S.hVel -= d * 30; S.vSpd = -200 + (15000 - S.alt) * .01; S.fuel -= d * .5; S.thrust = 100;
              if (S.alt <= 7000) { S.phase = 2; showToast(2); } break;
            case 2: S.alt -= d * 120; S.hVel -= d * 25; S.vSpd = -120 + (7000 - S.alt) * .005; S.fuel -= d * .4; S.thrust = 80;
              if (S.alt <= 2000) { S.phase = 3; showToast(3); } break;
            case 3: S.alt -= d * 50; S.hVel -= d * 20; S.vSpd = -50 + (2000 - S.alt) * .02; S.fuel -= d * .3; S.thrust = 60;
              if (S.alt <= 100) { S.phase = 4; showToast(4); } break;
            case 4: S.alt -= d * 5; S.hVel *= .98; S.vSpd = -2 - S.alt * .02; S.fuel -= d * .2; S.thrust = 30 + S.alt * .3;
              // Activate dust when below 50m
              if (S.alt < 50 && !refs.dustSystem.userData.active) {
                refs.dustSystem.visible = true;
                refs.dustSystem.userData.active = true;
                refs.dustSystem.position.set(0, MOON_R + 0.1, 0);
              }
              if (S.alt <= 0) {
                S.alt = 0; S.hVel = 0; S.vSpd = 0; S.thrust = 0; S.phase = 5; S.on = false;
                showToast(5);
                if (refs.thrusterSystem) refs.thrusterSystem.visible = false;
                setStatus('LANDED');
                const mins = Math.floor(S.t / 60), secs = Math.floor(S.t % 60);
                const timeStr = `T+ ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                setLandingResult({ hardLanding: false, fuel: S.fuel, time: timeStr, mode: 'AUTO PILOT' });
                playLandingAudio(false);
              } break;
          }
        }
        S.alt = Math.max(0, S.alt); S.hVel = Math.max(0, S.hVel); S.fuel = Math.max(0, S.fuel);
        refs.landerGroup.position.set(0, MOON_R + Math.max(S.alt, 0) * 0.003 + 0.5, 0);

        // Attitude wobble
        if (S.phase >= 1 && S.phase <= 3) {
          refs.landerGroup.rotation.z = Math.sin(S.t * 0.5) * 0.025;
          refs.landerGroup.rotation.x = Math.cos(S.t * 0.7) * 0.018;
        } else if (S.phase === 4) {
          refs.landerGroup.rotation.z *= 0.96;
          refs.landerGroup.rotation.x *= 0.96;
        }

        // Thruster particles
        if (refs.thrusterSystem && refs.thrusterSystem.visible) {
          const p = refs.thrusterSystem.geometry.attributes.position;
          const ud = refs.thrusterSystem.userData;
          const ts = S.thrust / 100;
          for (let i = 0; i < ud.vels.length; i++) {
            ud.lives[i] -= d * 3;
            if (ud.lives[i] <= 0) {
              p.array[i * 3] = (Math.random() - 0.5) * 0.7;
              p.array[i * 3 + 1] = -0.4;
              p.array[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
              ud.lives[i] = 0.15 + Math.random() * 0.6;
              ud.vels[i].set((Math.random() - 0.5) * 3 * ts, -(6 + Math.random() * 12) * ts, (Math.random() - 0.5) * 3 * ts);
            } else {
              p.array[i * 3] += ud.vels[i].x * d;
              p.array[i * 3 + 1] += ud.vels[i].y * d;
              p.array[i * 3 + 2] += ud.vels[i].z * d;
            }
          }
          p.needsUpdate = true;
        }

        // Dust particles
        if (refs.dustSystem.userData.active) {
          const p = refs.dustSystem.geometry.attributes.position;
          const ud = refs.dustSystem.userData;
          const intensity = Math.max(0, 1 - S.alt / 50);
          refs.dustSystem.material.uniforms.uScale.value = intensity;
          for (let i = 0; i < ud.vels.length; i++) {
            if (ud.lives[i] < 0 && Math.random() < intensity * 0.3) {
              ud.lives[i] = 0.5 + Math.random() * 1.5;
              p.array[i * 3] = (Math.random() - 0.5) * 2;
              p.array[i * 3 + 1] = 0;
              p.array[i * 3 + 2] = (Math.random() - 0.5) * 2;
            }
            if (ud.lives[i] > 0) {
              ud.lives[i] -= d * 1.5;
              p.array[i * 3] += ud.vels[i].x * d * intensity;
              p.array[i * 3 + 1] += ud.vels[i].y * d * 0.3;
              p.array[i * 3 + 2] += ud.vels[i].z * d * intensity;
              ud.vels[i].y -= d * 2; // gravity
              if (p.array[i * 3 + 1] < 0) p.array[i * 3 + 1] = 0;
            }
          }
          p.needsUpdate = true;
          if (S.phase >= 5) {
            // Fade out dust after landing
            refs.dustSystem.material.uniforms.uScale.value *= 0.95;
            if (refs.dustSystem.material.uniforms.uScale.value < 0.01) {
              refs.dustSystem.visible = false;
            }
          }
        }

        // Update telemetry state
        setTel({ alt: S.alt, hVel: S.hVel, vSpd: S.vSpd, fuel: S.fuel, thrust: S.thrust, phase: S.phase, t: S.t });
      }

      // Camera
      const lp = refs.landerGroup.position.clone();
      if (S.cam !== 5) { // Not Free Orbit
        switch (S.cam) {
          case 0: { // Cinematic - slow orbit around lander
            S.cinematicAngle += dt * 0.15;
            const dist = 20 + S.alt * 0.001;
            const camX = Math.cos(S.cinematicAngle) * dist;
            const camZ = Math.sin(S.cinematicAngle) * dist;
            const camY = lp.y + 6 + S.alt * 0.0005;
            camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.025);
            controls.target.lerp(lp, 0.04);
            break;
          }
          case 1: // Chase - behind and above
            camera.position.lerp(lp.clone().add(new THREE.Vector3(15, 8 + S.alt * 0.0008, 22)), 0.03);
            controls.target.lerp(lp, 0.05);
            break;
          case 2: // Side
            camera.position.lerp(lp.clone().add(new THREE.Vector3(30, 3, 0)), 0.03);
            controls.target.lerp(lp, 0.05);
            break;
          case 3: // Ground - looking up at lander from surface
            camera.position.lerp(new THREE.Vector3(10, MOON_R + 0.8, 10), 0.03);
            controls.target.lerp(lp, 0.05);
            break;
          case 4: // Cockpit - looking straight down
            camera.position.lerp(lp.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.05);
            controls.target.lerp(lp.clone().add(new THREE.Vector3(0, -50, 3)), 0.05);
            break;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    const resizeOb = new ResizeObserver(() => {
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeOb.observe(container);

    return () => {
      renderer.setAnimationLoop(null);
      resizeOb.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ──

  function showToast(pi) {
    setToast(PHASES[pi]);
    ensureAudio();
    const freqs = [0, 660, 700, 740, 780, 900];
    if (freqs[pi]) beepPhase(freqs[pi]);
    setTimeout(() => setToast(null), 3000);
  }

  const toggleSim = useCallback(() => {
    ensureAudio();
    const S = simRef.current;
    const refs = sceneRef.current;
    if (!refs || S.phase >= 5) return;
    if (S.on) {
      S.on = false;
      setStatus('PAUSED');
    } else {
      if (S.phase === 0) {
        S.phase = 1; S.thrust = S.manual ? S.manualThrust : 100;
        showToast(1);
        const ts = makeThruster();
        refs.landerGroup.add(ts);
        refs.setThruster(ts);
      }
      S.on = true;
      setStatus('DESCENDING');
    }
    setTel(t => ({ ...t, phase: S.phase }));
  }, []);

  const resetSim = useCallback(() => {
    const S = simRef.current;
    const refs = sceneRef.current;
    if (!refs) return;
    S.on = false; S.phase = 0; S.t = 0; S.alt = 15000; S.hVel = 1680; S.vSpd = -120;
    S.fuel = 100; S.thrust = 0; S.cinematicAngle = 0; S.manualThrust = 0;
    refs.landerGroup.position.set(0, MOON_R + S.alt * 0.003 + 0.5, 0);
    refs.landerGroup.rotation.set(0, 0, 0);
    if (refs.thrusterSystem) {
      refs.landerGroup.remove(refs.thrusterSystem);
      refs.setThruster(null);
    }
    if (refs.dustSystem) {
      refs.dustSystem.visible = false;
      refs.dustSystem.userData.active = false;
    }
    setTel({ alt: 15000, hVel: 1680, vSpd: -120, fuel: 100, thrust: 0, phase: 0, t: 0 });
    setManualThrust(0);
    setLandingResult(null);
    setStatus('STANDBY');
  }, []);

  const cycleCam = useCallback(() => {
    const S = simRef.current;
    S.cam = (S.cam + 1) % CAM_NAMES.length;
    setCam(S.cam);
  }, []);

  const cycleSpd = useCallback(() => {
    const S = simRef.current;
    S.si = (S.si + 1) % SPEEDS.length;
    S.speed = SPEEDS[S.si];
    setSpeed(S.speed);
  }, []);

  const changeTod = useCallback((t) => {
    if (!availableTods.includes(t)) return;
    const S = simRef.current;
    const refs = sceneRef.current;
    if (!refs) return;
    S.tod = t;
    refs.applyTOD();
    setTod(t);
  }, [availableTods]);

  const toggleManual = useCallback(() => {
    ensureAudio();
    const S = simRef.current;
    S.manual = !S.manual;
    if (S.manual) {
      S.manualThrust = S.thrust;
      setManualThrust(S.manualThrust);
    }
    setManual(S.manual);
  }, []);

  // Keyboard
  useEffect(() => {
    const downHandler = (e) => {
      const S = simRef.current;
      ensureAudio();
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); toggleSim(); break;
        case 'r': resetSim(); break;
        case 'c': cycleCam(); break;
        case 'v': cycleSpd(); break;
        case 'm': toggleManual(); break;
        case '1': changeTod(0); break;
        case '2': changeTod(1); break;
        case '3': changeTod(2); break;
        case 'w': case 'arrowup': S.keys.thrustUp = true; break;
        case 's': if (S.manual) { S.keys.thrustDown = true; } else { cycleSpd(); } break;
        case 'arrowdown': S.keys.thrustDown = true; break;
        case 'arrowleft': S.keys.left = true; break;
        case 'arrowright': S.keys.right = true; break;
      }
    };
    const upHandler = (e) => {
      const S = simRef.current;
      switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': S.keys.thrustUp = false; break;
        case 's': case 'arrowdown': S.keys.thrustDown = false; break;
        case 'arrowleft': S.keys.left = false; break;
        case 'arrowright': S.keys.right = false; break;
      }
    };
    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [toggleSim, resetSim, cycleCam, cycleSpd, changeTod, toggleManual]);

  // ── Format helpers ──
  const fmtAlt = tel.alt >= 1000 ? (tel.alt / 1000).toFixed(2) + ' km' : tel.alt.toFixed(1) + ' m';
  const mins = Math.floor(tel.t / 60), secs = Math.floor(tel.t % 60);
  const hrs = Math.floor(mins / 60);
  const clockStr = `T+ ${String(hrs).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const altPct = Math.max(1, tel.alt / 15000 * 100);

  return (
    <div className={`relative w-full ${heightClass} overflow-hidden bg-[#020408]`}>
      {/* Three.js mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* ── BACK BUTTON ── */}
      {onBack && (
        <button onClick={onBack}
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] tracking-wider
            bg-[#020a1ad9] border border-blue-500/15 text-blue-300/70 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-200
            backdrop-blur-xl cursor-pointer transition-all">
          ← Mission Dates
        </button>
      )}

      {/* ── TOP BAR ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-[#020408f0] via-[#02040899] to-transparent pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto ml-32">
          <div className="w-7 h-7 rounded-full border border-blue-500/40 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full border border-blue-500/60" />
          </div>
          <span className="text-sm font-semibold tracking-[4px] text-blue-300">ASTRA 2026</span>
          {siteName && (
            <span className="text-[10px] text-gray-500 tracking-wider ml-1 hidden sm:inline">
              · {siteName}
            </span>
          )}
        </div>
        <span className="text-lg font-light tracking-widest text-blue-200/80 tabular-nums">{clockStr}</span>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 pointer-events-auto">
          <div className={`w-1.5 h-1.5 rounded-full ${status === 'LANDED' ? 'bg-emerald-400' : status === 'DESCENDING' ? 'bg-amber-400 animate-pulse' : 'bg-blue-400 animate-pulse'}`} />
          <span className="text-[10px] tracking-widest text-blue-300 uppercase">{status}</span>
        </div>
      </div>

      {/* ── LEFT PANEL: Telemetry ── */}
      <div className="absolute top-16 left-3 z-10 bg-[#020a1ae6] border border-blue-500/10 rounded-lg p-3 min-w-[195px] backdrop-blur-xl pointer-events-auto">
        <h3 className="text-[9px] uppercase tracking-[2.5px] text-blue-400/70 mb-2 pb-1.5 border-b border-blue-500/10 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-blue-400/70" /> Flight Telemetry
        </h3>
        <Row label="Altitude" value={fmtAlt} />
        {/* Integrated Altitude Gauge */}
        <div className="my-1.5 px-0.5">
          <div className="w-full h-1.5 rounded-full bg-blue-950/80 border border-blue-500/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${altPct}%`,
                background: 'linear-gradient(90deg, #4aeaaa 0%, #4a90cc 60%, #60a5fa 100%)',
              }}
            />
          </div>
          <div className="flex justify-between text-[7px] text-gray-500 font-mono tracking-wider mt-0.5">
            <span>0m</span>
            <span>7.5km</span>
            <span>15km</span>
          </div>
        </div>
        <Row label="H-Velocity" value={`${tel.hVel.toFixed(0)} m/s`} />
        <Row label="V-Speed" value={`${tel.vSpd.toFixed(1)} m/s`} cls={Math.abs(tel.vSpd) > 100 ? 'text-red-400' : Math.abs(tel.vSpd) > 50 ? 'text-amber-400' : ''} />
        <Row label="Thrust" value={`${tel.thrust.toFixed(0)} %`} />
        <Row label="Fuel" value={`${tel.fuel.toFixed(0)} %`} cls={tel.fuel > 50 ? 'text-emerald-400' : tel.fuel > 20 ? 'text-amber-400' : 'text-red-400'} />
        <Row label="Phase" value={PHASES[tel.phase].n} />

        {/* Mission Details */}
        {missionConfig && (
          <>
            <div className="border-t border-blue-500/10 mt-2 pt-2">
              <h3 className="text-[9px] uppercase tracking-[2.5px] text-blue-400/70 mb-1.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400/70" /> Mission
              </h3>
              <Row label="Launch" value={missionConfig.launchDate} />
              <Row label="Transit" value={`${missionConfig.transitDays}d`} />
              <Row label="Landing" value={missionConfig.startDate} />
              <Row label="Duration" value={`${missionConfig.windowDays}d`} />
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT PANEL: Environment ── */}
      <div className="absolute top-16 right-3 z-10 bg-[#020a1ae6] border border-blue-500/10 rounded-lg p-3 min-w-[195px] backdrop-blur-xl pointer-events-auto text-right">
        <h3 className="text-[9px] uppercase tracking-[2.5px] text-blue-400/70 mb-2 pb-1.5 border-b border-blue-500/10 flex items-center justify-end gap-1.5">
          Environment <span className="w-1 h-1 rounded-full bg-blue-400/70" />
        </h3>
        <Row label="Sun Elev." value={`${SUN_ELS[tod].toFixed(1)}°`} right />
        <Row label="Earth Visible" value={EARTH_ELS[tod] > 0 ? 'YES' : 'NO'} cls={EARTH_ELS[tod] > 0 ? 'text-emerald-400' : 'text-red-400'} right />
        <Row label="Earth Elev." value={`${EARTH_ELS[tod].toFixed(1)}°`} right />
        <Row label="Surface Temp" value={TEMPS_STR[tod]} right />
        <Row label="Lighting" value={LIGHT_NAMES[tod]} right />
        <Row label="Lat / Lon" value={coordStr} right />

        {/* Site info */}
        {siteName && (
          <div className="border-t border-blue-500/10 mt-2 pt-2">
            <Row label="Site" value={siteName.length > 15 ? siteName.slice(0, 15) + '…' : siteName} right />
          </div>
        )}
      </div>

      {/* ── TOD ICONS ── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2.5 pointer-events-auto">
        {availableTods.map(t => (
          <button key={t} onClick={() => changeTod(t)}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-all cursor-pointer
              ${tod === t ? 'bg-blue-500/15 border-blue-500/40' : 'bg-[#020a1ae6] border-blue-500/10 hover:border-blue-500/30'}`}>
            {['☀️', '🌅', '🌙'][t]}
          </button>
        ))}
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-8 py-3 rounded-xl bg-[#020a1af0] border border-blue-500/25 backdrop-blur-xl text-center">
          <h2 className="text-base font-semibold tracking-[4px] text-blue-300">{toast.n}</h2>
          <p className="text-[11px] text-gray-400 tracking-wider mt-1">{toast.d}</p>
        </div>
      )}

      {/* ── MANUAL PILOT HUD ── */}
      {manual && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[#020a1ae6] border border-blue-500/25 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <span className="text-[10px] uppercase tracking-wider text-blue-400/80">Thrust</span>
            <div className="w-36 h-2 rounded-full bg-blue-500/15 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-100" style={{ width: `${manualThrust}%`, background: 'linear-gradient(90deg, #4aeaaa, #f0a030, #ff4455)' }} />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-blue-200">{manualThrust.toFixed(0)}%</span>
          </div>
          <div className="text-[9px] tracking-wider text-blue-300/60 bg-black/40 px-3 py-0.5 rounded-full backdrop-blur-sm">
            W / ↑ Thrust Up · S / ↓ Thrust Down · ← / → RCS Lateral
          </div>
        </div>
      )}

      {/* ── LANDING RESULT OVERLAY ── */}
      {landingResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="text-center p-8 rounded-2xl border border-blue-500/30 bg-[#020a1af8] shadow-[0_0_60px_rgba(70,140,255,0.2)] max-w-sm w-full mx-4">
            <div className="text-5xl mb-3">{landingResult.hardLanding ? '💥' : '🌕'}</div>
            <h2 className={`text-2xl font-bold tracking-widest mb-1 ${landingResult.hardLanding ? 'text-red-400' : 'text-emerald-400'}`}>
              {landingResult.hardLanding ? 'CRASH LANDING' : 'PERFECT SOFT LANDING'}
            </h2>
            <p className="text-xs text-gray-400 tracking-wider mb-5">
              {landingResult.hardLanding ? 'Impact velocity too high (> 3 m/s) — mission failed' : 'Nominal touchdown (< 3 m/s) — mission accomplished ✓'}
            </p>
            <div className="text-xs text-blue-200 space-y-1.5 mb-6 text-left bg-blue-950/40 border border-blue-500/20 rounded-lg p-3">
              <div className="flex justify-between"><span className="text-gray-400">Fuel Remaining</span><span className="font-mono">{landingResult.fuel.toFixed(0)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Mission Time</span><span className="font-mono">{landingResult.time}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Control Mode</span><span className="font-mono text-blue-300">{landingResult.mode}</span></div>
            </div>
            <button onClick={() => setLandingResult(null)}
              className="w-full py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-200 hover:bg-blue-500/30 text-xs tracking-widest uppercase transition-all cursor-pointer">
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-auto">
        <div className="flex items-center justify-center gap-2.5 px-4 py-3.5 bg-gradient-to-t from-[#020408f0] via-[#02040899] to-transparent">
          <Btn primary onClick={toggleSim} disabled={tel.phase >= 5}>
            {tel.phase === 0 ? '▶ Begin Descent' : status === 'PAUSED' ? '▶ Resume' : tel.phase >= 5 ? '✓ Landed' : '⏸ Pause'}
          </Btn>
          <Btn onClick={resetSim}>↺ Reset</Btn>
          <Btn onClick={cycleCam}>📷 {CAM_NAMES[cam]}</Btn>
          <Btn onClick={cycleSpd}>⏱ {speed}×</Btn>
          <Btn onClick={toggleManual} primary={manual}>🕹️ {manual ? 'Manual Pilot' : 'Auto Pilot'}</Btn>
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 pb-2 text-[9px] text-gray-600 tracking-wider">
          <span>SPACE — start/pause</span>
          <span>M — manual pilot</span>
          <span>W/S or ↑/↓ — thrust</span>
          <span>R — reset</span>
          <span>C — camera</span>
          <span>1/2/3 — lighting</span>
        </div>
      </div>
    </div>
  );
}

// ── Tiny sub-components ──

function Row({ label, value, cls = '', right = false }) {
  return (
    <div className={`flex justify-between items-center py-[2px] text-[11.5px] ${right ? 'flex-row-reverse' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium tabular-nums text-gray-100 ${cls}`}>{value}</span>
    </div>
  );
}

function Btn({ children, onClick, primary, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[11px] tracking-wider uppercase transition-all cursor-pointer
        ${primary
          ? 'bg-gradient-to-br from-blue-600/30 to-blue-500/15 border border-blue-500/35 text-blue-200 hover:from-blue-600/45 hover:border-blue-400/50'
          : 'bg-[#14284650] border border-blue-500/15 text-blue-300/70 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
}
