// The old pasture fence, the gate, the power line along the road and the town beyond.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, texture, uv, positionWorld, positionLocal, normalWorld, normalLocal, instanceIndex, sin, mix, abs,
  fract, smoothstep, hash, cameraProjectionMatrix, modelViewMatrix, positionGeometry, attribute, time,
} from 'three/tsl';
import { FENCE, GATE, HOUSE, heightAt, farHeight } from './layout.js';
import { jarLight } from './common.js';
import { U } from '../tod.js';

// Weathered grey boards: each instance samples its own strip of the plank texture
// with the grain running along its length.
function boardMaterial(tex, { along = 'x' } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const r = hash(instanceIndex.add(17));
  const r2 = hash(instanceIndex.add(101));
  // Box UVs: u runs along the long side of every face we care about.
  const st = along === 'x'
    ? vec2(uv().y.mul(0.16).add(r.mul(0.8)), uv().x.mul(1.1).add(r2))
    : vec2(uv().x.mul(0.14).add(r.mul(0.8)), uv().y.mul(0.55).add(r2));
  const c = texture(tex.diff, st).rgb;
  const grey = mix(vec3(0.62, 0.59, 0.54), vec3(0.47, 0.42, 0.36), r2);
  mat.colorNode = vec4(c.mul(2.1).mul(grey).add(vec3(0.03, 0.035, 0.02).mul(r)), 1.0);
  mat.roughnessNode = texture(tex.rough, st).r.mul(0.5).add(0.5);
  // Lit by the jar the wood keeps its grain rather than turning into a glowing slab.
  mat.emissiveNode = jarLight(positionWorld, normalWorld, float(0.3)).min(vec3(0.5)).mul(c.mul(2.1).mul(grey)).mul(0.8);
  return mat;
}

export function createFence(assets) {
  const group = new THREE.Group();
  group.name = 'fence';
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const corners = [
    [FENCE.minX, FENCE.minZ], [FENCE.maxX, FENCE.minZ], [FENCE.maxX, FENCE.maxZ], [FENCE.minX, FENCE.maxZ],
  ];
  const posts = [], boards = [];
  const SPAN = 2.35;
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / SPAN);
    const dirYaw = Math.atan2(-(bz - az), bx - ax);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const inGate = s === 0 && Math.abs(x - GATE.x) < GATE.width / 2 + 0.2;
      const gateEdge = s === 0 && Math.abs(Math.abs(x - GATE.x) - GATE.width / 2) < SPAN / 2;
      const y = heightAt(x, z);
      const post = { x, y, z, h: 1.18 + rnd() * 0.14 + (gateEdge ? 0.25 : 0), leanX: (rnd() - 0.5) * 0.11, leanZ: (rnd() - 0.5) * 0.11, yaw: dirYaw + (rnd() - 0.5) * 0.2, skip: inGate };
      if (!inGate && i < n) posts.push(post);
      if (prev && !prev.skip && !post.skip) {
        // Three rails; the odd one has come loose over the years.
        for (let k = 0; k < 3; k++) {
          const roll = rnd();
          if (roll < 0.045) continue; // missing board
          const hang = roll < 0.11 ? (rnd() - 0.5) * 0.36 : (rnd() - 0.5) * 0.045;
          const yA = prev.y + 0.33 + k * 0.33, yB = post.y + 0.33 + k * 0.33 + hang;
          boards.push({ ax: prev.x, ay: yA, az: prev.z, bx: post.x, by: yB, bz: post.z, yaw: dirYaw, out: (k % 2 ? 1 : -1) * 0.004 });
        }
      }
      prev = post;
    }
  }

  const dummy = new THREE.Object3D();
  const postGeo = new THREE.BoxGeometry(0.115, 1, 0.115);
  postGeo.translate(0, 0.5, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, boardMaterial(assets.tex.greyPlanks, { along: 'y' }), posts.length);
  posts.forEach((p, i) => {
    dummy.position.set(p.x, p.y - 0.12, p.z);
    dummy.rotation.set(p.leanX, p.yaw, p.leanZ);
    dummy.scale.set(1, p.h + 0.12, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(i, dummy.matrix);
  });

  const boardGeo = new THREE.BoxGeometry(1, 0.135, 0.026);
  const boardMesh = new THREE.InstancedMesh(boardGeo, boardMaterial(assets.tex.greyPlanks, { along: 'x' }), boards.length);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
  boards.forEach((bd, i) => {
    a.set(bd.ax, bd.ay, bd.az); b.set(bd.bx, bd.by, bd.bz);
    mid.copy(a).add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    dummy.position.copy(mid);
    dummy.rotation.set(0, bd.yaw, Math.asin((bd.by - bd.ay) / len), 'YZX');
    dummy.translateZ(0.07 + bd.out);
    dummy.scale.set(len + 0.14, 1, 1);
    dummy.updateMatrix();
    boardMesh.setMatrixAt(i, dummy.matrix);
  });
  for (const m of [postMesh, boardMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); }

  // The gate, left standing open toward the house.
  const gate = new THREE.Group();
  const gMat = boardMaterial(assets.tex.greyPlanks, { along: 'x' });
  const gw = GATE.width - 0.25;
  const add = (w, h, d, x, y, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gMat);
    m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; gate.add(m);
  };
  for (let k = 0; k < 4; k++) add(gw, 0.11, 0.024, gw / 2, 0.28 + k * 0.27);
  add(0.1, 1.05, 0.03, 0.05, 0.62); add(0.1, 1.05, 0.03, gw - 0.05, 0.62);
  add(Math.hypot(gw, 0.8), 0.1, 0.024, gw / 2, 0.66, Math.atan2(0.8, gw));
  gate.position.set(GATE.x - GATE.width / 2 + 0.1, heightAt(GATE.x, GATE.z), GATE.z);
  gate.rotation.y = 1.5;
  group.add(gate);

  return group;
}

// Utility poles marching along the county road behind the house.
export function createPowerLine() {
  const group = new THREE.Group();
  group.name = 'powerline';
  // Far enough away to be shapes against the sky: unlit, so no lamp ever makes them glow.
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = vec4(U.ambient.mul(0.06).add(vec3(0.006, 0.005, 0.005)), 1.0);
  const roadZ = HOUSE.z - 22;
  const poles = [];
  for (let i = 0; i < 9; i++) poles.push({ x: -150 + i * 38, z: roadZ - Math.sin(i * 0.7) * 2.5 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 8.6, 7);
  poleGeo.translate(0, 4.3, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.3);
  armGeo.translate(0, 8.05, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, mat, poles.length);
  const armMesh = new THREE.InstancedMesh(armGeo, mat, poles.length);
  const dummy = new THREE.Object3D();
  poles.forEach((p, i) => {
    p.y = farHeight(p.x, p.z);
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set((Math.sin(i * 3.1) * 0.02), 0, Math.cos(i * 2.3) * 0.025);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix); armMesh.setMatrixAt(i, dummy.matrix);
  });
  poleMesh.castShadow = armMesh.castShadow = true;
  group.add(poleMesh, armMesh);

  // Sagging wires between the crossarms.
  const pts = [];
  for (let i = 0; i < poles.length - 1; i++) {
    const p = poles[i], q = poles[i + 1];
    for (const off of [-1.0, 0, 1.0]) {
      const SEG = 12;
      for (let s = 0; s < SEG; s++) {
        for (const t of [s / SEG, (s + 1) / SEG]) {
          const sag = 4 * t * (1 - t) * 1.1;
          pts.push(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t + 8.12 - sag, p.z + (q.z - p.z) * t + off);
        }
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicNodeMaterial({ color: 0x1b1714 }));
  group.add(wires);
  return group;
}

// A small town a mile off: rooftops, a steeple, a water tower, and windows that come on at dusk.
export function createTown() {
  const group = new THREE.Group();
  group.name = 'town';
  let seed = 777;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dark = new THREE.MeshBasicNodeMaterial();
  dark.colorNode = vec4(U.ambient.mul(0.085).add(vec3(0.008, 0.008, 0.012)), 1.0);
  const boxes = [], lights = [];
  const dummy = new THREE.Object3D();
  const cx = 150, cz = -250; // north-east, past the house
  for (let i = 0; i < 34; i++) {
    const x = cx + (rnd() - 0.5) * 300, z = cz + (rnd() - 0.5) * 90;
    const w = 7 + rnd() * 6, h = 4 + rnd() * 3.5, d = 6 + rnd() * 5;
    const y = farHeight(x, z);
    boxes.push({ x, y, z, w, h, d, yaw: rnd() * 0.5 });
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) lights.push({ x: x + (rnd() - 0.5) * w * 0.7, y: y + 1.4 + rnd() * (h - 2), z: z + d * 0.55, warm: rnd(), on: 0.2 + rnd() * 0.55, size: 1.0 + rnd() * 0.7 });
  }
  // Street lamps down main street.
  for (let i = 0; i < 12; i++) {
    const x = cx - 140 + i * 25 + rnd() * 6, z = cz + 34 + rnd() * 8;
    lights.push({ x, y: farHeight(x, z) + 5.5, z, warm: 0.2, on: 0.3 + rnd() * 0.1, size: 1.6 });
  }
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, boxes.length);
  const roofGeo = new THREE.ConeGeometry(0.72, 0.5, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofGeo, dark, boxes.length);
  boxes.forEach((b, i) => {
    dummy.position.set(b.x, b.y + b.h / 2, b.z); dummy.rotation.set(0, b.yaw, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    body.setMatrixAt(i, dummy.matrix);
    dummy.position.set(b.x, b.y + b.h + b.h * 0.22, b.z); dummy.scale.set(b.w * 1.05, b.h * 0.9, b.d * 1.05); dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
  });
  group.add(body, roofs);

  // Church steeple.
  const sx = cx - 40, sz = cz + 10, sy = farHeight(sx, sz);
  const church = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 18), dark); church.position.set(sx, sy + 4.5, sz);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.2, 17, 4.2), dark); tower.position.set(sx, sy + 8.5, sz + 9);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.1, 11, 4), dark); spire.position.set(sx, sy + 22.5, sz + 9); spire.rotation.y = Math.PI / 4;
  group.add(church, tower, spire);
  lights.push({ x: sx, y: sy + 13, z: sz + 11.3, warm: 0.9, on: 0.35, size: 1.5 });

  // Water tower.
  const wx = cx + 70, wz = cz - 5, wy = farHeight(wx, wz);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 6.5, 14), dark); tank.position.set(wx, wy + 25, wz);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(5.5, 2.6, 14), dark); cap.position.set(wx, wy + 29.5, wz);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(5.2, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); bowl.position.set(wx, wy + 21.8, wz); bowl.scale.y = 0.55;
  group.add(tank, cap, bowl);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 23, 5), dark);
    leg.position.set(wx + Math.cos(a) * 4.4, wy + 11, wz + Math.sin(a) * 4.4);
    leg.rotation.set(Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06);
    group.add(leg);
  }
  lights.push({ x: wx, y: wy + 31.5, z: wz, warm: -1, on: 0.3, size: 1.4 }); // red beacon

  // Lights as camera-facing glows that switch on one by one as it gets dark.
  const n = lights.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(n * 3), par = new Float32Array(n * 3);
  lights.forEach((l, i) => { off.set([l.x, l.y, l.z], i * 3); par.set([l.warm, l.on, l.size], i * 3); });
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(par, 3));
  geo.instanceCount = n;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const aOff = attribute('aOffset', 'vec3'), aPar = attribute('aParam', 'vec3');
  const view = modelViewMatrix.mul(vec4(aOff, 1.0));
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(positionGeometry.xy.mul(aPar.z).mul(1.0), 0.0, 0.0)));
  mat.colorNode = Fn(() => {
    const d = positionGeometry.xy.length();
    const g = smoothstep(1.0, 0.0, d);
    const lit = smoothstep(aPar.y, aPar.y.add(0.07), U.tod);
    const warm = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.62, 0.28), aPar.x.max(0.0));
    const col = mix(warm, vec3(1.0, 0.1, 0.06), smoothstep(-0.5, -0.9, aPar.x));
    const blink = mix(float(1.0), sin(time.mul(2.4)).mul(0.5).add(0.5), smoothstep(-0.5, -0.9, aPar.x));
    const haze = smoothstep(0.0, 0.35, U.tod).mul(0.5).add(0.5);
    return vec4(col.mul(g.mul(g).mul(g)).mul(lit).mul(blink).mul(1.5).mul(haze), 1.0);
  })();
  const glow = new THREE.Mesh(geo, mat);
  glow.frustumCulled = false;
  group.add(glow);
  return group;
}

export const _f = [abs, fract, positionLocal, normalLocal];
