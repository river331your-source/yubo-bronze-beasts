import { bindHomeImageFallbacks } from '../ui/homeImageFallback.js';
import { BronzeGateTransition } from '../ui/BronzeGateTransition.js';

/**
 * HOME 版块 — 金色标题 + 入场动画 +「进入展厅」
 * onEnter: 绑定进入按钮、播放入场动画
 * onLeave: 解绑按钮（无 WebGL / 摄像头）
 */
export class HomeSection {
  constructor({ enterBtn, onRequestAtlas, getAtlasSection }) {
    this.enterBtn = enterBtn;
    this.onRequestAtlas = onRequestAtlas;
    this.getAtlasSection = getAtlasSection;
    this.root = document.getElementById('section-home');
    this.viewport = document.getElementById('viewport-16-9');
    this.active = false;
    this._transitioning = false;
    this._onEnterClick = () => this._handleEnterClick();
    bindHomeImageFallbacks(this.root);
  }

  /**
   * 青铜开幕转场：关门视觉层 → 后台切图鉴(循环照常) → 金光 → 开门 → 兜底确认渲染
   * 转场层纯 DOM 覆盖，不触碰 WebGL / RAF
   */
  async _handleEnterClick() {
    if (this._transitioning || !this.onRequestAtlas) return;
    this._transitioning = true;
    this.enterBtn?.setAttribute('disabled', 'true');

    const gate = new BronzeGateTransition();
    const mountTarget = this.viewport || document.body;
    gate.mount(mountTarget);

    try {
      // 先切图鉴：门后启动渲染循环，转场层仅视觉遮挡
      await this.onRequestAtlas();
      const atlas = this.getAtlasSection?.();
      await atlas?.whenReady?.();

      await gate.play();
    } finally {
      gate.destroy();
      this.getAtlasSection?.()?.ensureRendering?.();
      this._transitioning = false;
      this.enterBtn?.removeAttribute('disabled');
    }
  }

  async onEnter() {
    if (this.active) return;
    this.active = true;
    this.enterBtn?.addEventListener('click', this._onEnterClick);
    this._playEnterAnimation();
  }

  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.enterBtn?.removeEventListener('click', this._onEnterClick);
  }

  _playEnterAnimation() {
    if (!this.root) return;
    this.root.classList.remove('home-animate');
    void this.root.offsetWidth;
    this.root.classList.add('home-animate');
  }
}
