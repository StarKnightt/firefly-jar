// Real input check: actual key presses, mouse moves, clicks and touches through the browser,
// no test hooks driving the game. node tools/inputtest.mjs [--built] [--url https://...]
import { launch } from './lib/browser.mjs';

const built = process.argv.includes('--built');
const urlAt = process.argv.indexOf('--url');
const url = urlAt >= 0 ? process.argv[urlAt + 1] : null; // test a deployed copy instead of a local server
const snap = (page) => page.evaluate(() => {
  const g = window.__ffj;
  return { phase: g.phase, x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2), yaw: +g.player.yaw.toFixed(3), pitch: +g.player.pitch.toFixed(3), locked: g.controls.state.locked, count: g.count, touch: g.controls.state.touch };
});
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); };

// ---------- desktop ----------
{
  const b = await launch({ width: 1280, height: 720, built, url });
  await b.open('debug');
  const page = b.page;
  await page.waitForSelector('#begin:not([disabled])');
  await page.click('#begin');
  await page.waitForTimeout(600);
  let s0 = await snap(page);
  check('desktop: begin button starts play', s0.phase === 'play', JSON.stringify(s0));
  check('desktop: pointer lock engaged', s0.locked === true);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  let s1 = await snap(page);
  check('desktop: W walks forward', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1.5, `moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)} m`);
  await page.mouse.move(640, 360);
  for (let i = 0; i < 20; i++) await page.mouse.move(640 + i * 12, 360 + i * 3);
  await page.waitForTimeout(200);
  let s2 = await snap(page);
  check('desktop: mouse turns the view', Math.abs(s2.yaw - s1.yaw) > 0.1, `yaw ${s1.yaw} -> ${s2.yaw}`);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  let s3 = await snap(page);
  check('desktop: D strafes', Math.hypot(s3.x - s2.x, s3.z - s2.z) > 0.4);

  // Catch one with real input: walk the nearest firefly into the crosshair by steering, then click.
  let caught = false, mx = 868, my = 417;
  for (let attempt = 0; attempt < 900 && !caught; attempt++) {
    const t = await page.evaluate(() => {
      const g = window.__ffj;
      const list = g.fireflies.screenList();
      const all = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle').map((f) => ({ dx: f.pos.x - g.camera.position.x, dy: f.pos.y - g.camera.position.y, dz: f.pos.z - g.camera.position.z }))
        .map((d) => ({ ...d, dist: Math.hypot(d.dx, d.dz) })).sort((a, c) => a.dist - c.dist)[0];
      if (!all) return null;
      let dyaw = Math.atan2(-all.dx, -all.dz) - g.player.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      return { dyaw, dpitch: Math.atan2(all.dy, all.dist) - g.player.pitch, dist: all.dist, reach: g.fireflies.reach, count: g.count, onScreen: list.length };
    });
    if (!t) { await page.waitForTimeout(100); continue; }
    if (t.count > 0) { caught = true; break; }
    // Mouse right turns right (yaw decreases).
    // Under pointer lock only deltas count, so keep accumulating the pointer position.
    mx += Math.max(-60, Math.min(60, -t.dyaw / 0.0021 * 0.5)); my += Math.max(-40, Math.min(40, -t.dpitch / 0.0021 * 0.5));
    await page.mouse.move(mx, my);
    if (t.dist > t.reach - 0.8) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW');
    if (Math.abs(t.dyaw) < 0.04 && Math.abs(t.dpitch) < 0.04 && t.dist < t.reach - 0.3) { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(900); }
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('KeyW');
  const s4 = await snap(page);
  check('desktop: click catches a firefly', s4.count >= 1, `count ${s4.count}`);
  await page.screenshot({ path: 'shots/input-desktop.png' }).catch(() => {});
  await page.keyboard.press('Escape');
  await b.check();
  await b.teardown(null);
}

// ---------- phone ----------
{
  const b = await launch({ width: 844, height: 390, mobile: true, dpr: 2, built, url });
  await b.open('debug');
  const page = b.page;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await page.waitForSelector('#begin:not([disabled])');
  await page.tap('#begin');
  await page.waitForTimeout(600);
  const s0 = await snap(page);
  check('phone: tap begins play', s0.phase === 'play' && s0.touch === true, JSON.stringify(s0));
  // Left thumb: press, drag up, hold.
  await touch('touchStart', [[120, 300, 1]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[120, 300 - i * 7, 1]]); await page.waitForTimeout(16); }
  await page.waitForTimeout(1400);
  const s1 = await snap(page);
  check('phone: left thumb stick walks', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1.2, `moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)} m`);
  // Second finger on the right: drag to look while still walking.
  await touch('touchStart', [[120, 244, 1], [600, 200, 2]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[120, 244, 1], [600 + i * 14, 200 + i * 2, 2]]); await page.waitForTimeout(16); }
  const s2 = await snap(page);
  check('phone: right thumb drag looks (while walking)', Math.abs(s2.yaw - s1.yaw) > 0.15, `yaw ${s1.yaw} -> ${s2.yaw}`);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const s3 = await snap(page);
  await page.waitForTimeout(500);
  const s3b = await snap(page);
  check('phone: releasing the stick stops', Math.hypot(s3b.x - s3.x, s3b.z - s3.z) < 0.25);

  // Tap a firefly: steer with real touches until one is in reach, then tap right on it.
  let caught = false;
  for (let attempt = 0; attempt < 500 && !caught; attempt++) {
    const t = await page.evaluate(() => {
      const g = window.__ffj;
      const near = g.fireflies.screenList().filter((f) => f.x > 380 && f.x < 820 && f.y > 30 && f.y < 300)[0];
      const all = g.fireflies.wild.filter((f) => f.alive && f.state === 'idle').map((f) => ({ dx: f.pos.x - g.camera.position.x, dz: f.pos.z - g.camera.position.z }))
        .map((d) => ({ ...d, dist: Math.hypot(d.dx, d.dz) })).sort((a, c) => a.dist - c.dist)[0];
      let dyaw = all ? Math.atan2(-all.dx, -all.dz) - g.player.yaw : 0;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      return { near, dyaw, dist: all?.dist ?? 99, reach: g.fireflies.reach, count: g.count };
    });
    if (t.count > 0) { caught = true; break; }
    if (t.near && t.near.dist < t.reach - 0.2) {
      await touch('touchStart', [[t.near.x, t.near.y, 5]]); await page.waitForTimeout(40); await touch('touchEnd', []);
      await page.waitForTimeout(900);
      continue;
    }
    // Look toward it with a right-side drag, walk with the left stick.
    const dx = Math.max(-90, Math.min(90, -t.dyaw * 110));
    await touch('touchStart', [[600, 220, 2]]);
    for (let i = 1; i <= 4; i++) { await touch('touchMove', [[600 + dx * i / 4, 220, 2]]); await page.waitForTimeout(12); }
    await page.waitForTimeout(340); // long enough that it is a drag, not a tap
    await touch('touchEnd', []);
    if (Math.abs(t.dyaw) < 0.5 && t.dist > t.reach - 0.6) {
      await touch('touchStart', [[120, 300, 1]]);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', [[120, 300 - i * 9, 1]]); await page.waitForTimeout(12); }
      await page.waitForTimeout(Math.min(1500, Math.max(350, (t.dist - t.reach + 1.2) / 2.1 * 1000)));
      await touch('touchEnd', []);
    }
  }
  const s4 = await snap(page);
  check('phone: tap catches a firefly', s4.count >= 1, `count ${s4.count}`);
  await page.screenshot({ path: 'shots/input-phone.png' }).catch(() => {});
  await b.check();
  const ok = results.every(Boolean);
  console.log(ok ? 'INPUT TEST PASS' : 'INPUT TEST FAIL');
  await b.teardown(ok ? 0 : 1);
}
