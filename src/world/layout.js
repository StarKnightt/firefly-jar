// Shared world layout. x = east, z = south, y = up. The sun sets in the west (-x).
import * as THREE from 'three/webgpu';
import { Fn, sin, cos, float } from 'three/tsl';

export const EYE = 1.12; // an eight year old's eye height, metres

// The fenced pasture the player can walk in.
export const FENCE = { minX: -46, maxX: 44, minZ: -27, maxZ: 40 };
export const GATE = { x: -22, z: FENCE.minZ, width: 3.2 };

export const OAK = new THREE.Vector3(-17, 0, -7);
export const HOUSE = new THREE.Vector3(-25, 0, -43); // porch faces +z (the meadow)
export const HOUSE_YAW = 0.16;
export const START = new THREE.Vector3(4, 0, 6);
export const START_YAW = 1.22; // radians, 0 = looking -z, + = turning left (west)

// Gentle rolling ground. Same closed form on the CPU and in TSL so grass,
// props and the player all agree without a heightmap round trip.
export function heightAt(x, z) {
  return 1.3 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4)
    + 0.55 * Math.sin(x * 0.063 + z * 0.041)
    + 0.22 * Math.sin(z * 0.11 - x * 0.05 + 2.0);
}

export const heightAtNode = /*@__PURE__*/ Fn(([p]) => {
  const x = p.x, z = p.y;
  return sin(x.mul(0.021).add(1.3)).mul(cos(z.mul(0.017).sub(0.4))).mul(1.3)
    .add(sin(x.mul(0.063).add(z.mul(0.041))).mul(0.55))
    .add(sin(z.mul(0.11).sub(x.mul(0.05)).add(2.0)).mul(0.22));
});

// Distant ground rises into low hills so the horizon is land, not an edge.
export function farHeight(x, z) {
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, 150, 420);
  const ridge = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 3.0 + 0.8) * Math.cos(Math.atan2(z, x) * 7.0);
  return heightAt(x, z) + k * (9 + 16 * ridge);
}

export const _f = float;
