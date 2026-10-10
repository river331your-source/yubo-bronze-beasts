import { TutorialStep } from './TutorialController.js';

/**
 * 首次引导 · 悬浮展签
 * 骨骼线稿风手势动画：canvas 绘制单手 21 关键点骨架循环（握拳/解构/消散），
 * 双手拍合用双骨架相向动画。不用 Emoji。
 */

const STEP_META = {
  [TutorialStep.CAMERA]: { no: '··', title: '初次体验', en: 'FIRST TOUCH', desc: '将双手置于摄像头画面中，开启青铜神兽数字探索', anim: 'hands', wait: '等待手势' },
  [TutorialStep.FORM]: { no: '01', title: '聚形', en: 'FORMING', desc: '握拳，让散落粒子凝聚成器', anim: 'fist', wait: '等待握拳', touch: '点击「聚形」，让粒子凝聚成器' },
  [TutorialStep.DECONSTRUCT]: { no: '02', title: '解构', en: 'DECONSTRUCT', desc: '做出解构手势，探索器物结构与构件关系', anim: 'archaeology', wait: '等待解构手势', touch: '点击「解构」，探索器物结构' },
  [TutorialStep.DISSOLVE]: { no: '03', title: '消散', en: 'DISSOLVE', desc: '做出消散手势，让器物重新化为数字粒子', anim: 'dissolve', wait: '等待消散手势', touch: '点击「消散」，释放数字粒子' },
  [TutorialStep.SWITCH]: { no: '04', title: '切换文物', en: 'NEXT RELIC', desc: '双手拍合，探索下一件青铜神兽', anim: 'clap', wait: '等待双手拍合', touch: '点击「下一件」，探索下一件文物' },
  [TutorialStep.COMPLETE]: { no: '✓', title: '探索已开启', en: 'BEGIN', desc: '你已掌握：聚形 · 解构 · 消散 · 文物切换，继续探索青铜神兽', anim: null, wait: '' },
};

// 单手 21 点拓扑（MediaPipe HandLandmarker 索引）
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// 基础张手骨架（归一化坐标），动画按目标姿态插值
const OPEN_HAND = [
  [0.5, 0.9], [0.42, 0.78], [0.36, 0.64], [0.32, 0.5], [0.3, 0.38],
  [0.46, 0.6], [0.44, 0.42], [0.43, 0.26], [0.42, 0.12],
  [0.52, 0.58], [0.52, 0.4], [0.52, 0.24], [0.52, 0.1],
  [0.58, 0.6], [0.6, 0.44], [0.62, 0.3], [0.64, 0.18],
  [0.64, 0.64], [0.68, 0.5], [0.72, 0.38], [0.76, 0.28],
];
const FIST_HAND = [
  [0.5, 0.9], [0.44, 0.78], [0.42, 0.68], [0.42, 0.6], [0.44, 0.56],
  [0.47, 0.62], [0.46, 0.56], [0.46, 0.52], [0.47, 0.5],
  [0.52, 0.62], [0.52, 0.56], [0.52, 0.52], [0.53, 0.5],
  [0.57, 0.63], [0.57, 0.57], [0.58, 0.53], [0.59, 0.51],
  [0.61, 0.66], [0.62, 0.6], [0.63, 0.56], [0.64, 0.53],
];
const SPREAD_HAND = [
  [0.5, 0.9], [0.38, 0.78], [0.3, 0.62], [0.24, 0.46], [0.2, 0.32],
  [0.42, 0.58], [0.36, 0.38], [0.32, 0.2], [0.3, 0.06],
  [0.5, 0.56], [0.5, 0.36], [0.5, 0.18], [0.5, 0.04],
  [0.58, 0.58], [0.62, 0.4], [0.66, 0.24], [0.7, 0.1],
  [0.66, 0.64], [0.74, 0.5], [0.8, 0.38], [0.86, 0.28],
];

function lerpPose(a, b, t) {
  return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
}

export class TutorialOverlay {
  constructor() {
    this.root = null;
    this._noEl = null;
    this._titleEl = null;
    this._enEl = null;
    this._descEl = null;
    this._canvas = null;
    this._statusDot = null;
    this._statusText = null;
    this._anim = null;
    this._raf = null;
    this._t0 = 0;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'tutorial-card';
    root.hidden = true;
    root.innerHTML = `
      <div class="tutorial-no" aria-hidden="true"></div>
      <h3 class="tutorial-title"></h3>
      <p class="tutorial-en"></p>
      <div class="tutorial-rule" aria-hidden="true"></div>
      <canvas class="tutorial-hand" width="220" height="160" aria-hidden="true"></canvas>
      <p class="tutorial-desc"></p>
      <p class="tutorial-status"><span class="tutorial-dot"></span><span class="tutorial-status-text"></span></p>
      <div class="tutorial-actions">
        <button type="button" class="tutorial-skip">跳过引导</button>
      </div>
    `;
    const stage = document.getElementById('atlas-viewport') ?? document.body;
    stage.appendChild(root);
    this.root = root;
    this._noEl = root.querySelector('.tutorial-no');
    this._titleEl = root.querySelector('.tutorial-title');
    this._enEl = root.querySelector('.tutorial-en');
    this._descEl = root.querySelector('.tutorial-desc');
    this._canvas = root.querySelector('.tutorial-hand');
    this._statusDot = root.querySelector('.tutorial-dot');
    this._statusText = root.querySelector('.tutorial-status-text');
    root.querySelector('.tutorial-skip')?.addEventListener('click', () => this.onSkip?.());
  }

  onSkip = null;

  show() {
    if (this.root) this.root.hidden = false;
  }

  hide() {
    if (this.root) this.root.hidden = true;
    this._stopAnim();
  }

  setStep(step, touchOnly = false) {
    const meta = STEP_META[step];
    if (!meta || !this.root) return;
    this._noEl.textContent = meta.no;
    this._titleEl.textContent = meta.title;
    this._enEl.textContent = meta.en;
    this._descEl.textContent = touchOnly && meta.touch ? meta.touch : meta.desc;
    this._canvas.style.display = meta.anim ? '' : 'none';
    this.setWaiting(touchOnly && meta.touch ? '等待点击' : meta.wait);
    this._startAnim(meta.anim);
    this.root.classList.remove('tutorial-done');
  }

  setWaiting(text) {
    this._setStatus(text, 'wait');
  }

  setRecognized(text) {
    this._setStatus(text, 'active');
  }

  setComplete(text, final = false) {
    this._setStatus(text, 'done');
    if (final) {
      this.root?.classList.add('tutorial-done');
      this._stopAnim();
    }
  }

  setCameraFailed() {
    this._descEl.textContent = '未开启摄像头，你仍可以使用触控模式体验作品';
    this._setStatus('未检测到手', 'wait');
  }

  _setStatus(text, cls) {
    if (this._statusText) this._statusText.textContent = text;
    if (this._statusDot) this._statusDot.dataset.state = cls;
  }

  _startAnim(kind) {
    this._stopAnim();
    this._anim = kind;
    if (!kind || !this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    this._t0 = performance.now();
    const tick = () => {
      if (!this._anim) return;
      this._drawFrame(ctx, (performance.now() - this._t0) / 1000);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopAnim() {
    this._anim = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _drawFrame(ctx, t) {
    const W = 220;
    const H = 160;
    ctx.clearRect(0, 0, W, H);
    const phase = (t % 1.4) / 1.4;
    const close = phase < 0.45 ? phase / 0.45 : phase < 0.65 ? 1 : 1 - (phase - 0.65) / 0.35;
    if (this._anim === 'clap' || this._anim === 'hands') {
      const spread = this._anim === 'clap' ? 34 * (1 - close) : 26;
      this._drawHand(ctx, SPREAD_HAND, -spread, W, H, close > 0.85);
      this._drawHand(ctx, SPREAD_HAND.map((p) => [1 - p[0], p[1]]), spread, W, H, close > 0.85);
      return;
    }
    const target = this._anim === 'fist' ? FIST_HAND : this._anim === 'dissolve' ? SPREAD_HAND : OPEN_HAND;
    const pose = lerpPose(OPEN_HAND, target, this._anim === 'fist' ? close : 0.5 + 0.2 * Math.sin(t * 2));
    this._drawHand(ctx, pose, 0, W, H, this._anim === 'fist' && close > 0.85);
  }

  _drawHand(ctx, pose, dx, W, H, glow) {
    const px = (p) => [(p[0] * W + dx), p[1] * H];
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = glow ? '#e8cb6a' : 'rgba(201,168,76,.85)';
    ctx.shadowColor = glow ? 'rgba(232,203,106,.7)' : 'transparent';
    ctx.shadowBlur = glow ? 8 : 0;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      const [x1, y1] = px(pose[a]);
      const [x2, y2] = px(pose[b]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7fd4a8';
    for (const p of pose) {
      const [x, y] = px(p);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
