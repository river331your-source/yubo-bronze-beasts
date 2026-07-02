/**
 * 五件河南出土动物形制青铜器数据
 * modelPath: FBX 放在 public/models/ 根目录
 * 更换模型文件后请递增 MODEL_ASSET_REVISION，以清除内存中的旧缓存
 */
export const MODEL_ASSET_REVISION = 2;

export const ARTIFACTS = [
  {
    id: 'fuhao-xiao-zun',
    name: '妇好鸮尊',
    era: '商代晚期',
    excavated: '安阳殷墟妇好墓',
    museum: '河南博物院',
    height: '通高 46.3 厘米',
    modelPath: '/models/妇好鸮尊.fbx',
    thumbnail: '/models/thumbs/fuhao-xiao-zun.jpg',
    description:
      '中国商代青铜器的精品之一，造型为站立的猫头鹰，纹饰精美，是商代晚期青铜艺术的代表作。',
    patterns: ['beast_face', 'cloud'],
  },
  {
    id: 'shenshou-bronze',
    name: '青铜神兽',
    era: '春秋晚期 · 楚国',
    excavated: '淅川徐家岭9号楚墓',
    museum: '河南博物院',
    height: '通高 48 厘米',
    modelPath: '/models/青铜神兽.fbx',
    thumbnail: '/models/thumbs/shenshou-bronze.jpg',
    description: '楚国青铜艺术的杰出代表，神兽造型神秘威严，体现了楚文化的浪漫与想象力。',
    patterns: ['beast_face', 'kui_dragon'],
  },
  {
    id: 'shoumian-fang-gong',
    name: '兽面纹铜方觥',
    era: '西周',
    excavated: '鹿邑县长子口墓',
    museum: '河南博物院',
    height: '通高 15 厘米',
    modelPath: '/models/兽面纹铜方觥.fbx',
    thumbnail: '/models/thumbs/shoumian-fang-gong.jpg',
    description: '西周时期青铜酒器，兽面纹装饰华丽，是研究西周礼制与青铜工艺的重要实物。',
    patterns: ['beast_face', 'thunder'],
  },
  {
    id: 'panlong-he',
    name: '蟠龙纹铜盉',
    era: '西周',
    excavated: '三门峡虢国墓地虢季墓',
    museum: '河南博物院',
    height: '通高 22.6 厘米',
    modelPath: '/models/蟠龙纹铜盉.fbx',
    thumbnail: '/models/thumbs/panlong-he.jpg',
    description: '虢国墓地出土青铜盉，蟠龙纹环绕器身，展现西周青铜铸造的高超技艺。',
    patterns: ['kui_dragon', 'cloud'],
  },
  {
    id: 'pu-yan-he',
    name: '「匍」雁铜盉',
    era: '西周',
    excavated: '平顶山应国墓地',
    museum: '河南博物院',
    height: '通高 25.2 厘米',
    modelPath: '/models/匍雁铜盉.fbx',
    thumbnail: '/models/thumbs/pu-yan-he.jpg',
    description: '以雁为造型的青铜盉，盖钮为匍坐小人，造型生动，是西周青铜艺术的珍品。',
    patterns: ['cloud', 'thunder'],
  },
];

export const SITE_NAV = [
  { id: 'home', label: '首页', en: 'HOME' },
  { id: 'atlas', label: '神兽图鉴', en: 'BEAST ATLAS' },
  { id: 'pattern', label: '纹样探秘', en: 'PATTERN EXPLORATION' },
  { id: 'craft', label: '青铜工艺', en: 'BRONZE CRAFT' },
  { id: 'story', label: '关于', en: 'ABOUT' },
];

export const DEFAULT_ARTIFACT_INDEX = 0;

export const INTERACTION_CARDS = [
  {
    mode: 'deconstruct',
    title: '解构与重构',
    desc: '粒子解构神兽形态，感受结构之美',
  },
  {
    mode: 'pattern',
    title: '纹样探秘',
    desc: '手电筒照亮纹样，探索隐藏的文化密码',
  },
  {
    mode: 'material',
    title: '材质还原',
    desc: '还原青铜本色，感受岁月与工艺的痕迹',
  },
];

export const INTERACTION_MODES = {
  deconstruct: {
    id: 'deconstruct',
    label: '解构与重构',
    hint: '握拳聚合 · 手势A拆解+标注 · 手势B消散',
  },
  pattern: {
    id: 'pattern',
    label: '纹样探秘',
    hint: '👌 手势开启手电筒 · 照亮线稿纹样见吉金',
  },
  material: {
    id: 'material',
    label: '材质还原',
    hint: '拖动底部滑块 · 从出土锈绿还原至初铸吉金',
  },
};

export const MATERIAL_STAGES = [
  { id: 'excavation', label: '出土态', threshold: 0 },
  { id: 'cleaned', label: '清理态', threshold: 0.33 },
  { id: 'jijin', label: '吉金态', threshold: 0.66 },
  { id: 'display', label: '展示态', threshold: 1 },
];
