import { isPortraitPhone } from './deviceProfile.js';

let deferred = [];
let flushedForOrientation = false;

export function shouldDeferHeavyInit() {
  // 比赛手机版：竖屏也是完整可玩，不再因 portrait 延迟任何初始化
  return false;
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
