/**
 * 纹样探秘 · 数字捶拓
 * 暗底线稿 + 累积遮罩 ∩ 金色线稿（lighter 叠加），照过即留痕
 */
const GOLD_FILTER =
  'sepia(1) saturate(4.8) hue-rotate(6deg) brightness(1.18)';

const STAT_W = 88;
const LIFT_THRESHOLD = 40;
const RICE_PAPER = '#efe6d0';

const VESSEL_COLOPHON = {
  'fuhao-xiao-zun': {
    name: '妇好鸮尊',
    era: '商代晚期',
    site: '安阳殷墟妇好墓出土',
    seal: '妇好鸮尊',
  },
  shenshou: {
    name: '青铜神兽',
    era: '春秋晚期·楚',
    site: '淅川徐家岭九号楚墓出土',
    seal: '青铜神兽',
  },
};

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
    this._setVesselBusy = false;

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
    this._resetBtn = null;
    this._exportBtn = null;
    this._postLiftRow = null;

    this._lifted = false;
    this._liftT = 0;
    this._liftDone = false;
    this.liftCacheCv = null;
    this.liftCacheCtx = null;
    this._liftCacheReady = false;
    this._inkCv = null;
    this._paperCv = null;

    if (this.goldLayer) {
      this.goldLayer.setAttribute('aria-hidden', 'true');
    }

    this._createDisplayCanvas();
    this._createProgressBar();
    this._createTopHint();
    this._createActionButtons();
    this._createOffscreenCanvases();

    this._onPointerDown = (e) => {
      if (!this.active || e.button !== 0 || this._gestureRubbing || this._lifted) return;
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

    this.rubCanvasEl?.addEventListener('pointerdown', this._onPointerDown);
    this.rubCanvasEl?.addEventListener('pointermove', this._onPointerMove);
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
    if (this.stageEl) this.stageEl.style.zIndex = '5';
    const vessel = this.getVessel();
    if (vessel) {
      this.setVessel(vessel).catch((err) => {
        console.error('[PatternFlashlightInteraction] activate setVessel:', err);
      });
    }
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
  async setVessel(vessel) {
    if (!vessel?.lineartSrc) return;
    if (this._currentVesselId === vessel.id) return;
    if (this._setVesselBusy) return;

    const prevId = this._currentVesselId;
    const prevName = this._currentVesselName;
    const prevDimSrc = this.dimLayer?.src ?? null;
    const prevGoldSrc = this.goldLayer?.src ?? null;
    const prevAspect = this.lineartStack?.style?.getPropertyValue('--lineart-aspect')?.trim() ?? '';

    this._setVesselBusy = true;
    try {
      const src = vessel.lineartSrc;

      this._resetVesselSwitchState();

      if (vessel.aspectRatio) {
        this.lineartStack?.style?.setProperty('--lineart-aspect', vessel.aspectRatio);
      }

      if (this.dimLayer) {
        this.dimLayer.src = src;
        this.dimLayer.alt = `${vessel.name}线稿`;
      }
      if (this.goldLayer) {
        this.goldLayer.src = src;
      }

      this.lineartStack?.classList?.add('pattern-lineart-stack--switching');
      window.setTimeout(() => {
        this.lineartStack?.classList?.remove('pattern-lineart-stack--switching');
      }, 220);

      await this._reloadLineart({ strict: true });

      this._currentVesselId = vessel.id;
      this._currentVesselName = vessel.name;
    } catch (err) {
      console.error('[setVessel] 切换失败，回滚:', err);
      this._currentVesselId = prevId;
      this._currentVesselName = prevName;

      if (this.dimLayer && prevDimSrc) {
        this.dimLayer.src = prevDimSrc;
        if (prevName) this.dimLayer.alt = `${prevName}线稿`;
      }
      if (this.goldLayer && prevGoldSrc) {
        this.goldLayer.src = prevGoldSrc;
      }
      if (prevAspect) {
        this.lineartStack?.style?.setProperty('--lineart-aspect', prevAspect);
      }

      try {
        await this._reloadLineart({ strict: false });
      } catch {
        /* 回滚线稿失败时仍保证 id 可再次切换 */
      }

      this._updateTopHint?.();
      this._updateActionButtons?.();
      throw err;
    } finally {
      this._setVesselBusy = false;
    }
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
    if (!this.active || this._lifted || !this._gestureRubbing || !gestureController) return;

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
    this._postLiftRow?.remove();
    this._postLiftRow = null;
    this._repaperBtn = null;
    this._exportBtn = null;

    this.maskCv = null;
    this.maskCtx = null;
    this.rubCv = null;
    this.rubCtx = null;
    this.artCv = null;
    this.artCtx = null;
    this.statsCv = null;
    this.statsCtx = null;
    this._goldCache = null;
    this.liftCacheCv = null;
    this.liftCacheCtx = null;
    this._liftCacheReady = false;
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
      zIndex: '20',
      padding: '8px 22px',
      borderRadius: '999px',
      border: '1px solid rgba(201, 168, 76, 0.5)',
      background: 'rgba(8, 10, 8, 0.85)',
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

    this._postLiftRow = document.createElement('div');
    Object.assign(this._postLiftRow.style, {
      position: 'absolute',
      left: '50%',
      bottom: '11%',
      transform: 'translateX(-50%)',
      zIndex: '20',
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 0.4s ease',
    });

    const rowBtn = {
      padding: baseBtn.padding,
      borderRadius: baseBtn.borderRadius,
      border: baseBtn.border,
      background: baseBtn.background,
      color: baseBtn.color,
      fontSize: baseBtn.fontSize,
      letterSpacing: baseBtn.letterSpacing,
      cursor: baseBtn.cursor,
      boxShadow: baseBtn.boxShadow,
      transition: baseBtn.transition,
      position: 'relative',
      left: 'auto',
      bottom: 'auto',
      transform: 'none',
      zIndex: '20',
      opacity: '1',
      pointerEvents: 'auto',
    };

    this._repaperBtn = document.createElement('button');
    this._repaperBtn.type = 'button';
    this._repaperBtn.className = 'pattern-rub-repaper-btn';
    this._repaperBtn.textContent = '重新铺纸';
    Object.assign(this._repaperBtn.style, rowBtn, { letterSpacing: '0.22em' });
    this._repaperBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._repaper();
    });
    this._resetBtn = this._repaperBtn;

    this._exportBtn = document.createElement('button');
    this._exportBtn.type = 'button';
    this._exportBtn.className = 'pattern-rub-export-btn';
    this._exportBtn.textContent = '带 走 拓 片';
    Object.assign(this._exportBtn.style, rowBtn);
    this._exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._exportRubbing();
    });

    this._postLiftRow.appendChild(this._repaperBtn);
    this._postLiftRow.appendChild(this._exportBtn);

    this.stageEl.appendChild(this._revealBtn);
    this.stageEl.appendChild(this._postLiftRow);
    this._updateActionButtons();
    this._updateTopHint();
  }

  _updateTopHint() {
    if (!this._topHintEl) return;
    if (this._lifted && this._liftT >= 1) {
      this._topHintEl.textContent = `拓 片 已 成 · ${this._currentVesselName || ''}`;
      this._topHintEl.style.opacity = '1';
      if (this._h && this.stageEl) {
        const stageH = this.stageEl.clientHeight || this._h;
        const stackTop = (stageH - this._h) / 2;
        this._topHintEl.style.top = `${Math.max(0, stackTop + this._h * 0.06)}px`;
      }
    } else {
      this._topHintEl.textContent = '';
      this._topHintEl.style.opacity = '0';
      this._topHintEl.style.top = '9%';
    }
  }

  _updateActionButtons() {
    console.log(
      '[按钮] _lifted=',
      this._lifted,
      '_liftT=',
      this._liftT,
      '_progress=',
      this._progress,
      'revealBtn=',
      this._revealBtn,
      'exportBtn=',
      this._exportBtn,
      'resetBtn=',
      this._resetBtn
    );

    const showReveal = !this._lifted && this._progress >= LIFT_THRESHOLD;
    const showPostLift = this._lifted && this._liftT >= 1;

    if (this._revealBtn) {
      this._revealBtn.style.opacity = showReveal ? '1' : '0';
      this._revealBtn.style.pointerEvents = showReveal ? 'auto' : 'none';
    }
    if (this._postLiftRow) {
      this._postLiftRow.style.opacity = showPostLift ? '1' : '0';
      this._postLiftRow.style.pointerEvents = showPostLift ? 'auto' : 'none';
    }
    if (this._repaperBtn) {
      this._repaperBtn.style.opacity = showPostLift ? '1' : '0';
      this._repaperBtn.style.pointerEvents = showPostLift ? 'auto' : 'none';
    }
    if (this._exportBtn) {
      this._exportBtn.style.opacity = showPostLift ? '1' : '0';
      this._exportBtn.style.pointerEvents = showPostLift ? 'auto' : 'none';
    }
    if (this._progressEl) {
      this._progressEl.style.transition = 'opacity 0.4s ease';
      this._progressEl.style.opacity = showPostLift ? '0' : '1';
    }
  }

  _markLiftComplete() {
    if (this._liftDone) return;
    this._liftDone = true;
    this._updateTopHint();
    this._updateActionButtons();
  }

  _exportRubbing() {
    console.log('[导出] 触发, _inkCv=', this._inkCv);
    if (!this._inkCv) {
      console.warn('[导出] _inkCv为空');
      return;
    }

    const W2 = this._w * 2;
    const H2 = this._h * 2;
    const ex = document.createElement('canvas');
    ex.width = W2;
    ex.height = H2;
    const c = ex.getContext('2d');

    c.fillStyle = '#efe6d0';
    this._ensurePaperCv();
    if (this._paperCv) {
      c.drawImage(this._paperCv, 0, 0, W2, H2);
    } else {
      c.fillRect(0, 0, W2, H2);
    }
    this._drawLiftInk(c, this._inkCv, W2, H2);
    this._drawColophon(c, W2, H2, 1);
    this._drawSeal(c, W2, H2, 1);

    const name = this._currentVesselId === 'shenshou' ? '青铜神兽' : '妇好鸮尊';
    c.fillStyle = 'rgba(43,35,24,0.7)';
    c.textAlign = 'right';
    c.font = `${Math.round(W2 * 0.016)}px "Noto Serif CJK SC", serif`;
    c.fillText(`豫博青铜神兽录 · ${name} 拓片`, W2 * 0.95, H2 * 0.94);
    c.font = `${Math.round(W2 * 0.011)}px "Noto Serif CJK SC", serif`;
    c.fillText(`拓于 ${new Date().toLocaleDateString('zh-CN')}`, W2 * 0.95, H2 * 0.965);

    ex.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `豫博青铜神兽录_${name}拓片.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  _invalidateLiftCache() {
    this._liftCacheReady = false;
    this._inkCv = null;
    this._paperCv = null;
  }

  _resetLiftState() {
    this._lifted = false;
    this._liftT = 0;
    this._liftDone = false;
    this._drawing = false;
    this._invalidateLiftCache();
    this._updateTopHint();
    this._updateActionButtons();
  }

  /** 器物切换：重置揭纸/进度/缓存与按钮，避免半态卡死 */
  _resetVesselSwitchState() {
    this._lifted = false;
    this._liftT = 0;
    this._liftDone = false;
    this._drawing = false;
    this._inkCv = null;
    this._paperCv = null;
    this._liftCacheReady = false;
    this.liftCacheCv = null;
    this.liftCacheCtx = null;
    this._progress = 0;

    this._revealBtn?.classList?.remove('on');
    this._resetBtn?.classList?.remove('on');
    this._exportBtn?.classList?.remove('on');

    this._updateProgressUI?.();
    this._updateTopHint?.();
    this._updateActionButtons?.();
    this._dirty = true;
  }

  _startLift() {
    console.log('[揭纸] 点击了', '_lifted=', this._lifted, '_progress=', this._progress, 'LIFT_THRESHOLD=', LIFT_THRESHOLD);
    console.log('[揭纸] rubCv有内容吗？', this.rubCv?.width, this.rubCv?.height, '_progress=', this._progress);
    if (this._lifted) return;
    if (!this._w || !this._h) this._syncCanvasSize();
    this._forceCompose();
    this._ensureInkCv();
    this._dirty = false;
    this._drawing = false;
    this._lifted = true;
    this._liftT = 0;
    this._liftDone = false;
    this._liftCacheReady = false;
    this._updateActionButtons();
  }

  _repaper() {
    this._clearMask();
    this._lifted = false;
    this._liftT = 0;
    this._liftDone = false;
    this._invalidateLiftCache();
    this._updateTopHint();
    this._updateActionButtons();
    this._dirty = true;
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

  async _reloadLineart({ strict = false } = {}) {
    try {
      await Promise.all([
        this._waitImage(this.dimLayer),
        this._waitImage(this.goldLayer),
      ]);
    } catch (err) {
      if (strict) throw err;
    }

    this._currentLineartSrc = this.goldLayer?.src ?? null;
    this._goldCache = getOrBuildGoldCache(this._currentLineartSrc, this.goldLayer);
    if (strict && !this._goldCache) {
      console.error('[PatternFlashlightInteraction] 线稿加载失败:', {
        src: this._currentLineartSrc,
        dimNatural: [this.dimLayer?.naturalWidth ?? 0, this.dimLayer?.naturalHeight ?? 0],
        goldNatural: [this.goldLayer?.naturalWidth ?? 0, this.goldLayer?.naturalHeight ?? 0],
      });
      throw new Error('gold lineart cache build failed');
    }

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
    this._invalidateLiftCache();
    this._dirty = true;
  }

  /** 公共布局同步：可见后主动调用，隐藏态初始化导致 0×0 时自愈 */
  syncLayout() {
    if (!this.active) return false;
    if (!this.rubCanvasEl) this._createDisplayCanvas();
    this._syncCanvasSize();
    if (!this._w || !this._h) {
      console.warn('[PatternFlashlightInteraction] syncLayout 跳过：版块不可见');
      return false;
    }
    return true;
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
    if (this._lifted || !this.maskCtx || !this._w || !this._h) return;

    const R = 52;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.62) * R;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      const fade = 1 - d / R;
      this.maskCtx.globalCompositeOperation = 'lighter';
      this.maskCtx.fillStyle = `rgba(255,255,255,${(0.38 * fade).toFixed(3)})`;
      this.maskCtx.beginPath();
      this.maskCtx.arc(px, py, Math.random() * 5 + 2, 0, Math.PI * 2);
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
    const R = 52 * scaleX;

    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.62) * R;
      const px = sx + Math.cos(a) * d;
      const py = sy + Math.sin(a) * d;
      const fade = 1 - d / R;
      this.statsCtx.globalCompositeOperation = 'lighter';
      this.statsCtx.fillStyle = `rgba(255,255,255,${(0.38 * fade).toFixed(3)})`;
      this.statsCtx.beginPath();
      this.statsCtx.arc(px, py, (Math.random() * 5 + 2) * scaleX, 0, Math.PI * 2);
      this.statsCtx.fill();
    }
    this.statsCtx.globalCompositeOperation = 'source-over';
  }

  _compose() {
    if (this._lifted || !this._dirty || !this.rubCtx || !this._w || !this._h) return;
    this._dirty = false;

    this.rubCtx.clearRect(0, 0, this._w, this._h);
    this.rubCtx.drawImage(this.maskCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-in';
    this.rubCtx.drawImage(this.artCv, 0, 0);
    this.rubCtx.globalCompositeOperation = 'source-over';
  }

  _easeLift(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  _drawLiftInk(ctx, inkCv, W, H) {
    if (!inkCv) return;
    const padL = W * 0.2;
    const padR = W * 0.04;
    const padT = H * 0.06;
    const padB = H * 0.1;
    const availW = W - padL - padR;
    const availH = H - padT - padB;
    const scale = Math.min(availW / W, availH / H);
    const drawW = W * scale;
    const drawH = H * scale;
    const dx = padL + (availW - drawW) / 2;
    const dy = padT + (availH - drawH) / 2;
    ctx.save();
    ctx.drawImage(inkCv, 0, 0, inkCv.width, inkCv.height, dx, dy, drawW, drawH);
    ctx.restore();
  }

  _drawColophon(ctx, W, H, alpha) {
    const info = VESSEL_COLOPHON[this._currentVesselId];
    if (!info || alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3a3025';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const lines = [
      { text: info.name, size: Math.round(H * 0.036), gap: 1.15 },
      { text: info.era, size: Math.round(H * 0.024), gap: 1.2 },
      { text: info.site, size: Math.round(H * 0.02), gap: 1.2 },
      { text: '丙午年七月 拓于豫博数字展厅', size: Math.round(H * 0.017), gap: 1.25 },
    ];

    const cols = lines.length;
    const colGap = H * 0.042;
    const leftEdge = W * 0.025;

    lines.forEach((ln, i) => {
      const cx = leftEdge + (cols - 1 - i) * colGap;
      ctx.font = `${ln.size}px "Noto Serif CJK SC", "STSong", serif`;
      let cy = H * 0.13;
      for (const ch of ln.text) {
        ctx.fillText(ch, cx, cy);
        cy += ln.size * ln.gap;
      }
    });
    ctx.restore();
  }

  _drawSeal(ctx, W, H, alpha) {
    const info = VESSEL_COLOPHON[this._currentVesselId];
    if (!info || alpha <= 0) return;

    const s = Math.round(H * 0.075);
    const px = W * 0.055 - s / 2;
    const py = H * 0.62;

    ctx.save();
    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = '#9b2d20';
    ctx.fillRect(px, py, s, s);

    ctx.fillStyle = '#efe6d0';
    ctx.font = `bold ${Math.round(s * 0.36)}px "Noto Serif CJK SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = info.seal.slice(0, 4);
    const order = [
      [0.72, 0.28],
      [0.72, 0.72],
      [0.28, 0.28],
      [0.28, 0.72],
    ];
    chars.split('').forEach((c, i) => {
      if (i < 4) ctx.fillText(c, px + s * order[i][0], py + s * order[i][1]);
    });

    ctx.strokeStyle = '#9b2d20';
    ctx.lineWidth = s * 0.05;
    ctx.strokeRect(px + s * 0.03, py + s * 0.03, s * 0.94, s * 0.94);
    ctx.restore();
  }

  /** 揭纸用：宣纸肌理（纤维噪点 + 横纹，一次生成缓存） */
  _ensurePaperCv() {
    const W = this._w;
    const H = this._h;
    if (!W || !H) return;

    if (this._paperCv && (this._paperCv.width !== W || this._paperCv.height !== H)) {
      this._paperCv = null;
    }

    if (!this._paperCv) {
      const p = document.createElement('canvas');
      p.width = W;
      p.height = H;
      const pc = p.getContext('2d');
      pc.fillStyle = '#efe6d0';
      pc.fillRect(0, 0, W, H);

      const img = pc.getImageData(0, 0, W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 16;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n * 0.7;
      }
      pc.putImageData(img, 0, 0);

      pc.strokeStyle = 'rgba(180,165,135,0.10)';
      pc.lineWidth = 1;
      for (let y = 0; y < H; y += 3 + Math.random() * 4) {
        pc.beginPath();
        pc.moveTo(0, y);
        pc.bezierCurveTo(
          W * 0.3,
          y + Math.random() * 2 - 1,
          W * 0.7,
          y + Math.random() * 2 - 1,
          W,
          y
        );
        pc.stroke();
      }

      this._paperCv = p;
    }
  }

  /** 拓片墨边：沿 mask 边界随机啃掉，制造毛糙淡出 */
  _frayInkEdges(ic, W, H) {
    if (!this.maskCtx) return;
    const md = this.maskCtx.getImageData(0, 0, W, H).data;
    ic.globalCompositeOperation = 'destination-out';
    const target = Math.round(W * 0.12 + H * 0.12);
    let placed = 0;
    for (let attempt = 0; placed < target && attempt < target * 30; attempt++) {
      const x = 1 + Math.floor(Math.random() * (W - 2));
      const y = 1 + Math.floor(Math.random() * (H - 2));
      const i = (y * W + x) * 4 + 3;
      if (md[i] < 25) continue;
      const na = md[((y - 1) * W + x) * 4 + 3];
      const nb = md[((y + 1) * W + x) * 4 + 3];
      const nc = md[(y * W + x - 1) * 4 + 3];
      const nd = md[(y * W + x + 1) * 4 + 3];
      if (na >= md[i] * 0.55 && nb >= md[i] * 0.55 && nc >= md[i] * 0.55 && nd >= md[i] * 0.55) {
        continue;
      }
      const r = Math.random() * 5 + 1.5;
      ic.fillStyle = `rgba(0,0,0,${Math.random() * 0.55 + 0.15})`;
      ic.beginPath();
      ic.arc(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, r, 0, Math.PI * 2);
      ic.fill();
      placed++;
    }
    ic.globalCompositeOperation = 'source-over';
  }

  /** 揭纸用：墨底白纹（捶墨处填松烟墨，纹样凹陷处挖空露宣纸） */
  _ensureInkCv() {
    const W = this._w;
    const H = this._h;
    if (!W || !H) return;

    if (this._inkCv && (this._inkCv.width !== W || this._inkCv.height !== H)) {
      this._inkCv = null;
    }

    if (!this._inkCv) {
      this._inkCv = document.createElement('canvas');
      this._inkCv.width = W;
      this._inkCv.height = H;
      const ic = this._inkCv.getContext('2d');

      ic.drawImage(this.maskCv, 0, 0);
      ic.globalCompositeOperation = 'source-in';
      ic.fillStyle = '#2b2318';
      ic.fillRect(0, 0, W, H);

      ic.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < W * H / 1200; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const r = Math.random() * 28 + 8;
        ic.fillStyle = `rgba(74,63,48,${Math.random() * 0.35 + 0.1})`;
        ic.beginPath();
        ic.arc(x, y, r, 0, Math.PI * 2);
        ic.fill();
      }

      ic.globalCompositeOperation = 'destination-out';
      ic.drawImage(this.rubCv, 0, 0);

      ic.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < W * H / 220; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const r = Math.random() * 2.2 + 0.4;
        ic.fillStyle = `rgba(0,0,0,${Math.random() * 0.5 + 0.15})`;
        ic.beginPath();
        ic.arc(x, y, r, 0, Math.PI * 2);
        ic.fill();
      }

      this._frayInkEdges(ic, W, H);
      ic.globalCompositeOperation = 'source-over';

      const test = ic.getImageData(0, 0, Math.min(W, 50), Math.min(H, 50)).data;
      let nonEmpty = 0;
      for (let i = 3; i < test.length; i += 4) if (test[i] > 0) nonEmpty++;
      console.log('[inkCv] 已生成', W, 'x', H, '样本非空像素:', nonEmpty, 'rubCv=', this.rubCv);
    }
  }

  /** 揭纸绘制（liftT 0..1）；动画结束后 bake 到离屏缓存 */
  _drawLiftFrame(ctx, liftT) {
    console.log('[揭纸帧] liftT=', liftT, 'inkCv=', this._inkCv);
    const W = this._w;
    const H = this._h;
    const e = this._easeLift(liftT);

    ctx.clearRect(0, 0, W, H);

    if (liftT < 1 && this.dimLayer?.complete && this.dimLayer.naturalWidth) {
      ctx.globalAlpha = 1 - liftT;
      ctx.drawImage(this.dimLayer, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    if (liftT > 0) {
      ctx.translate(0, -e * 26);
      ctx.globalAlpha = e;
      const pad = e * 20;
      const px = 20 - pad * 0.3;
      const py = 16 - pad * 0.3;
      const pw = W - 40 + pad * 0.6;
      const ph = H - 32 + pad * 0.6;
      this._ensurePaperCv();
      if (this._paperCv) {
        ctx.drawImage(this._paperCv, px, py, pw, ph);
      } else {
        ctx.fillStyle = RICE_PAPER;
        ctx.fillRect(px, py, pw, ph);
      }
      ctx.globalAlpha = 1;

      this._ensureInkCv();
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      this._drawLiftInk(ctx, this._inkCv, W, H);

      if (liftT > 0.6) {
        const ta = Math.min(1, (liftT - 0.6) / 0.4);
        this._drawColophon(ctx, W, H, ta);
        this._drawSeal(ctx, W, H, ta);
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.rubCv, 0, 0);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  _ensureLiftCache() {
    if (!this.liftCacheCv) {
      this.liftCacheCv = document.createElement('canvas');
      this.liftCacheCtx = this.liftCacheCv.getContext('2d');
    }
    if (this.liftCacheCv.width !== this._w || this.liftCacheCv.height !== this._h) {
      this.liftCacheCv.width = this._w;
      this.liftCacheCv.height = this._h;
      this._liftCacheReady = false;
    }
    if (!this._liftCacheReady) {
      this._drawLiftFrame(this.liftCacheCtx, 1);
      this._liftCacheReady = true;
    }
  }

  _renderRubbing(ctx) {
    if (this.dimLayer?.complete && this.dimLayer.naturalWidth) {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(this.dimLayer, 0, 0, this._w, this._h);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(232,203,106,0.9)';
    ctx.shadowBlur = 14;
    ctx.drawImage(this.rubCv, 0, 0);
    ctx.drawImage(this.rubCv, 0, 0);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  }

  _render() {
    if (Math.random() < 0.02) console.log('[render] _lifted=', this._lifted, '_liftT=', this._liftT, '_w=', this._w, '_h=', this._h);
    if (!this.displayCtx || !this._w || !this._h) return;

    const ctx = this.displayCtx;

    if (!this._lifted) {
      this._compose();
      ctx.clearRect(0, 0, this._w, this._h);
      this._renderRubbing(ctx);
      return;
    }

    if (this._liftT < 1) {
      this._liftT = Math.min(1, this._liftT + 0.018);
      ctx.clearRect(0, 0, this._w, this._h);
      this._drawLiftFrame(ctx, this._liftT);
      if (this._liftT >= 1) {
        this._ensureLiftCache();
        this._markLiftComplete();
      }
      return;
    }

    if (!this._liftDone) {
      this._ensureLiftCache();
      this._markLiftComplete();
    }

    this._ensureLiftCache();
    ctx.clearRect(0, 0, this._w, this._h);
    ctx.drawImage(this.liftCacheCv, 0, 0);
  }

  _computeProgress() {
    if (this._lifted || !this.statsCtx || !this._statW || !this._statH) return;

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
