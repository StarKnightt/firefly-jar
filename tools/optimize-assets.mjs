// One-time recompression of the downloaded textures so the page loads quickly on a phone.
// Poly Haven's "1k" JPEGs are saved at very high quality (up to 2.7 MB each); the game does not
// need that. Runs once: a marker file stops a second lossy pass.
// Small one-shot image work, CPU on purpose.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public/assets');
const marker = path.join(root, '.optimized');
try { await fs.access(marker); console.log('already optimized'); process.exit(0); } catch {}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

let before = 0, after = 0;
for (const file of await walk(root)) {
  if (!/\.jpe?g$/i.test(file)) continue;
  const size = (await fs.stat(file)).size;
  before += size;
  // Normal maps keep more quality: compression blocks show up as lighting noise.
  const q = /nor_gl/i.test(file) ? '3' : '5';
  const tmp = file + '.tmp.jpg';
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-q:v', q, '-pix_fmt', 'yuvj420p', tmp]);
  if (r.status !== 0) { console.error('failed', file, r.stderr.toString()); await fs.rm(tmp, { force: true }); after += size; continue; }
  const s2 = (await fs.stat(tmp)).size;
  if (s2 < size * 0.9) { await fs.rename(tmp, file); after += s2; } else { await fs.rm(tmp); after += size; }
  console.log(path.relative(root, file), (size / 1024).toFixed(0), '->', (Math.min(s2, size) / 1024).toFixed(0), 'KB');
}
await fs.writeFile(marker, new Date().toISOString() + '\n');
console.log(`textures: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
