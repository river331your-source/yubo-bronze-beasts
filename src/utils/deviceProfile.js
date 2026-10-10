const mq = (q) => window.matchMedia?.(q)?.matches ?? false;

export function getDeviceProfile() {
  const coarse = mq('(pointer: coarse)');
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const isMobile = coarse || mobileUA || smallScreen;
  const cores = navigator.hardwareConcurrency ?? 4;
  const lowPower = cores <= 4 || mq('(prefers-reduced-motion: reduce)');
  return {
    isMobile,
    isDesktop: !isMobile,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: cores,
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    coarsePointer: coarse,
    lowPower,
    detectInterval: !isMobile ? 1 : lowPower ? 3 : 2,
    maxPixelRatio: !isMobile ? 2 : 1.5,
  };
}

export function isPortraitPhone() {
  return window.innerHeight > window.innerWidth && Math.min(window.innerWidth, window.innerHeight) < 620;
}

/** 手机（粗指针且短边 < 900）；桌面窄窗口不误判 */
export function isMobileDevice() {
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 900;
}

export function isPortraitOrientation() {
  return window.matchMedia?.('(orientation: portrait)')?.matches
    ?? (window.innerHeight > window.innerWidth);
}

/** 手机且竖屏：比赛版竖屏限定体验的判定 */
export function isMobilePortrait() {
  return isMobileDevice() && isPortraitOrientation();
}
