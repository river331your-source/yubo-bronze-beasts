/** 默认器物线稿（后续可按文物切换 src） */
const DEFAULT_LINEART_SRC = '/patterns/artifacts/shenshou_lines.png';

/**
 * 纹样探秘 · 器物线稿手电筒
 * 双层叠加（暗层 + 染金层）+ CSS mask 遮罩跟随鼠标/触屏/手势
 */
export class PatternFlashlightInteraction {
  /**
   * @param {{ stageEl: HTMLElement, getArtifact?: () => object | null }} opts
   */
  constructor({ stageEl, getArtifact }) {
    this.stageEl = stageEl;
    this.getArtifact = getArtifact ?? (() => null);

    this.dimLayer = stageEl.querySelector('.pattern-lineart--dim');
    this.goldLayer = stageEl.querySelector('.pattern-lineart--gold');

    this.active = false;
    this._torchVisible = false;
    this._gestureFlashlight = false;

    this._onMouseMove = (e) => {
      if (!this.active) return;
      this._setTorchFromClient(e.clientX, e.clientY);
    };
    this._onTouchMove = (e) => {
      if (!this.active || e.touches.length === 0) return;
      const t = e.touches[0];
      this._setTorchFromClient(t.clientX, t.clientY);
    };
    this._onPointerLeave = () => {
      if (!this.active || this._gestureFlashlight) return;
      this._hideTorch();
    };

    stageEl.addEventListener('mousemove', this._onMouseMove);
    stageEl.addEventListener('touchmove', this._onTouchMove, { passive: true });
    stageEl.addEventListener('mouseleave', this._onPointerLeave);
    stageEl.addEventListener('touchend', this._onPointerLeave);
    stageEl.addEventListener('touchcancel', this._onPointerLeave);
  }

  activate() {
    this.active = true;
    const artifact = this.getArtifact();
    if (artifact) this.setArtifact(artifact);
    this._hideTorch();
  }

  deactivate() {
    this.active = false;
    this._gestureFlashlight = false;
    this._hideTorch();
  }

  setArtifact(_artifact) {
    // 暂用青铜神兽线稿；后续可按文物 id 映射不同 PNG
    this.dimLayer?.setAttribute('src', DEFAULT_LINEART_SRC);
    this.goldLayer?.setAttribute('src', DEFAULT_LINEART_SRC);
  }

  /**
   * 更新手电筒光斑位置（金色图层内像素坐标，供外部/手势调用）
   * @param {number} x
   * @param {number} y
   */
  setTorchPos(x, y) {
    if (!this.goldLayer) return;
    // 遮罩跟随：radial-gradient 圆心绑定 CSS 变量
    this.goldLayer.style.setProperty('--torch-x', `${x}px`);
    this.goldLayer.style.setProperty('--torch-y', `${y}px`);
    this.goldLayer.classList.add('pattern-lineart--lit');
    this._torchVisible = true;
  }

  /** 将视口 client 坐标转为金色图层局部坐标 */
  _clientToGoldLocal(clientX, clientY) {
    const rect = this.goldLayer?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _setTorchFromClient(clientX, clientY) {
    const local = this._clientToGoldLocal(clientX, clientY);
    if (!local) return;
    this.setTorchPos(local.x, local.y);
  }

  onGesture(gesture) {
    this._gestureFlashlight = gesture === 'ok';
    if (!this._gestureFlashlight && !this._torchVisible) {
      this._hideTorch();
    }
  }

  update(gestureController) {
    if (!this.active || !this._gestureFlashlight || !gestureController) return;

    const screenPos = gestureController.getIndexFingerScreenPos();
    if (!screenPos) return;

    const viewport = document.getElementById('viewport-16-9')?.getBoundingClientRect();
    if (!viewport) return;

    const absX = viewport.left + screenPos.x * viewport.width;
    const absY = viewport.top + screenPos.y * viewport.height;
    this._setTorchFromClient(absX, absY);
  }

  _hideTorch() {
    this.goldLayer?.classList.remove('pattern-lineart--lit');
    this._torchVisible = false;
  }

  dispose() {
    this.deactivate();
    this.stageEl.removeEventListener('mousemove', this._onMouseMove);
    this.stageEl.removeEventListener('touchmove', this._onTouchMove);
    this.stageEl.removeEventListener('mouseleave', this._onPointerLeave);
    this.stageEl.removeEventListener('touchend', this._onPointerLeave);
    this.stageEl.removeEventListener('touchcancel', this._onPointerLeave);
  }
}
