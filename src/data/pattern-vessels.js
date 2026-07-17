/**
 * 纹样探秘 · 器物线稿数据
 * 下一步可在此 id 上挂热区 / 档案卡配置
 */
export const PATTERN_VESSELS = [
  {
    id: 'fuhao-xiao-zun',
    name: '妇好鸮尊',
    shortName: '鸮尊',
    era: '商代晚期',
    thumbnail: '/images/relics/fuhao_xiaozun.png',
    lineartSrc: '/patterns/artifacts/gong_lines.png',
    aspectRatio: '24803 / 19928',
  },
  {
    id: 'shenshou',
    name: '青铜神兽',
    shortName: '神兽',
    era: '春秋晚期·楚',
    thumbnail: '/images/relics/shenshou_qingtong.png',
    lineartSrc: '/patterns/artifacts/shenshou_lines.png',
    aspectRatio: '24803 / 17089',
  },
];

export const DEFAULT_PATTERN_VESSEL_INDEX = 0;

export function getPatternVessel(index) {
  const i = ((index % PATTERN_VESSELS.length) + PATTERN_VESSELS.length) % PATTERN_VESSELS.length;
  return PATTERN_VESSELS[i];
}

export function getPatternVesselById(id) {
  return PATTERN_VESSELS.find((v) => v.id === id) ?? PATTERN_VESSELS[DEFAULT_PATTERN_VESSEL_INDEX];
}
