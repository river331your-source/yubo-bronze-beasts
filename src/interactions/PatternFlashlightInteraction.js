/**
 * 纹样探秘 · 数字捶拓
 * 暗底线稿 + 累积遮罩 ∩ 金色线稿（lighter 叠加），照过即留痕
 */
const GOLD_FILTER =
  'sepia(1) saturate(4.8) hue-rotate(6deg) brightness(1.18)';

const STAT_W = 88;
const LIFT_THRESHOLD = 70;
const LIFT_DURATION_MS = 1200;
const RICE_PAPER = '#efe6d0';

/** 按 src 缓存染金线稿（一次性 filter，切换/缩放时直接 drawImage） */
const goldLineartCache = new Map();

function getOrBuildGoldCache(src, img) {
  if (!src || !img?.naturalWidth) return null;
  const cached = goldLineartCache.get(src);
  if (cached) return cached;

  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.filter = GOLD_FILTER;
  ctx.drawImage(img, 0, 0);
  ctx.filter = 'none';
  goldLineartCache.set(src, cv);
  return cv;
}

export class PatternFlashlightInteraction {
  /**
   * @param {{ stageEl: HTMLElement, getVessel?: () => object | null }} opts
   */
  constructor({ stageEl, getVessel }) {
    this.stageEl = stageEl;
    this.getVessel = getVessel ?? (() => null);

    this.lineartStack = stageEl.querySelector('.pattern-lineart-stack');
    this.dimLayer = stageEl.querySelector('.pattern-lineart--dim');
    this.goldLayer = stageEl.querySelector('.pattern-lineart--gold');

    this.active = false;
    this._gestureRubbing = false;
    this._drawing = false;
    this._currentVesselId = null;
    this._currentVesselName = '';
    this._currentLineartSrc = null;
    this._goldCache = null;
    this._dirty = false;
    this._progress = 0;
    this._w = 0;
    this._h = 0;
    this._statW = STAT_W;
    this._statH = 70;
    this._raf = null;
    this._resizeDebounceTimer = null;

    this.maskCv = null;
    this.maskCtx = null;
    this.rubCv = null;
    this.rubCtx = null;
    this.artCv = null;
    this.artCtx = null;
    this.statsCv = null;
    this.statsCtx = null;

    this.rubCanvasEl = null;
    this.displayCtx = null;
    this._progressEl = null;
    this._progressFillEl = null;
    this._progressLabelEl = null;
    this._topHintEl = null;
    this._revealBtn = null;
    this._repaperBtn = null;

    /** @type {'rubbing'|'lifting'|'lifted'} */
    this._liftPhase = 'rubbing';
    this._liftT = 0;
    this._liftAnimStart = 0;

    if (this.goldLayer) {
      this.goldLayer.setAttribute('aria-hidden', 'true');
    }

    this._createDisplayCanvas();
    this._createProgressBar();
    this._createTopHint();
    this._createActionButtons();
    this._createOffscreenCanvases();

    this._onPointerDown = (e) => {
      if (!this.active || e.button !== 0 || this._gestureRubbing || this._liftPhase !== 'rubbing') return;
      if (e.target.closest('button')) return;
      this._drawing = true;
      this._tapFromClient(e.clientX, e.clientY);
    };
    this._onPointerMove = (e) => {
      if (!this.active || !this._drawing || this._gestureRubbing) return;
      this._tapFromClient(e.clientX, e.clientY);
    };
    this._onPointerUp = () => {
      if (!this._drawing) return;
      this._drawing = false;
      this._computeProgress();
    };

    this.rubCanvasEl.addEventListener('pointerdown', this._onPointerDown);
    this.rubCanvasEl.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    this._resizeObserver = new ResizeObserver(() => {
      if (!this.active) return;
      clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        this._resizeDebounceTimer = null;
        this._syncCanvasSize();
      }, 150);
    });
    if (this.lineartStack) this._resizeObserver.observe(this.lineartStack);
  }

  activate() {
    this.active = true;
    const vessel = this.getVessel();
    if (vessel) this.setVessel(vessel);
    this._startLoop();
  }

  deactivate() {
    this.active = false;
    this._gestureRubbing = false;
    this._drawing = false;
    this._stopLoop();
  }

  /**
   * 器物切换：暗底 / 素材层同步换线稿 PNG，清空捶拓遮罩
   * @param {{ id: string, name: string, lineartSrc: string, aspectRatio?: string }} vessel
   */
  setVessel(vessel) {
    if (!vessel?.lineartSrc) return;
    if (this._currentVesselId === vessel.id) return;

    this._currentVesselId = vessel.id;
    this._currentVesselName = vessel.name;
    const src = vessel.lineartSrc;

    if (this.lineartStack && vessel.aspectRatio) {
      this.lineartStack.style.setProperty('--lineart-aspect', vessel.aspectRatio);
    }

    this._resetLiftState();

    if (this.dimLayer) {
      this.dimLayer.src = src;
      this.dimLayer.alt = `${vessel.name}线稿`;
    }
    if (this.goldLayer) {
      this.goldLayer.src = src;
    }

    this.lineartStack?.classList.add('pattern-lineart-stack--switching');
    window.setTimeout(() => {
      this.lineartStack?.classList.remove('pattern-lineart-stack--switching');
    }, 220);

    this._reloadLineart();
  }

  getCurrentVesselId() {
    return this._currentVesselId;
  }

  setTorchPos(x, y) {
    this._tap(x, y);
  }

  onGesture(gesture) {
    this._gestureRubbing = gesture === 'ok';
    if (this._gestureRubbing) this._drawing = false;
  }

  update(gestureController) {
    if (!this.active || this._liftPhase !== 'rubbing' || !this._gestureRubbing || !gestureController) return;

    const screenPos = gestureController.getIndexFingerScreenPos();
    if (!screenPos) return;

    const viewport = document.getElementById('viewport-16-9')?.getBoundingClientRect();
    if (!viewport) return;

    const absX = viewport.left + screenPos.x * viewport.width;
    const absY = viewport.top + screenPos.y * viewport.height;
    this._tapFromClient(absX, absY);
  }

  toggleHotspotDebug() {
    return false;
  }

  exportShenshouAnnotations() {}

  dispose() {
    this.deactivate();
    clearTimeout(this._resizeDebounceTimer);
    this._resizeDebounceTimer = null;
    this._resizeObserver?.disconnect();
    this.rubCanvasEl?.removeEventListener('pointerdown', this._onPointerDown);
    this.rubCanvasEl?.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);

    this.rubCanvasEl?.remove();
    this.rubCanvasEl = null;
    this.displayCtx = null;

    this._progressEl?.remove();
    this._progressEl = null;
    this._progressFillEl = null;
    this._progressLabelEl = null;

    this._topHintEl?.remove();
    this._topHintEl = null;
    this._revealBtn?.remove();
    this._revealBtn = null;
    this._repaperBtn?.remove();
    this._repaperBtn = null;

    this.maskCv = null;
    this.maskCtx = null;
    this.rubCv = null;
    this.rubCtx = null;
    this.artCv = null;
    this.artCtx = null;
    this.statsCv = null;
    this.statsCtx = null;
    this._goldCache = null;
  }

  /* ---------- canvas 基础设施 ---------- */

  _createDisplayCanvas() {
    if (!this.lineartStack) return;
    this.rubCanvasEl = document.createElement('canvas');
    this.rubCanvasEl.className = 'pattern-rub-canvas';
    this.lineartStack.appendChild(this.rubCanvasEl);
    this.displayCtx = this.rubCanvasEl.getContext('2d');
  }

  _createOffscreenCanvases() {
    this.maskCv = document.createElement('canvas');
    this.maskCtx = this.maskCv.getContext('2d');
    this.rubCv = document.createElement('canvas');
    this.rubCtx = this.rubCv.getContext('2d');
    this.artCv = document.createElement('canvas');
    this.artCtx = this.artCv.getContext('2d');
    this.statsCv = document.createElement('canvas');
    this.statsCtx = this.statsCv.getContext('2d');
  }

  _createProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'pattern-rub-progress';
    Object.assign(bar.style, {
      position: 'absolute',
      left: '8%',
      right: '8%',
      bottom: '4%',
      zIndex: '6',
      pointerEvents: 'none',
    });

    const track = document.createElement('div');
    Object.assign(track.style, {
      height: '3px',
      background: 'rgba(201,168,76,0.18)',
      borderRadius: '2px',
      overflow: 'hidden',
    });

    const fill = document.createElement('div');
    fill.className = 'pattern-rub-progress__fill';
    Object.assign(fill.style, {
      height: '100%',
      width: '0%',
      background: 'linear-gradient(90deg, #c9a84c, #fff3c4)',
      borderRadius: '2px',
      transition: 'width 0.35s ease',
    });

    const label = document.createElement('span');
    label.className = 'pattern-rub-progress__label';
    Object.assign(label.style, {
      display: 'block',
      marginTop: '6px',
      textAlign: 'center',
      fontSize: '12px',
      letterSpacing: '0.2em',
      color: 'rgba(201,168,76,0.65)',
    });
    label.textContent = '已拓 0%';

    track.appendChild(fill);
    bar.appendChild(track);
    bar.appendChild(label);
    this.stageEl.appendChild(bar);

    this._progressEl = bar;
    this._progressFillEl = fill;
    this._progressLabelEl = label;
  }

  _updateProgressUI() {
    const pct = Math.round(this._progress);
    if (this._progressFillEl) this._progressFillEl.style.width = `${pct}%`;
    if (this._progressLabelEl) this._progressLabelEl.textContent = `已拓 ${pct}%`;
    this._updateActionButtons();
  }

  _createTopHint() {
    const hint = document.createElement('div');
    hint.className = 'pattern-rub-top-hint';
    Object.assign(hint.style, {
      position: 'absolute',
      top: '9%',
      left: '0',
      right: '0',
      zIndex: '6',
      textAlign: 'center',
      fontSize: '14px',
      letterSpacing: '0.35em',
      color: 'rgba(201, 168, 76, 0.72)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.45s ease',
    });
    this.stageEl.appendChild(hint);
    this._topHintEl = hint;
  }

  _createActionButtons() {
    const baseBtn = {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '7',
      padding: '8px 22px',
      borderRadius: '999px',
      border: '1px solid rgba(201, 168, 76, 0.55)',
      background: 'rgba(7, 10, 8, 0.88)',
      color: 'rgba(201, 168, 76, 0.92)',
      fontSize: '12px',
      letterSpacing: '0.35em',
      cursor: 'pointer',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 0.4s ease, border-color 0.25s ease, box-shadow 0.25s ease',
      boxShadow: '0 0 12px rgba(201, 168, 76, 0.12)',
    };

    this._revealBtn = document.createElement('button');
    this._revealBtn.type = 'button';
    this._revealBtn.className = 'pattern-rub-reveal-btn';
    this._revealBtn.textContent = '揭 纸';
    Object.assign(this._revealBtn.style, baseBtn, { bottom: '11%' });
    this._revealBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._startLift();
    });

    this._repaperBtn = document.createElement('button');
    this._repaperBtn.type = 'button';
    this._repaperBtn.className = 'pattern-rub-repaper-btn';
    this._repaperBtn.textContent = '重新铺纸';
    Object.assign(this._repaperBtn.style, baseBtn, { bottom: '11%', letterSpacing: '0.22em' });
    this._repaperBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._repaper();
    });

    this.stageEl.appendChild(this._revealBtn);
    this.stageEl.appendChild(this._repaperBtn);
    this._updateActionButtons();
    this._updateTopHint();
  }

  _updateTopHint() {
    if (!this._topHintEl) return;
    if (this._liftPhase === 'lifted') {
      this._topHintEl.textContent = `拓 片 已 成 · ${this._currentVesselName || ''}`;
      this._topHintEl.style.opacity = '1';
    } else {
      this._topHintEl.textContent = '';
      this._topHintEl.style.opacity = '0';
    }
  }

  _updateActionButtons() {
    const showReveal =
      this._liftPhase === 'rubbing' && this._progress >= LIFT_THRESHOLD;
    const showRepaper = this._liftPhase === 'lifted';

    if (this._revealBtn) {
      this._revealBtn.style.opacity = showReveal ? '1' : '0';
      this._revealBtn.style.pointerEvents = showReveal ? 'auto' : 'none';
    }
    if (this._repaperBtn) {
      this._repaperBtn.style.opacity = showRepaper ? '1' : '0';
      this._repaperBtn.style.pointerEvents = showRepaper ? 'auto' : 'none';
    }
    if (this._progressEl) {
      this._progressEl.style.transition = 'opacity 0.4s ease';
      this._progressEl.style.opacity = this._liftPhase === 'lifted' ? '0' : '1';
    }
  }

  _resetLiftState() {
    this._liftPhase = 'rubbing';
    this._liftT = 0;
    this._liftAnimStart = 0;
    this._drawing = false;
    this._updateTopHint();
    this._updateActionButtons();
  }

  _startLift() {
    if (this._liftPhase !== 'rubbing' || this._progress < LIFT_THRESHOLD) return;
    this._forceCompose();
    this._dirty = false;
    this._drawing = false;
    this._liftPhase = 'lifting';
    this._liftAnimStart = performance.now();
    this._liftT = 0;
    this._updateActionButtons();
  }

  _repaper() {
    this._clearMask();
    this._resetLiftState();
    this._dirty = true;
  }

  _updateLiftAnim() {
    if (this._liftPhase !== 'lifting') return;
    const raw = Math.min(1, (performance.now() - this._liftAnimStart) / LIFT_DURATION_MS);
    this._liftT = 1 - Math.pow(1 - raw, 3);
    if (raw >= 1) {
      this._liftPhase = 'lifted';
      this._liftT = 1;
      this._updateTopHint();
      this._updateActionButtons();
    }
  }

  _forceCompose() {
    if (!this.rubCtx || !this._w || !this._h) return;
    this.rubCtx.clearRect(0, 0, this._w, this._h);
    this.rubCtx.drawImage(this.maskCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-in';
    this.rubCtx.drawImage(this.artCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-over';
    this._dirty = false;
  }

  async _reloadLineart() {
    try {
      await Promise.all([
        this._waitImage(this.dimLayer),
        this._waitImage(this.goldLayer),
      ]);
    } catch {
      /* decode 失败时仍尝试按当前尺寸同步 */
    }

    this._currentLineartSrc = this.goldLayer?.src ?? null;
    this._goldCache = getOrBuildGoldCache(this._currentLineartSrc, this.goldLayer);

    this._syncCanvasSize();
    this._clearMask();
    this._dirty = true;
  }

  _waitImage(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth) return img.decode?.() ?? Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        img.removeEventListener('load', done);
        img.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        img.removeEventListener('load', done);
        img.removeEventListener('error', fail);
        reject(new Error('lineart load failed'));
      };
      img.addEventListener('load', done);
      img.addEventListener('error', fail);
    });
  }

  _syncCanvasSize() {
    const w = this.dimLayer?.offsetWidth || this.dimLayer?.clientWidth || 0;
    const h = this.dimLayer?.offsetHeight || this.dimLayer?.clientHeight || 0;
    if (!w || !h) return;

    this._w = w;
    this._h = h;
    this._statW = STAT_W;
    this._statH = Math.max(1, Math.round(STAT_W * h / w));

    for (const cv of [this.maskCv, this.rubCv, this.artCv, this.rubCanvasEl]) {
      if (!cv) continue;
      cv.width = w;
      cv.height = h;
    }
    if (this.statsCv) {
      this.statsCv.width = this._statW;
      this.statsCv.height = this._statH;
    }

    this._paintArtLayer();
    this._dirty = true;
  }

  _paintArtLayer() {
    if (!this.artCtx || !this._goldCache || !this._w || !this._h) return;
    this.artCtx.clearRect(0, 0, this._w, this._h);
    this.artCtx.drawImage(this._goldCache, 0, 0, this._w, this._h);
  }

  _clearMask() {
    if (this.maskCtx && this._w && this._h) {
      this.maskCtx.clearRect(0, 0, this._w, this._h);
    }
    if (this.statsCtx && this._statW && this._statH) {
      this.statsCtx.clearRect(0, 0, this._statW, this._statH);
    }
    this._progress = 0;
    this._updateProgressUI();
    this._dirty = true;
  }

  /* ---------- 捶拓核心 ---------- */

  _tapFromClient(clientX, clientY) {
    const local = this._clientToGoldLocal(clientX, clientY);
    if (!local) return;
    this._tap(local.x, local.y);
  }

  _clientToGoldLocal(clientX, clientY) {
    const rect = this.dimLayer?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _tap(x, y) {
    if (this._liftPhase !== 'rubbing' || !this.maskCtx || !this._w || !this._h) return;

    const R = 30;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.62) * R;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      const fade = 1 - d / R;
      this.maskCtx.globalCompositeOperation = 'lighter';
      this.maskCtx.fillStyle = `rgba(255,255,255,${(0.16 * fade).toFixed(3)})`;
      this.maskCtx.beginPath();
      this.maskCtx.arc(px, py, Math.random() * 3.4 + 1.4, 0, Math.PI * 2);
      this.maskCtx.fill();
    }
    this.maskCtx.globalCompositeOperation = 'source-over';

    this._tapStats(x, y);
    this._dirty = true;
  }

  _tapStats(x, y) {
    if (!this.statsCtx || !this._statW || !this._statH) return;

    const scaleX = this._statW / this._w;
    const scaleY = this._statH / this._h;
    const sx = x * scaleX;
    const sy = y * scaleY;
    const R = 30 * scaleX;

    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.62) * R;
      const px = sx + Math.cos(a) * d;
      const py = sy + Math.sin(a) * d;
      const fade = 1 - d / R;
      this.statsCtx.globalCompositeOperation = 'lighter';
      this.statsCtx.fillStyle = `rgba(255,255,255,${(0.16 * fade).toFixed(3)})`;
      this.statsCtx.beginPath();
      this.statsCtx.arc(px, py, (Math.random() * 3.4 + 1.4) * scaleX, 0, Math.PI * 2);
      this.statsCtx.fill();
    }
    this.statsCtx.globalCompositeOperation = 'source-over';
  }

  _compose() {
    if (this._liftPhase !== 'rubbing') return;
    if (!this._dirty || !this.rubCtx || !this._w || !this._h) return;
    this._dirty = false;

    this.rubCtx.clearRect(0, 0, this._w, this._h);
    this.rubCtx.drawImage(this.maskCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-in';
    this.rubCtx.drawImage(this.artCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-over';
  }

  _renderRubbing(ctx) {
    if (this.dimLayer?.complete && this.dimLayer.naturalWidth) {
      ctx.filter = 'brightness(0.3)';
      ctx.drawImage(this.dimLayer, 0, 0, this._w, this._h);
      ctx.filter = 'none';
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.rubCv, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  _renderLift(ctx, liftT) {
    if (liftT < 1 && this.dimLayer?.complete && this.dimLayer.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 1 - liftT;
      ctx.filter = 'brightness(0.3)';
      ctx.drawImage(this.dimLayer, 0, 0, this._w, this._h);
      ctx.filter = 'none';
      ctx.restore();
    }

    if (liftT > 0) {
      const inset = 18 * (1 - liftT);
      ctx.save();
      ctx.globalAlpha = liftT;
      ctx.fillStyle = RICE_PAPER;
      ctx.fillRect(inset, inset, this._w - inset * 2, this._h - inset * 2);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(0, -liftT * 26);

    if (liftT < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - liftT;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.rubCv, 0, 0);
      ctx.restore();
    }

    ctx.globalAlpha = liftT;
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'invert(1) sepia(.5) saturate(2)';
    ctx.drawImage(this.rubCv, 0, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _render() {
    if (!this.displayCtx || !this._w || !this._h) return;

    this._updateLiftAnim();
    this._compose();

    const ctx = this.displayCtx;
    ctx.clearRect(0, 0, this._w, this._h);

    if (this._liftPhase === 'rubbing' && this._liftT === 0) {
      this._renderRubbing(ctx);
      return;
    }

    const liftT = this._liftPhase === 'lifted' ? 1 : this._liftT;
    this._renderLift(ctx, liftT);
  }

  _computeProgress() {
    if (this._liftPhase !== 'rubbing') return;
    if (!this.statsCtx || !this._statW || !this._statH) return;

    const data = this.statsCtx.getImageData(0, 0, this._statW, this._statH).data;
    let sampled = 0;
    let hit = 0;

    for (let y = 0; y < this._statH; y += 4) {
      for (let x = 0; x < this._statW; x += 4) {
        const alpha = data[(y * this._statW + x) * 4 + 3];
        sampled++;
        if (alpha > 50) hit++;
      }
    }

    this._progress = sampled ? (hit / sampled) * 100 : 0;
    this._updateProgressUI();
  }

  _startLoop() {
    if (this._raf) return;
    const tick = () => {
      if (!this.active) {
        this._raf = null;
        return;
      }
      this._render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }
}

/** 供 PatternSection 预载后预热染金缓存 */
export function warmGoldLineartCache(src, img) {
  return getOrBuildGoldCache(src, img);
}
