// The ending, measured over and over: every frame from the 20th catch to the end card, with the
// GPU queue drained each frame. Any frame over the 60 fps budget (16.7 ms) is listed with when it
// happened and whether the time went in the page's own work (JS: update + draw calls) or in
// waiting for the GPU to finish, which is where another program using the card shows up.
// node tools/perf-ending.mjs [--built] [--runs 6]
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const runs = +opt('runs', 6);
const b = await launch({ width: 1920, height: 1080, built: args.includes('--built') });
let slowRuns = 0;
for (let n = 1; n <= runs; n++) {
  await b.open('debug&nolock&autostart&det');
  const r = await b.page.evaluate(async () => {
    const g = window.__ffj;
    await g.debugState({ tod: 0.95, count: 20, lock: 0 });
    g.flow.startEnding();
    const dev = g.renderer.backend.device;
    const frames = [], slow = [];
    let last = performance.now(), sim = 0, warm = 30;
    while (sim < 27) {
      const dt = Math.min(0.05, (performance.now() - last) / 1000 || 1 / 60);
      const a = performance.now();
      g.step(dt);
      const js = performance.now() - a;
      await dev.queue.onSubmittedWorkDone();
      const now = performance.now();
      sim += dt;
      if (warm-- <= 0) {
        const ms = now - last;
        frames.push(ms);
        if (ms > 16.7) slow.push({ at: +sim.toFixed(2), ms: +ms.toFixed(1), js: +js.toFixed(1), gpuWait: +(ms - js).toFixed(1) });
      }
      last = now;
    }
    frames.sort((x, y) => x - y);
    const sum = frames.reduce((x, y) => x + y, 0);
    const worst = frames.slice(Math.floor(frames.length * 0.99));
    return { frames: frames.length, avgFps: +(1000 / (sum / frames.length)).toFixed(1), low1: +(1000 / (worst.reduce((x, y) => x + y, 0) / worst.length)).toFixed(1), p99: +frames[Math.floor(frames.length * 0.99)].toFixed(1), max: +frames.at(-1).toFixed(1), phase: g.phase, slow };
  });
  if (r.max > 33.4) slowRuns++;
  console.log(`run ${n}: avg ${r.avgFps} fps | 1% low ${r.low1} | p99 ${r.p99} ms | max ${r.max} ms | over 16.7 ms: ${r.slow.length}/${r.frames} | ends in "${r.phase}"`);
  for (const s of r.slow) console.log(`    ${s.at} s into the ending: ${s.ms} ms (page ${s.js} ms, waiting on GPU ${s.gpuWait} ms)`);
  await b.check();
}
console.log(`[perf-ending] ${runs} runs, ${slowRuns} with a frame over 33 ms`);
await b.teardown(0);
