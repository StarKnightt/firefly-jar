// What you see of yourself: two small hands around a glass jar, riding with the camera.
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, positionWorld, normalWorld, normalView, cameraPosition, normalize, dot, pow, mix, smoothstep, saturate,
  reflect, exp, abs, uv, sin, floor, fract, positionLocal, uniform, max, length, positionView,
} from 'three/tsl';
import { U } from './tod.js';
import { hazeColor } from './world/sky.js';
import { jarLight } from './world/common.js';

const JAR_R = 0.046, JAR_H = 0.158, NECK_R = 0.037, NECK_Y = 0.137;
const HAND_SCALE = 0.74;

const FINGERS = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};

// Sky colour seen in a reflection: the same gradient the dome draws, without clouds.
const skyReflect = /*@__PURE__*/ Fn(([dir]) => {
  const up = saturate(dir.y);
  const hz = mix(U.horizon, hazeColor(dir), 0.55);
  const sky = mix(mix(hz, U.mid, smoothstep(0.0, 0.2, up)), U.zenith, smoothstep(0.06, 0.62, up));
  const ground = mix(U.fogCol.mul(0.35), vec3(0.08, 0.1, 0.04), 0.5).mul(U.ambient.add(U.lightCol.mul(0.3)));
  return mix(ground, sky, smoothstep(-0.12, 0.06, dir.y));
});

function jarProfile() {
  // (radius, height) outline of a pint mason jar, base to rim.
  const p = [
    [0.0, 0.0], [0.034, 0.0], [0.042, 0.003], [JAR_R, 0.012], [JAR_R, 0.108], [0.0455, 0.118], [0.0425, 0.127], [0.0385, 0.134],
    [NECK_R, NECK_Y], [NECK_R, 0.141], [0.0385, 0.1425], [0.0385, 0.1455], [NECK_R, 0.147], [NECK_R, 0.150], [0.0385, 0.1515], [0.0385, 0.1545], [NECK_R, 0.156], [NECK_R, JAR_H],
  ];
  return p.map(([r, y]) => new THREE.Vector2(r, y));
}

function glassMaterial(side, glowU) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side, fog: false });
  mat.colorNode = Fn(() => {
    const V = normalize(cameraPosition.sub(positionWorld));
    const N = side === THREE.BackSide ? normalWorld.negate() : normalWorld;
    const nv = saturate(abs(dot(N, V)));
    const fres = pow(float(1.0).sub(nv), 2.6);
    const R = reflect(V.negate(), N);
    const env = skyReflect(R);
    // Sun or moon glint, and a soft window-like streak down the shoulder.
    const spec = pow(saturate(dot(R, U.lightDir)), 220.0).mul(9.0).add(pow(saturate(dot(R, U.lightDir)), 24.0).mul(0.35));
    const nvw = normalView;
    const streak = smoothstep(0.42, 0.62, nvw.x).mul(smoothstep(0.86, 0.66, nvw.x)).mul(smoothstep(0.012, 0.03, positionLocal.y)).mul(smoothstep(0.125, 0.105, positionLocal.y));
    const skyLum = U.ambient.mul(0.55).add(U.lightCol.mul(0.25));
    // Light from inside catches in the glass itself, strongest at the edges and the thick base.
    const base = smoothstep(0.02, 0.0, positionLocal.y);
    const inner = U.jarCol.mul(glowU).mul(fres.mul(0.75).add(0.13).add(base.mul(0.5)));
    const tint = vec3(0.80, 0.93, 0.90);
    const col = env.mul(tint).mul(fres.mul(0.9).add(0.07)).add(U.lightCol.mul(spec)).add(skyLum.mul(streak).mul(0.5)).add(inner);
    const alpha = saturate(fres.mul(0.85).add(0.085).add(streak.mul(0.22)).add(spec.mul(0.6)).add(base.mul(0.2)));
    return vec4(col, alpha);
  })();
  return mat;
}

function buildJar(glowU) {
  const group = new THREE.Group();
  group.name = 'jar';
  const lathe = new THREE.LatheGeometry(jarProfile(), 56);
  lathe.computeVertexNormals();
  const back = new THREE.Mesh(lathe, glassMaterial(THREE.BackSide, glowU));
  const front = new THREE.Mesh(lathe, glassMaterial(THREE.FrontSide, glowU));
  back.renderOrder = 10; front.renderOrder = 30;
  group.add(back, front);

  // Zinc screw lid with air holes punched by a nail.
  const lid = new THREE.Group();
  const lidMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.0 });
  lidMat.colorNode = Fn(() => {
    const p = positionLocal;
    const top = smoothstep(0.0195, 0.0205, p.y);
    const ang = fract(p.x.mul(0.0).add(uv().x).mul(46.0));
    const knurl = mix(float(1.0), smoothstep(0.0, 0.5, abs(ang.sub(0.5))).mul(0.5).add(0.62), float(1.0).sub(top));
    // Five holes on top.
    let holes = float(0.0);
    for (const [hx, hz] of [[0, 0], [0.016, 0.007], [-0.012, 0.014], [-0.01, -0.015], [0.013, -0.013]]) {
      holes = max(holes, smoothstep(0.0034, 0.0022, length(vec2(p.x.sub(hx), p.z.sub(hz)))));
    }
    const ring = smoothstep(0.004, 0.0, abs(length(p.xz).sub(0.031))).mul(top).mul(0.25);
    const zinc = mix(vec3(0.56, 0.57, 0.56), vec3(0.42, 0.43, 0.44), fract(sin(dot(floor(p.xz.mul(900.0)), vec2(12.9, 78.2))).mul(43758.5)).mul(0.35));
    return vec4(zinc.mul(knurl).mul(float(1.0).sub(ring)).mul(float(1.0).sub(holes.mul(top).mul(0.93))), 1.0);
  })();
  lidMat.emissiveNode = Fn(() => {
    const V = normalize(cameraPosition.sub(positionWorld));
    const R = reflect(V.negate(), normalWorld);
    const fres = pow(float(1.0).sub(saturate(dot(normalWorld, V))), 3.0);
    return skyReflect(R).mul(fres.mul(0.5).add(0.16)).add(U.jarCol.mul(glowU).mul(0.05));
  })();
  const lidGeo = new THREE.CylinderGeometry(0.0408, 0.0408, 0.021, 46, 1, false);
  lidGeo.translate(0, 0.0105, 0);
  const lidMesh = new THREE.Mesh(lidGeo, lidMat);
  lid.add(lidMesh);
  // Hinge the lid at its back edge so it can tip open.
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, JAR_H - 0.014, -0.0408);
  lid.position.set(0, 0, 0.0408);
  lidPivot.add(lid);
  group.add(lidPivot);
  lidMesh.renderOrder = 31;

  return { group, lidPivot, lid, front, back };
}

function buildHand(root, side) {
  const hand = { root, side, bones: {}, rest: {}, local: {} };
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
  hand.mesh = skinned;
  skinned.frustumCulled = false;
  for (const b of skinned.skeleton.bones) {
    hand.bones[b.name] = b;
    hand.rest[b.name] = new THREE.Matrix4().compose(b.position, b.quaternion, new THREE.Vector3(1, 1, 1));
  }
  // The XR hand skeleton is flat: every joint is a sibling in armature space.
  // Rebuild the finger chains so they can be curled with plain forward kinematics.
  for (const chain of Object.values(FINGERS)) {
    let parent = 'wrist';
    for (const name of chain) {
      hand.local[name] = new THREE.Matrix4().copy(hand.rest[parent]).invert().multiply(hand.rest[name]);
      parent = name;
    }
  }
  const m = new THREE.Matrix4(), r = new THREE.Matrix4(), e = new THREE.Euler(), s = new THREE.Vector3();
  // curls: per finger [metacarpal, proximal, intermediate, distal] flexion in radians, plus spread at the knuckle.
  hand.pose = (curls, spread = {}) => {
    for (const [finger, chain] of Object.entries(FINGERS)) {
      const c = curls[finger] || [0, 0, 0, 0];
      m.copy(hand.rest.wrist);
      chain.forEach((name, i) => {
        m.multiply(hand.local[name]);
        const flex = c[Math.min(i, c.length - 1)] || 0;
        if (i < c.length && (flex || (i === 1 && spread[finger]))) {
          e.set(-flex, i === 1 ? (spread[finger] || 0) : 0, finger === 'thumb' && i === 0 ? (spread.thumbRoll || 0) : 0, 'YXZ');
          m.multiply(r.makeRotationFromEuler(e));
        }
        const b = hand.bones[name];
        m.decompose(b.position, b.quaternion, s);
      });
    }
  };
  return hand;
}

function skinMaterial(glowU) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
  mat.colorNode = Fn(() => {
    const n = fract(sin(dot(floor(positionLocal.mul(900.0)), vec3(12.99, 78.23, 37.72))).mul(43758.5));
    const skin = mix(vec3(0.80, 0.52, 0.40), vec3(0.86, 0.60, 0.47), n.mul(0.25).add(0.5));
    return vec4(skin, 1.0);
  })();
  mat.emissiveNode = Fn(() => {
    const skin = vec3(0.84, 0.50, 0.36);
    const lit = jarLight(positionWorld, normalWorld, float(0.5));
    // Light coming through fingertips and the thin web of the hand glows red.
    const V = normalize(cameraPosition.sub(positionWorld));
    const edge = pow(float(1.0).sub(saturate(dot(normalWorld, V))), 2.0);
    const through = vec3(1.0, 0.25, 0.1).mul(glowU).mul(edge).mul(0.16);
    return skin.mul(lit).mul(0.3).add(through);
  })();
  return mat;
}

export function createRig(game) {
  const { camera, assets } = game;
  const rig = new THREE.Group();
  rig.name = 'rig';
  camera.add(rig);

  const glowU = uniform(0); // how bright the jar is, 0..1ish, drives glass and skin
  const jar = buildJar(glowU);
  const hold = new THREE.Group(); // jar + hands, the thing that sways
  rig.add(hold);
  hold.add(jar.group);

  const skin = skinMaterial(glowU);
  const hands = {};
  for (const side of ['L', 'R']) {
    const src = side === 'L' ? assets.models.handL : assets.models.handR;
    const holder = new THREE.Group();
    holder.add(src);
    const h = buildHand(src, side);
    h.holder = holder;
    h.mesh.material = skin;
    h.mesh.castShadow = false;
    h.mesh.receiveShadow = true;
    hold.add(holder);
    hands[side] = h;

    // Forearm running back out of frame.
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.036, 0.34, 18, 1, true), skin);
    fore.geometry.translate(0, -0.17, 0);
    fore.scale.set(1.0, 1, 0.78);
    h.forearm = fore;
    hold.add(fore);

    // A woven friendship bracelet hides the wrist seam (and belongs on an eight year old).
    const bandMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const hueA = side === 'L' ? vec3(0.78, 0.16, 0.2) : vec3(0.16, 0.5, 0.62);
    const hueB = side === 'L' ? vec3(0.95, 0.74, 0.2) : vec3(0.93, 0.9, 0.82);
    bandMat.colorNode = Fn(() => {
      const st = uv();
      const weave = fract(st.x.mul(26.0).add(st.y.mul(3.0)));
      const zig = smoothstep(0.45, 0.55, abs(fract(st.x.mul(13.0).add(st.y.mul(1.0))).sub(0.5)).mul(2.0));
      return vec4(mix(hueA, hueB, zig).mul(weave.mul(0.35).add(0.7)), 1.0);
    })();
    bandMat.emissiveNode = jarLight(positionWorld, normalWorld, float(0.5)).mul(0.25);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0042, 8, 28), bandMat);
    band.scale.set(1, 0.8, 1.7);
    h.band = band;
    hold.add(band);
  }

  // ---- hold pose (tunable while look-developing) ----
  const P = {
    jar: { x: 0.0, y: -0.222, z: -0.405, rx: 0.2 },
    L: { x: -0.072, y: 0.042, z: 0.05, pitch: 0.25, yaw: -0.2, roll: 0 },
    R: { x: 0.072, y: 0.042, z: 0.05, pitch: 0.25, yaw: 0.2, roll: 0 },
    curl: {
      thumb: [0.15, 0.2, 0.35], index: [0, 0.45, 0.75, 0.5], middle: [0, 0.5, 0.8, 0.5],
      ring: [0, 0.55, 0.85, 0.55], pinky: [0, 0.6, 0.9, 0.6],
    },
    spread: { index: 0.06, middle: 0.0, ring: -0.05, pinky: -0.12, thumb: 0.0, thumbRoll: 0.0 },
  };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const wristW = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const elbow = new THREE.Vector3();

  function applyPose(extra = {}) {
    jar.group.position.set(P.jar.x, P.jar.y, P.jar.z);
    jar.group.rotation.set(P.jar.rx, 0, 0);
    for (const side of ['L', 'R']) {
      const h = hands[side], p = P[side], o = extra[side] || {};
      // Rest: fingers down -Y, palm toward the jar. Turn it so fingers reach forward and the thumb sits on top.
      qa.setFromAxisAngle(X, Math.PI / 2);
      qb.setFromAxisAngle(Y, p.yaw + (o.yaw || 0));
      qc.setFromAxisAngle(X, p.pitch + (o.pitch || 0));
      qd.setFromAxisAngle(Z, p.roll + (o.roll || 0));
      h.holder.quaternion.copy(qd).multiply(qc).multiply(qb).multiply(qa);
      h.holder.scale.setScalar(HAND_SCALE);
      // Jar-relative placement, so the grip follows the jar wherever it is held.
      tmpV.set(p.x + (o.x || 0), p.y + (o.y || 0), p.z + (o.z || 0)).applyEuler(jar.group.rotation).add(jar.group.position);
      // Put the wrist joint (not the model origin) at that point.
      wristW.setFromMatrixPosition(h.rest.wrist).multiplyScalar(HAND_SCALE).applyQuaternion(h.holder.quaternion);
      h.holder.position.copy(tmpV).sub(wristW);
      h.pose(o.curl || P.curl, o.spread || P.spread);

      // Forearm from the wrist back toward where an elbow would be.
      elbow.set((side === 'L' ? -1 : 1) * 0.21, -0.43, 0.02);
      const dir = elbow.clone().sub(tmpV).normalize();
      h.forearm.position.copy(tmpV).addScaledVector(dir, -0.012);
      h.forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      h.band.position.copy(tmpV).addScaledVector(dir, 0.012);
      h.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    }
  }
  applyPose();

  // ---- runtime state ----
  const state = { glow: 0, glowTarget: 0, lid: 0, lidTarget: 0, scoop: 0, scoopDir: new THREE.Vector2(), swayX: 0, swayY: 0, lift: 0, open: 0, bobPhase: 0, flash: 0 };
  const jarWorld = new THREE.Vector3(), mouthWorld = new THREE.Vector3();
  let lastYaw = game.player.yaw, lastPitch = game.player.pitch;

  const api = {
    rig, jar, hands, P, state, applyPose, glowU,
    JAR_R, JAR_H,
    // Local-to-world for things living inside the jar.
    jarMatrixWorld: jar.group.matrixWorld,
    centerWorld(out) { return out.set(0, JAR_H * 0.45, 0).applyMatrix4(jar.group.matrixWorld); },
    mouthWorld(out) { return out.set(0, JAR_H + 0.03, 0).applyMatrix4(jar.group.matrixWorld); },
    setCount(n, goal) { state.glowTarget = n / goal; },
    scoop(sx, sy) { state.scoop = 1; state.scoopDir.set(sx, sy); state.lidTarget = 1; state.lidTimer = 0.42; },
    flash() { state.flash = 1; },
    update(dt) {
      const p = game.player;
      // Lag behind the look direction a touch, like something held rather than bolted on.
      const dyaw = p.yaw - lastYaw, dpitch = p.pitch - lastPitch;
      lastYaw = p.yaw; lastPitch = p.pitch;
      const k = 1 - Math.exp(-dt * 9);
      state.swayX += (THREE.MathUtils.clamp(dyaw * 2.2, -0.06, 0.06) - state.swayX) * k;
      state.swayY += (THREE.MathUtils.clamp(-dpitch * 2.0, -0.05, 0.05) - state.swayY) * k;
      state.bobPhase = p.bob;
      const bob = Math.sin(p.bob * 2) * 0.0045 * p.speed, bobX = Math.sin(p.bob) * 0.006 * p.speed;
      const breathe = Math.sin(game.time * 1.1) * 0.0022;

      state.scoop = Math.max(0, state.scoop - dt * 2.6);
      const sc = Math.sin(Math.min(1, state.scoop) * Math.PI) * 0.9;
      if (state.lidTimer > 0) { state.lidTimer -= dt; if (state.lidTimer <= 0 && !state.open) state.lidTarget = 0; }
      state.lid += (state.lidTarget - state.lid) * (1 - Math.exp(-dt * 16));

      // Portrait screens see more above and below, so bring the jar up into view.
      const aspect = game.camera.aspect;
      const tall = THREE.MathUtils.clamp((1.3 - aspect) / 0.85, 0, 1);
      const yFit = THREE.MathUtils.lerp(0, -0.075, tall), zFit = THREE.MathUtils.lerp(0, -0.05, tall), sFit = THREE.MathUtils.lerp(1, 0.9, tall);

      hold.position.set(
        state.swayX + bobX + state.scoopDir.x * sc * 0.05,
        state.swayY + bob + breathe + sc * 0.035 + state.scoopDir.y * sc * 0.03 + state.lift * 0.17 + yFit - (state.away || 0) * 0.5,
        -sc * 0.06 + zFit - state.lift * 0.06,
      );
      hold.rotation.set(-sc * 0.16 - state.lift * 0.42 + state.swayY * 0.8, state.swayX * 0.9 - state.scoopDir.x * sc * 0.12, -state.swayX * 0.7);
      hold.scale.setScalar(sFit);

      // Lid: tips open for a catch; in the ending it lifts away with the right hand.
      // In the ending the lid comes right off: it pops up, tumbles and drops out of sight.
      if (state.open && !state.lidOff) { state.lidOff = { t: 0, v: new THREE.Vector3(0.16, 0.62, 0.05) }; }
      if (!state.open && state.lidOff) { state.lidOff = null; jar.lid.position.set(0, 0, 0.0408); jar.lid.rotation.set(0, 0, 0); jar.lid.visible = true; }
      if (state.lidOff) {
        const L = state.lidOff;
        L.t += dt;
        L.v.y -= dt * 1.5;
        jar.lid.position.addScaledVector(L.v, dt);
        jar.lid.rotation.x -= dt * 2.4; jar.lid.rotation.z -= dt * 1.7;
        jar.lid.visible = L.t < 2.6;
        jar.lidPivot.rotation.x = 0;
      } else {
        jar.lidPivot.rotation.x = -state.lid * 1.25;
      }

      state.glow += (state.glowTarget - state.glow) * (1 - Math.exp(-dt * 2.5));
      state.flash = Math.max(0, state.flash - dt * 1.8);
      const pulse = 1 + Math.sin(game.time * 2.1) * 0.05 + Math.sin(game.time * 3.7 + 1.0) * 0.035;
      const g = state.glow;
      glowU.value = (Math.pow(g, 0.8) * 1.15 + state.flash * 0.45) * pulse;
      U.jarInt.value = (Math.pow(g, 0.85) * 3.0 + state.flash * 0.8) * pulse * (game.jarBoost ?? 1);

      rig.updateMatrixWorld(true);
      api.centerWorld(jarWorld);
      U.jarPos.value.copy(jarWorld);
    },
  };
  return api;
}

export const _r = [positionView, vec2];
