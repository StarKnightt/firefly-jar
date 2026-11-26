// The fireflies you can't reach: hundreds low over the fields past the fence and along the
// treeline, and more climbing high above the meadow toward the oak. Purely visual, and entirely
// in the vertex shader (no per-frame CPU work). Nothing here is ever at catching height inside
// the fence, so a light you can walk up to is always one you can catch.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, attribute, modelViewMatrix, cameraProjectionMatrix, positionGeometry, exp, smoothstep, sin, fract, mix,
  varying, max,
} from 'three/tsl';
import { U } from '../tod.js';
import { FENCE, OAK, farHeight, heightAt } from './layout.js';

export function createFarFlies(count = 900) {
  let seed = 31337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pos = new Float32Array(count * 3), par = new Float32Array(count * 4);
  let n = 0;
  while (n < count) {
    const kind = rnd();
    let x, y, z;
    if (kind < 0.3) {
      // Low over the meadow itself. These only ever show at a distance (they go dark as you come
      // near), so any light you can walk up to is one you can catch.
      x = FENCE.minX + 2 + rnd() * (FENCE.maxX - FENCE.minX - 4); z = FENCE.minZ + 2 + rnd() * (FENCE.maxZ - FENCE.minZ - 4);
      y = heightAt(x, z) + 0.7 + Math.pow(rnd(), 1.5) * 1.5;
    } else if (kind < 0.85) {
      // Low over the grass beyond the fence, thickest a little way past it.
      const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 1.5) * 100;
      x = Math.cos(a) * r * 1.2; z = Math.sin(a) * r;
      if (x > FENCE.minX - 7 && x < FENCE.maxX + 7 && z > FENCE.minZ - 7 && z < FENCE.maxZ + 7) continue;
      y = farHeight(x, z) + 0.4 + Math.pow(rnd(), 1.6) * 1.9;
    } else {
      // Against the hedgerows and the trunks of the far trees.
      const a = rnd() * Math.PI * 2, r = 70 + rnd() * 90;
      x = Math.cos(a) * r * 1.15; z = Math.sin(a) * r;
      if (x > FENCE.minX - 12 && x < FENCE.maxX + 12 && z > FENCE.minZ - 12 && z < FENCE.maxZ + 12) continue;
      y = farHeight(x, z) + 1.0 + rnd() * 3.2;
    }
    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
    par[n * 4] = rnd() * 100;           // phase
    par[n * 4 + 1] = 2.3 + rnd() * 3.2; // period
    par[n * 4 + 2] = rnd();             // when in the evening it wakes
    par[n * 4 + 3] = 0.75 + rnd() * 0.6; // size
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
  const t = U.time.add(aPar.x);
  const ph = fract(t.div(aPar.y)).mul(aPar.y); // seconds into this one's cycle
  // On for about half a second, rising as it glows, then dark.
  const flash = smoothstep(0.0, 0.07, ph).mul(float(1.0).sub(smoothstep(0.32, 0.62, ph)));
  const rise = smoothstep(0.0, 0.6, ph).mul(float(1.0).sub(smoothstep(0.6, 2.0, ph)));
  const drift = vec3(sin(t.mul(0.31)).mul(1.1), sin(t.mul(0.53)).mul(0.22).add(rise.mul(0.34)), sin(t.mul(0.27).add(1.7)).mul(1.1));
  const view = modelViewMatrix.mul(vec4(aPos.add(drift), 1.0));
  const dist = view.z.negate();
  // The first appear in the last of the sun; by blue hour they are all out.
  const awake = smoothstep(aPar.z.mul(0.42), aPar.z.mul(0.42).add(0.1), U.tod.add(0.04)).mul(smoothstep(15.0, 22.0, dist));
  const day = float(1.0).sub(smoothstep(0.1, 0.5, U.tod));
  // A minimum apparent size keeps the far ones as points of light instead of vanishing.
  const size = max(float(0.07), dist.mul(0.0068)).mul(aPar.w);
  const stretch = flash.mul(rise).mul(0.35);
  const quad = vec2(positionGeometry.x, positionGeometry.y.mul(stretch.add(1.0)));
  mat.vertexNode = cameraProjectionMatrix.mul(view.add(vec4(quad.mul(size), 0.0, 0.0)));
  const vBright = varying(flash.mul(awake).mul(day.mul(1.3).add(1.0)), 'vFarBright');
  mat.colorNode = Fn(() => {
    const r2 = positionGeometry.xy.dot(positionGeometry.xy);
    const core = exp(r2.mul(-34.0));
    const halo = exp(r2.mul(-5.5)).mul(0.2);
    // A firefly's lantern is yellow at its heart and yellow-green at the edge.
    const col = mix(vec3(0.66, 0.9, 0.05), vec3(1.0, 0.9, 0.3), core);
    return vec4(col.mul(core.mul(3.0).add(halo)).mul(vBright).mul(smoothstep(1.0, 0.7, r2)), 1.0);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.name = 'farflies';
  return mesh;
}
