/**
 * 青铜门蓄力转场 · BronzeDoorGate v3
 * 豫博青铜神兽录 · 首页进入展厅
 *
 * v3 根治了 v2 的缩放变形问题：
 *   门板 = CSS div（随屏自由铺满，纯色 + CSS 门钉纹理，不会变形）
 *   中央UI = 固定 480×480 的 SVG，永远居中、永不缩放
 *   两者彻底分离 —— 无论屏幕多大，云雷纹和兽面尺寸恒定
 *
 * 用法：
 *   import { BronzeDoorGate } from './BronzeDoorGate.js';
 *   const gate = new BronzeDoorGate({
 *     taotieSrc: '/images/taotie-gold.png',
 *     chargeMs: 1800,
 *     onOpen: () => router.switchSection('atlas'),   // 只切版块；门会自己销毁
 *   });
 *   gate.mount();
 *
 * PNG 材质门（可选）：
 *   new BronzeDoorGate({ doorLeft:'/images/door-left.png', doorRight:'/images/door-right.png', ... })
 */

const NS = 'http://www.w3.org/2000/svg';
const DEFAULT_TAOTIE_SRC = '/images/taotie-gold.png';

/** 首页/初始化时预载兽面，避免门首次 mount 时 SVG image 触发卡顿 */
export function preloadTaotieGold(src = DEFAULT_TAOTIE_SRC) {
  if (typeof window === 'undefined') return null;
  if (!window.__taotiePreload) {
    window.__taotiePreload = new Image();
    window.__taotiePreload.src = src;
  }
  return window.__taotiePreload;
}

const GOLD = '#C9A84C';
const GOLD_BRIGHT = '#E8CB6A';
const GOLD_HI = '#FFF3C4';
const PAT_OFF = '#3f5347';

// 中央UI画布：固定尺寸，永不缩放
const S = 480, C = S / 2;
const RING_R = 96, RING_C = 2 * Math.PI * RING_R;
const PET_N = 24, PET_R = 150;      // 24组云雷纹，更密
const TAOTIE = 132;

/** 蓄满后：90ms 爆光延迟 + 2s 推门 + 余量 ≈ 2600ms */
const OPEN_DESTROY_FALLBACK_MS = 2600;

/** 清除 document 中不属于当前活跃实例的青铜门 DOM */
export function purgeOrphanBronzeGateDom() {
  const activeRoot = window.__bronzeGate?.root ?? null;

  document.querySelectorAll('.bronze-gate').forEach((el) => {
    if (el === activeRoot) return;
    el.remove();
  });

  document.querySelectorAll('.gate-seam, .gate-flash').forEach((el) => {
    if (!el.isConnected) return;
    if (el.closest('.bronze-gate')) return;
    el.remove();
  });
}

/** 清除残留青铜门 DOM / 失活实例，不碰正在工作的门 */
export function purgeStaleBronzeGates() {
  const gate = window.__bronzeGate;
  const activeRoot = gate?.root;

  purgeOrphanBronzeGateDom();

  // 失活实例（root 已不在 DOM）才 destroy；仍在 DOM 的蓄力/预载/推门门不动
  if (gate && !gate._destroyed && !activeRoot?.isConnected) {
    if (!activeRoot?.classList.contains('is-opening')) {
      gate.destroy();
    }
  }
}

export class BronzeDoorGate {
  constructor({
    container = document.body,
    doorLeft, doorRight,
    taotieSrc = DEFAULT_TAOTIE_SRC,
    chargeMs = 1800,
    onOpen,
    onDestroy,
  } = {}) {
    Object.assign(this, { container, doorLeft, doorRight, taotieSrc, chargeMs, onOpen, onDestroy });
    this.t = 0; this.holding = false; this.done = false; this.raf = null;
    this._destroyed = false;
    this._hidden = false;
    this._lastLit = -1;
    this._lastGlowStep = -1;
    this._onLeafTransitionEnd = null;
    this._openDestroyArmed = false;
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._loop = this._loop.bind(this);

    preloadTaotieGold(this.taotieSrc);
    this._uiSvg = this._buildUi();
  }

  mount({ hidden = false } = {}) {
    if (this.root?.isConnected) {
      if (hidden) this._setHidden(true);
      else this.reveal();
      return;
    }

    const usePng = !!(this.doorLeft && this.doorRight);
    this.root = document.createElement('div');
    this.root.className = 'bronze-gate' + (usePng ? ' bronze-gate--png' : '');
    this.root.innerHTML =
      '<div class="gate-leaf gate-leaf--l"' +
        (usePng ? ' style="background-image:url(' + this.doorLeft + ')"' : '') + '></div>' +
      '<div class="gate-leaf gate-leaf--r"' +
        (usePng ? ' style="background-image:url(' + this.doorRight + ')"' : '') + '></div>' +
      '<div class="gate-seam"></div>' +
      '<div class="gate-vignette"></div>' +
      '<div class="gate-hint">长 按 蓄 力</div>' +
      '<div class="gate-flash"></div>';

    this.leafL = this.root.querySelector('.gate-leaf--l');
    this.leafR = this.root.querySelector('.gate-leaf--r');
    this.seam = this.root.querySelector('.gate-seam');
    this.hintEl = this.root.querySelector('.gate-hint');
    this.flash = this.root.querySelector('.gate-flash');
    this.seam.style.width = '12px';
    this._ensureOverlayLayersInert();

    this.root.appendChild(this._uiSvg);
    this.container.appendChild(this.root);
    window.__bronzeGate = this;

    this.root.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this._paint();
    this._setHidden(hidden);
    console.log('[Gate] mounted, knob=', this.knob);
  }

  reveal() {
    this._setHidden(false);
  }

  _setHidden(hidden) {
    this._hidden = hidden;
    if (!this.root) return;
    this.root.style.visibility = hidden ? 'hidden' : '';
    this.root.style.pointerEvents = hidden ? 'none' : '';
  }

  /* ---------- 中央UI：固定 480×480，永不缩放 ---------- */
  _buildUi() {
    const svg = this._el('svg', {
      class: 'gate-ui',
      viewBox: '0 0 ' + S + ' ' + S,
      width: S, height: S,          // 固定像素，不随屏幕变
      xmlns: NS,
      style: 'pointer-events:auto',
    });

    // 云雷纹一圈（24组，密而规整）
    this.pets = [];
    const ring = this._el('g');
    for (let i = 0; i < PET_N; i++) {
      const a = (i / PET_N) * Math.PI * 2 - Math.PI / 2;
      const x = C + Math.cos(a) * PET_R;
      const y = C + Math.sin(a) * PET_R;
      const g = this._el('g', {
        opacity: 0.14,
        transform: 'rotate(' + ((i / PET_N) * 360 + 90) + ' ' + x + ' ' + y + ')',
      });
      // 单元回字纹：小而工整
      const p = this._el('path', {
        d: 'M' + (x - 9) + ' ' + (y - 6) + ' h6 v3 h-3 v3 h6 v-9 h3 v12 h-12 z',
        stroke: PAT_OFF, 'stroke-width': 1.4, fill: 'none',
        'stroke-linecap': 'square', 'stroke-linejoin': 'miter',
      });
      g.appendChild(p);
      ring.appendChild(g);
      this.pets.push({ g, p });
    }
    svg.appendChild(ring);

    // 外细圈
    svg.appendChild(this._el('circle', {
      cx: C, cy: C, r: 128, fill: 'none', stroke: GOLD, 'stroke-width': 0.7, opacity: 0.13,
    }));

    // 衔环底盘
    svg.appendChild(this._el('circle', { cx: C, cy: C, r: RING_R, fill: '#080b07', opacity: 0.9 }));
    svg.appendChild(this._el('circle', {
      cx: C, cy: C, r: RING_R, fill: 'none', stroke: GOLD, 'stroke-width': 5, opacity: 0.18,
    }));

    // 蓄力环
    this.prog = this._el('circle', {
      cx: C, cy: C, r: RING_R, fill: 'none', stroke: GOLD_BRIGHT,
      'stroke-width': 5, 'stroke-linecap': 'round',
      'stroke-dasharray': RING_C.toFixed(1),
      'stroke-dashoffset': RING_C.toFixed(1),
      transform: 'rotate(-90 ' + C + ' ' + C + ')',
    });
    svg.appendChild(this.prog);

    // 内虚线圈
    svg.appendChild(this._el('circle', {
      cx: C, cy: C, r: 80, fill: 'none', stroke: GOLD,
      'stroke-width': 0.7, 'stroke-dasharray': '2 5', opacity: 0.3,
    }));

    // 中央兽面（真实纹样图）
    this.taotie = this._el('image', {
      class: 'gate-taotie glow-0',
      x: C - TAOTIE / 2, y: C - TAOTIE / 2,
      width: TAOTIE, height: TAOTIE,
      opacity: 0.55,
    });
    this.taotie.setAttribute('href', this.taotieSrc);
    this.taotie.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', this.taotieSrc);
    svg.appendChild(this.taotie);

    // 命中层（最上，扩大中央可点区域）
    this.knob = this._el('circle', {
      cx: C, cy: C, r: 170, fill: 'transparent', style: 'cursor:pointer',
    });
    svg.appendChild(this.knob);

    return svg;
  }

  /* ---------- 交互 ---------- */
  _onDown(e) {
    console.log('[Gate] pointerdown 触发了！done=', this.done, 'raf=', this.raf);
    if (this.done) return;
    e.preventDefault();
    this.holding = true;
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
  }

  _onUp() {
    this.holding = false;
    if (this.done) return;
    if (!this.raf && this.t > 0) this.raf = requestAnimationFrame(this._loop);
  }

  _loop() {
    if (this.done) {
      this.raf = null;
      return;
    }

    const up = 16.7 / this.chargeMs;
    this.t = this.holding ? Math.min(1, this.t + up) : Math.max(0, this.t - up * 3);
    if (Math.random() < 0.05) console.log('[Gate] loop t=', this.t.toFixed(2), 'holding=', this.holding);
    this._paint();
    if (this.t >= 1 && !this.done) {
      this.done = true;
      if (this.raf != null) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
      }
      this._open();
      return;
    }
    this.raf = (this.t > 0 || this.holding) ? requestAnimationFrame(this._loop) : null;
  }

  _paint() {
    const t = this.t;

    this.prog.setAttribute('stroke-dashoffset', (RING_C * (1 - t)).toFixed(1));
    this.prog.setAttribute('stroke', t >= 1 ? GOLD_HI : GOLD_BRIGHT);

    const lit = Math.floor(t * PET_N + 0.001);
    if (lit !== this._lastLit) {
      this._lastLit = lit;
      this.pets.forEach(function (o, i) {
        const on = i < lit;
        o.g.setAttribute('opacity', on ? 0.95 : 0.14);
        o.p.setAttribute('stroke', on ? GOLD_BRIGHT : PAT_OFF);
      });
    }

    this.seam.style.opacity = (0.2 + t * 0.8).toFixed(2);
    this.seam.style.transform =
      'translateX(-50%) scaleX(' + ((3 + t * 9) / 12).toFixed(3) + ')';

    const step = Math.round(t * 5);
    if (step !== this._lastGlowStep) {
      this._lastGlowStep = step;
      this.taotie.setAttribute('class', 'gate-taotie glow-' + step);
    }
    this.taotie.setAttribute('opacity', (0.55 + t * 0.45).toFixed(2));
  }

  /* ---------- 蓄满：门后先切版块 → 爆光 → 推开 → 自毁 ---------- */
  _open() {
    this.hintEl.style.opacity = '0';

    // 关键：门还关着时先切版块，推开后露出的直接是展厅
    if (this.onOpen) this.onOpen();

    this._prepareOpenOverlaysForExit();
    this.root.classList.add('is-flash');
    setTimeout(() => {
      if (this._destroyed) return;
      this.root?.classList.add('is-opening');
    }, 90);

    this._armDestroyAfterOpen();
  }

  /** 推门阶段：清掉蓄力 inline 样式，避免 seam 内联 opacity 压过 CSS 隐藏规则 */
  _prepareOpenOverlaysForExit() {
    if (this.seam) {
      this.seam.style.opacity = '0';
      this.seam.style.transform = '';
      this.seam.style.pointerEvents = 'none';
    }
    if (this.flash) {
      this.flash.style.pointerEvents = 'none';
    }
  }

  _ensureOverlayLayersInert() {
    if (this.seam) this.seam.style.pointerEvents = 'none';
    if (this.flash) this.flash.style.pointerEvents = 'none';
  }

  _armDestroyAfterOpen() {
    this._openDestroyArmed = true;

    this._onLeafTransitionEnd = (e) => {
      if (!this._openDestroyArmed || this._destroyed) return;
      if (!e || e.propertyName !== 'transform') return;
      if (e.target !== this.leafL && e.target !== this.leafR) return;
      this._openDestroyArmed = false;
      this.destroy();
    };

    this.leafL?.addEventListener('transitionend', this._onLeafTransitionEnd);
    this.leafR?.addEventListener('transitionend', this._onLeafTransitionEnd);

    this._closeTimer = window.setTimeout(() => {
      if (!this._openDestroyArmed || this._destroyed) return;
      this._openDestroyArmed = false;
      this.destroy();
    }, OPEN_DESTROY_FALLBACK_MS);
  }

  _detachOpenCompletionListeners() {
    this._openDestroyArmed = false;
    if (this._onLeafTransitionEnd) {
      this.leafL?.removeEventListener('transitionend', this._onLeafTransitionEnd);
      this.leafR?.removeEventListener('transitionend', this._onLeafTransitionEnd);
      this._onLeafTransitionEnd = null;
    }
    if (this._closeTimer != null) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
  }

  _removeGateDom() {
    const root = this.root;
    if (!root) return;

    root.removeEventListener('pointerdown', this._onDown);

    // 显式移除光效层，再删 root，避免个别环境下子树残留
    this.seam?.remove();
    this.flash?.remove();
    this.seam = null;
    this.flash = null;

    if (root.isConnected) {
      root.remove();
    }
    this.root = null;
    this.leafL = null;
    this.leafR = null;
    this.hintEl = null;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    this._detachOpenCompletionListeners();

    if (this.raf != null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this._lastLit = -1;
    this._lastGlowStep = -1;
    window.removeEventListener('pointerup', this._onUp);

    this._removeGateDom();

    if (window.__bronzeGate === this) {
      window.__bronzeGate = null;
    }

    if (this.onDestroy) this.onDestroy();

    requestAnimationFrame(() => {
      purgeOrphanBronzeGateDom();
    });
  }

  _el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    attrs = attrs || {};
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
}
