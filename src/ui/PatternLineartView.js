import {
  PATTERN_DRAWERS,
  drawVesselSilhouette,
  getLineartLayout,
} from '../data/lineart-patterns.js';

const GOLD = '#C9A84C';
const PATINA_DIM = 'rgba(111, 148, 120, 0.22)';
const PATINA_MID = 'rgba(111, 148, 120, 0.38)';
const INK = '#070A08';

/**
 * 2D 线稿纹样视图 — 手电筒 radial 照亮 → 纹样泛金
 */
export class PatternLineartView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = null;
    this.placements = [];
    this._goldBuffer = document.createElement('canvas');
    this._goldCtx = this._goldBuffer.getContext('2d');
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  setArtifact(artifact) {
    this.layout = getLineartLayout(artifact.id);
    this.placements = this.layout.patterns.map((p) => ({
      ...p,
      drawer: PATTERN_DRAWERS[p.id],
    }));
    this.render(null);
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._goldBuffer.width = w * dpr;
    this._goldBuffer.height = h * dpr;
    this._goldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
    this._flashRadius = Math.min(w, h) * 0.22;
  }

  /** @param {{ x: number, y: number } | null} flashNorm 归一化坐标 0–1，null 仅暗态 */
  render(flashNorm) {
    if (!this.layout || !this._w) return;

    const { ctx, _w: w, _h: h } = this;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = PATINA_MID;
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.52);
    drawVesselSilhouette(ctx, this.layout.silhouette);
    ctx.restore();

    ctx.strokeStyle = PATINA_DIM;
    ctx.lineWidth = 0.9;
    this._drawAllPatterns(ctx);

    if (flashNorm) {
      const fx = flashNorm.x * w;
      const fy = flashNorm.y * h;
      this._renderGoldFlashlight(fx, fy);
      this._renderFlashlightAmbient(fx, fy);
    }
  }

  _drawAllPatterns(targetCtx) {
    const { _w: w, _h: h } = this;
    this.placements.forEach((p) => {
      if (!p.drawer) return;
      targetCtx.save();
      targetCtx.translate(p.nx * w, p.ny * h);
      targetCtx.scale(p.scale, p.scale);
      p.drawer(targetCtx);
      targetCtx.restore();
    });
  }

  _renderGoldFlashlight(fx, fy) {
    const { ctx, _goldCtx: gCtx, _w: w, _h: h, _flashRadius: r } = this;

    gCtx.clearRect(0, 0, w, h);
    gCtx.strokeStyle = GOLD;
    gCtx.lineWidth = 1.3;
    gCtx.lineCap = 'round';
    gCtx.lineJoin = 'round';
    gCtx.shadowColor = GOLD;
    gCtx.shadowBlur = 10;
    this._drawAllPatterns(gCtx);
    gCtx.shadowBlur = 0;

    gCtx.globalCompositeOperation = 'destination-in';
    const grad = gCtx.createRadialGradient(fx, fy, 0, fx, fy, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, w, h);
    gCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(this._goldBuffer, 0, 0, w, h);
  }

  _renderFlashlightAmbient(fx, fy) {
    const { ctx, _flashRadius: r } = this;
    const inner = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    inner.addColorStop(0, 'rgba(201, 168, 76, 0.12)');
    inner.addColorStop(0.35, 'rgba(201, 168, 76, 0.05)');
    inner.addColorStop(1, 'rgba(201, 168, 76, 0)');
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, this._w, this._h);

    ctx.beginPath();
    ctx.arc(fx, fy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(201, 168, 76, 0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  pixelToNorm(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  dispose() {
    this._resizeObserver.disconnect();
  }
}
