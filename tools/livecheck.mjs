// Open a deployed copy of the game at desktop and phone sizes, start it with a real click or tap,
// let it run in real time and confirm it is playing, on the GPU, with no errors.
// node tools/livecheck.mjs --url https://... [--out shots/live]
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = opt('url');
if (!url) { console.error('need --url'); process.exit(2); }
const out = path.resolve(opt('out', 'shots/live'));
await fs.mkdir(out, { recursive: true });

const views = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'phone-landscape-844x390', width: 844, height: 390, mobile: true, dpr: 2 },
  { name: 'phone-portrait-390x844', width: 390, height: 844, mobile: true, dpr: 2 },
];
let ok = true;
for (let i = 0; i < views.length; i++) {
  const v = views[i];
  const b = await launch({ ...v, url });
  await b.open('debug');
  const page = b.page;
  await page.waitForSelector('#begin:not([disabled])', { timeout: 60000 });
  await page.screenshot({ path: path.join(out, `${v.name}-title.png`) });
  if (v.mobile) await page.tap('#begin'); else await page.click('#begin');
  await page.waitForTimeout(2500);
  // Real-time frame rate over three seconds, as the page itself sees it.
  const r = await page.evaluate(() => new Promise((res) => {
    const g = window.__ffj; let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res({ phase: g.phase, tier: g.tier?.name ?? g.tierName, gpu: g.gpu, touch: g.controls.state.touch, fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), fireflies: g.fireflies.wild.filter((f) => f.alive).length, canvas: [g.renderer.domElement.width, g.renderer.domElement.height] }); };
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: path.join(out, `${v.name}-playing.png`) });
  const good = r.phase === 'play' && r.fireflies > 0 && r.touch === !!v.mobile;
  ok = ok && good;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${v.name}  ${JSON.stringify(r)}`);
  await b.check(); // throws on page or shader errors
  await b.teardown(i === views.length - 1 ? (ok ? 0 : 1) : null);
}
