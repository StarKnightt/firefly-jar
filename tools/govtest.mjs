// The frame-rate governor, in real time on the real page:
//  A. a healthy frame rate            -> it does nothing
//  B. the GPU is the limit            -> it lowers the resolution and keeps it lowered
//     (made to happen on a fast card by asking for more fps than the card can draw: ?gov=N)
//  C. something else is the limit     -> it tries, sees no gain, and puts the resolution back
//     (made to happen by throttling the CPU, which a lower resolution cannot help)
// node tools/govtest.mjs [--built]
import { launch } from './lib/browser.mjs';

const built = process.argv.includes('--built');
const read = (page) => page.evaluate(() => { const g = window.__ffj; return { state: g.gov.state, scale: g.gov.scale, log: g.gov.log, canvas: [g.renderer.domElement.width, g.renderer.domElement.height], phase: g.phase }; });
const results = [];
const run = async (name, { query, mobile, throttle, expect }) => {
  const b = await launch(mobile ? { width: 844, height: 390, mobile: true, dpr: 2, built } : { width: 1920, height: 1080, built });
  await b.open(query);
  const page = b.page;
  await page.waitForSelector('#begin:not([disabled])');
  if (throttle) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  const before = await read(page);
  if (mobile) await page.tap('#begin'); else await page.click('#begin');
  await page.waitForTimeout(throttle ? 14000 : 9000);
  const r = await read(page);
  const ok = expect(r, before);
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      canvas ${before.canvas.join('x')} -> ${r.canvas.join('x')}, scale ${r.scale}, state ${r.state}, windows ${JSON.stringify(r.log)}`);
  await b.check();
  return b;
};

let b = await run('A. healthy frame rate: left alone', { query: 'debug', expect: (r, b0) => r.state === 'watch' && r.scale === 1 && r.canvas[0] === b0.canvas[0] && r.phase === 'play' });
await b.teardown(null);
b = await run('B. GPU-bound (asks for 150 fps at 1080p): resolution lowered and kept', { query: 'debug&gov=150', expect: (r, b0) => r.state === 'done' && r.scale < 1 && r.canvas[0] < b0.canvas[0] && r.log.length >= 2 && r.log[1].fps > r.log[0].fps * 1.2 && r.phase === 'play' });
await b.teardown(null);
b = await run('C. CPU-bound phone size (CPU slowed 20x): tried, no gain, resolution restored', { query: 'debug', mobile: true, throttle: 20, expect: (r, b0) => r.state === 'done' && r.scale === 1 && r.canvas[0] === b0.canvas[0] && r.phase === 'play' });
const ok = results.every(Boolean);
console.log(ok ? 'GOVERNOR TEST PASS' : 'GOVERNOR TEST FAIL');
await b.teardown(ok ? 0 : 1);
