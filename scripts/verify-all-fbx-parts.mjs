/**
 * 验证五件 FBX 分件匹配 + 点云构建
 * node scripts/verify-all-fbx-parts.mjs
 */
globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => null,
  }),
};

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ARTIFACTS } from '../src/data/artifacts.js';
import { getDeconstructConfig } from '../src/scene/deconstructConfigs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, '../public/models');
const loader = new FBXLoader();

function findFbxPartMeshes(modelRoot, groupMatch) {
  const key = groupMatch.toLowerCase();
  let matched = null;
  modelRoot.traverse((obj) => {
    if (matched || !obj.isGroup) return;
    const name = (obj.name || '').toLowerCase();
    if (name.includes(key)) matched = obj;
  });
  if (!matched) {
    modelRoot.traverse((obj) => {
      if (matched || !obj.isMesh) return;
      const name = (obj.name || '').toLowerCase();
      if (name.includes(key)) matched = obj;
    });
  }
  const meshes = [];
  if (matched) {
    matched.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj.name);
    });
  }
  return { matched: matched?.name ?? null, meshes };
}

for (const artifact of ARTIFACTS) {
  const fileName = decodeURIComponent(artifact.modelPath.replace(/^\/models\//, ''));
  const fbxPath = path.join(modelsDir, fileName);
  const buf = fs.readFileSync(fbxPath);
  const fbx = loader.parse(buf.buffer, modelsDir);

  const container = new THREE.Group();
  container.name = 'model-container';
  const wrapper = new THREE.Group();
  wrapper.name = artifact.id;
  wrapper.add(fbx);
  container.add(wrapper);

  const cfg = getDeconstructConfig(artifact.id);
  console.log(`\n=== ${artifact.name} (${fileName}) ===`);
  for (const partKey of Object.keys(cfg.parts ?? {})) {
    const hit = findFbxPartMeshes(wrapper, partKey);
    console.log(`  part "${partKey}" → ${hit.matched ? `✓ ${hit.matched}` : '✗ 未匹配'}`);
  }
}
