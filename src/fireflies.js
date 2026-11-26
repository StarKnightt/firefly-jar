// Fireflies: the wild ones you can catch, the ones in the jar, catch sparkles,
// and at the very end the ones that fly up and become a constellation.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, attribute, modelViewMatrix, cameraProjectionMatrix, positionGeometry, exp, mix, smoothstep, length,
  abs, max, min, varying, uniform,
} from 'three/tsl';
import { FENCE, heightAt, OAK } from './world/layout.js';
import { U } from './tod.js';

const WILD_MAX = 20, JAR_MAX = 20, SPARK_MAX = 90;
const TOTAL = WILD_MAX + JAR_MAX + SPARK_MAX;

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// The outline of a jar, drawn in stars: lid, shoulders, body, base, and three lights inside.
const JAR_STARS = [
  [-0.5, 1.0], [0.0, 1.04], [0.5, 1.0], [0.5, 0.8], [0.64, 0.58], [0.68, 0.24], [0.68, -0.12], [0.67, -0.46], [0.6, -0.78], [0.3, -0.94],
  [-0.3, -0.94], [-0.6, -0.78], [-0.67, -0.46], [-0.68, -0.12], [-0.68, 0.24], [-0.64, 0.58], [-0.5, 0.8],
  [-0.16, 0.12], [0.2, -0.3], [0.06, 0.46],
];
const JAR_LINES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 0], [16, 3]];

export function createFireflies(game) {
  const rnd = mulberry(1987);
  const { camera, rig } = game;

  // ---- one instanced, camera-facing glow for everything ----
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
  const aPar = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 4), 4); // size, brightness, warmth, star
  const aExt = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL), 1);     // upward streak while flashing
  aPos.setUsage(THREE.DynamicDrawUsage); aPar.setUsage(THREE.DynamicDrawUsage); aExt.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aPar', aPar);
  geo.setAttribute('aExt', aExt);
  geo.instanceCount = TOTAL;

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const nPos = attribute('aPos', 'vec3'), nPar = attribute('aPar', 'vec4'), nExt = attribute('aExt', 'float');
  const view = modelViewMatrix.mul(vec4(nPos, 1.0));
  // Up close a firefly is still a small light, not a ball: cap its size on screen.
  const dist = view.z.negate().max(0.05);
  // ...and far away it never shrinks to nothing: one you can catch is always a light you can see,
  // on a phone as much as on a monitor.
  const minSize = uniform(0.0125);
  const size = min(nPar.x, dist.mul(0.02)).max(dist.mul(minSize).mul(nExt)).max(dist.mul(0.0016).mul(nPar.w.mul(3.0).add(1.0)));
  const quad = vec2(positionGeometry.x, positionGeometry.y);
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(quad.mul(size), 0.0, 0.0)));
  const vPar = varying(nPar, 'vFly');
  const vExt = varying(nExt, 'vFlyExt');
  mat.colorNode = Fn(() => {
    const p = vec2(positionGeometry.x, positionGeometry.y);
    const r2 = p.dot(p);
    const core = exp(r2.mul(-60.0));
    const halo = exp(r2.mul(-6.5)).mul(0.16);
    // Settled stars get a faint four-point glint.
    const glint = max(exp(abs(p.x).mul(-30.0)).mul(exp(abs(p.y).mul(-3.2))), exp(abs(p.y).mul(-30.0)).mul(exp(abs(p.x).mul(-3.2)))).mul(0.3).mul(vPar.w);
    const edge = smoothstep(1.0, 0.7, length(p));
    // Photinus chartreuse; amber inside the jar; pale gold once they are stars.
    const wild = vec3(0.66, 0.9, 0.04), heart = vec3(1.0, 0.92, 0.28), amber = vec3(1.0, 0.84, 0.2), star = vec3(1.0, 0.9, 0.62);
    const col = mix(mix(wild, amber, vPar.z), star, vPar.w);
    // The lantern is yellow at its heart and yellow-green at the edge.
    const hot = mix(col, heart, core.mul(float(1.0).sub(vPar.w)).mul(0.9));
    // A wider, softer halo marks the ones that can be caught; stars and sparks keep a tight one.
    const halo2 = exp(r2.mul(-2.6)).mul(0.1).mul(vExt);
    return vec4(hot.mul(core.mul(mix(float(2.7), float(4.2), max(vPar.z, vPar.w))).add(halo).add(halo2).add(glint)).mul(vPar.y).mul(edge), 1.0);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.name = 'fireflies';
  game.scene.add(mesh);

  const P = aPos.array, Q = aPar.array, E = aExt.array;
  const put = (i, pos, sz, bright, warmth = 0, star = 0, ext = 0) => {
    P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z;
    Q[i * 4] = sz; Q[i * 4 + 1] = bright; Q[i * 4 + 2] = warmth; Q[i * 4 + 3] = star;
    E[i] = ext;
  };
  const hide = (i) => { Q[i * 4 + 1] = 0; Q[i * 4] = 0; };

  // Faint lines joining the new stars into a jar, drawn only at the very end.
  const SEG = JAR_LINES.length;
  const lineGeo = new THREE.InstancedBufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  lineGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const lineA = new THREE.InstancedBufferAttribute(new Float32Array(SEG * 3), 3), lineB = new THREE.InstancedBufferAttribute(new Float32Array(SEG * 3), 3);
  lineA.setUsage(THREE.DynamicDrawUsage); lineB.setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('aA', lineA); lineGeo.setAttribute('aB', lineB);
  lineGeo.instanceCount = SEG;
  const lineOpacity = uniform(0), lineAspect = uniform(1.78), lineWidth = uniform(0.004);
  const lineMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  {
    // Lines with real width: each segment is a quad stretched between its two stars in screen space.
    const ca = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(attribute('aA', 'vec3'), 1.0)));
    const cb = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(attribute('aB', 'vec3'), 1.0)));
    const pa = ca.xy.div(ca.w), pb = cb.xy.div(cb.w);
    const d = pb.sub(pa).mul(vec2(lineAspect, 1.0)).normalize();
    const n = vec2(d.y.negate(), d.x).div(vec2(lineAspect, 1.0));
    // Stop a little short of each star so the line never runs through it.
    const tt = mix(float(0.1), float(0.9), positionGeometry.x);
    const c = mix(ca, cb, tt);
    lineMat.vertexNode = vec4(c.xy.add(n.mul(positionGeometry.y).mul(lineWidth).mul(c.w)), c.z, c.w);
    lineMat.colorNode = vec4(vec3(1.0, 0.86, 0.55).mul(lineOpacity).mul(smoothstep(1.0, 0.2, abs(positionGeometry.y))), 1.0);
  }
  const lines = new THREE.Mesh(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = 18;
  game.scene.add(lines);

  // ---- wild fireflies ----
  const wild = [];
  for (let i = 0; i < WILD_MAX; i++) {
    wild.push({
      i, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), home: new THREE.Vector3(),
      seed: rnd() * 100, period: 3 + rnd() * 3, clock: rnd() * 5, glow: 0, state: 'idle', t: 0, from: new THREE.Vector3(),
      height: 1, dart: 0, dartDir: new THREE.Vector2(), fade: 0, pulse: 0, flash: 0, spook: 0,
    });
  }

  const inFence = (x, z, m = 2.5) => x > FENCE.minX + m && x < FENCE.maxX - m && z > FENCE.minZ + m && z < FENCE.maxZ - m;

  // A firefly appears a short walk away, never right under your nose and never crowding another.
  function spawn(f, opts = {}) {
    const p = game.player.pos;
    const dark = THREE.MathUtils.smoothstep(game.tod.value, 0.3, 0.9);
    for (let tries = 0; tries < 30; tries++) {
      let a, r;
      if (opts.near) { a = game.player.yaw + (rnd() - 0.5) * 0.6; r = 5.5 + rnd() * 3.5; }
      else if (opts.into) { a = game.player.yaw + (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.3); r = 9 + rnd() * 5; }
      else if (opts.ahead) { a = game.player.yaw + (rnd() - 0.5) * 1.5; r = THREE.MathUtils.lerp(12, 15, dark) + rnd() * 9; }
      else { a = rnd() * Math.PI * 2; r = THREE.MathUtils.lerp(13, 17, dark) + rnd() * 24; }
      // yaw 0 looks down -z.
      const x = p.x - Math.sin(a) * r, z = p.z - Math.cos(a) * r;
      if (!inFence(x, z, 3)) continue;
      if (Math.hypot(x - OAK.x, z - OAK.z) < 2.2) continue;
      let crowded = false;
      for (const o of wild) if (o !== f && o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < (opts.gap ?? 10)) { crowded = true; break; }
      if (crowded) continue;
      f.height = 0.7 + Math.pow(rnd(), 1.5) * 0.85;
      f.pos.set(x, heightAt(x, z) + f.height, z);
      f.home.copy(f.pos);
      f.vel.set(0, 0, 0);
      f.alive = true; f.state = 'idle'; f.fade = 0; f.glow = 0; f.dart = 0; f.pulse = 0; f.spook = 0;
      f.period = 2.4 + rnd() * 2.6; f.clock = rnd() * f.period;
      f.dip = !opts.near && rnd() < 0.4 * dark;
      return true;
    }
    return false;
  }

  // ---- jar fireflies ----
  const jarFlies = [];
  for (let k = 0; k < JAR_MAX; k++) {
    jarFlies.push({ k, i: WILD_MAX + k, active: false, local: new THREE.Vector3(), seed: rnd() * 100, period: 1.8 + rnd() * 2.2, clock: rnd() * 3, enter: 0,
      star: new THREE.Vector3(), release: -1, world: new THREE.Vector3(), start: new THREE.Vector3(), spin: rnd() * 6.28, left: false, orbit: 1, orbitH: 1, dirSign: 1 });
  }

  // ---- sparkles ----
  const sparks = [];
  for (let k = 0; k < SPARK_MAX; k++) sparks.push({ i: WILD_MAX + JAR_MAX + k, life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.01, warm: 0.2 });
  let sparkHead = 0;
  function spark(pos, vel, life, sz, warm = 0.2) {
    const s = sparks[sparkHead++ % SPARK_MAX];
    s.pos.copy(pos); s.vel.copy(vel); s.life = s.max = life; s.size = sz; s.warm = warm;
  }

  const api = {
    mesh, wild, jarFlies, events: [],
    reach: 3.6,
    activeTarget: 5,
    released: 0,
    releasing: false,
    releaseClock: 0,
    spawnClock: 0,
    settled: 0,

    reset() {
      for (const f of wild) { f.alive = false; hide(f.i); }
      for (const j of jarFlies) { j.active = false; j.release = -1; j.left = false; hide(j.i); }
      for (const s of sparks) { s.life = 0; hide(s.i); }
      api.released = 0; api.releasing = false; api.spawnClock = 0; api.settled = 0;
      lines.visible = false; lineOpacity.value = 0;
      // The first few are right there in front of you as the evening opens; the rest are a walk away.
      for (let n = 0; n < 3; n++) spawn(wild[n], { near: true, gap: 3.2 });
      for (let n = 3; n < 6; n++) spawn(wild[n], n < 4 ? { ahead: true } : {});
    },

    setJarCount(n) {
      jarFlies.forEach((j, k) => {
        const on = k < n;
        if (on && !j.active) { j.active = true; j.enter = 1; j.left = false; j.release = -1; api.placeInJar(j); }
        if (!on) { j.active = false; hide(j.i); }
      });
    },

    placeInJar(j) {
      const a = rnd() * Math.PI * 2, r = rnd() < 0.4 ? rig.JAR_R - 0.0065 : Math.sqrt(rnd()) * (rig.JAR_R - 0.013);
      j.local.set(Math.cos(a) * r, 0.016 + rnd() * 0.1, Math.sin(a) * r);
    },

    // Screen-space pick. Returns {f, tooFar} or null. `loose` widens it, to find what a miss was aimed at.
    pick(ndcX, ndcY, radiusPx, loose = 1) {
      const w = window.innerWidth, h = window.innerHeight;
      let best = null, bestD = Infinity, far = null, farD = Infinity, startled = null, startledD = Infinity;
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        tmp.copy(f.pos).project(camera);
        if (tmp.z > 1 || tmp.z < -1) continue;
        const dx = (tmp.x - ndcX) * w * 0.5, dy = (tmp.y - ndcY) * h * 0.5;
        const d = Math.hypot(dx, dy);
        const dist3 = f.pos.distanceTo(camera.position);
        if (f.spook > 0) { if (dist3 <= api.reach * 1.6 && d <= radiusPx * loose * 1.6 && (!startled || d < startledD)) { startled = f; startledD = d; } continue; }
        // Nearer fireflies are bigger targets.
        const rad = radiusPx * loose * THREE.MathUtils.clamp(3.0 / dist3, 0.7, 1.8);
        if (d > rad) continue;
        if (dist3 <= api.reach) { if (d < bestD) { bestD = d; best = f; } }
        else if (dist3 <= 22 && d < farD) { farD = d; far = f; }
      }
      if (best) return { f: best, tooFar: false };
      if (far) return { f: far, tooFar: true, dist: far.pos.distanceTo(camera.position) };
      if (startled) return { f: startled, startled: true };
      return null;
    },

    catch(f) {
      f.state = 'caught';
      f.t = 0;
      f.from.copy(f.pos);
      for (let k = 0; k < 8; k++) {
        tmp.set(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).multiplyScalar(0.7);
        spark(f.pos, tmp, 0.5 + rnd() * 0.4, 0.014, 0.0);
      }
    },

    // Reached for, but out of reach: it flares so you can see which one, and where to walk.
    beckon(f) { f.pulse = 1; },

    // A swipe that missed: the nearest one flares and darts off.
    startle(f, amount = 1) {
      const p = game.player.pos;
      const dx = f.pos.x - p.x, dz = f.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      const side = rnd() < 0.5 ? -1 : 1;
      f.dartDir.set(dx / d * 0.75 - dz / d * 0.65 * side, dz / d * 0.75 + dx / d * 0.65 * side);
      f.dart = amount; f.pulse = 0.8;
    },

    // The ending: let them all go. They circle you once, then climb into a jar-shaped constellation.
    releaseAll(yaw, layout = {}) {
      const sc = layout.scale ?? 1, pitch = 0.86;
      // Where the camera will be looking when they arrive, and its right and up.
      const V = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const Rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const Up = new THREE.Vector3().crossVectors(Rt, V).normalize();
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfW = halfH * camera.aspect;
      const cx = (layout.x ?? 0) * halfW, cy = (layout.y ?? 0.2) * halfH;
      let k = 0;
      jarFlies.forEach((j) => {
        if (!j.active) return;
        j.release = Math.max(0.05, 0.2 + k * 0.4 + (rnd() - 0.5) * 0.7);
        j.turn = 0.9 + rnd() * 1.3;
        j.left = false;
        const [sx, sy] = JAR_STARS[k % JAR_STARS.length];
        j.star.copy(V).addScaledVector(Rt, cx + sx * 0.2 * sc).addScaledVector(Up, cy + sy * 0.26 * sc).normalize().multiplyScalar(420);
        j.spin = yaw + Math.PI + (rnd() - 0.5) * 0.6; // they leave over the far rim, then sweep round
        j.orbit = 1.0 + rnd() * 2.6;
        j.orbitH = 0.1 + rnd() * 1.9;
        j.dirSign = rnd() < 0.3 ? -1 : 1;
        k++;
      });
      api.released = 0;
      api.releaseClock = 0;
      api.releasing = true;
      api.settled = 0;
      lines.visible = true;
      lineOpacity.value = 0;
    },

    update(dt) {
      const time = game.time, tod = game.tod.value, p = game.player.pos;
      const night = THREE.MathUtils.smoothstep(tod, 0.3, 0.9);
      api.reach = THREE.MathUtils.lerp(3.6, 3.0, night);
      api.activeTarget = Math.round(THREE.MathUtils.lerp(6, 10, THREE.MathUtils.smoothstep(tod, 0.05, 0.8)));
      minSize.value = 0.0125 * THREE.MathUtils.clamp(1000 / window.innerHeight, 1, 2.3) * THREE.MathUtils.lerp(0.62, 1, THREE.MathUtils.smoothstep(tod, 0.1, 0.4));
      lineAspect.value = camera.aspect; lineWidth.value = 2.0 / window.innerHeight;
      const speedMul = 1 + night * 0.7;
      const playing = game.phase === 'play' || game.phase === 'title';

      // Keep the meadow populated, a few at a time.
      let alive = 0, ahead = 0;
      const fx = -Math.sin(game.player.yaw), fz = -Math.cos(game.player.yaw);
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        alive++;
        const dx = f.pos.x - p.x, dz = f.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < 26 && (dx * fx + dz * fz) / (d || 1) > 0.5) ahead++;
      }
      api.spawnClock += dt;
      if (playing && alive < api.activeTarget && api.spawnClock > 1.6) {
        const f = wild.find((w) => !w.alive);
        // Always leave something to walk toward in front of the player.
        if (f && spawn(f, ahead < 1 ? { ahead: true } : { gap: 9.5 })) api.spawnClock = 0;
      }

      const running = game.player.speed > 1.25;
      for (const f of wild) {
        if (!f.alive) { hide(f.i); continue; }
        if (f.state === 'idle') {
          // Wander: slow looping drift around a home point.
          const s = f.seed;
          const ax = Math.sin(time * 0.37 + s) + 0.6 * Math.sin(time * 0.83 + s * 2.1);
          const az = Math.cos(time * 0.31 + s * 1.3) + 0.6 * Math.sin(time * 0.71 + s * 0.7);
          tmp.set(ax, 0, az).multiplyScalar(0.36 * speedMul);
          tmp.x += (f.home.x - f.pos.x) * 0.1; tmp.z += (f.home.z - f.pos.z) * 0.1;
          // After dark they are shy: charge at one and it slips away, walk up and it lets you.
          const dx = f.pos.x - p.x, dz = f.pos.z - p.z, dp = Math.hypot(dx, dz);
          if (f.spook > 0) f.spook -= dt * (f.spookHow === 'close' && game.player.speed < 0.25 ? 3 : 1);
          if (night > 0.05 && dp < 4.2 && dp > 0.01) {
            const shy = night * 0.5 * (1 - dp / 4.2);
            tmp.x += dx / dp * shy; tmp.z += dz / dp * shy;
          }
          // Run at one in the dark and it flares, bolts, and will not be caught for a few seconds.
          if (night > 0.3 && running && dp < 5.5 && f.spook <= 0 && playing) {
            f.spook = 4.6; f.spookHow = 'run';
            api.startle(f, 2.6);
            api.events.push({ type: 'spooked', how: 'run' });
          } else if (night > 0.55 && game.player.speed > 0.55 && dp < 1.9 && f.spook <= 0 && playing && game.phase === 'play') {
            f.spook = 2.6; f.spookHow = 'close';
            api.startle(f, 1.4);
            api.events.push({ type: 'spooked', how: 'close' });
          }
          if (f.dart > 0.01) {
            tmp.x += f.dartDir.x * f.dart * 3.4; tmp.z += f.dartDir.y * f.dart * 3.4;
            f.home.x += f.dartDir.x * f.dart * dt * 2.2; f.home.z += f.dartDir.y * f.dart * dt * 2.2;
            f.dart *= Math.exp(-dt * 1.9);
          }
          if (!inFence(f.home.x, f.home.z, 2)) { f.home.x = THREE.MathUtils.clamp(f.home.x, FENCE.minX + 2, FENCE.maxX - 2); f.home.z = THREE.MathUtils.clamp(f.home.z, FENCE.minZ + 2, FENCE.maxZ - 2); }
          const snap = f.dart > 0.25 ? 7 : 1.8;
          f.vel.x += (tmp.x - f.vel.x) * Math.min(1, dt * snap);
          f.vel.z += (tmp.z - f.vel.z) * Math.min(1, dt * snap);

          // Blink: on for about half a second while it swoops up (the J a firefly draws), then dark.
          f.clock += dt;
          const ph = f.clock % f.period;
          const on = 0.52;
          const flash = ph < 0.07 ? ph / 0.07 : ph < on ? 1 - (ph - 0.07) / (on - 0.07) * 0.35 : Math.exp(-(ph - on) * 7) * 0.65;
          const swoopT = Math.min(1, ph / 0.6);
          const swoop = ph < 0.6 ? Math.sin(swoopT * Math.PI * 0.5) : Math.max(0, 1 - (ph - 0.6) / 1.4);
          const ground = heightAt(f.pos.x, f.pos.z);
          const high = f.dip ? (Math.sin(time * 0.8 + s * 3.1) * 0.5 + 0.5) * 2.1 : 0;
          const wantY = ground + f.height + high + Math.sin(time * 0.6 + s) * 0.14 + swoop * 0.32 - (ph < 0.1 ? 0.06 : 0);
          f.vel.y += ((wantY - f.pos.y) * 5.0 - f.vel.y) * Math.min(1, dt * 5);
          f.pos.addScaledVector(f.vel, dt);

          f.fade = Math.min(1, f.fade + dt * 0.8);
          f.pulse = Math.max(0, f.pulse - dt * 1.3);
          f.flash = flash;
          // By day a faint ember lets the eye follow one; at night they go properly dark between flashes.
          const inReach = f.spook <= 0 && f.pos.distanceTo(camera.position) < api.reach;
          const ember = Math.max(THREE.MathUtils.lerp(0.2, 0.08, night), inReach ? 0.34 : 0);
          f.glow = (ember + flash * (1 - ember)) * f.fade + f.pulse * 0.8;
          const day = 1 - THREE.MathUtils.smoothstep(tod, 0.1, 0.55);
          put(f.i, f.pos, 0.07 + flash * 0.03 + f.pulse * 0.05, f.glow * (2.0 + day * 1.6) * (f.spook > 0 ? 0.55 : 1), 0, 0, 1);

          if (dp > 46 && playing) f.alive = false;
        } else if (f.state === 'caught') {
          // Swoop over the rim and down into the jar.
          f.t += dt / 0.66;
          const t = Math.min(1, f.t);
          const e = t * t * (3 - 2 * t);
          rig.mouthWorld(tmp2);
          tmp3.copy(f.from).lerp(tmp2, 0.55); tmp3.y = Math.max(f.from.y, tmp2.y) + 0.2;
          const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
          f.pos.set(a * f.from.x + b * tmp3.x + c * tmp2.x, a * f.from.y + b * tmp3.y + c * tmp2.y, a * f.from.z + b * tmp3.z + c * tmp2.z);
          put(f.i, f.pos, 0.05 * (1 - e * 0.7), 2.0, 0.5 * e, 0, 1 - e);
          if (rnd() < dt * 50) { tmp.set((rnd() - 0.5) * 0.1, -0.04 + rnd() * 0.08, (rnd() - 0.5) * 0.1); spark(f.pos, tmp, 0.4 + rnd() * 0.3, 0.007, 0.1); }
          if (f.t >= 1) {
            f.alive = false; hide(f.i);
            api.events.push({ type: 'landed' });
          }
        }
      }

      {
        const near = wild.filter((f) => f.alive && f.state === 'idle').sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
        U.flyLights.forEach((u, n) => { const f = near[n]; if (f) u.value.set(f.pos.x, f.pos.y, f.pos.z, f.flash * 0.55 + f.pulse * 0.4); else u.value.set(0, -99, 0, 0); });
      }

      // In the jar: slow crawls and lazy blinks, out of step with each other.
      rig.rig.updateWorldMatrix(true, true);
      const M = rig.jar.group.matrixWorld;
      if (api.releasing) api.releaseClock += dt;
      const cam = camera.position;
      let settled = 0;
      for (const j of jarFlies) {
        if (!j.active) continue;
        j.clock += dt;
        j.enter = Math.max(0, j.enter - dt * 1.5);
        if (j.release >= 0 && api.releasing && api.releaseClock >= j.release) {
          const age = api.releaseClock - j.release;
          if (!j.left) {
            j.left = true; rig.mouthWorld(j.start);
            api.released++;
            api.events.push({ type: 'released', n: api.released });
          }
          // Out of the jar, a slow widening turn around the child holding it...
          const widen = THREE.MathUtils.smoothstep(age, 0.0, 2.6);
          const ang = j.spin + j.dirSign * age * (j.turn ?? 1.5) * (1 - widen * 0.3);
          const rad = widen * j.orbit;
          const px = THREE.MathUtils.lerp(j.start.x, cam.x, widen), pz = THREE.MathUtils.lerp(j.start.z, cam.z, widen);
          tmp.set(px + Math.sin(ang) * rad, j.start.y + age * 0.12 + widen * j.orbitH + Math.sin(age * 2.3 + j.seed) * 0.07 + Math.max(0, age - 4.5) * 0.5, pz + Math.cos(ang) * rad);
          // ...then the long climb to its place in the sky.
          const k = THREE.MathUtils.smoothstep(age, 4.6, 10.2);
          const kk = k * k * (1.6 - 0.6 * k);
          tmp2.copy(cam).add(j.star);
          j.world.copy(tmp).lerp(tmp2, kk);
          const d = j.world.distanceTo(cam);
          const ph = j.clock % j.period;
          const blink = 0.6 + 0.4 * Math.exp(-ph * 2.2);
          const twinkle = 0.84 + 0.16 * Math.sin(time * (2.2 + (j.seed % 3)) + j.seed);
          const arrive = THREE.MathUtils.smoothstep(age, 9.4, 11.0);
          if (arrive > 0.98) settled++;
          // Hold apparent size as it recedes, and swell a little as it takes its place.
          const nearSize = 0.06, farSize = d * (0.0085 + 0.0035 * Math.sin(arrive * Math.PI) + (j.k >= 17 ? 0.002 : 0));
          put(j.i, j.world, THREE.MathUtils.lerp(nearSize, farSize, THREE.MathUtils.smoothstep(k, 0.02, 0.6)), THREE.MathUtils.lerp(blink * 2.3, twinkle * (1.5 + Math.sin(arrive * Math.PI) * 1.2), k), 0.55, k, 1 - k);
          if (age < 7.5 && rnd() < dt * 26) { tmp3.set((rnd() - 0.5) * 0.06, -0.06, (rnd() - 0.5) * 0.06); spark(j.world, tmp3, 0.9, 0.012 + kk * 0.5, 0.5); }
          continue;
        }
        const s = j.seed;
        const wob = tmp.set(Math.sin(time * 0.5 + s) * 0.008, Math.sin(time * 0.37 + s * 1.7) * 0.012, Math.cos(time * 0.43 + s * 0.6) * 0.008);
        j.world.copy(j.local).add(wob).applyMatrix4(M);
        const ph = j.clock % j.period;
        const blink = ph < 0.08 ? ph / 0.08 : Math.exp(-(ph - 0.08) * 2.4);
        put(j.i, j.world, 0.0135 + blink * 0.007 + j.enter * 0.01, 0.75 + blink * 1.7 + j.enter * 1.6, 0.3, 0, 0);
      }
      api.settled = settled;

      // The jar drawn in the sky, once they have all arrived.
      if (lines.visible) {
        const want = api.releasing && api.releaseClock > 11 ? Math.min(1, settled / 20) : 0;
        lineOpacity.value += (want * 0.55 - lineOpacity.value) * (1 - Math.exp(-dt * 0.9));
        JAR_LINES.forEach(([a, b], n) => {
          const A = jarFlies[a].world, B = jarFlies[b].world;
          lineA.setXYZ(n, A.x, A.y, A.z); lineB.setXYZ(n, B.x, B.y, B.z);
        });
        lineA.needsUpdate = true; lineB.needsUpdate = true;
      }

      for (const s of sparks) {
        if (s.life <= 0) { hide(s.i); continue; }
        s.life -= dt;
        s.vel.y -= dt * 0.25;
        s.pos.addScaledVector(s.vel, dt);
        const k = Math.max(0, s.life / s.max);
        put(s.i, s.pos, s.size * (0.5 + k), k * k * 1.5, s.warm, 0, 0);
      }

      aPos.needsUpdate = true; aPar.needsUpdate = true; aExt.needsUpdate = true;
    },

    // For the test harness and the trailer autopilot.
    screenList() {
      const w = window.innerWidth, h = window.innerHeight, out = [];
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        tmp.copy(f.pos).project(camera);
        if (tmp.z > 1 || tmp.z < -1) continue;
        out.push({ x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, dist: f.pos.distanceTo(camera.position), glow: f.glow, wx: f.pos.x, wy: f.pos.y, wz: f.pos.z });
      }
      return out.sort((a, b) => a.dist - b.dist);
    },
  };

  api.reset();
  return api;
}

export const _ff = [float];
