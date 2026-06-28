import * as THREE from 'three';

const MAX_PARTICLES = 10000;
const PARTICLE_RADIUS = 0.013;
const BRONZE = 0x6b7c3a;
const BRONZE_LIGHT = 0x8a9c4a;

/**
 * 从网格顶点构建分铸块点云（InstancedMesh 实例化）
 */
export class PointCloudCastModel {
  constructor(sourceModel) {
    this.group = new THREE.Group();
    this.group.name = 'point-cloud-cast';
    this.blocks = [];
    this._particleGeo = new THREE.SphereGeometry(PARTICLE_RADIUS, 5, 4);
    this._build(sourceModel);
  }

  _build(sourceModel) {
    sourceModel.updateWorldMatrix(true, true);
    const invRoot = new THREE.Matrix4().copy(sourceModel.matrixWorld).invert();

    const meshes = [];
    sourceModel.traverse((c) => {
      if (c.isMesh?.geometry) meshes.push(c);
    });
    if (meshes.length === 0) return;

    const blockDefs =
      meshes.length > 1
        ? this._blocksFromMeshes(meshes, invRoot)
        : this._blocksFromSpatialCluster(meshes[0], invRoot);

    const totalVerts = blockDefs.reduce((s, b) => s + b.points.length, 0);
    const budget = Math.min(MAX_PARTICLES, totalVerts);
    const scale = totalVerts > budget ? budget / totalVerts : 1;

    const modelCenter = new THREE.Box3().setFromObject(sourceModel).getCenter(new THREE.Vector3());
    modelCenter.applyMatrix4(invRoot);

    const box = new THREE.Box3().setFromObject(sourceModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    blockDefs.forEach((def, index) => {
      let points = def.points;
      if (scale < 1) {
        const keep = Math.max(8, Math.floor(points.length * scale));
        points = this._samplePoints(points, keep);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? BRONZE : BRONZE_LIGHT,
        metalness: 0.88,
        roughness: 0.32,
      });

      const instanced = new THREE.InstancedMesh(this._particleGeo, mat, points.length);
      instanced.name = `cast-block-${index}`;
      const matrix = new THREE.Matrix4();

      points.forEach((p, i) => {
        matrix.makeTranslation(p.x, p.y, p.z);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;

      const centroid = new THREE.Vector3();
      points.forEach((p) => centroid.add(p));
      centroid.multiplyScalar(1 / points.length);

      const deconstructOffset = this._archaeologicalOffset(
        centroid,
        modelCenter,
        index,
        blockDefs.length,
        maxDim
      );

      this.group.add(instanced);
      this.blocks.push({
        instanced,
        assemblyPos: new THREE.Vector3(0, 0, 0),
        deconstructPos: deconstructOffset,
        centroid,
      });
    });
  }

  _blocksFromMeshes(meshes, invRoot) {
    return meshes.map((mesh) => ({
      points: this._extractVertices(mesh, invRoot),
    }));
  }

  _blocksFromSpatialCluster(mesh, invRoot) {
    const points = this._extractVertices(mesh, invRoot);
    if (points.length === 0) return [{ points: [] }];

    const box = new THREE.Box3().setFromPoints(points);
    const min = box.min;
    const max = box.max;
    const rangeY = max.y - min.y || 1;

    const buckets = new Map();
    points.forEach((p) => {
      const yBand = Math.min(2, Math.floor(((p.y - min.y) / rangeY) * 3));
      const angle = Math.atan2(p.x, p.z);
      const sector = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 4) % 4;
      const key = yBand * 4 + sector;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    return [...buckets.values()].filter((b) => b.length >= 4);
  }

  _extractVertices(mesh, invRoot) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) return [];

    mesh.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 2000));
    const out = [];

    for (let i = 0; i < pos.count; i += step) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      v.applyMatrix4(local);
      out.push(v);
    }
    return out;
  }

  _samplePoints(points, count) {
    if (points.length <= count) return points;
    const shuffled = [...points];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  /** 考古式分离：沿块 centroid 向外 + 上层块垂直抬升（盖/耳） */
  _archaeologicalOffset(centroid, modelCenter, index, total, maxDim) {
    const dir = centroid.clone().sub(modelCenter);
    if (dir.lengthSq() < 1e-8) {
      dir.set(Math.sin(index * 1.2), 0.3, Math.cos(index * 1.2));
    }
    dir.normalize();

    const sep = maxDim * (0.12 + (index % 3) * 0.04);
    const offset = dir.multiplyScalar(sep);

    const yRatio =
      (centroid.y - modelCenter.y) / (maxDim * 0.5 + 0.01);
    if (yRatio > 0.35) {
      offset.y += maxDim * (0.08 + yRatio * 0.12);
    }

    offset.x += Math.sin(index * 2.1 + total) * maxDim * 0.02;
    offset.z += Math.cos(index * 1.7) * maxDim * 0.02;

    return offset;
  }

  setDeconstructProgress(t) {
    const eased = t * t * (3 - 2 * t);
    this.blocks.forEach(({ instanced, assemblyPos, deconstructPos }) => {
      instanced.position.lerpVectors(assemblyPos, deconstructPos, eased);
    });
  }

  dispose() {
    this.blocks.forEach(({ instanced }) => {
      instanced.material?.dispose?.();
    });
    this._particleGeo.dispose();
    this.group.clear();
    this.blocks = [];
  }
}

export function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}
