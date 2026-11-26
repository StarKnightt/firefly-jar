// Standard screenshot set for a review round: the whole evening on desktop and on a phone,
// taken from a real play-through (bot walks, aims and catches; nothing is staged off-camera).
// node tools/capture-set.mjs --out shots/round1 [--built]
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(opt('out', 'shots/round'));
const built = args.includes('--built');
await fs.mkdir(out, { recursive: true });

const views = [
  { tag: 'desktop', width: 1920, height: 1080, mobile: false, dpr: 1 },
  { tag: 'phone-landscape', width: 844, height: 390, mobile: true, dpr: 2 },
  { tag: 'phone-portrait', width: 390, height: 844, mobile: true, dpr: 2 },
];
const only = opt('only');

for (const v of views) {
  if (only && v.tag !== only) continue;
  const b = await launch({ width: v.width, height: v.height, mobile: v.mobile, dpr: v.dpr, built });
  await b.open('det&debug&nolock');
  const page = b.page;
  const shot = async (name, settle = 1300) => {
    // UI fades run on real time; give them a moment, then let two frames present.
    await page.waitForTimeout(settle);
    await page.evaluate(() => { window.__ffj.step(1 / 60); return window.__ffj.settle(); });
    await page.screenshot({ path: path.join(out, `${v.tag}-${name}.png`) });
    console.log('shot', `${v.tag}-${name}.png`);
  };
  const steps = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__ffj.step(1 / 60); }, n);
  // Bot: walk to the nearest firefly and catch until `until` is in the jar. Returns game seconds used.
  const playTo = (until, opts = {}) => page.evaluate(async ({ until, opts }) => {
    const g = window.__ffj, dt = 1 / 60;
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    let target = null, guard = 0, t0 = g.time;
    while (g.phase === 'play' && g.count < until && guard++ < 60 * 60 * 8) {
      const p = g.player;
      const list = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle');
      if (!target || !target.alive || target.state !== 'idle') target = list.sort((a, c) => a.pos.distanceTo(p.pos) - c.pos.distanceTo(p.pos))[0] || null;
      if (target) {
        const dx = target.pos.x - g.camera.position.x, dy = target.pos.y - g.camera.position.y, dz = target.pos.z - g.camera.position.z;
        const wantYaw = Math.atan2(-dx, -dz), flat = Math.hypot(dx, dz), wantPitch = Math.atan2(dy, flat);
        p.yaw += Math.max(-0.035, Math.min(0.035, wrap(wantYaw - p.yaw)));
        p.pitch += Math.max(-0.03, Math.min(0.03, wantPitch - p.pitch));
        const aimed = Math.abs(wrap(wantYaw - p.yaw)) < 0.04 && Math.abs(wantPitch - p.pitch) < 0.04;
        g.controls.autopilot = { x: 0, y: flat > g.fireflies.reach - 1.0 ? 1 : 0, run: false };
        if (opts.stopBeforeCatch && aimed && flat < g.fireflies.reach - 0.5 && g.count === until - 1) break;
        if (aimed && flat < g.fireflies.reach - 0.5 && g.frame % 30 === 0) { if (g.flow.tryCatch(0, 0, false) === 'caught') target = null; }
      } else g.controls.autopilot = { x: 0, y: 0.6 };
      g.step(dt);
    }
    g.controls.autopilot = null;
    return +(g.time - t0).toFixed(1);
  }, { until, opts });

  await steps(90);
  await shot('01-title');
  await page.evaluate(() => window.__ffj.flow.begin());
  await steps(60);
  await shot('02-first-view', 2200);
  // Up close, about to catch the first one.
  await playTo(1, { stopBeforeCatch: true });
  await shot('03-firefly-in-reach', 400);
  await page.evaluate(() => { window.__ffj.flow.tryCatch(0, 0, false); });
  await steps(22);
  await shot('04-catch-swoop', 100);
  await steps(60);
  await shot('05-first-caught', 900);
  const t5 = await playTo(5);
  await steps(50);
  await shot('06-five-caught', 600);
  // Look around the meadow as a player would.
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ x: -8, z: 2, yaw: 1.05, pitch: 0.06 }); });
  await steps(40);
  await shot('07-oak-and-swing', 300);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ x: -19, z: -19, yaw: 0.25, pitch: 0.03 }); });
  await steps(40);
  await shot('08-farmhouse', 300);
  // Through the open gate and up the path to the porch steps.
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ x: -22.6, z: -34.2, yaw: 0.2, pitch: 0.12 }); });
  await steps(40);
  await shot('08b-at-the-porch-steps', 300);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ x: -19, z: -19, yaw: 0.25, pitch: 0.03 }); });
  await steps(10);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ pitch: -0.62 }); });
  await steps(30);
  await shot('09-look-down-at-hands', 300);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ pitch: -0.05 }); });
  const t10 = await playTo(10);
  await steps(50);
  await shot('10-ten-caught-dusk', 600);
  const t15 = await playTo(15);
  await steps(50);
  await shot('11-fifteen-caught', 600);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ x: -19, z: -20, yaw: 0.25, pitch: 0.04 }); });
  await steps(40);
  await shot('12-porch-at-night', 300);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ pitch: -0.55 }); });
  await steps(30);
  await shot('13-jar-light-on-grass', 300);
  await page.evaluate(async () => { const g = window.__ffj; await g.debugState({ pitch: -0.05 }); });
  const t19 = await playTo(19);
  await steps(50);
  await shot('14-nineteen-night', 600);
  const t20 = await playTo(20);
  await steps(60 * 3.4);
  await shot('15-ending-hand-on-lid', 100);
  await steps(60 * 2.4);
  await shot('16-ending-lid-off', 100);
  await steps(60 * 4.2);
  await shot('17-ending-leaving', 100);
  await steps(60 * 6);
  await shot('18-ending-rising', 100);
  await steps(60 * 8);
  await shot('19-ending-constellation', 100);
  await steps(60 * 3);
  await shot('20-end-card', 3200);
  console.log(`[pace ${v.tag}] bot seconds to reach 5/10/15/19/20:`, t5, t10, t15, t19, t20);
  await b.check();
  await b.teardown(null);
}
process.exit(0);
