import * as THREE from 'three';
import relics from '../data/relics.json';

/** 左右边缘停靠栏：距画面边 30~60px */
const DOCK_MARGIN = 45;
/** 标签最小间距（可调）— 避让算法核心参数 */
const MIN_LABEL_GAP = 64;
const MIN_LABEL_GAP_FLOOR = 40;
const FADE_START = 0.3;
const VIEW_MARGIN = 36;
/** 标签块半高估算（translateY -50% 中心定位） */
const LABEL_HALF_H = 22;
const DOT_R = 2.5;

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function resolvePieceMeta(relic, partId) {
  const raw = relic?.pieces?.[partId];
  if (!raw) return null;
  if (typeof raw === 'string') return { name: raw, order: 0 };
  return { name: raw.name, order: raw.order ?? 0 };
}

function formatPartKey(partId) {
  return partId.replace(/_/g, ' ').toUpperCase();
}

/**
 * 分件标注层
 * - SVG：质心锚点 + L 形引线（逻辑不变）
 * - HTML：横展线三行标签（发光圆点 + 名称 + 渐隐金线 + 小字）
 */
export class PartLabelOverlay {
  constructor(stageEl) {
    this.stageEl = stageEl;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'part-label-layer part-label-svg');
    this.svg.setAttribute('aria-hidden', 'true');
    this._initDefs();
    this.leaderG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.leaderG.setAttribute('class', 'part-label-leaders');
    this.svg.append(this.defs, this.leaderG);
    stageEl.appendChild(this.svg);

    this.htmlLayer = document.createElement('div');
    this.htmlLayer.className = 'part-label-html-layer';
    this.htmlLayer.setAttribute('aria-hidden', 'true');
    stageEl.appendChild(this.htmlLayer);

    this._visible = false;
    this._projectVec = new THREE.Vector3();
    this._animate = false;
    /** @type {Map<string, HTMLElement>} */
    this._labelEls = new Map();
  }

  _initDefs() {
    this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    glow.setAttribute('id', 'part-dot-glow');
    glow.setAttribute('x', '-80%');
    glow.setAttribute('y', '-80%');
    glow.setAttribute('width', '260%');
    glow.setAttribute('height', '260%');
    glow.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="0 0 0 0 0.79  0 0 0 0 0.66  0 0 0 0 0.30  0 0 0 0.85 0"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    `;
    this.defs.append(glow);
  }

  setVisible(show) {
    this._visible = show;
    this.svg.classList.toggle('visible', show);
    this.htmlLayer.classList.toggle('visible', show);
    if (!show) {
      this.leaderG.replaceChildren();
      this.htmlLayer.replaceChildren();
      this._labelEls.clear();
      this._animate = false;
    }
  }

  update(camera, pointCloud, artifactId) {
    if (!this._visible || !pointCloud?.points) {
      this.leaderG.replaceChildren();
      this.htmlLayer.replaceChildren();
      return;
    }

    const progress = pointCloud.getDeconstructProgress();
    if (progress < FADE_START) {
      this.svg.style.opacity = '0';
      this.htmlLayer.style.opacity = '0';
      this._animate = false;
      this._labelEls.forEach((el) => el.classList.remove('part-dock-label--animate'));
      return;
    }

    const labelOpacity = smoothstep((progress - FADE_START) / (1 - FADE_START));
    this.svg.style.opacity = String(labelOpacity);
    this.htmlLayer.style.opacity = String(labelOpacity);

    if (!this._animate && labelOpacity > 0.05) {
      this._animate = true;
      this._triggerGoldLineReveal();
    }

    const relic = relics[artifactId];
    const era = relic?.era ?? '';
    const rect = this.stageEl.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const leftDock = [];
    const rightDock = [];

    for (const [partId, worldPos] of Object.entries(pointCloud.getPartAnchorWorldPositions())) {
      const meta = resolvePieceMeta(relic, partId);
      if (!meta?.name) continue;

      this._projectVec.copy(worldPos);
      this._projectVec.project(camera);
      if (this._projectVec.z > 1) continue;

      const sx = (this._projectVec.x * 0.5 + 0.5) * w;
      const sy = (-this._projectVec.y * 0.5 + 0.5) * h;

      const item = {
        partId,
        name: meta.name,
        order: meta.order,
        sub: `${formatPartKey(partId)} · ${era}分铸件`,
        sx,
        sy,
        expectedY: sy,
        labelY: sy,
        compact: false,
      };
      if (sx <= w * 0.5) leftDock.push(item);
      else rightDock.push(item);
    }

    const leftX = DOCK_MARGIN;
    const rightX = w - DOCK_MARGIN;

    this._resolveLabelAvoidance(leftDock, h);
    this._resolveLabelAvoidance(rightDock, h);

    const labels = [
      ...leftDock.map((lb) => ({
        ...lb,
        dockX: leftX,
        side: 'left',
        dotX: leftX + DOT_R,
      })),
      ...rightDock.map((lb) => ({
        ...lb,
        dockX: rightX,
        side: 'right',
        dotX: rightX - DOT_R,
      })),
    ];

    this._renderLeaders(labels);
    this._renderHtmlLabels(labels, w);
  }

  /** 金线卷轴展开：width 0 → 160px，时长见 CSS --pl-line-duration（默认 0.5s） */
  _triggerGoldLineReveal() {
    requestAnimationFrame(() => {
      this._labelEls.forEach((el) => {
        el.classList.remove('part-dock-label--animate');
        void el.offsetWidth;
        requestAnimationFrame(() => el.classList.add('part-dock-label--animate'));
      });
    });
  }

  /**
   * 标签 Y 避让 — 左/右栏各自独立
   * ① 期望Y = 质心投影Y → ② 排序 → ③ 下推(MIN_LABEL_GAP)
   * → ④ 溢出上移 → ⑤ 边界钳制；仍放不下则缩小间距/紧凑字号
   */
  _resolveLabelAvoidance(items, stageH) {
    if (items.length === 0) return;

    const minY = VIEW_MARGIN + LABEL_HALF_H;
    const maxY = stageH - VIEW_MARGIN - LABEL_HALF_H;

    let gap = MIN_LABEL_GAP;
    let resolved = false;

    while (gap >= MIN_LABEL_GAP_FLOOR) {
      items.forEach((it) => {
        it.labelY = it.expectedY;
        it.compact = gap < MIN_LABEL_GAP;
      });

      items.sort((a, b) => a.expectedY - b.expectedY);

      // ③ 从上往下：当前 Y < 上一个 + gap → 下推
      for (let i = 1; i < items.length; i++) {
        const need = items[i - 1].labelY + gap;
        if (items[i].labelY < need) items[i].labelY = need;
      }

      // ④ 最后一个超出底部 → 整组上移溢出量
      const bottomOverflow = items[items.length - 1].labelY - maxY;
      if (bottomOverflow > 0) {
        items.forEach((it) => { it.labelY -= bottomOverflow; });
      }

      // ⑤ 顶部越界 → 整组下移
      const topOverflow = minY - items[0].labelY;
      if (topOverflow > 0) {
        items.forEach((it) => { it.labelY += topOverflow; });
      }

      if (items[0].labelY >= minY && items[items.length - 1].labelY <= maxY) {
        resolved = true;
        break;
      }
      gap -= 8;
    }

    // 仍放不下：等距压缩到可视区 + 紧凑字号
    if (!resolved && items.length > 1) {
      const span = maxY - minY;
      const step = span / (items.length - 1);
      items.forEach((it, i) => {
        it.labelY = minY + i * step;
        it.compact = true;
      });
    } else if (!resolved && items.length === 1) {
      items[0].labelY = THREE.MathUtils.clamp(items[0].expectedY, minY, maxY);
      items[0].compact = true;
    }
  }

  /** SVG：质心(起点) → L 形折线 → 避让后的标签 Y(终点) */
  _renderLeaders(labels) {
    this.leaderG.replaceChildren();

    for (const lb of labels) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      const anchorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      anchorDot.setAttribute('cx', String(lb.sx));
      anchorDot.setAttribute('cy', String(lb.sy));
      anchorDot.setAttribute('r', '5');
      anchorDot.setAttribute('class', 'part-label-anchor-dot');
      anchorDot.setAttribute('filter', 'url(#part-dot-glow)');

      const endX = lb.dotX;
      const endY = lb.labelY;

      // L 形：质心水平 → 停靠栏 X → 垂直到避让后的标签 Y（可长可短）
      const leaderH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      leaderH.setAttribute('x1', String(lb.sx));
      leaderH.setAttribute('y1', String(lb.sy));
      leaderH.setAttribute('x2', String(endX));
      leaderH.setAttribute('y2', String(lb.sy));
      leaderH.setAttribute('class', 'part-label-line');

      const leaderV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      leaderV.setAttribute('x1', String(endX));
      leaderV.setAttribute('y1', String(lb.sy));
      leaderV.setAttribute('x2', String(endX));
      leaderV.setAttribute('y2', String(endY));
      leaderV.setAttribute('class', 'part-label-line');

      g.append(anchorDot, leaderH, leaderV);
      this.leaderG.append(g);
    }
  }

  /**
   * HTML 横展线三行结构 + 左右镜像（复用 DOM，保留金线展开动效）
   */
  _renderHtmlLabels(labels, stageW) {
    const seen = new Set();

    for (const lb of labels) {
      seen.add(lb.partId);
      let el = this._labelEls.get(lb.partId);
      if (!el) {
        el = this._createLabelEl(lb);
        this._labelEls.set(lb.partId, el);
        this.htmlLayer.append(el);
        if (!el.classList.contains('part-dock-label--animate')) {
          requestAnimationFrame(() => el.classList.add('part-dock-label--animate'));
        }
      }

      el.style.top = `${lb.labelY}px`;
      if (lb.side === 'left') {
        el.style.left = `${lb.dockX}px`;
        el.style.right = '';
      } else {
        el.style.right = `${stageW - lb.dockX}px`;
        el.style.left = '';
      }
      el.classList.toggle('part-dock-label--left', lb.side === 'left');
      el.classList.toggle('part-dock-label--right', lb.side === 'right');
      el.classList.toggle('part-dock-label--compact', !!lb.compact);
      el.querySelector('.part-label-name').textContent = lb.name;
      el.querySelector('.part-label-sub').textContent = lb.sub;
    }

    for (const [id, el] of this._labelEls) {
      if (!seen.has(id)) {
        el.remove();
        this._labelEls.delete(id);
      }
    }
  }

  _createLabelEl(lb) {
    const el = document.createElement('div');
    el.className = `part-dock-label part-dock-label--${lb.side}`;
    el.dataset.partId = lb.partId;
    el.innerHTML = `
      <div class="part-label-row1">
        <span class="part-label-glow-dot" aria-hidden="true"></span>
        <span class="part-label-name">${lb.name}</span>
      </div>
      <div class="part-label-gold-line" aria-hidden="true"></div>
      <div class="part-label-sub">${lb.sub}</div>
    `;
    return el;
  }

  dispose() {
    this.svg.remove();
    this.htmlLayer.remove();
  }
}
