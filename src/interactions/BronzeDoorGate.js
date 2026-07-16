/**
 * 青铜门蓄力转场 · BronzeDoorGate v2
 * 豫博青铜神兽录 · 首页进入展厅
 *
 * v2 更新：
 *   - 中央兽面改用真实纹样图 taotie-gold.png（替代手绘SVG）
 *   - 门板压到近黑，统一主页 #0a0d0a 调性
 *   - 门板加暗兽面浮雕肌理 + 暗角
 *   - 全屏覆盖层（配合 CSS 的 fixed / inset:0 / z-index:999）
 *
 * 两套皮肤：
 *   mode:'svg' → 纯色门板（零素材，现在能用）
 *   mode:'png' → 青铜材质门图（传 doorLeft/doorRight，UI层不变）
 *
 * 用法：
 *   import { BronzeDoorGate } from './BronzeDoorGate.js';
 *   const gate = new BronzeDoorGate({
 *     container: document.body,
 *     mode: 'svg',
 *     taotieSrc: '/images/taotie-gold.png',
 *     chargeMs: 1800,
 *     onOpen: async () => { await router.switchSection('atlas'); await atlas.whenReady(); },
 *     onComplete: () => { gate = null; },
 *   });
 *   gate.mount();
 */

const NS = 'http://www.w3.org/2000/svg';

const PALETTE = {
  bg: '#0a0d0a',
  doorL: '#12170f',
  doorR: '#0d120b',
  relief: '#2b3626',
  seamDark: '#040603',
  studShadow: '#040603',
  studBase: '#1c2418',
  studMid: '#242e1e',
  studHi: '#3a4730',
  patternOff: '#4a6152',
  patternOn: '#E8CB6A',
  gold: '#C9A84C',
  goldBright: '#E8CB6A',
  goldHi: '#FFF3C4',
  knobBg: '#080b07',
};

const W = 680, H = 400, CX = 340, CY = 200;
const RING_R = 70, RING_C = 2 * Math.PI * RING_R;
const PET_N = 16, PET_R = 118;
const TAOTIE_SIZE = 104;

const STUDS = [
  [70, 55], [150, 55], [230, 55], [450, 55], [530, 55], [610, 55],
  [70, 200], [610, 200],
  [70, 345], [150, 345], [230, 345], [450, 345], [530, 345], [610, 345],
];

const RELIEF = [
  'M110 110 q40 -32 80 -4 q18 14 22 38', 'M570 110 q-40 -32 -80 -4 q-18 14 -22 38',
  'M88 208 h42 v-15 h-21 v-13 h21 v-15 h-42 z', 'M592 208 h-42 v-15 h21 v-13 h-21 v-15 h42 z',
  'M88 264 h42 v15 h-21 v13 h21 v15 h-42 z', 'M592 264 h-42 v15 h21 v13 h-21 v15 h42 z',
  'M140 296 q30 22 60 6 q15 -9 19 -28', 'M540 296 q-30 22 -60 6 q-15 -9 -19 -28',
  'M200 56 h32 v13 h-17 v11 h17 v13 h-32 z', 'M480 56 h-32 v13 h17 v11 h-17 v13 h32 z',
  'M200 344 h32 v-13 h-17 v-11 h17 v-13 h-32 z', 'M480 344 h-32 v-13 h17 v-11 h-17 v-13 h32 z',
];

export class BronzeDoorGate {
  constructor({
    container = document.body, mode = 'svg',
    doorLeft, doorRight, taotieSrc = '/images/taotie-gold.png',
    chargeMs = 1800, onOpen, onComplete,
  } = {}) {
    Object.assign(this, { container, mode, doorLeft, doorRight, taotieSrc, chargeMs, onOpen, onComplete });
    this.t = 0; this.holding = false; this.done = false; this.raf = null;
    this._lastLit = -1;
    this._awaitPulseRaf = null;
    this._onDown = this._onDown.bind(this);
    this._onUp = this._onUp.bind(this);
    this._loop = this._loop.bind(this);
  }

  mount() {
    this.root = document.createElement('div');
    this.root.className = 'bronze-gate';
    this.root.innerHTML =
      '<div class="bronze-gate__hint">长 按 蓄 力</div>' +
      '<div class="bronze-gate__stage"></div>';
    this.stage = this.root.querySelector('.bronze-gate__stage');
    this.hintEl = this.root.querySelector('.bronze-gate__hint');

    this.mode === 'png' ? this._buildPngDoors() : this._buildSvgDoors();
    this._buildUiLayer();

    this.container.appendChild(this.root);
    this.knob.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this.knob.addEventListener('pointerleave', this._onUp);
    this._paint();
  }

  /* ---------- 皮肤A：纯色SVG门板 ---------- */
  _buildSvgDoors() {
    const svg = this._svgRoot();
    const g = this._el('g', { 'clip-path': 'url(#bg-clip)' });
    // 底色挂在门板上，开门时随叶移走，缝里直接露出展厅
    this.leafL = this._el('g', { class: 'gate-leaf gate-leaf--l' });
    this.leafR = this._el('g', { class: 'gate-leaf gate-leaf--r' });
    this.leafL.appendChild(this._el('rect', { x: 0, y: 0, width: CX, height: H, fill: PALETTE.doorL }));
    this.leafR.appendChild(this._el('rect', { x: CX, y: 0, width: CX, height: H, fill: PALETTE.doorR }));

    RELIEF.forEach((d, i) => {
      const leaf = (i % 2 === 0) ? this.leafL : this.leafR;
      leaf.appendChild(this._el('path', {
        d, stroke: PALETTE.relief, fill: 'none', 'stroke-width': 2.4, opacity: 0.85,
      }));
    });
    [[166, 170, this.leafL], [514, 170, this.leafR]].forEach(([x, y, leaf]) => {
      [19, 7].forEach((r) => leaf.appendChild(this._el('circle', {
        cx: x, cy: y, r, stroke: PALETTE.relief, fill: 'none', 'stroke-width': 2.4, opacity: 0.85,
      })));
    });

    STUDS.forEach(([x, y]) => {
      const leaf = x < CX ? this.leafL : this.leafR;
      leaf.appendChild(this._el('circle', { cx: x + 1.5, cy: y + 2, r: 11, fill: PALETTE.studShadow, opacity: 0.7 }));
      leaf.appendChild(this._el('circle', { cx: x, cy: y, r: 11, fill: PALETTE.studBase }));
      leaf.appendChild(this._el('circle', { cx: x - 0.8, cy: y - 1.2, r: 8.4, fill: PALETTE.studMid }));
      leaf.appendChild(this._el('circle', { cx: x - 3, cy: y - 3.4, r: 3.2, fill: PALETTE.studHi, opacity: 0.7 }));
    });

    this.leafL.appendChild(this._el('rect', { x: CX - 14, y: 0, width: 14, height: H, fill: PALETTE.seamDark, opacity: 0.75 }));
    this.leafR.appendChild(this._el('rect', { x: CX, y: 0, width: 12, height: H, fill: PALETTE.seamDark, opacity: 0.5 }));

    g.appendChild(this.leafL);
    g.appendChild(this.leafR);
    svg.appendChild(g);
    this.svg = svg;
    this.stage.appendChild(svg);
  }

  /* ---------- 皮肤B：PNG材质门板 ---------- */
  _buildPngDoors() {
    this.stage.insertAdjacentHTML('afterbegin',
      '<img class="gate-leaf gate-leaf--l" src="' + this.doorLeft + '" alt="">' +
      '<img class="gate-leaf gate-leaf--r" src="' + this.doorRight + '" alt="">');
    this.leafL = this.stage.querySelector('.gate-leaf--l');
    this.leafR = this.stage.querySelector('.gate-leaf--r');
    this.svg = this._svgRoot();
    this.stage.appendChild(this.svg);
  }

  /* ---------- UI层：门缝光 + 云雷纹 + 衔环 + 兽面PNG ---------- */
  _buildUiLayer() {
    const ui = this._el('g', { class: 'gate-ui' });

    this.seam = this._el('rect', { x: CX - 3, y: 0, width: 6, height: H, fill: 'url(#gate-seam)', opacity: 0.22 });
    ui.appendChild(this.seam);

    this.pets = [];
    const petsG = this._el('g', { fill: 'none', 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' });
    for (let i = 0; i < PET_N; i++) {
      const a = (i / PET_N) * Math.PI * 2 - Math.PI / 2;
      const x = CX + Math.cos(a) * PET_R, y = CY + Math.sin(a) * PET_R;
      const g = this._el('g', { opacity: 0.1, transform: 'rotate(' + (i / PET_N) * 360 + ' ' + x + ' ' + y + ')' });
      const p = this._el('path', {
        d: 'M' + (x - 14) + ' ' + (y - 8) + ' h9 v4 h-4 v4 h8 v-12 h4 v16 h-17 z M' + (x + 4) + ' ' + (y - 8) + ' h10 v16 h-4 v-12 h-3 v8 h-3 z',
        stroke: PALETTE.patternOff, 'stroke-width': 2, fill: 'none',
      });
      g.appendChild(p);
      petsG.appendChild(g);
      this.pets.push({ g, p });
    }
    ui.appendChild(petsG);

    ui.appendChild(this._el('circle', { cx: CX, cy: CY, r: 96, fill: 'none', stroke: PALETTE.gold, 'stroke-width': 0.8, opacity: 0.14 }));
    ui.appendChild(this._el('circle', { cx: CX, cy: CY, r: RING_R, fill: PALETTE.knobBg, opacity: 0.95 }));
    ui.appendChild(this._el('circle', { cx: CX, cy: CY, r: RING_R, fill: 'none', stroke: PALETTE.gold, 'stroke-width': 4.5, opacity: 0.16 }));

    this.prog = this._el('circle', {
      cx: CX, cy: CY, r: RING_R, fill: 'none', stroke: PALETTE.goldBright,
      'stroke-width': 4.5, 'stroke-linecap': 'round',
      'stroke-dasharray': RING_C.toFixed(1), 'stroke-dashoffset': RING_C.toFixed(1),
      transform: 'rotate(-90 ' + CX + ' ' + CY + ')',
    });
    ui.appendChild(this.prog);
    ui.appendChild(this._el('circle', { cx: CX, cy: CY, r: 58, fill: 'none', stroke: PALETTE.gold, 'stroke-width': 0.8, 'stroke-dasharray': '2 5', opacity: 0.3 }));

    // 中央兽面：真实纹样图（不拦截点击）
    this.taotie = this._el('image', {
      x: CX - TAOTIE_SIZE / 2, y: CY - TAOTIE_SIZE / 2,
      width: TAOTIE_SIZE, height: TAOTIE_SIZE,
      opacity: 0.62, 'pointer-events': 'none',
    });
    this.taotie.setAttribute('href', this.taotieSrc);
    this.taotie.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', this.taotieSrc);
    ui.appendChild(this.taotie);

    // 暗角 / 爆光条必须 pointer-events:none，否则会盖住兽面中轴导致点不准
    ui.appendChild(this._el('rect', {
      x: 0, y: 0, width: W, height: H, fill: 'url(#gate-vig)', 'pointer-events': 'none',
    }));

    this.flash = this._el('rect', {
      x: CX - 10, y: 0, width: 20, height: H,
      fill: PALETTE.goldHi, opacity: 0, 'pointer-events': 'none',
    });
    ui.appendChild(this.flash);

    // knob 放在最上层，确保点兽面正中即可蓄力
    this.knob = this._el('circle', {
      cx: CX, cy: CY, r: RING_R, fill: 'transparent',
      style: 'cursor:pointer', 'pointer-events': 'all',
    });
    ui.appendChild(this.knob);

    this.svg.appendChild(ui);
    this.uiLayer = ui;
  }

  /* ---------- 交互 ---------- */
  _onDown(e) {
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
    const down = up * 3;
    this.t = this.holding ? Math.min(1, this.t + up) : Math.max(0, this.t - down);
    this._paint();
    if (this.t >= 1 && !this.done) { this.done = true; this._open(); }
    this.raf = (this.t > 0 || this.holding) ? requestAnimationFrame(this._loop) : null;
  }

  _paint() {
    const t = this.t;
    this.prog.setAttribute('stroke-dashoffset', (RING_C * (1 - t)).toFixed(1));
    this.prog.setAttribute('stroke', t >= 1 ? PALETTE.goldHi : PALETTE.goldBright);

    const lit = Math.floor(t * PET_N + 0.001);
    if (lit !== this._lastLit) {
      this._lastLit = lit;
      this.pets.forEach(function (o, i) {
        const on = i < lit;
        o.g.setAttribute('opacity', on ? 0.95 : 0.1);
        o.p.setAttribute('stroke', on ? PALETTE.patternOn : PALETTE.patternOff);
      });
    }

    const w = 6 + t * 11;
    this.seam.setAttribute('opacity', 0.22 + t * 0.78);
    this.seam.setAttribute('width', w);
    this.seam.setAttribute('x', CX - w / 2);

    // 只用 opacity，避免每帧改 drop-shadow 造成卡顿
    this.taotie.setAttribute('opacity', (0.62 + t * 0.38).toFixed(2));
  }

  /* ---------- 蓄满：等门后展厅就绪 → 爆光推门（等待时保持微动，不假死） ---------- */
  async _open() {
    this.hintEl.style.opacity = '0';
    if (this.knob) this.knob.style.pointerEvents = 'none';
    this.root.classList.add('is-charged');
    this._startAwaitPulse();

    try {
      await Promise.resolve(this.onOpen?.());
    } catch (err) {
      console.error('[BronzeDoorGate] onOpen failed:', err);
    }

    this._stopAwaitPulse();
    this.root.style.background = 'transparent';

    this.flash.setAttribute('opacity', '1');
    let w = 20;
    const self = this;
    const grow = function () {
      w += 24;
      self.flash.setAttribute('width', w);
      self.flash.setAttribute('x', CX - w / 2);
      self.flash.setAttribute('opacity', Math.max(0, 1 - w / 620));
      if (w < 640) requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);

    this.uiLayer.style.transition = 'opacity .35s ease';
    this.uiLayer.style.opacity = '0';
    this.root.classList.add('is-opening');

    setTimeout(() => {
      this.onComplete?.();
      this.destroy();
    }, 2200);
  }

  _startAwaitPulse() {
    this._stopAwaitPulse();
    let phase = 0;
    const tick = () => {
      phase += 0.08;
      const pulse = 0.5 + Math.sin(phase) * 0.5;
      this.seam.setAttribute('opacity', (0.75 + pulse * 0.25).toFixed(2));
      this.taotie.setAttribute('opacity', (0.85 + pulse * 0.15).toFixed(2));
      this.prog.setAttribute('stroke', pulse > 0.5 ? PALETTE.goldHi : PALETTE.goldBright);
      this._awaitPulseRaf = requestAnimationFrame(tick);
    };
    this._awaitPulseRaf = requestAnimationFrame(tick);
  }

  _stopAwaitPulse() {
    if (this._awaitPulseRaf) {
      cancelAnimationFrame(this._awaitPulseRaf);
      this._awaitPulseRaf = null;
    }
  }

  destroy() {
    this._stopAwaitPulse();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.knob) this.knob.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    if (this.root) this.root.remove();
  }

  /* ---------- 工具 ---------- */
  _svgRoot() {
    const svg = this._el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'xMidYMid slice',
      class: 'gate-svg', xmlns: NS,
    });
    svg.innerHTML =
      '<defs>' +
      '<clipPath id="bg-clip"><rect x="0" y="0" width="' + W + '" height="' + H + '"/></clipPath>' +
      '<linearGradient id="gate-seam" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + PALETTE.goldBright + '" stop-opacity="0"/>' +
      '<stop offset=".5" stop-color="' + PALETTE.goldHi + '"/>' +
      '<stop offset="1" stop-color="' + PALETTE.goldBright + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<radialGradient id="gate-vig" cx="50%" cy="50%" r="62%">' +
      '<stop offset="0" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".72"/>' +
      '</radialGradient>' +
      '</defs>';
    return svg;
  }

  _el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    attrs = attrs || {};
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
}
