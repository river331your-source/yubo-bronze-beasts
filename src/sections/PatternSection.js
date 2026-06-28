import { GestureController } from '../interactions/GestureController.js';
import { PatternFlashlightInteraction } from '../interactions/PatternFlashlightInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import { DEFAULT_ARTIFACT_INDEX, ARTIFACTS } from '../data/artifacts.js';

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
    this._interactionRunning = false;
    this._interactionRafId = null;
    this._onKeydown = null;
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
    await this._startGesture();
    this._startInteractionLoop();
  }

  /** onLeave: 停止检测循环、关闭摄像头 */
  onLeave() {
    if (!this.active) return;
    this.active = false;

    this._interactionRunning = false;
    if (this._interactionRafId != null) {
      cancelAnimationFrame(this._interactionRafId);
      this._interactionRafId = null;
    }

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

  async _startGesture() {
    try {
      this.gestureController = new GestureController(this.videoEl);
      await this.gestureController.init();
      this.ui.showGestureUI(true);

      this.gestureController.onGestureChange = (gesture) => {
        this.ui.updateGestureLabel(gesture);
        this.flashlight?.onGesture?.(gesture);
      };

      this.skeletonOverlay = new SkeletonOverlay(
        this.videoEl,
        document.getElementById('skeleton-overlay'),
        this.gestureController
      );
    } catch (err) {
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

  _startInteractionLoop() {
    this._interactionRunning = true;
    const tick = () => {
      if (!this._interactionRunning) return;
      this._interactionRafId = requestAnimationFrame(tick);
      this.flashlight?.update(this.gestureController ?? null);
    };
    tick();
  }
}
