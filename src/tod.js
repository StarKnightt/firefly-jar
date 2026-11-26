// Time of day: 0 = golden hour, ~0.3 sunset, ~0.55 blue hour, 1 = soft blue night.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

const C = (hex) => new THREE.Color(hex);

// Every key is authored by eye against reference photos of Midwest summer dusk.
const KEYS = [
  { t: 0.00, sunElev: 8.5, sunCol: C(0xffb061), sunInt: 3.4, zenith: C(0x3f73bd), horizon: C(0xf7cd92), mid: C(0xcfd6c4), glow: C(0xffa64d), glowAmt: 1.00,
    hemiSky: C(0xa9bfe6), hemiGnd: C(0x7a6238), hemiInt: 0.95, fog: C(0xe9c49a), fogDen: 0.0030, stars: 0.0, moon: 0.0, exposure: 1.00, cloudLit: C(0xffd9a0), cloudDark: C(0xb98f7a), trans: 1.0 },
  { t: 0.16, sunElev: 4.5, sunCol: C(0xff9a4a), sunInt: 3.0, zenith: C(0x3a66ad), horizon: C(0xf8b877), mid: C(0xd9c9a8), glow: C(0xff8f40), glowAmt: 1.15,
    hemiSky: C(0xa3b4dd), hemiGnd: C(0x7a5a36), hemiInt: 0.85, fog: C(0xeab384), fogDen: 0.0034, stars: 0.0, moon: 0.0, exposure: 1.02, cloudLit: C(0xffc184), cloudDark: C(0xa67c78), trans: 1.0 },
  { t: 0.32, sunElev: 0.4, sunCol: C(0xff6f34), sunInt: 1.9, zenith: C(0x33549b), horizon: C(0xf59a62), mid: C(0xd8a98e), glow: C(0xff6a35), glowAmt: 1.25,
    hemiSky: C(0x93a0d2), hemiGnd: C(0x6d4f3a), hemiInt: 0.74, fog: C(0xdd9274), fogDen: 0.0040, stars: 0.02, moon: 0.0, exposure: 1.06, cloudLit: C(0xff8f66), cloudDark: C(0x7c6282), trans: 0.8 },
  { t: 0.46, sunElev: -4.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x263f85), horizon: C(0xdb7f78), mid: C(0xa9789e), glow: C(0xf2683f), glowAmt: 1.00,
    hemiSky: C(0x7c88c8), hemiGnd: C(0x54465a), hemiInt: 0.62, fog: C(0xa0789a), fogDen: 0.0050, stars: 0.14, moon: 0.0, exposure: 1.12, cloudLit: C(0xf07a78), cloudDark: C(0x4c4a7c), trans: 0.25 },
  { t: 0.62, sunElev: -9.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x18295f), horizon: C(0x8f6a9a), mid: C(0x5d5a9a), glow: C(0xc45a58), glowAmt: 0.60,
    hemiSky: C(0x5f6fb6), hemiGnd: C(0x383a5c), hemiInt: 0.52, fog: C(0x5d5e94), fogDen: 0.0052, stars: 0.45, moon: 0.45, exposure: 1.20, cloudLit: C(0x8c6a9c), cloudDark: C(0x2b3160), trans: 0.0 },
  { t: 0.80, sunElev: -14.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x0e1b47), horizon: C(0x41508f), mid: C(0x263a78), glow: C(0x6a5a92), glowAmt: 0.30,
    hemiSky: C(0x4b5fae), hemiGnd: C(0x262d52), hemiInt: 0.46, fog: C(0x2f3d73), fogDen: 0.0052, stars: 0.85, moon: 0.80, exposure: 1.28, cloudLit: C(0x4d5a96), cloudDark: C(0x18214a), trans: 0.0 },
  { t: 1.00, sunElev: -18.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x0a1438), horizon: C(0x2c3c78), mid: C(0x17255a), glow: C(0x44508a), glowAmt: 0.20,
    hemiSky: C(0x4458a8), hemiGnd: C(0x1f2648), hemiInt: 0.44, fog: C(0x243262), fogDen: 0.0050, stars: 1.0, moon: 1.0, exposure: 1.32, cloudLit: C(0x3c4a86), cloudDark: C(0x121a40), trans: 0.0 },
];

export const SUN_AZ = Math.atan2(0.30, -1.0); // direction the sun sits in, xz plane (west, a touch south)
export const MOON_DIR = new THREE.Vector3(0.52, 0.62, 0.58).normalize();
export const MOON_COL = new THREE.Color(0x9fb6ff);

// Uniforms shared by every material in the world.
export const U = {
  tod: uniform(0),
  sunDir: uniform(new THREE.Vector3(-1, 0.15, 0.3).normalize()),
  sunCol: uniform(new THREE.Color()),
  sunInt: uniform(1),
  lightDir: uniform(new THREE.Vector3(-1, 0.15, 0.3).normalize()), // sun, then the moon
  lightCol: uniform(new THREE.Color()),
  zenith: uniform(new THREE.Color()),
  horizon: uniform(new THREE.Color()),
  mid: uniform(new THREE.Color()),
  glow: uniform(new THREE.Color()),
  glowAmt: uniform(1),
  fogCol: uniform(new THREE.Color()),
  fogDen: uniform(0.004),
  stars: uniform(0),
  starBoost: uniform(0), // the ending
  moon: uniform(0),
  cloudLit: uniform(new THREE.Color()),
  cloudDark: uniform(new THREE.Color()),
  trans: uniform(1),
  ambient: uniform(new THREE.Color()),
  time: uniform(0),
  camPos: uniform(new THREE.Vector3()),
  jarPos: uniform(new THREE.Vector3(0, 1, 0)),
  jarCol: uniform(new THREE.Color(0xffd27a)),
  jarInt: uniform(0),
};

const tmp = { a: new THREE.Color(), b: new THREE.Color() };
const lerp = THREE.MathUtils.lerp;

export class TimeOfDay {
  constructor() {
    this.value = 0;
    this.state = { sunElev: 8, sunInt: 1, hemiInt: 1, exposure: 1, moon: 0, stars: 0, fogDen: 0.004, trans: 1,
      sunCol: new THREE.Color(), hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(), fog: new THREE.Color() };
    this.sunDir = new THREE.Vector3();
    this.set(0);
  }

  set(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    this.value = t;
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    let k = (t - a.t) / (b.t - a.t);
    k = k * k * (3 - 2 * k);
    const s = this.state;
    const col = (key, target) => target.copy(a[key]).lerp(b[key], k);
    const num = (key) => lerp(a[key], b[key], k);

    s.sunElev = num('sunElev'); s.sunInt = num('sunInt'); s.hemiInt = num('hemiInt'); s.exposure = num('exposure');
    s.moon = num('moon'); s.stars = num('stars'); s.fogDen = num('fogDen'); s.trans = num('trans');
    col('sunCol', s.sunCol); col('hemiSky', s.hemiSky); col('hemiGnd', s.hemiGnd); col('fog', s.fog);

    const el = THREE.MathUtils.degToRad(s.sunElev);
    this.sunDir.set(Math.cos(SUN_AZ) * Math.cos(el), Math.sin(el), Math.sin(SUN_AZ) * Math.cos(el)).normalize();

    U.tod.value = t;
    U.sunDir.value.copy(this.sunDir);
    U.sunCol.value.copy(s.sunCol);
    U.sunInt.value = s.sunInt;
    col('zenith', U.zenith.value); col('horizon', U.horizon.value); col('mid', U.mid.value); col('glow', U.glow.value);
    col('cloudLit', U.cloudLit.value); col('cloudDark', U.cloudDark.value);
    U.glowAmt.value = num('glowAmt');
    U.fogCol.value.copy(s.fog);
    U.fogDen.value = s.fogDen;
    U.stars.value = s.stars;
    U.moon.value = s.moon;
    U.trans.value = s.trans;
    U.ambient.value.copy(s.hemiSky).multiplyScalar(s.hemiInt);

    // One shadow-casting key light: the sun until it sets, then the moon.
    // They swap while both are at zero so the change is never visible.
    const moonInt = 0.62 * s.moon;
    if (s.sunInt > 0.001) {
      U.lightDir.value.copy(this.sunDir);
      U.lightCol.value.copy(s.sunCol).multiplyScalar(s.sunInt);
    } else {
      U.lightDir.value.copy(MOON_DIR);
      U.lightCol.value.copy(MOON_COL).multiplyScalar(moonInt);
    }
    return s;
  }
}
