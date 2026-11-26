// Screenshot the game in given states.
// node tools/shot.mjs --out <dir> [--mobile] [--size 1920x1080] [--q high] --state "name:tod=0,count=0,yaw=1.2,pitch=0,x=4,z=6" ...
import { launch } from './lib/browser.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const states = args.flatMap((a, i) => (a === '--state' ? [args[i + 1]] : []));
const out = path.resolve(opt('out', 'shots'));
const mobile = args.includes('--mobile');
const [w, h] = opt('size', mobile ? '844x390' : '1920x1080').split('x').map(Number);
const query = [opt('query', ''), 'det', 'debug', opt('q') ? 'q=' + opt('q') : ''].filter(Boolean).join('&');

await fs.mkdir(out, { recursive: true });
const b = await launch({ width: w, height: h, mobile, dpr: mobile ? 2 : 1, built: args.includes('--built') });
await b.open(query);

const poseFile = opt('pose');
if (poseFile) {
  const pose = JSON.parse(await fs.readFile(poseFile, 'utf8'));
  await b.page.evaluate((pose) => { const P = window.__ffj.rig.P; const merge = (a, c) => { for (const k in c) { if (c[k] && typeof c[k] === 'object' && !Array.isArray(c[k])) merge(a[k] ||= {}, c[k]); else a[k] = c[k]; } }; merge(P, pose); window.__ffj.rig.applyPose(); }, pose);
}
for (const st of states.length ? states : ['default:']) {
  const [name, rest = ''] = st.split(':');
  const kv = Object.fromEntries(rest.split(',').filter(Boolean).map((p) => p.split('=').map((s, i) => (i ? Number(s) : s))));
  await b.page.evaluate(async ({ kv }) => {
    const g = window.__ffj;
    if (g.debugState) await g.debugState(kv);
    else {
      if ('tod' in kv) g.tod.set(kv.tod);
      if ('x' in kv) g.player.pos.x = kv.x;
      if ('z' in kv) g.player.pos.z = kv.z;
      if ('yaw' in kv) g.player.yaw = kv.yaw;
      if ('pitch' in kv) g.player.pitch = kv.pitch;
    }
    const n = kv.steps ?? 40;
    for (let i = 0; i < n; i++) g.step(1 / 60);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, { kv });
  await b.page.waitForTimeout(250);
  const file = path.join(out, name + '.png');
  await b.page.screenshot({ path: file });
  console.log('shot', file);
}
const info = await b.page.evaluate(() => {
  const r = window.__ffj.renderer.info;
  return { calls: r.render.drawCalls ?? r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures };
});
console.log('[render]', JSON.stringify(info));
await b.check();
await b.teardown(0);
