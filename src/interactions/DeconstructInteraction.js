import { damp } from '../scene/PointCloudCastModel.js';
import { PartLabelOverlay } from '../ui/PartLabelOverlay.js';

/**
 * 解构与重构 · 克制的考古式分件平移 + 分件标注引线
 * 握拳 → progress 0（完整器物）
 * 张开程度 → 连续 progress×0.8（盖/身分开但保留轮廓）
 */
export class DeconstructInteraction {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;

    this.targetRotX = 0;
    this.targetRotY = 0;
    this.targetRotZ = 0;
    this.currentRotX = 0;
    this.currentRotY = 0;
    this.currentRotZ = 0;
    this.lastAbsTime = performance.now() * 0.001;

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
    this.partLabels?.setVisible(true);
    this.lastAbsTime = performance.now() * 0.001;
  }

  deactivate() {
    this.active = false;
    this.sceneManager.pointCloud?.setDeconstructState('solid');
    this.sceneManager.pointCloud?.setHandRotation(0, 0);
    this.partLabels?.setVisible(false);
    this.currentRotX = 0;
    this.currentRotY = 0;
    this.currentRotZ = 0;
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

    // MediaPipe接入点：手掌张开程度(0~1) → 连续解构，上限 MAX_DECONSTRUCT
    const openness = gestureController?.getHandOpenness?.();
    if (openness != null && gestureController?.currentGesture !== 'none') {
      pc.setDeconstructState(openness);
    }

    pc.update(dt);

    const track = gestureController?.getHandTrackTransform?.() ?? null;
    if (track?.present) {
      this.targetRotY = track.rotY;
      this.targetRotX = track.rotX;
      this.targetRotZ = track.rotZ ?? 0;
    } else if (this._mouseNorm) {
      this.targetRotY = (this._mouseNorm.x - 0.5) * Math.PI * 1.1;
      this.targetRotX = (this._mouseNorm.y - 0.5) * Math.PI * 0.38;
      this.targetRotZ = 0;
    } else {
      this.targetRotY = 0;
      this.targetRotX = 0;
      this.targetRotZ = 0;
    }

    this.currentRotY = damp(this.currentRotY, this.targetRotY, 5, dt);
    this.currentRotX = damp(this.currentRotX, this.targetRotX, 5, dt);
    this.currentRotZ = damp(this.currentRotZ, this.targetRotZ, 5, dt);

    // MediaPipe接入点：手掌移动 → 叠加旋转（自转在 PointCloudFromModel 内）
    pc.setHandRotation(this.currentRotX, this.currentRotY);

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
