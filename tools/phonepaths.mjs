// The paths a real phone takes that the other phone-size tests skip:
//  - sound may only start from a touch (the other tests run with autoplay allowed);
//  - many phones have no WebGPU and get the WebGL2 renderer;
//  - the phone gets turned on its side mid-game.
// Each case starts with a real tap, walks with the stick, catches a firefly with a tap, and must
// end with the game playing, the sound running, and no page or shader errors.
// node tools/phonepaths.mjs [--built] [--url https://...]
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const built = args.includes('--built'), url = opt('url', null);
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); };
const state = (page) => page.evaluate(() => { const g = window.__ffj; return { phase: g.phase, api: g.gpu.api, audio: g.audio.ctx?.state, count: g.count, x: g.player.pos.x, z: g.player.pos.z, canvas: [g.renderer.domElement.width, g.renderer.domElement.height], tier: g.tier.name }; });

const cases = [
  { name: 'WebGPU, portrait', query: 'debug', w: 390, h: 844 },
  { name: 'WebGL2 fallback, portrait', query: 'debug&webgl', w: 390, h: 844 },
  { name: 'WebGL2 fallback, landscape', query: 'debug&webgl', w: 844, h: 390 },
];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const b = await launch({ width: c.w, height: c.h, mobile: true, dpr: 2, built, url, strictAutoplay: true });
  await b.open(c.query);
  const page = b.page;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await page.waitForSelector('#begin:not([disabled])', { timeout: 60000 });
  const s0 = await state(page);
  await page.tap('#begin');
  await page.waitForTimeout(900);
  const s1 = await state(page);
  check(`${c.name}: tap begins play on ${s1.api}`, s1.phase === 'play' && s1.api === (c.query.includes('webgl') ? 'webgl2' : 'webgpu'), `tier ${s1.tier}, canvas ${s1.canvas.join('x')}`);
  check(`${c.name}: sound starts from that tap`, s0.audio !== 'running' && s1.audio === 'running', `before "${s0.audio}", after "${s1.audio}"`);
  // Stick: press on the lower left, push up, hold.
  const sx = Math.round(c.w * 0.2), sy = Math.round(c.h * 0.78);
  await touch('touchStart', [[sx, sy, 1]]);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', [[sx, sy - k * 7, 1]]); await page.waitForTimeout(16); }
  await page.waitForTimeout(1300);
  await touch('touchEnd', []);
  const s2 = await state(page);
  check(`${c.name}: stick walks`, Math.hypot(s2.x - s1.x, s2.z - s1.z) > 1, `moved ${Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(2)} m`);
  // Put a firefly in reach in front of the player (the walking up is covered by the other tests),
  // then catch it with a real tap on where it is on screen.
  const at = await page.evaluate(() => {
    const g = window.__ffj, p = g.player;
    const f = g.fireflies.wild.find((w) => w.alive && w.state === 'idle');
    f.pos.set(p.pos.x - Math.sin(p.yaw) * 2.2, g.camera.position.y + 0.05, p.pos.z - Math.cos(p.yaw) * 2.2);
    f.home.copy(f.pos); f.vel.set(0, 0, 0); f.spook = 0; f.dip = false;
    const v = f.pos.clone().project(g.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.waitForTimeout(120);
  const at2 = await page.evaluate(() => { const g = window.__ffj; const f = g.fireflies.wild.filter((w) => w.alive && w.state === 'idle').sort((a, c) => a.pos.distanceTo(g.camera.position) - c.pos.distanceTo(g.camera.position))[0]; const v = f.pos.clone().project(g.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ring: document.getElementById('ring').classList.contains('on') }; });
  await page.touchscreen.tap(at2.x, at2.y);
  await page.waitForTimeout(1500);
  const s3 = await state(page);
  check(`${c.name}: reach ring shows and a tap catches`, at2.ring && s3.count === s2.count + 1, `ring ${at2.ring}, count ${s2.count} -> ${s3.count}`);
  // Turn the phone on its side and back.
  await page.setViewportSize({ width: c.h, height: c.w });
  await page.waitForTimeout(900);
  const s4 = await state(page);
  const turned = (s4.canvas[0] > s4.canvas[1]) !== (s3.canvas[0] > s3.canvas[1]);
  await page.screenshot({ path: `shots/phonepath-${i}.png` }).catch(() => {});
  check(`${c.name}: turning the phone keeps playing`, turned && s4.phase === 'play', `canvas ${s3.canvas.join('x')} -> ${s4.canvas.join('x')}`);
  await b.check(); // throws on page errors and on shader compile or link errors
  const last = i === cases.length - 1, ok = results.every(Boolean);
  if (last) console.log(ok ? 'PHONE PATHS PASS' : 'PHONE PATHS FAIL');
  await b.teardown(last ? (ok ? 0 : 1) : null);
}
