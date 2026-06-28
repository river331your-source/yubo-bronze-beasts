import { SceneManager } from '../scene/SceneManager.js';
import { GestureController } from '../interactions/GestureController.js';
import { DeconstructInteraction } from '../interactions/DeconstructInteraction.js';
import { PatternFlashlightInteraction } from '../interactions/PatternFlashlightInteraction.js';
import { MaterialRestoreInteraction } from '../interactions/MaterialRestoreInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import { DEFAULT_ARTIFACT_INDEX, ARTIFACTS } from '../data/artifacts.js';

/** 神兽图鉴：五件青铜器 + 三种交互模式 + 手势 */
export class AtlasSection {
  constructor({ canvas, lineartCanvas, videoEl, ui }) {
    this.canvas = canvas;
    this.lineartCanvas = lineartCanvas;
    this.videoEl = videoEl;
    this.ui = ui;

    this.active = false;
    this.currentMode = 'deconstruct';
    this.sceneManager = null;
    this.gestureController = null;
    this.skeletonOverlay = null;
    this.interactions = {};
    this._interactionRunning = false;
    this._interactionRafId = null;
    this._onKeydown = null;
  }

  /** onEnter: 创建 Three.js 场景、加载 FBX、启用手势与解构交互 */
  async onEnter() {
    if (this.active) return;
    this.active = true;

    if (!document.getElementById('section-atlas') || !this.canvas) {
      console.error('[AtlasSection] 容器缺失，无法初始化');
      return;
    }

    this.sceneManager = new SceneManager(this.canvas);
    this.interactions = {
      deconstruct: new DeconstructInteraction(this.sceneManager),
      pattern: new PatternFlashlightInteraction({
        lineartCanvas: this.lineartCanvas,
        getArtifact: () => this.sceneManager.getCurrentArtifact(),
        webglCanvas: this.canvas,
      }),
      material: new MaterialRestoreInteraction(this.sceneManager, this.ui),
    };

    await this.sceneManager.loadArtifact(DEFAULT_ARTIFACT_INDEX);
    const artifact = this.sceneManager.getCurrentArtifact();

    this.ui.selectArtifact(DEFAULT_ARTIFACT_INDEX);
    this.ui.updateArtifactInfo(artifact);
    this.ui.setMode('deconstruct');
    this.currentMode = 'deconstruct';
    this.switchMode('deconstruct');
    this.ui.syncArtifactStages();
    this.ui.logSectionState('AtlasSection.onEnter');

    this.sceneManager.resize();
    requestAnimationFrame(() => this.sceneManager?.resize());

    this._startInteractionLoop();
    this._bindKeyboard();
    await this._startGesture();
  }

  /** onLeave: 停止 rAF、释放 WebGL、关闭摄像头 */
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

    Object.values(this.interactions).forEach((interaction) => {
      interaction.deactivate?.();
      interaction.dispose?.();
    });
    this.interactions = {};

    this.skeletonOverlay?.stop();
    this.skeletonOverlay = null;

    this.gestureController?.dispose();
    this.gestureController = null;

    this.sceneManager?.dispose();
    this.sceneManager = null;

    this.ui.hideAllArtifactStages();
    this.ui.showGestureUI(false);
    this.ui.updateGestureLabel('none');
  }

  switchMode(mode) {
    if (!this.active || !this.interactions[mode]) return;
    Object.values(this.interactions).forEach((i) => i.deactivate?.());
    this.currentMode = mode;
    this.interactions[mode].activate?.();
    this.ui.syncArtifactStages();
  }

  async loadArtifact(index) {
    if (!this.sceneManager) return;
    this.ui.setArtifactLoading(index, true);
    const artifact = await this.sceneManager.loadArtifact(index);
    this.ui.setArtifactLoading(index, false);
    this.ui.updateArtifactInfo(artifact);
    Object.values(this.interactions).forEach((i) => i.deactivate?.());
    this.switchMode(this.currentMode);
  }

  async _startGesture() {
    try {
      this.gestureController = new GestureController(this.videoEl);
      await this.gestureController.init();
      this.ui.showGestureUI(true);

      this.gestureController.onGestureChange = (gesture) => {
        this.ui.updateGestureLabel(gesture);
        this._handleGesture(gesture);
      };

      this.gestureController.onHandsDistanceChange = (dist) => {
        if (this.currentMode === 'material') {
          this.interactions.material.onHandsDistance(dist);
        }
      };

      this.skeletonOverlay = new SkeletonOverlay(
        this.videoEl,
        document.getElementById('skeleton-overlay'),
        this.gestureController
      );
    } catch (err) {
      console.warn('摄像头/手势识别不可用:', err.message);
      this.ui.updateGestureLabel('none');
      this.ui.interactionHint.hidden = false;
      this.ui.interactionHint.textContent +=
        ' （摄像头未授权，可用右侧卡片切换模式预览）';
    }
  }

  _handleGesture(gesture) {
    this.interactions[this.currentMode]?.onGesture?.(gesture);
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

      const gc = this.gestureController ?? null;
      if (this.currentMode === 'pattern') {
        this.interactions.pattern?.update(gc);
      }
      if (this.currentMode === 'deconstruct') {
        this.interactions.deconstruct?.update(gc);
      }
      if (this.currentMode === 'material') {
        this.interactions.material?.update();
      }
    };
    tick();
  }
}
