import { PatternLineartView } from '../ui/PatternLineartView.js';

/**
 * 纹样探秘 · 线稿版
 * 👌 手势 / 鼠标移动 → 手电筒照亮线稿纹样 → 照中处泛出吉金光
 */
export class PatternFlashlightInteraction {
  constructor({ lineartCanvas, getArtifact, webglCanvas = null }) {
    this.getArtifact = getArtifact;
    this.webglCanvas = webglCanvas;
    this.lineartView = new PatternLineartView(lineartCanvas);
    this.lineartCanvas = lineartCanvas;

    this.active = false;
    this.flashlightOn = false;
    this.flashNorm = null;
    this._mouseNorm = null;
    this._mouseDown = false;
    this._gestureFlashlight = false;

    this._onMouseMove = (e) => {
      if (!this.active) return;
      this._mouseNorm = this.lineartView.pixelToNorm(e.clientX, e.clientY);
      if (this._mouseDown) this.flashlightOn = true;
    };
    this._onMouseDown = () => {
      if (!this.active) return;
      this._mouseDown = true;
      this.flashlightOn = true;
    };
    this._onMouseUp = () => {
      this._mouseDown = false;
      if (!this._gestureFlashlight) this.flashlightOn = false;
    };
    this._onMouseLeave = () => {
      this._mouseNorm = null;
      if (!this._gestureFlashlight) {
        this.flashlightOn = false;
      }
    };

    lineartCanvas.addEventListener('mousemove', this._onMouseMove);
    lineartCanvas.addEventListener('mousedown', this._onMouseDown);
    lineartCanvas.addEventListener('mouseup', this._onMouseUp);
    lineartCanvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  setArtifact(artifact) {
    this.lineartView.setArtifact(artifact);
    this.lineartView.render(this.flashNorm);
  }

  activate() {
    this.active = true;
    // 舞台可见性由 UIController.syncArtifactStages 统一管理
    const artifact = this.getArtifact();
    if (artifact) this.lineartView.setArtifact(artifact);
    this.lineartView.render(null);
  }

  deactivate() {
    this.active = false;
    this.flashlightOn = false;
    this._gestureFlashlight = false;
    this.flashNorm = null;
    this.lineartView.render(null);
  }

  onGesture(gesture) {
    this._gestureFlashlight = gesture === 'ok';
    this.flashlightOn = this._gestureFlashlight;
    if (!this.flashlightOn) {
      this.lineartView.render(this._mouseNorm && this._mouseDown ? this._mouseNorm : null);
    }
  }

  update(gestureController) {
    if (!this.active) return;

    let norm = null;

    if (this.flashlightOn && gestureController) {
      const screenPos = gestureController.getIndexFingerScreenPos();
      if (screenPos) {
        norm = this._screenToLineartNorm(screenPos.x, screenPos.y);
      }
    }

    if (!norm && this._mouseDown && this._mouseNorm) {
      norm = this._mouseNorm;
    }

    if (!norm && !this._gestureFlashlight && this._mouseNorm) {
      norm = this._mouseNorm;
      this.flashlightOn = true;
    }

    this.flashNorm = norm;
    this.lineartView.render(norm);
  }

  _screenToLineartNorm(nx, ny) {
    const rect = this.lineartCanvas.getBoundingClientRect();
    const viewport = document.getElementById('viewport-16-9')?.getBoundingClientRect();
    if (!viewport || rect.width === 0) return { x: nx, y: ny };

    const absX = viewport.left + nx * viewport.width;
    const absY = viewport.top + ny * viewport.height;
    return {
      x: (absX - rect.left) / rect.width,
      y: (absY - rect.top) / rect.height,
    };
  }

  dispose() {
    this.deactivate();
    this.lineartCanvas.removeEventListener('mousemove', this._onMouseMove);
    this.lineartCanvas.removeEventListener('mousedown', this._onMouseDown);
    this.lineartCanvas.removeEventListener('mouseup', this._onMouseUp);
    this.lineartCanvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.lineartView?.dispose?.();
    this.lineartView = null;
  }
}
