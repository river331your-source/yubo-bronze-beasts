/**
 * 全站唯一主 RAF — 同一时刻只有一个版块在跑循环
 */
import { performanceMonitor } from '../debug/PerformanceMonitor.js';

let _rafId = null;
let _running = false;
let _owner = null;
let _tickFn = null;
let _postTickFn = null;

function cancelMainRaf() {
  if (_rafId != null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

export function stopMainLoop() {
  _running = false;
  cancelMainRaf();
  performanceMonitor.unregisterLoop('main');
  _owner = null;
  _tickFn = null;
  _postTickFn = null;
}

export function startMainLoop(owner, tickFn, postTickFn = null) {
  if (_rafId != null) {
    console.warn(
      `[FrameLoop] startMainLoop("${owner}"): 发现存活 rafId，先取消 (原 owner: ${_owner ?? 'unknown'})`
    );
    cancelMainRaf();
    _running = false;
  }
  stopMainLoop();

  _owner = owner;
  _tickFn = tickFn;
  _postTickFn = postTickFn;
  _running = true;
  performanceMonitor.clearLoops();
  performanceMonitor.registerLoop('main');

  const loop = () => {
    if (!_running) {
      performanceMonitor.unregisterLoop('main');
      cancelMainRaf();
      return;
    }

    _rafId = null;
    performanceMonitor.tickLoop('main');
    _tickFn?.();
    _postTickFn?.();

    if (_running) {
      _rafId = requestAnimationFrame(loop);
    } else {
      performanceMonitor.unregisterLoop('main');
      cancelMainRaf();
    }
  };

  _rafId = requestAnimationFrame(loop);
}

export function getMainLoopOwner() {
  return _owner;
}

export function isMainLoopRunning() {
  return _running;
}

export function getMainLoopRafId() {
  return _rafId;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopMainLoop();
  });
}
