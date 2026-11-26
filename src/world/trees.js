// The big oak with its tire swing, plus the trees beyond the fence.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, texture, uv, positionLocal, positionWorld, normalWorld, normalViewGeometry, sin, dot, mix,
  smoothstep, saturate, normalize, pow, attribute, cameraPosition, normalMap, length, fract, floor,
} from 'three/tsl';
import { compileTree } from './treegen.js';
import { U } from '../tod.js';
import { OAK, FENCE, HOUSE, heightAt, farHeight } from './layout.js';
import { SWING, jarLight } from './common.js';

const OAK_SCALE = 0.172;

const oakPreset = {
  seed: 23399,
  branchLevels: 3,
  bark: { textureScaleX: 0.9, textureScaleY: 5 },
  branch: {
    angle: [0, 60, 47, 36],
    children: [9, 5, 3, 0],
    forceDirection: [0, 1, 0],
    forceStrength: 0.011,
    gnarliness: [-0.03, 0.2, 0.13, 0.09],
    length: [37, 31, 18, 8],
    radius: [3.5, 0.66, 0.69, 1.0],
    sections: [14, 9, 7, 3],
    segments: [16, 7, 5, 3],
    start: [0, 0.43, 0.12, 0],
    taper: [0.6, 0.45, 0.69, 0.75],
    twist: [-0.2, 0.38, 0, 0],
  },
  leaves: { angle: 38, count: 10, start: 0.08, size: 5.6, sizeVariance: 0.55, alphaTest: 0.5 },
};

// Cheaper trees for the fence line and the distance.
function farPreset(seed, kind) {
  const tall = kind === 'tall';
  return {
    seed,
    branchLevels: 2,
    bark: { textureScaleX: 0.9, textureScaleY: 5 },
    branch: {
      angle: [0, tall ? 48 : 62, 44, 0],
      children: [tall ? 8 : 7, 4, 0, 0],
      forceDirection: [0, 1, 0],
      forceStrength: tall ? 0.02 : 0.012,
      gnarliness: [0.04, 0.2, 0.14, 0],
      length: [tall ? 42 : 30, tall ? 24 : 27, 14, 0],
      radius: [2.2, 0.62, 0.7, 0],
      sections: [7, 5, 3, 0],
      segments: [7, 4, 3, 0],
      start: [0, tall ? 0.28 : 0.36, 0.1, 0],
      taper: [0.6, 0.5, 0.7, 0],
      twist: [0.1, 0.2, 0, 0],
    },
    leaves: { angle: 40, count: 7, start: 0.0, size: tall ? 9.0 : 10.5, sizeVariance: 0.5, alphaTest: 0.5 },
  };
}

function barkMaterial(tex, { tiling = new THREE.Vector2(1, 1), tint = 0xffffff } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const st = uv().mul(vec2(tiling.x, tiling.y));
  const c = new THREE.Color(tint);
  mat.colorNode = vec4(texture(tex.diff, st).rgb.mul(vec3(c.r, c.g, c.b)).mul(1.7), 1.0);
  mat.roughnessNode = texture(tex.rough, st).r;
  mat.normalNode = normalMap(texture(tex.nor, st), vec2(1.1, 1.1));
  // By jar light the bark keeps its texture.
  mat.emissiveNode = jarLight(positionWorld, normalWorld, float(0.25)).min(vec3(0.6)).mul(texture(tex.diff, st).rgb).mul(1.1);
  return mat;
}

function leafMaterial(leafTex, { tint = 0xb9c98a, sway = 3, hero = false } = {}) {
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42 });
  mat.alphaToCoverage = true; // with MSAA this softens the cut-out edges of the leaf cards
  const tx = texture(leafTex, uv());
  const c = new THREE.Color(tint);
  // Card colour varies a little from spray to spray so the crown isn't one flat green.
  const seed = fract(sin(dot(floor(positionWorld.mul(0.9)), vec3(12.99, 78.23, 37.72))).mul(43758.5));
  const shade = mix(0.72, 1.12, seed);
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const into = pow(saturate(dot(viewDir, U.sunDir).mul(0.5).add(0.5)), 4.0).mul(U.trans);
  const rgb = tx.rgb.mul(vec3(c.r, c.g, c.b)).mul(shade).mul(float(1.0).add(into.mul(1.7)))
    .add(vec3(1.0, 0.62, 0.16).mul(into).mul(0.05));
  mat.colorNode = vec4(rgb, tx.a);
  // Unflipped rounded normals: cards shade as part of the crown volume, not as flat quads.
  mat.normalNode = normalViewGeometry.normalize();
  // Leaves rustle at their tips; the card root stays on the twig.
  const tip = uv().y;
  const ph = dot(positionWorld, vec3(0.31, 0.17, 0.23));
  const rustle = sin(U.time.mul(2.3).add(ph.mul(2.1))).mul(0.5).add(sin(U.time.mul(0.9).add(ph.mul(0.6))));
  mat.positionNode = positionLocal.add(vec3(1.0, 0.25, 0.6).mul(rustle).mul(tip).mul(0.11 * sway));
  if (hero) mat.emissiveNode = jarLight(positionWorld, vec3(0.0, -1.0, 0.0), float(0.7)).mul(vec3(0.16, 0.2, 0.08));
  return mat;
}

// A stout limb reaching out from the trunk for the swing rope.
function limbGeometry(start, end, r0, r1) {
  const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.55, 0));
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  const tubular = 18, radial = 10;
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position, nor = g.attributes.normal, uvA = g.attributes.uv;
  const p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const centre = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.8)) * (1 + 0.06 * Math.sin(t * 17));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(nor, k);
      pos.setXYZ(k, centre.x + p.x * r, centre.y + p.y * r, centre.z + p.z * r);
      uvA.setXY(k, j / radial, t * 3.2);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function createOak(assets) {
  const group = new THREE.Group();
  group.name = 'oak';
  const base = new THREE.Vector3(OAK.x, heightAt(OAK.x, OAK.z) - 0.12, OAK.z);

  const tree = compileTree(oakPreset);
  const bark = barkMaterial(assets.tex.bark, { tiling: new THREE.Vector2(1, 1.4) });
  const trunk = new THREE.Mesh(tree.branchGeometry, bark);
  const leaves = new THREE.Mesh(tree.leafGeometry, leafMaterial(assets.tex.leaf, { tint: 0xc4d08e, hero: true }));
  for (const m of [trunk, leaves]) {
    m.scale.setScalar(OAK_SCALE);
    m.position.copy(base);
    m.rotation.y = 2.2;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  leaves.receiveShadow = false;

  // Root flare so the trunk grows out of the ground instead of standing on it.
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 1.05, 0.9, 16, 4, true), bark);
  const fp = flare.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const a = Math.atan2(fp.getZ(i), fp.getX(i));
    const y = fp.getY(i);
    const low = THREE.MathUtils.clamp(0.45 - y, 0, 1);
    // Buttress roots: a few strong ridges running out into the ground.
    const k = 1 + low * (0.55 * Math.pow(Math.max(0, Math.sin(a * 3 + 0.6)), 2) + 0.3 * Math.pow(Math.max(0, Math.sin(a * 5 + 2.0)), 3) + 0.08 * Math.sin(a * 11));
    fp.setXYZ(i, fp.getX(i) * k, y, fp.getZ(i) * k);
  }
  flare.geometry.computeVertexNormals();
  flare.position.copy(base).add(new THREE.Vector3(0, 0.3, 0));
  flare.castShadow = flare.receiveShadow = true;
  group.add(flare);

  // ---- tire swing ----
  const limbStart = new THREE.Vector3(base.x + 0.25, base.y + 3.55, base.z + 0.15);
  const swingGround = heightAt(SWING.x, SWING.z);
  const limbEnd = new THREE.Vector3(SWING.x + 0.9, swingGround + 5.25, SWING.z + 0.6);
  const limb = new THREE.Mesh(limbGeometry(limbStart, limbEnd, 0.3, 0.085), bark);
  limb.castShadow = limb.receiveShadow = true;
  group.add(limb);

  const hang = new THREE.Vector3(SWING.x, swingGround + 5.12, SWING.z);
  const pivot = new THREE.Group();
  pivot.position.copy(hang);
  group.add(pivot);

  const tyre = assets.models.tyre;
  const box = new THREE.Box3().setFromObject(tyre);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const tyreHolder = new THREE.Group();
  tyre.position.sub(centre);
  tyreHolder.add(tyre);
  // Stand the tire upright whichever way the scan was lying.
  const thin = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z';
  if (thin === 'y') tyreHolder.rotation.x = Math.PI / 2;
  else if (thin === 'x') tyreHolder.rotation.y = Math.PI / 2;
  const diameter = Math.max(size.x, size.y, size.z);
  const want = 0.74;
  tyreHolder.scale.setScalar(want / diameter);
  const seat = 0.62; // tire centre above the ground
  const ropeLen = hang.y - (swingGround + seat + want * 0.5 - 0.05);
  tyreHolder.position.y = -(ropeLen + want * 0.5 - 0.05);
  tyre.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  pivot.add(tyreHolder);

  const ropeMat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  ropeMat.colorNode = Fn(() => {
    const twist = sin(uv().y.mul(520.0).add(uv().x.mul(6.2832))).mul(0.5).add(0.5);
    return vec4(mix(vec3(0.33, 0.25, 0.15), vec3(0.62, 0.5, 0.33), twist), 1.0);
  })();
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, ropeLen, 8, 1), ropeMat);
  rope.position.y = -ropeLen / 2;
  rope.castShadow = true;
  pivot.add(rope);
  // The loop tied around the top of the tire, and the knot on the limb.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.019, 6, 18), ropeMat);
  loop.position.y = -(ropeLen + 0.06);
  loop.rotation.y = Math.PI / 2;
  pivot.add(loop);
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), ropeMat);
  knot.position.copy(hang).add(new THREE.Vector3(0, 0.03, 0));
  knot.rotation.set(0.3, 0.9, Math.PI / 2);
  group.add(knot);

  const update = (time) => {
    // A swing nobody is on still turns a little in the breeze.
    pivot.rotation.x = Math.sin(time * 1.38) * 0.055 + Math.sin(time * 0.31) * 0.02;
    pivot.rotation.z = Math.sin(time * 1.31 + 1.0) * 0.028;
    pivot.rotation.y = 0.5 + Math.sin(time * 0.23) * 0.5;
  };

  const colliders = [
    { x: base.x, z: base.z, r: 0.95 },
    { x: SWING.x, z: SWING.z, r: 0.5 },
  ];
  return { group, update, colliders, crownCentre: new THREE.Vector3(base.x, base.y + 8.2, base.z) };
}

export function createFarTrees(assets, tier) {
  const group = new THREE.Group();
  group.name = 'farTrees';
  const variants = [
    { preset: farPreset(7, 'round'), scale: 0.13, leaf: 0x9fb072 },
    { preset: farPreset(19, 'tall'), scale: 0.13, leaf: 0x8fa66c },
    { preset: farPreset(42, 'round'), scale: 0.10, leaf: 0xa9b67a },
  ];
  const bark = barkMaterial(assets.tex.bark, { tint: 0xb9a894 });

  // Scatter: loose trees just past the fence, then a thickening treeline.
  let seed = 9001;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const spots = variants.map(() => []);
  const count = Math.round(170 * tier.trees);
  const sunAz = Math.atan2(0.30, -1.0);
  for (let i = 0; i < count * 14 && spots.reduce((s, a) => s + a.length, 0) < count; i++) {
    const a = rnd() * Math.PI * 2;
    const ring = rnd();
    const r = ring < 0.22 ? 62 + rnd() * 40 : 105 + Math.pow(rnd(), 0.7) * 190;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.86;
    // Keep the pasture, the yard and a window toward the sunset clear.
    if (x > FENCE.minX - 7 && x < FENCE.maxX + 7 && z > FENCE.minZ - 7 && z < FENCE.maxZ + 7) continue;
    if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 15) continue;
    let dAz = Math.abs(Math.atan2(z, x) - sunAz); if (dAz > Math.PI) dAz = Math.PI * 2 - dAz;
    if (dAz < 0.07 && r < 230) continue;
    const grove = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.052 - 0.6) + 0.55 * Math.sin(x * 0.11 - z * 0.09);
    if (grove < -0.15 + rnd() * 0.5) continue;
    const v = Math.floor(rnd() * variants.length);
    spots[v].push({ x, z, s: 0.55 + Math.pow(rnd(), 1.4) * 1.25, yaw: rnd() * Math.PI * 2 });
  }
  // Two shade trees beside the farmhouse.
  // A few to the west, where the sun goes down: their shadows reach right across the meadow.
  [[-60, 6, 1.3], [-67, 35, 1.45], [-58, -23, 1.25], [-73, 52, 1.35], [-78, 68, 1.15], [-70, -6, 1.4]].forEach(([x, z, s], i) => spots[i % 3].push({ x, z, s, yaw: i * 1.7 }));
  spots[0].push({ x: HOUSE.x - 13, z: HOUSE.z - 17, s: 1.15, yaw: 1.0 });
  spots[1].push({ x: HOUSE.x + 12, z: HOUSE.z - 6, s: 1.2, yaw: 2.4 });
  spots[2].push({ x: HOUSE.x + 15, z: HOUSE.z + 6.5, s: 0.9, yaw: 4.0 });

  const dummy = new THREE.Object3D();
  variants.forEach((v, vi) => {
    const tree = compileTree(v.preset);
    const list = spots[vi];
    const trunks = new THREE.InstancedMesh(tree.branchGeometry, bark, list.length);
    const leaves = new THREE.InstancedMesh(tree.leafGeometry, leafMaterial(assets.tex.leaf, { tint: v.leaf, sway: 4 }), list.length);
    list.forEach((s, i) => {
      dummy.position.set(s.x, farHeight(s.x, s.z) - 0.2, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.setScalar(v.scale * s.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [trunks, leaves]) {
      m.castShadow = true;
      m.frustumCulled = false;
      group.add(m);
    }
    trunks.receiveShadow = true;
    if (vi === 0) {
      // Hedgerows and scrub: two unbroken dark bands beyond the fence, the wall of green that
      // fireflies show up against.
      const hedge = [];
      for (const [off, step, h] of [[15, 3.0, 0.42], [27, 3.6, 0.6], [44, 4.4, 0.8]]) {
        const x0 = FENCE.minX - off, x1 = FENCE.maxX + off, z0 = FENCE.minZ - off, z1 = FENCE.maxZ + off;
        const per = 2 * (x1 - x0) + 2 * (z1 - z0);
        for (let d = 0; d < per; d += step * (0.7 + rnd() * 0.6)) {
          let x, z;
          if (d < x1 - x0) { x = x0 + d; z = z0; } else if (d < x1 - x0 + z1 - z0) { x = x1; z = z0 + d - (x1 - x0); }
          else if (d < 2 * (x1 - x0) + z1 - z0) { x = x1 - (d - (x1 - x0) - (z1 - z0)); z = z1; } else { x = x0; z = z1 - (d - 2 * (x1 - x0) - (z1 - z0)); }
          x += (rnd() - 0.5) * 5; z += (rnd() - 0.5) * 5;
          if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 24) continue;       // the yard stays open
          let dz = Math.abs(Math.atan2(z, x) - sunAz); if (dz > Math.PI) dz = Math.PI * 2 - dz;
          if (dz < 0.09) continue;                                        // and the place the sun sets
          hedge.push({ x, z, s: 0.8 + rnd() * 0.7, h: h * (0.75 + rnd() * 0.6), yaw: rnd() * Math.PI * 2 });
        }
      }
      const hedgeMesh = new THREE.InstancedMesh(tree.leafGeometry, leafMaterial(assets.tex.leaf, { tint: 0x6f8454, sway: 3 }), hedge.length);
      hedge.forEach((s, i) => {
        // Sunk into the ground so only the crown shows: a bush, with leaves the right size.
        dummy.position.set(s.x, farHeight(s.x, s.z) - 1.2 - s.h * 2.2, s.z);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.setScalar(v.scale * (0.55 + s.h * 0.75) * s.s);
        dummy.updateMatrix();
        hedgeMesh.setMatrixAt(i, dummy.matrix);
      });
      hedgeMesh.frustumCulled = false; hedgeMesh.castShadow = false;
      group.add(hedgeMesh);
    }
  });
  return group;
}

export const _t = [smoothstep, length, attribute];
