import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { damp } from './PointCloudCastModel.js';
import {
  getDeconstructConfig,
  DEBUG_GROUP_COLORS,
  DUST_PALETTE,
  DECONSTRUCT_DEFAULTS,
  PARTICLE_COUNT,
} from './deconstructConfigs.js';

const TARGET_HEIGHT = 3;

function smoothstep(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function estimateMeshArea(mesh) {
  const geo = mesh.geometry;
  if (!geo?.attributes?.position) return 1;
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const size = box.getSize(new THREE.Vector3());
  return size.x * size.y + size.y * size.z + size.z * size.x + 1e-6;
}

function createGlowTexture(size = 64) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.sqrt((x - half) ** 2 + (y - half) ** 2) / half;
      const a = Math.max(0, 1 - r);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.floor(a * a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

function particleJitter(seed, amplitude) {
  const h1 = Math.sin(seed * 12.9898) * 43758.5453;
  const h2 = Math.sin(seed * 78.233 + 1.7) * 43758.5453;
  const h3 = Math.sin(seed * 37.719 + 3.1) * 43758.5453;
  return new THREE.Vector3(
    (h1 - Math.floor(h1)) * 2 - 1,
    (h2 - Math.floor(h2)) * 2 - 1,
    (h3 - Math.floor(h3)) * 2 - 1
  ).multiplyScalar(amplitude);
}

function clampOffset(offset, maxLen) {
  if (offset.length() > maxLen) offset.multiplyScalar(maxLen / offset.length());
  return offset;
}

function computeModelBounds(modelRoot, spaceRoot) {
  modelRoot.updateWorldMatrix(true, true);
  spaceRoot.updateWorldMatrix(true, true);
  const worldBox = new THREE.Box3().setFromObject(modelRoot);
  const size = worldBox.getSize(new THREE.Vector3());
  const center = worldBox.getCenter(new THREE.Vector3());
  spaceRoot.worldToLocal(center);
  const corner = new THREE.Vector3();
  const yVals = [];
  for (const xi of [0, 1]) {
    for (const yi of [0, 1]) {
      for (const zi of [0, 1]) {
        corner.set(
          xi ? worldBox.max.x : worldBox.min.x,
          yi ? worldBox.max.y : worldBox.min.y,
          zi ? worldBox.max.z : worldBox.min.z
        );
        spaceRoot.worldToLocal(corner);
        yVals.push(corner.y);
      }
    }
  }
  return {
    center,
    size,
    unit: Math.max(size.y, 1e-6),
    yMin: Math.min(...yVals),
    halfX: Math.max(size.x * 0.5, 1e-6),
  };
}

/** 按 Group 名在 FBX 中查找分件并收集子 Mesh（优先匹配 Group，再回退 Mesh） */
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

  if (!matched) return [];
  const meshes = [];
  if (matched.isMesh) meshes.push(matched);
  matched.traverse((c) => {
    if (c.isMesh && c !== matched) meshes.push(c);
  });
  return meshes;
}

function collectAllMeshes(modelRoot) {
  const meshes = [];
  modelRoot.traverse((c) => {
    if (c.isMesh && c.geometry?.attributes?.position) meshes.push(c);
  });
  return meshes;
}

/**
 * 按配置计算解构位移（×UNIT）
 * 分件整块平移，块内不散射 — 同分件共用方向/模式，仅 ±JITTER 微扰
 */
function computePartBlockDir(home, partCfg, bounds, UNIT, index, cfg, extra = {}) {
  const offset = new THREE.Vector3();
  const { center } = bounds;
  const dx = home.x - center.x;
  const dz = home.z - center.z;
  const horiz = Math.sqrt(dx * dx + dz * dz) || 1e-6;

  if (Array.isArray(partCfg.dir)) {
    offset.set(partCfg.dir[0] * UNIT, partCfg.dir[1] * UNIT, partCfg.dir[2] * UNIT);
  } else if (partCfg.mode === 'radial') {
    const amount = (partCfg.amount ?? 0.08) * UNIT;
    offset.set((dx / horiz) * amount, 0, (dz / horiz) * amount);
  } else if (partCfg.mode === 'box') {
    const amount = (partCfg.amount ?? 0.3) * UNIT;
    offset.set(Math.sign(dx || 1) * amount, 0, Math.sign(dz || 1) * amount);
  } else if (partCfg.mode === 'legs') {
    const spread = (partCfg.spread ?? 0.2) * UNIT;
    const sink = (partCfg.sink ?? 0.2) * UNIT;
    const legAng = extra.legAng ?? Math.atan2(dz, dx);
    offset.set(Math.cos(legAng) * spread, -sink, Math.sin(legAng) * spread);
  }

  // 极小微扰，不破坏分件形状
  offset.add(particleJitter(index, cfg.JITTER * UNIT));
  return clampOffset(offset, cfg.MAX_DISPLACEMENT * UNIT);
}

function dustParticleColor(rnd, partId, debugGroups) {
  const c = new THREE.Color();
  if (debugGroups) {
    c.setHex(DEBUG_GROUP_COLORS[partId] ?? 0x4a8a72);
    return c;
  }
  if (rnd < 0.8) c.setHex(DUST_PALETTE.green);
  else if (rnd < 0.92) c.setHex(DUST_PALETTE.greenBright);
  else c.setHex(DUST_PALETTE.gold);
  return c;
}

function sampleMesh(mesh, count, spaceRoot, temp) {
  const points = [];
  mesh.updateWorldMatrix(true, false);
  let sampler;
  try {
    sampler = new MeshSurfaceSampler(mesh).build();
  } catch {
    return points;
  }
  for (let i = 0; i < count; i++) {
    sampler.sample(temp);
    temp.applyMatrix4(mesh.matrixWorld);
    spaceRoot.worldToLocal(temp);
    points.push(temp.clone());
  }
  return points;
}

function angleDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function clusterFeetAngles(angles, k) {
  if (angles.length === 0) return [];
  const count = Math.min(Math.max(3, k), Math.min(4, angles.length));
  let centroids = Array.from({ length: count }, (_, i) => -Math.PI + (Math.PI * 2 * i) / count);
  for (let iter = 0; iter < 16; iter++) {
    const sums = centroids.map(() => ({ sx: 0, sz: 0, n: 0 }));
    angles.forEach((a) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, j) => {
        const d = angleDist(a, c);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      sums[best].sx += Math.cos(a);
      sums[best].sz += Math.sin(a);
      sums[best].n++;
    });
    centroids = sums.map((s) => (s.n > 0 ? Math.atan2(s.sz / s.n, s.sx / s.n) : 0));
  }
  return centroids;
}

function nearestClusterIndex(ang, centroids) {
  let best = 0;
  let bestD = Infinity;
  centroids.forEach((c, j) => {
    const d = angleDist(ang, c);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  return best;
}

export class PointCloudFromModel {
  constructor() {
    this.progress = 0;
    this.targetProgress = 0;
    this.meshVisible = false;
    this.time = 0;
    this.unit = 1;
    this.homePos = new Float32Array(0);
    this.burstPos = new Float32Array(0);
    this.rnd = new Float32Array(0);
    this.particleGroups = [];
    this.meshRoot = null;
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.glowMap = null;
    this.artifactId = null;
    this.config = null;
    this._handRotX = 0;
    this._handRotY = 0;
    this._baseRotY = 0;
    /** 质心锚点降频：每 3 帧重算一次 */
    this._centroidFrame = 0;
    this._partCentroidsLocal = {};
    this.debugGroups =
      new URLSearchParams(globalThis.location?.search ?? '').has('debugParticles');
  }

  setDebugGroups(enabled) {
    this.debugGroups = enabled;
    this._applyVertexColors();
  }

  _normalizeModelRoot(modelRoot) {
    modelRoot.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    modelRoot.position.sub(center);
    modelRoot.scale.multiplyScalar(TARGET_HEIGHT / Math.max(size.y, 1e-6));
    modelRoot.updateWorldMatrix(true, true);
    return box;
  }

  buildFromModel(modelRoot, spaceRoot, artifactId = 'default') {
    this.dispose();
    this.meshRoot = modelRoot;
    this.artifactId = artifactId;
    this.config = getDeconstructConfig(artifactId);

    if (!this._normalizeModelRoot(modelRoot)) return false;

    const bounds = computeModelBounds(modelRoot, spaceRoot);
    this.unit = bounds.unit;

    const ok = this._buildFromFbxParts(modelRoot, spaceRoot, bounds);
    if (!ok) return false;
    this._initPointsObject();
    this.progress = 0;
    this.targetProgress = 0;
    this._updatePositions(0);
    this._syncMeshVisibility();
    return true;
  }

  /** 按 FBX Group 名精确分件 */
  _buildFromFbxParts(modelRoot, spaceRoot, bounds) {
    const cfg = this.config;
    const partEntries = Object.entries(cfg.parts);
    const bodyCfg = cfg.parts.body ?? DECONSTRUCT_DEFAULTS.BODY_DEFAULT;
    const assignedMeshes = new Set();
    const partMeshes = [];
    let totalArea = 0;

    console.log('[PointCloud] FBX 分件解构', this.artifactId, '→', cfg.configKey);

    // 1. 按 Group 名匹配各分件
    for (const [partId, partCfg] of partEntries) {
      const match = partCfg.groupMatch ?? partId;
      const meshes = findFbxPartMeshes(modelRoot, match);
      meshes.forEach((m) => assignedMeshes.add(m));
      const area = meshes.reduce((s, m) => s + estimateMeshArea(m), 0) || meshes.length;
      console.log(`  分件 "${partId}" ← "${match}" | Mesh ${meshes.length} | 权重 ${area.toFixed(0)}`);
      partMeshes.push({ partId, partCfg, meshes, area });
      totalArea += area;
    }

    // 2. 未匹配 Group 的 Mesh 归 body
    const unassigned = collectAllMeshes(modelRoot).filter((m) => !assignedMeshes.has(m));
    if (unassigned.length > 0) {
      const area = unassigned.reduce((s, m) => s + estimateMeshArea(m), 0);
      console.log(`  分件 "body"(未匹配) | Mesh ${unassigned.length} | 权重 ${area.toFixed(0)}`);
      partMeshes.push({ partId: 'body', partCfg: bodyCfg, meshes: unassigned, area });
      totalArea += area;
    }

    if (totalArea <= 0) return false;

    const totalTarget = cfg.PARTICLE_COUNT ?? PARTICLE_COUNT;

    const temp = new THREE.Vector3();
    const particles = [];
    const legsPending = [];
    let index = 0;

    // 3. 表面采样
    for (const { partId, partCfg, meshes, area } of partMeshes) {
      if (meshes.length === 0) continue;
      const partTarget = Math.max(64, Math.round(totalTarget * (area / totalArea)));
      const perMesh = Math.max(1, Math.floor(partTarget / meshes.length));

      for (const mesh of meshes) {
        if (!mesh.geometry?.attributes?.normal) mesh.geometry?.computeVertexNormals?.();
        const pts = sampleMesh(mesh, perMesh, spaceRoot, temp);
        for (const home of pts) {
          const rnd = Math.random();
          const dx = home.x - bounds.center.x;
          const dz = home.z - bounds.center.z;
          const ang = Math.atan2(dz, dx);

          if (partCfg.mode === 'legs') {
            legsPending.push({ index, partId, partCfg, home, rnd, ang });
          } else {
            const blockDir = computePartBlockDir(home, partCfg, bounds, bounds.unit, index, cfg);
            particles.push({ index, partId, home, blockDir, rnd });
          }
          index++;
        }
      }
    }

    // 4. legs 模式：按角度分簇后计算位移
    if (legsPending.length > 0) {
      const centroids = clusterFeetAngles(
        legsPending.map((p) => p.ang),
        Math.min(4, legsPending.length)
      );
      for (const p of legsPending) {
        const legAng = centroids[nearestClusterIndex(p.ang, centroids)] ?? p.ang;
        const blockDir = computePartBlockDir(
          p.home, p.partCfg, bounds, bounds.unit, p.index, cfg, { ang: p.ang, legAng }
        );
        particles.push({ index: p.index, partId: p.partId, home: p.home, blockDir, rnd: p.rnd });
      }
    }

    if (particles.length === 0) return false;
    particles.sort((a, b) => a.index - b.index);
    return this._packParticles(particles);
  }

  _packParticles(particles) {
    const count = particles.length;
    const home = new Float32Array(count * 3);
    const burst = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const groups = [];
    const groupCounts = {};

    particles.forEach((p, i) => {
      const i3 = i * 3;
      home[i3] = p.home.x;
      home[i3 + 1] = p.home.y;
      home[i3 + 2] = p.home.z;
      burst[i3] = p.home.x + p.blockDir.x;
      burst[i3 + 1] = p.home.y + p.blockDir.y;
      burst[i3 + 2] = p.home.z + p.blockDir.z;
      rnd[i] = p.rnd;
      groups.push(p.partId);
      groupCounts[p.partId] = (groupCounts[p.partId] ?? 0) + 1;
      const col = dustParticleColor(p.rnd, p.partId, this.debugGroups);
      colors[i3] = col.r;
      colors[i3 + 1] = col.g;
      colors[i3 + 2] = col.b;
    });

    this.homePos = home;
    this.burstPos = burst;
    this.rnd = rnd;
    this.particleGroups = groups;
    console.log('[PointCloud] 粒子', count, '| UNIT', this.unit.toFixed(2), groupCounts);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(home), 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
    this._computePartCentroidsLocal();
    return true;
  }

  _initPointsObject() {
    const cfg = this.config;
    this.glowMap = createGlowTexture(64);
    // AdditiveBlending + sizeAttenuation：密集处叠亮变实，边缘通透
    this.material = new THREE.PointsMaterial({
      size: cfg.PARTICLE_SIZE ?? 0.038,
      map: this.glowMap,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'point-cloud-from-model';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  _applyVertexColors() {
    if (!this.geometry || !this.particleGroups.length) return;
    const colors = this.geometry.attributes.color.array;
    for (let i = 0; i < this.particleGroups.length; i++) {
      const col = dustParticleColor(this.rnd[i], this.particleGroups[i], this.debugGroups);
      const i3 = i * 3;
      colors[i3] = col.r;
      colors[i3 + 1] = col.g;
      colors[i3 + 2] = col.b;
    }
    this.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * MediaPipe接入点：握拳 → setDeconstructState(0) / 'cloud'
   * MediaPipe接入点：张开程度(0~1) → progress×MAX_DECONSTRUCT 连续解构
   * MediaPipe接入点：手掌移动 → setHandRotation(rx, ry)
   */
  setDeconstructState(value) {
    const maxDec = this.config?.MAX_DECONSTRUCT ?? 0.8;
    if (typeof value === 'number') {
      this.targetProgress = THREE.MathUtils.clamp(value, 0, 1) * maxDec;
      this.meshVisible = false;
      if (this.points) this.points.visible = true;
      return;
    }
    switch (value) {
      case 'solid':
        this.targetProgress = 0;
        this.meshVisible = true;
        break;
      case 'cloud':
        this.targetProgress = 0;
        this.meshVisible = false;
        break;
      case 'deconstruct':
        this.targetProgress = maxDec;
        this.meshVisible = false;
        break;
      default:
        return;
    }
    if (value !== 'solid' && this.points) this.points.visible = true;
  }

  setHandRotation(rotX, rotY) {
    this._handRotX = rotX;
    this._handRotY = rotY;
  }

  update(dt) {
    if (!this.points || !this.geometry) return;
    this.time += dt;
    const lambda = 4 / (this.config?.TRANSITION_SEC ?? 1.5);
    this.progress = damp(this.progress, this.targetProgress, lambda, dt);
    this._updatePositions(this.progress);
    this._syncMeshVisibility();
    const p = smoothstep(this.progress);
    this.material.opacity = THREE.MathUtils.lerp(0.92, 0.72, p);
    this.points.visible = !this.meshVisible || this.progress > 0.02;
    this._baseRotY += dt * 0.12;
    this.points.rotation.x = this._handRotX;
    this.points.rotation.y = this._handRotY + this._baseRotY;

    // 质心锚点：基于解构后的当前粒子位置，每 3 帧更新
    this._centroidFrame += 1;
    if (this._centroidFrame % 3 === 0) {
      this._computePartCentroidsLocal();
    }
  }

  /** 当前解构进度 0~1（供标注层淡入淡出） */
  getDeconstructProgress() {
    return this.progress;
  }

  /**
   * 各分件质心锚点的世界坐标（跟随旋转与解构位移）
   * @returns {Record<string, THREE.Vector3>}
   */
  getPartAnchorWorldPositions() {
    if (!this.points || !this.geometry) return {};
    this.points.updateWorldMatrix(true, false);
    const out = {};
    for (const [partId, local] of Object.entries(this._partCentroidsLocal)) {
      out[partId] = local.clone().applyMatrix4(this.points.matrixWorld);
    }
    return out;
  }

  /** 按分件组计算粒子当前位置的平均值 → 质心锚点（points 局部坐标） */
  _computePartCentroidsLocal() {
    const pos = this.geometry.attributes.position.array;
    const groups = this.particleGroups;
    const sums = {};

    for (let i = 0; i < groups.length; i++) {
      const partId = groups[i];
      const i3 = i * 3;
      if (!sums[partId]) sums[partId] = { x: 0, y: 0, z: 0, n: 0 };
      const s = sums[partId];
      s.x += pos[i3];
      s.y += pos[i3 + 1];
      s.z += pos[i3 + 2];
      s.n += 1;
    }

    this._partCentroidsLocal = {};
    for (const [partId, s] of Object.entries(sums)) {
      if (s.n === 0) continue;
      this._partCentroidsLocal[partId] = new THREE.Vector3(s.x / s.n, s.y / s.n, s.z / s.n);
    }
  }

  /** 分件整块平移：smoothstep 插值，禁用 stagger / drift / 消散叠加 */
  _updatePositions(progress) {
    const pos = this.geometry.attributes.position.array;
    const { homePos, burstPos } = this;
    const count = this.rnd.length;
    const p = smoothstep(progress);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = THREE.MathUtils.lerp(homePos[i3], burstPos[i3], p);
      pos[i3 + 1] = THREE.MathUtils.lerp(homePos[i3 + 1], burstPos[i3 + 1], p);
      pos[i3 + 2] = THREE.MathUtils.lerp(homePos[i3 + 2], burstPos[i3 + 2], p);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  _syncMeshVisibility() {
    if (!this.meshRoot) return;
    const showMesh = this.meshVisible && this.progress < 0.12;
    this.meshRoot.traverse((c) => {
      if (c.isMesh) c.visible = showMesh;
    });
  }

  logSceneAttachment(scene) {
    console.log('[PointCloud] 挂载', {
      artifactId: this.artifactId,
      configKey: this.config?.configKey,
      particles: this.rnd.length,
      inScene: scene?.getObjectByName('point-cloud-from-model') != null,
    });
  }

  setVisible(v) {
    if (this.points) this.points.visible = v;
  }

  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.glowMap?.dispose();
    this.geometry = null;
    this.material = null;
    this.glowMap = null;
    this.points = null;
    this.meshRoot = null;
    this.homePos = new Float32Array(0);
    this.burstPos = new Float32Array(0);
    this.rnd = new Float32Array(0);
    this.particleGroups = [];
    this._partCentroidsLocal = {};
  }
}
