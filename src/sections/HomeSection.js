import '../styles/bronze-door-gate.css';
import { bindHomeImageFallbacks } from '../ui/homeImageFallback.js';
import { BronzeDoorGate } from '../interactions/BronzeDoorGate.js';

/**
 * HOME 版块 — 金色标题 + 入场动画 +「进入展厅」
 *
 * 开门时序（避免闪首页 / 蓄满后假死）：
 *   点按钮 → 挂门 → 立刻在门后预加载 atlas
 *   → 用户长按蓄力（与加载并行）
 *   → 蓄满后只等预加载收尾 → 推门 → onComplete 移除门层
 */
export class HomeSection {
  constructor({ enterBtn }) {
    this.enterBtn = enterBtn;
    this.router = null;
    this.root = document.getElementById('section-home');
    this.active = false;
    this.gate = null;
    this._gateTransitioning = false;
    this._atlasReadyPromise = null;
    this._onEnterClick = () => this._handleEnterClick();
    bindHomeImageFallbacks(this.root);
  }

  _handleEnterClick() {
    if (this.gate || this._gateTransitioning || !this.enterBtn) return;

    // 先于 switchSection，防止 onLeave 误毁门层
    this._gateTransitioning = true;

    this.gate = new BronzeDoorGate({
      container: document.body,
      mode: 'svg',
      taotieSrc: '/images/taotie-gold.png',
      chargeMs: 1800,
      onOpen: async () => {
        // 蓄力期间已在背后加载；此处通常瞬间完成
        await this._atlasReadyPromise;
        this.router.sections.atlas.ensureRendering?.();
      },
      onComplete: () => {
        this.router.sections.atlas?.ensureRendering?.();
        this._gateTransitioning = false;
        this._atlasReadyPromise = null;
        this.gate = null;
      },
    });
    this.gate.mount();

    // 门盖住视口后立刻切展厅并加载，与蓄力并行
    this._atlasReadyPromise = this._prepareAtlasBehindGate();
  }

  async _prepareAtlasBehindGate() {
    try {
      await this.router.switchSection('atlas');
      await this.router.sections.atlas.whenReady();
      this.router.sections.atlas.ensureRendering?.();
    } catch (err) {
      console.error('[HomeSection] atlas preload failed:', err);
    }
  }

  async onEnter() {
    if (this.active) return;
    this.active = true;
    this._gateTransitioning = false;
    this._atlasReadyPromise = null;
    this.gate = null;
    document.querySelectorAll('.bronze-gate').forEach((el) => el.remove());
    this.enterBtn?.addEventListener('click', this._onEnterClick);
    this._playEnterAnimation();
  }

  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.enterBtn?.removeEventListener('click', this._onEnterClick);
    if (!this._gateTransitioning) {
      this.gate?.destroy();
      this.gate = null;
      this._atlasReadyPromise = null;
    }
  }

  _playEnterAnimation() {
    if (!this.root) return;
    this.root.classList.remove('home-animate');
    void this.root.offsetWidth;
    this.root.classList.add('home-animate');
  }
}
