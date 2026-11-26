// Why did the trailer's night shot stall? Sample the autopilot's target every half second.
import { launch } from './lib/browser.mjs';

const b = await launch({ width: 1280, height: 720 });
await b.open('det&debug&nolock&trailer');
const rows = await b.page.evaluate(() => {
  const g = window.__ffj, d = g.director;
  d.prepare();
  const out = [];
  const n = 45 * 60;
  // Re-run the director's own tick through its public frame loop, without drawing.
  const realStep = g.step;
  g.step = (dt) => g.update(dt);
  const realSettle = g.settle;
  g.settle = () => Promise.resolve();
  for (let i = 0; i < n; i++) {
    d.frame(i);
    if (i >= 20.3 * 60 && i % 30 === 0) {
      const p = g.player;
      const list = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle').map((f) => ({ d: +Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z).toFixed(1), h: +(f.pos.y - p.pos.y).toFixed(1), spook: +f.spook.toFixed(1), dip: !!f.dip }))
        .sort((a, c) => a.d - c.d).slice(0, 3);
      out.push({ t: +(i / 60).toFixed(1), count: g.count, phase: g.phase, speed: +p.speed.toFixed(2), reach: +g.fireflies.reach.toFixed(2), auto: g.controls.autopilot, near: list });
    }
    if (g.phase !== 'play' && out.length > 4) break;
  }
  g.step = realStep; g.settle = realSettle;
  return out.slice(0, 26);
});
for (const r of rows) console.log(JSON.stringify(r));
await b.check();
await b.teardown(0);
