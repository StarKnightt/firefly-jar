// Time of day: 0 = golden hour, ~0.3 sunset, ~0.55 blue hour, 1 = soft blue night.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

const C = (hex) => new THREE.Color(hex);

// Every key is authored by eye against reference photos of Midwest summer dusk.
const KEYS = [
  { t: 0.00, sunElev: 6.5, sunCol: C(0xffa552), sunInt: 3.7, zenith: C(0x6a8cb6), horizon: C(0xffb565), mid: C(0xd9ccac), glow: C(0xff9a42), glowAmt: 1.00,
    hemiSky: C(0xa9bfe6), hemiGnd: C(0x7a6238), hemiInt: 0.60, fog: C(0xf0bb85), fogDen: 0.0030, stars: 0.0, moon: 0.0, exposure: 0.96, cloudLit: C(0xffcf8f), cloudDark: C(0xb08a78), trans: 1.0 },
  { t: 0.18, sunElev: 3.3, sunCol: C(0xff8c3d), sunInt: 3.3, zenith: C(0x5c7dac), horizon: C(0xff9c52), mid: C(0xd8b792), glow: C(0xff8338), glowAmt: 1.15,
    hemiSky: C(0xa0b0dc), hemiGnd: C(0x775636), hemiInt: 0.54, fog: C(0xeea673), fogDen: 0.0034, stars: 0.0, moon: 0.0, exposure: 0.98, cloudLit: C(0xffb777), cloudDark: C(0xa07676), trans: 1.0 },
  { t: 0.34, sunElev: 0.3, sunCol: C(0xff6a30), sunInt: 1.7, zenith: C(0x435f9a), horizon: C(0xf48a50), mid: C(0xb89a9a), glow: C(0xff6431), glowAmt: 1.20,
    hemiSky: C(0x8d98c8), hemiGnd: C(0x66493a), hemiInt: 0.48, fog: C(0xd38a6c), fogDen: 0.0040, stars: 0.02, moon: 0.0, exposure: 1.04, cloudLit: C(0xf58a62), cloudDark: C(0x6f5c78), trans: 0.8 },
  // Blue hour: the sky holds a blue-violet for a long while, the last warmth only along the horizon.
  { t: 0.48, sunElev: -4.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x2a3f7e), horizon: C(0x8a7596), mid: C(0x4a5b9a), glow: C(0xe0683e), glowAmt: 0.80,
    hemiSky: C(0x7083c4), hemiGnd: C(0x40384a), hemiInt: 0.40, fog: C(0x5a628e), fogDen: 0.0046, stars: 0.14, moon: 0.0, exposure: 1.10, cloudLit: C(0xa8708a), cloudDark: C(0x35365c), trans: 0.25 },
  { t: 0.64, sunElev: -9.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x1b2a60), horizon: C(0x46508c), mid: C(0x2e3f7e), glow: C(0x9a5650), glowAmt: 0.32,
    hemiSky: C(0x6276c2), hemiGnd: C(0x232a48), hemiInt: 0.30, fog: C(0x333f70), fogDen: 0.0048, stars: 0.5, moon: 0.4, exposure: 1.12, cloudLit: C(0x4a4a72), cloudDark: C(0x171c38), trans: 0.0 },
  // Night: dark, but a soft blue you can still see the meadow by.
  { t: 0.82, sunElev: -14.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x101c44), horizon: C(0x293868), mid: C(0x19295c), glow: C(0x3a3a60), glowAmt: 0.2,
    hemiSky: C(0x6c84cc), hemiGnd: C(0x1a2240), hemiInt: 0.22, fog: C(0x1e2a52), fogDen: 0.0046, stars: 0.9, moon: 0.8, exposure: 1.12, cloudLit: C(0x263258), cloudDark: C(0x0e1430), trans: 0.0 },
  { t: 1.00, sunElev: -18.0, sunCol: C(0xff5a30), sunInt: 0.0, zenith: C(0x0d1838), horizon: C(0x202d5a), mid: C(0x14214e), glow: C(0x2a2e52), glowAmt: 0.15,
    hemiSky: C(0x7088cc), hemiGnd: C(0x182040), hemiInt: 0.20, fog: C(0x1a2548), fogDen: 0.0044, stars: 1.0, moon: 1.0, exposure: 1.12, cloudLit: C(0x222c54), cloudDark: C(0x0c1230), trans: 0.0 },
];

export const SUN_AZ = Math.atan2(0.30, -1.0); // direction the sun sits in, xz plane (west, a touch south)
export const MOON_DIR = new THREE.Vector3(0.62, 0.50, 0.60).normalize();
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
  jarCol: uniform(new THREE.Color(0xffd766)),
  // The nearest few fireflies, so each one can throw a little light on the grass under it.
  flyLights: [0, 1, 2, 3].map(() => uniform(new THREE.Vector4(0, -99, 0, 0))),
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
    const moonInt = 0.42 * s.moon;
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
