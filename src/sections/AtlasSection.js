import { SceneManager } from '../scene/SceneManager.js';
import { GestureController } from '../interactions/GestureController.js';
import { DeconstructInteraction } from '../interactions/DeconstructInteraction.js';
import { MaterialRestoreInteraction } from '../interactions/MaterialRestoreInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import { DEFAULT_ARTIFACT_INDEX, ARTIFACTS } from '../data/artifacts.js';
import { logAtlasViewportDiagnostics } from '../debug/atlasViewportDiagnostics.js';

/** 神兽图鉴：五件青铜器 + 三种交互模式 + 手势 */
export class AtlasSection {
  constructor({ canvas, videoEl, ui }) {
    this.canvas = canvas;
    this.videoEl = videoEl;
    this.ui = ui;

    this.active = false;
    this.currentMode = 'deconstruct';
    this.sceneManager = null;
    this.gestureController = null;
    this.skeletonOverlay = null;
    this.interactions = {};
    this._onKeydown = null;
    this._artifactSwitchBusy = false;
    this._atlasFrameListener = (dt) => this._onAtlasFrame(dt);
    this._atlasDetectListener = () => this._onAtlasDetect();
    /** 递增以取消进行中的异步摄像头初始化 */
    this._gestureInitGen = 0;
  }

  /** onEnter: 创建 Three.js 场景、加载 FBX、启用手势与解构交互 */
  async onEnter() {
    if (this.active) return;
    this.active = true;

    if (!document.getElementById('section-atlas') || !this.canvas) {
      console.error('[AtlasSection] 容器缺失，无法初始化');
      return;
    }

    // 确保图鉴 shell 已显示后再测量 viewport（避免 buffer 0×0 白屏）
    this.ui.sectionVisibility.showStage('atlas');
    this.ui.clapFlash?.classList.remove('active', 'fade');
    logAtlasViewportDiagnostics('AtlasSection.before-rAF');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    logAtlasViewportDiagnostics('AtlasSection.after-rAF');

    if (this.sceneManager) {
      this.sceneManager.dispose();
      this.sceneManager = null;
      this.ui.atlasSceneManager = null;
    }

    this.sceneManager = new SceneManager(this.canvas);
    this.ui.atlasSceneManager = this.sceneManager;
    this.interactions = {
      deconstruct: new DeconstructInteraction(this.sceneManager, this.ui),
      material: new MaterialRestoreInteraction(this.sceneManager, this.ui),
    };

    await this.sceneManager.loadArtifact(DEFAULT_ARTIFACT_INDEX);
    const artifact = this.sceneManager.getCurrentArtifact();

    this.ui.selectArtifact(DEFAULT_ARTIFACT_INDEX);
    this.ui.updateArtifactInfo(artifact);
    this.currentMode = 'deconstruct';
    this.switchMode('deconstruct');
    this.ui.syncArtifactStages();
    this.ui.logSectionState('AtlasSection.onEnter');
    this.ui._scheduleAtlasResize();

    this.sceneManager.resize();
    await new Promise((r) => requestAnimationFrame(r));
    this.sceneManager.resize();
    this.sceneManager.frameModel();

    this._bindKeyboard();

    // ① 立即启动 WebGL 渲染循环（不依赖摄像头）
    this.sceneManager.addFrameListener(this._atlasFrameListener);
    this.sceneManager.addPostFrameListener(this._atlasDetectListener);
    this.sceneManager.startLoop();
    logAtlasViewportDiagnostics('AtlasSection.loopStarted', this.sceneManager);

    // ② 摄像头 + MediaPipe 异步初始化，失败也不阻塞画面
    this._initGestureAsync();

    window.setTimeout(() => {
      if (this.active && this.sceneManager) {
        logAtlasViewportDiagnostics('AtlasSection.+2s', this.sceneManager);
      }
    }, 2000);
  }

  /** onLeave: 停止 rAF、释放 WebGL、关闭摄像头 */
  onLeave() {
    if (!this.active) return;
    this.active = false;
    this._gestureInitGen += 1;

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
    this.ui.atlasSceneManager = null;

    this.ui.showGestureUI(false);
    this.ui.updateGestureLabel('none');
    this.ui.clapFlash?.classList.remove('active', 'fade');
  }

  switchMode(mode) {
    if (!this.active || !this.interactions[mode]) return;
    Object.values(this.interactions).forEach((i) => i.deactivate?.());
    this.currentMode = mode;
    this.interactions[mode].activate?.();
    this.ui.syncArtifactStages();
  }

  async loadArtifact(index) {
    if (!this.sceneManager || this._artifactSwitchBusy) return;
    this._artifactSwitchBusy = true;
    try {
      this.ui.setArtifactLoading(index, true);
      const artifact = await this.sceneManager.loadArtifact(index);
      this.ui.setArtifactLoading(index, false);
      this.ui.updateArtifactInfo(artifact);
      Object.values(this.interactions).forEach((i) => i.deactivate?.());
      this.switchMode(this.currentMode);
      this.sceneManager.resize();
      this.sceneManager.frameModel();
    } finally {
      this._artifactSwitchBusy = false;
    }
  }

  /** 后台初始化摄像头/手势，不阻塞 startLoop */
  _initGestureAsync() {
    const gen = ++this._gestureInitGen;
    this._startGesture(gen).catch((err) => {
      if (gen !== this._gestureInitGen) return;
      console.warn('[AtlasSection] 摄像头/手势初始化异常:', err?.message ?? err);
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
        this._handleGesture(gesture);
      };

      gc.onHandsDistanceChange = (dist) => {
        if (this.currentMode === 'material') {
          this.interactions.material.onHandsDistance(dist);
        }
      };

      gc.onClap = () => this._onClapSwitchArtifact();

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
      this.ui._applySectionHint('atlas', this.currentMode);
      if (this.ui.interactionHint) {
        this.ui.interactionHint.textContent +=
          ' （摄像头未授权，仍可用鼠标预览交互）';
      }
    }
  }

  _handleGesture(gesture) {
    this.interactions[this.currentMode]?.onGesture?.(gesture);
  }

  /** 拍手 → 顺序切换下一件文物（循环） */
  async _onClapSwitchArtifact() {
    if (!this.active || this._artifactSwitchBusy) return;
    const next = (this.ui.currentArtifactIndex + 1) % ARTIFACTS.length;
    this.ui.playClapFlash();
    this.ui.selectArtifact(next);
    await this.loadArtifact(next);
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

  _onAtlasFrame(_dt) {
    this.gestureController?.tickProcess();
    this.skeletonOverlay?.draw();

    const gc = this.gestureController ?? null;
    if (this.currentMode === 'deconstruct') {
      this.interactions.deconstruct?.update(gc);
    }
    if (this.currentMode === 'material') {
      this.interactions.material?.update();
    }
  }

  _onAtlasDetect() {
    this.gestureController?.tickDetect();
  }
}
