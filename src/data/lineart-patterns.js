/**
 * 青铜器线稿纹样 — 程序化路径
 * nx/ny 为画布归一化坐标 (0–1)，scale 相对基准尺寸
 */

const BASE = 80;

function strokePath(ctx, points, closed = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
}

/** 兽面纹 */
export function drawBeastFace(ctx) {
  const s = BASE;
  strokePath(ctx, [
    [-0.45 * s, -0.05 * s],
    [-0.35 * s, -0.35 * s],
    [-0.15 * s, -0.42 * s],
    [0, -0.28 * s],
    [0.15 * s, -0.42 * s],
    [0.35 * s, -0.35 * s],
    [0.45 * s, -0.05 * s],
  ]);
  strokePath(ctx, [
    [-0.38 * s, -0.38 * s],
    [-0.28 * s, -0.48 * s],
    [-0.12 * s, -0.44 * s],
  ]);
  strokePath(ctx, [
    [0.38 * s, -0.38 * s],
    [0.28 * s, -0.48 * s],
    [0.12 * s, -0.44 * s],
  ]);
  ctx.beginPath();
  ctx.ellipse(-0.18 * s, -0.08 * s, 0.1 * s, 0.13 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.18 * s, -0.08 * s, 0.1 * s, 0.13 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.06 * s, 0.06 * s);
  ctx.lineTo(0, 0.18 * s);
  ctx.lineTo(0.06 * s, 0.06 * s);
  ctx.stroke();
  strokePath(ctx, [
    [-0.22 * s, 0.12 * s],
    [-0.12 * s, 0.22 * s],
    [0, 0.18 * s],
    [0.12 * s, 0.22 * s],
    [0.22 * s, 0.12 * s],
  ]);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.07 * s, 0.2 * s);
    ctx.lineTo(i * 0.07 * s, 0.38 * s);
    ctx.stroke();
  }
}

/** 夔龙纹 */
export function drawKuiDragon(ctx) {
  const s = BASE;
  strokePath(ctx, [
    [-0.42 * s, 0.1 * s],
    [-0.28 * s, -0.15 * s],
    [-0.08 * s, -0.22 * s],
    [0.08 * s, -0.12 * s],
    [0.22 * s, 0.05 * s],
    [0.38 * s, 0.12 * s],
    [0.48 * s, 0.02 * s],
  ]);
  strokePath(ctx, [
    [0.38 * s, 0.12 * s],
    [0.42 * s, 0.28 * s],
    [0.32 * s, 0.35 * s],
    [0.18 * s, 0.28 * s],
  ]);
  ctx.beginPath();
  ctx.arc(-0.32 * s, -0.05 * s, 0.05 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.38 * s, -0.08 * s);
  ctx.lineTo(-0.48 * s, -0.18 * s);
  ctx.stroke();
  strokePath(ctx, [
    [0.05 * s, 0.08 * s],
    [0.15 * s, 0.18 * s],
    [0.28 * s, 0.15 * s],
    [0.38 * s, 0.22 * s],
  ]);
}

/** 雷纹 */
export function drawThunder(ctx) {
  const s = BASE;
  const loops = [
    [-0.3, -0.25],
    [0, -0.25],
    [0.3, -0.25],
    [-0.3, 0.05],
    [0, 0.05],
    [0.3, 0.05],
    [-0.3, 0.35],
    [0, 0.35],
    [0.3, 0.35],
  ];
  loops.forEach(([ox, oy]) => {
    const cx = ox * s;
    const cy = oy * s;
    const r = 0.11 * s;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    for (let i = 0; i <= 4; i++) {
      const ang = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const nx = cx + Math.cos(ang) * r;
      const ny = cy + Math.sin(ang) * r;
      const tang = ang + Math.PI / 2;
      ctx.quadraticCurveTo(
        cx + Math.cos(tang) * r * 0.6,
        cy + Math.sin(tang) * r * 0.6,
        nx,
        ny
      );
    }
    ctx.stroke();
  });
}

/** 云纹 */
export function drawCloud(ctx) {
  const s = BASE;
  const curls = [
    [-0.25, 0],
    [0, -0.08],
    [0.25, 0],
    [-0.12, 0.18],
    [0.12, 0.18],
  ];
  curls.forEach(([ox, oy]) => {
    const cx = ox * s;
    const cy = oy * s;
    const r = 0.14 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.55, cy - r * 0.15, r * 0.55, Math.PI, Math.PI * 2.5);
    ctx.stroke();
  });
  strokePath(ctx, [
    [-0.38 * s, 0.05 * s],
    [-0.18 * s, 0.02 * s],
    [0, 0.06 * s],
    [0.18 * s, 0.02 * s],
    [0.38 * s, 0.05 * s],
  ]);
}

export const PATTERN_DRAWERS = {
  beast_face: drawBeastFace,
  kui_dragon: drawKuiDragon,
  thunder: drawThunder,
  cloud: drawCloud,
};

/** 器物线稿轮廓 */
export function drawVesselSilhouette(ctx, type) {
  const s = BASE * 2.2;
  ctx.beginPath();
  switch (type) {
    case 'owl':
      ctx.moveTo(0, -0.55 * s);
      ctx.bezierCurveTo(-0.35 * s, -0.5 * s, -0.42 * s, -0.15 * s, -0.38 * s, 0.15 * s);
      ctx.lineTo(-0.28 * s, 0.42 * s);
      ctx.lineTo(0.28 * s, 0.42 * s);
      ctx.lineTo(0.38 * s, 0.15 * s);
      ctx.bezierCurveTo(0.42 * s, -0.15 * s, 0.35 * s, -0.5 * s, 0, -0.55 * s);
      ctx.moveTo(-0.12 * s, -0.35 * s);
      ctx.lineTo(0.12 * s, -0.35 * s);
      break;
    case 'horned_beast':
      ctx.moveTo(-0.08 * s, -0.58 * s);
      ctx.lineTo(-0.22 * s, -0.42 * s);
      ctx.lineTo(-0.35 * s, -0.48 * s);
      ctx.bezierCurveTo(-0.45 * s, -0.2 * s, -0.42 * s, 0.2 * s, -0.3 * s, 0.42 * s);
      ctx.lineTo(0.3 * s, 0.42 * s);
      ctx.bezierCurveTo(0.42 * s, 0.2 * s, 0.45 * s, -0.2 * s, 0.35 * s, -0.48 * s);
      ctx.lineTo(0.22 * s, -0.42 * s);
      ctx.lineTo(0.08 * s, -0.58 * s);
      break;
    case 'round_jar':
      ctx.ellipse(0, 0.05 * s, 0.38 * s, 0.42 * s, 0, 0, Math.PI * 2);
      ctx.moveTo(-0.15 * s, -0.38 * s);
      ctx.lineTo(-0.1 * s, -0.52 * s);
      ctx.lineTo(0.1 * s, -0.52 * s);
      ctx.lineTo(0.15 * s, -0.38 * s);
      break;
    case 'he_vessel':
      ctx.moveTo(-0.35 * s, 0.35 * s);
      ctx.bezierCurveTo(-0.4 * s, 0, -0.25 * s, -0.35 * s, 0, -0.42 * s);
      ctx.bezierCurveTo(0.25 * s, -0.35 * s, 0.4 * s, 0, 0.35 * s, 0.35 * s);
      ctx.lineTo(-0.35 * s, 0.35 * s);
      ctx.moveTo(0.42 * s, -0.05 * s);
      ctx.quadraticCurveTo(0.55 * s, 0.05 * s, 0.48 * s, 0.2 * s);
      break;
    case 'bird':
      ctx.moveTo(-0.4 * s, 0.1 * s);
      ctx.bezierCurveTo(-0.35 * s, -0.25 * s, -0.1 * s, -0.45 * s, 0.15 * s, -0.35 * s);
      ctx.bezierCurveTo(0.38 * s, -0.25 * s, 0.42 * s, 0.05 * s, 0.3 * s, 0.35 * s);
      ctx.lineTo(-0.25 * s, 0.38 * s);
      ctx.bezierCurveTo(-0.42 * s, 0.25 * s, -0.45 * s, 0.15 * s, -0.4 * s, 0.1 * s);
      ctx.moveTo(0.2 * s, -0.32 * s);
      ctx.lineTo(0.38 * s, -0.48 * s);
      break;
    default:
      ctx.ellipse(0, 0, 0.38 * s, 0.45 * s, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
}

export const ARTIFACT_LINEART = {
  'fuhao-xiao-zun': {
    silhouette: 'owl',
    patterns: [
      { id: 'beast_face', nx: 0.5, ny: 0.36, scale: 0.85 },
      { id: 'cloud', nx: 0.5, ny: 0.58, scale: 0.75 },
    ],
  },
  'shenshou-bronze': {
    silhouette: 'horned_beast',
    patterns: [
      { id: 'beast_face', nx: 0.5, ny: 0.38, scale: 0.9 },
      { id: 'kui_dragon', nx: 0.5, ny: 0.62, scale: 0.8 },
    ],
  },
  'shoumian-fang-gong': {
    silhouette: 'round_jar',
    patterns: [
      { id: 'beast_face', nx: 0.5, ny: 0.4, scale: 0.88 },
      { id: 'thunder', nx: 0.5, ny: 0.62, scale: 0.7 },
    ],
  },
  'panlong-he': {
    silhouette: 'he_vessel',
    patterns: [
      { id: 'kui_dragon', nx: 0.52, ny: 0.42, scale: 0.85 },
      { id: 'cloud', nx: 0.48, ny: 0.6, scale: 0.72 },
    ],
  },
  'pu-yan-he': {
    silhouette: 'bird',
    patterns: [
      { id: 'cloud', nx: 0.5, ny: 0.42, scale: 0.78 },
      { id: 'thunder', nx: 0.5, ny: 0.62, scale: 0.68 },
    ],
  },
};

export function getLineartLayout(artifactId) {
  return ARTIFACT_LINEART[artifactId] ?? {
    silhouette: 'round_jar',
    patterns: [{ id: 'beast_face', nx: 0.5, ny: 0.45, scale: 0.85 }],
  };
}
