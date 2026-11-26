import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = import.meta.env.BASE_URL + 'assets/';

export async function loadAssets(renderer, tier, onProgress = () => {}) {
  // Twenty files in all; each one that lands is reported.
  let landed = 0;
  const TOTAL = 20;
  const tick = (v) => { onProgress(++landed / TOTAL); return v; };
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  const aniso = Math.min(8, renderer.getMaxAnisotropy?.() || 4);

  const texture = async (path, { srgb = false, repeat = true } = {}) => {
    const t = await tl.loadAsync(base + path);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    tick();
    return t;
  };
  const set = async (dir) => {
    const [diff, nor, rough] = await Promise.all([
      texture(`tex/${dir}/diffuse.jpg`, { srgb: true }),
      texture(`tex/${dir}/nor_gl.jpg`),
      texture(`tex/${dir}/rough.jpg`),
    ]);
    return { diff, nor, rough };
  };
  const model = (path) => gl.loadAsync(base + path).then((g) => tick(g.scene));

  const [ground, bark, planks, greyPlanks, roof, leaf, handL, handR, tyre, chair] = await Promise.all([
    set('leafy_grass'), set('jolcham_oak_bark_01'), set('weathered_planks'), set('wood_planks_grey'), set('roof_slates_02'),
    texture('tex/oak/leaf.png', { srgb: true, repeat: false }),
    model('models/hands/left.glb'), model('models/hands/right.glb'),
    model('models/old_tyre/old_tyre.gltf'), model('models/Rockingchair_01/Rockingchair_01.gltf'),
  ]);

  return {
    tex: { groundDiff: ground.diff, groundNor: ground.nor, bark, planks, greyPlanks, roof, leaf },
    models: { handL, handR, tyre, chair },
    tier,
  };
}
