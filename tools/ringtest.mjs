// On touch, the reach ring must appear round a firefly that is close enough to catch, by day and
// after dark, and must not appear round one that is startled or out of reach.
import { launch } from './lib/browser.mjs';

const b = await launch({ width: 844, height: 390, mobile: true, dpr: 2 });
await b.open('det&debug&nolock');
const page = b.page;
const run = (tod, dist, spook) => page.evaluate(({ tod, dist, spook }) => {
  const g = window.__ffj;
  if (g.phase === 'title') g.flow.begin();
  g.debugState({ tod, count: 12, lock: 1 });
  const f = g.fireflies.wild.find((w) => w.alive && w.state === 'idle');
  f.spook = spook; f.dip = false; f.vel.set(0, 0, 0);
  // Stand `dist` metres from it, facing it.
  const yaw = 0.7;
  g.player.pos.set(f.pos.x + Math.sin(yaw) * dist, 0, f.pos.z + Math.cos(yaw) * dist);
  g.player.yaw = yaw; g.player.pitch = 0;
  f.home.copy(f.pos);
  for (let i = 0; i < 4; i++) { f.spook = spook; g.step(1 / 60); }
  const ring = document.getElementById('ring');
  const r = ring.getBoundingClientRect();
  return { on: ring.classList.contains('on'), size: Math.round(r.width), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), reach: +g.fireflies.reach.toFixed(2), glow: +f.glow.toFixed(2), touch: g.controls.state.touch };
}, { tod, dist, spook });

const cases = [
  ['day, 2.4 m', 0.1, 2.4, 0, true],
  ['night, 2.4 m', 0.9, 2.4, 0, true],
  ['night, 5 m (too far)', 0.9, 5, 0, false],
  ['night, 2.4 m, startled', 0.9, 2.4, 2, false],
];
let ok = true;
for (const [name, tod, dist, spook, want] of cases) {
  const r = await run(tod, dist, spook);
  const pass = r.on === want && (!want || (r.size >= 44 && r.x > 0 && r.x < 844 && r.y > 0 && r.y < 390));
  ok = ok && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(r)}`);
}
// One frame for the eye: let the firefly fade in and the screens finish their transitions.
await run(0.9, 2.4, 0);
await page.evaluate(() => { const g = window.__ffj; const f = g.fireflies.wild.find((w) => w.alive && w.state === 'idle'); const p = f.pos.clone(); for (let i = 0; i < 80; i++) { f.pos.copy(p); f.vel.set(0, 0, 0); f.spook = 0; g.step(1 / 60); } });
await page.waitForTimeout(1300);
await page.evaluate(() => window.__ffj.settle());
await page.screenshot({ path: 'shots/ring-touch.png' });
console.log(ok ? 'RING TEST PASS' : 'RING TEST FAIL');
await b.check();
await b.teardown(ok ? 0 : 1);
