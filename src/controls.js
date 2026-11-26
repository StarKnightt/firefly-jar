// Input: WASD + mouse look on desktop, a floating thumbstick + drag to look on touch.
// Both produce the same three things: a move vector, look deltas, and catch attempts.
import * as THREE from 'three/webgpu';
import { FENCE, GATE, HOUSE, heightAt } from './world/layout.js';

const WALK = 2.15, RUN = 3.4; // metres per second for short legs

export function createControls(game, { onCatch, onLockChange }) {
  const { canvas } = game;
  const keys = new Set();
  const move = new THREE.Vector2(); // x strafe, y forward
  const state = { locked: false, touch: false, enabled: false, dragLook: false };
  const stickEl = document.getElementById('stick');
  const knobEl = stickEl.querySelector('i');
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouchDevice) { document.documentElement.classList.add('touch-ui'); state.touch = true; }

  const look = (dx, dy, sens) => {
    const p = game.player;
    p.yaw -= dx * sens;
    p.pitch = THREE.MathUtils.clamp(p.pitch - dy * sens, -1.15, 1.2);
  };

  // ---------- keyboard ----------
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.includes(e.code)) { keys.add(e.code); if (state.enabled) e.preventDefault(); }
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && state.enabled && !e.repeat) onCatch(0, 0, false);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ---------- mouse ----------
  const canLock = 'requestPointerLock' in canvas && !game.params.has('nolock');
  const requestLock = () => {
    if (!canLock || state.touch) return;
    try {
      const r = canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch { /* fall back to drag look */ } });
    } catch { try { canvas.requestPointerLock(); } catch { /* fall back to drag look */ } }
  };
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    document.documentElement.classList.toggle('locked', state.locked);
    onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => { state.dragLook = true; });

  let mouseDown = null;
  canvas.addEventListener('mousedown', (e) => {
    if (!state.enabled || e.button !== 0) return;
    if (state.locked) { onCatch(0, 0, false); return; }
    mouseDown = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  window.addEventListener('mousemove', (e) => {
    if (!state.enabled) return;
    if (state.locked) { look(e.movementX, e.movementY, 0.0021); return; }
    if (mouseDown) {
      // No pointer lock (embedded frames, some browsers): hold and drag to look.
      mouseDown.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      look(e.movementX, e.movementY, 0.0032);
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (!mouseDown) return;
    if (mouseDown.moved < 6 && state.enabled) {
      // A click without a drag is a reach for whatever is under the cursor.
      onCatch((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1), false);
      if (canLock && !state.dragLook) requestLock();
    }
    mouseDown = null;
  });

  // ---------- touch ----------
  const touches = new Map();
  let stickId = null, lookId = null;
  const STICK_R = 54;
  const setStick = (x, y, active) => {
    stickEl.classList.toggle('active', active);
    if (active) { stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'; }
    else { stickEl.style.left = ''; stickEl.style.top = ''; knobEl.style.transform = ''; }
  };
  const onDown = (e) => {
    if (e.pointerType === 'mouse' || !state.enabled) return;
    state.touch = true;
    document.documentElement.classList.add('touch-ui');
    const t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, role: null };
    touches.set(e.pointerId, t);
    // Left side steers, right side looks. A quick tap anywhere is a catch.
    const left = e.clientX < window.innerWidth * 0.42;
    if (left && stickId === null) { t.role = 'stick'; stickId = e.pointerId; }
    else if (lookId === null) { t.role = 'look'; lookId = e.pointerId; }
    e.preventDefault();
  };
  const onMove = (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    t.moved = Math.max(t.moved, Math.hypot(t.x - t.x0, t.y - t.y0));
    // A swipe across the screen turns you about the same amount whichever way the phone is held.
    if (t.role === 'look') look(dx, dy, 3.4 / Math.max(520, window.innerWidth));
    else if (t.role === 'stick' && t.moved > 9) {
      if (!t.shown) { t.shown = true; setStick(t.x0, t.y0, true); }
      let sx = t.x - t.x0, sy = t.y - t.y0;
      const len = Math.hypot(sx, sy);
      if (len > STICK_R) { sx *= STICK_R / len; sy *= STICK_R / len; }
      knobEl.style.transform = `translate(${sx}px, ${sy}px)`;
      t.vx = sx / STICK_R; t.vy = -sy / STICK_R;
    }
    e.preventDefault();
  };
  const onUp = (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    touches.delete(e.pointerId);
    const quick = performance.now() - t.t0 < 320 && t.moved < 14;
    if (quick && state.enabled) onCatch((t.x / window.innerWidth) * 2 - 1, -((t.y / window.innerHeight) * 2 - 1), true);
    if (t.role === 'stick') { stickId = null; setStick(0, 0, false); }
    if (t.role === 'look') lookId = null;
  };
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Stop the page from scrolling, zooming or selecting under the thumbs.
  for (const ev of ['touchstart', 'touchmove', 'gesturestart']) document.addEventListener(ev, (e) => { if (state.enabled && e.target === canvas) e.preventDefault(); }, { passive: false });

  const vel = new THREE.Vector3(), wish = new THREE.Vector3();
  const api = {
    state, requestLock, keys, colliders: [], side: 'meadow',
    autopilot: null, // { x, y, run } set by the trailer director
    enable(on) { state.enabled = on; if (!on) { keys.clear(); touches.clear(); stickId = lookId = null; setStick(0, 0, false); } },
    exitLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    update(dt) {
      const p = game.player;
      move.set(0, 0);
      let run = false;
      if (state.enabled) {
        if (keys.has('KeyW') || keys.has('ArrowUp')) move.y += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) move.y -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) move.x += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) move.x -= 1;
        run = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const st = stickId !== null ? touches.get(stickId) : null;
        if (st && st.vx !== undefined) { move.x += st.vx; move.y += st.vy; }
      }
      if (api.autopilot) { move.set(api.autopilot.x, api.autopilot.y); run = !!api.autopilot.run; }
      const len = move.length();
      if (len > 1) move.multiplyScalar(1 / len);
      const speed = run ? RUN : WALK;
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      // yaw 0 faces -z; forward = (-sin, -cos), right = (cos, -sin).
      wish.set((-sin * move.y + cos * move.x) * speed, 0, (-cos * move.y - sin * move.x) * speed);
      const k = 1 - Math.exp(-dt * (len > 0.01 ? 7 : 9));
      vel.x += (wish.x - vel.x) * k; vel.z += (wish.z - vel.z) * k;
      p.pos.x += vel.x * dt; p.pos.z += vel.z * dt;

      // The fence keeps you in the pasture; the oak and the swing are solid.
      // The fence keeps you in the pasture, except through the open gate, where the path
      // leads across the yard to the foot of the porch steps.
      const m = 0.75, fz = FENCE.minZ, half = GATE.width / 2 - 0.5;
      const inGate = Math.abs(p.pos.x - GATE.x) < half;
      if (p.pos.z > fz + m) api.side = 'meadow'; else if (p.pos.z < fz - m) api.side = 'yard';
      else if (!inGate) p.pos.z = api.side === 'yard' ? fz - m : fz + m;
      else p.pos.x = THREE.MathUtils.clamp(p.pos.x, GATE.x - half, GATE.x + half);
      if (api.side === 'yard' && p.pos.z < fz - m) {
        p.pos.x = THREE.MathUtils.clamp(p.pos.x, HOUSE.x - 13, HOUSE.x + 15);
        p.pos.z = Math.max(p.pos.z, HOUSE.z + 7.7);
      } else {
        p.pos.x = THREE.MathUtils.clamp(p.pos.x, FENCE.minX + m, FENCE.maxX - m);
        p.pos.z = Math.min(p.pos.z, FENCE.maxZ - m);
      }
      for (const c of api.colliders) {
        const dx = p.pos.x - c.x, dz = p.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.3;
        if (d < r && d > 0.0001) { p.pos.x = c.x + dx / d * r; p.pos.z = c.z + dz / d * r; }
      }
      p.pos.y = heightAt(p.pos.x, p.pos.z);
      const v = Math.hypot(vel.x, vel.z);
      p.speed += (Math.min(1.6, v / WALK) - p.speed) * (1 - Math.exp(-dt * 8));
      const prevBob = p.bob;
      p.bob += dt * v * 3.5;
      // Footfall: twice per bob cycle.
      if (Math.floor(p.bob / Math.PI) !== Math.floor(prevBob / Math.PI) && v > 0.6) game.onStep?.(v / WALK);
      p.vel.copy(vel);
    },
  };
  return api;
}
