import { GestureController } from '../interactions/GestureController.js';
import {
  PatternFlashlightInteraction,
  warmGoldLineartCache,
} from '../interactions/PatternFlashlightInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import {
  bindRelicSilhouetteFallback,
  resolvePublicAsset,
} from '../ui/relicSilhouetteFallback.js';
import {
  DEFAULT_PATTERN_VESSEL_INDEX,
  PATTERN_VESSELS,
  getPatternVessel,
} from '../data/pattern-vessels.js';
import { startMainLoop, stopMainLoop } from '../core/FrameLoop.js';
import { shouldDeferHeavyInit, deferHeavyInit } from '../utils/heavyInitGate.js';

/** 纹样探秘：器物线稿捶拓 + 左侧器物切换 */
export class PatternSection {
  constructor({ torchStage, sideSwitcher, videoEl, ui }) {
    this.torchStage = torchStage;
    this.sideSwitcher = sideSwitcher;
    this.videoEl = videoEl;
    this.ui = ui;

    this.active = false;
    this.vesselIndex = DEFAULT_PATTERN_VESSEL_INDEX;
    this.flashlight = null;
    this.gestureController = null;
    this.skeletonOverlay = null;
    this._onKeydown = null;
    this._onSideItemClick = null;
    this._patternFrameListener = () => this._onPatternFrame();
    this._patternDetectListener = () => this._onPatternDetect();
    this._gestureInitGen = 0;
    this._lineartPreloads = null;
  }

  /** onEnter: 线稿舞台 + 捶拓 + 左侧器物切换器 */
  async onEnter() {
    if (this.active) return;
    if (shouldDeferHeavyInit()) {
      console.log('[PatternSection] 手机竖屏 — 延迟线稿/手势初始化，等待横屏');
      deferHeavyInit(() => { if (!this.active) this.onEnter(); });
      return;
    }
    this.active = true;

    await this._preloadPatternLinearts();

    this.flashlight = new PatternFlashlightInteraction({
      stageEl: this.torchStage,
      getVessel: () => getPatternVessel(this.vesselIndex),
    });
    this.flashlight.activate();
    this._bindLayoutResync();
    requestAnimationFrame(() => {
      this.flashlight?.syncLayout?.();
      this._logMobileDebug('enter-rAF');
      requestAnimationFrame(() => {
        this.flashlight?.syncLayout?.();
        this._logMobileDebug('enter-rAF2');
      });
    });

    this.switchPatternVessel(DEFAULT_PATTERN_VESSEL_INDEX);
    this.ui._applySectionHint('pattern');
    this.ui.syncArtifactStages();

    this._bindKeyboard();
    this._bindSideSwitcher();

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

    this._unbindSideSwitcher();
    this._unbindLayoutResync();

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
   * 器物切换：更新双层线稿与左侧切换器高亮
   * @param {number} index
   */
  async switchPatternVessel(index) {
    const prevIndex = this.vesselIndex;
    this.vesselIndex = ((index % PATTERN_VESSELS.length) + PATTERN_VESSELS.length) % PATTERN_VESSELS.length;
    const vessel = getPatternVessel(this.vesselIndex);

    try {
      await this.flashlight?.setVessel(vessel);
      this._updateSideSwitcherUI(vessel);
    } catch (err) {
      this.vesselIndex = prevIndex;
      this._updateSideSwitcherUI(getPatternVessel(prevIndex));
      console.error('[PatternSection] 器物切换失败，已回滚 UI:', err);
    }
  }

  /** 移动端尺寸自检：stage/stack/canvas 必须 > 0 */
  _logMobileDebug(tag) {
    try {
      const stage = this.torchStage?.getBoundingClientRect();
      const stack = this.flashlight?.lineartStack?.getBoundingClientRect();
      console.log('[Pattern Mobile Debug]', {
        tag,
        active: this.active,
        stage: stage && { w: Math.round(stage.width), h: Math.round(stage.height) },
        stack: stack && { w: Math.round(stack.width), h: Math.round(stack.height) },
        canvas: {
          width: this.flashlight?.rubCanvasEl?.width ?? 0,
          height: this.flashlight?.rubCanvasEl?.height ?? 0,
        },
        lineart: {
          src: getPatternVessel(this.vesselIndex)?.lineartSrc,
          naturalWidth: this.flashlight?.dimLayer?.naturalWidth ?? 0,
          naturalHeight: this.flashlight?.dimLayer?.naturalHeight ?? 0,
        },
      });
    } catch (err) {
      console.warn('[Pattern Mobile Debug] 自检失败:', err?.message ?? err);
    }
  }

  /** 横竖屏/尺寸变化后重同步 canvas，不重建交互 */
  _bindLayoutResync() {
    if (this._onLayoutResync) return;
    this._onLayoutResync = () => {
      if (!this.active) return;
      requestAnimationFrame(() => {
        this.flashlight?.syncLayout?.();
        this._logMobileDebug('resize');
      });
    };
    window.addEventListener('orientationchange', this._onLayoutResync);
    window.addEventListener('resize', this._onLayoutResync);
  }

  _unbindLayoutResync() {
    if (!this._onLayoutResync) return;
    window.removeEventListener('orientationchange', this._onLayoutResync);
    window.removeEventListener('resize', this._onLayoutResync);
    this._onLayoutResync = null;
  }

  /** 按器物 id 切换（供左侧切换器 / 档案卡联动） */
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

  _updateSideSwitcherUI(vessel) {
    this.sideSwitcher?.querySelectorAll('[data-vessel-id]').forEach((btn) => {
      const active = btn.dataset.vesselId === vessel.id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  _bindSideSwitcher() {
    this.sideSwitcher?.querySelectorAll('.pattern-side-silhouette').forEach((img) => {
      const item = img.closest('[data-vessel-id]');
      const vesselId = item?.dataset?.vesselId;
      const vessel = PATTERN_VESSELS.find((v) => v.id === vesselId);
      const src = resolvePublicAsset(vessel?.thumbnail ?? img.getAttribute('src') ?? '');
      bindRelicSilhouetteFallback(img, { id: vesselId, src });
    });

    this._onSideItemClick = (e) => {
      const item = e.target.closest('[data-vessel-id]');
      if (item) this.switchPatternVesselById(item.dataset.vesselId);
    };

    this.sideSwitcher?.addEventListener('click', this._onSideItemClick);
  }

  _unbindSideSwitcher() {
    this.sideSwitcher?.removeEventListener('click', this._onSideItemClick);
    this._onSideItemClick = null;
  }

  _initGestureAsync() {
    const gen = ++this._gestureInitGen;
    this._startGesture(gen).catch((err) => {
      if (gen !== this._gestureInitGen) return;
      console.warn('[PatternSection] 摄像头/手势初始化异常:', err?.message ?? err);
    });
  }

  async _startGesture(gen) {
    if (shouldDeferHeavyInit()) {
      console.log('[PatternSection] 手机竖屏中 — 跳过摄像头/MediaPipe 启动');
      return;
    }
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
      if (!this.ui.touchMode) this.ui.showCameraPrompt(err?.code);
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
