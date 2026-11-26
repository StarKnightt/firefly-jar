// The loading screen, as a first-time visitor sees it: the page is loaded over a throttled
// connection in real time and photographed as the jar fills, as it fades, and once the game is up.
// Also checks what must hold: the screen is there from the first paint, fireflies light one by one,
// it carries no bar, percent or spinner, and it is gone (with the game ready) at the end.
// node tools/loadershot.mjs [--built] [--url https://...] [--out shots/loader]
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(opt('out', 'shots/loader'));
await fs.mkdir(out, { recursive: true });
const views = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'phone-portrait', width: 390, height: 844, mobile: true, dpr: 2 },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true, dpr: 2 },
];
let ok = true;
const check = (name, pass, detail) => { ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); };
for (let i = 0; i < views.length; i++) {
  const v = views[i];
  const b = await launch({ ...v, built: args.includes('--built'), url: opt('url', null) });
  const page = b.page;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // About 10 Mbit/s down: a first visit on an ordinary connection.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.25e6, uploadThroughput: 5e5 });
  const t0 = Date.now();
  const opening = b.open('debug');
  const probe = () => page.evaluate(() => {
    const L = document.getElementById('loader');
    if (!L) return { there: false, begin: !document.getElementById('begin')?.disabled };
    const cs = getComputedStyle(L);
    return { there: true, opacity: +cs.opacity, lit: L.querySelectorAll('.lj-flies i.on').length, type: L.classList.contains('type'), out: L.classList.contains('out'), text: L.innerText.replace(/\s+/g, ' ').trim(), bars: L.querySelectorAll('progress, meter, [role=progressbar]').length, bg: cs.backgroundImage.slice(0, 40) };
  }).catch(() => null);
  const seen = [];
  let faded = false, n = 0;
  while (Date.now() - t0 < 60000) {
    const p = await probe();
    if (p) {
      const t = ((Date.now() - t0) / 1000).toFixed(1);
      seen.push({ t: +t, ...p });
      const last = seen.at(-2);
      // A picture whenever something visibly changed enough: first paint, every few fireflies, the fade.
      const want = p.there && (!last || !last.there || p.lit >= (seen.shotLit ?? -9) + 5 || (p.out && !faded));
      if (want) { seen.shotLit = p.lit; if (p.out) { faded = true; await page.waitForTimeout(650); } await page.screenshot({ path: path.join(out, `${v.name}-${String(n++).padStart(2, '0')}-${p.out ? 'fading' : p.lit + '-lit'}.png`) }); }
      if (!p.there && p.begin) break;
    }
    await page.waitForTimeout(120);
  }
  await opening;
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `${v.name}-${String(n).padStart(2, '0')}-game.png`) });
  const during = seen.filter((s) => s.there && !s.out);
  const first = seen.find((s) => s.there);
  const lits = during.map((s) => s.lit);
  check(`${v.name}: loading screen is up from the first look`, !!first && first.opacity === 1, `first seen at ${first?.t} s`);
  check(`${v.name}: fireflies light one by one up to twenty`, lits.every((x, k) => k === 0 || x >= lits[k - 1]) && Math.max(...lits) === 20 && new Set(lits).size >= 8, `${lits[0]} -> ${Math.max(...lits)} over ${(during.at(-1).t - during[0].t).toFixed(1)} s, ${new Set(lits).size} distinct counts seen`);
  check(`${v.name}: title and line, and nothing else`, during.some((s) => s.type) && during.every((s) => s.text === 'Firefly Jar waiting for dusk…' && s.bars === 0 && !/%|\d/.test(s.text)), `"${during.at(-1).text}"`);
  const end = seen.at(-1);
  check(`${v.name}: fades out and leaves the game ready`, seen.some((s) => s.out) && !end.there && end.begin, `gone at ${end.t} s`);
  await b.check();
  if (i === views.length - 1) console.log(ok ? 'LOADER TEST PASS' : 'LOADER TEST FAIL');
  await b.teardown(i === views.length - 1 ? (ok ? 0 : 1) : null);
}
