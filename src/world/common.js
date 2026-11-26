// TSL helpers shared by ground, grass, flowers and props.
import * as THREE from 'three/webgpu';
import {
  Fn, If, vec2, vec3, float, sin, cos, dot, fract, floor, mix, smoothstep, saturate, length, normalize, max, min, clamp, exp, abs,
} from 'three/tsl';
import { U } from '../tod.js';
import { HOUSE, HOUSE_YAW, OAK, GATE, FENCE } from './layout.js';

export const SWING = new THREE.Vector3(OAK.x + 5.7, 0, OAK.z + 3.7);

export const hash21 = /*@__PURE__*/ Fn(([p]) => {
  const q = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.1030, 0.0973)));
  const r = q.add(dot(q, q.yzx.add(33.33)));
  return fract(r.x.add(r.y).mul(r.z));
});

export const hash22 = /*@__PURE__*/ Fn(([p]) => {
  const q = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.1030, 0.0973)));
  const r = q.add(dot(q, q.yzx.add(33.33)));
  return fract(vec2(r.x.add(r.y).mul(r.z), r.x.add(r.z).mul(r.y)));
});

// Cheap smooth value noise, 0..1.
export const vnoise = /*@__PURE__*/ Fn(([p]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const a = hash21(i), b = hash21(i.add(vec2(1, 0))), c = hash21(i.add(vec2(0, 1))), d = hash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

const segDist = /*@__PURE__*/ Fn(([p, a, b]) => {
  const pa = p.sub(a), ba = b.sub(a);
  const h = clamp(dot(pa, ba).div(dot(ba, ba)), 0.0, 1.0);
  return length(pa.sub(ba.mul(h)));
});

// 1 where the grass is kept short: the farmhouse yard.
export const yardMask = /*@__PURE__*/ Fn(([p]) => {
  const beyondFence = smoothstep(FENCE.minZ + 1.2, FENCE.minZ - 1.2, p.y);
  const near = smoothstep(26.0, 17.0, length(p.sub(vec2(HOUSE.x, HOUSE.z)).mul(vec2(0.8, 1.0))));
  return beyondFence.mul(near);
});

// 1 where the ground is worn to bare dirt: under the tire swing, the gate path.
export const dirtMask = /*@__PURE__*/ Fn(([p]) => {
  const wob = vnoise(p.mul(1.7)).sub(0.5).mul(0.5);
  const swing = smoothstep(1.75, 0.75, length(p.sub(vec2(SWING.x, SWING.z)).mul(vec2(1.0, 0.72))).add(wob));
  const path = smoothstep(0.95, 0.35, segDist(p, vec2(GATE.x, GATE.z + 3.5), vec2(HOUSE.x + 1.2, HOUSE.z + 7.0)).add(wob));
  const trunk = smoothstep(2.3, 1.0, length(p.sub(vec2(OAK.x, OAK.z))).add(wob));
  return saturate(max(max(swing, path), trunk.mul(0.75)));
});

// Large soft patches: 0 = lush green, 1 = dry gold. Ground and grass both read it.
export const patchNoise = /*@__PURE__*/ Fn(([p]) => {
  const a = vnoise(p.mul(0.045).add(vec2(3.1, 7.7)));
  const b = vnoise(p.mul(0.16).add(vec2(11.3, 2.9)));
  return saturate(a.mul(0.75).add(b.mul(0.35)).sub(0.08));
});

export const GRASS_ROOT = new THREE.Color(0x24401a);
export const GRASS_LUSH = new THREE.Color(0x4c8a2a);
export const GRASS_DRY = new THREE.Color(0x7d8a2e);
export const GRASS_TIP = new THREE.Color(0xa9b862);

// The jar's light on the meadow: a round warm pool under the jar. Measured across the ground only,
// so tall clumps and short ones are lit alike and the pool does not shift as you turn.
export const jarPool = /*@__PURE__*/ Fn(([worldPos]) => {
  const dv = worldPos.xz.sub(U.jarPos.xz);
  const d2 = dot(dv, dv);
  const atten = float(1.0).div(d2.mul(2.6).add(1.0)).mul(smoothstep(2.6, 0.9, length(dv)));
  return U.jarCol.mul(U.jarInt).mul(atten).mul(0.25);
});

// Warm light of the jar. Not a scene light: it needs an artistic falloff so it can
// pool on the grass at arm's length without burning out the hands holding it.
// The porch light on the lawn. Worked out by hand rather than with a shadow-casting lamp: for a
// point on the ground, follow the line back to the bulb and see what it passes at the porch edge
// (a post, the rail and its balusters, or the porch floor). That gives the fan of post shadows a
// real porch light throws, at any brightness, without burning out everything near the bulb.
const hc = Math.cos(HOUSE_YAW), hs = Math.sin(HOUSE_YAW);
export const porchPool = /*@__PURE__*/ Fn(([worldPos]) => {
  const wx = worldPos.x.sub(HOUSE.x), wz = worldPos.z.sub(HOUSE.z);
  const out = vec3(0.0).toVar();
  // Only the lawn in front of the house is worth the arithmetic.
  If(wx.mul(wx).add(wz.mul(wz)).lessThan(26 * 26).and(U.porchOn.greaterThan(0.01)), () => {
  const lx = wx.mul(hc).sub(wz.mul(hs)), lz = wx.mul(hs).add(wz.mul(hc));
  const Lx = 0.98, Ly = 2.55, Lz = 3.7, edge = 5.78;
  const t = float(edge - Lz).div(lz.sub(Lz).max(0.05));       // where the ray crosses the line of posts
  const xc = lx.sub(Lx).mul(t).add(Lx), yc = float(Ly).mul(float(1.0).sub(t));
  let post = float(0.0);
  for (const px of [-4.45, -2.35, -0.95, 0.95, 2.35, 4.45]) post = max(post, smoothstep(0.13, 0.06, abs(xc.sub(px))));
  const railed = smoothstep(0.9, 1.0, abs(xc)).mul(smoothstep(4.5, 4.4, abs(xc)));
  const baluster = smoothstep(0.3, 0.42, abs(fract(xc.div(0.21)).sub(0.5)).mul(2.0)).mul(0.55);
  const rail = max(smoothstep(0.05, 0.02, abs(yc.sub(1.48))), smoothstep(0.05, 0.02, abs(yc.sub(0.76)))).max(baluster.mul(smoothstep(0.74, 0.8, yc)).mul(smoothstep(1.5, 1.44, yc))).mul(railed);
  const floor = smoothstep(0.62, 0.5, yc);                    // below the boards: the porch itself is in the way
  const lit = float(1.0).sub(max(max(post, rail), floor));
  const dist = length(vec2(lx.sub(Lx), lz.sub(Lz)));
  const inFront = smoothstep(5.8, 6.6, lz).mul(smoothstep(8.5, 3.0, abs(xc)));
  const fall = float(1.0).div(dist.mul(dist).mul(0.02).add(1.0)).mul(smoothstep(19.0, 9.0, dist));
  out.assign(vec3(1.0, 0.66, 0.34).mul(lit).mul(inFront).mul(fall).mul(U.porchOn));
  });
  return out;
});

// A firefly flashing just above the grass lights the blade tips under it.
export const flyLight = /*@__PURE__*/ Fn(([worldPos]) => {
  let sum = float(0.0);
  for (const L of U.flyLights) {
    const dv = L.xyz.sub(worldPos);
    sum = sum.add(L.w.div(dot(dv, dv).mul(3.2).add(1.0)).mul(smoothstep(2.4, 0.8, length(dv))));
  }
  return vec3(0.6, 1.0, 0.12).mul(sum);
});

export const jarLight = /*@__PURE__*/ Fn(([worldPos, worldNormal, wrap]) => {
  const L = U.jarPos.sub(worldPos);
  const d = length(L);
  const nl = saturate(dot(worldNormal, L.div(d.max(0.001))).mul(float(1.0).sub(wrap)).add(wrap));
  const atten = float(1.0).div(d.mul(d).mul(3.4).add(1.0)).min(0.42).mul(smoothstep(3.2, 1.1, d));
  return U.jarCol.mul(U.jarInt).mul(atten).mul(nl);
});

export const _c = [cos, sin, min];
