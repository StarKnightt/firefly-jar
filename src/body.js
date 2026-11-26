// The rest of you: look down and there is a kid there, in a striped T-shirt, shorts and sneakers.
// It turns with you but does not tilt with your head, and the legs swing as you walk.
import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, positionLocal, positionWorld, normalWorld, sin, mix, smoothstep, fract } from 'three/tsl';
import { jarLight } from './world/common.js';

export function createBody(game) {
  const body = new THREE.Group();
  body.name = 'body';
  game.scene.add(body);
  const lit = (albedo) => jarLight(positionWorld, normalWorld, float(0.35)).min(vec3(1.2)).mul(albedo).mul(0.9);

  // T-shirt: broad red and cream stripes, a little faded.
  const shirt = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  shirt.colorNode = Fn(() => {
    const stripe = smoothstep(0.46, 0.54, fract(positionLocal.y.mul(11.0)));
    const weave = sin(positionLocal.x.mul(900.0)).mul(sin(positionLocal.y.mul(900.0))).mul(0.03).add(0.97);
    return vec4(mix(vec3(0.62, 0.13, 0.12), vec3(0.8, 0.76, 0.66), stripe).mul(weave), 1.0);
  })();
  shirt.emissiveNode = lit(vec3(0.6, 0.4, 0.3));
  const denim = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, color: 0x3b5273 });
  denim.emissiveNode = lit(vec3(0.2, 0.28, 0.4));
  const skin = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, color: 0xc98a68 });
  skin.emissiveNode = lit(vec3(0.75, 0.5, 0.38));
  const canvas = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, color: 0xb9b3a4 });
  canvas.emissiveNode = lit(vec3(0.6, 0.58, 0.5));
  const rubber = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, color: 0x8c2a22 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.2, 6, 18), shirt);
  torso.scale.set(1.12, 1, 0.78);
  torso.position.set(0, 0.69, 0.14);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.112, 0.17, 18), denim);
  hips.scale.set(1.08, 1, 0.8);
  hips.position.set(0, 0.47, 0.14);
  body.add(torso, hips);

  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.066, 0.44, 0.13);
    const short = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.07, 0.15, 14), denim);
    short.position.y = -0.06;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 12), skin);
    leg.position.y = -0.23;
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.11, 4, 10), canvas);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1, 1, 0.75);
    shoe.position.set(0, -0.405, -0.045);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), rubber);
    toe.scale.set(1, 0.62, 0.8);
    toe.position.set(0, -0.415, -0.115);
    hip.add(short, leg, shoe, toe);
    body.add(hip);
    legs.push(hip);
  }
  body.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; } });

  return {
    group: body,
    update() {
      const p = game.player;
      body.position.set(p.pos.x, p.pos.y, p.pos.z);
      body.rotation.y = p.yaw;
      // In the ending the camera looks at the sky; the body stays put under it.
      const swing = Math.sin(p.bob) * 0.42 * Math.min(1, p.speed);
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      torso.rotation.z = Math.sin(p.bob) * 0.02 * Math.min(1, p.speed);
    },
  };
}
