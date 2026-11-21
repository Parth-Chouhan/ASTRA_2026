import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * LanderSimulation3D — Full 3D lunar lander descent simulation.
 *
 * Renders an interactive Three.js scene with:
 *  - Procedural Moon surface with craters, rocks, landing marker
 *  - Starfield with twinkling and color variation
 *  - Sun with glow + directional light (day / twilight / night)
 *  - Earth with atmosphere glow
 *  - Detailed lander model (gold foil, solar panels, legs, antenna, nozzle)
 *  - 4-phase landing: Rough Braking → Fine Braking → Terminal Descent → Touchdown
 *  - Thruster particle system
 *  - 5 camera modes: Chase, Side, Ground, Cockpit, Free Orbit
 *  - Full HUD overlays (Tailwind styled)
 */

const MOON_R = 100;
const PHASES = [
  { n: 'IDLE', d: 'Awaiting ignition' },
  { n: 'ROUGH BRAKING', d: '15 km → 7 km altitude' },
  { n: 'FINE BRAKING', d: '7 km → 2 km altitude' },
  { n: 'TERMINAL DESCENT', d: '2 km → 100 m' },
  { n: 'TOUCHDOWN', d: 'Final approach' },
  { n: 'LANDED', d: 'Touchdown confirmed ✓' },
];
const CAM_NAMES = ['Chase', 'Side', 'Ground', 'Cockpit', 'Free Orbit'];
const SPEEDS = [1, 2, 5, 10, 0.5];
const TOD_LABELS = ['☀️ Day', '🌅 Twilight', '🌙 Night'];
const SUN_ELS = [32.4, 3.1, -30.0];
const EARTH_ELS = [45.2, 25.0, 15.0];
const TEMPS = ['+127 °C', '+23 °C', '−173 °C'];
const LIGHT_NAMES = ['DAY', 'TWILIGHT', 'NIGHT'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Procedural texture builders ───

function makeMoonTexture() {
  const C = document.createElement('canvas'); C.width = 2048; C.height = 1024;
  const x = C.getContext('2d');
  x.fillStyle = '#929292'; x.fillRect(0, 0, 2048, 1024);
  // maria
  [[400,350,200],[1100,300,180],[700,500,250],[1500,450,160]].forEach(([cx,cy,r]) => {
    const gr = x.createRadialGradient(cx,cy,0,cx,cy,r);
    gr.addColorStop(0,'rgba(55,55,60,0.5)'); gr.addColorStop(1,'rgba(55,55,60,0)');
    x.fillStyle = gr; x.fillRect(cx-r,cy-r,r*2,r*2);
  });
  const rand = mulberry32(2026);
  for (let i = 0; i < 600; i++) {
    const cx = rand()*2048, cy = rand()*1024, r = 1+rand()*35;
    const b = Math.floor(130+rand()*40-20);
    x.beginPath(); x.arc(cx,cy,r,0,Math.PI*2);
    x.fillStyle = `rgb(${b+12},${b+12},${b+8})`; x.fill();
    x.beginPath(); x.arc(cx+1,cy+1,r*.7,0,Math.PI*2);
    x.fillStyle = `rgb(${b-12},${b-12},${b-14})`; x.fill();
  }
  const id = x.getImageData(0,0,2048,1024);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (rand()-0.5)*18;
    id.data[i]+=n; id.data[i+1]+=n; id.data[i+2]+=n;
  }
  x.putImageData(id,0,0);
  return new THREE.CanvasTexture(C);
}

function makeBumpTexture() {
  const B = document.createElement('canvas'); B.width = 2048; B.height = 1024;
  const bx = B.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0,0,2048,1024);
  const rand = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    const cx = rand()*2048, cy = rand()*1024, r = 2+rand()*25;
    const gr = bx.createRadialGradient(cx,cy,0,cx,cy,r);
    gr.addColorStop(0,`rgba(0,0,0,${rand()*.4})`);
    gr.addColorStop(.6,`rgba(190,190,190,${rand()*.3})`);
    gr.addColorStop(1,'rgba(128,128,128,0)');
    bx.fillStyle = gr; bx.beginPath(); bx.arc(cx,cy,r,0,Math.PI*2); bx.fill();
  }
  return new THREE.CanvasTexture(B);
}

function makeEarthTexture() {
  const C = document.createElement('canvas'); C.width = 1024; C.height = 512;
  const x = C.getContext('2d');
  x.fillStyle = '#1a4a7a'; x.fillRect(0,0,1024,512);
  x.fillStyle = '#2d7a3a';
  [[550,240,55,95],[600,150,140,45],[250,180,38,110],[280,310,45,55],[820,320,32,22]].forEach(([cx,cy,rx,ry]) => {
    x.beginPath(); x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); x.fill();
  });
  x.fillStyle = '#3a8a4a'; x.beginPath(); x.moveTo(650,200); x.lineTo(670,260); x.lineTo(635,260); x.closePath(); x.fill();
  x.fillStyle = '#ddeeff'; x.fillRect(0,0,1024,25); x.fillRect(0,487,1024,25);
  x.fillStyle = 'rgba(255,255,255,0.22)';
  const rand = mulberry32(55);
  for (let i = 0; i < 35; i++) {
    x.beginPath(); x.ellipse(rand()*1024,rand()*512,20+rand()*80,4+rand()*12,rand(),0,Math.PI*2); x.fill();
  }
  return new THREE.CanvasTexture(C);
}

// ─── Three.js scene builders ───

function buildStars(scene) {
  const N = 12000;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N*3), col = new Float32Array(N*3), sz = new Float32Array(N);
  const rand = mulberry32(1337);
  for (let i = 0; i < N; i++) {
    const r = 6000+rand()*30000;
    const th = rand()*Math.PI*2, ph = Math.acos(2*rand()-1);
    pos[i*3] = r*Math.sin(ph)*Math.cos(th);
    pos[i*3+1] = r*Math.sin(ph)*Math.sin(th);
    pos[i*3+2] = r*Math.cos(ph);
    const t = rand();
    const c = t<0.3?[0.85,0.9,1]:t<0.6?[1,1,0.95]:t<0.8?[1,0.92,0.75]:[1,0.7,0.5];
    col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
    sz[i] = 0.5+rand()*2;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.setAttribute('size', new THREE.BufferAttribute(sz,1));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float size; attribute vec3 color;
      varying vec3 vc; uniform float time;
      void main(){
        vc=color;
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize=size*(0.75+0.25*sin(time*1.5+position.x*0.005))*(180./-mv.z);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      varying vec3 vc;
      void main(){
        float d=length(gl_PointCoord-vec2(.5));
        if(d>.5)discard;
        float a=1.-smoothstep(0.,.5,d);
        gl_FragColor=vec4(vc,a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  scene.add(pts);
  return { points: pts, material: m, geometry: g };
}

function buildMoon(scene) {
  const tex = makeMoonTexture();
  const bump = makeBumpTexture();
  const geo = new THREE.SphereGeometry(MOON_R, 128, 128);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, bumpMap: bump, bumpScale: 1.5,
    roughness: 0.92, metalness: 0, color: 0xc0c0c0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1, metalness: 0 });
  const rand = mulberry32(42);
  for (let i = 0; i < 80; i++) {
    const a = rand()*Math.PI*2, d = 2+rand()*35, s = 0.1+rand()*0.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(Math.cos(a)*d, MOON_R+s*0.3, Math.sin(a)*d);
    rock.rotation.set(rand()*3, rand()*3, 0);
    rock.castShadow = true;
    scene.add(rock);
  }

  // Landing marker
  const ringGeo = new THREE.RingGeometry(2.8, 3.1, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x40e090, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = MOON_R + 0.05; ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 3), ringMat);
    bar.position.y = MOON_R + 0.06; bar.rotation.y = i * Math.PI / 4;
    scene.add(bar);
  }

  return { mesh, tex, bump, geo, mat };
}

function buildSun(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff8e0 })
  );
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vN;void main(){float i=pow(.55-dot(vN,vec3(0,0,1)),2.);gl_FragColor=vec4(1.,.95,.7,i*.35);}`,
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  mesh.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 32), glowMat));
  scene.add(mesh);
  return mesh;
}

function positionSun(sunMesh, tod) {
  const d = 4000;
  const els = [32, 3, -30], azs = [45, 90, 180];
  const e = THREE.MathUtils.degToRad(els[tod]), a = THREE.MathUtils.degToRad(azs[tod]);
  sunMesh.position.set(d*Math.cos(e)*Math.cos(a), d*Math.sin(e)+MOON_R, d*Math.cos(e)*Math.sin(a));
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
    fragmentShader: `varying vec3 vN;void main(){float i=pow(.62-dot(vN,vec3(0,0,1)),2.5);gl_FragColor=vec4(.3,.55,1.,i*.55);}`,
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(23.5, 64, 64), atmosMat));
  scene.add(group);
  return { group, earthMesh };
}

function positionEarth(earthGroup, tod) {
  const d = 2200;
  const els = [45, 25, 15], azs = [-30, -50, -65];
  const e = THREE.MathUtils.degToRad(els[tod]), a = THREE.MathUtils.degToRad(azs[tod]);
  earthGroup.position.set(d*Math.cos(e)*Math.cos(a), d*Math.sin(e)+MOON_R, d*Math.cos(e)*Math.sin(a));
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
    const a = i*Math.PI/2;
    p.position.set(Math.cos(a)*1.52, 2.5, Math.sin(a)*1.52);
    p.rotation.y = a + Math.PI/2;
    landerGroup.add(p);
  }

  // Top platform
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.3, 8), grey);
  top.position.y = 3.95; top.castShadow = true;
  landerGroup.add(top);

  // Solar panels
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), dark);
    arm.rotation.z = Math.PI/2; arm.position.set(side*2.4, 3.8, 0);
    landerGroup.add(arm);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.8), blue);
    pan.position.set(side*4.3, 3.8, 0); pan.castShadow = true;
    landerGroup.add(pan);
    for (let g = 0; g < 4; g++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.015), dark);
      l.position.set(side*4.3, 3.84, -0.6+g*0.4); landerGroup.add(l);
    }
    for (let g = 0; g < 6; g++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 1.8), dark);
      l.position.set(side*4.3-1.3+g*0.52, 3.84, 0); landerGroup.add(l);
    }
  }

  // 4 Legs
  for (let i = 0; i < 4; i++) {
    const a = i*Math.PI/2 + Math.PI/4;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), grey);
    strut.position.set(Math.cos(a)*2.2, 1, Math.sin(a)*2.2);
    strut.rotation.z = Math.cos(a)*0.38; strut.rotation.x = -Math.sin(a)*0.38;
    strut.castShadow = true; landerGroup.add(strut);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 12), grey);
    foot.position.set(Math.cos(a)*3.2, -0.4, Math.sin(a)*3.2);
    foot.castShadow = true; landerGroup.add(foot);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    brace.position.set(Math.cos(a)*2.6, 1.8, Math.sin(a)*2.6);
    brace.rotation.z = Math.cos(a)*0.55; brace.rotation.x = -Math.sin(a)*0.55;
    landerGroup.add(brace);
  }

  // Nozzle
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.25, metalness: 0.85, side: THREE.DoubleSide }));
  nozzle.position.y = 0.3; nozzle.rotation.x = Math.PI; landerGroup.add(nozzle);

  // Antenna + dish
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
  ant.position.set(0.4, 5, 0.4); landerGroup.add(ant);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI*2, 0, Math.PI/2),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
  dish.position.set(0.4, 5.9, 0.4); dish.rotation.x = Math.PI; landerGroup.add(dish);

  // Cameras
  const camM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.5 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.4), camM);
  c1.position.set(1.52, 2.5, 0); landerGroup.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.4), camM);
  c2.position.set(0, 2.5, 1.52); landerGroup.add(c2);

  landerGroup.scale.setScalar(0.6);
  scene.add(landerGroup);
  return landerGroup;
}

function makeThruster() {
  const N = 250;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N*3), sz = new Float32Array(N);
  const vels = [], lives = [];
  for (let i = 0; i < N; i++) {
    pos[i*3] = pos[i*3+1] = pos[i*3+2] = 0;
    sz[i] = 0.5 + Math.random()*2.5;
    vels.push(new THREE.Vector3((Math.random()-0.5)*2, -(4+Math.random()*8), (Math.random()-0.5)*2));
    lives.push(Math.random());
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute float size;varying float vY;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*(80./-mv.z);gl_Position=projectionMatrix*mv;vY=position.y;}`,
    fragmentShader: `varying float vY;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float a=1.-smoothstep(0.,.5,d);float life=clamp(vY/-6.,0.,1.);vec3 col=mix(vec3(1.,.95,.85),mix(vec3(1.,.7,.15),vec3(1.,.35,.05),life),life);a*=(1.-life)*.85;gl_FragColor=vec4(col,a);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.userData = { vels, lives };
  return pts;
}

// ═══════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════

export default function LanderSimulation3D({
  initialTimeOfDay = 0,
  initialCamera = 0,
  initialSpeed = 1,
  heightClass = 'h-[700px]',
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const simRef = useRef({
    on: false, t: 0, speed: initialSpeed,
    phase: 0, alt: 15000, hVel: 1680, vSpd: -120,
    fuel: 100, thrust: 0, tod: initialTimeOfDay,
    cam: initialCamera, si: SPEEDS.indexOf(initialSpeed) >= 0 ? SPEEDS.indexOf(initialSpeed) : 0,
  });

  // UI state
  const [tel, setTel] = useState({
    alt: 15000, hVel: 1680, vSpd: -120, fuel: 100, thrust: 0, phase: 0, t: 0,
  });
  const [tod, setTod] = useState(initialTimeOfDay);
  const [cam, setCam] = useState(initialCamera);
  const [speed, setSpeed] = useState(initialSpeed);
  const [status, setStatus] = useState('STANDBY');
  const [toast, setToast] = useState(null);

  // Three.js setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
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
    const camera = new THREE.PerspectiveCamera(50, w/h, 0.1, 80000);
    camera.position.set(30, MOON_R + 50, 60);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, MOON_R + 20, 0);
    controls.minDistance = 3;
    controls.maxDistance = 2000;
    controls.update();

    // Build scene
    const starData = buildStars(scene);
    const moonData = buildMoon(scene);
    const sunMesh = buildSun(scene);
    const earthData = buildEarth(scene);
    const landerGroup = buildLander(scene);

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 100; sunLight.shadow.camera.far = 9000;
    const s = 120;
    sunLight.shadow.camera.left = -s; sunLight.shadow.camera.right = s;
    sunLight.shadow.camera.top = s; sunLight.shadow.camera.bottom = -s;
    scene.add(sunLight);
    const ambientLight = new THREE.AmbientLight(0x223344, 0.12);
    scene.add(ambientLight);
    scene.add(new THREE.HemisphereLight(0x445566, 0x111111, 0.08));

    // Initial positions
    const S = simRef.current;
    positionSun(sunMesh, S.tod);
    positionEarth(earthData.group, S.tod);
    sunLight.position.copy(sunMesh.position);
    landerGroup.position.set(0, MOON_R + S.alt * 0.003 + 0.5, 0);

    function applyTOD() {
      const cfgs = [
        { si: 2.2, sc: 0xffffff, ai: 0.14, ac: 0x223344, exp: 1.2 },
        { si: 0.55, sc: 0xffaa66, ai: 0.06, ac: 0x111122, exp: 0.5 },
        { si: 0.04, sc: 0x4466aa, ai: 0.025, ac: 0x060612, exp: 0.22 },
      ];
      const c = cfgs[S.tod];
      sunLight.intensity = c.si; sunLight.color.set(c.sc);
      ambientLight.intensity = c.ai; ambientLight.color.set(c.ac);
      renderer.toneMappingExposure = c.exp;
      sunLight.position.copy(sunMesh.position);
    }
    applyTOD();

    let thrusterSystem = null;

    sceneRef.current = {
      renderer, scene, camera, controls, sunMesh, earthData, landerGroup,
      sunLight, ambientLight, starData, thrusterSystem,
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

      // Simulation tick
      const S = simRef.current;
      if (S.on && S.phase > 0 && S.phase < 5) {
        const d = dt * S.speed;
        S.t += d;
        switch (S.phase) {
          case 1: S.alt-=d*200; S.hVel-=d*30; S.vSpd=-200+(15000-S.alt)*.01; S.fuel-=d*.5; S.thrust=100;
            if(S.alt<=7000){S.phase=2; showToast(2);} break;
          case 2: S.alt-=d*120; S.hVel-=d*25; S.vSpd=-120+(7000-S.alt)*.005; S.fuel-=d*.4; S.thrust=80;
            if(S.alt<=2000){S.phase=3; showToast(3);} break;
          case 3: S.alt-=d*50; S.hVel-=d*20; S.vSpd=-50+(2000-S.alt)*.02; S.fuel-=d*.3; S.thrust=60;
            if(S.alt<=100){S.phase=4; showToast(4);} break;
          case 4: S.alt-=d*5; S.hVel*=.98; S.vSpd=-2-S.alt*.02; S.fuel-=d*.2; S.thrust=30+S.alt*.3;
            if(S.alt<=0){
              S.alt=0;S.hVel=0;S.vSpd=0;S.thrust=0;S.phase=5;S.on=false;
              showToast(5);
              if(refs.thrusterSystem) refs.thrusterSystem.visible = false;
              setStatus('LANDED');
            } break;
        }
        S.alt = Math.max(0, S.alt); S.hVel = Math.max(0, S.hVel); S.fuel = Math.max(0, S.fuel);
        refs.landerGroup.position.set(0, MOON_R + Math.max(S.alt, 0)*0.003 + 0.5, 0);

        // Attitude wobble
        if (S.phase >= 1 && S.phase <= 3) {
          refs.landerGroup.rotation.z = Math.sin(S.t*0.5)*0.025;
          refs.landerGroup.rotation.x = Math.cos(S.t*0.7)*0.018;
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
            ud.lives[i] -= d*3;
            if (ud.lives[i] <= 0) {
              p.array[i*3] = (Math.random()-0.5)*0.7;
              p.array[i*3+1] = -0.4;
              p.array[i*3+2] = (Math.random()-0.5)*0.7;
              ud.lives[i] = 0.2+Math.random()*0.7;
              ud.vels[i].set((Math.random()-0.5)*3*ts, -(5+Math.random()*10)*ts, (Math.random()-0.5)*3*ts);
            } else {
              p.array[i*3] += ud.vels[i].x*d;
              p.array[i*3+1] += ud.vels[i].y*d;
              p.array[i*3+2] += ud.vels[i].z*d;
            }
          }
          p.needsUpdate = true;
        }

        // Update telemetry state (throttled to ~10fps)
        if (Math.floor(S.t * 10) % 1 === 0) {
          setTel({ alt: S.alt, hVel: S.hVel, vSpd: S.vSpd, fuel: S.fuel, thrust: S.thrust, phase: S.phase, t: S.t });
        }
      }

      // Camera
      const lp = refs.landerGroup.position.clone();
      if (S.cam !== 4) {
        switch (S.cam) {
          case 0: camera.position.lerp(lp.clone().add(new THREE.Vector3(18,8+S.alt*0.0008,28)),0.035);
            controls.target.lerp(lp,0.05); break;
          case 1: camera.position.lerp(lp.clone().add(new THREE.Vector3(35,4,0)),0.035);
            controls.target.lerp(lp,0.05); break;
          case 2: camera.position.lerp(new THREE.Vector3(12,MOON_R+1,12),0.035);
            controls.target.lerp(lp,0.05); break;
          case 3: camera.position.lerp(lp.clone().add(new THREE.Vector3(0,1.5,0)),0.05);
            controls.target.lerp(lp.clone().add(new THREE.Vector3(0,-40,4)),0.05); break;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    const resizeOb = new ResizeObserver(() => {
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w/h;
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
    setTimeout(() => setToast(null), 2800);
  }

  const toggleSim = useCallback(() => {
    const S = simRef.current;
    const refs = sceneRef.current;
    if (!refs || S.phase >= 5) return;
    if (S.on) {
      S.on = false;
      setStatus('PAUSED');
    } else {
      if (S.phase === 0) {
        S.phase = 1; S.thrust = 100;
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
    S.fuel = 100; S.thrust = 0;
    refs.landerGroup.position.set(0, MOON_R + S.alt*0.003 + 0.5, 0);
    refs.landerGroup.rotation.set(0, 0, 0);
    if (refs.thrusterSystem) {
      refs.landerGroup.remove(refs.thrusterSystem);
      refs.setThruster(null);
    }
    setTel({ alt: 15000, hVel: 1680, vSpd: -120, fuel: 100, thrust: 0, phase: 0, t: 0 });
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
    const S = simRef.current;
    const refs = sceneRef.current;
    if (!refs) return;
    S.tod = t;
    positionSun(refs.sunMesh, t);
    positionEarth(refs.earthData.group, t);
    refs.applyTOD();
    setTod(t);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e) => {
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); toggleSim(); break;
        case 'r': resetSim(); break;
        case 'c': cycleCam(); break;
        case 'v': cycleSpd(); break;
        case '1': changeTod(0); break;
        case '2': changeTod(1); break;
        case '3': changeTod(2); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSim, resetSim, cycleCam, cycleSpd, changeTod]);

  // ── Format helpers ──
  const fmtAlt = tel.alt >= 1000 ? (tel.alt/1000).toFixed(2)+' km' : tel.alt.toFixed(1)+' m';
  const mins = Math.floor(tel.t / 60), secs = Math.floor(tel.t % 60);
  const hrs = Math.floor(mins / 60);
  const clockStr = `T+ ${String(hrs).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const altPct = Math.max(1, tel.alt / 15000 * 100);

  return (
    <div className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-gray-800 bg-[#040711]`}>
      {/* Three.js mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* ── TOP BAR ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-b from-[#04080fea] via-[#04080f99] to-transparent pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="w-7 h-7 rounded-full border border-blue-500/40 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full border border-blue-500/60" />
          </div>
          <span className="text-sm font-semibold tracking-[4px] text-blue-300">ASTRA 2026</span>
          <span className="text-[10px] text-gray-500 tracking-wider ml-1">LUNAR DESCENT</span>
        </div>
        <span className="text-lg font-light tracking-widest text-blue-200/80 tabular-nums">{clockStr}</span>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 pointer-events-auto">
          <div className={`w-1.5 h-1.5 rounded-full ${status === 'LANDED' ? 'bg-emerald-400' : status === 'DESCENDING' ? 'bg-amber-400 animate-pulse' : 'bg-blue-400 animate-pulse'}`} />
          <span className="text-[10px] tracking-widest text-blue-300 uppercase">{status}</span>
        </div>
      </div>

      {/* ── LEFT PANEL: Telemetry ── */}
      <div className="absolute top-14 left-3 z-10 bg-[#020a1ad9] border border-blue-500/10 rounded-lg p-3 min-w-[185px] backdrop-blur-xl pointer-events-auto">
        <h3 className="text-[9px] uppercase tracking-[2.5px] text-blue-400/70 mb-2 pb-1.5 border-b border-blue-500/10 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-blue-400/70" /> Flight Telemetry
        </h3>
        <Row label="Altitude" value={fmtAlt} />
        <Row label="H-Velocity" value={`${tel.hVel.toFixed(0)} m/s`} />
        <Row label="V-Speed" value={`${tel.vSpd.toFixed(1)} m/s`} cls={Math.abs(tel.vSpd)>100?'text-red-400':Math.abs(tel.vSpd)>50?'text-amber-400':''} />
        <Row label="Thrust" value={`${tel.thrust.toFixed(0)} %`} />
        <Row label="Fuel" value={`${tel.fuel.toFixed(0)} %`} cls={tel.fuel>50?'text-emerald-400':tel.fuel>20?'text-amber-400':'text-red-400'} />
        <Row label="Phase" value={PHASES[tel.phase].n} />
      </div>

      {/* ── RIGHT PANEL: Environment ── */}
      <div className="absolute top-14 right-3 z-10 bg-[#020a1ad9] border border-blue-500/10 rounded-lg p-3 min-w-[185px] backdrop-blur-xl pointer-events-auto text-right">
        <h3 className="text-[9px] uppercase tracking-[2.5px] text-blue-400/70 mb-2 pb-1.5 border-b border-blue-500/10 flex items-center justify-end gap-1.5">
          Environment <span className="w-1 h-1 rounded-full bg-blue-400/70" />
        </h3>
        <Row label="Sun Elev." value={`${SUN_ELS[tod].toFixed(1)}°`} right />
        <Row label="Earth Visible" value="YES" cls="text-emerald-400" right />
        <Row label="Earth Elev." value={`${EARTH_ELS[tod].toFixed(1)}°`} right />
        <Row label="Surface Temp" value={TEMPS[tod]} right />
        <Row label="Lighting" value={LIGHT_NAMES[tod]} right />
        <Row label="Lat / Lon" value="69.37°S 32.35°E" right />
      </div>

      {/* ── ALTITUDE GAUGE ── */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-[30px] h-[220px] rounded-full bg-[#020a1acc] border border-blue-500/10 overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 rounded-b-full transition-all duration-300 opacity-70"
          style={{ height: `${altPct}%`, background: 'linear-gradient(0deg, #4aeaaa, #4a90cc 50%, #4a60cc)' }} />
      </div>

      {/* ── TOD ICONS ── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2.5 pointer-events-auto">
        {[0,1,2].map(t => (
          <button key={t} onClick={() => changeTod(t)}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-all cursor-pointer
              ${tod===t ? 'bg-blue-500/15 border-blue-500/40' : 'bg-[#020a1acc] border-blue-500/10 hover:border-blue-500/30'}`}>
            {['☀️','🌅','🌙'][t]}
          </button>
        ))}
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-6 py-2.5 rounded-lg bg-[#020a1ae6] border border-blue-500/25 backdrop-blur-xl text-center animate-pulse">
          <h2 className="text-sm font-medium tracking-[3px] text-blue-300">{toast.n}</h2>
          <p className="text-[10px] text-gray-500 tracking-wider mt-0.5">{toast.d}</p>
        </div>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2.5 px-4 py-3 bg-gradient-to-t from-[#04080fea] via-[#04080f99] to-transparent z-10 pointer-events-auto">
        <Btn primary onClick={toggleSim} disabled={tel.phase >= 5}>
          {tel.phase === 0 ? '▶ Begin Descent' : status === 'PAUSED' ? '▶ Resume' : tel.phase >= 5 ? '✓ Landed' : '⏸ Pause'}
        </Btn>
        <Btn onClick={resetSim}>↺ Reset</Btn>
        <Btn onClick={cycleCam}>📷 {CAM_NAMES[cam]}</Btn>
        <Btn onClick={cycleSpd}>⏱ {speed}×</Btn>
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
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] tracking-wider uppercase transition-all cursor-pointer
        ${primary
          ? 'bg-gradient-to-br from-blue-600/30 to-blue-500/15 border border-blue-500/35 text-blue-200 hover:from-blue-600/45 hover:border-blue-400/50'
          : 'bg-[#14284650] border border-blue-500/15 text-blue-300/70 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
}
