import '../styles/bronze-door-gate.css';
import { bindHomeImageFallbacks } from '../ui/homeImageFallback.js';
import {
  BronzeDoorGate,
  preloadTaotieGold,
  purgeStaleBronzeGates,
} from '../interactions/BronzeDoorGate.js';

/**
 * HOME 版块 — 金色标题 + 入场动画 +「进入展厅」
 *
 * 开门时序（v3）：
 *   点按钮 → 显示预热门 → 立刻在门后预加载 atlas（与蓄力并行）
 *   → 蓄满 → onOpen 确保渲染 → 推门 → 门自毁
 */
export class HomeSection {
  constructor({ enterBtn }) {
    this.enterBtn = enterBtn;
    this.router = null;
    this.root = document.getElementById('section-home');
    this.active = false;
    this.gate = null;
    this._prewarmedGate = null;
    this._gateTransitioning = false;
    this._atlasReadyPromise = null;
    this._onEnterClick = () => this._handleEnterClick();
    bindHomeImageFallbacks(this.root);
  }

  _createGate() {
    return new BronzeDoorGate({
      taotieSrc: '/images/taotie-gold.png',
      chargeMs: 1800,
      onOpen: () => this.router?.sections?.atlas?.ensureRendering?.(),
    });
  }

  _setEnterBtnLoading(loading) {
    if (!this.enterBtn) return;
    this.enterBtn.disabled = loading;
    this.enterBtn.classList.toggle('is-loading', loading);
    this.enterBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  _handleEnterClick() {
    if (this.gate || this._gateTransitioning || !this.enterBtn) return;

    this._setEnterBtnLoading(true);
    this._gateTransitioning = true;

    const gate = this._prewarmedGate ?? this._createGate();
    this._prewarmedGate = null;
    this.gate = gate;

    if (!gate.root?.isConnected) {
      gate.mount();
    } else {
      gate.reveal();
    }

    this._atlasReadyPromise = this._prepareAtlasBehindGate();
  }

  async _prepareAtlasBehindGate() {
    try {
      await this.router.switchSection('atlas');
      await this.router.sections.atlas.whenReady();
      this.router.sections.atlas.ensureRendering?.();
    } catch (err) {
      console.error('[HomeSection] atlas preload failed:', err);
      this._setEnterBtnLoading(false);
      this._gateTransitioning = false;
      this.gate?.destroy();
      this.gate = null;
      this._prewarmBronzeGate();
    }
  }

  _prewarmBronzeGate() {
    if (this._prewarmedGate || this.gate || this._gateTransitioning) return;
    const gate = this._createGate();
    gate.mount({ hidden: true });
    this._prewarmedGate = gate;
  }

  async onEnter() {
    if (this.active) return;
    this.active = true;
    this._gateTransitioning = false;
    this._atlasReadyPromise = null;
    this.gate = null;
    this._setEnterBtnLoading(false);
    preloadTaotieGold();
    purgeStaleBronzeGates();
    this._prewarmBronzeGate();
    this.enterBtn?.addEventListener('click', this._onEnterClick);
    this._playEnterAnimation();
  }

  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.enterBtn?.removeEventListener('click', this._onEnterClick);
    if (!this._gateTransitioning) {
      this.gate?.destroy();
      this._prewarmedGate?.destroy();
    }
    this.gate = null;
    this._prewarmedGate = null;
    this._atlasReadyPromise = null;
    this._gateTransitioning = false;
    this._setEnterBtnLoading(false);
  }

  _playEnterAnimation() {
    if (!this.root) return;
    this.root.classList.remove('home-animate');
    void this.root.offsetWidth;
    this.root.classList.add('home-animate');
  }
}
