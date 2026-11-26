// Which frames miss the 60 fps budget in a play scene, when, and where the time goes.
// Same scenes and walk as tools/perf.mjs; lists every frame over 16.7 ms with the split between
// the page's own work and waiting for the GPU, plus what the game was doing on that frame.
// node tools/perf-slow.mjs [--built] [--runs 3] [--scene night|dusk|golden]
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const scenes = {
  golden: { tod: 0.02, count: 0, lock: 1, x: 4, z: 6, yaw: 1.22, pitch: -0.06 },
  dusk: { tod: 0.5, count: 10, lock: 1, x: -6, z: -4, yaw: 0.4, pitch: -0.05 },
  night: { tod: 1.0, count: 19, lock: 1, x: -10, z: 8, yaw: 1.3, pitch: -0.1 },
};
const kv = scenes[opt('scene', 'night')];
const b = await launch({ width: 1920, height: 1080, built: args.includes('--built') });
for (let n = 1; n <= +opt('runs', 3); n++) {
  await b.open('debug&nolock&autostart&det');
  const r = await b.page.evaluate(async (kv) => {
    const g = window.__ffj;
    await g.debugState(kv);
    const dev = g.renderer.backend.device;
    g.controls.autopilot = { x: 0.25, y: 0.8 };
    const slow = [];
    let last = performance.now(), sim = 0, i = 0, frames = 0;
    const hintEl = document.getElementById('hint');
    let prevHint = hintEl.textContent, prevAlive = g.fireflies.wild.filter((f) => f.alive).length;
    const end = performance.now() + 8000;
    while (performance.now() < end) {
      g.player.yaw += 0.004;
      const dt = Math.min(0.05, (performance.now() - last) / 1000 || 1 / 60);
      const a = performance.now();
      g.step(dt);
      const js = performance.now() - a;
      await dev.queue.onSubmittedWorkDone();
      const now = performance.now();
      sim += dt; i++;
      const alive = g.fireflies.wild.filter((f) => f.alive).length;
      if (i > 30) {
        frames++;
        const ms = now - last;
        if (ms > 16.7) slow.push({ frame: i, at: +sim.toFixed(2), ms: +ms.toFixed(1), js: +js.toFixed(1), gpuWait: +(ms - js).toFixed(1), hintChanged: hintEl.textContent !== prevHint ? hintEl.textContent : '', spawned: alive - prevAlive, x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) });
      }
      prevHint = hintEl.textContent; prevAlive = alive;
      last = now;
    }
    g.controls.autopilot = null;
    return { frames, slow };
  }, kv);
  console.log(`run ${n}: ${r.slow.length} of ${r.frames} frames over 16.7 ms`);
  for (const s of r.slow) console.log('    ' + JSON.stringify(s));
  await b.check();
}
await b.teardown(0);
