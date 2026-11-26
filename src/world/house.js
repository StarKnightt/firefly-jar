// A white clapboard farmhouse with a deep front porch, built from parts.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Fn, vec2, vec3, vec4, float, texture, uv, positionLocal, positionWorld, normalWorld, normalLocal, fract, floor, mix, smoothstep, abs,
  attribute, sin, max, min, step, pow, saturate, dot, normalize, normalMap, reflect, cameraPosition, normalWorldGeometry, transformNormalToView,
} from 'three/tsl';
import { HOUSE, HOUSE_YAW, farHeight } from './layout.js';
import { vnoise, hash21 } from './common.js';
import { hazeColor } from './sky.js';
import { U } from '../tod.js';

export function createHouse(assets) {
  const group = new THREE.Group();
  group.name = 'house';
  const gy = farHeight(HOUSE.x, HOUSE.z);
  group.position.set(HOUSE.x, gy - 0.05, HOUSE.z);
  group.rotation.y = HOUSE_YAW;

  const parts = {};
  const put = (key, geo, extra) => {
    if (extra) for (const [name, arr] of Object.entries(extra)) {
      const n = geo.attributes.position.count, size = arr.length;
      const data = new Float32Array(n * size);
      for (let i = 0; i < n; i++) data.set(arr, i * size);
      geo.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    (parts[key] ||= []).push(geo.index ? geo.toNonIndexed() : geo);
  };
  const box = (key, w, h, d, x, y, z, rot, extra) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
    g.translate(x, y, z);
    put(key, g, extra);
  };

  // ---------- dimensions ----------
  const W = 9.2, D = 7.0, F = 0.5, WALL = 6.0, RISE = 2.75, OVER = 0.45;
  const hw = W / 2, hd = D / 2;

  // Foundation and walls.
  box('stone', W + 0.1, F, D + 0.1, 0, F / 2, 0);
  box('siding', W, WALL - F, D, 0, (WALL + F) / 2, 0);
  // Gable ends.
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-hd, 0); shape.lineTo(hd, 0); shape.lineTo(0, RISE); shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(sx * hw, WALL, 0);
    put('siding', g);
  }
  // Roof slopes.
  const slopeLen = Math.hypot(hd + OVER, RISE * (hd + OVER) / hd);
  const pitch = Math.atan2(RISE, hd);
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(W + OVER * 2, 0.09, slopeLen);
    g.rotateX(sz * pitch);
    g.translate(0, WALL + RISE / 2 - (OVER * RISE / hd) / 2 + 0.06, sz * (hd + OVER) / 2);
    put('roof', g);
  }
  box('trim', W + OVER * 2 + 0.06, 0.16, 0.2, 0, WALL + RISE + 0.07, 0); // ridge cap
  // Bargeboards along the gable edges.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.05, 0.2, slopeLen);
    g.rotateX(sz * pitch);
    g.translate(sx * (hw + OVER), WALL + RISE / 2 - (OVER * RISE / hd) / 2 - 0.06, sz * (hd + OVER) / 2);
    put('trim', g);
  }
  // Corner boards and a frieze under the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('trim', 0.16, WALL - F, 0.16, sx * hw, (WALL + F) / 2, sz * hd);
  box('trim', W + 0.1, 0.22, D + 0.1, 0, WALL - 0.11, 0);
  box('trim', W + 0.12, 0.14, D + 0.12, 0, F + 0.07, 0);

  // Chimney.
  box('brick', 0.78, 4.3, 0.78, 2.7, WALL + 1.9, -0.9);
  box('stone', 0.92, 0.14, 0.92, 2.7, WALL + 4.1, -0.9);

  // Side wing (the kitchen).
  const KW = 4.2, KD = 4.6, KH = 3.3, KR = 1.5, kx = hw + KW / 2, kz = -0.6;
  box('stone', KW, F, KD + 0.1, kx, F / 2, kz);
  box('siding', KW, KH - F, KD, kx, (KH + F) / 2, kz);
  {
    const shape = new THREE.Shape();
    shape.moveTo(-KD / 2, 0); shape.lineTo(KD / 2, 0); shape.lineTo(0, KR); shape.closePath();
    const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2); g.translate(kx + KW / 2, KH, kz); put('siding', g);
    const kLen = Math.hypot(KD / 2 + 0.35, KR * (KD / 2 + 0.35) / (KD / 2));
    const kPitch = Math.atan2(KR, KD / 2);
    for (const sz of [-1, 1]) {
      const r = new THREE.BoxGeometry(KW + 0.4, 0.08, kLen);
      r.rotateX(sz * kPitch);
      r.translate(kx + 0.2, KH + KR / 2 - 0.1, kz + sz * (KD / 2 + 0.35) / 2);
      put('roof', r);
    }
    box('trim', 0.14, KH - F, 0.14, kx + KW / 2, (KH + F) / 2, kz + KD / 2);
    box('trim', 0.14, KH - F, 0.14, kx + KW / 2, (KH + F) / 2, kz - KD / 2);
  }

  // ---------- porch ----------
  const PD = 2.4, PF = 0.56, pz0 = hd, pz1 = hd + PD;
  box('floor', W + 0.2, 0.1, PD + 0.1, 0, PF, (pz0 + pz1) / 2);
  box('trim', W + 0.2, 0.22, 0.06, 0, PF - 0.16, pz1 + 0.03); // skirt board
  // Lattice-dark void under the porch.
  box('dark', W, PF - 0.12, 0.04, 0, (PF - 0.12) / 2, pz1 - 0.05);
  for (const sx of [-1, 1]) box('dark', 0.04, PF - 0.12, PD, sx * hw, (PF - 0.12) / 2, (pz0 + pz1) / 2);
  const postXs = [-4.45, -2.35, -0.95, 0.95, 2.35, 4.45];
  const POST_TOP = 3.12;
  for (const x of postXs) {
    { const post = new THREE.CylinderGeometry(0.075, 0.085, POST_TOP - PF - 0.5, 8); post.rotateY(Math.PI / 8); post.translate(x, (POST_TOP + PF) / 2 + 0.1, pz1 - 0.12); put('trim', post); }
    box('trim', 0.17, 0.5, 0.17, x, PF + 0.3, pz1 - 0.12);
    box('trim', 0.2, 0.1, 0.2, x, PF + 0.1, pz1 - 0.12);
    box('trim', 0.22, 0.09, 0.22, x, POST_TOP - 0.06, pz1 - 0.12);
  }
  box('trim', W + 0.3, 0.26, 0.16, 0, POST_TOP + 0.13, pz1 - 0.12); // beam
  for (const sx of [-1, 1]) box('trim', 0.16, 0.26, PD, sx * hw, POST_TOP + 0.13, (pz0 + pz1) / 2 - 0.06);
  // Shed roof over the porch.
  {
    const run = PD + 0.5, rise = 0.78;
    const len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    const g = new THREE.BoxGeometry(W + 0.7, 0.07, len);
    g.rotateX(ang);
    g.translate(0, POST_TOP + 0.3 + rise / 2, pz0 + run / 2);
    put('roof', g);
    box('ceiling', W, 0.03, PD, 0, POST_TOP + 0.24, (pz0 + pz1) / 2);
  }
  // Railing, open at the steps.
  const railSpans = [[0, 1], [1, 2], [3, 4], [4, 5]];
  for (const [a, b] of railSpans) {
    const x0 = postXs[a], x1 = postXs[b], z = pz1 - 0.12;
    box('trim', x1 - x0, 0.07, 0.09, (x0 + x1) / 2, PF + 0.92, z);
    box('trim', x1 - x0, 0.06, 0.06, (x0 + x1) / 2, PF + 0.2, z);
    const n = Math.round((x1 - x0) / 0.21);
    for (let i = 1; i < n; i++) box('trim', 0.05, 0.7, 0.05, x0 + (x1 - x0) * i / n, PF + 0.56, z);
  }
  for (const sx of [-1, 1]) {
    const z0 = pz0 + 0.05, z1 = pz1 - 0.19, x = sx * 4.45;
    box('trim', 0.09, 0.07, z1 - z0, x, PF + 0.92, (z0 + z1) / 2);
    box('trim', 0.06, 0.06, z1 - z0, x, PF + 0.2, (z0 + z1) / 2);
    const n = Math.round((z1 - z0) / 0.21);
    for (let i = 1; i < n; i++) box('trim', 0.05, 0.7, 0.05, x, PF + 0.56, z0 + (z1 - z0) * i / n);
  }
  // Steps.
  for (let s = 0; s < 3; s++) box('floor', 1.75, 0.05, 0.3, 0, PF - 0.02 - s * 0.185, pz1 + 0.2 + s * 0.3);
  for (const sx of [-1, 1]) box('trim', 0.05, 0.5, 0.95, sx * 0.9, 0.25, pz1 + 0.5);

  // ---------- door ----------
  const DZ = hd + 0.012;
  box('trim', 1.24, 2.3, 0.08, 0, PF + 1.2, DZ);
  box('door', 1.0, 2.1, 0.06, 0, PF + 1.13, DZ + 0.03);
  for (const sx of [-1, 1]) {
    box('doorDark', 0.33, 0.62, 0.02, sx * 0.22, PF + 0.5, DZ + 0.065);
    box('doorDark', 0.33, 0.78, 0.02, sx * 0.22, PF + 1.3, DZ + 0.065);
  }
  box('glassDoor', 0.72, 0.3, 0.02, 0, PF + 1.95, DZ + 0.065);
  { const knob = new THREE.SphereGeometry(0.034, 12, 10); knob.translate(0.4, PF + 1.05, DZ + 0.1); put('brass', knob); }
  // Screen door, standing a hand's width open.
  {
    const sw = 0.98, sh = 2.08, sy = PF + 1.12, hingeX = -0.5, open = 0.32;
    const piece = (w, h, x, y) => { const g = new THREE.BoxGeometry(w, h, 0.03); g.translate(x + sw / 2, y, 0); g.rotateY(-open); g.translate(hingeX, sy, DZ + 0.1); put('trim', g); };
    piece(sw, 0.09, 0, sh / 2 - 0.045); piece(sw, 0.13, 0, -sh / 2 + 0.065); piece(sw, 0.07, 0, -0.12);
    piece(0.08, sh, -sw / 2 + 0.04, 0); piece(0.08, sh, sw / 2 - 0.04, 0);
  }
  // A mat, and two pots of geraniums by the door.
  box('mat', 0.95, 0.025, 0.55, 0, PF + 0.062, hd + 0.5);
  for (const sx of [-1, 1]) {
    const pot = new THREE.CylinderGeometry(0.17, 0.12, 0.26, 12); pot.translate(sx * 1.05, PF + 0.18, hd + 0.33); put('pot', pot);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = 0.05 + (k % 3) * 0.055;
      const leaf = new THREE.IcosahedronGeometry(0.085 + (k % 2) * 0.03, 1); leaf.translate(sx * 1.05 + Math.cos(a) * r, PF + 0.4 + (k % 4) * 0.045, hd + 0.33 + Math.sin(a) * r); put('plant', leaf);
      if (k % 2 === 0) { const fl = new THREE.IcosahedronGeometry(0.034, 1); fl.translate(sx * 1.05 + Math.cos(a + 1) * (r + 0.05), PF + 0.5 + (k % 3) * 0.05, hd + 0.33 + Math.sin(a + 1) * (r + 0.05)); put('bloom', fl); }
    }
  }
  box('trim', 1.36, 0.1, 0.12, 0, PF + 2.38, DZ);

  // ---------- windows ----------
  const windows = [];
  const addWindow = (x, y, z, w, h, face, on, warmth) => {
    // face: 'f' front (+z), 'r' right (+x), 'l' left (-x)
    const rotY = face === 'f' ? 0 : face === 'r' ? Math.PI / 2 : -Math.PI / 2;
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    const piece = (key, pw, ph, pd, px, py, pz, extra) => {
      const g = new THREE.BoxGeometry(pw, ph, pd);
      g.translate(px, py, pz);
      g.applyMatrix4(m);
      put(key, g, extra);
    };
    const glass = new THREE.PlaneGeometry(w, h);
    glass.translate(0, 0, 0.02);
    glass.applyMatrix4(m);
    put('glass', glass, { aLit: [on, warmth, windows.length * 7.31] });
    piece('trim', w + 0.2, 0.1, 0.09, 0, h / 2 + 0.05, 0.03);
    piece('trim', w + 0.26, 0.08, 0.14, 0, -h / 2 - 0.04, 0.05);
    for (const s of [-1, 1]) piece('trim', 0.1, h, 0.09, s * (w / 2 + 0.05), 0, 0.03);
    piece('trim', w, 0.05, 0.05, 0, 0, 0.04);        // meeting rail
    piece('trim', 0.035, h, 0.05, 0, 0, 0.04);       // mullion
    // Shutters.
    for (const s of [-1, 1]) piece('shutter', 0.34, h + 0.06, 0.035, s * (w / 2 + 0.3), 0, 0.02);
    windows.push({ x, y, z, face });
  };
  const z = hd, y1 = PF + 1.75, y2 = 4.72;
  addWindow(-2.75, y1, z, 0.98, 1.62, 'f', 0.30, 0.9);
  addWindow(2.75, y1, z, 0.98, 1.62, 'f', 0.22, 0.6);
  addWindow(-2.75, y2, z, 0.92, 1.42, 'f', 0.58, 0.3);
  addWindow(0, y2, z, 0.92, 1.42, 'f', 2.0, 0.5);
  addWindow(2.75, y2, z, 0.92, 1.42, 'f', 0.44, 0.75);
  for (const [face, x] of [['r', hw], ['l', -hw]]) {
    if (face === 'l') { addWindow(x, y1, -1.6, 0.92, 1.56, face, 0.34, 0.7); addWindow(x, y1, 1.6, 0.92, 1.56, face, 0.26, 0.9); }
    addWindow(x, y2, -1.6, 0.88, 1.38, face, face === 'l' ? 2.0 : 0.5, 0.4);
    addWindow(x, y2, 1.6, 0.88, 1.38, face, face === 'l' ? 0.62 : 2.0, 0.6);
  }
  addWindow(kx, PF + 1.55, kz + KD / 2, 1.5, 1.2, 'f', 0.16, 1.0); // kitchen, first light on
  addWindow(kx + KW / 2, PF + 1.55, kz, 0.9, 1.2, 'r', 0.2, 1.0);

  // ---------- materials ----------
  const mats = {};
  const tex = assets.tex;

  const siding = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
  siding.normalNode = Fn(() => {
    const lap = fract(positionLocal.y.div(0.122));
    // Tilt the face up a little across each board, and sharply at the lip.
    const tilt = float(0.12).add(smoothstep(0.8, 1.0, lap).mul(-1.1)).add(smoothstep(0.0, 0.08, lap).oneMinus().mul(0.9));
    return transformNormalToView(normalize(normalWorldGeometry.add(vec3(0.0, 1.0, 0.0).mul(tilt).mul(0.35))));
  })();
  siding.colorNode = Fn(() => {
    const y = positionLocal.y;
    const lap = fract(y.div(0.122));
    const board = floor(y.div(0.122));
    const along = positionLocal.x.add(positionLocal.z);
    const line = smoothstep(0.80, 0.985, lap);
    const grain = texture(tex.greyPlanks.diff, vec2(along.mul(0.33).add(board.mul(0.37)), lap.mul(0.08).add(board.mul(0.113)))).r;
    const grime = vnoise(vec2(along.mul(0.9), y.mul(0.35))).mul(0.6).add(vnoise(vec2(along.mul(4.0), y.mul(9.0))).mul(0.4));
    const paint = mix(vec3(0.83, 0.81, 0.74), vec3(0.62, 0.60, 0.52), grime.mul(0.42)).mul(grain.mul(0.35).add(0.83));
    // Rain splash and mildew climbing up from the ground.
    const splash = smoothstep(1.9, 0.55, y).mul(0.3);
    const col = mix(paint, vec3(0.38, 0.40, 0.29), splash).mul(float(1.0).sub(line.mul(0.5)));
    return vec4(col.mul(mix(1.0, 0.3, smoothstep(0.5, 0.9, U.tod))), 1.0);
  })();
  mats.siding = siding;

  const trim = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  trim.colorNode = Fn(() => {
    const g = vnoise(positionLocal.xy.add(positionLocal.z).mul(3.0));
    return vec4(mix(vec3(0.88, 0.86, 0.80), vec3(0.72, 0.70, 0.63), g.mul(0.5)).mul(mix(1.0, 0.45, smoothstep(0.5, 0.9, U.tod))), 1.0);
  })();
  mats.trim = trim;

  const roof = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  // World-projected shingle courses that run down the slope.
  const ruv = vec2(positionLocal.x.mul(0.42), positionLocal.z.mul(0.52).add(positionLocal.y.mul(0.3)));
  roof.colorNode = vec4(texture(tex.roof.diff, ruv).rgb.mul(vec3(0.70, 0.62, 0.56)).mul(1.15), 1.0);
  roof.roughnessNode = texture(tex.roof.rough, ruv).r;
  roof.normalNode = normalMap(texture(tex.roof.nor, ruv), vec2(1.6, 1.6));
  mats.roof = roof;
  mats.mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, color: 0x5a4630 });
  mats.pot = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, color: 0xa3552f });
  mats.plant = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, color: 0x3f7a30 });
  mats.bloom = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, color: 0xd8402f });
  mats.brass = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, color: 0xb08a3a });
  mats.glassDoor = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, color: 0x1a1612 });

  const floorM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  floorM.colorNode = vec4(texture(tex.planks.diff, vec2(positionLocal.x.mul(0.55), positionLocal.z.mul(0.5))).rgb.mul(vec3(2.6, 2.45, 2.2)).add(0.04), 1.0);
  mats.floor = floorM;

  mats.stone = new THREE.MeshStandardNodeMaterial({ roughness: 1, color: 0x77726a });
  mats.dark = new THREE.MeshStandardNodeMaterial({ roughness: 1, color: 0x15130f });
  mats.door = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, color: 0xa63c2e });
  mats.doorDark = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, color: 0x7e2a21 });
  mats.shutter = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, color: 0x2f4a3c });
  // Haint blue beadboard overhead.
  const ceilingM = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  ceilingM.colorNode = Fn(() => {
    const bead = smoothstep(0.0, 0.08, abs(fract(positionLocal.x.div(0.09)).sub(0.5)));
    return vec4(vec3(0.62, 0.75, 0.79).mul(bead.mul(0.25).add(0.75)), 1.0);
  })();
  mats.ceiling = ceilingM;

  const brick = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  brick.colorNode = Fn(() => {
    const p = vec2(positionLocal.x.add(positionLocal.z), positionLocal.y);
    const row = floor(p.y.div(0.075));
    const bx = p.x.div(0.21).add(row.mod(2.0).mul(0.5));
    const mortar = max(smoothstep(0.42, 0.5, abs(fract(bx).sub(0.5))), smoothstep(0.40, 0.5, abs(fract(p.y.div(0.075)).sub(0.5))));
    const tone = hash21(vec2(floor(bx), row));
    const b = mix(vec3(0.42, 0.17, 0.12), vec3(0.58, 0.27, 0.18), tone);
    return vec4(mix(b, vec3(0.62, 0.58, 0.52), mortar), 1.0);
  })();
  mats.brick = brick;

  // Window glass: sky reflection by day, lamplit rooms as the evening goes on.
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
  const lit = attribute('aLit', 'vec3');
  const glowAmt = smoothstep(lit.x, lit.x.add(0.06), U.tod);
  glass.colorNode = Fn(() => {
    const st = uv();
    const curtain = smoothstep(0.14, 0.4, abs(st.x.sub(0.5))).mul(sin(st.x.mul(46.0).add(lit.z)).mul(0.1).add(0.9));
    const day = mix(vec3(0.05, 0.05, 0.06), vec3(0.5, 0.48, 0.42), curtain.mul(0.8));
    return vec4(mix(day, vec3(0.05, 0.04, 0.03), glowAmt), 1.0);
  })();
  glass.emissiveNode = Fn(() => {
    const st = uv();
    // Lace curtains parted at the middle, a lamp low in the room, a darker ceiling.
    const curtain = smoothstep(0.16, 0.42, abs(st.x.sub(0.5))).mul(0.55).add(0.45);
    const fold = sin(st.x.mul(46.0).add(lit.z)).mul(0.07).add(0.93);
    const lamp = smoothstep(0.75, 0.0, vec2(st.x.sub(mix(0.3, 0.7, fract(lit.z))), st.y.sub(0.3)).length());
    const warm = mix(vec3(1.0, 0.72, 0.36), vec3(1.0, 0.56, 0.2), lit.y);
    const room = warm.mul(curtain.mul(fold).mul(0.75).add(lamp.mul(0.9))).mul(mix(1.0, 0.6, st.y));
    const flicker = sin(U.time.mul(0.7).add(lit.z)).mul(0.03).add(1.0);
    // Not every room is the same: some have the curtains drawn, some are dimmer, one has a television.
    const kind = fract(lit.z.mul(0.37));
    const drawn = smoothstep(0.55, 0.6, kind);
    const closed = warm.mul(fold.mul(0.5).add(0.12)).mul(mix(0.9, 0.55, st.y));
    const tv = smoothstep(0.9, 0.95, kind).mul(sin(U.time.mul(5.3).add(lit.z)).mul(0.5).add(0.5)).mul(0.25);
    const out = mix(room, closed, drawn).add(vec3(0.35, 0.5, 0.9).mul(tv));
    // Before the lamps come on the panes hold the sky: gold low down, blue above.
    // Each pane mirrors the part of the sky it faces, so west windows burn gold and east ones go blue.
    const R = reflect(normalize(positionWorld.sub(cameraPosition)), normalWorld);
    const up = saturate(R.y.mul(0.8).add(0.25));
    const sky = mix(mix(U.horizon, hazeColor(R), 0.55), U.zenith, smoothstep(0.05, 0.7, up));
    const pane = sky.mul(0.34).mul(float(1.0).sub(glowAmt));
    return out.mul(glowAmt).mul(flicker).mul(mix(0.85, 0.45, fract(lit.z.mul(0.71)))).add(pane);
  })();
  mats.glass = glass;

  for (const [key, list] of Object.entries(parts)) {
    const geo = mergeGeometries(list, false);
    const mesh = new THREE.Mesh(geo, mats[key]);
    mesh.castShadow = key !== 'glass';
    mesh.receiveShadow = true;
    mesh.name = 'house_' + key;
    group.add(mesh);
  }

  // ---------- porch light ----------
  const lampPos = new THREE.Vector3(0.98, PF + 2.05, hd + 0.16);
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), new THREE.MeshStandardNodeMaterial({ color: 0x1b1b1b, roughness: 0.5 }));
  fixture.rotation.x = Math.PI / 2;
  fixture.position.copy(lampPos).add(new THREE.Vector3(0, 0.06, -0.14));
  group.add(fixture);
  const bulbMat = new THREE.MeshBasicNodeMaterial();
  const bulbOn = smoothstep(0.1, 0.3, U.tod);
  bulbMat.colorNode = vec3(1.0, 0.72, 0.38).mul(bulbOn.mul(2.2).add(0.3));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), bulbMat);
  bulb.position.copy(lampPos);
  group.add(bulb);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.11, 14, 1, true), new THREE.MeshStandardNodeMaterial({ color: 0x23201c, roughness: 0.5, side: THREE.DoubleSide }));
  shade.position.copy(lampPos).add(new THREE.Vector3(0, 0.085, 0));
  group.add(shade);
  const porchLight = new THREE.PointLight(0xffb469, 0, 13, 1.6);
  porchLight.position.copy(lampPos).add(new THREE.Vector3(0, -0.18, 0.95));
  group.add(porchLight);
  // By day the open sky and the lawn light the porch from the front; nothing else would reach under the roof.
  const bounce = new THREE.PointLight(0xfff0dc, 0, 9, 1.2);
  bounce.position.set(0, PF + 1.5, hd + 2.2);
  group.add(bounce);
  // What the lamp throws back off the boards and the lawn: it warms the outer faces of the posts,
  // the steps, and anyone standing at the foot of them.
  const spill = new THREE.PointLight(0xffb878, 0, 10, 1.4);
  spill.position.set(0.3, PF + 0.9, hd + 4.6);
  group.add(spill);

  // Rocking chair on the porch.
  const chair = assets.models.chair;
  const cb = new THREE.Box3().setFromObject(chair);
  const cs = 1.0 / Math.max(0.001, cb.getSize(new THREE.Vector3()).y);
  const chairPivot = new THREE.Group();
  chair.scale.setScalar(cs * 1.02);
  chair.position.y = -cb.min.y * cs * 1.02;
  chair.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  chairPivot.add(chair);
  chairPivot.position.set(-2.9, PF + 0.05, hd + 1.15);
  chairPivot.rotation.y = 0.35;
  group.add(chairPivot);

  const worldLamp = new THREE.Vector3();
  const update = (time, tod) => {
    const on = THREE.MathUtils.smoothstep(tod, 0.1, 0.32) * (1 + Math.sin(time * 9.0) * 0.008);
    porchLight.intensity = on * 9.5;
    U.porchOn.value = on;
    bounce.color.copy(U.ambient.value).lerp(U.lightCol.value, 0.35);
    bounce.intensity = 1.6;
    spill.intensity = on * 2.6;
    // Someone just got up: the chair is still rocking, slower and slower, then again in a while.
    const cyc = (time % 46) / 46;
    chairPivot.rotation.x = Math.sin(time * 2.1) * 0.07 * Math.max(0, 1 - cyc * 2.2);
  };
  group.updateMatrixWorld(true);
  bulb.getWorldPosition(worldLamp);

  // Footprint the player can't walk through (it is outside the fence anyway).
  return { group, update, lampWorld: worldLamp };
}

export const _h = [min, step, pow, saturate, dot, normalize, normalWorld, normalLocal, positionWorld];
