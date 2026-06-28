/**
 * 本地诊断脚本：用占位几何体验证 PointCloudFromModel 日志输出
 * 运行: node scripts/diagnose-pointcloud.mjs
 */
import * as THREE from 'three';
import { PointCloudFromModel } from '../src/scene/PointCloudFromModel.js';
import { createPlaceholderModel } from '../src/scene/PlaceholderFactory.js';

function fitGroup(group, targetSize = 3) {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  group.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  group.scale.setScalar(maxDim > 0 ? targetSize / maxDim : 1);
  group.updateWorldMatrix(true, true);
}

console.log('=== PointCloud 诊断脚本 ===\n');

const container = new THREE.Group();
container.name = 'model-container';

const model = createPlaceholderModel('fuhao-xiao-zun');
fitGroup(model);
container.add(model);

const pc = new PointCloudFromModel();
const ok = pc.buildFromModel(model, container, 'fuhao-xiao-zun');

if (ok) {
  container.add(pc.points);
  pc.logSceneAttachment({ getObjectByName: (n) => container.getObjectByName(n) });

  pc.setDeconstructState(1);
  for (let i = 0; i < 60; i++) {
    pc.update(1 / 60);
  }
}

console.log('\n=== 诊断完成 buildOk:', ok, '===');
