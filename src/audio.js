// Sound: real cricket and breeze recordings underneath, a synthesized music box that
// grows with the jar, and a small bell for every catch. Every call takes an explicit
// time so the same engine can play live or render the trailer soundtrack offline.

const base = import.meta.env.BASE_URL + 'assets/audio/';
const FILES = { crickets: 'crickets.mp3', nightbed: 'nightbed.mp3', breeze: 'breeze.mp3' };

const BEAT = 0.75; // seconds; 3/4 at 80 bpm
const BARS = 16;
// An original lullaby in F. Per bar: [beat, midi note, length in beats].
const MELODY = [
  [[0, 69, 1], [1, 72, 1], [2, 77, 1]],
  [[0, 76, 2], [2, 74, 1]],
  [[0, 74, 1], [1, 77, 1], [2, 81, 1]],
  [[0, 79, 2], [2, 77, 1]],
  [[0, 81, 1], [1, 79, 1], [2, 77, 1]],
  [[0, 74, 2], [2, 77, 1]],
  [[0, 76, 1], [1, 79, 1], [2, 76, 1]],
  [[0, 72, 3]],
  [[0, 69, 1], [1, 72, 1], [2, 77, 1]],
  [[0, 76, 2], [2, 72, 1]],
  [[0, 74, 1], [1, 77, 1], [2, 82, 1]],
  [[0, 81, 2], [2, 77, 1]],
  [[0, 79, 1], [1, 82, 1], [2, 79, 1]],
  [[0, 72, 1], [1, 76, 1], [2, 79, 1]],
  [[0, 77, 3]],
  [[0, 72, 1], [1, 69, 1], [2, 65, 1]],
];
const CHORDS = [
  [53, 60, 57], [52, 60, 55], [50, 57, 53], [46, 53, 58], [45, 53, 60], [46, 53, 58], [48, 55, 52], [48, 58, 52],
  [53, 60, 57], [45, 52, 57], [46, 53, 58], [45, 53, 60], [43, 50, 58], [48, 55, 52], [41, 53, 57], [41, 48, 53],
];
const SPARKLE = [[0.5, 89], [1.5, 84], [2.5, 93]]; // off-beat glints in the top octave
const CHIME_SCALE = [77, 79, 81, 84, 86, 89, 91, 93, 96, 98];
const LEVEL_GAIN = [0.34, 0.5, 0.64, 0.74, 0.84, 1.0];

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const levelForCount = (n) => (n >= 20 ? 5 : n >= 15 ? 4 : n >= 10 ? 3 : n >= 5 ? 2 : n >= 1 ? 1 : 0);

let rawCache = null;
async function fetchRaw() {
  if (!rawCache) {
    rawCache = Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, await (await fetch(base + f)).arrayBuffer()]));
  }
  return rawCache;
}

function makeImpulse(ctx, seconds = 2.8) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // Bright early, darker tail: a small wooden room with the window open.
      const k = 0.25 + 0.6 * t;
      lp += (rnd() - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}

function makeNoise(ctx) {
  const n = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 777;
  for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.level = 0;
    this.buffers = {};
    this.loops = [];
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.musicOn = false;
    this.levelTimeline = null; // offline: [{t, level}]
  }

  async start(ctx) {
    this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master.connect(comp).connect(c.destination);

    this.amb = c.createGain(); this.amb.gain.value = 1; this.amb.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.9; this.music.connect(this.master);
    this.reverb = c.createConvolver(); this.reverb.buffer = makeImpulse(c);
    const wet = c.createGain(); wet.gain.value = 0.42;
    this.reverb.connect(wet).connect(this.master);
    this.send = c.createGain(); this.send.gain.value = 1; this.send.connect(this.reverb);
    this.music.connect(this.send);
    const sfxSend = c.createGain(); sfxSend.gain.value = 0.6; this.sfx.connect(sfxSend).connect(this.reverb);
    this.noise = makeNoise(c);

    this.gains = {};
    for (const k of Object.keys(FILES)) { const g = c.createGain(); g.gain.value = 0; g.connect(this.amb); this.gains[k] = g; }

    const raws = await fetchRaw();
    await Promise.all(raws.map(async ([k, ab]) => { this.buffers[k] = await c.decodeAudioData(ab.slice(0)); }));
    const t0 = c.currentTime + 0.05;
    for (const k of Object.keys(FILES)) this.loops.push({ key: k, next: t0, first: true });
    this.nextBeat = t0 + 0.4;
    this.musicOn = true;
    this.ready = true;
    this.setTod(0, t0, true);
    if (c.state === 'suspended' && c.resume) { try { await c.resume(); } catch { /* resumes on the next gesture */ } }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---- ambience ----
  // Recordings are looped by overlapping copies with an equal-power crossfade, which
  // stays seamless whatever padding the codec adds at the ends.
  scheduleLoops(until) {
    const X = 3.0, c = this.ctx;
    for (const L of this.loops) {
      const buf = this.buffers[L.key];
      if (!buf) continue;
      while (L.next < until) {
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        const t = L.next, d = buf.duration;
        const N = 32, up = new Float32Array(N), down = new Float32Array(N);
        for (let i = 0; i < N; i++) { const x = i / (N - 1); up[i] = Math.sin(x * Math.PI / 2); down[i] = Math.cos(x * Math.PI / 2); }
        g.gain.setValueAtTime(0, t);
        g.gain.setValueCurveAtTime(up, t, L.first ? 1.5 : X);
        g.gain.setValueCurveAtTime(down, t + d - X - 0.02, X);
        src.connect(g).connect(this.gains[L.key]);
        src.start(t); src.stop(t + d);
        L.first = false;
        L.next = t + d - X - 0.02;
      }
    }
  }

  // Crickets come up as the light goes down.
  setTod(tod, when = this.ctx.currentTime, snap = false) {
    const s = (a, b) => Math.min(1, Math.max(0, (tod - a) / (b - a)));
    const target = {
      breeze: 0.62 - 0.22 * s(0.3, 1.0),
      crickets: 0.05 + 0.55 * s(0.08, 0.6),
      nightbed: 0.18 + 0.5 * s(0.2, 0.8),
    };
    for (const [k, v] of Object.entries(target)) {
      const p = this.gains[k].gain;
      if (snap) p.setValueAtTime(v, when); else p.setTargetAtTime(v, when, 1.2);
    }
  }

  // ---- music box ----
  tine(t, midi, vel, pan = 0) {
    const c = this.ctx, f = hz(midi);
    const tau = Math.min(2.4, Math.max(0.45, 1.75 * Math.pow(262 / f, 0.5)));
    const out = c.createGain();
    out.gain.value = 1;
    let dest = this.music;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(this.music); dest = p; }
    out.connect(dest);
    const parts = [[1, 1, tau / 3.0], [2.002, 0.2, tau / 6.5], [5.404, 0.085, 0.03], [3.011, 0.06, tau / 9]];
    for (const [mult, amp, decay] of parts) {
      if (f * mult > 15000) continue;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * amp, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.004, decay);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + Math.min(5, decay * 7 + 0.1));
    }
  }

  levelAt(t) {
    if (!this.levelTimeline) return this.level;
    let lv = 0;
    for (const e of this.levelTimeline) { if (e.t <= t) lv = e.level; else break; }
    return lv;
  }

  scheduleBeat(t, index) {
    const lv = this.levelAt(t);
    const bar = Math.floor(index / 3) % BARS, beat = index % 3;
    const gain = LEVEL_GAIN[lv];
    const human = () => (Math.sin(index * 12.9898 + bar * 4.1) * 0.5 + 0.5) * 0.012;
    for (const [b, midi, len] of MELODY[bar]) {
      if (Math.floor(b) !== beat) continue;
      // Thinnest at the start: only the first note of every other bar.
      if (lv === 0 && !(b === 0 && bar % 2 === 0)) continue;
      if (lv === 1 && bar % 2 === 1 && b !== 0) continue;
      const when = t + (b - beat) * BEAT + human();
      this.tine(when, midi, 0.2 * gain * (b === 0 ? 1.0 : 0.82) * (len >= 2 ? 1.08 : 1), -0.12);
      if (lv >= 4) this.tine(when + 0.018, midi + 12, 0.062 * gain, 0.3);
      if (lv >= 5) this.tine(when + 0.009, midi - (bar % 4 === 3 ? 5 : 3 + (midi % 12 === 5 ? 1 : 0)), 0.05 * gain, -0.3);
    }
    if (lv >= 3) {
      const ch = CHORDS[bar];
      this.tine(t + human(), ch[beat], (beat === 0 ? 0.15 : 0.085) * gain, 0.18);
    }
    if (lv >= 4 && bar % 4 === 3) for (const [b, midi] of SPARKLE) if (Math.floor(b) === beat) this.tine(t + (b - beat) * BEAT, midi, 0.05 * gain, 0.42);
  }

  scheduleMusic(until) {
    if (!this.musicOn) return;
    while (this.nextBeat < until) {
      this.scheduleBeat(this.nextBeat, this.beatIndex);
      this.beatIndex++;
      this.nextBeat += BEAT;
    }
  }

  setCount(n) { this.level = levelForCount(n); }

  // ---- one-shots ----
  chime(n, when = this.ctx.currentTime) {
    const c = this.ctx;
    const base = CHIME_SCALE[(Math.max(1, n) - 1) % CHIME_SCALE.length];
    const ring = (t, midi, vel) => {
      const f = hz(midi);
      for (const [mult, amp, decay] of [[1, 1, 0.5], [2.76, 0.4, 0.3], [5.4, 0.2, 0.14], [8.93, 0.08, 0.07]]) {
        if (f * mult > 16000) continue;
        const o = c.createOscillator(); o.frequency.value = f * mult;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * amp, t + 0.002); g.gain.setTargetAtTime(0, t + 0.003, decay);
        o.connect(g).connect(this.sfx); o.start(t); o.stop(t + decay * 7 + 0.1);
      }
    };
    ring(when, base, 0.2);
    ring(when + 0.11, base + (n % 3 === 0 ? 7 : 4), 0.11);
    // The tap of something small landing on glass.
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 3;
    const g = c.createGain(); g.gain.setValueAtTime(0.09, when); g.gain.exponentialRampToValueAtTime(0.0005, when + 0.06);
    s.connect(bp).connect(g).connect(this.sfx); s.start(when, (n * 0.137) % 1.5, 0.08);
  }

  lid(when = this.ctx.currentTime) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.6;
    const g = c.createGain(); g.gain.setValueAtTime(0.05, when); g.gain.exponentialRampToValueAtTime(0.0005, when + 0.05);
    s.connect(bp).connect(g).connect(this.sfx); s.start(when, 0.4, 0.07);
    const o = c.createOscillator(); o.frequency.setValueAtTime(1500, when); o.frequency.exponentialRampToValueAtTime(900, when + 0.05);
    const og = c.createGain(); og.gain.setValueAtTime(0.02, when); og.gain.exponentialRampToValueAtTime(0.0003, when + 0.07);
    o.connect(og).connect(this.sfx); o.start(when); o.stop(when + 0.09);
  }

  // A reach that found nothing: a soft breath of air, no buzzer.
  miss(when = this.ctx.currentTime) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, when); bp.frequency.exponentialRampToValueAtTime(2200, when + 0.16); bp.Q.value = 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.035, when + 0.05); g.gain.exponentialRampToValueAtTime(0.0004, when + 0.24);
    s.connect(bp).connect(g).connect(this.sfx); s.start(when, 0.9, 0.3);
  }

  step(strength = 1, when = this.ctx.currentTime) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700 + ((when * 977) % 1) * 1300; bp.Q.value = 0.7;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const g = c.createGain(); const v = 0.028 * Math.min(1.5, strength);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.035); g.gain.exponentialRampToValueAtTime(0.0003, when + 0.26);
    s.connect(bp).connect(hp).connect(g).connect(this.sfx); s.start(when, (when * 0.61) % 1.6, 0.3);
  }

  // The ending: each firefly leaving rings a little higher than the last.
  release(n, when = this.ctx.currentTime) {
    const notes = [65, 69, 72, 77, 81, 84, 89, 93];
    const midi = notes[(n - 1) % notes.length] + (n > 8 ? 12 : 0) - (n > 16 ? 12 : 0);
    this.tine(when, midi, 0.13, ((n % 5) - 2) * 0.25);
    this.tine(when + 0.05, midi + 12, 0.045, ((n % 3) - 1) * 0.4);
  }

  finale(when = this.ctx.currentTime) {
    const c = this.ctx;
    this.musicOn = false;
    // A warm held chord under the stars, slow to arrive and slower to leave.
    for (const [midi, amp] of [[41, 0.05], [53, 0.06], [60, 0.05], [65, 0.05], [69, 0.04], [72, 0.035], [77, 0.02]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz(midi);
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz(midi) * 1.003;
      const g = c.createGain();
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(amp, when + 5); g.gain.setValueAtTime(amp, when + 13); g.gain.linearRampToValueAtTime(0, when + 30);
      o.connect(g); o2.connect(g); g.connect(this.music);
      o.start(when); o2.start(when); o.stop(when + 31); o2.stop(when + 31);
    }
    // The last phrase of the lullaby, slowing down.
    const phrase = [[0, 69], [0.8, 72], [1.7, 77], [2.8, 81], [4.1, 79], [5.5, 77], [7.3, 72], [9.4, 77], [9.46, 65], [9.52, 53]];
    for (const [dt, midi] of phrase) this.tine(when + 6.5 + dt, midi, midi < 60 ? 0.12 : 0.2, 0);
  }

  // Called every frame while live.
  update(tod) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.scheduleLoops(now + 6);
    this.scheduleMusic(now + 0.3);
    if (this._tod === undefined || Math.abs(tod - this._tod) > 0.004) { this._tod = tod; this.setTod(tod, now); }
  }
}

// Render a soundtrack from a list of timed events with the same engine.
export async function renderOffline({ duration, events, sampleRate = 48000, musicStart = 0.05 }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const eng = new AudioEngine();
  await eng.start(ctx);
  const sorted = [...events].sort((a, b) => a.t - b.t);
  eng.levelTimeline = [{ t: 0, level: 0 }];
  for (const e of sorted) {
    const t = Math.max(0.01, e.t);
    if (e.type === 'count') eng.levelTimeline.push({ t, level: levelForCount(e.n) });
    else if (e.type === 'chime') eng.chime(e.n, t);
    else if (e.type === 'lid') eng.lid(t);
    else if (e.type === 'miss') eng.miss(t);
    else if (e.type === 'step') eng.step(e.v, t);
    else if (e.type === 'tod') eng.setTod(e.v, t, e.snap);
    else if (e.type === 'release') eng.release(e.n, t);
    else if (e.type === 'gain') eng.master.gain.setTargetAtTime(e.v, t, e.tc || 0.5);
  }
  const fin = sorted.find((e) => e.type === 'finale');
  eng.nextBeat = musicStart;
  eng.scheduleLoops(duration + 1);
  // Music stops being scheduled at the finale, then the finale takes over.
  eng.scheduleMusic(fin ? fin.t : duration);
  if (fin) eng.finale(fin.t);
  const buf = await ctx.startRendering();

  // 16-bit PCM WAV.
  const n = buf.length, ch = 2, bytes = 44 + n * ch * 2;
  const out = new DataView(new ArrayBuffer(bytes));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, bytes - 8, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
