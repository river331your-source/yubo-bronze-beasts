/**
 * 神兽图鉴中央白屏诊断 — 仅 console 输出，不改渲染逻辑
 * 开发模式或 URL ?diag=1 时启用
 */
import * as THREE from 'three';

let _enabled = null;
let _renderCount = 0;
let _lastRenderLog = 0;

function isEnabled() {
  if (_enabled != null) return _enabled;
  const params = new URLSearchParams(location.search);
  _enabled =
    import.meta.env.DEV ||
    params.has('diag') ||
    localStorage.getItem('atlas-diag') === '1';
  return _enabled;
}

function cs(el) {
  return el ? getComputedStyle(el) : null;
}

function elInfo(el, label) {
  if (!el) return { label, exists: false };
  const style = cs(el);
  const rect = el.getBoundingClientRect();
  return {
    label,
    exists: true,
    id: el.id || null,
    className: el.className || '',
    offsetWidth: el.offsetWidth,
    offsetHeight: el.offsetHeight,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    boundingRect: {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    display: style?.display,
    visibility: style?.visibility,
    backgroundColor: style?.backgroundColor,
    parentId: el.parentElement?.id ?? null,
  };
}

function canvasInfo(canvas) {
  if (!canvas) return { exists: false };
  const style = cs(canvas);
  const viewport = canvas.closest('#atlas-viewport');
  const dpr = Math.min(window.devicePixelRatio, 2);
  return {
    exists: true,
    inDom: document.body.contains(canvas),
    parentId: canvas.parentElement?.id ?? null,
    parentIsAtlasViewport: canvas.parentElement?.id === 'atlas-viewport',
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
    cssWidth: style?.width,
    cssHeight: style?.height,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
    offsetWidth: canvas.offsetWidth,
    offsetHeight: canvas.offsetHeight,
    cssBackground: style?.backgroundColor,
    viewportContainsCanvas: viewport?.contains(canvas) ?? false,
    expectedBufferW: Math.floor(canvas.clientWidth * dpr),
    expectedBufferH: Math.floor(canvas.clientHeight * dpr),
  };
}

function cameraModelInfo(sceneManager) {
  if (!sceneManager?.camera) return { camera: null, model: null };

  const cam = sceneManager.camera;
  const model = sceneManager.getCurrentModel();
  const pointCloud = sceneManager.pointCloud;

  let modelBox = null;
  let inFrustum = null;
  if (model) {
    sceneManager.modelContainer.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(sceneManager.modelContainer);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dist = cam.position.distanceTo(sceneManager.controls?.target ?? center);
      modelBox = {
        center: center.toArray().map((v) => +v.toFixed(3)),
        size: size.toArray().map((v) => +v.toFixed(3)),
        maxDim: +Math.max(size.x, size.y, size.z).toFixed(3),
      };
      inFrustum = {
        cameraPos: cam.position.toArray().map((v) => +v.toFixed(3)),
        target: sceneManager.controls?.target?.toArray().map((v) => +v.toFixed(3)),
        distance: +dist.toFixed(3),
        near: cam.near,
        far: cam.far,
        fov: cam.fov,
        likelyVisible: dist > modelBox.maxDim * 0.3 && dist < cam.far,
      };
    }
  }

  return {
    camera: {
      position: cam.position.toArray().map((v) => +v.toFixed(3)),
      fov: cam.fov,
      aspect: +cam.aspect.toFixed(4),
      near: cam.near,
      far: cam.far,
    },
    model: model
      ? {
          exists: true,
          name: model.name,
          childCount: model.children.length,
          box: modelBox,
          inView: inFrustum,
        }
      : { exists: false },
    pointCloud: pointCloud
      ? {
          particles: pointCloud.rnd?.length ?? 0,
          pointsVisible: pointCloud.points?.visible ?? false,
          meshVisible: pointCloud.meshVisible,
          progress: +pointCloud.progress?.toFixed(3),
        }
      : null,
    renderer: sceneManager.renderer
      ? {
          created: true,
          domElementIsCanvas: sceneManager.renderer.domElement === sceneManager.canvas,
        }
      : { created: false },
    loopRunning: sceneManager._running ?? false,
    renderCount: _renderCount,
  };
}

/**
 * @param {string} phase 诊断阶段标签
 * @param {import('../scene/SceneManager.js').SceneManager | null} sceneManager
 */
export function logAtlasViewportDiagnostics(phase, sceneManager = null) {
  if (!isEnabled()) return null;

  const viewport = document.querySelector('#atlas-viewport');
  const canvas = document.querySelector('#webgl-canvas');
  const sectionAtlas = document.querySelector('#section-atlas');
  const stageColumn = document.querySelector('#stage-column');
  const clapFlash = document.querySelector('#clap-flash');

  const report = {
    phase,
    timestamp: Date.now(),
    containers: {
      atlasViewport: elInfo(viewport, '#atlas-viewport'),
      sectionAtlas: elInfo(sectionAtlas, '#section-atlas'),
      stageColumn: elInfo(stageColumn, '#stage-column'),
      clapFlash: clapFlash
        ? {
            ...elInfo(clapFlash, '#clap-flash'),
            classList: [...clapFlash.classList],
            opacity: cs(clapFlash)?.opacity,
          }
        : null,
    },
    canvas: canvasInfo(canvas ?? sceneManager?.canvas ?? null),
    scene: sceneManager ? cameraModelInfo(sceneManager) : null,
    visibility: {
      currentSection: document.querySelector('.main-body')?.dataset?.section,
      atlasHidden: sectionAtlas?.classList.contains('section-hidden'),
      stageColumnHidden: stageColumn?.classList.contains('section-hidden'),
    },
  };

  const vp = report.containers.atlasViewport;
  const cv = report.canvas;
  if (vp.exists && cv.exists) {
    report.sizeConsistency = {
      viewportOffset: `${vp.offsetWidth}×${vp.offsetHeight}`,
      canvasClient: `${cv.clientWidth}×${cv.clientHeight}`,
      canvasBuffer: `${cv.bufferWidth}×${cv.bufferHeight}`,
      clientMatchesViewport:
        vp.offsetWidth === cv.clientWidth && vp.offsetHeight === cv.clientHeight,
      bufferReasonable: cv.bufferWidth >= 2 && cv.bufferHeight >= 2,
    };
  }

  console.log(`[白屏诊断/${phase}]`, report);
  window.__ATLAS_DIAG__ = window.__ATLAS_DIAG__ || {};
  window.__ATLAS_DIAG__[phase] = report;
  window.__ATLAS_DIAG__.latest = report;

  return report;
}

/** 在 renderer.render 内调用 — 定期输出渲染计数 */
export function tickAtlasRenderDiagnostics(sceneManager) {
  if (!isEnabled() || !sceneManager) return;
  _renderCount += 1;

  const now = performance.now();
  if (_renderCount <= 3 || now - _lastRenderLog >= 2000) {
    _lastRenderLog = now;
    console.log(
      `[白屏诊断/render] 帧#${_renderCount} loopRunning=${sceneManager._running} buffer=${sceneManager.canvas?.width}×${sceneManager.canvas?.height}`
    );
  }

  if (_renderCount === 120) {
    logAtlasViewportDiagnostics('render@120frames', sceneManager);
  }
}

export function resetAtlasRenderCounter() {
  _renderCount = 0;
  _lastRenderLog = 0;
}
