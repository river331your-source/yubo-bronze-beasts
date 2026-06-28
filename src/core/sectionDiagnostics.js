/**
 * 版块隔离 + 中央 WebGL 健康诊断（开发期 console 输出）
 */
export function logSectionHealth(ui, sceneManager = null, source = 'manual') {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const display = (el) => (el ? cs(el).display : 'missing');
  const bg = (el) => (el ? cs(el).backgroundColor : 'missing');

  const canvas = ui.webglCanvas;
  const viewport = ui.atlasViewport;
  const atlasHidden = ui.sectionAtlas?.classList.contains('section-hidden');
  const patternHidden = ui.sectionPattern?.classList.contains('section-hidden');
  const viewportRect = viewport?.getBoundingClientRect();

  let renderer = null;
  if (sceneManager?.renderer) {
    renderer = {
      width: sceneManager.renderer.domElement.width,
      height: sceneManager.renderer.domElement.height,
      running: sceneManager._running ?? false,
    };
  }

  const report = {
    source,
    currentSection: ui.currentSection,
    bothStagesVisible: !atlasHidden && !patternHidden,
    atlas: {
      display: display(ui.sectionAtlas),
      hiddenClass: atlasHidden,
    },
    pattern: {
      display: display(ui.sectionPattern),
      hiddenClass: patternHidden,
    },
    stageColumn: {
      display: display(ui.stageColumn),
      background: bg(ui.stageColumn),
    },
    atlasViewport: {
      display: display(viewport),
      hiddenClass: viewport?.classList.contains('section-hidden') ?? false,
      background: bg(viewport),
      rect: viewportRect
        ? {
            w: Math.round(viewportRect.width),
            h: Math.round(viewportRect.height),
          }
        : null,
    },
    webglCanvas: canvas
      ? {
          inDom: document.body.contains(canvas),
          cssBackground: bg(canvas),
          client: { w: canvas.clientWidth, h: canvas.clientHeight },
          buffer: { w: canvas.width, h: canvas.height },
        }
      : 'missing',
    sceneManager: renderer,
  };

  console.log('[版块/中央诊断]', report);

  if (report.bothStagesVisible) {
    console.warn('[版块/中央诊断] ⚠ 图鉴与纹样同时可见 — 串内容风险');
  }
  if (
    ui.currentSection === 'atlas' &&
    viewportRect &&
    (viewportRect.width < 2 || viewportRect.height < 2)
  ) {
    console.warn('[版块/中央诊断] ⚠ 图鉴激活但 #atlas-viewport 尺寸接近 0 — 白屏风险');
  }
  if (
    ui.currentSection === 'atlas' &&
    canvas &&
    (canvas.width < 2 || canvas.height < 2)
  ) {
    console.warn('[版块/中央诊断] ⚠ WebGL buffer 尺寸为 0 — 白屏风险');
  }

  return report;
}
