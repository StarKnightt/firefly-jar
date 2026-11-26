// Record trailer.mp4 (1920x1080, 60 fps, with sound) and thumbnail.png.
//
// The game runs in deterministic mode: the in-game director advances exactly 1/60 s per frame,
// plays the shots with the same autopilot a bot would use (walk, aim, click), and logs every
// sound event. Each frame is grabbed from the real page (canvas + HUD + text cards) and piped to
// ffmpeg, encoded on the GPU with NVENC. The soundtrack is then rendered from the logged events
// by the game's own audio engine through an OfflineAudioContext and muxed in.
//
// node tools/trailer.mjs [--built] [--frames N] [--only-thumb] [--out trailer.mp4]
import { launch } from './lib/browser.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const outFile = path.resolve(opt('out', 'trailer.mp4'));
const thumbFile = path.resolve(opt('thumb', 'thumbnail.png'));
const onlyThumb = args.includes('--only-thumb');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ffj-trailer-'));
const videoTmp = path.join(tmp, 'video.mp4'), wavTmp = path.join(tmp, 'audio.wav');

const b = await launch({ width: 1920, height: 1080, built: args.includes('--built') });
let ff = null;
const fail = async (why) => { try { ff?.kill(); } catch {} await b.teardown(1, why); };

await b.open('det&debug&nolock&trailer');
const page = b.page;
const cdp = await page.context().newCDPSession(page);
const meta = await page.evaluate(() => window.__ffj.director.prepare());
const total = Math.min(meta.frames, +opt('frames', meta.frames));
console.log(`[trailer] ${total} frames at ${meta.fps} fps = ${(total / meta.fps).toFixed(1)} s`);

// Thumbnail first: the opening frame with the title lettering.
await page.evaluate(() => window.__ffj.director.thumbnail());
await page.waitForTimeout(400);
await page.screenshot({ path: thumbFile });
console.log('[trailer] wrote', thumbFile);
if (onlyThumb) { await b.check(); await b.teardown(0); }

await page.evaluate(() => window.__ffj.director.prepare());
ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'png', '-i', '-',
  // NVENC on the RTX 4060; libx264 here would be a silent CPU fallback.
  '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-multipass', 'fullres', '-b:v', '8M', '-maxrate', '13M', '-bufsize', '26M',
  '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709',
  '-r', String(meta.fps), videoTmp,
], { stdio: ['pipe', 'inherit', 'inherit'] });
let ffError = null;
ff.on('error', (e) => { ffError = e; });
ff.stdin.on('error', (e) => { ffError = e; });

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  if (ffError) await fail(ffError);
  // frame() steps the game one tick, renders, and resolves after the frame has been presented.
  await page.evaluate((i) => window.__ffj.director.frame(i), i);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 240 === 0) console.log(`[trailer] frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (i % 600 === 0) await b.check();
}
ff.stdin.end();
const code = await new Promise((r) => ff.on('close', r));
if (code !== 0) await fail(new Error('ffmpeg exited with ' + code));
ff = null;

// Soundtrack from the logged events.
const b64 = await page.evaluate(() => window.__ffj.director.renderAudio());
await fs.writeFile(wavTmp, Buffer.from(b64, 'base64'));
await b.check();

const mux = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoTmp, '-i', wavTmp,
  '-c:v', 'copy', '-af', 'volume=3dB', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
if (mux.status !== 0) await fail(new Error('mux failed'));
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames,channels,sample_rate:format=duration,size,bit_rate', '-of', 'json', outFile]);
console.log('[trailer]', probe.stdout.toString().replace(/\s+/g, ' '));
console.log('[trailer] wrote', outFile, 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
await fs.rm(tmp, { recursive: true, force: true });
await b.teardown(0);
