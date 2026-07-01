import { GestureController } from '../interactions/GestureController.js';
import { PatternFlashlightInteraction } from '../interactions/PatternFlashlightInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import { DEFAULT_ARTIFACT_INDEX, ARTIFACTS } from '../data/artifacts.js';
import { startMainLoop, stopMainLoop } from '../core/FrameLoop.js';

/** 纹样探秘：母题线稿 + 手电筒手势（独立 WebGL / 摄像头生命周期） */
export class PatternSection {
  constructor({ lineartCanvas, videoEl, ui }) {
    this.lineartCanvas = lineartCanvas;
    this.videoEl = videoEl;
    this.ui = ui;

    this.active = false;
    this.artifactIndex = DEFAULT_ARTIFACT_INDEX;
    this.flashlight = null;
    this.gestureController = null;
    this.skeletonOverlay = null;
    this._onKeydown = null;
    this._patternFrameListener = () => this._onPatternFrame();
    this._patternDetectListener = () => this._onPatternDetect();
    this._gestureInitGen = 0;
  }

  /** onEnter: 线稿视图 + 手电筒手势 */
  async onEnter() {
    if (this.active) return;
    this.active = true;

    this.flashlight = new PatternFlashlightInteraction({
      lineartCanvas: this.lineartCanvas,
      getArtifact: () => ARTIFACTS[this.artifactIndex],
    });
    this.flashlight.activate();

    this.ui.selectArtifact(this.artifactIndex);
    this.ui._applySectionHint('pattern');
    this.ui.syncArtifactStages();

    this._bindKeyboard();

    // 先启动主循环（线稿/手电不依赖摄像头）
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

    this.flashlight?.dispose();
    this.flashlight = null;

    this.skeletonOverlay?.stop();
    this.skeletonOverlay = null;

    this.gestureController?.dispose();
    this.gestureController = null;

    this.ui.showGestureUI(false);
    this.ui.updateGestureLabel('none');
  }

  async loadArtifact(index) {
    if (!this.active) return;
    this.artifactIndex = index;
    const artifact = ARTIFACTS[index];
    this.ui.updateArtifactInfo(artifact);
    this.flashlight?.setArtifact(artifact);
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
          ' （摄像头未授权，按住鼠标拖动预览）';
      }
    }
  }

  _bindKeyboard() {
    this._onKeydown = (e) => {
      if (!this.active) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= ARTIFACTS.length) {
        this.loadArtifact(n - 1);
        this.ui.selectArtifact(n - 1);
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
}
