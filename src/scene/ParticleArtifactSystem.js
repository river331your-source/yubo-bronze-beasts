import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { damp } from './PointCloudCastModel.js';

export const PARTICLE_COUNT = 200000;

const BRONZE_GREEN = new THREE.Color(0x6f9478);
const BRONZE_GREEN_DARK = new THREE.Color(0x4a6b58);
const BRONZE_GREEN_LIGHT = new THREE.Color(0x8fae94);

const VERT = /* glsl */ `
  attribute vec3 nebulaPos;
  attribute vec3 modelPos;
  attribute vec3 blockOffset;
  attribute float colorMix;

  uniform float morphProgress;
  uniform float deconstructProgress;
  uniform float time;

  varying float vColorMix;
  varying float vAlpha;

  void main() {
    float m = smoothstep(0.0, 1.0, morphProgress);
    vec3 pos = mix(nebulaPos, modelPos, m);

    float d = smoothstep(0.0, 1.0, deconstructProgress);
    pos += blockOffset * d;

    float drift = (1.0 - m) * 0.035;
    pos.x += sin(time * 0.7 + nebulaPos.y * 3.0) * drift;
    pos.y += cos(time * 0.5 + nebulaPos.z * 2.5) * drift;
    pos.z += sin(time * 0.6 + nebulaPos.x * 2.0) * drift;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(2.8 * (280.0 / -mv.z), 1.0, 5.0);
    gl_Position = projectionMatrix * mv;

    vColorMix = colorMix;
    vAlpha = 0.55 + m * 0.4;
  }
`;

const FRAG = /* glsl */ `
  varying float vColorMix;
  varying float vAlpha;

  uniform vec3 colorGreenDark;
  uniform vec3 colorGreenLight;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;

    float glow = 1.0 - smoothstep(0.0, 0.25, d);
    vec3 col = mix(colorGreenDark, colorGreenLight, vColorMix);
    col += colorGreenLight * glow * 0.18;

    gl_FragColor = vec4(col, vAlpha * glow);
  }
`;

function generateNebula(count) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 0.55) * 2.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const arm = Math.sin(theta * 3.0 + r * 2.5) * 0.35;
    arr[i3] = r * Math.sin(phi) * Math.cos(theta + arm);
    arr[i3 + 1] = (Math.random() - 0.5) * r * 0.6;
    arr[i3 + 2] = r * Math.sin(phi) * Math.sin(theta + arm);
  }
  return arr;
}

function sampleModelPoints(modelRoot, spaceRoot, count) {
  const meshes = [];
  modelRoot.updateWorldMatrix(true, true);
  spaceRoot.updateWorldMatrix(true, true);
  modelRoot.traverse((c) => {
    if (c.isMesh?.geometry?.attributes?.position) meshes.push(c);
  });

  if (meshes.length === 0) return null;

  const positions = new Float32Array(count * 3);
  const blockOffsets = new Float32Array(count * 3);
  const colorMix = new Float32Array(count);

  const box = new THREE.Box3().setFromObject(modelRoot);
  const center = box.getCenter(new THREE.Vector3());
  spaceRoot.worldToLocal(center);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  const temp = new THREE.Vector3();
  const perMesh = Math.ceil(count / meshes.length);
  let idx = 0;

  meshes.forEach((mesh, meshIdx) => {
    mesh.updateWorldMatrix(true, false);
    const sampler = new MeshSurfaceSampler(mesh).build();
    const n = Math.min(perMesh, count - idx);

    const meshBox = new THREE.Box3().setFromObject(mesh);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const blockDir = meshCenter.clone().sub(center);
    if (blockDir.lengthSq() < 1e-8) blockDir.set(0, 1, 0);
    blockDir.normalize();
    const meshSep = maxDim * (0.12 + (meshIdx % 4) * 0.04);
    const yLift = meshCenter.y > center.y ? maxDim * 0.1 : 0;

    for (let i = 0; i < n; i++) {
      sampler.sample(temp);
      temp.applyMatrix4(mesh.matrixWorld);
      spaceRoot.worldToLocal(temp);

      const i3 = idx * 3;
      positions[i3] = temp.x;
      positions[i3 + 1] = temp.y;
      positions[i3 + 2] = temp.z;

      blockOffsets[i3] = blockDir.x * meshSep;
      blockOffsets[i3 + 1] = blockDir.y * meshSep + yLift;
      blockOffsets[i3 + 2] = blockDir.z * meshSep;

      colorMix[idx] = 0.2 + Math.random() * 0.8;
      idx++;
    }
  });

  while (idx < count) {
    const src = Math.floor(Math.random() * Math.max(1, idx));
    const i3 = idx * 3;
    const s3 = src * 3;
    positions[i3] = positions[s3];
    positions[i3 + 1] = positions[s3 + 1];
    positions[i3 + 2] = positions[s3 + 2];
    blockOffsets[i3] = blockOffsets[s3];
    blockOffsets[i3 + 1] = blockOffsets[s3 + 1];
    blockOffsets[i3 + 2] = blockOffsets[s3 + 2];
    colorMix[idx] = colorMix[src];
    idx++;
  }

  return { positions, blockOffsets, colorMix };
}

/**
 * 20 万粒子 · 混沌星云 ⇄ 文物 3D 轮廓
 */
export class ParticleArtifactSystem {
  constructor(count = PARTICLE_COUNT) {
    this.count = count;
    this.morphProgress = 0;
    this.targetMorph = 0;
    this.deconstructProgress = 0;
    this.visible = true;

    this._posBlendFrom = null;
    this._posBlendTo = null;
    this._posBlendT = 1;

    const nebula = generateNebula(count);
    const model = new Float32Array(count * 3);
    const blockOffset = new Float32Array(count * 3);
    const colorMix = new Float32Array(count);
    for (let i = 0; i < count; i++) colorMix[i] = Math.random();

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(model, 3));
    this.geometry.setAttribute('nebulaPos', new THREE.BufferAttribute(nebula, 3));
    this.geometry.setAttribute('modelPos', new THREE.BufferAttribute(model, 3));
    this.geometry.setAttribute('blockOffset', new THREE.BufferAttribute(blockOffset, 3));
    this.geometry.setAttribute('colorMix', new THREE.BufferAttribute(colorMix, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        morphProgress: { value: 0 },
        deconstructProgress: { value: 0 },
        time: { value: 0 },
        colorGreenDark: { value: BRONZE_GREEN_DARK },
        colorGreenLight: { value: BRONZE_GREEN_LIGHT },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'particle-artifact';
    this.points.frustumCulled = false;
  }

  setVisible(v) {
    this.visible = v;
    this.points.visible = v;
  }

  setTargetFromObject(modelRoot, spaceRoot, { fromNebula = false } = {}) {
    const sampled = sampleModelPoints(modelRoot, spaceRoot ?? modelRoot, this.count);
    if (!sampled) return;

    const modelAttr = this.geometry.attributes.modelPos;

    if (fromNebula || this.morphProgress < 0.15) {
      modelAttr.array.set(sampled.positions);
      modelAttr.needsUpdate = true;
      this.geometry.attributes.blockOffset.array.set(sampled.blockOffsets);
      this.geometry.attributes.blockOffset.needsUpdate = true;
      this.geometry.attributes.colorMix.array.set(sampled.colorMix);
      this.geometry.attributes.colorMix.needsUpdate = true;
      this.targetMorph = 1;
      return;
    }

    this._posBlendFrom = new Float32Array(modelAttr.array);
    this._posBlendTo = sampled.positions;
    this._posBlendT = 0;
    this.geometry.attributes.blockOffset.array.set(sampled.blockOffsets);
    this.geometry.attributes.blockOffset.needsUpdate = true;
    this.targetMorph = 1;
  }

  setDeconstructProgress(t) {
    this.deconstructProgress = t;
  }

  update(elapsed, dt) {
    this.material.uniforms.time.value = elapsed;

    this.morphProgress = damp(this.morphProgress, this.targetMorph, 1.8, dt);
    this.material.uniforms.morphProgress.value = this.morphProgress;
    this.material.uniforms.deconstructProgress.value = this.deconstructProgress;

    if (this._posBlendFrom && this._posBlendT < 1) {
      this._posBlendT = Math.min(1, this._posBlendT + dt * 0.85);
      const eased = this._posBlendT * this._posBlendT * (3 - 2 * this._posBlendT);
      const arr = this.geometry.attributes.modelPos.array;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = THREE.MathUtils.lerp(this._posBlendFrom[i], this._posBlendTo[i], eased);
      }
      this.geometry.attributes.modelPos.needsUpdate = true;
      if (this._posBlendT >= 1) {
        this._posBlendFrom = null;
        this._posBlendTo = null;
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
