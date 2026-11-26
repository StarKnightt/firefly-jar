// Bot play-through in deterministic time: begin, walk to fireflies, catch 20, watch the ending.
// node tools/playtest.mjs [--mobile] [--out dir] [--q tier] [--built]
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const mobile = args.includes('--mobile');
const out = path.resolve(opt('out', 'shots/playtest'));
await fs.mkdir(out, { recursive: true });
const [w, h] = opt('size', mobile ? '844x390' : '1280x720').split('x').map(Number);
const b = await launch({ width: w, height: h, mobile, dpr: mobile ? 2 : 1, built: args.includes('--built') });
await b.open(['det', 'debug', 'nolock', opt('q') ? 'q=' + opt('q') : ''].filter(Boolean).join('&'));
const page = b.page;
await page.exposeFunction('__shot', async (name) => {
  await page.evaluate(() => window.__ffj.settle());
  await page.screenshot({ path: path.join(out, name + '.png') });
});

await page.evaluate(() => { window.__ffj.flow.begin(); });
const result = await page.evaluate(async () => {
  const g = window.__ffj, dt = 1 / 60;
  const log = { catches: [], misses: 0, far: 0, frames: 0 };
  let target = null, guard = 0;
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  while (g.phase === 'play' && guard++ < 60 * 60 * 12) {
    const p = g.player;
    const list = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle');
    if (!target || !target.alive || target.state !== 'idle') target = list.sort((a, c) => a.pos.distanceTo(p.pos) - c.pos.distanceTo(p.pos))[0] || null;
    if (target) {
      const dx = target.pos.x - g.camera.position.x, dy = target.pos.y - g.camera.position.y, dz = target.pos.z - g.camera.position.z;
      const wantYaw = Math.atan2(-dx, -dz), flat = Math.hypot(dx, dz), wantPitch = Math.atan2(dy, flat);
      // Turn like a person, not an aimbot.
      p.yaw += Math.max(-0.05, Math.min(0.05, wrap(wantYaw - p.yaw)));
      p.pitch += Math.max(-0.04, Math.min(0.04, wantPitch - p.pitch));
      const aimed = Math.abs(wrap(wantYaw - p.yaw)) < 0.05 && Math.abs(wantPitch - p.pitch) < 0.05;
      g.controls.autopilot = { x: 0, y: flat > g.fireflies.reach - 0.45 ? 1 : 0, run: false };
      if (aimed && flat < g.fireflies.reach - 0.1 && g.frame % 20 === 0) {
        const r = g.flow.tryCatch(0, 0, false);
        if (r === 'caught') { log.catches.push({ t: +g.time.toFixed(1), tod: +g.tod.value.toFixed(2) }); target = null; }
        else if (r === 'far') log.far++; else log.misses++;
      }
    } else g.controls.autopilot = { x: 0, y: 0.5 };
    g.step(dt);
    log.frames++;
    if (g.count === 1 && !log.s1) { log.s1 = true; await window.__shot('01-first-catch'); }
    if (g.count === 10 && !log.s10) { log.s10 = true; await window.__shot('02-ten'); }
    if (g.count === 19 && !log.s19) { log.s19 = true; await window.__shot('03-nineteen'); }
  }
  g.controls.autopilot = null;
  log.playSeconds = +g.time.toFixed(1);
  log.phaseAfterPlay = g.phase;
  // Watch the ending.
  let n = 0;
  while (g.phase !== 'done' && n++ < 60 * 45) {
    g.step(dt);
    if (n === 60 * 4) await window.__shot('04-ending-open');
    if (n === 60 * 9) await window.__shot('05-ending-swarm');
    if (n === 60 * 15) await window.__shot('05b-ending-rising');
    if (n === 60 * 23) await window.__shot('06-ending-stars');
  }
  for (let i = 0; i < 90; i++) g.step(dt);
  await new Promise((r) => setTimeout(r, 3000));
  await window.__shot('07-end-card');
  log.final = { phase: g.phase, count: g.count, tod: +g.tod.value.toFixed(2), released: g.fireflies.released, endSeconds: +(n / 60).toFixed(1) };
  return log;
});
console.log('[playtest]', JSON.stringify({ ...result, catches: result.catches.length, firstCatch: result.catches[0], lastCatch: result.catches.at(-1) }));
const ok = result.final.phase === 'done' && result.final.count === 20 && result.final.released === 20;
console.log(ok ? 'PLAYTEST PASS' : 'PLAYTEST FAIL');
await b.check();
await b.teardown(ok ? 0 : 1);
