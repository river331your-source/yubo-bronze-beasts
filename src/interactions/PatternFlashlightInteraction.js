/**
 * 纹样探秘 · 器物线稿手电筒
 * 双层叠加（暗层 + 染金层）+ CSS mask 遮罩跟随鼠标/触屏/手势
 */
const XIAOZUN_VESSEL_ID = 'fuhao-xiao-zun';
const SHENSHOU_VESSEL_ID = 'shenshou';

const SHENSHOU_ROW_TOPS = [12, 28, 44, 60, 76, 90];
const SHENSHOU_CONTOUR_X = 78;
const SHENSHOU_LABEL_X = 86;

function _shenshouLinePoints(annotation, rowTop) {
  const ax = annotation.ax * 100;
  const ay = annotation.ay * 100;
  if (ax < SHENSHOU_CONTOUR_X) {
    return `${ax},${ay} ${SHENSHOU_CONTOUR_X},${ay} ${SHENSHOU_CONTOUR_X},${rowTop} ${SHENSHOU_LABEL_X},${rowTop}`;
  }
  if (Math.abs(ay - rowTop) < 0.01) {
    return `${ax},${ay} ${SHENSHOU_LABEL_X},${rowTop}`;
  }
  return `${ax},${ay} ${SHENSHOU_LABEL_X},${ay} ${SHENSHOU_LABEL_X},${rowTop}`;
}

const SHENSHOU_ANNOTATIONS = [
  { id: 'longshou', ax: 0.635, ay: 0.26, label: '龙首' },
  { id: 'shidi', ax: 0.62, ay: 0.36, label: '柿蒂形花' },
  { id: 'hushen', ax: 0.60, ay: 0.56, label: '虎身' },
  { id: 'fengniao', ax: 0.70, ay: 0.60, label: '凤鸟纹' },
  { id: 'wowen', ax: 0.71, ay: 0.75, label: '涡纹' },
  { id: 'guizu', ax: 0.66, ay: 0.90, label: '龟足' },
];

const XIAOZUN_HOTSPOTS = [
  // 侧视（左半），标签朝右牵 side:'right'
  { id: 'niao', x: 0.16, y: 0.14, r: 0.055, side: 'right', label: '鸟', text: '商人尊玄鸟为始祖，神鸟立于器首，通天引路。' },
  { id: 'long', x: 0.23, y: 0.23, r: 0.05, side: 'right', label: '龙', text: '夔为独足神龙，盘绕通神，庇佑权柄。' },
  { id: 'lw_s', x: 0.17, y: 0.35, r: 0.06, side: 'right', label: '龙纹', text: '龙行兽身，层叠卷曲，蓄势欲飞。' },
  { id: 'panshe', x: 0.12, y: 0.5, r: 0.065, side: 'right', label: '盘蛇纹', text: '蛇蟠成盘，守护绵延，鸮尊最摄人一笔。' },
  // 正视（右半），标签朝左牵 side:'left'
  { id: 'lw_crown', x: 0.75, y: 0.13, r: 0.08, side: 'left', label: '龙纹', text: '龙行兽身，层叠卷曲，蓄势欲飞。' },
  { id: 'chan_c', x: 0.75, y: 0.3, r: 0.06, side: 'left', label: '蝉纹', text: '蝉饮露而蜕壳重生，寓高洁与再生。' },
  { id: 'chan_b', x: 0.75, y: 0.46, r: 0.06, side: 'left', label: '蝉纹', text: '蝉饮露而蜕壳重生，寓高洁与再生。' },
  { id: 'lw_feet', x: 0.75, y: 0.68, r: 0.07, side: 'left', label: '龙纹', text: '龙行兽身，层叠卷曲，蓄势欲飞。' },
];

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
    this._torchVisible = false;
    this._gestureFlashlight = false;
    this._currentVesselId = null;
    this._curHotspot = null;
    this._curShenshouAnnotation = null;
    this._showHotspotDebug = false;
    this._annotationEl = null;
    this._annotationDotEl = null;
    this._annotationLineEl = null;
    this._annotationLabelEl = null;
    this._annotationTagEl = null;
    this._annotationTextEl = null;
    this._hotspotDebugLayerEl = null;
    this._shenshouDebugMarkerEls = new Map();
    this._shenshouDebugExportBtn = null;
    this._shenshouDragState = null;
    this._shenshouAnnotationsEl = null;
    this._shenshouItemEls = [];
    this._shenshouLineEls = [];
    this._shenshouEndpointEls = [];
    this._shenshouLabelEls = [];

    this._onMouseMove = (e) => {
      if (!this.active || this._shenshouDragState) return;
      this._setTorchFromClient(e.clientX, e.clientY);
    };
    this._onTouchMove = (e) => {
      if (!this.active || this._shenshouDragState || e.touches.length === 0) return;
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

    this._createAnnotation();
    this._createShenshouAnnotations();
    this._createHotspotDebugLayer();
  }

  activate() {
    this.active = true;
    const vessel = this.getVessel();
    if (vessel) this.setVessel(vessel);
    this._updateVesselAnnotationMode();
    this._hideTorch();
  }

  deactivate() {
    this.active = false;
    this._gestureFlashlight = false;
    this._hideTorch();
  }

  /**
   * 器物切换：底层与金色层同步换线稿 PNG
   * @param {{ id: string, name: string, lineartSrc: string }} vessel
   */
  setVessel(vessel) {
    if (!vessel?.lineartSrc) return;
    if (this._currentVesselId === vessel.id) return;

    this._currentVesselId = vessel.id;
    const src = vessel.lineartSrc;

    // 器物切换：双层叠加同时更新 src
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

    this._hideTorch();
    this._setCurrentHotspot(null);
    this._setCurrentShenshouAnnotation(null);
    this._updateVesselAnnotationMode();
    // H 调试层失败不得中断器物切换（否则 id 已变、UI 未更新 → 再点早退卡死）
    try {
      this._renderHotspotDebugLayer();
    } catch (err) {
      console.warn('[PatternFlashlight] hotspot debug render failed:', err);
    }
  }

  getCurrentVesselId() {
    return this._currentVesselId;
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
    this._updateHotspotHit(x, y);
  }

  /** 将视口 client 坐标转为 goldLayer 归一化 ax/ay */
  _clientToGoldNorm(clientX, clientY) {
    const rect = this.goldLayer?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      ax: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      ay: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  /** goldLayer 归一化坐标 → 舞台百分比（用于 DOM / SVG 定位） */
  _goldNormToStagePercent(ax, ay) {
    const goldRect = this.goldLayer?.getBoundingClientRect();
    const stageRect = this.stageEl?.getBoundingClientRect();
    if (!goldRect || !stageRect || !goldRect.width || !stageRect.width) {
      return { x: ax * 100, y: ay * 100 };
    }
    const absX = goldRect.left + ax * goldRect.width;
    const absY = goldRect.top + ay * goldRect.height;
    return {
      x: ((absX - stageRect.left) / stageRect.width) * 100,
      y: ((absY - stageRect.top) / stageRect.height) * 100,
    };
  }

  _formatShenshouDebugLabel(annotation) {
    return `${annotation.id}  ax:${annotation.ax.toFixed(3)} ay:${annotation.ay.toFixed(3)}`;
  }

  _updateShenshouAnchorVisual(annotationId) {
    const index = SHENSHOU_ANNOTATIONS.findIndex((item) => item.id === annotationId);
    if (index < 0) return;

    const annotation = SHENSHOU_ANNOTATIONS[index];
    const rowTop = SHENSHOU_ROW_TOPS[index];
    const stagePos = this._goldNormToStagePercent(annotation.ax, annotation.ay);
    const stageAnnotation = {
      ax: stagePos.x / 100,
      ay: stagePos.y / 100,
    };

    const endpoint = this._shenshouEndpointEls.find((item) => item.id === annotationId);
    if (endpoint) {
      endpoint.el.style.left = `${stagePos.x}%`;
      endpoint.el.style.top = `${stagePos.y}%`;
    }

    const line = this._shenshouLineEls.find((item) => item.id === annotationId);
    if (line) {
      line.pathEl.setAttribute('points', _shenshouLinePoints(stageAnnotation, rowTop));
    }

    const markerEl = this._shenshouDebugMarkerEls.get(annotationId);
    if (markerEl) {
      markerEl.style.left = `${stagePos.x}%`;
      markerEl.style.top = `${stagePos.y}%`;
      const labelEl = markerEl.querySelector('.pattern-hotspot-debug-marker__label');
      if (labelEl) {
        labelEl.textContent = this._formatShenshouDebugLabel(annotation);
      }
    }
  }

  _applyShenshouDrag(clientX, clientY, annotationId) {
    const norm = this._clientToGoldNorm(clientX, clientY);
    if (!norm) return;

    const annotation = SHENSHOU_ANNOTATIONS.find((item) => item.id === annotationId);
    if (!annotation) return;

    annotation.ax = norm.ax;
    annotation.ay = norm.ay;
    this._updateShenshouAnchorVisual(annotationId);
  }

  _onShenshouMarkerPointerDown = (e) => {
    if (!this._showHotspotDebug || this._currentVesselId !== SHENSHOU_VESSEL_ID) return;

    const markerEl = e.currentTarget;
    const annotationId = markerEl.dataset.id;
    if (!annotationId) return;

    e.preventDefault();
    e.stopPropagation();
    markerEl.setPointerCapture(e.pointerId);
    this._shenshouDragState = { id: annotationId, pointerId: e.pointerId };
    markerEl.classList.add('dragging');
  };

  _onShenshouMarkerPointerMove = (e) => {
    if (!this._shenshouDragState || e.pointerId !== this._shenshouDragState.pointerId) return;
    if (e.currentTarget.dataset.id !== this._shenshouDragState.id) return;

    e.preventDefault();
    e.stopPropagation();
    this._applyShenshouDrag(e.clientX, e.clientY, this._shenshouDragState.id);
  };

  _onShenshouMarkerPointerUp = (e) => {
    if (!this._shenshouDragState || e.pointerId !== this._shenshouDragState.pointerId) return;

    const markerEl = e.currentTarget;
    try {
      if (markerEl.hasPointerCapture?.(e.pointerId)) {
        markerEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* 捕获已失效时 releasePointerCapture 会抛 InvalidStateError */
    }
    markerEl.classList.remove('dragging');
    this._shenshouDragState = null;
  };

  _teardownShenshouDebugDrag() {
    this._shenshouDragState = null;
    this._shenshouDebugMarkerEls?.clear?.();
    this._shenshouDebugExportBtn = null;
    this._hotspotDebugLayerEl?.classList.remove('pattern-hotspot-debug-overlay--shenshou');
  }

  _renderShenshouDebugLayer(annotations) {
    if (!this._hotspotDebugLayerEl) return;

    this._shenshouDebugMarkerEls.clear();

    for (const annotation of annotations) {
      const stagePos = this._goldNormToStagePercent(annotation.ax, annotation.ay);
      const markerEl = document.createElement('div');
      markerEl.className = 'pattern-hotspot-debug-marker pattern-hotspot-debug-marker--draggable';
      markerEl.dataset.id = annotation.id;
      markerEl.style.left = `${stagePos.x}%`;
      markerEl.style.top = `${stagePos.y}%`;
      markerEl.style.width = `${0.09 * 200}%`;
      markerEl.style.height = `${0.09 * 200}%`;

      const nameEl = document.createElement('span');
      nameEl.className = 'pattern-hotspot-debug-marker__label';
      nameEl.textContent = this._formatShenshouDebugLabel(annotation);

      markerEl.appendChild(nameEl);
      markerEl.addEventListener('pointerdown', this._onShenshouMarkerPointerDown);
      markerEl.addEventListener('pointermove', this._onShenshouMarkerPointerMove);
      markerEl.addEventListener('pointerup', this._onShenshouMarkerPointerUp);
      markerEl.addEventListener('pointercancel', this._onShenshouMarkerPointerUp);

      this._hotspotDebugLayerEl.appendChild(markerEl);
      this._shenshouDebugMarkerEls.set(annotation.id, markerEl);
    }

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'pattern-hotspot-debug-export-btn';
    exportBtn.textContent = 'P 导出坐标';
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exportShenshouAnnotations();
    });
    this._hotspotDebugLayerEl.appendChild(exportBtn);
    this._shenshouDebugExportBtn = exportBtn;
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
    if (this._currentVesselId === XIAOZUN_VESSEL_ID) {
      this._setCurrentHotspot(null);
    } else if (this._currentVesselId === SHENSHOU_VESSEL_ID) {
      this._setCurrentShenshouAnnotation(null);
    }
  }

  toggleHotspotDebug() {
    this._showHotspotDebug = !this._showHotspotDebug;
    if (!this._showHotspotDebug) {
      this._teardownShenshouDebugDrag();
    }
    this._renderHotspotDebugLayer();
    return this._showHotspotDebug;
  }

  /** 神兽 H 调试：导出当前六个锚点坐标到 console（按 P 或点按钮） */
  exportShenshouAnnotations() {
    if (!this._showHotspotDebug || this._currentVesselId !== SHENSHOU_VESSEL_ID) return;

    const lines = SHENSHOU_ANNOTATIONS.map(
      (annotation) =>
        `  { id: '${annotation.id}', ax: ${annotation.ax.toFixed(3)}, ay: ${annotation.ay.toFixed(3)}, label: '${annotation.label}' },`,
    );
    const output = `const SHENSHOU_ANNOTATIONS = [\n${lines.join('\n')}\n];`;
    console.log('%c[神兽锚点导出]', 'color:#E8CB6A;font-weight:bold', '\n' + output);
  }

  _getActiveHotspots() {
    if (this._currentVesselId !== XIAOZUN_VESSEL_ID) return [];
    return XIAOZUN_HOTSPOTS;
  }

  _getShenshouAnnotations() {
    if (this._currentVesselId !== SHENSHOU_VESSEL_ID) return [];
    return SHENSHOU_ANNOTATIONS;
  }

  _updateHotspotHit(x, y) {
    if (!this.goldLayer) return;

    const W = this.goldLayer.offsetWidth || this.goldLayer.clientWidth;
    const H = this.goldLayer.offsetHeight || this.goldLayer.clientHeight;
    if (!W || !H) {
      this._setCurrentHotspot(null);
      this._setCurrentShenshouAnnotation(null);
      return;
    }

    if (this._currentVesselId === XIAOZUN_VESSEL_ID) {
      this._updateXiaozunHit(x, y, W, H);
    } else if (this._currentVesselId === SHENSHOU_VESSEL_ID) {
      this._updateShenshouHit(x, y, W, H);
    } else {
      this._setCurrentHotspot(null);
      this._setCurrentShenshouAnnotation(null);
    }
  }

  _updateXiaozunHit(x, y, W, H) {
    let hitHotspot = null;
    for (const hotspot of XIAOZUN_HOTSPOTS) {
      const hx = hotspot.x * W;
      const hy = hotspot.y * H;
      const hr = hotspot.r * W;
      if (Math.hypot(x - hx, y - hy) < hr) {
        hitHotspot = hotspot;
        break;
      }
    }
    this._setCurrentHotspot(hitHotspot);
  }

  _updateShenshouHit(x, y, W, H) {
    const threshold = 0.09 * W;
    let hitAnnotation = null;
    let closestDist = Infinity;

    for (const annotation of SHENSHOU_ANNOTATIONS) {
      const hx = annotation.ax * W;
      const hy = annotation.ay * H;
      const dist = Math.hypot(x - hx, y - hy);
      if (dist < threshold && dist < closestDist) {
        closestDist = dist;
        hitAnnotation = annotation;
      }
    }
    this._setCurrentShenshouAnnotation(hitAnnotation);
  }

  _setCurrentHotspot(hotspot) {
    if (this._curHotspot?.id === hotspot?.id) return;
    this._curHotspot = hotspot ?? null;
    this._updateAnnotation();
  }

  _setCurrentShenshouAnnotation(annotation) {
    if (this._curShenshouAnnotation?.id === annotation?.id) return;
    this._curShenshouAnnotation = annotation ?? null;
    this._updateShenshouAnnotationHighlight();
  }

  _updateVesselAnnotationMode() {
    const isXiaozun = this._currentVesselId === XIAOZUN_VESSEL_ID;
    const isShenshou = this._currentVesselId === SHENSHOU_VESSEL_ID;

    if (this._annotationEl) {
      this._annotationEl.hidden = !isXiaozun;
      if (!isXiaozun) this._annotationEl.classList.remove('on');
    }
    if (this._shenshouAnnotationsEl) {
      this._shenshouAnnotationsEl.hidden = !isShenshou;
    }
  }

  _createAnnotation() {
    if (!this.stageEl || this._annotationEl) return;
    const annotationEl = document.createElement('div');
    annotationEl.id = 'pattern-annotation';
    annotationEl.className = 'pattern-annotation';
    annotationEl.hidden = true;

    const dotEl = document.createElement('span');
    dotEl.className = 'anno-dot';
    const lineEl = document.createElement('span');
    lineEl.className = 'anno-line';
    const labelEl = document.createElement('div');
    labelEl.className = 'anno-label';

    const tagEl = document.createElement('p');
    tagEl.className = 'anno-label__tag';
    const textEl = document.createElement('p');
    textEl.className = 'anno-label__text';

    labelEl.appendChild(tagEl);
    labelEl.appendChild(textEl);
    annotationEl.appendChild(dotEl);
    annotationEl.appendChild(lineEl);
    annotationEl.appendChild(labelEl);
    this.stageEl.appendChild(annotationEl);

    this._annotationEl = annotationEl;
    this._annotationDotEl = dotEl;
    this._annotationLineEl = lineEl;
    this._annotationLabelEl = labelEl;
    this._annotationTagEl = tagEl;
    this._annotationTextEl = textEl;
  }

  _updateAnnotation() {
    if (!this._annotationEl || !this._annotationDotEl || !this._annotationLineEl || !this._annotationLabelEl) return;
    if (!this._curHotspot) {
      this._annotationEl.classList.remove('on');
      return;
    }

    const hotspot = this._curHotspot;
    this._annotationEl.classList.toggle('is-left', hotspot.side === 'left');
    this._annotationEl.classList.toggle('is-right', hotspot.side !== 'left');
    this._annotationEl.style.left = `${hotspot.x * 100}%`;
    this._annotationEl.style.top = `${hotspot.y * 100}%`;
    this._annotationTagEl.textContent = `【${hotspot.label}】`;
    this._annotationTextEl.textContent = hotspot.text ?? '';

    // 先移除后重加，保证切换热区时始终有“引线画出”效果
    this._annotationEl.classList.remove('on');
    window.requestAnimationFrame(() => {
      if (this._curHotspot?.id !== hotspot.id || !this._annotationEl) return;
      this._annotationEl.classList.add('on');
    });
  }

  _createShenshouAnnotations() {
    if (!this.stageEl || this._shenshouAnnotationsEl) return;

    const containerEl = document.createElement('div');
    containerEl.id = 'shenshou-annotations';
    containerEl.className = 'shenshou-annotations';
    containerEl.hidden = true;

    SHENSHOU_ANNOTATIONS.forEach((annotation, index) => {
      const rowTop = SHENSHOU_ROW_TOPS[index];
      const anchorX = annotation.ax * 100;
      const anchorY = annotation.ay * 100;

      const itemEl = document.createElement('div');
      itemEl.className = 'shenshou-anno-item';
      itemEl.dataset.id = annotation.id;

      const endpointEl = document.createElement('span');
      endpointEl.className = 'anno-endpoint';
      endpointEl.dataset.id = annotation.id;
      endpointEl.style.left = `${anchorX}%`;
      endpointEl.style.top = `${anchorY}%`;
      itemEl.appendChild(endpointEl);
      this._shenshouEndpointEls.push({ id: annotation.id, el: endpointEl });

      const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      lineEl.classList.add('anno-line');
      lineEl.dataset.id = annotation.id;
      lineEl.setAttribute('viewBox', '0 0 100 100');
      lineEl.setAttribute('preserveAspectRatio', 'none');
      lineEl.setAttribute('aria-hidden', 'true');

      const polylineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polylineEl.setAttribute('fill', 'none');
      polylineEl.setAttribute('points', _shenshouLinePoints(annotation, rowTop));
      lineEl.appendChild(polylineEl);
      itemEl.appendChild(lineEl);
      this._shenshouLineEls.push({ id: annotation.id, el: lineEl, pathEl: polylineEl });

      const labelEl = document.createElement('div');
      labelEl.className = 'anno-label';
      labelEl.dataset.id = annotation.id;
      labelEl.style.left = `${SHENSHOU_LABEL_X}%`;
      labelEl.style.top = `${rowTop}%`;
      labelEl.textContent = `【${annotation.label}】`;
      itemEl.appendChild(labelEl);
      this._shenshouLabelEls.push({ id: annotation.id, el: labelEl });

      containerEl.appendChild(itemEl);
      this._shenshouItemEls.push({ id: annotation.id, el: itemEl });
    });

    this.stageEl.appendChild(containerEl);
    this._shenshouAnnotationsEl = containerEl;
  }

  _updateShenshouAnnotationHighlight() {
    const activeId = this._curShenshouAnnotation?.id ?? null;

    for (const { id, el } of this._shenshouItemEls) {
      el.classList.toggle('active', id === activeId);
    }
    for (const { id, el } of this._shenshouLabelEls) {
      el.classList.toggle('active', id === activeId);
    }
    for (const { id, el } of this._shenshouLineEls) {
      el.classList.toggle('active', id === activeId);
    }
    for (const { id, el } of this._shenshouEndpointEls) {
      el.classList.toggle('active', id === activeId);
    }
  }

  _createHotspotDebugLayer() {
    if (!this.stageEl || this._hotspotDebugLayerEl) return;
    const layerEl = document.createElement('div');
    layerEl.id = 'pattern-hotspot-debug-overlay';
    layerEl.className = 'pattern-hotspot-debug-overlay';
    layerEl.hidden = true;
    this.stageEl.appendChild(layerEl);
    this._hotspotDebugLayerEl = layerEl;
  }

  _renderHotspotDebugLayer() {
    if (!this._hotspotDebugLayerEl) return;
    if (!(this._shenshouDebugMarkerEls instanceof Map)) {
      this._shenshouDebugMarkerEls = new Map();
    }

    this._teardownShenshouDebugDrag();
    this._hotspotDebugLayerEl.innerHTML = '';

    const isShenshou = this._currentVesselId === SHENSHOU_VESSEL_ID;
    const shenshouAnnotations = this._getShenshouAnnotations();
    const xiaozunHotspots = this._getActiveHotspots();

    if (isShenshou) {
      const shouldShow = this._showHotspotDebug && shenshouAnnotations.length > 0;
      this._hotspotDebugLayerEl.hidden = !shouldShow;
      if (!shouldShow) return;

      this._hotspotDebugLayerEl.classList.add('pattern-hotspot-debug-overlay--shenshou');
      this._renderShenshouDebugLayer(shenshouAnnotations);
      return;
    }

    this._hotspotDebugLayerEl.classList.remove('pattern-hotspot-debug-overlay--shenshou');

    const debugMarkers = xiaozunHotspots.map((hotspot) => ({
      id: hotspot.id,
      x: hotspot.x,
      y: hotspot.y,
      r: hotspot.r,
    }));

    const shouldShow = this._showHotspotDebug && debugMarkers.length > 0;
    this._hotspotDebugLayerEl.hidden = !shouldShow;
    if (!shouldShow) return;

    for (const marker of debugMarkers) {
      const markerEl = document.createElement('div');
      markerEl.className = 'pattern-hotspot-debug-marker';
      markerEl.style.left = `${marker.x * 100}%`;
      markerEl.style.top = `${marker.y * 100}%`;
      markerEl.style.width = `${marker.r * 200}%`;
      markerEl.style.height = `${marker.r * 200}%`;

      const nameEl = document.createElement('span');
      nameEl.className = 'pattern-hotspot-debug-marker__label';
      nameEl.textContent = marker.id;

      markerEl.appendChild(nameEl);
      this._hotspotDebugLayerEl.appendChild(markerEl);
    }
  }

  dispose() {
    this.deactivate();
    this._teardownShenshouDebugDrag();
    this.stageEl.removeEventListener('mousemove', this._onMouseMove);
    this.stageEl.removeEventListener('touchmove', this._onTouchMove);
    this.stageEl.removeEventListener('mouseleave', this._onPointerLeave);
    this.stageEl.removeEventListener('touchend', this._onPointerLeave);
    this.stageEl.removeEventListener('touchcancel', this._onPointerLeave);

    this._annotationEl?.remove();
    this._annotationEl = null;
    this._annotationDotEl = null;
    this._annotationLineEl = null;
    this._annotationLabelEl = null;
    this._annotationTagEl = null;
    this._annotationTextEl = null;

    this._hotspotDebugLayerEl?.remove();
    this._hotspotDebugLayerEl = null;

    this._shenshouAnnotationsEl?.remove();
    this._shenshouAnnotationsEl = null;
    this._shenshouItemEls = [];
    this._shenshouLineEls = [];
    this._shenshouEndpointEls = [];
    this._shenshouLabelEls = [];
  }
}
