/**
 * 首次交互引导 · 控制器
 *
 * 状态机：camera → form → deconstruct → dissolve → switch → complete
 * 只消费 GestureController 已识别的手势结果，不做 landmarks 二次判定。
 * 引导的视觉动作全部调用现有交互方法（pointCloud / _onClapSwitchArtifact）。
 */
export const TutorialStep = {
  CAMERA: 'camera',
  FORM: 'form',
  DECONSTRUCT: 'deconstruct',
  DISSOLVE: 'dissolve',
  SWITCH: 'switch',
  COMPLETE: 'complete',
};

const STORAGE_KEY = 'yuboTutorialCompleted';

const HOLD_MS = 350;
const ADVANCE_MS = 800;

export class TutorialController {
  constructor({ overlay, section }) {
    this.overlay = overlay;
    this.section = section;
    this.step = null;
    this.active = false;
    this.touchOnly = false;
    this._holdTimer = null;
    this._advanceTimer = null;
    this._pendingGesture = null;
    this.onDone = null;
  }

  static completedBefore() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  static markCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* ignore */ }
  }

  start({ touchOnly = false } = {}) {
    this.stop(false);
    this.active = true;
    this.touchOnly = touchOnly;
    this.overlay.show();
    if (touchOnly) {
      this.overlay.setWaiting('触控引导');
      this._go(TutorialStep.FORM);
    } else {
      this._go(TutorialStep.CAMERA);
    }
  }

  restart() {
    TutorialController.markCompleted();
    this.start({ touchOnly: this.section?.ui?.touchMode ?? false });
  }

  skip() {
    TutorialController.markCompleted();
    this.stop(true);
  }

  stop(notify = true) {
    this.active = false;
    this.step = null;
    clearTimeout(this._holdTimer);
    clearTimeout(this._advanceTimer);
    this._pendingGesture = null;
    this.overlay.hide();
    if (notify) this.onDone?.();
  }

  /** 由 AtlasSection 转发 GestureController 识别结果 */
  handleGesture(gesture) {
    if (!this.active || this.touchOnly) return;
    if (this.step === TutorialStep.CAMERA && gesture !== 'none' && gesture !== 'unknown') {
      this._go(TutorialStep.FORM);
      return;
    }
    const need = {
      [TutorialStep.FORM]: ['fist'],
      [TutorialStep.DECONSTRUCT]: ['archaeology'],
      [TutorialStep.DISSOLVE]: ['dissolve'],
      [TutorialStep.SWITCH]: ['clap', 'two_hands'],
    }[this.step];
    if (!need || !need.includes(gesture)) return;
    if (this._pendingGesture === gesture) return;
    this._pendingGesture = gesture;
    this.overlay.setRecognized(this._recognizedLabel(gesture));
    this._applyAction(this.step);
    this._holdTimer = setTimeout(() => {
      if (!this.active) return;
      this._pendingGesture = null;
      this.overlay.setComplete(this._doneLabel(this.step));
      this._advanceTimer = setTimeout(() => this._next(), ADVANCE_MS);
    }, HOLD_MS);
  }

  /** 触控模式：备用按钮完成当前步骤 */
  handleTouchAction(action) {
    if (!this.active || !this.touchOnly) return false;
    const need = {
      [TutorialStep.FORM]: 'gather',
      [TutorialStep.DECONSTRUCT]: 'deconstruct',
      [TutorialStep.DISSOLVE]: 'dissolve',
      [TutorialStep.SWITCH]: 'next',
    }[this.step];
    if (action !== need) return false;
    this.section?.handleTouchAction?.(action);
    this.overlay.setComplete(this._doneLabel(this.step));
    this._advanceTimer = setTimeout(() => this._next(), ADVANCE_MS);
    return true;
  }

  handleCameraFailed() {
    if (!this.active || this.step !== TutorialStep.CAMERA) return;
    this.overlay.setCameraFailed();
  }

  enableTouchMode() {
    if (!this.active) return;
    this.touchOnly = true;
    this.overlay.setWaiting('触控引导');
    this._go(TutorialStep.FORM);
  }

  _go(step) {
    clearTimeout(this._holdTimer);
    clearTimeout(this._advanceTimer);
    this._pendingGesture = null;
    this.step = step;
    this.overlay.setStep(step, this.touchOnly);
  }

  _next() {
    if (!this.active) return;
    const order = [TutorialStep.FORM, TutorialStep.DECONSTRUCT, TutorialStep.DISSOLVE, TutorialStep.SWITCH];
    const i = order.indexOf(this.step);
    if (i < 0 || i === order.length - 1) {
      TutorialController.markCompleted();
      this.step = TutorialStep.COMPLETE;
      this.overlay.setComplete('探索已开启', true);
      this._advanceTimer = setTimeout(() => this.stop(true), 2200);
      return;
    }
    this._go(order[i + 1]);
  }

  /** 调用现有交互，不另写聚形/解构逻辑 */
  _applyAction(step) {
    if (step === TutorialStep.SWITCH) {
      this.section?._onClapSwitchArtifact?.();
    } else {
      const pc = this.section?.sceneManager?.pointCloud;
      if (!pc) return;
      if (step === TutorialStep.FORM) {
        pc.setDeconstructState('solid');
        pc.setDissolveState(0);
      } else if (step === TutorialStep.DECONSTRUCT) {
        pc.setDeconstructState(1);
        pc.setDissolveState(0);
      } else if (step === TutorialStep.DISSOLVE) {
        pc.setDeconstructState(1);
        pc.setDissolveState(1);
      }
    }
  }

  _recognizedLabel(gesture) {
    return {
      fist: '已识别：握拳',
      archaeology: '已识别：解构',
      dissolve: '已识别：消散',
      clap: '已识别：双手拍合',
      two_hands: '已识别：双手拍合',
    }[gesture] ?? '已识别';
  }

  _doneLabel(step) {
    return {
      [TutorialStep.FORM]: '✓ 文物显形',
      [TutorialStep.DECONSTRUCT]: '✓ 器物已解构',
      [TutorialStep.DISSOLVE]: '✓ 粒子已释放',
      [TutorialStep.SWITCH]: '✓ 文物已切换',
    }[step] ?? '✓ 完成';
  }
}
