// Ground: rolling meadow that rises into distant hills.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, float, positionWorld, normalWorld, texture, mix, smoothstep, saturate, length, cameraPosition } from 'three/tsl';
import { farHeight } from './layout.js';
import { patchNoise, yardMask, dirtMask, jarPool, porchPool, vnoise, GRASS_LUSH, GRASS_DRY, GRASS_ROOT } from './common.js';

export function createTerrain(tex) {
  // Dense in the middle where the player walks, coarse out at the hills.
  const SIZE = 1400, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Warp the grid so most vertices sit near the centre.
    let x = pos.getX(i) / (SIZE / 2), z = pos.getZ(i) / (SIZE / 2);
    const wx = Math.sign(x) * Math.pow(Math.abs(x), 2.2) * (SIZE / 2);
    const wz = Math.sign(z) * Math.pow(Math.abs(z), 2.2) * (SIZE / 2);
    pos.setXYZ(i, wx, farHeight(wx, wz), wz);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertNodeMaterial();
  const xz = positionWorld.xz;

  mat.colorNode = Fn(() => {
    const dist = length(positionWorld.sub(cameraPosition));
    const near = texture(tex.groundDiff, xz.mul(0.31)).rgb;
    const far = texture(tex.groundDiff, xz.mul(0.043).add(0.37)).rgb;
    const t = mix(near, far, smoothstep(6.0, 40.0, dist));
    const lum = t.r.mul(0.3).add(t.g.mul(0.5)).add(t.b.mul(0.2));

    const patch = patchNoise(xz);
    // What the grass standing on this spot looks like from above; the far
    // field has no blades, so the ground has to carry the same colour.
    const meadow = mix(vec3(GRASS_LUSH.r, GRASS_LUSH.g, GRASS_LUSH.b), vec3(GRASS_DRY.r, GRASS_DRY.g, GRASS_DRY.b), patch).mul(0.62);
    const soilUnder = mix(vec3(GRASS_ROOT.r, GRASS_ROOT.g, GRASS_ROOT.b).mul(0.75), t.mul(vec3(0.42, 0.55, 0.26)), 0.22);
    const underGrass = mix(soilUnder, meadow, smoothstep(14.0, 70.0, dist));

    const lawn = mix(vec3(0.20, 0.33, 0.10), vec3(0.30, 0.40, 0.14), vnoise(xz.mul(0.9))).mul(lum.mul(1.6).add(0.35));
    const dirt = mix(vec3(0.33, 0.24, 0.15), vec3(0.47, 0.36, 0.24), vnoise(xz.mul(2.3))).mul(lum.mul(1.3).add(0.45));

    // Far crop fields: broad strips of hay and corn beyond the fence line.
    const fieldBand = vnoise(vec2(xz.x.mul(0.004).add(xz.y.mul(0.011)), xz.x.mul(0.002))).mul(0.5)
      .add(vnoise(xz.mul(0.006).add(40.0)).mul(0.5));
    const crops = mix(vec3(0.42, 0.40, 0.17), vec3(0.20, 0.33, 0.13), smoothstep(0.38, 0.62, fieldBand));
    const farBlend = smoothstep(90.0, 190.0, length(xz));

    const base = mix(underGrass, lawn, yardMask(xz)).toVar();
    base.assign(mix(base, dirt, dirtMask(xz)));
    base.assign(mix(base, crops, farBlend));
    return base;
  })();

  mat.emissiveNode = Fn(() => {
    const albedo = vec3(0.2, 0.17, 0.085);
    return albedo.mul(jarPool(positionWorld)).mul(0.6).add(porchPool(positionWorld).mul(vec3(0.2, 0.19, 0.11)).mul(1.5));
  })();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export const _s = saturate;
