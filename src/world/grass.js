// Tall meadow grass and wildflowers.
// Two rings of instanced blade clusters that wrap around the camera, so there is
// always grass underfoot without storing a transform per blade: every instance
// derives its place from its index, entirely in the vertex shader.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, instanceIndex, positionGeometry, normalGeometry, uv, attribute, floor, sin, cos, dot, mix,
  smoothstep, saturate, normalize, length, pow, max, varying, transformNormalToView, cameraPosition,
} from 'three/tsl';
import { U } from '../tod.js';
import { heightAtNode } from './layout.js';
import { hash21, hash22, vnoise, patchNoise, yardMask, dirtMask, jarLight, GRASS_ROOT, GRASS_LUSH, GRASS_DRY, GRASS_TIP } from './common.js';

const c3 = (c) => vec3(c.r, c.g, c.b);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// A tuft: several curved, tapered blades fanned out from one root.
function tuftGeometry({ blades, segments, radius, width, seed }) {
  const r = rng(seed);
  const pos = [], nor = [], uvs = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const ang = (b / blades) * Math.PI * 2 + r() * 1.2;
    const rad = radius * Math.sqrt(r());
    const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
    const yaw = r() * Math.PI * 2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const h = 0.62 + 0.38 * r();
    const lean = 0.10 + 0.22 * r();
    const w = width * (0.75 + 0.5 * r());
    const base = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const half = w * (1 - Math.pow(t, 1.6)) * (s === segments ? 0 : 1) + (s === segments ? 0.0006 : 0);
      const fwd = lean * t * t;      // blade curls forward as it rises
      const y = h * t - 0.06 * t * t * lean;
      for (const side of [-1, 1]) {
        const lx = side * half, lz = fwd;
        pos.push(bx + lx * cy - lz * sy, y, bz + lx * sy + lz * cy);
        // Face normal of the ribbon, tipped up a little as it leans.
        const nx = 0, ny = 0.25 + lean * t, nz = -1;
        nor.push(nx * cy - nz * sy, ny, nx * sy + nz * cy);
        uvs.push(side < 0 ? 0 : 1, t);
      }
    }
    for (let s = 0; s < segments; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Where instance i sits: a jittered grid cell wrapped into a tile centred on the camera.
const placeInstance = (gridN, size, salt) => {
  const N = float(gridN);
  const idx = instanceIndex.toFloat();
  const gz = floor(idx.add(0.5).div(N));
  const gx = idx.sub(gz.mul(N));
  const cell = vec2(gx, gz);
  const spacing = size / gridN;
  const base = cell.add(hash22(cell.add(salt))).mul(spacing);
  const wrap = floor(U.camPos.xz.sub(base).div(size).add(0.5));
  const world = base.add(wrap.mul(size));
  const worldCell = cell.add(wrap.mul(N)); // integer id that stays put in the world
  return { world, worldCell };
};

function grassMaterial({ gridN, size, bladeHeight, innerHole, salt, wide }) {
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  const R = size / 2;

  const { world, worldCell } = placeInstance(gridN, size, salt);
  const rnd = hash21(worldCell.add(1.7));
  const rnd2 = hash21(worldCell.add(31.1));
  const t = uv().y;

  const dist = length(world.sub(U.camPos.xz));
  // Thin out smoothly with distance, then fade the last ring to nothing.
  const density = float(1.0).sub(smoothstep(R * 0.30, R * 0.92, dist).mul(0.72));
  let vis = smoothstep(0.0, 0.16, density.sub(rnd2)).mul(float(1.0).sub(smoothstep(R * 0.80, R * 0.985, dist)));
  if (innerHole > 0) vis = vis.mul(smoothstep(innerHole * 0.55, innerHole * 0.92, dist));

  const patch = patchNoise(world);
  const yard = yardMask(world);
  const dirt = dirtMask(world);
  const clump = vnoise(world.mul(0.55).add(4.0));
  const heightScale = mix(0.55, 1.25, clump).mul(mix(0.8, 1.2, rnd)).mul(mix(1.0, 0.82, patch))
    .mul(mix(1.0, 0.17, yard)).mul(float(1.0).sub(smoothstep(0.25, 0.75, dirt)));
  const hs = heightScale.mul(vis);
  const H = hs.mul(bladeHeight);

  // Rotate the tuft about its root.
  const yaw = rnd.mul(6.2831853);
  const cy = cos(yaw), sy = sin(yaw);
  const pg = positionGeometry;
  const local = vec3(pg.x.mul(cy).sub(pg.z.mul(sy)), pg.y, pg.x.mul(sy).add(pg.z.mul(cy)));
  const ng = normalGeometry;
  const faceN = vec3(ng.x.mul(cy).sub(ng.z.mul(sy)), ng.y, ng.x.mul(sy).add(ng.z.mul(cy)));

  // Wind: slow gust fronts crossing the meadow, plus a quick flutter at the tips.
  const windDir = normalize(vec2(0.86, 0.5));
  const along = dot(world, windDir);
  const across = dot(world, vec2(-0.5, 0.86));
  const gust = sin(along.mul(0.17).sub(U.time.mul(0.85)).add(sin(across.mul(0.11).add(U.time.mul(0.23))).mul(1.6))).mul(0.5).add(0.5);
  const swell = sin(along.mul(0.045).sub(U.time.mul(0.31)).add(across.mul(0.03))).mul(0.5).add(0.5);
  const flutter = sin(U.time.mul(mix(3.2, 5.6, rnd)).add(rnd.mul(40.0)).add(along.mul(1.3)));
  const bend = float(0.07).add(gust.mul(swell).mul(0.42)).add(flutter.mul(0.022)).mul(mix(0.75, 1.25, rnd2));
  const t2 = t.mul(t);

  // The player wades through: blades lean away from the body.
  const away = world.sub(U.camPos.xz);
  const awayLen = length(away).max(0.001);
  const push = float(1.0).sub(smoothstep(0.18, 0.95, awayLen));
  const pushVec = away.div(awayLen).mul(push).mul(0.55);

  const offXZ = windDir.mul(bend).mul(t2).add(pushVec.mul(t)).mul(H);
  const droop = saturate(bend.mul(bend).mul(0.9).add(push.mul(0.35))).mul(t2);

  const groundY = heightAtNode(world);
  const wideScale = wide ? mix(1.0, 2.2, smoothstep(R * 0.2, R * 0.9, dist)) : float(1.0);
  const px = world.x.add(local.x.mul(mix(0.6, 1.0, heightScale)).mul(wideScale)).add(offXZ.x);
  const pz = world.y.add(local.z.mul(mix(0.6, 1.0, heightScale)).mul(wideScale)).add(offXZ.y);
  const py = groundY.add(local.y.mul(H).mul(float(1.0).sub(droop)));
  const worldPos = vec3(px, py, pz);
  mat.positionNode = worldPos;

  // ---- colour, computed per vertex ----
  const lushness = saturate(float(1.0).sub(patch).add(rnd.sub(0.5).mul(0.5)));
  const mid = mix(c3(GRASS_DRY), c3(GRASS_LUSH), lushness);
  const tip = mix(c3(GRASS_TIP), mid, 0.35).mul(mix(0.9, 1.15, rnd2));
  let albedo = mix(c3(GRASS_ROOT), mid, smoothstep(0.0, 0.5, t));
  albedo = mix(albedo, tip, smoothstep(0.45, 1.0, t));
  albedo = mix(albedo, vec3(0.22, 0.36, 0.11), yard.mul(0.8));
  // Self-shadowing down in the thatch.
  const ao = mix(0.30, 1.0, smoothstep(0.0, 0.7, t));

  // Low sun shining through thin blades: brightest looking into the light.
  const viewDir = normalize(worldPos.sub(U.camPos));
  const into = pow(saturate(dot(viewDir, U.sunDir).mul(0.5).add(0.5)), 3.0);
  const through = into.mul(U.trans).mul(smoothstep(0.1, 0.9, t)).mul(0.8);
  const lit = albedo.mul(ao).mul(float(1.0).add(through)).add(vec3(0.9, 0.55, 0.12).mul(through).mul(0.07));

  mat.colorNode = varying(lit, 'vGrassCol');

  // A soft field normal: mostly up, tipped toward the light so vertical blades
  // catch a low sun, with a little of each blade's own facing for sparkle.
  const lightFlat = normalize(vec3(U.lightDir.x, 0.0, U.lightDir.z));
  const n = normalize(vec3(0.0, 1.0, 0.0).add(lightFlat.mul(0.5)).add(faceN.mul(0.32)).add(vec3(windDir.x, 0.0, windDir.y).mul(bend.mul(0.5))));
  const vN = varying(n, 'vGrassN');
  mat.normalNode = transformNormalToView(vN).normalize();

  const jar = jarLight(worldPos, vec3(0.0, 1.0, 0.0), float(0.55)).mul(albedo).mul(mix(0.35, 1.0, t)).mul(1.5);
  mat.emissiveNode = varying(jar, 'vGrassJar');

  return mat;
}

// ---------- wildflowers ----------
function flowerGeometry({ petals, petalLen, petalWid, cup, centre, stem, petalCol, centreCol, seed }) {
  const r = rng(seed);
  const pos = [], col = [], uvs = [], idx = [];
  const push = (x, y, z, c, t) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); uvs.push(0.5, t); return pos.length / 3 - 1; };
  const stemCol = new THREE.Color(0x3c6126);
  // Stem: a thin crossed ribbon.
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * 0.0026, dz = Math.sin(a) * 0.0026;
    const i0 = push(-dx, 0, -dz, stemCol, 0), i1 = push(dx, 0, dz, stemCol, 0);
    const i2 = push(-dx, stem, -dz, stemCol, 1), i3 = push(dx, stem, dz, stemCol, 1);
    idx.push(i0, i1, i2, i1, i3, i2);
  }
  // Petals: a ring of lozenges tipped up into a shallow cup.
  const cIdx = push(0, stem + 0.004, 0, centreCol, 1);
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2 + r() * 0.2;
    const len = petalLen * (0.85 + 0.3 * r());
    const ca = Math.cos(a), sa = Math.sin(a);
    const tipY = stem + len * cup * (0.6 + 0.8 * r());
    const side = petalWid * 0.5;
    const shade = petalCol.clone().multiplyScalar(0.82 + 0.3 * r());
    const m0 = push(ca * len * 0.5 - sa * side, stem + len * cup * 0.3, sa * len * 0.5 + ca * side, shade, 1);
    const m1 = push(ca * len * 0.5 + sa * side, stem + len * cup * 0.3, sa * len * 0.5 - ca * side, shade, 1);
    const tp = push(ca * len, tipY, sa * len, shade, 1);
    idx.push(cIdx, m0, m1, m0, tp, m1);
  }
  // Centre: a small dome.
  const top = push(0, stem + centre * 0.9, 0, centreCol.clone().multiplyScalar(1.15), 1);
  const ring = 6;
  const first = pos.length / 3;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2;
    push(Math.cos(a) * centre, stem + 0.006, Math.sin(a) * centre, centreCol, 1);
  }
  for (let k = 0; k < ring; k++) idx.push(top, first + k, first + ((k + 1) % ring));

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function flowerMaterial({ gridN, size, salt, patchSeed, threshold }) {
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  const R = size / 2;
  const { world, worldCell } = placeInstance(gridN, size, salt);
  const rnd = hash21(worldCell.add(5.3));
  const rnd2 = hash21(worldCell.add(77.7));
  const t = uv().y;
  const dist = length(world.sub(U.camPos.xz));

  // Flowers grow in drifts, never evenly.
  const drift = vnoise(world.mul(0.085).add(patchSeed)).mul(0.7).add(vnoise(world.mul(0.4).add(patchSeed * 2.0)).mul(0.3));
  const grows = smoothstep(threshold, threshold + 0.1, drift)
    .mul(float(1.0).sub(yardMask(world))).mul(float(1.0).sub(smoothstep(0.2, 0.6, dirtMask(world))));
  const vis = grows.mul(float(1.0).sub(smoothstep(R * 0.78, R * 0.98, dist)));
  const clump = vnoise(world.mul(0.55).add(4.0));
  const scale = mix(0.8, 1.25, rnd).mul(mix(0.62, 1.22, clump)).mul(vis);

  const yaw = rnd.mul(6.2831853);
  const cy = cos(yaw), sy = sin(yaw);
  const pg = positionGeometry;
  const local = vec3(pg.x.mul(cy).sub(pg.z.mul(sy)), pg.y, pg.x.mul(sy).add(pg.z.mul(cy))).mul(scale);

  const windDir = normalize(vec2(0.86, 0.5));
  const along = dot(world, windDir);
  const across = dot(world, vec2(-0.5, 0.86));
  const gust = sin(along.mul(0.17).sub(U.time.mul(0.85)).add(sin(across.mul(0.11).add(U.time.mul(0.23))).mul(1.6))).mul(0.5).add(0.5);
  const nod = sin(U.time.mul(mix(1.6, 2.6, rnd2)).add(rnd.mul(30.0))).mul(0.03);
  const away = world.sub(U.camPos.xz);
  const awayLen = length(away).max(0.001);
  const push = float(1.0).sub(smoothstep(0.18, 0.9, awayLen));
  const sway = windDir.mul(gust.mul(0.16).add(nod)).add(away.div(awayLen).mul(push).mul(0.4)).mul(t).mul(local.y.max(0.0));

  const worldPos = vec3(world.x.add(local.x).add(sway.x), heightAtNode(world).add(local.y), world.y.add(local.z).add(sway.y));
  mat.positionNode = worldPos;

  const base = attribute('color', 'vec3');
  const viewDir = normalize(worldPos.sub(U.camPos));
  const into = pow(saturate(dot(viewDir, U.sunDir).mul(0.5).add(0.5)), 3.0).mul(U.trans);
  mat.colorNode = varying(base.mul(mix(0.55, 1.0, t)).mul(float(1.0).add(into.mul(0.9))), 'vFlowerCol');
  const lightFlat = normalize(vec3(U.lightDir.x, 0.0, U.lightDir.z));
  mat.normalNode = transformNormalToView(varying(normalize(vec3(0.0, 1.0, 0.0).add(lightFlat.mul(0.7))), 'vFlowerN')).normalize();
  mat.emissiveNode = varying(jarLight(worldPos, vec3(0.0, 1.0, 0.0), float(0.6)).mul(base).mul(1.6), 'vFlowerJar');
  return mat;
}

export function createGrass(quality) {
  const group = new THREE.Group();
  group.name = 'grass';

  // Rings of grass, finest underfoot: each ring starts where the previous one fades.
  let inner = 0;
  quality.grass.forEach((tier, i) => {
    const geo = tuftGeometry({ blades: tier.blades, segments: tier.seg, radius: tier.radius, width: tier.width, seed: 11 + i * 12 });
    geo.instanceCount = tier.n * tier.n;
    const mesh = new THREE.Mesh(geo, grassMaterial({ gridN: tier.n, size: tier.size, bladeHeight: tier.height, innerHole: inner, salt: i * 13.0, wide: i > 0 }));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'grass' + i;
    group.add(mesh);
    inner = tier.size / 2;
  });
  // Wildflowers of a Midwest pasture.
  const species = [
    { name: 'daisy', petals: 11, petalLen: 0.022, petalWid: 0.008, cup: 0.25, centre: 0.007, stem: 0.40, petalCol: new THREE.Color(0xf4f1e6), centreCol: new THREE.Color(0xe9b21c), patchSeed: 3.0, threshold: 0.50 },
    { name: 'susan', petals: 10, petalLen: 0.030, petalWid: 0.011, cup: -0.12, centre: 0.010, stem: 0.47, petalCol: new THREE.Color(0xf1a814), centreCol: new THREE.Color(0x2e1a0c), patchSeed: 21.0, threshold: 0.56 },
    { name: 'clover', petals: 7, petalLen: 0.012, petalWid: 0.010, cup: 1.25, centre: 0.009, stem: 0.30, petalCol: new THREE.Color(0xc76fb0), centreCol: new THREE.Color(0xd98cc4), patchSeed: 47.0, threshold: 0.52 },
    { name: 'lace', petals: 14, petalLen: 0.042, petalWid: 0.016, cup: 0.10, centre: 0.016, stem: 0.56, petalCol: new THREE.Color(0xeeeee2), centreCol: new THREE.Color(0xe4e6d6), patchSeed: 63.0, threshold: 0.58 },
  ];
  species.forEach((s, i) => {
    const g = flowerGeometry({ ...s, seed: 100 + i });
    g.instanceCount = quality.flowerN * quality.flowerN;
    const m = new THREE.Mesh(g, flowerMaterial({ gridN: quality.flowerN, size: quality.flowerSize, salt: 50.0 + i * 9.0, patchSeed: s.patchSeed, threshold: s.threshold }));
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.name = s.name;
    group.add(m);
  });

  return group;
}

export const _g = [max, cameraPosition];
