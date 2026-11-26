// Trailer director (only loaded with ?trailer). Plays the game in fixed steps with an autopilot
// that walks, aims and clicks like a player, cuts between three moments of the evening, shows
// the text cards, and logs sound events on the film's clock so the soundtrack can be rendered
// to match. Nothing here fakes a picture: every frame is the game drawing itself.
import * as THREE from 'three/webgpu';
import { heightAt, START, START_YAW } from './world/layout.js';
import { renderOffline } from './audio.js';

const FPS = 60;
const DURATION = 44.0;
const CUT_DUSK = 13.55, CUT_NIGHT = 20.3; // on bar lines of the music (2.25 s bars from 0.05)

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = THREE.MathUtils.clamp;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export function createDirector(game) {
  const { fireflies, flow, controls } = game;
  const p = game.player;
  let shot = -1, targets = [], cooldown = 0, lastTodLog = -1, filmT = 0;

  // ---- text cards ----
  const layer = document.createElement('div');
  layer.id = 'cards';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;font-family:Caveat,cursive;color:#fff6e0;text-align:center;';
  document.getElementById('ui').appendChild(layer);
  const shadow = 'text-shadow:0 3px 30px rgba(40,16,0,.8),0 0 5px rgba(40,16,0,.55),0 0 70px rgba(255,196,96,.35);';
  const CARDS = [
    { a: 0.9, b: 4.9, y: 12, html: `<div style="font-size:176px;line-height:.9;font-weight:600;${shadow}">Firefly Jar</div><div style="font:italic 380 36px 'Fraunces Variable',Georgia,serif;margin-top:14px;${shadow}">one summer evening, a long time ago</div>` },
    { a: 6.2, b: 9.8, y: 15, html: `<div style="font-size:96px;font-weight:600;${shadow}">catch fireflies before night falls</div>` },
    { a: 14.1, b: 17.6, y: 15, html: `<div style="font-size:96px;font-weight:600;${shadow}">every one makes the jar glow brighter</div>` },
    { a: 20.9, b: 24.3, y: 15, html: `<div style="font-size:96px;font-weight:600;${shadow}">playable on your phone</div>` },
    { a: 31.4, b: 35.0, y: 13, html: `<div style="font-size:96px;font-weight:600;${shadow}">fill the jar, then let them go</div>` },
    { a: 39.6, b: 99, y: 64, html: `<div style="font-size:150px;line-height:.9;font-weight:600;${shadow}">Firefly Jar</div><div style="font:italic 380 36px 'Fraunces Variable',Georgia,serif;margin-top:18px;${shadow}">play it free in your browser</div><div style="font:500 30px 'Fraunces Variable',Georgia,serif;letter-spacing:.03em;margin-top:14px;opacity:.9;${shadow}">starknightt.github.io/firefly-jar</div>` },
  ];
  const cardEls = CARDS.map((c) => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:0;right:0;top:${c.y}%;opacity:0;will-change:opacity,transform;`;
    el.innerHTML = c.html;
    layer.appendChild(el);
    return el;
  });
  const showCards = (t, force = -1) => {
    CARDS.forEach((c, i) => {
      let o = ease((t - c.a) / 0.5) * (1 - ease((t - (c.b - 0.5)) / 0.5));
      if (i === force) o = 1;
      cardEls[i].style.opacity = o.toFixed(3);
      cardEls[i].style.transform = `translateY(${((1 - ease((t - c.a) / 0.9)) * 16).toFixed(1)}px)`;
    });
  };

  // ---- staging ----
  const fwd = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
  // Put fireflies at chosen spots ahead of a pose: [distance, side, height, flash phase].
  const stage = (pose, spots) => {
    for (const f of fireflies.wild) f.alive = false;
    const [fx, fz] = fwd(pose.yaw), rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);
    targets = [];
    spots.forEach(([d, side, h, phase], i) => {
      const f = fireflies.wild[i];
      const x = pose.x + fx * d + rx * side, z = pose.z + fz * d + rz * side;
      f.alive = true; f.state = 'idle'; f.height = h; f.dart = 0; f.fade = 1; f.pulse = 0;
      f.pos.set(x, heightAt(x, z) + h, z); f.home.copy(f.pos); f.vel.set(0, 0, 0);
      f.period = 2.4 + (i % 4) * 0.4; f.clock = phase * f.period;
      targets.push(f);
    });
    fireflies.spawnClock = -8; // hold off natural spawns for a moment so the staging reads
  };
  const pose = (x, z, yaw, pitch) => { p.pos.set(x, heightAt(x, z), z); p.yaw = yaw; p.pitch = pitch; p.vel.set(0, 0, 0); p.speed = 0; };

  // Smooth aim at a world point; returns angular error and ground distance.
  const aim = (pos, dt, gain = 4.2, maxRate = 1.5) => {
    const c = game.camera.position;
    const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z, flat = Math.hypot(dx, dz);
    const ey = wrap(Math.atan2(-dx, -dz) - p.yaw), ep = Math.atan2(dy, flat) - p.pitch;
    p.yaw += clamp(ey * gain * dt, -maxRate * dt, maxRate * dt);
    p.pitch += clamp(ep * gain * dt, -maxRate * 0.8 * dt, maxRate * 0.8 * dt);
    return { err: Math.hypot(ey, ep), flat };
  };
  // Walk up to the next staged firefly and catch it, like a player would.
  const chase = (dt, queue) => {
    cooldown -= dt;
    while (queue.length && (!queue[0].alive || queue[0].state !== 'idle')) queue.shift();
    const f = queue[0];
    if (!f) { controls.autopilot = { x: 0, y: 0 }; return; }
    const a = aim(f.pos, dt);
    const reach = fireflies.reach;
    controls.autopilot = { x: 0, y: a.flat > reach - 0.9 ? (a.err < 0.5 ? 1 : 0.4) : 0 };
    if (a.err < 0.03 && a.flat < reach - 0.35 && cooldown <= 0) {
      if (flow.tryCatch(0, 0, false) === 'caught') { queue.shift(); cooldown = 1.3; }
    }
  };

  const SHOTS = [
    {
      start: 0,
      enter() {
        game.todLock = false; game.todTarget = 0.03; game.tod.set(0.03);
        game.debugState({ count: 0 });
        pose(START.x, START.z, START_YAW, -0.045);
        stage({ x: START.x, z: START.z, yaw: START_YAW }, [
          [5.4, -0.8, 0.95, 0.02], [8.6, 1.7, 1.2, 0.62], [11.6, -1.6, 0.95, 0.3], [14.5, 0.8, 1.3, 0.86],
          [10.0, 5.2, 0.9, 0.45], [17.0, -5.5, 1.2, 0.12], [7.4, -4.4, 1.1, 0.74], [20.0, 3.5, 1.0, 0.55],
        ]);
        this.queue = [targets[0], targets[1], targets[2], targets[3]];
      },
      update(t, dt) {
        if (t < 4.5) {
          // The opening: stand in the evening for a breath, then start to wander in.
          controls.autopilot = { x: 0, y: t > 2.0 ? 0.4 : 0 };
          p.yaw = START_YAW + Math.sin(t * 0.5) * 0.012;
          p.pitch += (-0.03 - p.pitch) * dt * 0.8;
        } else chase(dt, this.queue);
      },
    },
    {
      start: CUT_DUSK,
      enter() {
        game.todLock = true;
        const ps = { x: -3.5, z: 4.5, yaw: 0.82, pitch: -0.02 };
        game.debugState({ tod: 0.52, count: 9 });
        pose(ps.x, ps.z, ps.yaw, ps.pitch);
        stage(ps, [[5.0, 0.6, 1.05, 0.9], [7.6, -1.1, 1.25, 0.35], [10.6, 1.2, 0.95, 0.6], [13, -5, 1.2, 0.2], [15, 4, 1.0, 0.75], [18, -1, 1.5, 0.05], [9, 6, 0.9, 0.5]]);
        this.queue = [targets[0], targets[1], targets[2]];
        cooldown = 0.7;
      },
      update(t, dt) { chase(dt, this.queue); },
    },
    {
      start: CUT_NIGHT,
      enter() {
        game.todLock = true;
        const ps = { x: -12, z: -8.5, yaw: 0.36, pitch: -0.52 };
        game.debugState({ tod: 0.93, count: 17 });
        pose(ps.x, ps.z, ps.yaw, ps.pitch);
        stage(ps, [[4.6, -0.4, 1.0, 0.85], [6.8, 1.1, 1.15, 0.4], [8.8, -0.6, 1.05, 0.65], [12, 4, 1.3, 0.1], [14, -4.5, 0.9, 0.5], [17, 1, 1.4, 0.3], [10, -6, 1.1, 0.7], [20, 5, 1.0, 0.9]]);
        this.queue = [targets[0], targets[1], targets[2]];
        cooldown = 0.4;
      },
      update(t, dt) {
        if (game.phase !== 'play') { controls.autopilot = { x: 0, y: 0 }; return; }
        // First look at the light the jar throws on your hands and the grass, then go after the last three.
        if (t < 1.9) { controls.autopilot = { x: 0, y: 0.3 }; p.pitch += (-0.52 - p.pitch) * dt * 2; p.yaw += Math.sin(t * 1.2) * 0.0012; } else chase(dt, this.queue);
      },
    },
  ];

  // The ending runs about 25 s in the game. The trailer has about 16 s for it, so game time runs a
  // little faster there: gently while the hand opens the jar, more while they climb.
  const warp = () => {
    if (game.phase !== 'ending' && game.phase !== 'done') return 1;
    const t = flow.state.endT;
    return t < 4.5 ? 1.25 : t < 12.5 ? 1.55 : t < 23.5 ? 2.2 : 1;
  };

  const tick = (i) => {
    const t = i / FPS;
    filmT = t;
    let s = 0;
    for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].start - 1e-6) s = k;
    const cut = s !== shot;
    if (cut) { shot = s; SHOTS[s].enter(); }
    const dt = (1 / FPS) * warp();
    SHOTS[s].update(t - SHOTS[s].start, dt);
    return { t, dt, cut };
  };

  const api = {
    prepare() {
      document.documentElement.classList.add('trailer', 'locked');
      for (const id of ['hint', 'mute', 'stick', 'title', 'pause', 'end']) document.getElementById(id).style.display = 'none';
      layer.style.display = 'block';
      game.noEndCard = true;
      game.audioLog = [];
      game.filmClock = () => filmT;
      game.time = 0; game.frame = 0;
      shot = -1; lastTodLog = -1; filmT = 0;
      // A clean evening every time prepare() is called.
      game.phase = 'title';
      game.count = 0;
      game.rig.reset();
      fireflies.reset();
      flow.begin();
      game.ui.clearHint();
      showCards(-1);
      return { frames: Math.round(DURATION * FPS), fps: FPS, duration: DURATION };
    },

    // One frame of film. Resolves once the GPU has finished it and the browser has presented it.
    frame(i) {
      const { t, dt, cut } = tick(i);
      game.step(dt);
      if (t - lastTodLog >= 0.5 || cut) { lastTodLog = t; game.audioLog.push({ t, type: 'tod', v: game.tod.value, snap: i === 0 || cut }); }
      showCards(t);
      return game.settle().then(() => game.count);
    },

    // Dry run without presenting frames: returns when things happen, for tuning the cut.
    dryRun() {
      api.prepare();
      const marks = [];
      let last = 0, phase = game.phase, rel = 0;
      const n = Math.round(DURATION * FPS);
      for (let i = 0; i < n; i++) {
        const { t, dt, cut } = tick(i);
        if (cut) { last = game.count; marks.push({ t: +t.toFixed(2), shot, count: game.count }); }
        game.update(dt);
        if (game.count !== last) { last = game.count; marks.push({ t: +t.toFixed(2), count: last }); }
        if (game.phase !== phase) { phase = game.phase; marks.push({ t: +t.toFixed(2), phase }); }
        if (fireflies.released !== rel && (fireflies.released === 1 || fireflies.released === 20)) { rel = fireflies.released; marks.push({ t: +t.toFixed(2), released: rel }); }
        if (fireflies.settled === 20 && !marks.some((m) => m.settled)) marks.push({ t: +t.toFixed(2), settled: 20 });
      }
      marks.push({ end: DURATION, endT: +flow.state.endT.toFixed(1), phase: game.phase });
      return marks;
    },

    thumbnail() {
      api.prepare();
      for (let i = 0; i < 50; i++) { const { dt } = tick(i); game.step(dt); }
      showCards(0, 0);
      cardEls[0].style.transform = 'none';
      document.getElementById('hud').style.display = 'none';
      document.getElementById('reticle').style.display = 'none';
      return game.settle().then(() => {
        // Put the HUD back for the film itself.
        setTimeout(() => { document.getElementById('hud').style.display = ''; document.getElementById('reticle').style.display = ''; }, 1500);
        return true;
      });
    },

    async renderAudio() {
      // Music cues follow the cut rather than the literal count, so the melody is whole from the first bar.
      const cues = [{ t: 0, type: 'count', n: 6 }, { t: CUT_DUSK, type: 'count', n: 12 }, { t: CUT_NIGHT, type: 'count', n: 17 }];
      const events = game.audioLog.filter((e) => e.type !== 'count').concat(cues, [{ t: DURATION - 1.4, type: 'gain', v: 0, tc: 0.4 }]);
      const blob = await renderOffline({ duration: DURATION, events });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  return api;
}
