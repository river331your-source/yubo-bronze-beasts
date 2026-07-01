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
    /** 递增以取消进行中的 onEnter（转场/快速切换） */
    this._enterGen = 0;
    this._readyResolve = null;
    this._readyPromise = Promise.resolve();
  }

  /** 图鉴就绪：WebGL 循环已启动且至少渲染一帧 */
  whenReady() {
    return this._readyPromise;
  }

  _resetReadyPromise() {
    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve;
    });
  }

  _markReady() {
    this._readyResolve?.();
    this._readyResolve = null;
  }

  /** 转场层移除后兜底：resize + 确认渲染循环 */
  ensureRendering() {
    if (!this.active || !this.sceneManager) {
      console.warn('[AtlasSection] ensureRendering 跳过：图鉴未激活');
      return;
    }
    this.ui.sectionVisibility.showStage('atlas');
    this.ui._scheduleAtlasResize();
    this.sceneManager.resize();
    this.sceneManager.frameModel();
    this.sceneManager.ensureLoopRunning();
    console.log('[AtlasSection] ensureRendering 完成', {
      loopRunning: this.sceneManager._running,
      buffer: `${this.sceneManager.canvas?.width}×${this.sceneManager.canvas?.height}`,
    });
  }

  /** onEnter: 创建 Three.js 场景、加载 FBX、启用手势与解构交互 */
  async onEnter() {
    if (this.active) return;
    const enterGen = ++this._enterGen;
    this.active = true;
    this._resetReadyPromise();

    if (!document.getElementById('section-atlas') || !this.canvas) {
      console.error('[AtlasSection] 容器缺失，无法初始化');
      this._markReady();
      return;
    }

    // 确保图鉴 shell 已显示后再测量 viewport（避免 buffer 0×0 白屏）
    this.ui.sectionVisibility.showStage('atlas');
    this.ui.clapFlash?.classList.remove('active', 'fade');
    logAtlasViewportDiagnostics('AtlasSection.before-rAF');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!this._isEnterCurrent(enterGen)) return;
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

    this._bindKeyboard();

    // ① 立即启动 WebGL 渲染循环（模型加载期间门后照常渲染，转场层不介入）
    this.sceneManager.addFrameListener(this._atlasFrameListener);
    this.sceneManager.addPostFrameListener(this._atlasDetectListener);
    this.sceneManager.startLoop();
    console.log('[AtlasSection] startLoop() 已调用 — 渲染循环应在门后运行', {
      running: this.sceneManager._running,
    });
    logAtlasViewportDiagnostics('AtlasSection.loopStarted(early)', this.sceneManager);

    this.ui._scheduleAtlasResize();
    this.sceneManager.resize();

    await this.sceneManager.loadArtifact(DEFAULT_ARTIFACT_INDEX);
    if (!this._isEnterCurrent(enterGen)) return;

    const artifact = this.sceneManager.getCurrentArtifact();

    this.ui.selectArtifact(DEFAULT_ARTIFACT_INDEX);
    this.ui.updateArtifactInfo(artifact);
    this.currentMode = 'deconstruct';
    this.switchMode('deconstruct');
    this.ui.syncArtifactStages();
    this.ui.logSectionState('AtlasSection.onEnter');

    this.sceneManager.resize();
    await new Promise((r) => requestAnimationFrame(r));
    if (!this._isEnterCurrent(enterGen)) return;
    this.sceneManager.resize();
    this.sceneManager.frameModel();

    this.sceneManager.ensureLoopRunning();
    await new Promise((r) => requestAnimationFrame(r));
    if (!this._isEnterCurrent(enterGen)) return;
    this._markReady();
    console.log('[AtlasSection] 图鉴就绪 — RAF 应显示×1', {
      running: this.sceneManager._running,
    });

    // ② 摄像头 + MediaPipe 异步初始化，失败也不阻塞画面
    this._initGestureAsync();

    window.setTimeout(() => {
      if (this.active && this.sceneManager) {
        logAtlasViewportDiagnostics('AtlasSection.+2s', this.sceneManager);
      }
    }, 2000);
  }

  _isEnterCurrent(gen) {
    return this.active && gen === this._enterGen;
  }

  /** onLeave: 停止 rAF、释放 WebGL、关闭摄像头 */
  onLeave() {
    if (!this.active) return;
    this.active = false;
    this._enterGen += 1;
    this._gestureInitGen += 1;
    this._markReady();

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
