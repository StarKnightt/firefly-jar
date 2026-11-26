// Jump straight to the ending and capture it at chosen seconds, with rig state, for look-dev.
// node tools/endingtest.mjs --out dir [--size WxH] [--mobile] [--x -8 --z 2 --yaw 1.0] [--times 2,4,6,9,13,18,24,27]
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const mobile = args.includes('--mobile');
const out = path.resolve(opt('out', 'shots/ending'));
await fs.mkdir(out, { recursive: true });
const [w, h] = opt('size', mobile ? '844x390' : '1600x900').split('x').map(Number);
const times = opt('times', '2,4,6,9,13,18,24,27').split(',').map(Number);
const b = await launch({ width: w, height: h, mobile, dpr: mobile ? 2 : 1 });
await b.open('det&debug&nolock&noui');
const page = b.page;
await page.evaluate(async ({ x, z, yaw }) => {
  const g = window.__ffj;
  g.flow.begin();
  await g.debugState({ tod: 0.93, count: 19, x, z, yaw, pitch: -0.05 });
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  g.flow.landed();
}, { x: +opt('x', 6), z: +opt('z', 8), yaw: +opt('yaw', 1.0) });
let t = 0;
for (const at of times) {
  const info = await page.evaluate(({ n }) => {
    const g = window.__ffj;
    for (let i = 0; i < n; i++) g.step(1 / 60);
    const s = g.rig.state;
    return { phase: g.phase, endT: +g.flow.state.endT.toFixed(2), open: s.open, openT: +s.openT.toFixed(2), handK: +s.handK.toFixed(2), carry: +s.carry.toFixed(2), lift: +s.lift.toFixed(2), away: +s.away.toFixed(2), released: g.fireflies.released, settled: g.fireflies.settled, pitch: +g.player.pitch.toFixed(2) };
  }, { n: Math.round((at - t) * 60) });
  t = at;
  await page.evaluate(() => window.__ffj.settle());
  await page.screenshot({ path: path.join(out, `end-${String(at).padStart(2, '0')}.png`) });
  console.log(at, JSON.stringify(info));
}
await b.check();
await b.teardown(0);
