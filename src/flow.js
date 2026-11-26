// The evening itself: title, catching, nightfall, and letting them go.
import * as THREE from 'three/webgpu';
import { U, MOON_DIR } from './tod.js';
import { START, START_YAW, OAK, HOUSE } from './world/layout.js';

const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const span = (t, a, b) => ease((t - a) / (b - a));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// The evening runs on the clock: about seven minutes from golden hour to night if you only
// stand and watch. Each firefly in the jar brings it a little closer.
const todFor = (seconds, count) => Math.min(1, seconds / 430 + count * 0.0125);

export function createFlow(game) {
  const { rig, fireflies, audio, ui, controls } = game;
  const state = { playTime: 0, sinceCatch: 0, endT: 0, paused: false, tooFarAt: -10, base: { yaw: 0, pitch: 0 }, starYaw: 0, shown: {}, fadeT: -1 };
  const now = () => (game.filmClock ? game.filmClock() : game.time);
  const log = (e) => { if (game.audioLog) game.audioLog.push({ t: now(), ...e }); };
  const snd = (name, ...args) => { if (audio.ready) audio[name](...args); };
  const pickRadius = (touch) => {
    const night = THREE.MathUtils.smoothstep(game.tod.value, 0.3, 0.95);
    const scale = THREE.MathUtils.clamp(Math.min(window.innerWidth, window.innerHeight) / 900, 0.75, 1.4);
    return (touch ? 62 : 56) * scale * (1 - 0.25 * night);
  };

  // A patch of open sky to send them into: away from the oak's crown, the farmhouse roof and the moon.
  function clearSkyYaw(from) {
    const p = game.player.pos;
    const blocked = [];
    const add = (x, z, half) => blocked.push({ yaw: Math.atan2(-(x - p.x), -(z - p.z)), half });
    const dOak = Math.hypot(OAK.x - p.x, OAK.z - p.z);
    if (dOak < 60) add(OAK.x, OAK.z, Math.atan2(9.5, Math.max(1, dOak)) + 0.62);
    const dHouse = Math.hypot(HOUSE.x - p.x, HOUSE.z - p.z);
    if (dHouse < 34) add(HOUSE.x, HOUSE.z, Math.atan2(7, Math.max(1, dHouse)) + 0.45);
    blocked.push({ yaw: Math.atan2(-MOON_DIR.x, -MOON_DIR.z), half: 0.75 });
    let best = from, bestCost = Infinity;
    for (let i = 0; i < 48; i++) {
      const yaw = from + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 24);
      let clear = true;
      for (const b of blocked) if (Math.abs(wrap(yaw - b.yaw)) < b.half) { clear = false; break; }
      const cost = Math.abs(wrap(yaw - from)) + (clear ? 0 : 10);
      if (cost < bestCost) { bestCost = cost; best = yaw; }
    }
    return best;
  }

  const flow = {
    state,

    begin() {
      if (game.phase !== 'title') return;
      game.phase = 'play';
      ui.showTitle(false);
      ui.playing(true);
      controls.enable(true);
      controls.requestLock();
      if (!audio.ready && !game.DET) audio.start().then(() => { audio.setCount(game.count); audio.setMuted(audio.muted); }).catch((e) => console.warn('audio unavailable', e));
      const touch = controls.state.touch;
      if (touch) ui.stickHint();
      setTimeout(() => ui.hint(touch ? 'walk up to a firefly, then tap it' : 'walk up to a firefly, then click it', 8, true), game.DET ? 0 : 1400);
    },

    resume() {
      state.paused = false;
      ui.pause(false);
      controls.enable(true);
      controls.requestLock();
    },

    lockChanged(locked) {
      if (game.phase !== 'play' || controls.state.touch || game.DET) return;
      if (!locked && !controls.state.dragLook && !game.params.has('nolock')) {
        state.paused = true;
        controls.enable(false);
        ui.pause(true);
      }
    },

    // Is there a firefly within reach under this screen point? (So a tap on one beats a button.)
    fireflyAt(clientX, clientY) {
      if (game.phase !== 'play' || state.paused) return false;
      const hit = fireflies.pick((clientX / window.innerWidth) * 2 - 1, -((clientY / window.innerHeight) * 2 - 1), pickRadius(true));
      return !!(hit && !hit.tooFar);
    },

    // A reach: at the crosshair, the cursor, or wherever the finger tapped.
    tryCatch(nx, ny, touch) {
      if (game.phase !== 'play' || state.paused) return null;
      const radius = pickRadius(touch);
      let hit = fireflies.pick(nx, ny, radius);
      const r = state.ringed;
      if ((!hit || hit.tooFar) && !touch && r && game.time - r.t < 0.25 && r.f.alive && r.f.state === 'idle' && r.f.spook <= 0
        && r.f.pos.distanceTo(game.camera.position) < fireflies.reach * 1.12) hit = { f: r.f, tooFar: false };
      const sx = THREE.MathUtils.clamp(nx, -1, 1), sy = THREE.MathUtils.clamp(ny + 0.35, -1, 1);
      if (hit && !hit.tooFar) {
        fireflies.catch(hit.f);
        rig.scoop(sx, sy, true);
        snd('lid'); log({ type: 'lid' });
        state.sinceCatch = 0;
        return 'caught';
      }
      if (hit && hit.tooFar) {
        // Right one, too far away: it flares to show which, and you are told why nothing happened.
        fireflies.beckon(hit.f);
        if (game.time - state.tooFarAt > 2.5) { ui.hint(hit.dist > 9 ? 'too far. walk over to it' : 'almost. a few steps closer', 2.4, true); state.tooFarAt = game.time; }
        rig.scoop(sx * 0.4, sy * 0.3, false);
        ui.ripple(nx, ny);
        snd('miss'); log({ type: 'miss' });
        return 'far';
      }
      // A swipe at the air. If one was close to where you aimed, it flares and darts away.
      const near = fireflies.pick(nx, ny, radius, 3.2);
      if (near) fireflies.startle(near.f, near.tooFar ? 0.5 : 1);
      rig.scoop(sx * 0.8, sy * 0.6, false);
      ui.ripple(nx, ny);
      snd('miss'); log({ type: 'miss' });
      return 'miss';
    },

    landed() {
      game.count = Math.min(game.goal, game.count + 1);
      const n = game.count;
      rig.setCount(n, game.goal);
      rig.flash();
      fireflies.setJarCount(n);
      ui.setCount(n);
      snd('chime', n); snd('setCount', n);
      log({ type: 'chime', n }); log({ type: 'count', n });
      if (n === 1) ui.hint('one. nineteen more to fill the jar', 4.5, true);
      else if (n === 5) ui.hint('the jar is starting to glow', 4, true);
      else if (n === 10) ui.hint('halfway. the light is going', 4, true);
      else if (n === 14) ui.hint('they are shy in the dark. walk, don’t run', 5, true);
      else if (n === 19) ui.hint('one more', 4, true);
      if (n >= game.goal) flow.startEnding();
    },

    startEnding() {
      if (game.phase !== 'play') return;
      game.phase = 'ending';
      state.endT = 0;
      controls.enable(false);
      ui.clearHint();
      ui.playing(false);
      ui.reticle('');
      const p = game.player;
      state.base.yaw = p.yaw; state.base.pitch = p.pitch;
      state.starYaw = p.yaw + wrap(clearSkyYaw(p.yaw) - p.yaw);
      state.released = false; state.opened = false; state.finale = false; state.shownEnd = false;
    },

    again() {
      if (state.fadeT >= 0) return;
      // Dip to dark, reset behind it, and come back up on a new evening.
      ui.end(false);
      state.fadeT = 0;
      state.fadeAction = () => {
        game.count = 0;
        game.tod.set(0); game.todTarget = 0;
        state.playTime = 0; state.sinceCatch = 0; state.shown = {};
        game.player.pos.copy(START); game.player.yaw = START_YAW; game.player.pitch = -0.06;
        rig.reset(); rig.setCount(0, game.goal); rig.state.glow = 0;
        U.starBoost.value = 0;
        fireflies.reset();
        ui.setCount(0, false);
        if (audio.ready) { audio.musicOn = true; audio.setCount(0); audio.nextBeat = audio.ctx.currentTime + 0.5; }
        game.phase = 'title';
        flow.begin();
      };
    },

    update(dt) {
      const p = game.player;
      for (const e of fireflies.events.splice(0)) {
        if (e.type === 'landed') flow.landed();
        else if (e.type === 'spooked') { if (game.time - (state.spookAt ?? -99) > 9) { state.spookAt = game.time; ui.hint('you startled it. walk up slowly', 3.2, true); } }
        else if (e.type === 'released') { snd('release', e.n); log({ type: 'release', n: e.n }); rig.setCount(Math.max(0, game.count - e.n), game.goal); }
      }

      if (state.fadeT >= 0) {
        const before = state.fadeT;
        state.fadeT += dt;
        if (before < 0.7 && state.fadeT >= 0.7) { state.fadeAction(); state.fadeAction = null; }
        game.fade.value = state.fadeT < 0.7 ? 1 - ease(state.fadeT / 0.7) : ease((state.fadeT - 0.9) / 1.1);
        if (state.fadeT > 2.0) { state.fadeT = -1; game.fade.value = 1; }
      }

      if (game.phase === 'title') {
        // The meadow breathes while it waits.
        if (!game.camLock) { p.yaw = START_YAW + Math.sin(game.time * 0.11) * 0.035; p.pitch = -0.06 + Math.sin(game.time * 0.17) * 0.012; }
      } else if (game.phase === 'play') {
        if (!state.paused) { state.playTime += dt; state.sinceCatch += dt; }
        // Night comes on its own, slowly, and each catch brings it closer.
        if (!game.todLock) game.todTarget = Math.max(game.todTarget, todFor(state.playTime, game.count));
        const tod = game.tod.value;
        if (!state.shown.porch && tod > 0.24) state.shown.porch = ui.hint('someone has put the porch light on', 4);
        if (!state.shown.star && tod > 0.5) state.shown.star = ui.hint('the first star is out', 4);
        if (!state.shown.dark && tod > 0.8) state.shown.dark = ui.hint('it is dark now. the jar lights your way', 4.5);
        if (game.count === 0 && state.sinceCatch > 30 && !state.shown.nudge) {
          state.shown.nudge = ui.hint(controls.state.touch ? 'walk right up to a little light, then tap it' : 'walk right up to a little light, put the dot on it, and click', 7);
        }
        // The crosshair is honest: a ring only when a click will catch.
        if (controls.state.locked) {
          const rad = pickRadius(false);
          const hit = fireflies.pick(0, 0, rad);
          if (hit && !hit.tooFar) state.ringed = { f: hit.f, t: game.time };
          // The ring is drawn at the real size of the catch area for that firefly.
          ui.reticle(hit ? (hit.tooFar ? 'far' : 'near') : '', hit && !hit.tooFar ? rad * THREE.MathUtils.clamp(3.0 / hit.f.pos.distanceTo(game.camera.position), 0.7, 1.8) : 0);
        }
      } else if (game.phase === 'ending' || game.phase === 'done') {
        state.endT += dt;
        const t = state.endT;
        game.todTarget = 1;
        // Turn to open sky, lift the jar, and watch.
        p.yaw = THREE.MathUtils.lerp(state.base.yaw, state.starYaw, span(t, 0.2, 3.6));
        const settle = span(t, 0.4, 3.0), rise = span(t, 10.0, 18.5);
        p.pitch = THREE.MathUtils.lerp(THREE.MathUtils.lerp(state.base.pitch, 0.1, settle), 0.86, rise) + Math.sin(game.time * 0.3) * 0.005;
        rig.state.lift = span(t, 0.3, 2.2) * (1 - 0.6 * span(t, 12.5, 16));
        if (t > 1.5 && !state.finale) { state.finale = true; snd('finale'); log({ type: 'finale' }); }
        if (t > 1.9 && !state.opened) { state.opened = true; rig.state.open = 1; rig.state.openT = 0; snd('lid'); log({ type: 'lid' }); }
        if (t > 4.7 && !state.released) {
          state.released = true;
          // Where the jar of stars goes depends on the screen: above the end card on a monitor or an
          // upright phone, beside it on a phone held sideways.
          const aspect = window.innerWidth / window.innerHeight, short = window.innerHeight < 500;
          const layout = aspect < 1 ? { el: 1.0, scale: 0.78 } : short ? { el: 0.88, az: 0.27, scale: 0.9 } : { el: 0.97, scale: 1 };
          fireflies.releaseAll(state.starYaw, layout);
        }
        // Hands sink out of frame once the jar is empty, so the last thing on screen is the sky.
        rig.state.away = span(t, 13.5, 17.5);
        U.starBoost.value = 0.12 * span(t, 12, 20);
        if (t > 25.5 && !state.shownEnd) {
          state.shownEnd = true;
          game.phase = 'done';
          controls.exitLock();
          if (!game.noEndCard) ui.end(true);
        }
      }

      // Time of day eases toward its target so a quick run of catches never snaps the light.
      const target = game.todTarget, cur = game.tod.value;
      if (Math.abs(target - cur) > 0.0002) {
        const rate = game.phase === 'ending' || game.phase === 'done' ? 0.07 : 0.02;
        game.tod.set(cur + THREE.MathUtils.clamp(target - cur, -rate * dt, rate * dt));
      }
      if (audio.ready && !game.DET) audio.update(game.tod.value);
    },
  };
  return flow;
}
