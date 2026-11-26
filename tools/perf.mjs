// Measure real frame rate at 1920x1080 on the discrete GPU.
// node tools/perf.mjs [--uncapped] [--q high] [--built] [--size 1920x1080] [--mobile]
// Default run is vsync-capped (what a player sees). --uncapped lifts the cap to show headroom.
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const uncapped = args.includes('--uncapped');
const synced = args.includes('--synced'); // wait for the GPU queue to drain every frame: CPU + GPU time, no pipelining
const mobile = args.includes('--mobile');
const [w, h] = opt('size', mobile ? '844x390' : '1920x1080').split('x').map(Number);
const b = await launch({ width: w, height: h, mobile, dpr: mobile ? 2 : 1, built: args.includes('--built'), extraArgs: uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [] });
await b.open(['debug', 'nolock', 'autostart', synced ? 'det' : '', opt('q') ? 'q=' + opt('q') : ''].filter(Boolean).join('&'));
const page = b.page;

const scenes = [
  { name: 'golden hour, empty jar', kv: { tod: 0.02, count: 0, lock: 1, x: 4, z: 6, yaw: 1.22, pitch: -0.06 } },
  { name: 'dusk, 10 in the jar', kv: { tod: 0.5, count: 10, lock: 1, x: -6, z: -4, yaw: 0.4, pitch: -0.05 } },
  { name: 'night, 19 in the jar', kv: { tod: 1.0, count: 19, lock: 1, x: -10, z: 8, yaw: 1.3, pitch: -0.1 } },
];

const rows = [];
const measure = async (name, seconds, setup) => {
  const r = await page.evaluate(async ({ seconds, setup, synced }) => {
    const g = window.__ffj;
    if (setup) await g.debugState(setup);
    if (synced) {
      const dev = g.renderer.backend.device;
      g.controls.autopilot = setup ? { x: 0.25, y: 0.8 } : null;
      const times = [];
      const end = performance.now() + seconds * 1000;
      let last = performance.now(), warm = 30;
      while (performance.now() < end) {
        if (setup) g.player.yaw += 0.004;
        g.step(Math.min(0.05, (performance.now() - last) / 1000 || 1 / 60));
        await dev.queue.onSubmittedWorkDone();
        const now = performance.now();
        if (warm-- <= 0) times.push(now - last);
        last = now;
      }
      g.controls.autopilot = null;
      times.sort((a, c) => a - c);
      const sum = times.reduce((a, c) => a + c, 0), pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
      const worst = times.slice(Math.floor(times.length * 0.99));
      const info = g.renderer.info;
      return { frames: times.length, avgFps: 1000 / (sum / times.length), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: times.at(-1), low1: 1000 / (worst.reduce((a, c) => a + c, 0) / worst.length), over20ms: times.filter((t) => t > 16.7).length, tris: info.render.triangles, calls: info.render.drawCalls ?? info.render.calls, size: [g.renderer.domElement.width, g.renderer.domElement.height] };
    }
    // Walk in a slow arc and look around, so grass wrapping and shadows are in the numbers.
    g.controls.autopilot = setup ? { x: 0.25, y: 0.8 } : null;
    const times = [];
    await new Promise((res) => {
      let last = performance.now(), start = last, warm = 60;
      const tick = (now) => {
        if (setup) g.player.yaw += 0.004;
        if (warm-- <= 0) times.push(now - last);
        last = now;
        if (now - start < seconds * 1000 + 1000) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    g.controls.autopilot = null;
    times.sort((a, c) => a - c);
    const sum = times.reduce((a, c) => a + c, 0);
    const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
    const worst = times.slice(Math.floor(times.length * 0.99));
    const info = g.renderer.info;
    return {
      frames: times.length, avgFps: 1000 / (sum / times.length), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: times.at(-1),
      low1: 1000 / (worst.reduce((a, c) => a + c, 0) / worst.length),
      over20ms: times.filter((t) => t > 20).length,
      tris: info.render.triangles, calls: info.render.drawCalls ?? info.render.calls,
      size: [g.renderer.domElement.width, g.renderer.domElement.height],
    };
  }, { seconds, setup, synced });
  rows.push({ name, ...r });
  console.log(`${name.padEnd(26)} avg ${r.avgFps.toFixed(1)} fps | 1% low ${r.low1.toFixed(1)} | p50 ${r.p50.toFixed(2)} ms | p95 ${r.p95.toFixed(2)} | p99 ${r.p99.toFixed(2)} | max ${r.max.toFixed(1)} | >20ms ${r.over20ms}/${r.frames} | ${r.size.join('x')} | tris ${r.tris} calls ${r.calls}`);
};

for (const s of scenes) await measure(s.name, 8, s.kv);
// The ending: fireflies leaving, camera tilting to the stars.
await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ tod: 0.95, count: 20, lock: 0 }); g.flow.startEnding(); });
await measure('ending, release to stars', 12, null);

console.log('[perf]', JSON.stringify({ mode: synced ? 'gpu-synced' : uncapped ? 'uncapped' : 'browser rAF', viewport: [w, h], rows }));
await b.check();
await b.teardown(0);
