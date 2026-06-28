import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** 棚拍/室内 HDRI 路径（将 .hdr 文件放到 public/hdr/studio.hdr） */
const HDR_STUDIO_PATH = '/hdr/studio.hdr';

/**
 * 加载 IBL 环境贴图，供 PBR 金属反射使用。
 * 优先加载 HDRI；若文件不存在则回退到 RoomEnvironment 程序化环境。
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @returns {Promise<THREE.Texture>}
 */
export async function loadSceneEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let envMap = null;
  let source = 'unknown';

  try {
    const hdrTexture = await new Promise((resolve, reject) => {
      new RGBELoader().load(HDR_STUDIO_PATH, resolve, undefined, reject);
    });
    envMap = pmrem.fromEquirectangular(hdrTexture).texture;
    hdrTexture.dispose();
    source = 'hdri';
    console.log('[Environment] 已加载 HDRI 环境贴图:', HDR_STUDIO_PATH);
  } catch (err) {
    console.warn(
      '[Environment] HDR 未找到或加载失败，回退 RoomEnvironment 程序化环境:',
      err.message
    );
    const roomScene = new RoomEnvironment(renderer);
    envMap = pmrem.fromScene(roomScene, 0.04).texture;
    roomScene.dispose?.();
    source = 'room';
    console.log('[Environment] 使用 RoomEnvironment 程序化环境');
  }

  pmrem.dispose();

  // 写入 scene.environment → 所有 MeshStandardMaterial 自动获得 IBL 反射
  scene.environment = envMap;

  return { envMap, source };
}
