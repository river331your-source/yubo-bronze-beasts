import { damp } from '../scene/PointCloudCastModel.js';
import { PartLabelOverlay } from '../ui/PartLabelOverlay.js';

/**
 * 解构交互 · 手势 A/B + 标注联动
 *
 * 手势A（考古）：食拇伸、后三指弯 → 拆解 + 显示标注
 * 手势B（消散）：五指全伸 → 消散 + 隐藏标注
 * 握拳：聚合 + 隐藏标注
 * A→B 过渡：标注随 dissolve 淡出
 */
export class DeconstructInteraction {
  constructor(sceneManager, ui = null) {
    this.sceneManager = sceneManager;
    this.ui = ui;
    this.active = false;
    this.lastAbsTime = performance.now() * 0.001;

    this._viewRotY = 0;
    this._viewRotVelY = 0;
    this._palmSlideGain = 4.2;

    this._mouseNorm = null;
    const stage = sceneManager.canvas.parentElement;
    this.partLabels = stage ? new PartLabelOverlay(stage) : null;

    this._onMouseMove = (e) => {
      if (!this.active) return;
      const rect = stage.getBoundingClientRect();
      this._mouseNorm = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    this._onMouseLeave = () => {
      this._mouseNorm = null;
    };
    this._onKeydown = (e) => {
      if (!this.active) return;
      const key = e.key.toLowerCase();
      const pc = this.sceneManager.pointCloud;
      if (!pc) return;
      if (key === 's') pc.setDeconstructState('solid');
      if (key === 'c') {
        pc.setDeconstructState(0);
        pc.setDissolveState(0);
      }
      if (key === 'd') {
        pc.setDeconstructState(1);
        pc.setDissolveState(0);
      }
      if (key === 'x') {
        pc.setDeconstructState(1);
        pc.setDissolveState(1);
      }
      if (key === 'g') pc.setDebugGroups(!pc.debugGroups);
    };
    this._bindMouseFallback();
    this._bindKeyboardTest();
  }

  _bindMouseFallback() {
    const stage = this.sceneManager.canvas.parentElement;
    if (!stage) return;
    stage.addEventListener('mousemove', this._onMouseMove);
    stage.addEventListener('mouseleave', this._onMouseLeave);
  }

  _bindKeyboardTest() {
    window.addEventListener('keydown', this._onKeydown);
  }

  activate() {
    this.active = true;
    this.sceneManager.setAutoRotate(false);
    const pc = this.sceneManager.pointCloud;
    pc?.setDeconstructState('solid');
    pc?.setDissolveState(0);
    pc?.setAutoSpin(false);
    pc?.setHandRotation(0, 0);
    this._viewRotY = 0;
    this._viewRotVelY = 0;
    this.partLabels?.setVisible(true);
    this.lastAbsTime = performance.now() * 0.001;
  }

  deactivate() {
    this.active = false;
    const pc = this.sceneManager.pointCloud;
    pc?.setDeconstructState('solid');
    pc?.setDissolveState(0);
    pc?.setHandRotation(0, 0);
    pc?.setAutoSpin(true);
    this.partLabels?.setVisible(false);
    this._viewRotY = 0;
    this._viewRotVelY = 0;
    this.sceneManager.setAutoRotate(true);
  }

  onGesture() {}

  update(gestureController) {
    if (!this.active) return;

    const pc = this.sceneManager.pointCloud;
    if (!pc) return;

    const absTime = performance.now() * 0.001;
    const dt = Math.min(0.05, absTime - this.lastAbsTime);
    this.lastAbsTime = absTime;

  // gestureController 可能为 null（摄像头异步初始化中或初始化失败）
    const handPresent =
      gestureController != null &&
      gestureController.currentGesture !== 'none';
    let targetVelY = 0;
    let labelOpacity = 0;

    if (handPresent && typeof gestureController.mapGestureToStages === 'function') {
      const stages = gestureController.mapGestureToStages();
      if (stages) {
        pc.setDeconstructState(stages.deconstruct);
        pc.setDissolveState(stages.dissolve);
        labelOpacity = stages.labelOpacity ?? 0;

        this.ui?.updateGestureLabel?.(stages.uiGesture ?? gestureController.currentGesture);
        if (gestureController.modeDisplayLabel) {
          this.ui?.updateGestureDebugLabel?.(gestureController.modeDisplayLabel);
        }

        const canSlide =
          stages.deconstruct >= 0.45 && stages.mode !== 'fist';

        if (canSlide) {
          const slide = gestureController.getPalmSlideDelta?.();
          if (slide) {
            targetVelY = (slide.delta / Math.max(dt, 1e-4)) * this._palmSlideGain;
          }
        } else {
          gestureController.resetPalmTracking?.();
        }
      }
    } else if (this._mouseNorm) {
      const o = this._mouseNorm.y;
      const deconstruct = Math.min(1, o * 2);
      const dissolve = Math.max(0, (o - 0.5) * 2);
      pc.setDeconstructState(deconstruct);
      pc.setDissolveState(dissolve);
      labelOpacity = dissolve > 0.05 ? Math.max(0, 1 - dissolve * 1.2) : deconstruct > 0.35 ? 1 : 0;
      this._viewRotY = (this._mouseNorm.x - 0.5) * Math.PI * 1.1;
      targetVelY = 0;
      this._viewRotVelY = 0;
      pc.update(dt);
      pc.setHandRotation(0, this._viewRotY);
      this._updateLabels(pc, labelOpacity);
      return;
    }

    this._viewRotVelY = damp(this._viewRotVelY, targetVelY, 10, dt);
    this._viewRotY += this._viewRotVelY * dt;

    pc.update(dt);
    pc.setHandRotation(0, this._viewRotY);

    this._updateLabels(pc, labelOpacity);
  }

  /** 标注随手势显隐：B/握拳=0，A=1，过渡=随 dissolve 淡出 */
  _updateLabels(pc, labelOpacity) {
    if (!this.partLabels) return;

    if (labelOpacity <= 0.02) {
      this.partLabels.clearLabels();
      return;
    }

    this.partLabels.setVisible(true);
    const artifact = this.sceneManager.getCurrentArtifact();
    this.partLabels.update(
      this.sceneManager.camera,
      pc,
      artifact?.id,
      labelOpacity
    );
  }

  dispose() {
    this.deactivate();
    const stage = this.sceneManager?.canvas?.parentElement;
    if (stage) {
      stage.removeEventListener('mousemove', this._onMouseMove);
      stage.removeEventListener('mouseleave', this._onMouseLeave);
    }
    window.removeEventListener('keydown', this._onKeydown);
    this.partLabels?.dispose();
    this.partLabels = null;
  }
}
