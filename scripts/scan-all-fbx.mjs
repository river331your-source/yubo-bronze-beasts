/**
 * 扫描 public/models 下全部 FBX 层级与包围盒
 * node scripts/scan-all-fbx.mjs
 */
globalThis.window = { innerWidth: 1920, innerHeight: 1080 };

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/models');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.fbx')).sort();

function logTree(obj, depth = 0) {
  const pad = '  '.repeat(depth);
  const type = obj.isGroup ? 'Group' : obj.isMesh ? 'Mesh' : obj.type;
  if (obj.name || obj.isMesh) console.log(`${pad}${type} "${obj.name}"`);
  obj.children?.forEach((c) => logTree(c, depth + 1));
}

for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const fbx = new FBXLoader().parse(buf.buffer, dir);
  console.log(`=== ${f} ===`);
  logTree(fbx);
  const box = new THREE.Box3().setFromObject(fbx);
  const size = box.getSize(new THREE.Vector3());
  console.log(`bbox size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}\n`);
}
