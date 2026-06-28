/**
 * 验证妇好鸮尊 FBX body/lid 分件 + 点云构建
 * node scripts/verify-fbx-parts.mjs
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { PointCloudFromModel } from '../src/scene/PointCloudFromModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '../public/models/妇好鸮尊.fbx');

function logTree(obj, depth = 0) {
  const pad = '  '.repeat(depth);
  const type = obj.isGroup ? 'Group' : obj.isMesh ? 'Mesh' : obj.type;
  console.log(`${pad}${type} "${obj.name}"`);
  obj.children?.forEach((c) => logTree(c, depth + 1));
}

const buffer = fs.readFileSync(fbxPath);
const loader = new FBXLoader();
const fbx = loader.parse(buffer.buffer, path.dirname(fbxPath));

console.log('=== FBX 层级 ===');
logTree(fbx);

const container = new THREE.Group();
container.name = 'model-container';
const wrapper = new THREE.Group();
wrapper.name = 'fuhao-xiao-zun';
wrapper.add(fbx);
container.add(wrapper);

const pc = new PointCloudFromModel();
const ok = pc.buildFromModel(wrapper, container, 'fuhao-xiao-zun');
console.log('\n=== 点云构建 ===', ok ? '成功' : '失败', '| 粒子', pc.rnd?.length ?? 0);
