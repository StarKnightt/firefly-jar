// The evening itself: title, catching, nightfall, and letting them go.
import * as THREE from 'three/webgpu';
import { U } from './tod.js';
import { START, START_YAW, OAK } from './world/layout.js';

const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const span = (t, a, b) => ease((t - a) / (b - a));

export function createFlow(game) {
  const { rig, fireflies, audio, ui, controls } = game;
  const state = { playTime: 0, sinceCatch: 0, endT: 0, paused: false, firstHint: false, tooFarAt: -10, base: { yaw: 0, pitch: 0 }, starYaw: 0, shown: {} };
  const log = (e) => { if (game.audioLog) game.audioLog.push({ t: game.time, ...e }); };
  const snd = (name, ...args) => { if (audio.ready) audio[name](...args); };

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
      setTimeout(() => ui.hint(touch ? 'walk up to a firefly, then tap it' : 'walk up to a firefly, then click it', 7, true), game.DET ? 0 : 1400);
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

    // A reach: at the crosshair, the cursor, or wherever the finger tapped.
    tryCatch(nx, ny, touch) {
      if (game.phase !== 'play' || state.paused) return null;
      const night = THREE.MathUtils.smoothstep(game.tod.value, 0.3, 0.95);
      const scale = THREE.MathUtils.clamp(Math.min(window.innerWidth, window.innerHeight) / 900, 0.75, 1.4);
      const radius = (touch ? 62 : 58) * scale * (1 - 0.2 * night);
      const hit = fireflies.pick(nx, ny, radius);
      if (hit && !hit.tooFar) {
        fireflies.catch(hit.f);
        rig.scoop(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny + 0.35, -1, 1));
        snd('lid'); log({ type: 'lid' });
        state.sinceCatch = 0;
        return 'caught';
      }
      if (hit && hit.tooFar) {
        fireflies.beckon(hit.f);
        if (game.time - state.tooFarAt > 5) { ui.hint('almost. a few steps closer', 2.6); state.tooFarAt = game.time; }
        snd('miss'); log({ type: 'miss' });
        return 'far';
      }
      rig.scoop(THREE.MathUtils.clamp(nx, -1, 1) * 0.5, 0.1);
      snd('miss'); log({ type: 'miss' });
      if (night > 0.2) {
        // Swiping at the dark makes the nearby ones scatter.
        const p = new THREE.Vector3(nx, ny, 0.5).unproject(game.camera).sub(game.camera.position).normalize().multiplyScalar(2.5).add(game.camera.position);
        fireflies.startle(p, night);
      }
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
      else if (n === 10) ui.hint('halfway. it is getting dark', 4, true);
      else if (n === 15) ui.hint('they are quicker in the dark', 4, true);
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
      const p = game.player;
      state.base.yaw = p.yaw; state.base.pitch = p.pitch;
      // Under the oak there is no sky to watch them go into, so turn to face open air.
      const dx = p.pos.x - OAK.x, dz = p.pos.z - OAK.z;
      const nearOak = Math.hypot(dx, dz) < 13;
      state.starYaw = nearOak ? Math.atan2(-dx, -dz) + Math.PI : p.yaw;
      // Take the short way round.
      while (state.starYaw - p.yaw > Math.PI) state.starYaw -= Math.PI * 2;
      while (state.starYaw - p.yaw < -Math.PI) state.starYaw += Math.PI * 2;
      state.released = false; state.opened = false; state.finale = false; state.shownEnd = false;
    },

    again() {
      ui.end(false);
      game.count = 0;
      game.tod.set(0); game.todTarget = 0;
      state.playTime = 0; state.sinceCatch = 0;
      game.player.pos.copy(START); game.player.yaw = START_YAW; game.player.pitch = -0.06;
      rig.state.lift = 0; rig.state.away = 0; rig.state.open = 0; rig.state.lidTarget = 0; rig.setCount(0, game.goal); rig.state.glow = 0;
      U.starBoost.value = 0;
      fireflies.releasing = false;
      fireflies.jarFlies.forEach((j) => { j.left = false; });
      fireflies.reset();
      ui.setCount(0, false);
      if (audio.ready) { audio.musicOn = true; audio.setCount(0); audio.nextBeat = audio.ctx.currentTime + 0.5; }
      game.phase = 'title';
      flow.begin();
    },

    update(dt) {
      const p = game.player;
      for (const e of fireflies.events.splice(0)) {
        if (e.type === 'landed') flow.landed();
        else if (e.type === 'released') { snd('release', e.n); log({ type: 'release', n: e.n }); rig.setCount(Math.max(0, game.count - e.n), game.goal); }
      }

      if (game.phase === 'title') {
        // The meadow breathes while it waits.
        if (!game.camLock) { p.yaw = START_YAW + Math.sin(game.time * 0.11) * 0.035; p.pitch = -0.06 + Math.sin(game.time * 0.17) * 0.012; }
      } else if (game.phase === 'play') {
        if (!state.paused) { state.playTime += dt; state.sinceCatch += dt; }
        // Night comes on its own, and faster the fuller the jar is.
        if (!game.todLock) game.todTarget = Math.max(game.todTarget, Math.min(1, Math.max(state.playTime / 340, (game.count / game.goal) * 0.95)));
        if (game.count === 0 && state.sinceCatch > 26 && !state.shown.nudge) {
          state.shown.nudge = ui.hint(controls.state.touch ? 'get close, then tap the little light' : 'get close, put the dot on the little light, and click', 6);
        }
        // Crosshair tells you when one is in reach.
        if (controls.state.locked) {
          const scale = THREE.MathUtils.clamp(Math.min(window.innerWidth, window.innerHeight) / 900, 0.75, 1.4);
          const hit = fireflies.pick(0, 0, 58 * scale);
          ui.reticle(hit ? (hit.tooFar ? 'far' : 'near') : '');
        }
      } else if (game.phase === 'ending' || game.phase === 'done') {
        state.endT += dt;
        const t = state.endT;
        game.todTarget = 1;
        // Lift the jar, look up after them.
        p.yaw = THREE.MathUtils.lerp(state.base.yaw, state.starYaw, span(t, 0.2, 3.4));
        const up1 = span(t, 0.4, 3.2), up2 = span(t, 4.2, 11.5);
        p.pitch = THREE.MathUtils.lerp(THREE.MathUtils.lerp(state.base.pitch, 0.3, up1), 0.86, up2) + Math.sin(game.time * 0.3) * 0.006;
        rig.state.lift = span(t, 0.3, 2.3) * (1 - 0.72 * span(t, 8.5, 13.5));
        // Hands drop away so the last thing on screen is the sky.
        rig.state.away = span(t, 9.5, 13.8);
        if (t > 1.6 && !state.finale) { state.finale = true; snd('finale'); log({ type: 'finale' }); }
        if (t > 2.35 && !state.opened) { state.opened = true; rig.state.open = 1; snd('lid'); log({ type: 'lid' }); }
        if (t > 2.8 && !state.released) { state.released = true; fireflies.releaseAll(state.starYaw); }
        U.starBoost.value = 0.6 * span(t, 6.5, 14);
        if (t > 14.2 && !state.shownEnd) {
          state.shownEnd = true;
          game.phase = 'done';
          controls.exitLock();
          if (!game.noEndCard) ui.end(true);
        }
      }

      // Time of day eases toward its target so a quick run of catches never snaps the light.
      const target = game.todTarget, cur = game.tod.value;
      if (Math.abs(target - cur) > 0.0002) {
        const rate = game.phase === 'ending' || game.phase === 'done' ? 0.09 : 0.03;
        game.tod.set(cur + THREE.MathUtils.clamp(target - cur, -rate * dt, rate * dt));
      }
      if (audio.ready && !game.DET) audio.update(game.tod.value);
    },
  };
  return flow;
}
