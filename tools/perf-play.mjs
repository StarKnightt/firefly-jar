// Frame times across one whole game: a bot plays from the first step into the meadow to the end
// card in real time, with the GPU queue drained every frame (CPU + GPU time per frame, no
// pipelining). Every frame over the 60 fps budget (16.7 ms) is listed with where the time went.
// node tools/perf-play.mjs [--built]
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const b = await launch({ width: 1920, height: 1080, built: args.includes('--built') });
await b.open('det&debug&nolock');
const r = await b.page.evaluate(async () => {
  const g = window.__ffj;
  g.flow.begin();
  const dev = g.renderer.backend.device;
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const times = [], slow = [];
  let target = null, last = performance.now(), i = 0, endFrames = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 400000) {
    if (g.phase === 'play') {
      // The same bot as tools/playtest.mjs: walk to the nearest firefly, turn like a person, click.
      const p = g.player;
      const list = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle');
      if (!target || !target.alive || target.state !== 'idle') target = list.sort((a, c) => a.pos.distanceTo(p.pos) - c.pos.distanceTo(p.pos))[0] || null;
      if (target) {
        const dx = target.pos.x - g.camera.position.x, dy = target.pos.y - g.camera.position.y, dz = target.pos.z - g.camera.position.z;
        const wantYaw = Math.atan2(-dx, -dz), flat = Math.hypot(dx, dz), wantPitch = Math.atan2(dy, flat);
        p.yaw += Math.max(-0.05, Math.min(0.05, wrap(wantYaw - p.yaw)));
        p.pitch += Math.max(-0.04, Math.min(0.04, wantPitch - p.pitch));
        const aimed = Math.abs(wrap(wantYaw - p.yaw)) < 0.05 && Math.abs(wantPitch - p.pitch) < 0.05;
        g.controls.autopilot = { x: 0, y: flat > g.fireflies.reach - 0.45 ? 1 : 0, run: false };
        if (aimed && flat < g.fireflies.reach - 0.1 && i % 20 === 0 && g.flow.tryCatch(0, 0, false) === 'caught') target = null;
      } else g.controls.autopilot = { x: 0, y: 0.5 };
    } else {
      g.controls.autopilot = null;
      if (g.phase === 'done' && endFrames++ > 120) break;
    }
    const dt = Math.min(0.05, (performance.now() - last) / 1000 || 1 / 60);
    const a = performance.now();
    g.step(dt);
    const js = performance.now() - a;
    await dev.queue.onSubmittedWorkDone();
    const now = performance.now();
    if (i++ > 30) {
      const ms = now - last;
      times.push(ms);
      if (ms > 16.7) slow.push({ at: +((now - t0) / 1000).toFixed(1), ms: +ms.toFixed(1), page: +js.toFixed(1), gpuWait: +(ms - js).toFixed(1), phase: g.phase, count: g.count, tod: +g.tod.value.toFixed(2) });
    }
    last = now;
  }
  const seconds = (performance.now() - t0) / 1000;
  const sorted = times.slice().sort((x, y) => x - y);
  const sum = sorted.reduce((x, y) => x + y, 0);
  const worst = sorted.slice(Math.floor(sorted.length * 0.99));
  return { seconds: +seconds.toFixed(1), frames: times.length, phase: g.phase, count: g.count, released: g.fireflies.released, avgFps: +(1000 / (sum / sorted.length)).toFixed(1), low1: +(1000 / (worst.reduce((x, y) => x + y, 0) / worst.length)).toFixed(1), p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(1), p999: +sorted[Math.floor(sorted.length * 0.999)].toFixed(1), max: +sorted.at(-1).toFixed(1), over33: times.filter((t) => t > 33.4).length, slow };
});
console.log(`[perf-play] whole game: ${r.seconds} s, ${r.frames} frames, ended "${r.phase}" with ${r.count} caught and ${r.released} released`);
console.log(`[perf-play] avg ${r.avgFps} fps | 1% low ${r.low1} fps | p99 ${r.p99} ms | p99.9 ${r.p999} ms | max ${r.max} ms | over 16.7 ms: ${r.slow.length}/${r.frames} | over 33 ms: ${r.over33}`);
for (const s of r.slow) console.log('    ' + JSON.stringify(s));
await b.check();
await b.teardown(0);
