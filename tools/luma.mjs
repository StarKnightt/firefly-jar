// Mean brightness and colour of a region of an image, to compare screenshots with reference photos.
// node tools/luma.mjs image.png [x y w h as fractions 0..1] ...   (default: whole image)
// Small one-shot pixel statistics on the CPU, on purpose.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const file = args[0];
const regions = [];
for (let i = 1; i + 3 < args.length; i += 4) regions.push(args.slice(i, i + 4).map(Number));
if (!regions.length) regions.push([0, 0, 1, 1]);
for (const [x, y, w, h] of regions) {
  const vf = `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},scale=64:64,format=rgb24`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', vf, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const b = r.stdout;
  let R = 0, G = 0, B = 0;
  const lum = [];
  for (let i = 0; i < b.length; i += 3) { R += b[i]; G += b[i + 1]; B += b[i + 2]; lum.push(0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]); }
  const n = b.length / 3;
  lum.sort((a, c) => a - c);
  const mean = lum.reduce((a, c) => a + c, 0) / n;
  const r8 = R / n, g8 = G / n, b8 = B / n, mx = Math.max(r8, g8, b8), mn = Math.min(r8, g8, b8);
  console.log(`${file.split(/[\\/]/).pop()} [${x},${y},${w},${h}] luma mean ${mean.toFixed(0)} p5 ${lum[Math.floor(n * 0.05)].toFixed(0)} p50 ${lum[Math.floor(n * 0.5)].toFixed(0)} p95 ${lum[Math.floor(n * 0.95)].toFixed(0)} rgb(${r8.toFixed(0)},${g8.toFixed(0)},${b8.toFixed(0)}) sat ${(mx ? (mx - mn) / mx : 0).toFixed(2)}`);
}
