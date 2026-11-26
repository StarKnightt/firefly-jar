// Fireflies: the wild ones you can catch, the ones in the jar, catch sparkles,
// and at the very end the ones that fly up and become a constellation.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, attribute, modelViewMatrix, cameraProjectionMatrix, positionGeometry, exp, mix, smoothstep, length,
  abs, max, min, varying, uniform,
} from 'three/tsl';
import { FENCE, heightAt, OAK } from './world/layout.js';

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
  const size = min(nPar.x, dist.mul(0.02)).max(dist.mul(0.0016).mul(nPar.w.mul(3.0).add(1.0)));
  const quad = vec2(positionGeometry.x, positionGeometry.y.mul(nExt.add(1.0)).add(nExt.mul(0.7)));
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(quad.mul(size), 0.0, 0.0)));
  const vPar = varying(nPar, 'vFly');
  mat.colorNode = Fn(() => {
    const p = vec2(positionGeometry.x, positionGeometry.y);
    const r2 = p.dot(p);
    const core = exp(r2.mul(-60.0));
    const halo = exp(r2.mul(-6.5)).mul(0.16);
    // Settled stars get a faint four-point glint.
    const glint = max(exp(abs(p.x).mul(-30.0)).mul(exp(abs(p.y).mul(-3.2))), exp(abs(p.y).mul(-30.0)).mul(exp(abs(p.x).mul(-3.2)))).mul(0.3).mul(vPar.w);
    const edge = smoothstep(1.0, 0.7, length(p));
    // Photinus chartreuse; amber inside the jar; pale gold once they are stars.
    const wild = vec3(0.56, 1.0, 0.07), amber = vec3(1.0, 0.82, 0.22), star = vec3(1.0, 0.9, 0.62);
    const col = mix(mix(wild, amber, vPar.z), star, vPar.w);
    const hot = mix(col, vec3(0.92, 1.0, 0.6), core.mul(0.28));
    return vec4(hot.mul(core.mul(4.2).add(halo).add(glint)).mul(vPar.y).mul(edge), 1.0);
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
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(JAR_LINES.length * 6);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineOpacity = uniform(0);
  const lineMat = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  lineMat.colorNode = vec4(vec3(1.0, 0.86, 0.55).mul(lineOpacity), 1.0);
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.visible = false;
  game.scene.add(lines);

  // ---- wild fireflies ----
  const wild = [];
  for (let i = 0; i < WILD_MAX; i++) {
    wild.push({
      i, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), home: new THREE.Vector3(),
      seed: rnd() * 100, period: 3 + rnd() * 3, clock: rnd() * 5, glow: 0, state: 'idle', t: 0, from: new THREE.Vector3(),
      height: 1, dart: 0, dartDir: new THREE.Vector2(), fade: 0, pulse: 0, flash: 0,
    });
  }

  const inFence = (x, z, m = 2.5) => x > FENCE.minX + m && x < FENCE.maxX - m && z > FENCE.minZ + m && z < FENCE.maxZ - m;

  // A firefly appears a short walk away, never right under your nose and never crowding another.
  function spawn(f, opts = {}) {
    const p = game.player.pos;
    for (let tries = 0; tries < 30; tries++) {
      let a, r;
      if (opts.ahead) { a = game.player.yaw + (rnd() - 0.5) * 1.5; r = opts.near ? 9 + rnd() * 5 : 12 + rnd() * 10; }
      else { a = rnd() * Math.PI * 2; r = 13 + rnd() * 26; }
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
      f.alive = true; f.state = 'idle'; f.fade = 0; f.glow = 0; f.dart = 0; f.pulse = 0;
      f.period = 2.4 + rnd() * 2.6; f.clock = rnd() * f.period;
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
      // The first few: one close enough to learn on, the rest a walk away.
      spawn(wild[0], { ahead: true, near: true, gap: 6 });
      for (let n = 1; n < 5; n++) spawn(wild[n], n < 3 ? { ahead: true } : {});
    },

    setJarCount(n) {
      jarFlies.forEach((j, k) => {
        const on = k < n;
        if (on && !j.active) { j.active = true; j.enter = 1; j.left = false; j.release = -1; api.placeInJar(j); }
        if (!on) { j.active = false; hide(j.i); }
      });
    },

    placeInJar(j) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (rig.JAR_R - 0.013);
      j.local.set(Math.cos(a) * r, 0.016 + rnd() * 0.1, Math.sin(a) * r);
    },

    // Screen-space pick. Returns {f, tooFar} or null. `loose` widens it, to find what a miss was aimed at.
    pick(ndcX, ndcY, radiusPx, loose = 1) {
      const w = window.innerWidth, h = window.innerHeight;
      let best = null, bestD = Infinity, far = null, farD = Infinity;
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        tmp.copy(f.pos).project(camera);
        if (tmp.z > 1 || tmp.z < -1) continue;
        const dx = (tmp.x - ndcX) * w * 0.5, dy = (tmp.y - ndcY) * h * 0.5;
        const d = Math.hypot(dx, dy);
        const dist3 = f.pos.distanceTo(camera.position);
        // Nearer fireflies are bigger targets.
        const rad = radiusPx * loose * THREE.MathUtils.clamp(3.0 / dist3, 0.7, 1.8);
        if (d > rad) continue;
        if (dist3 <= api.reach) { if (d < bestD) { bestD = d; best = f; } }
        else if (dist3 <= 22 && d < farD) { farD = d; far = f; }
      }
      if (best) return { f: best, tooFar: false };
      if (far) return { f: far, tooFar: true, dist: far.pos.distanceTo(camera.position) };
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
    releaseAll(yaw) {
      const el0 = 0.86;
      let k = 0;
      jarFlies.forEach((j) => {
        if (!j.active) return;
        j.release = 0.2 + k * 0.4 + rnd() * 0.12;
        j.left = false;
        const [sx, sy] = JAR_STARS[k % JAR_STARS.length];
        const el = el0 + sy * 0.25;
        const az = yaw - (sx * 0.2) / Math.cos(el);
        const d = 420;
        j.star.set(-Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
        j.spin = yaw + Math.PI + (rnd() - 0.5) * 0.6; // they leave over the far rim, then sweep round
        j.orbit = 1.6 + rnd() * 1.5;
        j.orbitH = 0.2 + rnd() * 1.3;
        j.dirSign = k % 5 === 4 ? -1 : 1;
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
      api.activeTarget = Math.round(THREE.MathUtils.lerp(5, 13, THREE.MathUtils.smoothstep(tod, 0.05, 0.8)));
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
        if (f && spawn(f, ahead < 1 ? { ahead: true } : { gap: THREE.MathUtils.lerp(10, 7.5, night) })) api.spawnClock = 0;
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
          if (night > 0.05 && dp < 4.2 && dp > 0.01) {
            const shy = night * (running ? 2.6 : 0.5) * (1 - dp / 4.2);
            tmp.x += dx / dp * shy; tmp.z += dz / dp * shy;
            if (running) { f.home.x += dx / dp * shy * dt * 0.8; f.home.z += dz / dp * shy * dt * 0.8; }
          }
          if (f.dart > 0.01) {
            tmp.x += f.dartDir.x * f.dart * 3.4; tmp.z += f.dartDir.y * f.dart * 3.4;
            f.home.x += f.dartDir.x * f.dart * dt * 2.2; f.home.z += f.dartDir.y * f.dart * dt * 2.2;
            f.dart *= Math.exp(-dt * 1.9);
          }
          if (!inFence(f.home.x, f.home.z, 2)) { f.home.x = THREE.MathUtils.clamp(f.home.x, FENCE.minX + 2, FENCE.maxX - 2); f.home.z = THREE.MathUtils.clamp(f.home.z, FENCE.minZ + 2, FENCE.maxZ - 2); }
          f.vel.x += (tmp.x - f.vel.x) * Math.min(1, dt * 1.8);
          f.vel.z += (tmp.z - f.vel.z) * Math.min(1, dt * 1.8);

          // Blink: on for about half a second while it swoops up (the J a firefly draws), then dark.
          f.clock += dt;
          const ph = f.clock % f.period;
          const on = 0.52;
          const flash = ph < 0.07 ? ph / 0.07 : ph < on ? 1 - (ph - 0.07) / (on - 0.07) * 0.35 : Math.exp(-(ph - on) * 7) * 0.65;
          const swoopT = Math.min(1, ph / 0.6);
          const swoop = ph < 0.6 ? Math.sin(swoopT * Math.PI * 0.5) : Math.max(0, 1 - (ph - 0.6) / 1.4);
          const ground = heightAt(f.pos.x, f.pos.z);
          const wantY = ground + f.height + Math.sin(time * 0.6 + s) * 0.14 + swoop * 0.32 - (ph < 0.1 ? 0.06 : 0);
          f.vel.y += ((wantY - f.pos.y) * 5.0 - f.vel.y) * Math.min(1, dt * 5);
          f.pos.addScaledVector(f.vel, dt);

          f.fade = Math.min(1, f.fade + dt * 0.8);
          f.pulse = Math.max(0, f.pulse - dt * 1.3);
          f.flash = flash;
          // By day a faint ember lets the eye follow one; at night they go properly dark between flashes.
          const ember = THREE.MathUtils.lerp(0.2, 0.035, night);
          f.glow = (ember + flash * (1 - ember)) * f.fade + f.pulse * 0.8;
          const day = 1 - THREE.MathUtils.smoothstep(tod, 0.1, 0.55);
          const rise = Math.max(0, f.vel.y) * flash;
          put(f.i, f.pos, 0.07 + flash * 0.03 + f.pulse * 0.05, f.glow * (2.0 + day * 1.6), 0, 0, Math.min(1.6, rise * 2.2));

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
          put(f.i, f.pos, 0.05 * (1 - e * 0.7), 2.0, 0.5 * e, 0, 0.5 * (1 - e));
          if (rnd() < dt * 50) { tmp.set((rnd() - 0.5) * 0.1, -0.04 + rnd() * 0.08, (rnd() - 0.5) * 0.1); spark(f.pos, tmp, 0.4 + rnd() * 0.3, 0.007, 0.1); }
          if (f.t >= 1) {
            f.alive = false; hide(f.i);
            api.events.push({ type: 'landed' });
          }
        }
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
          const ang = j.spin + j.dirSign * age * (1.5 - widen * 0.45);
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
          const nearSize = 0.046, farSize = d * (0.0085 + 0.0035 * Math.sin(arrive * Math.PI) + (j.k >= 17 ? 0.002 : 0));
          put(j.i, j.world, THREE.MathUtils.lerp(nearSize, farSize, THREE.MathUtils.smoothstep(k, 0.02, 0.6)), THREE.MathUtils.lerp(blink * 2.3, twinkle * 1.5, k), 0.55, k, 0);
          if (age < 5 && rnd() < dt * 9) { tmp3.set((rnd() - 0.5) * 0.08, -0.1, (rnd() - 0.5) * 0.08); spark(j.world, tmp3, 0.8, 0.006, 0.5); }
          continue;
        }
        const s = j.seed;
        const wob = tmp.set(Math.sin(time * 0.5 + s) * 0.008, Math.sin(time * 0.37 + s * 1.7) * 0.012, Math.cos(time * 0.43 + s * 0.6) * 0.008);
        j.world.copy(j.local).add(wob).applyMatrix4(M);
        const ph = j.clock % j.period;
        const blink = ph < 0.08 ? ph / 0.08 : Math.exp(-(ph - 0.08) * 2.4);
        put(j.i, j.world, 0.0075 + blink * 0.004 + j.enter * 0.01, 0.7 + blink * 1.2 + j.enter * 1.6, 0.6, 0, 0);
      }
      api.settled = settled;

      // The jar drawn in the sky, once they have all arrived.
      if (lines.visible) {
        const want = api.releasing && api.released > 0 && settled >= api.released && api.releaseClock > 12 ? 1 : 0;
        lineOpacity.value += (want * 0.34 - lineOpacity.value) * (1 - Math.exp(-dt * 0.9));
        JAR_LINES.forEach(([a, b], n) => {
          const A = jarFlies[a].world, B = jarFlies[b].world;
          linePos.set([A.x, A.y, A.z, B.x, B.y, B.z], n * 6);
        });
        lineGeo.attributes.position.needsUpdate = true;
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
