import { damp } from '../scene/PointCloudCastModel.js';
import { PartLabelOverlay } from '../ui/PartLabelOverlay.js';

/**
 * 解构与重构 · 克制的考古式分件平移 + 分件标注引线
 *
 * 两条独立控制链路（互不干扰）：
 * 1. 【张合控制拆解】握拳→progress 0，张开程度→连续 progress×0.8
 * 2. 【旋转控制视角】张开后转手→粒子系统绕 Y 轴旋转，拆解进度保持不变
 */
export class DeconstructInteraction {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;

    // 【旋转控制视角】累积 Y 轴转角与角速度（转手驱动，与拆解 progress 解耦）
    this._viewRotY = 0;
    this._viewRotVelY = 0;
    this.lastAbsTime = performance.now() * 0.001;

    /** 转手灵敏度：帧间角度增量 → 角速度增益 */
    this._twistGain = 2.8;
    /** 仅当张开程度超过此阈值时才响应转手，避免握拳时误触旋转 */
    this._twistOpenThreshold = 0.22;

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
      if (key === 'c') pc.setDeconstructState(0);
      if (key === 'd') pc.setDeconstructState(1);
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

  /** 键盘：S=实体 C=粒子云(0) D=解构(1) G=debug着色 */
  _bindKeyboardTest() {
    window.addEventListener('keydown', this._onKeydown);
  }

  activate() {
    this.active = true;
    this.sceneManager.setAutoRotate(false);
    this.sceneManager.pointCloud?.setDeconstructState('solid');
    this.sceneManager.pointCloud?.setAutoSpin(false);
    this.partLabels?.setVisible(true);
    this.lastAbsTime = performance.now() * 0.001;
  }

  deactivate() {
    this.active = false;
    this.sceneManager.pointCloud?.setDeconstructState('solid');
    this.sceneManager.pointCloud?.setHandRotation(0, 0);
    this.sceneManager.pointCloud?.setAutoSpin(true);
    this.partLabels?.setVisible(false);
    this._viewRotY = 0;
    this._viewRotVelY = 0;
    this.sceneManager.setAutoRotate(true);
  }

  onGesture(gesture) {
    const pc = this.sceneManager.pointCloud;
    if (!pc) return;

    // MediaPipe接入点：握拳 → progress 0
    if (gesture === 'fist') pc.setDeconstructState(0);
    // MediaPipe接入点：张开 → progress 1
    else if (gesture === 'open') pc.setDeconstructState(1);
  }

  update(gestureController) {
    if (!this.active) return;

    const pc = this.sceneManager.pointCloud;
    if (!pc) return;

    const absTime = performance.now() * 0.001;
    const dt = Math.min(0.05, absTime - this.lastAbsTime);
    this.lastAbsTime = absTime;

    // ── 链路 1：张合控制拆解 ──────────────────────────────────────
    // 五指张合程度(0~1) → 连续解构进度，上限 MAX_DECONSTRUCT
    const openness = gestureController?.getHandOpenness?.();
    if (openness != null && gestureController?.currentGesture !== 'none') {
      pc.setDeconstructState(openness);
    }

    pc.update(dt);

    // ── 链路 2：旋转控制视角 ──────────────────────────────────────
    // 转手帧间增量 → 角速度（阻尼平滑）→ 累积 Y 轴转角；拆解 progress 不受影响
    let targetVelY = 0;
    const twist = gestureController?.getHandTwistDelta?.();
    const canTwist =
      twist &&
      openness != null &&
      openness >= this._twistOpenThreshold &&
      gestureController?.currentGesture !== 'none';

    if (canTwist) {
      targetVelY = (twist.delta / Math.max(dt, 1e-4)) * this._twistGain;
    } else if (this._mouseNorm) {
      // 无摄像头时：鼠标水平位置映射绝对视角
      const mouseRotY = (this._mouseNorm.x - 0.5) * Math.PI * 1.1;
      this._viewRotY = mouseRotY;
      targetVelY = 0;
      this._viewRotVelY = 0;
      pc.setHandRotation(0, this._viewRotY);
      const artifact = this.sceneManager.getCurrentArtifact();
      this.partLabels?.update(this.sceneManager.camera, pc, artifact?.id);
      return;
    }

    this._viewRotVelY = damp(this._viewRotVelY, targetVelY, 9, dt);
    this._viewRotY += this._viewRotVelY * dt;

    pc.setHandRotation(0, this._viewRotY);

    // 分件标注：质心投影每帧更新（质心本身每 3 帧重算）
    const artifact = this.sceneManager.getCurrentArtifact();
    this.partLabels?.update(this.sceneManager.camera, pc, artifact?.id);
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
