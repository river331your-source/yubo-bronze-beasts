/**
 * 粒子解构配置 — 按 FBX Group 名分件
 * 所有 dir / amount / spread / sink 数值均 × UNIT（模型高度 size.y）
 * 位移硬上限 MAX_DISPLACEMENT × UNIT
 */

/** 表面采样总数 — 改此一处，五件文物统一生效（上限可提到 50000） */
export const PARTICLE_COUNT = 30000;
export const PARTICLE_COUNT_MAX = 50000;

/** 全局默认参数 — 克制的考古式解构 */
export const DECONSTRUCT_DEFAULTS = {
  PARTICLE_COUNT,
  PARTICLE_SIZE: 0.038,
  MAX_DISPLACEMENT: 0.3,
  /** 块内几乎不可见的微扰动（±0.01×UNIT），不做随机散射 */
  JITTER: 0.01,
  TRANSITION_SEC: 1.5,
  /** 0 = 同分件粒子同步平移，不做逐粒子错峰 */
  STAGGER_RANGE: 0,
  /** 分件解构模式禁用 surface drift / 湍流 */
  TURBULENCE_AMP: 0,
  /** 手完全张开时解构上限 80%，永远保留器物轮廓 */
  MAX_DECONSTRUCT: 0.8,
  /** 第三段消散：driftDir 方向上的最大飘移距离 × UNIT */
  DISSOLVE_MAX_DRIFT: 0.42,
  BODY_DEFAULT: { mode: 'radial', amount: 0.08 },
};

/**
 * 五件文物解构配置
 * parts key = FBX Group 名（子串匹配）；也可显式写 groupMatch
 * - dir: [x,y,z] 固定方向
 * - mode: 'radial' | 'box' | 'legs'
 */
export const deconstructConfigs = {
  fuhao_xiaozun: {
    parts: {
      lid: { dir: [0, 0.25, 0] },
      body: { mode: 'radial', amount: 0.08 },
    },
  },
  shenshou_qingtong: {
    parts: {
      head: { dir: [0, 0.1, 0.25] },
      body: { mode: 'radial', amount: 0.08 },
      feet: { mode: 'legs', spread: 0.25, sink: 0.15 },
      back: { dir: [0, 0.22, 0] },
    },
  },
  shoumian_fanggong: {
    parts: {
      lid: { dir: [0, 0.25, 0.05] },
      body: { mode: 'radial', amount: 0.08 },
    },
  },
  panlong_hu: {
    parts: {
      lid: { dir: [0, 0.25, 0] },
      spout: { dir: [-0.25, 0.05, 0] },
      body: { mode: 'radial', amount: 0.08 },
    },
  },
  fu_yan_hu: {
    parts: {
      lid: { dir: [0, 0.15, 0] },
      body: { mode: 'radial', amount: 0.08 },
    },
  },
};

/** artifacts.js 中的 id → 配置 key */
export const ARTIFACT_CONFIG_KEYS = {
  'fuhao-xiao-zun': 'fuhao_xiaozun',
  'shenshou-bronze': 'shenshou_qingtong',
  'shoumian-fang-gong': 'shoumian_fanggong',
  'panlong-he': 'panlong_hu',
  'pu-yan-he': 'fu_yan_hu',
};

/** debug 按分件着色 */
export const DEBUG_GROUP_COLORS = {
  lid: 0xc9a84c,
  body: 0x4a8a72,
  spout: 0xff8c42,
  feet: 0x4a6b5c,
  foot: 0x4a6b5c,
  head: 0xff8c42,
  back: 0xa8d8c0,
  head_spout: 0xff8c42,
};

/** 消散风格顶点色：80% 青绿 / 12% 亮绿 / 8% 金 */
export const DUST_PALETTE = {
  green: 0x4a8a72,
  greenBright: 0xa8d8c0,
  gold: 0xc9a84c,
};

/**
 * @param {string} artifactId — artifacts.js 中的 id
 * @returns {object}
 */
export function getDeconstructConfig(artifactId) {
  const configKey = ARTIFACT_CONFIG_KEYS[artifactId] ?? artifactId;
  const artifact = deconstructConfigs[configKey];
  if (!artifact?.parts) {
    return {
      ...DECONSTRUCT_DEFAULTS,
      artifactId,
      configKey,
      parts: { body: DECONSTRUCT_DEFAULTS.BODY_DEFAULT },
    };
  }
  return {
    ...DECONSTRUCT_DEFAULTS,
    ...artifact,
    artifactId,
    configKey,
  };
}

/** @deprecated */
export function getSpatialDeconstructConfig(artifactId) {
  return getDeconstructConfig(artifactId);
}
