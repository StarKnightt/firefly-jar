// Fireflies: the wild ones drifting over the meadow, the ones in the jar,
// catch sparkles, and at the very end the ones that fly up and become stars.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, attribute, modelViewMatrix, cameraProjectionMatrix, positionGeometry, exp, mix, smoothstep, length,
  abs, max, varying,
} from 'three/tsl';
import { FENCE, heightAt, OAK } from './world/layout.js';

const WILD_MAX = 44, JAR_MAX = 20, SPARK_MAX = 72;
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

export function createFireflies(game) {
  const rnd = mulberry(1987);
  const { camera, rig } = game;

  // ---- one instanced, camera-facing glow for everything ----
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
  const aPar = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 4), 4); // size, brightness, warmth, star
  aPos.setUsage(THREE.DynamicDrawUsage); aPar.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aPar', aPar);
  geo.instanceCount = TOTAL;

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const nPos = attribute('aPos', 'vec3'), nPar = attribute('aPar', 'vec4');
  const view = modelViewMatrix.mul(vec4(nPos, 1.0));
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(positionGeometry.xy.mul(nPar.x), 0.0, 0.0)));
  const vPar = varying(nPar, 'vFly');
  mat.colorNode = Fn(() => {
    const p = positionGeometry.xy;
    const r2 = p.dot(p);
    const core = exp(r2.mul(-70.0));
    const halo = exp(r2.mul(-7.0)).mul(0.20);
    // Stars get a faint four-point glint.
    const glint = max(exp(abs(p.x).mul(-26.0)).mul(exp(abs(p.y).mul(-3.0))), exp(abs(p.y).mul(-26.0)).mul(exp(abs(p.x).mul(-3.0)))).mul(0.28).mul(vPar.w);
    const edge = smoothstep(1.0, 0.72, length(p));
    // Photinus yellow-green, warmer as they turn into stars.
    const cool = vec3(0.80, 1.0, 0.30), warm = vec3(1.0, 0.86, 0.48), star = vec3(1.0, 0.95, 0.82);
    const col = mix(mix(cool, warm, vPar.z), star, vPar.w);
    const hot = mix(col, vec3(1.0, 1.0, 0.8), core.mul(0.35));
    return vec4(hot.mul(core.mul(5.5).add(halo).add(glint)).mul(vPar.y).mul(edge), 1.0);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.name = 'fireflies';
  game.scene.add(mesh);

  const P = aPos.array, Q = aPar.array;
  const put = (i, pos, size, bright, warmth = 0, star = 0) => {
    P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z;
    Q[i * 4] = size; Q[i * 4 + 1] = bright; Q[i * 4 + 2] = warmth; Q[i * 4 + 3] = star;
  };
  const hide = (i) => { Q[i * 4 + 1] = 0; Q[i * 4] = 0; };

  // ---- wild fireflies ----
  const wild = [];
  for (let i = 0; i < WILD_MAX; i++) {
    wild.push({
      i, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), home: new THREE.Vector3(),
      seed: rnd() * 100, period: 3 + rnd() * 3, clock: rnd() * 5, glow: 0, state: 'idle', t: 0, from: new THREE.Vector3(),
      height: 1, dart: 0, fade: 0, pulse: 0,
    });
  }

  const inFence = (x, z, m = 2.5) => x > FENCE.minX + m && x < FENCE.maxX - m && z > FENCE.minZ + m && z < FENCE.maxZ - m;

  function spawn(f, opts = {}) {
    const p = game.player.pos;
    for (let tries = 0; tries < 24; tries++) {
      let a, r;
      if (opts.ahead) { a = game.player.yaw + (rnd() - 0.5) * 1.5; r = 8 + rnd() * 10; }
      else if (opts.anywhere) { a = rnd() * Math.PI * 2; r = 8 + rnd() * 26; }
      else { a = game.player.yaw + Math.PI * (0.3 + rnd() * 1.4); r = 11 + rnd() * 18; } // mostly out of view
      // yaw 0 looks down -z.
      const x = p.x - Math.sin(a) * r, z = p.z - Math.cos(a) * r;
      if (!inFence(x, z)) continue;
      if (Math.hypot(x - OAK.x, z - OAK.z) < 1.6) continue;
      // Not on top of another one: they hold their own patch of air.
      let crowded = false;
      for (const o of wild) if (o !== f && o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < (opts.gap ?? 6.5)) { crowded = true; break; }
      if (crowded) continue;
      f.height = 0.62 + Math.pow(rnd(), 1.6) * 1.05;
      f.pos.set(x, heightAt(x, z) + f.height, z);
      f.home.copy(f.pos);
      f.vel.set(0, 0, 0);
      f.alive = true; f.state = 'idle'; f.fade = 0; f.glow = 0; f.dart = 0;
      f.period = 2.6 + rnd() * 3.2; f.clock = rnd() * f.period;
      return true;
    }
    return false;
  }

  // ---- jar fireflies ----
  const jarFlies = [];
  for (let k = 0; k < JAR_MAX; k++) {
    jarFlies.push({ i: WILD_MAX + k, active: false, local: new THREE.Vector3(), seed: rnd() * 100, period: 1.8 + rnd() * 2.2, clock: rnd() * 3, enter: 0,
      star: new THREE.Vector3(), release: -1, world: new THREE.Vector3(), start: new THREE.Vector3(), spin: rnd() * 6.28, done: false });
  }

  // ---- sparkles ----
  const sparks = [];
  for (let k = 0; k < SPARK_MAX; k++) sparks.push({ i: WILD_MAX + JAR_MAX + k, life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.01 });
  let sparkHead = 0;
  function spark(pos, vel, life, size) {
    const s = sparks[sparkHead++ % SPARK_MAX];
    s.pos.copy(pos); s.vel.copy(vel); s.life = s.max = life; s.size = size;
  }

  const api = {
    mesh, wild, jarFlies, events: [],
    reach: 6,
    activeTarget: 14,
    released: 0,

    reset() {
      for (const f of wild) { f.alive = false; hide(f.i); }
      for (const j of jarFlies) { j.active = false; j.release = -1; j.done = false; hide(j.i); }
      for (const s of sparks) { s.life = 0; hide(s.i); }
      api.released = 0;
      for (let n = 0; n < 8; n++) spawn(wild[n], n < 3 ? { ahead: true } : { anywhere: true });
      api.spawnClock = 0;
    },

    setJarCount(n) {
      jarFlies.forEach((j, k) => {
        const on = k < n;
        if (on && !j.active) { j.active = true; j.enter = 1; api.placeInJar(j); }
        if (!on) { j.active = false; hide(j.i); }
      });
    },

    placeInJar(j) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (rig.JAR_R - 0.012);
      j.local.set(Math.cos(a) * r, 0.014 + rnd() * 0.105, Math.sin(a) * r);
    },

    // Screen-space pick. Returns {f, tooFar} or null.
    pick(ndcX, ndcY, radiusPx) {
      const w = window.innerWidth, h = window.innerHeight;
      let best = null, bestD = Infinity, far = null, farD = Infinity;
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        tmp.copy(f.pos).project(camera);
        if (tmp.z > 1 || tmp.z < -1) continue;
        const dx = (tmp.x - ndcX) * w * 0.5, dy = (tmp.y - ndcY) * h * 0.5;
        const d = Math.hypot(dx, dy);
        const dist = f.pos.distanceTo(camera.position);
        // Nearer fireflies are bigger targets.
        const rad = radiusPx * THREE.MathUtils.clamp(3.2 / dist, 0.75, 1.9);
        if (d > rad) continue;
        if (dist <= api.reach) { if (d < bestD) { bestD = d; best = f; } }
        else if (dist <= api.reach * 2.6 && d < farD) { farD = d; far = f; }
      }
      if (best) return { f: best, tooFar: false };
      if (far) return { f: far, tooFar: true };
      return null;
    },

    catch(f) {
      f.state = 'caught';
      f.t = 0;
      f.from.copy(f.pos);
      for (let k = 0; k < 7; k++) {
        tmp.set(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).multiplyScalar(0.7);
        spark(f.pos, tmp, 0.5 + rnd() * 0.4, 0.016);
      }
    },

    // A firefly the player reached for but can't get to yet: it flares so they can find it.
    beckon(f) { f.pulse = 1; },

    // A miss startles the ones nearby once it is dark.
    startle(point, amount) {
      for (const f of wild) {
        if (!f.alive || f.state !== 'idle') continue;
        const d = f.pos.distanceTo(point);
        if (d < 3.2) f.dart = Math.max(f.dart, amount * (1 - d / 3.2));
      }
    },

    // The ending: let them all go.
    releaseAll(baseYaw) {
      const n = jarFlies.filter((j) => j.active).length;
      jarFlies.forEach((j, k) => {
        if (!j.active) return;
        j.release = 0.25 + k * 0.21 + rnd() * 0.08;
        j.done = false;
        // Where in the sky this one settles: a loose drift of stars above the meadow.
        const u = (k + 0.5) / n;
        const az = baseYaw + (u - 0.5) * 1.5 + (rnd() - 0.5) * 0.3;
        const el = 0.62 + Math.sin(u * Math.PI) * 0.26 + (rnd() - 0.5) * 0.34;
        const dist = 420;
        j.star.set(-Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, -Math.cos(az) * Math.cos(el) * dist);
        j.spin = rnd() * Math.PI * 2;
      });
      api.released = 0;
      api.releaseClock = 0;
      api.releasing = true;
    },

    update(dt) {
      const time = game.time, tod = game.tod.value, p = game.player.pos;
      const night = THREE.MathUtils.smoothstep(tod, 0.25, 0.9);
      api.reach = THREE.MathUtils.lerp(3.9, 3.2, night);
      api.activeTarget = Math.round(THREE.MathUtils.lerp(8, 30, THREE.MathUtils.smoothstep(tod, 0.02, 0.75)));
      const speedMul = 1 + night * 0.75;
      const playing = game.phase === 'play' || game.phase === 'title';

      // Keep the meadow populated around the player.
      let alive = 0, close = 0;
      for (const f of wild) if (f.alive) { alive++; if (f.state === 'idle' && f.pos.distanceTo(p) < 11) close++; }
      api.spawnClock = (api.spawnClock || 0) + dt;
      if (playing && alive < api.activeTarget && api.spawnClock > 1.1) {
        const f = wild.find((w) => !w.alive);
        // Always leave something to walk toward in front of the player.
        if (f && spawn(f, close < 1 ? { ahead: true } : { gap: THREE.MathUtils.lerp(6.5, 4.5, night) })) api.spawnClock = 0;
      }

      for (const f of wild) {
        if (!f.alive) { hide(f.i); continue; }
        if (f.state === 'idle') {
          // Wander: slow looping drift around a home point that itself creeps along.
          const s = f.seed;
          const ax = Math.sin(time * 0.37 + s) + 0.6 * Math.sin(time * 0.83 + s * 2.1);
          const az = Math.cos(time * 0.31 + s * 1.3) + 0.6 * Math.sin(time * 0.71 + s * 0.7);
          tmp.set(ax, 0, az).multiplyScalar(0.42 * speedMul);
          // Drawn back toward home so they don't all leave the meadow.
          tmp.x += (f.home.x - f.pos.x) * 0.08; tmp.z += (f.home.z - f.pos.z) * 0.08;
          // After dark they keep just out of reach of a child running at them.
          const dx = f.pos.x - p.x, dz = f.pos.z - p.z, dp = Math.hypot(dx, dz);
          if (night > 0.05 && dp < 3.0 && dp > 0.01) {
            const shy = night * 0.75 * (1 - dp / 3.0) * (0.4 + game.player.speed);
            tmp.x += dx / dp * shy; tmp.z += dz / dp * shy;
          }
          if (f.dart > 0.01) {
            if (dp > 0.01) { tmp.x += dx / dp * f.dart * 2.4; tmp.z += dz / dp * f.dart * 2.4; }
            f.dart *= Math.exp(-dt * 2.2);
          }
          f.vel.x += (tmp.x - f.vel.x) * Math.min(1, dt * 1.6);
          f.vel.z += (tmp.z - f.vel.z) * Math.min(1, dt * 1.6);

          // Blink: quick rise, slow fall, and the little upward swoop that draws a J in the air.
          f.clock += dt;
          const ph = f.clock % f.period;
          const flash = ph < 0.09 ? ph / 0.09 : Math.exp(-(ph - 0.09) * 3.4);
          const swoop = ph < 0.7 ? Math.sin(ph / 0.7 * Math.PI) : 0;
          const ground = heightAt(f.pos.x, f.pos.z);
          const wantY = ground + f.height + Math.sin(time * 0.6 + s) * 0.16 + swoop * 0.22 - (ph < 0.12 ? 0.05 : 0);
          f.vel.y += ((wantY - f.pos.y) * 2.6 - f.vel.y) * Math.min(1, dt * 3);
          f.pos.addScaledVector(f.vel, dt);
          if (!inFence(f.pos.x, f.pos.z, 1.2)) { f.home.x += (p.x - f.home.x) * 0.02; f.home.z += (p.z - f.home.z) * 0.02; }

          f.fade = Math.min(1, f.fade + dt * 0.9);
          f.pulse = Math.max(0, f.pulse - dt * 1.4);
          // Never fully dark, so an eye can follow one between flashes.
          const ember = THREE.MathUtils.lerp(0.2, 0.11, night);
          f.glow = (ember + flash * (1 - ember)) * f.fade + f.pulse * 0.7;
          const day = 1 - THREE.MathUtils.smoothstep(tod, 0.1, 0.6);
          put(f.i, f.pos, (0.085 + flash * 0.05 + f.pulse * 0.06) * (1 + day * 0.35), f.glow * (1.6 + day * 1.1), 0, 0);

          if (f.pos.distanceTo(p) > 36 && playing) f.alive = false;
        } else if (f.state === 'caught') {
          // Swoop over the rim and down into the jar.
          f.t += dt / 0.62;
          const t = Math.min(1, f.t);
          const e = t * t * (3 - 2 * t);
          rig.mouthWorld(tmp2);
          tmp3.copy(f.from).lerp(tmp2, 0.5); tmp3.y = Math.max(f.from.y, tmp2.y) + 0.22;
          const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
          f.pos.set(a * f.from.x + b * tmp3.x + c * tmp2.x, a * f.from.y + b * tmp3.y + c * tmp2.y, a * f.from.z + b * tmp3.z + c * tmp2.z);
          put(f.i, f.pos, 0.05 * (1 - e * 0.72), 1.6, 0.3 * e, 0);
          if (rnd() < dt * 46) { tmp.set((rnd() - 0.5) * 0.12, -0.04 + rnd() * 0.1, (rnd() - 0.5) * 0.12); spark(f.pos, tmp, 0.45 + rnd() * 0.3, 0.009); }
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
      for (const j of jarFlies) {
        if (!j.active) continue;
        j.clock += dt;
        j.enter = Math.max(0, j.enter - dt * 1.5);
        if (j.release >= 0 && api.releasing && api.releaseClock >= j.release) {
          // Rising out of the jar and away.
          const age = api.releaseClock - j.release;
          if (!j.left) {
            j.left = true; rig.mouthWorld(j.start);
            api.released++;
            api.events.push({ type: 'released', n: api.released });
          }
          const rise = age * (0.55 + age * 0.22);
          const swirl = 0.05 + Math.min(0.5, age * 0.16);
          tmp.set(j.start.x + Math.cos(j.spin + age * 2.1) * swirl, j.start.y + rise, j.start.z + Math.sin(j.spin + age * 2.1) * swirl);
          // Then the long flight to its place in the sky.
          const k = THREE.MathUtils.smoothstep(age, 2.2, 8.5);
          const kk = k * k * k;
          tmp2.copy(camera.position).add(j.star);
          j.world.copy(tmp).lerp(tmp2, kk);
          const dist = j.world.distanceTo(camera.position);
          const ph = j.clock % j.period;
          const blink = 0.55 + 0.45 * Math.exp(-ph * 2.2);
          const steady = THREE.MathUtils.lerp(blink, 0.82 + 0.18 * Math.sin(time * (2 + j.seed % 3) + j.seed), k);
          // Hold apparent size as it recedes so it settles as a bright star, not a vanishing dot.
          const nearSize = 0.03 + Math.min(0.03, age * 0.02);
          const farSize = dist * 0.0105;
          put(j.i, j.world, THREE.MathUtils.lerp(nearSize, farSize, THREE.MathUtils.smoothstep(k, 0.05, 0.7)), steady * THREE.MathUtils.lerp(1.5, 1.15, k), 0.25 + k * 0.5, k);
          if (age < 2.5 && rnd() < dt * 12) { tmp3.set((rnd() - 0.5) * 0.1, -0.12, (rnd() - 0.5) * 0.1); spark(j.world, tmp3, 0.7, 0.008); }
          continue;
        }
        const s = j.seed;
        const wob = tmp.set(Math.sin(time * 0.5 + s) * 0.008, Math.sin(time * 0.37 + s * 1.7) * 0.012, Math.cos(time * 0.43 + s * 0.6) * 0.008);
        j.world.copy(j.local).add(wob).applyMatrix4(M);
        const ph = j.clock % j.period;
        const blink = ph < 0.08 ? ph / 0.08 : Math.exp(-(ph - 0.08) * 2.6);
        put(j.i, j.world, 0.0085 + blink * 0.004 + j.enter * 0.01, 0.5 + blink * 0.9 + j.enter * 1.4, 0.15, 0);
      }

      for (const s of sparks) {
        if (s.life <= 0) { hide(s.i); continue; }
        s.life -= dt;
        s.vel.y -= dt * 0.25;
        s.pos.addScaledVector(s.vel, dt);
        const k = Math.max(0, s.life / s.max);
        put(s.i, s.pos, s.size * (0.5 + k), k * k * 1.3, 0.5, 0);
      }

      aPos.needsUpdate = true; aPar.needsUpdate = true;
    },

    // For the screenshot/critic harness and the autopilot used by the trailer.
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

export const _ff = [vec2, float];
