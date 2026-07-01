/**
 * 青铜开幕转场 — 双扇青铜门从中央向两侧拉开，露出神兽图鉴
 * 流程：挂载关门层 → 后台切换图鉴 → 门缝金光 → 开门 → 移除层
 */

const LIGHT_REVEAL_MS = 600;
const PAUSE_MS = 300;
const DOOR_OPEN_MS = 1400;

/** 兽面纹铺首 + 门钉 SVG（金色描边，opacity 由 CSS 控制） */
const KNOCKER_SVG = `
<svg class="bronze-gate-knocker" viewBox="0 0 120 200" aria-hidden="true">
  <circle cx="60" cy="58" r="44" fill="none" stroke="#C9A84C" stroke-width="1.4"/>
  <circle cx="60" cy="58" r="30" fill="none" stroke="#C9A84C" stroke-width="1"/>
  <path d="M60 34 Q44 38 38 52 Q34 68 42 78 Q48 86 60 88 Q72 86 78 78 Q86 68 82 52 Q76 38 60 34Z"
        fill="none" stroke="#C9A84C" stroke-width="1"/>
  <ellipse cx="48" cy="54" rx="5" ry="7" fill="none" stroke="#C9A84C" stroke-width="0.9"/>
  <ellipse cx="72" cy="54" rx="5" ry="7" fill="none" stroke="#C9A84C" stroke-width="0.9"/>
  <path d="M60 60 L52 72 L68 72 Z" fill="none" stroke="#C9A84C" stroke-width="0.9"/>
  <path d="M48 72 Q60 82 72 72" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
  <path d="M34 46 Q22 28 32 22 Q40 18 44 30" fill="none" stroke="#C9A84C" stroke-width="0.9"/>
  <path d="M86 46 Q98 28 88 22 Q80 18 76 30" fill="none" stroke="#C9A84C" stroke-width="0.9"/>
  <circle cx="60" cy="58" r="16" fill="none" stroke="#C9A84C" stroke-width="2"/>
  <line x1="60" y1="42" x2="60" y2="74" stroke="#C9A84C" stroke-width="0.6" opacity="0.5"/>
  <g class="bronze-gate-nails">
    <circle cx="36" cy="118" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="60" cy="118" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="84" cy="118" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="36" cy="142" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="60" cy="142" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="84" cy="142" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="36" cy="166" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="60" cy="166" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
    <circle cx="84" cy="166" r="4" fill="none" stroke="#C9A84C" stroke-width="0.8"/>
  </g>
</svg>`;

export class BronzeGateTransition {
  constructor() {
    this.root = null;
    this._seamLight = null;
  }

  /**
   * @param {HTMLElement} container 通常为 #viewport-16-9
   */
  mount(container) {
    if (!container || this.root) return;

    const el = document.createElement('div');
    el.className = 'bronze-gate-overlay';
    el.setAttribute('role', 'presentation');
    el.innerHTML = `
      <!-- 门缝金光：殿内光从门缝溢出 -->
      <div class="bronze-gate-seam-light" aria-hidden="true"></div>
      <!-- 双门结构：左扇 -->
      <div class="bronze-gate-door bronze-gate-door--left">
        <div class="bronze-gate-knocker-wrap">${KNOCKER_SVG}</div>
      </div>
      <!-- 双门结构：右扇（铺首镜像） -->
      <div class="bronze-gate-door bronze-gate-door--right">
        <div class="bronze-gate-knocker-wrap bronze-gate-knocker-wrap--mirror">${KNOCKER_SVG}</div>
      </div>
    `;

    container.appendChild(el);
    this.root = el;
    this._seamLight = el.querySelector('.bronze-gate-seam-light');
  }

  /**
   * 播放转场：金光扩张 → 停顿 → 开门（图鉴应在门后已就绪）
   * @returns {Promise<void>}
   */
  async play() {
    if (!this.root) return;

    // 纯 CSS 延时，不使用 requestAnimationFrame，避免与 WebGL 主循环混淆
    await _wait(32);

    // 门缝金光：宽度 0 → 60px
    this._seamLight?.classList.add('bronze-gate-seam-light--reveal');
    await _wait(LIGHT_REVEAL_MS);
    await _wait(PAUSE_MS);

    // 开门缓动：两扇门向两侧拉开，金光同步扩散淡出
    this._playEnterSound();
    this.root.classList.add('bronze-gate-overlay--opening');
    await _wait(DOOR_OPEN_MS);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this._seamLight = null;
  }

  /** 进场音效（预留）：缺失文件时静默 */
  _playEnterSound() {
    try {
      const audio = new Audio('/audio/enter.mp3');
      audio.volume = 0.85;
      audio.play().catch(() => {});
    } catch {
      /* 静默 */
    }
  }
}

function _wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
