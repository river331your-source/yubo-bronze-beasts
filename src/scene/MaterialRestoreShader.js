import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocalPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uRestore;
  uniform vec3 uLightDir;

  varying vec3 vNormal;
  varying vec3 vLocalPos;

  // 程序化噪声：用于生成斑驳铜锈纹理
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
    return n;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);

    // uRestore 经 smoothstep 缓动，驱动三层同步过渡
    float r = smoothstep(0.0, 1.0, uRestore);

    // ── 第 1 层：颜色 ──────────────────────────────────────
    // 出土态：青绿铜锈（暗 → 亮，由 patina 噪声调制）
    vec3 rustDark = vec3(0.18, 0.32, 0.26);
    vec3 rustLite = vec3(0.42, 0.62, 0.50);

    // 初铸态：吉金黄铜（暗金 → 亮金，由漫反射调制）
    vec3 goldDark = vec3(0.55, 0.40, 0.13);
    vec3 goldLite = vec3(0.95, 0.78, 0.35);

    // ── 第 2 层：锈迹 patina ────────────────────────────────
    // 多层 noise 叠加出不规则斑驳；uRestore↑ 时锈迹权重衰减至 0
    float patina = noise(vLocalPos * 4.0) * 0.6 + noise(vLocalPos * 12.0) * 0.4;
    float patinaWeight = (1.0 - r) * patina;
    vec3 rust = mix(rustDark, rustLite, patinaWeight);
    vec3 gold = mix(goldDark, goldLite, diff);

    // 颜色层：出土绿锈 ⇄ 初铸吉金
    vec3 base = mix(rust, gold, r);

    // ── 第 3 层：高光 specular ──────────────────────────────
    // 出土态哑光（低强度、低锐度）→ 初铸态金属高光（高强度、高锐度）
    float specPow = mix(4.0, 28.0, r);
    float specStr = mix(0.1, 0.9, r);
    float spec = pow(diff, specPow) * specStr;

    // 最终合成：漫反射底色 + 暖色金属高光
    vec3 col = base * (0.35 + 0.75 * diff) + vec3(1.0, 0.9, 0.6) * spec;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * 创建材质还原 ShaderMaterial
 * uRestore: 0=出土锈绿态  1=初铸吉金态
 */
export function createMaterialRestoreShader() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRestore: { value: 0.0 },
      uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.5).normalize() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

/** 根据 uRestore 返回阶段文案 */
export function getRestoreStageLabel(restore) {
  if (restore < 0.15) return '出土现状·青绿铜锈';
  if (restore < 0.55) return '锈色消退·铜质显现';
  if (restore < 0.9) return '渐复本色·吉金初现';
  return '初铸之态·灿若黄金';
}
