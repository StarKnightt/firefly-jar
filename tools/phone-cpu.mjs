// How the phone tier holds up when the CPU is slowed to phone speed. Chrome's CPU throttle slows
// the page's main thread (game logic and draw-call encoding) by a set factor; it does NOT slow the
// GPU, so this bounds the CPU side only. 4x is the usual stand-in for a mid-range phone on a
// typical desktop; this desktop CPU is faster than typical, so 6x is the more honest figure here.
// node tools/phone-cpu.mjs [--built] [--url https://...]
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const b = await launch({ width: 390, height: 844, mobile: true, dpr: 2, built: args.includes('--built'), url: opt('url', null) });
await b.open('debug');
const page = b.page;
await page.waitForSelector('#begin:not([disabled])');
await page.tap('#begin');
await page.waitForTimeout(1500);
const cdp = await page.context().newCDPSession(page);
// Walk and look while measuring, as a player would.
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
await touch('touchStart', [[90, 700, 1]]);
await touch('touchMove', [[90, 660, 1]]);
for (const rate of [1, 2, 4, 6]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => new Promise((res) => {
    const times = []; let last = performance.now(); const t0 = last;
    const tick = (now) => { times.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(tick); else { times.sort((a, c) => a - c); const sum = times.reduce((a, c) => a + c, 0); const w = times.slice(Math.floor(times.length * 0.99)); res({ fps: +(1000 / (sum / times.length)).toFixed(1), low1: +(1000 / (w.reduce((a, c) => a + c, 0) / w.length)).toFixed(1), gov: window.__ffj.gov.scale }); } };
    requestAnimationFrame(tick);
  }));
  console.log(`CPU slowed ${rate}x: ${r.fps} fps average, worst 1% ${r.low1} fps (resolution scale ${r.gov})`);
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await touch('touchEnd', []);
await b.check();
await b.teardown(0);
