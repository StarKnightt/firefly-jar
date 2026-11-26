// Downloads the third-party assets listed in CREDITS.md into public/assets.
// One-shot network + disk work, CPU only on purpose (nothing to rasterise).
import fs from 'node:fs/promises';
import path from 'node:path';

const UA = { 'User-Agent': 'asset-fetch/1.0' };
const out = path.resolve('public/assets');

async function get(url, dest) {
  try { await fs.access(dest); return; } catch {}
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  console.log('ok', path.relative(out, dest));
}

async function phTexture(id, res = '1k', maps = ['Diffuse', 'nor_gl', 'Rough']) {
  const f = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  for (const m of maps) {
    const e = f[m]?.[res]?.jpg;
    if (!e) { console.warn('missing', id, m, Object.keys(f)); continue; }
    await get(e.url, path.join(out, 'tex', id, `${m.toLowerCase()}.jpg`));
  }
}

async function phModel(id, res = '1k') {
  const f = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  const g = f.gltf[res].gltf;
  const dir = path.join(out, 'models', id);
  await get(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include || {})) await get(inc.url, path.join(dir, rel));
}

const hand = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.19/dist/profiles/generic-hand';
const jobs = [
  get(`${hand}/left.glb`, path.join(out, 'models/hands/left.glb')),
  get(`${hand}/right.glb`, path.join(out, 'models/hands/right.glb')),
  phTexture('leafy_grass'),
  phTexture('jolcham_oak_bark_01'),
  phTexture('weathered_planks'),
  phTexture('wood_peeling_paint_weathered'),
  phTexture('roof_slates_02'),
  phTexture('wood_planks_grey'),
  phModel('old_tyre'),
  phModel('Rockingchair_01'),
];
const res = await Promise.allSettled(jobs);
for (const r of res) if (r.status === 'rejected') console.error('FAIL', r.reason.message);
