// Sky dome: gradient, sun and afterglow, wispy lit clouds, stars and moon, all in TSL.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, positionWorld, cameraPosition, normalize, dot, pow, mix, smoothstep, exp, abs, max,
  saturate, floor, fract, sin, length, mx_fractal_noise_float, mx_noise_float, fog, densityFogFactor,
} from 'three/tsl';
import { U, MOON_DIR } from '../tod.js';

const moonDir = vec3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z);

// Haze colour along a view direction. The sky's horizon and the scene fog both
// use it, so distant land dissolves into exactly the colour behind it.
export const hazeColor = /*@__PURE__*/ Fn(([dir]) => {
  const flat = normalize(vec3(dir.x, 0.0, dir.z));
  const sunFlat = normalize(vec3(U.sunDir.x, 0.0, U.sunDir.z));
  const toward = saturate(dot(flat, sunFlat).mul(0.5).add(0.5));
  const warm = pow(toward, 3.0).mul(U.glowAmt);
  return mix(U.fogCol, U.glow, saturate(warm.mul(0.62)));
});

const hash3 = /*@__PURE__*/ Fn(([p]) => {
  const q = fract(p.mul(vec3(0.1031, 0.1030, 0.0973)));
  const r = q.add(dot(q, q.yxz.add(33.33)));
  return fract(r.x.add(r.y).mul(r.z));
});

export function createSky() {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });

  mat.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const h = dir.y;
    const up = saturate(h);

    // Base gradient, horizon haze into zenith.
    const haze = hazeColor(dir);
    const horizonCol = mix(U.horizon, haze, 0.55);
    // Three stops, so warm horizon and blue zenith never mix straight into mauve.
    const col = mix(mix(horizonCol, U.mid, smoothstep(0.0, 0.2, up)), U.zenith, smoothstep(0.06, 0.62, up)).toVar();
    // Below the horizon the dome is just haze; terrain covers nearly all of it.
    col.assign(mix(col, haze, smoothstep(0.02, -0.06, h)));

    // Sun: wide warm scatter, tight corona, disc.
    const sd = saturate(dot(dir, U.sunDir));
    const sunUp = smoothstep(-0.11, 0.02, U.sunDir.y);
    const scatter = pow(sd, 7.0).mul(0.22).add(pow(sd, 60.0).mul(0.45)).add(pow(sd, 700.0).mul(1.4));
    col.addAssign(U.sunCol.mul(scatter).mul(U.glowAmt).mul(mix(0.35, 1.0, sunUp)));
    const disc = smoothstep(0.99990, 0.99996, sd).mul(smoothstep(-0.012, 0.01, h));
    col.addAssign(mix(U.sunCol, vec3(1.0, 0.86, 0.6), 0.45).mul(disc).mul(22.0).mul(U.sunInt.min(1.0)));

    // Afterglow band hugging the horizon where the sun went down.
    const flat = normalize(vec3(dir.x, 0.0, dir.z));
    const sunFlat = normalize(vec3(U.sunDir.x, 0.0, U.sunDir.z));
    const az = saturate(dot(flat, sunFlat).mul(0.5).add(0.5));
    const band = exp(abs(h).mul(-11.0)).mul(pow(az, 2.2));
    col.addAssign(U.glow.mul(band).mul(0.8).mul(U.glowAmt));

    // Clouds: stretched cirrus on a plane high above, lit from the sun side.
    const plane = dir.xz.div(h.add(0.16));
    const drift = vec2(U.time.mul(0.0035), U.time.mul(0.0012));
    const cuv = plane.mul(vec2(0.95, 1.2)).add(drift);
    const n = mx_fractal_noise_float(vec3(cuv, U.time.mul(0.004)), 4, 2.1, 0.52).mul(0.5).add(0.5);
    const n2 = mx_noise_float(vec3(cuv.mul(0.37).add(7.3), 1.7)).mul(0.5).add(0.5);
    const cover = smoothstep(0.56, 0.84, n.mul(0.72).add(n2.mul(0.42)));
    const cloudFade = smoothstep(0.015, 0.2, h).mul(smoothstep(1.0, 0.55, h));
    const lit = pow(saturate(dot(dir, U.sunDir).mul(0.5).add(0.5)), 2.0);
    const under = smoothstep(0.84, 0.56, n.mul(0.72).add(n2.mul(0.42)));
    const cloudCol = mix(U.cloudDark, U.cloudLit, saturate(lit.mul(0.6).add(under.mul(0.5)).add(n.mul(0.15))));
    const cloudA = cover.mul(cloudFade).mul(mix(0.7, 0.07, smoothstep(0.5, 0.85, U.tod)));
    col.assign(mix(col, cloudCol, cloudA));

    // Stars: jittered points in a 3D grid on the unit sphere, each with its own twinkle.
    const starVis = U.stars.add(U.starBoost).mul(smoothstep(0.0, 0.22, h)).mul(float(1.0).sub(cloudA));
    const sp = dir.mul(260.0);
    const cell = floor(sp);
    const rnd = hash3(cell);
    const rnd2 = hash3(cell.add(19.7));
    const off = vec3(rnd2, hash3(cell.add(4.1)), hash3(cell.add(9.3))).sub(0.5).mul(0.55);
    const d = length(fract(sp).sub(0.5).sub(off));
    const size = mix(0.055, 0.15, pow(rnd2, 4.0));
    const twinkle = sin(U.time.mul(mix(1.5, 4.5, rnd2)).add(rnd.mul(40.0))).mul(0.28).add(0.78);
    const star = smoothstep(size, 0.0, d).mul(smoothstep(0.70, 0.705, rnd)).mul(twinkle);
    const starCol = mix(vec3(1.0, 0.86, 0.70), vec3(0.74, 0.86, 1.0), rnd2);
    col.addAssign(starCol.mul(star).mul(starVis).mul(mix(0.5, 9.0, pow(rnd2, 5.0))));
    // A faint milky band so the night sky has structure, not just dots.
    const mw = mx_noise_float(dir.mul(3.2).add(11.0)).mul(0.5).add(0.5);
    const bandAxis = normalize(vec3(0.35, 0.5, -0.8));
    const mwBand = exp(pow(dot(dir, bandAxis), 2.0).mul(-34.0));
    col.addAssign(vec3(0.16, 0.19, 0.30).mul(mwBand).mul(mw.mul(mw)).mul(starVis).mul(0.085).mul(hash3(floor(dir.mul(420.0))).mul(0.9).add(0.55)));

    // Moon: small soft disc with a wide halo.
    const md = saturate(dot(dir, moonDir));
    const moonDisc = smoothstep(0.99972, 0.99980, md);
    const maria = mx_noise_float(dir.sub(moonDir).mul(95.0).add(3.0)).mul(0.5).add(0.5);
    const face = mix(0.55, 1.0, smoothstep(0.35, 0.65, maria)).mul(mix(0.75, 1.0, smoothstep(0.99972, 0.99990, md)));
    const moonHalo = pow(md, 6000.0).mul(0.35).add(pow(md, 500.0).mul(0.06));
    col.addAssign(vec3(0.86, 0.9, 1.0).mul(moonDisc.mul(face).mul(2.2).add(moonHalo)).mul(U.moon).mul(float(1.0).sub(cloudA.mul(0.6))));

    return col;
  })();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

// Scene fog whose colour follows the same haze function as the sky's horizon.
export function createFogNode() {
  const dir = normalize(positionWorld.sub(cameraPosition));
  return fog(hazeColor(dir), densityFogFactor(U.fogDen));
}

export const _unused = max;
