/**
 * 文物剪影 PNG 加载失败时隐藏，不显示浏览器碎图
 * @param {HTMLImageElement} img
 * @param {{ id?: string, src?: string }} meta
 */
export function bindRelicSilhouetteFallback(img, meta = {}) {
  if (!img || img.dataset.silhouetteBound === '1') return;
  img.dataset.silhouetteBound = '1';

  const label = meta.id ? `[剪影 ${meta.id}]` : '[剪影]';

  const hide = (reason) => {
    console.warn(`${label} 加载失败`, reason, img.currentSrc || img.src);
    img.classList.add('arc-silhouette--failed');
    img.removeAttribute('src');
  };

  img.addEventListener('error', () => {
    hide('error 事件');
  });

  // 避免同步误判：等一帧再检查是否已失败
  requestAnimationFrame(() => {
    if (!img.src || img.classList.contains('arc-silhouette--failed')) return;
    if (img.complete && img.naturalWidth === 0) {
      hide('complete 但 naturalWidth=0');
    }
  });
}

/**
 * public 目录资源路径（兼容 Vite base: './'）
 */
export function resolvePublicAsset(path) {
  if (!path) return '';
  const trimmed = path.replace(/^\//, '');
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`;
}
