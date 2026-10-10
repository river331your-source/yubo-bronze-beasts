import { SceneManager } from '../scene/SceneManager.js';
import { GestureController } from '../interactions/GestureController.js';
import { DeconstructInteraction } from '../interactions/DeconstructInteraction.js';
import { MaterialRestoreInteraction } from '../interactions/MaterialRestoreInteraction.js';
import { SkeletonOverlay } from '../ui/SkeletonOverlay.js';
import { DEFAULT_ARTIFACT_INDEX, ARTIFACTS } from '../data/artifacts.js';
import { isMainLoopRunning, stopMainLoop } from '../core/FrameLoop.js';
import { shouldDeferHeavyInit, deferHeavyInit } from '../utils/heavyInitGate.js';
import { logAtlasViewportDiagnostics } from '../debug/atlasViewportDiagnostics.js';
import { performanceMonitor } from '../debug/PerformanceMonitor.js';

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
    this._visitCount = 0;
    /** 青铜门后预载：只构建场景/点云，不跑主循环 */
    this.behindGate = false;
    /** 延迟到门销毁后再启动 MediaPipe / 摄像头 */
    this.deferGesture = false;
  }

  /** 图鉴就绪：模型与点云已构建且至少渲染一帧（门后模式不要求主循环已启动） */
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

  /** 点击「进入展厅」前：门后预载 atlas，蓄力期间不启动主循环与手势 */
  enterBehindGate() {
    this.behindGate = true;
    this.deferGesture = true;
  }

  /** 预载失败或取消转场时重置门后状态 */
  cancelBehindGate() {
    this.behindGate = false;
    this.deferGesture = false;
  }

  /** 蓄满时：仅启动已准备好的主循环，不做 resize / frameModel */
  activateAfterGate() {
    if (!this.active || !this.sceneManager) {
      console.warn('[AtlasSection] activateAfterGate 跳过：图鉴未激活');
      return;
    }
    if (this.sceneManager._running && isMainLoopRunning()) {
      this.behindGate = false;
      console.log('[AtlasSection] activateAfterGate — 主循环已在运行');
      return;
    }

    this.behindGate = false;
    stopMainLoop();
    this.sceneManager.startLoop();
    console.log('[AtlasSection] activateAfterGate — 主循环已启动', {
      loopRunning: this.sceneManager._running,
    });
  }

  /** 门完全推开并销毁后：启动 MediaPipe / 摄像头 */
  startGestureAfterGate() {
    if (!this.deferGesture) return;
    if (!this.active) return;
    this.deferGesture = false;
    this._initGestureAsync();
  }

  /** 转场层移除后兜底：resize + 确认渲染循环（导航等非门转场路径） */
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

  /** onEnter: 显示版块 → resize → [startLoop | 静态帧] → 模型显示 */
  async onEnter() {
    if (this.active) return;
    if (shouldDeferHeavyInit()) {
      console.log('[AtlasSection] 手机竖屏 — 延迟 Three.js/FBX/MediaPipe 初始化，等待横屏');
      deferHeavyInit(() => { if (!this.active) this.onEnter(); });
      return;
    }
    const enterGen = ++this._enterGen;
    const visitN = ++this._visitCount;
    const gateMode = this.behindGate;
    this.active = true;
    this._resetReadyPromise();

    if (!document.getElementById('section-atlas') || !this.canvas) {
      console.error('[AtlasSection] 容器缺失，无法初始化');
      this._markReady();
      return;
    }

    // ① 显示版块，等待布局稳定后再测量 canvas
    this.ui.sectionVisibility.showStage('atlas');
    this.ui.clapFlash?.classList.remove('active', 'fade');
    logAtlasViewportDiagnostics('AtlasSection.before-rAF');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!this._isEnterCurrent(enterGen)) return;
    logAtlasViewportDiagnostics('AtlasSection.after-rAF');

    const reusing = this._canReuseSceneManager();
    console.log(`[AtlasSection] onEnter — 第 ${visitN} 次进入`, { reusing, gateMode });

    if (!reusing) {
      this._teardownSceneManager();
      this.sceneManager = new SceneManager(this.canvas);
      this.ui.atlasSceneManager = this.sceneManager;
    }

    this._ensureInteractions();
    this._bindKeyboard();

    this.sceneManager.addFrameListener(this._atlasFrameListener);
    this.sceneManager.addPostFrameListener(this._atlasDetectListener);

    // ② 确保 canvas 尺寸正确
    this.ui._scheduleAtlasResize();
    this.sceneManager.resize();
    stopMainLoop();
    if (this.sceneManager._running) {
      this.sceneManager.pauseLoop();
    }

    if (!gateMode) {
      this.sceneManager.startLoop();
      this._logRafState(visitN, 'startLoop 已调用');
      logAtlasViewportDiagnostics('AtlasSection.loopStarted', this.sceneManager);
    } else {
      console.log('[AtlasSection] 门后预载 — 跳过 startLoop，仅静态帧');
    }

    if (!reusing) {
      await this.sceneManager.loadArtifact(DEFAULT_ARTIFACT_INDEX);
      if (!this._isEnterCurrent(enterGen)) return;
      this.ui.selectArtifact(DEFAULT_ARTIFACT_INDEX);
      this.ui.updateArtifactInfo(this.sceneManager.getCurrentArtifact());
      this.currentMode = 'deconstruct';
      this.switchMode('deconstruct');
    } else {
      const idx = this.sceneManager.currentIndex ?? DEFAULT_ARTIFACT_INDEX;
      this.ui.selectArtifact(idx);
      this.ui.updateArtifactInfo(this.sceneManager.getCurrentArtifact());
      this.switchMode(this.currentMode || 'deconstruct');
    }

    if (this.ui._requestedMode && this.interactions[this.ui._requestedMode]) {
      this.switchMode(this.ui._requestedMode);
    }
    this.ui._requestedMode = null;

    this.ui.syncArtifactStages();
    this.ui.logSectionState('AtlasSection.onEnter');

    await new Promise((r) => requestAnimationFrame(r));
    if (!this._isEnterCurrent(enterGen)) return;
    this.sceneManager.resize();
    this.sceneManager.frameModel();

    if (gateMode) {
      stopMainLoop();
      if (this.sceneManager._running) {
        this.sceneManager.pauseLoop();
      }
    } else {
      this.sceneManager.ensureLoopRunning();
      await new Promise((r) => requestAnimationFrame(r));
      if (!this._isEnterCurrent(enterGen)) return;
    }

    this._markReady();
    this._logRafState(visitN, gateMode ? '门后预载就绪（静态帧）' : '图鉴就绪');

    if (!this.deferGesture) {
      this.ui.setTouchBar(this.ui.shouldShowTouchBar(false));
      this._initGestureAsync();
    }

    window.setTimeout(() => {
      if (this.active && this.sceneManager) {
        logAtlasViewportDiagnostics('AtlasSection.+2s', this.sceneManager);
      }
    }, 2000);
  }

  _canReuseSceneManager() {
    return !!(this.sceneManager?.renderer && this.sceneManager?.scene);
  }

  _ensureInteractions() {
    if (!this.sceneManager) return;
    this.interactions = {
      deconstruct: new DeconstructInteraction(this.sceneManager, this.ui),
      material: new MaterialRestoreInteraction(this.sceneManager, this.ui),
    };
  }

  _teardownSceneManager() {
    this.sceneManager?.dispose();
    this.sceneManager = null;
    this.ui.atlasSceneManager = null;
  }

  _logRafState(visitN, label) {
    const loops = performanceMonitor.getActiveLoopNames();
    const count = loops.length;
    console.log(`[AtlasSection] ${label} — 第 ${visitN} 次进入`, {
      sceneLoopRunning: this.sceneManager?._running ?? false,
      rafCount: count,
      rafOk: gateModeOk(count, this.behindGate),
      rafLoops: loops,
      behindGate: this.behindGate,
    });
  }

  /** 应用销毁 / HMR：彻底释放 WebGL */
  dispose() {
    this._teardownSceneManager();
  }

  _isEnterCurrent(gen) {
    return this.active && gen === this._enterGen;
  }

  /** onLeave: 暂停 RAF、关闭手势；场景/renderer 保留供下次复用 */
  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.ui.setTouchBar(false);
    this.behindGate = false;
    this.deferGesture = false;
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

    if (this.sceneManager) {
      this.sceneManager.pauseLoop();
      console.log('[AtlasSection] onLeave — 循环已暂停，场景保留可复用', {
        hasRenderer: !!this.sceneManager.renderer,
      });
    }
    stopMainLoop();

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
    if (shouldDeferHeavyInit()) {
      console.log('[AtlasSection] 手机竖屏中 — 跳过摄像头/MediaPipe 启动');
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
      this.ui.setTouchBar(this.ui.shouldShowTouchBar(true));

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
      if (!this.ui.touchMode) this.ui.showCameraPrompt(err?.code);
      this.ui.setTouchBar(this.ui.shouldShowTouchBar(false, true));
    }
  }

  _handleGesture(gesture) {
    this.interactions[this.currentMode]?.onGesture?.(gesture);
  }

  /** 触控备用：复用现有粒子状态，不另建粒子系统 */
  _touchSetStates(deconstruct, dissolve) {
    const pc = this.sceneManager?.pointCloud;
    if (!pc) return;
    pc.setDeconstructState(deconstruct);
    pc.setDissolveState(dissolve);
  }

  handleTouchAction(action) {
    if (!this.active) return;
    if (action === 'gather') this._touchSetStates('solid', 0);
    else if (action === 'deconstruct') this._touchSetStates(1, 0);
    else if (action === 'dissolve') this._touchSetStates(1, 1);
    else if (action === 'next') this._onClapSwitchArtifact();
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

function gateModeOk(rafCount, behindGate) {
  return behindGate ? rafCount === 0 : rafCount === 1;
}
