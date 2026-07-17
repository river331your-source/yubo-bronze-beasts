import { GestureController } from '../interactions/GestureController.js';
import {
  PatternFlashlightInteraction,
  warmGoldLineartCache,
} from '../interactions/PatternFlashlightInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import {
  DEFAULT_PATTERN_VESSEL_INDEX,
  PATTERN_VESSELS,
  getPatternVessel,
} from '../data/pattern-vessels.js';
import { startMainLoop, stopMainLoop } from '../core/FrameLoop.js';

/** 纹样探秘：器物线稿手电筒 + 两件器物切换 */
export class PatternSection {
  constructor({ torchStage, vesselSwitcher, videoEl, ui }) {
    this.torchStage = torchStage;
    this.vesselSwitcher = vesselSwitcher;
    this.vesselPrevBtn = vesselSwitcher?.querySelector('#pattern-vessel-prev');
    this.vesselNextBtn = vesselSwitcher?.querySelector('#pattern-vessel-next');
    this.vesselLabel = vesselSwitcher?.querySelector('#pattern-vessel-label');
    this.videoEl = videoEl;
    this.ui = ui;

    this.active = false;
    this.vesselIndex = DEFAULT_PATTERN_VESSEL_INDEX;
    this.flashlight = null;
    this.gestureController = null;
    this.skeletonOverlay = null;
    this._onKeydown = null;
    this._onVesselPrev = null;
    this._onVesselNext = null;
    this._patternFrameListener = () => this._onPatternFrame();
    this._patternDetectListener = () => this._onPatternDetect();
    this._gestureInitGen = 0;
    this._lineartPreloads = null;
  }

  /** onEnter: 线稿舞台 + 捶拓 + 器物切换器 */
  async onEnter() {
    if (this.active) return;
    this.active = true;

    await this._preloadPatternLinearts();

    this.flashlight = new PatternFlashlightInteraction({
      stageEl: this.torchStage,
      getVessel: () => getPatternVessel(this.vesselIndex),
    });
    this.flashlight.activate();

    this.switchPatternVessel(DEFAULT_PATTERN_VESSEL_INDEX);
    this.ui._applySectionHint('pattern');
    this.ui.syncArtifactStages();

    this._bindKeyboard();
    this._bindVesselSwitcher();

    stopMainLoop();
    startMainLoop('pattern', this._patternFrameListener, this._patternDetectListener);
    this._initGestureAsync();
  }

  /** onLeave: 停止检测循环、关闭摄像头 */
  onLeave() {
    if (!this.active) return;
    this.active = false;
    this._gestureInitGen += 1;

    stopMainLoop();

    if (this._onKeydown) {
      window.removeEventListener('keydown', this._onKeydown);
      this._onKeydown = null;
    }

    this._unbindVesselSwitcher();

    this.flashlight?.dispose();
    this.flashlight = null;

    this.skeletonOverlay?.stop();
    this.skeletonOverlay = null;

    this.gestureController?.dispose();
    this.gestureController = null;

    this.ui.showGestureUI(false);
    this.ui.updateGestureLabel('none');
  }

  /**
   * 器物切换：更新双层线稿与切换器文案（下一步在此 id 上接热区数据）
   * @param {number} index
   */
  async switchPatternVessel(index) {
    this.vesselIndex = ((index % PATTERN_VESSELS.length) + PATTERN_VESSELS.length) % PATTERN_VESSELS.length;
    const vessel = getPatternVessel(this.vesselIndex);

    // 无论 setVessel 是否抛错中断，切换器 UI 必须与 vesselIndex 同步
    try {
      await this.flashlight?.setVessel(vessel);
    } finally {
      this._updateVesselSwitcherUI(vessel);
    }
  }

  /** 按器物 id 切换（供下一步热区 / 档案卡联动） */
  switchPatternVesselById(id) {
    const index = PATTERN_VESSELS.findIndex((v) => v.id === id);
    if (index >= 0) this.switchPatternVessel(index);
  }

  getCurrentPatternVessel() {
    return getPatternVessel(this.vesselIndex);
  }

  /** 兼容 AppRouter.loadArtifact：纹样探秘仅映射前两件器物 */
  loadArtifact(index) {
    if (!this.active) return;
    if (index >= 0 && index < PATTERN_VESSELS.length) {
      this.switchPatternVessel(index);
    }
  }

  /** 供外部驱动光斑（金色图层局部像素坐标） */
  setTorchPos(x, y) {
    this.flashlight?.setTorchPos(x, y);
  }

  _updateVesselSwitcherUI(vessel) {
    if (this.vesselLabel) {
      this.vesselLabel.textContent = vessel.name;
    }
    this.vesselSwitcher?.querySelectorAll('[data-vessel-id]').forEach((btn) => {
      const active = btn.dataset.vesselId === vessel.id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  _bindVesselSwitcher() {
    this._onVesselPrev = () => this.switchPatternVessel(this.vesselIndex - 1);
    this._onVesselNext = () => this.switchPatternVessel(this.vesselIndex + 1);
    this._onVesselTabClick = (e) => {
      const tab = e.target.closest('[data-vessel-id]');
      if (tab) this.switchPatternVesselById(tab.dataset.vesselId);
    };

    this.vesselPrevBtn?.addEventListener('click', this._onVesselPrev);
    this.vesselNextBtn?.addEventListener('click', this._onVesselNext);
    this.vesselSwitcher?.addEventListener('click', this._onVesselTabClick);
  }

  _unbindVesselSwitcher() {
    this.vesselPrevBtn?.removeEventListener('click', this._onVesselPrev);
    this.vesselNextBtn?.removeEventListener('click', this._onVesselNext);
    this.vesselSwitcher?.removeEventListener('click', this._onVesselTabClick);
    this._onVesselPrev = null;
    this._onVesselNext = null;
    this._onVesselTabClick = null;
  }

  _initGestureAsync() {
    const gen = ++this._gestureInitGen;
    this._startGesture(gen).catch((err) => {
      if (gen !== this._gestureInitGen) return;
      console.warn('[PatternSection] 摄像头/手势初始化异常:', err?.message ?? err);
    });
  }

  async _startGesture(gen) {
    try {
      const gc = new GestureController(this.videoEl);
      await gc.init();

      if (!this.active || gen !== this._gestureInitGen) {
        gc.dispose();
        return;
      }

      this.gestureController = gc;
      this.ui.showGestureUI(true);

      gc.onGestureChange = (gesture) => {
        this.ui.updateGestureLabel(gesture);
        this.flashlight?.onGesture?.(gesture);
      };

      this.skeletonOverlay = new SkeletonOverlay(
        this.videoEl,
        document.getElementById('skeleton-overlay'),
        gc
      );
    } catch (err) {
      if (!this.active || gen !== this._gestureInitGen) return;
      this.gestureController?.dispose();
      this.gestureController = null;
      console.warn('摄像头/手势识别不可用:', err.message);
      this.ui.updateGestureLabel('none');
      this.ui._applySectionHint('pattern');
      if (this.ui.interactionHint) {
        this.ui.interactionHint.textContent +=
          ' （摄像头未授权，移动鼠标预览照亮）';
      }
    }
  }

  _bindKeyboard() {
    this._onKeydown = (e) => {
      if (!this.active) return;
      if (e.key === 'ArrowLeft') {
        this.switchPatternVessel(this.vesselIndex - 1);
      } else if (e.key === 'ArrowRight') {
        this.switchPatternVessel(this.vesselIndex + 1);
      } else if (e.key === 'h' || e.key === 'H') {
        this.flashlight?.toggleHotspotDebug?.();
      } else if (e.key === 'p' || e.key === 'P') {
        this.flashlight?.exportShenshouAnnotations?.();
      } else {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= PATTERN_VESSELS.length) {
          this.switchPatternVessel(n - 1);
        }
      }
    };
    window.addEventListener('keydown', this._onKeydown);
  }

  _onPatternFrame() {
    this.gestureController?.tickProcess();
    this.skeletonOverlay?.draw();
    this.flashlight?.update(this.gestureController ?? null);
  }

  _onPatternDetect() {
    this.gestureController?.tickDetect();
  }

  /** 预载线稿 PNG 并预热染金离屏缓存 */
  async _preloadPatternLinearts() {
    if (this._lineartPreloads) return this._lineartPreloads;

    this._lineartPreloads = Promise.all(
      PATTERN_VESSELS.map(
        (vessel) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              warmGoldLineartCache(vessel.lineartSrc, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`lineart preload failed: ${vessel.lineartSrc}`));
            img.src = vessel.lineartSrc;
          })
      )
    ).catch((err) => {
      this._lineartPreloads = null;
      console.warn('[PatternSection] lineart preload:', err?.message ?? err);
    });

    return this._lineartPreloads;
  }
}
