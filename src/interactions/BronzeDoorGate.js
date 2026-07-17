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

const GOLD = '#C9A84C';
const GOLD_BRIGHT = '#E8CB6A';
const GOLD_HI = '#FFF3C4';
const PAT_OFF = '#3f5347';

// 中央UI画布：固定尺寸，永不缩放
const S = 480, C = S / 2;
const RING_R = 96, RING_C = 2 * Math.PI * RING_R;
const PET_N = 24, PET_R = 150;      // 24组云雷纹，更密
const TAOTIE = 132;

/** 清除残留青铜门 DOM / 失活实例，不碰正在工作的门 */
export function purgeStaleBronzeGates() {
  const gate = window.__bronzeGate;
  const activeRoot = gate?.root;

  // 【1】只清 DOM 残留：跳过正在推开的门与当前实例的 root
  document.querySelectorAll('.bronze-gate').forEach((el) => {
    if (el === activeRoot) return;
    if (!el.classList.contains('is-opening')) el.remove();
  });

  // 【2】失活实例（root 已不在 DOM）才 destroy；仍在 DOM 的蓄力/预载门不动
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
    taotieSrc = '/images/taotie-gold.png',
    chargeMs = 1800,
    onOpen,
  } = {}) {
    Object.assign(this, { container, doorLeft, doorRight, taotieSrc, chargeMs, onOpen });
    this.t = 0; this.holding = false; this.done = false; this.raf = null;
    this._destroyed = false;
    this._lastLit = -1;
    this._lastGlowStep = -1;
    this._onLeafTransitionEnd = null;
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._loop = this._loop.bind(this);
  }

  mount() {
    const preload = new Image();
    preload.src = this.taotieSrc;

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

    this.root.appendChild(this._buildUi());
    this.container.appendChild(this.root);
    window.__bronzeGate = this;

    this.root.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this._paint();
    console.log('[Gate] mounted, knob=', this.knob);
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
      x: C - TAOTIE / 2, y: C - TAOTIE / 2,
      width: TAOTIE, height: TAOTIE,
      opacity: 0.55, style: 'pointer-events:none',
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
    if (!this.raf && this.t > 0) this.raf = requestAnimationFrame(this._loop);
  }

  _loop() {
    const up = 16.7 / this.chargeMs;
    this.t = this.holding ? Math.min(1, this.t + up) : Math.max(0, this.t - up * 3);
    if (Math.random() < 0.05) console.log('[Gate] loop t=', this.t.toFixed(2), 'holding=', this.holding);
    this._paint();
    if (this.t >= 1 && !this.done) { this.done = true; this._open(); }
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
      this.taotie.style.filter =
        'brightness(' + (0.85 + step * 0.11).toFixed(2) + ') ' +
        'drop-shadow(0 0 ' + (step * 2.8).toFixed(1) + 'px rgba(232,203,106,' + (step * 0.18).toFixed(2) + '))';
    }
    this.taotie.setAttribute('opacity', (0.55 + t * 0.45).toFixed(2));
  }

  /* ---------- 蓄满：门后先切版块 → 爆光 → 推开 → 自毁 ---------- */
  _open() {
    const self = this;
    this.hintEl.style.opacity = '0';

    // 关键：门还关着时先切版块，推开后露出的直接是展厅
    if (this.onOpen) this.onOpen();

    this.root.classList.add('is-flash');
    setTimeout(function () { self.root.classList.add('is-opening'); }, 90);

    const leaf = this.leafR;
    this._onLeafTransitionEnd = function onEnd(e) {
      if (e && e.propertyName !== 'transform') return;
      leaf.removeEventListener('transitionend', onEnd);
      self._onLeafTransitionEnd = null;
      self.destroy();
    };
    leaf.addEventListener('transitionend', this._onLeafTransitionEnd);
    // 兜底：transitionend 未触发时仍清理
    this._closeTimer = setTimeout(function () { self.destroy(); }, 3000);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null; }
    if (this.leafR && this._onLeafTransitionEnd) {
      this.leafR.removeEventListener('transitionend', this._onLeafTransitionEnd);
      this._onLeafTransitionEnd = null;
    }
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this._lastLit = -1;
    this._lastGlowStep = -1;
    this.root?.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);

    if (this.root?.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;

    if (window.__bronzeGate === this) {
      window.__bronzeGate = null;
    }
  }

  _el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    attrs = attrs || {};
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
}
