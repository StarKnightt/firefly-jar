// The fireflies you can't reach: hundreds along the fence and the treeline, blinking on
// their own clocks. Purely visual and entirely in the vertex shader (no per-frame CPU work).
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, attribute, modelViewMatrix, cameraProjectionMatrix, positionGeometry, exp, mix, smoothstep, sin, fract, pow,
  varying, max,
} from 'three/tsl';
import { U } from '../tod.js';
import { FENCE, farHeight } from './layout.js';

export function createFarFlies(count = 420) {
  let seed = 31337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pos = new Float32Array(count * 3), par = new Float32Array(count * 4);
  let n = 0;
  while (n < count) {
    // A band from just outside the fence out to the trees, thicker near the fence.
    const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 1.7) * 110;
    const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
    const inside = x > FENCE.minX - 2 && x < FENCE.maxX + 2 && z > FENCE.minZ - 2 && z < FENCE.maxZ + 2;
    if (inside) continue;
    pos[n * 3] = x; pos[n * 3 + 1] = farHeight(x, z) + 0.5 + Math.pow(rnd(), 1.5) * 2.6; pos[n * 3 + 2] = z;
    par[n * 4] = rnd() * 100;          // phase
    par[n * 4 + 1] = 2.8 + rnd() * 4.5; // period
    par[n * 4 + 2] = rnd();             // when in the evening it wakes
    par[n * 4 + 3] = 0.6 + rnd() * 0.7; // size
    n++;
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4));
  geo.instanceCount = count;

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const aPos = attribute('aPos', 'vec3'), aPar = attribute('aPar', 'vec4');
  // Slow drift and the little rise during each flash.
  const t = U.time.add(aPar.x);
  const ph = fract(t.div(aPar.y));
  const flash = smoothstep(0.0, 0.02, ph).mul(exp(ph.mul(aPar.y).mul(-3.2)));
  const drift = vec3(sin(t.mul(0.31)).mul(0.9), sin(t.mul(0.53)).mul(0.25).add(flash.mul(0.25)), sin(t.mul(0.27).add(1.7)).mul(0.9));
  const awake = smoothstep(aPar.z.mul(0.5), aPar.z.mul(0.5).add(0.12), U.tod);
  const bright = flash.mul(awake);
  const view = modelViewMatrix.mul(vec4(aPos.add(drift), 1.0));
  // Keep a minimum apparent size so the far ones stay as points of light rather than vanishing.
  const dist = view.z.negate();
  const size = max(float(0.07), dist.mul(0.0021)).mul(aPar.w);
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(positionGeometry.xy.mul(size), 0.0, 0.0)));
  const vBright = varying(bright, 'vFarBright');
  mat.colorNode = Fn(() => {
    const r2 = positionGeometry.xy.dot(positionGeometry.xy);
    const core = exp(r2.mul(-9.0));
    return vec4(mix(vec3(0.78, 1.0, 0.28), vec3(1.0, 0.95, 0.5), 0.2).mul(core).mul(vBright).mul(2.6), 1.0);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.name = 'farflies';
  return mesh;
}

export const _ff = pow;
