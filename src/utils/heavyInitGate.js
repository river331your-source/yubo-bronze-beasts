import { isMobilePortrait } from './deviceProfile.js';

let deferred = [];
let flushedForOrientation = false;

/** 手机竖屏：延迟重资源初始化，只显示横屏提示 */
export function shouldDeferHeavyInit() {
  try {
    return isMobilePortrait();
  } catch {
    return false;
  }
}

export function deferHeavyInit(fn) {
  deferred.push(fn);
}

export function flushDeferredHeavyInit(reason) {
  if (!deferred.length) return;
  if (shouldDeferHeavyInit()) return;
  const fns = deferred.splice(0);
  flushedForOrientation = true;
  console.log(`[heavyInitGate] 横屏恢复，执行 ${fns.length} 个延迟初始化 (${reason ?? 'orientation'})`);
  fns.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.warn('[heavyInitGate] 延迟初始化失败:', err?.message ?? err);
    }
  });
}

export function hasDeferredHeavyInit() {
  return deferred.length > 0;
}

export function wasFlushed() {
  return flushedForOrientation;
}
