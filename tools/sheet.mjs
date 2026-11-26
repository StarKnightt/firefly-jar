// Contact sheet: node tools/sheet.mjs out.jpg [--cols 4] [--cell 480x320] a.jpg b.jpg ...
// Small one-shot image scaling; CPU on purpose.
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const out = args.shift();
let cols = 4, cw = 480, ch = 320;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cols') cols = +args[++i];
  else if (args[i] === '--cell') [cw, ch] = args[++i].split('x').map(Number);
  else files.push(args[i]);
}
const n = files.length;
const fc = files.map((_, i) => `[${i}:v]scale=${cw}:${ch}:force_original_aspect_ratio=decrease,pad=${cw}:${ch}:(ow-iw)/2:(oh-ih)/2:color=0x202020[v${i}]`).join(';');
const layout = files.map((_, i) => `${(i % cols) * cw}_${Math.floor(i / cols) * ch}`).join('|');
const graph = n === 1 ? fc.replace('[v0]', '') : `${fc};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${layout}:fill=0x202020`;
const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph, '-frames:v', '1', '-q:v', '3', out], { stdio: 'inherit' });
files.forEach((f, i) => console.log(`${i + 1}. r${Math.floor(i / cols) + 1}c${(i % cols) + 1} ${f}`));
process.exit(r.status ?? 1);
