/**
 * 诊断蟠龙纹铜盉 spout 方向
 * node scripts/diagnose-panlong-spout.mjs
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = path.join(__dirname, '../public/models/蟠龙纹铜盉.fbx');

function findGroup(root, key) {
  let matched = null;
  root.traverse((obj) => {
    if (matched || !obj.isGroup) return;
    if ((obj.name || '').toLowerCase().includes(key)) matched = obj;
  });
  return matched;
}

function groupCenter(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return box.getCenter(new THREE.Vector3());
}

const buffer = fs.readFileSync(fbxPath);
const fbx = new FBXLoader().parse(buffer.buffer, path.dirname(fbxPath));

console.log('=== FBX 层级 ===');
fbx.traverse((obj) => {
  const t = obj.isGroup ? 'Group' : obj.isMesh ? 'Mesh' : obj.type;
  console.log(`${'  '.repeat(obj.parent === fbx ? 0 : 1)}${t} "${obj.name}"`);
});

const modelCenter = groupCenter(fbx);
const spout = findGroup(fbx, 'spout');
const body = findGroup(fbx, 'body');

if (spout) {
  const sc = groupCenter(spout);
  const delta = sc.clone().sub(modelCenter);
  console.log('\n模型中心:', modelCenter.toArray().map((v) => v.toFixed(3)));
  console.log('spout 中心:', sc.toArray().map((v) => v.toFixed(3)));
  console.log('spout 相对偏移 (应沿此方向外伸):', delta.toArray().map((v) => v.toFixed(3)));
  console.log('建议 dir 符号:', [
    Math.sign(delta.x) || 0,
    delta.y > 0 ? 1 : delta.y < 0 ? -1 : 0,
    Math.sign(delta.z) || 0,
  ]);
}

if (body) {
  const bc = groupCenter(body);
  console.log('body 中心:', bc.toArray().map((v) => v.toFixed(3)));
}
