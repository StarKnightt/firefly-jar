import * as THREE from 'three/webgpu';
import { pass, uniform, screenUV, vec2, float, length, smoothstep, mix, vec3 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import './style.css';
import { TimeOfDay, U, MOON_DIR } from './tod.js';
import { pickTier } from './quality.js';
import { createSky, createFogNode } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createGrass } from './world/grass.js';
import { EYE, START, START_YAW, heightAt } from './world/layout.js';
import { loadAssets } from './assets.js';
import { createOak, createFarTrees } from './world/trees.js';
import { createFence, createPowerLine, createTown } from './world/fence.js';
import { createHouse } from './world/house.js';
import { createFarFlies } from './world/farflies.js';
import { createRig } from './rig.js';
import { createFireflies } from './fireflies.js';
import { createControls } from './controls.js';
import { AudioEngine } from './audio.js';
import { createUI } from './ui.js';
import { createFlow } from './flow.js';
import { createBody } from './body.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DET = params.has('det'); // deterministic stepping for capture
const canvas = document.getElementById('game');
if (params.has('noui')) document.getElementById('ui').style.display = 'none';

const game = {
  params, DEBUG, DET, canvas,
  tier: pickTier(params),
  time: 0, dt: 0, frame: 0,
  count: 0, goal: 20,
  phase: 'loading', // loading | title | play | ending | done
  tod: new TimeOfDay(),
  todTarget: 0,
  player: { pos: START.clone(), yaw: START_YAW, pitch: -0.06, vel: new THREE.Vector3(), bob: 0, speed: 0 },
  updaters: [], late: [],
  gpu: null,
  errors: [],
};
window.__ffj = game;

function fail(msg) {
  document.getElementById('failmsg').textContent = msg;
  document.getElementById('fail').classList.add('show');
  document.getElementById('title').classList.remove('show');
}

async function boot() {
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: game.tier.samples > 1, powerPreference: 'high-performance',
    forceWebGL: params.has('webgl'),
  });
  await renderer.init();
  game.renderer = renderer;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Which GPU did we really get? Queried, never assumed.
  const backend = renderer.backend;
  game.gpu = { api: backend.isWebGPUBackend ? 'webgpu' : 'webgl2', adapter: 'unknown' };
  try {
    if (backend.isWebGPUBackend) {
      const info = backend.device?.adapterInfo || (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))?.info;
      if (info) game.gpu.adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' | ');
    } else {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) game.gpu.adapter = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    }
  } catch { /* adapter info is diagnostic only */ }
  if (DEBUG) console.log('[gpu]', game.gpu.api, game.gpu.adapter, 'tier', game.tier.name);

  const scene = new THREE.Scene();
  game.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 2000);
  camera.rotation.order = 'YXZ';
  game.camera = camera;
  scene.add(camera);

  const assets = await loadAssets(renderer, game.tier);
  game.assets = assets;

  // ---- world ----
  scene.fogNode = createFogNode();
  const sky = createSky();
  scene.add(sky);
  scene.add(createTerrain(assets.tex));
  scene.add(createGrass(game.tier));
  const oak = createOak(assets);
  const house = createHouse(assets);
  scene.add(oak.group, house.group, createFarTrees(assets, game.tier), createFence(assets), createPowerLine(), createTown());
  scene.add(createFarFlies(game.tier.farflies));
  game.oak = oak; game.house = house;
  game.updaters.push(() => { oak.update(game.time); house.update(game.time, game.tod.value); });

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(game.tier.shadow, game.tier.shadow);
  const sc = key.shadow.camera;
  const sr = game.tier.shadowRange;
  sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.near = 1; sc.far = 520;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = game.tier.name === 'low' ? 0.22 : 0.1;
  key.shadow.radius = 2.5;
  scene.add(key, key.target);
  game.lights = { hemi, key };

  const rig = createRig(game);
  game.rig = rig;
  game.late.push((dt) => rig.update(dt));

  const fireflies = createFireflies(game);
  game.fireflies = fireflies;
  game.late.push((dt) => fireflies.update(dt));
  const audio = new AudioEngine();
  game.audio = audio;
  let flow = null;
  const ui = createUI(game, {
    onBegin: () => flow.begin(), onResume: () => flow.resume(), onAgain: () => flow.again(),
    onMute: (off) => audio.setMuted(off),
    fireflyAt: (x, y) => flow.fireflyAt(x, y), tapCatch: (x, y) => flow.tryCatch((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1), true),
  });
  game.ui = ui;
  const controls = createControls(game, { onCatch: (x, y, touch) => flow.tryCatch(x, y, touch), onLockChange: (l) => flow.lockChanged(l) });
  controls.colliders = oak.colliders;
  game.controls = controls;
  flow = createFlow(game);
  game.flow = flow;
  game.onStep = (v) => { if (audio.ready && !DET) audio.step(v); game.audioLog?.push({ t: game.time, type: 'step', v }); };
  game.updaters.push((dt) => controls.update(dt), (dt) => flow.update(dt));
  const body = createBody(game);
  game.late.push(() => body.update());
  document.addEventListener('visibilitychange', () => {
    if (!audio.ctx) return;
    if (document.hidden) audio.ctx.suspend?.(); else audio.ctx.resume?.();
  });

  // Look-dev and test hook: jump to any moment of the evening.
  game.debugState = async (kv) => {
    if ('tod' in kv) { game.tod.set(kv.tod); game.todTarget = kv.tod; }
    if ('x' in kv) game.player.pos.x = kv.x;
    if ('z' in kv) game.player.pos.z = kv.z;
    if ('yaw' in kv) game.player.yaw = kv.yaw;
    if ('pitch' in kv) game.player.pitch = kv.pitch;
    if ('count' in kv) { game.count = kv.count; rig.setCount(kv.count, game.goal); rig.state.glow = kv.count / game.goal; fireflies.setJarCount(kv.count); ui.setCount(kv.count, false); }
    if ('begin' in kv && game.phase === 'title') flow.begin();
    if ('lock' in kv) { game.todLock = !!kv.lock; game.camLock = !!kv.lock; }
    if ('lift' in kv) rig.state.lift = kv.lift;
    if ('handK' in kv) { rig.state.handK = kv.handK; rig.state.catchT = -1; }
    if ('lidLift' in kv) rig.state.lidLift = kv.lidLift;
    if ('carry' in kv) rig.state.carry = kv.carry;
    if ('rigview' in kv) {
      // Park the rig in open air and orbit it, to check the grip from outside.
      const v = kv.rigview;
      if (v) { scene.add(rig.rig); rig.rig.position.set(0, 60, 0); rig.rig.rotation.set(0, 0, 0); }
      else { camera.add(rig.rig); rig.rig.position.set(0, 0, 0); }
      const c = new THREE.Vector3(0, 60 - 0.17, -0.405);
      const views = { 1: [0, 0.5, 0.001], 2: [-0.5, 0.05, 0], 3: [0, 0.12, -0.5], 4: [0.32, 0.28, 0.3], 5: [0, 0.17, 0.405], 6: [0.5, 0.08, 0.02] };
      game.camOverride = v ? { pos: c.clone().add(new THREE.Vector3(...views[v])), look: c } : null;
    }
  };

  // ---- post ----
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(sceneColor, 0.42, 0.62, 0.92);
  game.bloomPass = bloomPass;
  const vig = uniform(0.34);
  const d = length(screenUV.sub(0.5).mul(vec2(1.0, 0.82)));
  const vignette = float(1.0).sub(smoothstep(0.30, 0.86, d).mul(vig));
  const fade = uniform(1);
  game.fade = fade;
  const graded = sceneColor.add(bloomPass).mul(vignette);
  pipeline.outputNode = mix(vec3(0.0), graded.rgb, fade);
  game.pipeline = pipeline;

  // ---- per-frame world update ----
  const todState = () => game.tod.state;
  const shadowTarget = new THREE.Vector3();
  game.applyTod = () => {
    const s = todState();
    hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGnd); hemi.intensity = s.hemiInt;
    key.color.copy(U.lightCol.value); key.intensity = 1;
    renderer.toneMappingExposure = s.exposure;
  };
  game.updateWorld = () => {
    const p = game.player;
    sky.position.copy(camera.position);
    U.camPos.value.copy(camera.position);
    U.time.value = game.time;
    // Shadow frustum follows the player on a coarse grid so shadows don't swim.
    const snap = 8;
    shadowTarget.set(Math.round(p.pos.x / snap) * snap, 0, Math.round(p.pos.z / snap) * snap);
    key.target.position.copy(shadowTarget);
    key.position.copy(shadowTarget).addScaledVector(U.lightDir.value, 260);
  };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, game.tier.maxDpr);
    const px = w * h * dpr * dpr;
    if (px > game.tier.maxPixels) dpr *= Math.sqrt(game.tier.maxPixels / px);
    game.dpr = dpr * (game.dprScale || 1);
    renderer.setPixelRatio(game.dpr);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // Hold the horizontal view steady on tall phone screens.
    const base = 62;
    camera.fov = aspect >= 1.3 ? base : THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * (1.3 / aspect))), base, 88);
    camera.updateProjectionMatrix();
    game.portrait = aspect < 1;
  }
  game.resize = resize;
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  game.tod.set(params.has('tod') ? parseFloat(params.get('tod')) : 0);
  game.todTarget = game.tod.value;

  function placeCamera() {
    const p = game.player;
    p.pos.y = game.controls ? game.controls.groundAt(p.pos.x, p.pos.z) : heightAt(p.pos.x, p.pos.z);
    camera.position.set(p.pos.x, p.pos.y + EYE + Math.sin(p.bob) * 0.022 * p.speed, p.pos.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
    if (game.camOverride) { camera.position.copy(game.camOverride.pos); camera.lookAt(game.camOverride.look); }
    camera.updateMatrixWorld(true);
  }
  game.placeCamera = placeCamera;

  game.update = (dt) => {
    game.dt = dt;
    game.time += dt;
    game.frame++;
    for (const u of game.updaters) u(dt);
    placeCamera();
    for (const u of game.late) u(dt);
    game.applyTod();
    game.updateWorld();
  };

  game.render = () => pipeline.render();

  // ---- loop ----
  let last = performance.now();
  const frameTimes = new Float32Array(600);
  let ft = 0;
  game.frameTimes = frameTimes;
  // ---- frame-rate governor ----
  // For GPUs that cannot keep up (phones above all). If play stays under about 42 fps, try drawing
  // 38% of the pixels for a moment. If that clearly helps, the GPU was the limit: keep the lower
  // resolution (and go to a quarter of the pixels if it is still slow). If it does not help, the
  // frame rate is capped by something else (a battery saver, a slow CPU): put the resolution back
  // and leave it alone. It never runs in deterministic captures, and decides once per session.
  const gov = { state: 'watch', floor: +(params.get('gov') || 42), t: 0, n: 0, skip: 1.5, before: 0, scale: 1, log: [] };
  game.gov = gov;
  const govSet = (scale) => { gov.scale = scale; game.dprScale = scale; resize(); };
  function govern(ms) {
    if (gov.state === 'done' || (game.phase !== 'play' && game.phase !== 'ending')) { gov.t = 0; gov.n = 0; return; }
    if (ms > 250) return; // a stall or a hidden tab, not a slow GPU
    if (gov.skip > 0) { gov.skip -= ms / 1000; return; }
    gov.t += ms; gov.n++;
    if (gov.t < 2500) return;
    const fps = gov.n / (gov.t / 1000);
    gov.t = 0; gov.n = 0; gov.skip = 0.5;
    gov.log.push({ state: gov.state, scale: gov.scale, fps: +fps.toFixed(1) });
    if (gov.state === 'watch') {
      if (fps < gov.floor) { gov.before = fps; gov.state = 'probe'; govSet(0.62); }
    } else if (gov.state === 'probe') {
      if (fps > gov.before * 1.2) { if (fps < gov.floor) govSet(0.5); gov.state = 'done'; }
      else { govSet(1); gov.state = 'done'; }
      if (DEBUG) console.log('[gov]', JSON.stringify(gov.log), 'scale', gov.scale);
    }
  }
  function tick(now) {
    const raw = (now - last) / 1000;
    last = now;
    frameTimes[ft++ % frameTimes.length] = raw * 1000;
    govern(raw * 1000);
    game.update(Math.min(raw, 0.05));
    game.render();
  }
  if (!DET) renderer.setAnimationLoop(tick);
  game.step = (dt = 1 / 60) => { game.update(dt); game.render(); };
  // For captures: resolve only when the GPU has finished everything submitted and the frame is on screen.
  game.settle = async () => {
    // Draw the current state once more inside an animation frame: a canvas only reliably shows what
    // was drawn during the browser's own frame, not what a long script drew between frames.
    await new Promise((r) => requestAnimationFrame(() => { game.render(); r(); }));
    try { if (backend.isWebGPUBackend) await backend.device.queue.onSubmittedWorkDone(); else renderer.getContext().finish(); } catch { /* best effort */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  game.phase = 'title';
  // Warm up before the button wakes: compile every pipeline and push a few real frames through
  // the GPU, so the first step into the meadow is smooth instead of a stall.
  try { await renderer.compileAsync(scene, camera); } catch { /* falls back to compiling on first draw */ }
  for (let i = 0; i < 5; i++) { game.update(1 / 60); game.render(); await game.settle(); }
  last = performance.now();
  game.ready = true;
  // The trailer director is only ever loaded for recording.
  if (params.has('trailer')) game.director = (await import('./director.js')).createDirector(game);
  ui.ready();
  if (params.has('autostart')) flow.begin();
  document.documentElement.classList.add('ready');
}

boot().catch((e) => {
  console.error(e);
  game.errors.push(String(e?.stack || e));
  fail(String(e?.message || e));
});

export const _m = MOON_DIR;
