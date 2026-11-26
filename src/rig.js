// What you see of yourself: two small hands around a glass jar, riding with the camera.
// The left hand holds the jar; the right hand steadies it, lifts the lid for every catch,
// and unscrews it at the end.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, positionWorld, normalWorld, normalView, cameraPosition, normalize, dot, pow, mix, smoothstep, saturate,
  reflect, exp, abs, uv, sin, floor, fract, positionLocal, uniform, max, length, texture, atan,
} from 'three/tsl';
import { U } from './tod.js';
import { hazeColor } from './world/sky.js';
import { jarLight } from './world/common.js';

const JAR_R = 0.046, JAR_H = 0.158, NECK_R = 0.037, NECK_Y = 0.137;
const LID_Y = JAR_H - 0.015; // where the lid sits
const HAND_SCALE = 0.72;
const FINGER_SHORTEN = 0.88; // a child's fingers are shorter for the size of the palm

const FINGERS = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};
const NAIL_BONES = ['thumb-phalanx-distal', 'index-finger-phalanx-distal', 'middle-finger-phalanx-distal', 'ring-finger-phalanx-distal', 'pinky-finger-phalanx-distal'];

const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const span = (t, a, b) => ease((t - a) / (b - a));

// Sky colour seen in a reflection: the same gradient the dome draws, without clouds.
const skyReflect = /*@__PURE__*/ Fn(([dir]) => {
  const up = saturate(dir.y);
  const hz = mix(U.horizon, hazeColor(dir), 0.55);
  const sky = mix(mix(hz, U.mid, smoothstep(0.0, 0.2, up)), U.zenith, smoothstep(0.06, 0.62, up));
  const ground = mix(U.fogCol.mul(0.35), vec3(0.08, 0.1, 0.04), 0.5).mul(U.ambient.add(U.lightCol.mul(0.3)));
  return mix(ground, sky, smoothstep(-0.12, 0.06, dir.y));
});

function jarProfile(inset = 0) {
  // (radius, height) outline of a pint mason jar, base to rim.
  const p = [
    [0.0, 0.0], [0.034, 0.0], [0.042, 0.003], [JAR_R, 0.012], [JAR_R, 0.108], [0.0455, 0.118], [0.0425, 0.127], [0.0385, 0.134],
    [NECK_R, NECK_Y], [NECK_R, 0.141], [0.0388, 0.1425], [0.0388, 0.1455], [NECK_R, 0.147], [NECK_R, 0.150], [0.0388, 0.1515], [0.0388, 0.1545], [NECK_R, 0.156], [NECK_R, JAR_H],
  ];
  if (!inset) return p.map(([r, y]) => new THREE.Vector2(r, y));
  // Inner wall: thinner glass up the sides, a thick puddle of glass at the base.
  return [[0.0, 0.0085], [0.03, 0.0085], [0.04, 0.0115], [JAR_R - inset, 0.019], [JAR_R - inset, 0.107], [0.0425, 0.117], [0.039, 0.127], [NECK_R - inset, 0.136], [NECK_R - inset, JAR_H]]
    .map(([r, y]) => new THREE.Vector2(r, y));
}

// Raised lettering on the glass, as a height map.
function embossTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 124px Georgia, "Times New Roman", serif';
  g.filter = 'blur(2px)';
  g.fillText('MASON', 512, 112);
  g.font = '600 44px Georgia, serif';
  g.fillText('•  P I N T  •', 512, 208);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function glassMaterial(side, glowU, emboss, { inner = false } = {}) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side, fog: false });
  mat.colorNode = Fn(() => {
    const V = normalize(cameraPosition.sub(positionWorld));
    const N = side === THREE.BackSide ? normalWorld.negate() : normalWorld;
    const nv = saturate(abs(dot(N, V)));
    const fres = pow(float(1.0).sub(nv), inner ? 3.4 : 2.4);
    const R = reflect(V.negate(), N);
    const env = skyReflect(R);
    const spec = pow(saturate(dot(R, U.lightDir)), 240.0).mul(10.0).add(pow(saturate(dot(R, U.lightDir)), 26.0).mul(0.35));
    const nvw = normalView;
    const body = smoothstep(0.012, 0.03, positionLocal.y).mul(smoothstep(0.125, 0.105, positionLocal.y));
    // Two soft window-like streaks down the body: the cue that says "glass".
    const streak = smoothstep(0.40, 0.58, nvw.x).mul(smoothstep(0.84, 0.64, nvw.x)).add(smoothstep(-0.62, -0.72, nvw.x).mul(smoothstep(-0.9, -0.76, nvw.x)).mul(0.5)).mul(body);
    const skyLum = U.ambient.mul(0.6).add(U.lightCol.mul(0.25));
    // Thick glass at the base, the shoulder and the rim gathers light.
    const thick = smoothstep(0.022, 0.002, positionLocal.y).add(smoothstep(0.136, 0.158, positionLocal.y).mul(0.6)).add(smoothstep(0.106, 0.12, positionLocal.y).mul(smoothstep(0.136, 0.122, positionLocal.y)).mul(0.35));
    // Raised letters on the side facing you.
    const ang = atan(positionLocal.x, positionLocal.z);
    const euv = vec2(ang.div(1.9).add(0.5), positionLocal.y.sub(0.038).div(0.062));
    const inBox = smoothstep(0.0, 0.02, euv.x).mul(smoothstep(1.0, 0.98, euv.x)).mul(smoothstep(0.0, 0.03, euv.y)).mul(smoothstep(1.0, 0.97, euv.y));
    const letters = inner ? float(0.0) : texture(emboss, euv).r.mul(inBox);
    // The glass itself glows from the light inside, most at the edges and the thick parts.
    const innerGlow = U.jarCol.mul(glowU).mul(fres.mul(1.5).add(0.2).add(thick.mul(1.3)).add(letters.mul(0.9)));
    const tint = vec3(0.78, 0.93, 0.9);
    const col = env.mul(tint).mul(fres.mul(1.0).add(0.07).add(thick.mul(0.3)).add(letters.mul(0.32)))
      .add(U.lightCol.mul(spec)).add(skyLum.mul(streak).mul(0.55)).add(skyLum.mul(letters).mul(0.25)).add(innerGlow);
    const alpha = saturate(fres.mul(0.85).add(inner ? 0.03 : 0.08).add(streak.mul(0.24)).add(spec.mul(0.6)).add(thick.mul(0.28)).add(letters.mul(0.22)));
    return vec4(col, alpha);
  })();
  return mat;
}

function buildJar(glowU) {
  const group = new THREE.Group();
  group.name = 'jar';
  const emboss = embossTexture();
  const lathe = new THREE.LatheGeometry(jarProfile(), 64);
  lathe.computeVertexNormals();
  const innerLathe = new THREE.LatheGeometry(jarProfile(0.0028), 48);
  innerLathe.computeVertexNormals();
  const back = new THREE.Mesh(lathe, glassMaterial(THREE.BackSide, glowU, emboss));
  const inner = new THREE.Mesh(innerLathe, glassMaterial(THREE.BackSide, glowU, emboss, { inner: true }));
  const front = new THREE.Mesh(lathe, glassMaterial(THREE.FrontSide, glowU, emboss));
  back.renderOrder = 10; inner.renderOrder = 11; front.renderOrder = 30;
  group.add(back, inner, front);

  // The light in the jar as a soft volume, so the jar is a lantern and not glass with dots in it.
  const glowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  glowMat.colorNode = Fn(() => {
    const V = normalize(cameraPosition.sub(positionWorld));
    const core = pow(saturate(abs(dot(normalWorld, V))), 1.6);
    return vec4(U.jarCol.mul(glowU).mul(core).mul(1.05), 1.0);
  })();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat);
  glow.scale.set(0.04, 0.058, 0.04);
  glow.position.y = 0.066;
  glow.renderOrder = 15;
  group.add(glow);

  // Two-piece zinc lid: a screw band with rolled threads and a flat disc, air holes punched with a nail.
  const lid = new THREE.Group();
  const lidMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.0 });
  lidMat.colorNode = Fn(() => {
    const p = positionLocal;
    const top = smoothstep(0.019, 0.0205, p.y);
    const r = length(p.xz);
    // Rolled threads on the band, a bead at the bottom edge.
    const thread = sin(p.y.mul(980.0).add(atan(p.x, p.z).mul(1.0))).mul(0.5).add(0.5);
    const band = mix(float(0.62), float(1.0), thread).mul(mix(float(0.7), float(1.0), smoothstep(0.0, 0.003, p.y)));
    // Nail holes: dark, each with a bright torn rim.
    let holes = float(0.0), rims = float(0.0);
    for (const [hx, hz] of [[0.002, 0.001], [0.017, 0.006], [-0.012, 0.015], [-0.011, -0.014], [0.012, -0.015], [-0.021, 0.0], [0.003, 0.022]]) {
      const d = length(vec2(p.x.sub(hx), p.z.sub(hz)));
      holes = max(holes, smoothstep(0.0021, 0.0013, d));
      rims = max(rims, smoothstep(0.0034, 0.0026, d).mul(smoothstep(0.0016, 0.0024, d)));
    }
    // The seam where the disc sits inside the band, and a faint pressed ring.
    const seam = smoothstep(0.0012, 0.0, abs(r.sub(0.0352))).mul(0.55).add(smoothstep(0.0009, 0.0, abs(r.sub(0.024))).mul(0.18));
    const speck = fract(sin(dot(floor(p.xz.mul(1400.0)), vec2(12.9, 78.2))).mul(43758.5));
    const zinc = mix(vec3(0.36, 0.37, 0.38), vec3(0.47, 0.48, 0.48), speck.mul(0.6));
    const side = zinc.mul(band);
    const disc = zinc.mul(float(1.0).sub(seam)).mul(float(1.0).sub(holes.mul(0.95))).add(rims.mul(0.35));
    return vec4(mix(side, disc, top), 1.0);
  })();
  lidMat.emissiveNode = Fn(() => {
    // Dull metal: mostly a blurred reflection of the sky, plus one soft highlight.
    const V = normalize(cameraPosition.sub(positionWorld));
    const R = reflect(V.negate(), normalWorld);
    const fres = pow(float(1.0).sub(saturate(dot(normalWorld, V))), 3.0);
    const spec = pow(saturate(dot(R, U.lightDir)), 36.0).mul(0.9);
    const under = smoothstep(0.004, 0.0, positionLocal.y); // the rim catches the glow from below
    const sky = skyReflect(R);
    const grey = vec3(dot(sky, vec3(0.3, 0.5, 0.2)));
    // Zinc is grey: it takes the brightness of the sky but little of its colour.
    return mix(sky, grey, 0.72).mul(fres.mul(0.55).add(0.3)).add(U.lightCol.mul(spec).mul(0.25)).add(U.jarCol.mul(glowU).mul(under.mul(0.5).add(0.03)));
  })();
  const lidGeo = new THREE.CylinderGeometry(0.0412, 0.0412, 0.021, 56, 6, false);
  lidGeo.translate(0, 0.0105, 0);
  const lidMesh = new THREE.Mesh(lidGeo, lidMat);
  lidMesh.renderOrder = 31;
  const bead = new THREE.Mesh(new THREE.TorusGeometry(0.0412, 0.0011, 6, 56), lidMat);
  bead.rotation.x = Math.PI / 2; bead.position.y = 0.001;
  const roll = new THREE.Mesh(new THREE.TorusGeometry(0.0402, 0.0013, 6, 56), lidMat);
  roll.rotation.x = Math.PI / 2; roll.position.y = 0.0203;
  lid.add(lidMesh, bead, roll);
  lid.position.set(0, LID_Y, 0);
  group.add(lid);

  return { group, lid, front, back, glow };
}

function buildHand(root, side, nailMat) {
  const hand = { root, side, bones: {}, rest: {}, local: {} };
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
  hand.mesh = skinned;
  skinned.frustumCulled = false;
  for (const b of skinned.skeleton.bones) {
    hand.bones[b.name] = b;
    hand.rest[b.name] = new THREE.Matrix4().compose(b.position, b.quaternion, new THREE.Vector3(1, 1, 1));
  }
  // The XR hand skeleton is flat: every joint is a sibling in armature space.
  // Rebuild the finger chains so they can be curled with plain forward kinematics.
  for (const chain of Object.values(FINGERS)) {
    let parent = 'wrist';
    chain.forEach((name, i) => {
      const m = new THREE.Matrix4().copy(hand.rest[parent]).invert().multiply(hand.rest[name]);
      if (i >= 2) { m.elements[12] *= FINGER_SHORTEN; m.elements[13] *= FINGER_SHORTEN; m.elements[14] *= FINGER_SHORTEN; }
      hand.local[name] = m;
      parent = name;
    });
  }
  // Fingernails ride on the last joint of each finger (-Z runs to the tip, +Y is the back of the finger).
  for (const name of NAIL_BONES) {
    const thumb = name.startsWith('thumb');
    const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), nailMat);
    nail.scale.set(thumb ? 0.0066 : 0.0052, 0.0021, thumb ? 0.0078 : 0.0064);
    nail.position.set(0, thumb ? 0.0058 : 0.0049, thumb ? -0.012 : -0.0085);
    nail.rotation.x = -0.1;
    hand.bones[name].add(nail);
  }
  const m = new THREE.Matrix4(), r = new THREE.Matrix4(), e = new THREE.Euler(), s = new THREE.Vector3();
  // curls: per finger [metacarpal, proximal, intermediate, distal] flexion in radians, plus spread at the knuckle.
  hand.pose = (curls, spread = {}) => {
    for (const [finger, chain] of Object.entries(FINGERS)) {
      const c = curls[finger] || [0, 0, 0, 0];
      m.copy(hand.rest.wrist);
      chain.forEach((name, i) => {
        m.multiply(hand.local[name]);
        const flex = c[Math.min(i, c.length - 1)] || 0;
        const sp = i === 1 ? (spread[finger] || 0) : (finger === 'thumb' && i === 0 ? (spread.thumb || 0) : 0);
        if (i < c.length && (flex || sp)) {
          e.set(-flex, sp, 0, 'YXZ');
          m.multiply(r.makeRotationFromEuler(e));
        }
        const b = hand.bones[name];
        m.decompose(b.position, b.quaternion, s);
      });
    }
  };
  return hand;
}

function skinMaterial(glowU) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.58, metalness: 0 });
  mat.colorNode = Fn(() => {
    // Blotchy, slightly sun-browned kid skin, pinker toward glancing angles and creases.
    const big = sin(positionLocal.x.mul(140.0)).mul(sin(positionLocal.y.mul(95.0).add(1.3))).mul(sin(positionLocal.z.mul(120.0).add(0.7)));
    const fine = fract(sin(dot(floor(positionLocal.mul(2600.0)), vec3(12.99, 78.23, 37.72))).mul(43758.5));
    const V = normalize(cameraPosition.sub(positionWorld));
    const graze = pow(float(1.0).sub(saturate(dot(normalWorld, V))), 2.2);
    const skin = mix(vec3(0.74, 0.47, 0.35), vec3(0.83, 0.58, 0.46), big.mul(0.5).add(0.5)).mul(fine.mul(0.08).add(0.96));
    return vec4(mix(skin, vec3(0.80, 0.36, 0.28), graze.mul(0.35)), 1.0);
  })();
  mat.emissiveNode = Fn(() => {
    // The jar is a lantern in your hands: skin facing it lights up warm, and the light
    // soaks through the edges of fingers, glowing red the way a torch does through a hand.
    const L = U.jarPos.sub(positionWorld);
    const d = length(L);
    const Ld = L.div(d.max(0.001));
    const nl = dot(normalWorld, Ld);
    const atten = float(1.0).div(d.mul(d).mul(70.0).add(1.0));
    const lit = saturate(nl.mul(0.85).add(0.15)).mul(atten);
    const through = saturate(nl.negate().mul(0.8).add(0.3)).mul(float(1.0).div(d.mul(d).mul(260.0).add(1.0))).mul(0.34);
    const skin = vec3(0.86, 0.55, 0.40);
    return skin.mul(U.jarCol).mul(lit).mul(glowU).mul(2.3).add(vec3(1.0, 0.16, 0.05).mul(through).mul(glowU));
  })();
  return mat;
}

export function createRig(game) {
  const { camera, assets } = game;
  const rig = new THREE.Group();
  rig.name = 'rig';
  camera.add(rig);

  const glowU = uniform(0); // how bright the jar is, 0..~1.3, drives glass, skin and lid
  const jar = buildJar(glowU);
  const hold = new THREE.Group(); // jar + hands, the thing that sways
  rig.add(hold);
  hold.add(jar.group);

  const skin = skinMaterial(glowU);
  const nailMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.32, color: 0xe9b3a4 });
  nailMat.emissiveNode = Fn(() => {
    const L = U.jarPos.sub(positionWorld);
    const d = length(L);
    return vec3(0.95, 0.7, 0.55).mul(U.jarCol).mul(saturate(dot(normalWorld, L.div(d.max(0.001))).mul(0.8).add(0.2))).mul(float(1.0).div(d.mul(d).mul(70.0).add(1.0))).mul(glowU).mul(2.0);
  })();
  const hands = {};
  for (const side of ['L', 'R']) {
    const src = side === 'L' ? assets.models.handL : assets.models.handR;
    const holder = new THREE.Group();
    holder.add(src);
    const h = buildHand(src, side, nailMat);
    h.holder = holder;
    h.mesh.material = skin;
    h.mesh.castShadow = false;
    h.mesh.receiveShadow = true;
    hold.add(holder);
    hands[side] = h;

    // Forearm running back out of frame.
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.34, 18, 1, false), skin);
    fore.geometry.translate(0, -0.17, 0);
    fore.scale.set(1.0, 1, 0.8);
    h.forearm = fore;
    hold.add(fore);

    // A woven friendship bracelet hides the wrist seam (and belongs on an eight year old).
    const bandMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const hueA = side === 'L' ? vec3(0.72, 0.13, 0.17) : vec3(0.13, 0.42, 0.55);
    const hueB = side === 'L' ? vec3(0.9, 0.68, 0.16) : vec3(0.88, 0.85, 0.76);
    bandMat.colorNode = Fn(() => {
      const st = uv();
      const weave = fract(st.x.mul(26.0).add(st.y.mul(3.0)));
      const zig = smoothstep(0.45, 0.55, abs(fract(st.x.mul(13.0).add(st.y.mul(1.0))).sub(0.5)).mul(2.0));
      return vec4(mix(hueA, hueB, zig).mul(weave.mul(0.35).add(0.7)), 1.0);
    })();
    bandMat.emissiveNode = jarLight(positionWorld, normalWorld, float(0.4)).mul(0.12);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0222, 0.0036, 8, 28), bandMat);
    band.scale.set(1, 0.82, 1.6);
    h.band = band;
    hold.add(band);
  }

  // ---- poses (tunable while look-developing) ----
  const P = {
    jar: { x: 0.0, y: -0.214, z: -0.405, rx: 0.2 },
    // Side grip, low on the jar so the glass face stays clear.
    L: { x: -0.071, y: 0.02, z: 0.052, pitch: 0.3, yaw: -0.2, roll: 0 },
    R: { x: 0.071, y: 0.02, z: 0.052, pitch: 0.3, yaw: 0.2, roll: 0 },
    curl: {
      thumb: [0.15, 0.2, 0.35], index: [0, 0.45, 0.78, 0.5], middle: [0, 0.5, 0.82, 0.5],
      ring: [0, 0.55, 0.86, 0.55], pinky: [0, 0.6, 0.9, 0.6],
    },
    spread: { index: 0.06, middle: 0.0, ring: -0.05, pinky: -0.12, thumb: 0.0 },
    // Right hand on the lid: palm down over it, fingertips on the far rim, thumb on the near rim.
    lid: { x: 0.042, y: 0.034, z: 0.046, yaw: 0.62, pitch: -0.22, roll: Math.PI / 2 },
    lidCurl: {
      thumb: [0.25, 0.3, 0.35], index: [0, 0.55, 0.6, 0.4], middle: [0, 0.6, 0.62, 0.4],
      ring: [0, 0.62, 0.64, 0.42], pinky: [0, 0.64, 0.66, 0.45],
    },
    lidSpread: { index: 0.16, middle: 0.04, ring: -0.1, pinky: -0.24, thumb: 0.25 },
  };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), DOWN = new THREE.Vector3(0, -1, 0);
  const wristOff = new THREE.Vector3(), tgt = new THREE.Vector3(), elbow = new THREE.Vector3(), dir = new THREE.Vector3();
  const gripQ = new THREE.Quaternion(), gripP = new THREE.Vector3(), lidQ = new THREE.Quaternion(), lidP = new THREE.Vector3(), jarQ = new THREE.Quaternion();
  const blendCurl = {}, blendSpread = {};
  const lerpCurls = (a, b, k) => {
    for (const f of Object.keys(FINGERS)) blendCurl[f] = a[f].map((v, i) => v + ((b[f][i] ?? v) - v) * k);
    for (const f of Object.keys(a === P.curl ? P.spread : a)) { /* spreads handled below */ }
    for (const f of Object.keys(P.spread)) blendSpread[f] = P.spread[f] + ((P.lidSpread[f] ?? 0) - P.spread[f]) * k;
  };

  // runtime state
  const state = {
    glow: 0, glowTarget: 0, scoop: 0, scoopDir: new THREE.Vector2(), swayX: 0, swayY: 0, lift: 0, away: 0, flash: 0,
    handK: 0,      // right hand: 0 on the side of the jar, 1 on the lid
    lidLift: 0,    // lid raised off the jar by the hand
    catchT: -1,    // seconds into the lift-lid-for-a-catch gesture
    open: 0, openT: 0, // the ending: unscrew and take the lid away
    lidTwist: 0, carry: 0, tall: 0, elbowDrop: 0,
  };

  function place() {
    jar.group.position.set(P.jar.x, P.jar.y, P.jar.z);
    jar.group.rotation.set(P.jar.rx, 0, 0);
    jarQ.setFromEuler(jar.group.rotation);

    // The lid: sits on the jar, rises with the hand for a catch, and at the end is carried off to the side.
    const c = state.carry;
    jar.lid.position.set(c * 0.2, LID_Y + state.lidLift * 0.034 + Math.sin(Math.min(1, c * 1.4) * Math.PI) * 0.05 - c * c * 0.34, c * 0.05 - state.lidLift * 0.006);
    jar.lid.rotation.set(-state.lidLift * 0.5 - c * 0.5, state.lidTwist, c * 0.9, 'YXZ');
    jar.lid.visible = c < 0.97;

    for (const side of ['L', 'R']) {
      const h = hands[side], p = P[side];
      // Rest: fingers down -Y, palm toward the jar. Turn it so fingers reach forward and the thumb sits on top.
      qa.setFromAxisAngle(X, Math.PI / 2);
      qb.setFromAxisAngle(Y, p.yaw);
      qc.setFromAxisAngle(X, p.pitch);
      qd.setFromAxisAngle(Z, p.roll);
      gripQ.copy(qd).multiply(qc).multiply(qb).multiply(qa);
      gripP.set(p.x, p.y, p.z).applyQuaternion(jarQ).add(jar.group.position);
      let k = 0;
      if (side === 'R') {
        k = state.handK;
        // Hand on the lid, expressed in the lid's own frame so it follows the lid wherever it goes.
        const l = P.lid;
        qb.setFromAxisAngle(Y, l.yaw); qc.setFromAxisAngle(X, l.pitch); qd.setFromAxisAngle(Z, l.roll);
        lidQ.copy(qb).multiply(qc).multiply(qd).multiply(qa);
        lidQ.premultiply(jar.lid.quaternion).premultiply(jarQ);
        lidP.set(l.x, l.y, l.z).applyQuaternion(jar.lid.quaternion).add(jar.lid.position).applyQuaternion(jarQ).add(jar.group.position);
      }
      if (k > 0.001) { h.holder.quaternion.copy(gripQ).slerp(lidQ, k); tgt.copy(gripP).lerp(lidP, k); tgt.y += Math.sin(k * Math.PI) * 0.03; } else { h.holder.quaternion.copy(gripQ); tgt.copy(gripP); }
      h.holder.scale.setScalar(HAND_SCALE);
      // Put the wrist joint (not the model origin) at that point.
      wristOff.setFromMatrixPosition(h.rest.wrist).multiplyScalar(HAND_SCALE).applyQuaternion(h.holder.quaternion);
      h.holder.position.copy(tgt).sub(wristOff);
      if (side === 'R' && k > 0.001) { lerpCurls(P.curl, P.lidCurl, k); h.pose(blendCurl, blendSpread); } else h.pose(P.curl, P.spread);

      // Forearm from the wrist back toward where an elbow would be.
      const sx = side === 'L' ? -1 : 1;
      elbow.set(sx * THREE.MathUtils.lerp(0.21, 0.13, state.tall), THREE.MathUtils.lerp(-0.43, -0.52, state.tall) - state.elbowDrop, THREE.MathUtils.lerp(0.02, 0.1, state.tall));
      // Reaching for the lid the arm comes in level from the side, not up past the face.
      if (side === 'R' && k > 0.001) elbow.lerp(dir.set(0.33 + state.carry * 0.22, -0.34 - state.carry * 0.25, -0.16), k);
      dir.copy(elbow).sub(tgt).normalize();
      h.forearm.position.copy(tgt).addScaledVector(dir, -0.012);
      h.forearm.quaternion.setFromUnitVectors(DOWN, dir);
      h.band.position.copy(tgt).addScaledVector(dir, 0.012);
      h.band.quaternion.setFromUnitVectors(Z, dir);
    }
  }
  place();

  const jarWorld = new THREE.Vector3();
  let lastYaw = game.player.yaw, lastPitch = game.player.pitch;

  const api = {
    rig, jar, hands, P, state, glowU,
    JAR_R, JAR_H,
    applyPose: place,
    centerWorld(out) { return out.set(0, JAR_H * 0.45, 0).applyMatrix4(jar.group.matrixWorld); },
    mouthWorld(out) { return out.set(0, JAR_H + 0.012, 0).applyMatrix4(jar.group.matrixWorld); },
    setCount(n, goal) { state.glowTarget = n / goal; },
    // Reach toward a point on screen. `open` lifts the lid: only when a catch is really happening.
    scoop(sx, sy, open = true) { state.scoop = 1; state.scoopDir.set(sx, sy); if (open) state.catchT = 0; },
    flash() { state.flash = 1; },
    reset() {
      Object.assign(state, { lift: 0, away: 0, open: 0, openT: 0, carry: 0, lidTwist: 0, handK: 0, lidLift: 0, catchT: -1, scoop: 0, flash: 0 });
    },
    update(dt) {
      const p = game.player;
      // Lag behind the look direction a touch, like something held rather than bolted on.
      const dyaw = p.yaw - lastYaw, dpitch = p.pitch - lastPitch;
      lastYaw = p.yaw; lastPitch = p.pitch;
      const k = 1 - Math.exp(-dt * 9);
      state.swayX += (THREE.MathUtils.clamp(dyaw * 2.2, -0.06, 0.06) - state.swayX) * k;
      state.swayY += (THREE.MathUtils.clamp(-dpitch * 2.0, -0.05, 0.05) - state.swayY) * k;
      const bob = Math.sin(p.bob * 2) * 0.0045 * p.speed, bobX = Math.sin(p.bob) * 0.006 * p.speed;
      const breathe = Math.sin(game.time * 1.1) * 0.0022;

      state.scoop = Math.max(0, state.scoop - dt * 2.4);
      const sc = Math.sin(Math.min(1, state.scoop) * Math.PI) * 0.9;

      // The catch gesture: hand to the lid, lid up, firefly in, lid down, hand back.
      if (state.catchT >= 0) {
        state.catchT += dt;
        const t = state.catchT;
        state.handK = Math.max(span(t, 0.0, 0.2) * (1 - span(t, 0.92, 1.2)), 0);
        state.lidLift = span(t, 0.16, 0.36) * (1 - span(t, 0.7, 0.9));
        if (t > 1.22) { state.catchT = -1; state.handK = 0; state.lidLift = 0; }
      }
      // The ending: the same hand unscrews the lid and takes it away.
      if (state.open) {
        state.openT += dt;
        const t = state.openT;
        state.catchT = -1;
        state.handK = span(t, 0.0, 0.5);
        state.lidTwist = -span(t, 0.55, 1.7) * 1.7;
        state.lidLift = span(t, 1.5, 2.0);
        state.carry = span(t, 1.9, 3.2);
      }

      // Portrait screens are tall and narrow: bring everything lower and smaller.
      const aspect = game.camera.aspect;
      const tall = THREE.MathUtils.clamp((1.3 - aspect) / 0.85, 0, 1);
      state.tall = tall;
      const yFit = THREE.MathUtils.lerp(0, -0.125, tall), zFit = THREE.MathUtils.lerp(0, -0.02, tall), sFit = THREE.MathUtils.lerp(1, 0.84, tall);
      // Look up and the jar drops out of the way; look down and it comes up to meet you.
      const up = Math.max(0, p.pitch - 0.1) * (1 - state.lift), down = Math.max(0, -p.pitch - 0.25);
      const pitchY = -up * 0.2 + down * 0.035;
      state.elbowDrop = state.away * 0.2;

      hold.position.set(
        state.swayX + bobX + state.scoopDir.x * sc * 0.045,
        state.swayY + bob + breathe + sc * 0.03 + state.scoopDir.y * sc * 0.028 + state.lift * 0.165 + yFit + pitchY - state.away * 0.62,
        -sc * 0.055 + zFit - state.lift * 0.06 + up * 0.03,
      );
      hold.rotation.set(-sc * 0.14 - state.lift * 0.36 + state.swayY * 0.8 + up * 0.25, state.swayX * 0.9 - state.scoopDir.x * sc * 0.1, -state.swayX * 0.7);
      hold.scale.setScalar(sFit);
      place();

      state.glow += (state.glowTarget - state.glow) * (1 - Math.exp(-dt * 2.5));
      state.flash = Math.max(0, state.flash - dt * 1.8);
      const pulse = 1 + Math.sin(game.time * 2.1) * 0.05 + Math.sin(game.time * 3.7 + 1.0) * 0.035;
      const g = state.glow;
      // A fuller jar is brighter, and a dark evening makes the same jar look brighter still.
      glowU.value = (Math.pow(g, 0.75) * 1.25 + state.flash * 0.4) * pulse;
      U.jarInt.value = (Math.pow(g, 0.8) * 6.5 + state.flash * 1.2) * pulse * (game.jarBoost ?? 1);

      rig.updateMatrixWorld(true);
      api.centerWorld(jarWorld);
      U.jarPos.value.copy(jarWorld);
    },
  };
  return api;
}

export const _r = [exp];
