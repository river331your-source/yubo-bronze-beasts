import * as THREE from 'three';

/**
 * 青铜 PBR 材质参数
 * 出土态：哑光青绿铜锈，适度金属感 + 环境反射
 */

/** 出土态 — 青绿铜锈 */
export const EXCAVATION_PBR = {
  color: 0x4a6b5c,
  metalness: 0.35,
  roughness: 0.72,
  envMapIntensity: 0.8,
};

/**
 * 初铸态 — 吉金明亮（材质还原 Shader 完成后可切换至此参数）
 * color:       0xC9A84C  吉金黄铜
 * metalness:   0.95      强金属感
 * roughness:   0.25      打磨光亮
 * envMapIntensity: 1.2   环境高光更明显
 */
// export const CAST_PBR = {
//   color: 0xc9a84c,
//   metalness: 0.95,
//   roughness: 0.25,
//   envMapIntensity: 1.2,
// };

/**
 * 创建出土态青铜 MeshStandardMaterial
 * @param {THREE.Texture|null} envMap 环境贴图（也可仅依赖 scene.environment）
 */
export function createExcavationBronzeMaterial(envMap = null) {
  return new THREE.MeshStandardMaterial({
    color: EXCAVATION_PBR.color,
    metalness: EXCAVATION_PBR.metalness,
    roughness: EXCAVATION_PBR.roughness,
    envMapIntensity: EXCAVATION_PBR.envMapIntensity,
    envMap: envMap ?? undefined,
  });
}

/** 将出土态 PBR 参数应用到模型所有 Mesh */
export function applyBronzePBRToModel(root, envMap = null) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    if (child.geometry && !child.geometry.attributes.normal) {
      child.geometry.computeVertexNormals();
    }

    const mat = createExcavationBronzeMaterial(envMap);
    child.material = Array.isArray(child.material)
      ? child.material.map(() => mat.clone())
      : mat;
  });
}
