import '../styles/bronze-door-gate.css';
import { bindHomeImageFallbacks } from '../ui/homeImageFallback.js';
import {
  BronzeDoorGate,
  preloadTaotieGold,
  purgeStaleBronzeGates,
} from '../interactions/BronzeDoorGate.js';
import { shouldDeferHeavyInit } from '../utils/heavyInitGate.js';

/**
 * HOME 版块 — 金色标题 + 入场动画 +「进入展厅」
 *
 * 开门时序（v4）：
 *   点按钮 → enterBehindGate → 门后预载 atlas（静态帧，无主循环）
 *   → 蓄力（仅门 RAF）→ 蓄满 activateAfterGate → 推门 → 门销毁 → startGestureAfterGate
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
    const atlas = this.router?.sections?.atlas;
    return new BronzeDoorGate({
      taotieSrc: '/images/taotie-gold.png',
      chargeMs: 1800,
      onOpen: () => atlas?.activateAfterGate?.(),
      onDestroy: () => atlas?.startGestureAfterGate?.(),
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
    if (shouldDeferHeavyInit()) {
      console.log('[HomeSection] 手机竖屏中 — 进入展厅已延迟，请先横屏');
      return;
    }

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
    const atlas = this.router?.sections?.atlas;
    try {
      atlas?.enterBehindGate?.();
      await this.router.switchSection('atlas');
      await atlas?.whenReady();
    } catch (err) {
      console.error('[HomeSection] atlas preload failed:', err);
      atlas?.cancelBehindGate?.();
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
