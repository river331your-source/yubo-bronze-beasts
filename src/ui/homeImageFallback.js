/**
 * 主页装饰图优雅降级：加载失败时隐藏 <img>，由 CSS 占位，不显示碎图
 */
export function bindHomeImageFallbacks(root) {
  if (!root) return;

  root.querySelectorAll('img[data-home-asset]').forEach((img) => {
    if (img.dataset.homeBound === '1') return;
    img.dataset.homeBound = '1';

    const fallbacks = (img.dataset.fallback || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    let fallbackIndex = 0;

    const markMissing = () => {
      img.classList.add('home-img--failed');
      img.removeAttribute('src');
      const host = img.closest('[data-home-fallback]');
      if (host) {
        host.dataset.homeMissing = img.dataset.homeAsset;
      }
    };

    const onFail = () => {
      while (fallbackIndex < fallbacks.length) {
        const next = fallbacks[fallbackIndex++];
        if (next !== img.getAttribute('src')) {
          img.src = next;
          return;
        }
      }
      markMissing();
    };

    img.addEventListener('error', onFail);
    if (img.complete && img.naturalWidth === 0) {
      onFail();
    }
  });
}
