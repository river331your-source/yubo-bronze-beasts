/**
 * 全站唯一主 RAF — 同一时刻只有一个版块在跑循环
 */
import { performanceMonitor } from '../debug/PerformanceMonitor.js';

let _rafId = null;
let _running = false;
let _owner = null;
let _tickFn = null;

let _postTickFn = null;

export function startMainLoop(owner, tickFn, postTickFn = null) {
  stopMainLoop();
  performanceMonitor.clearLoops();
  _owner = owner;
  _tickFn = tickFn;
  _postTickFn = postTickFn;
  _running = true;
  performanceMonitor.registerLoop('main');

  const loop = () => {
    if (!_running) {
      performanceMonitor.unregisterLoop('main');
      return;
    }
    _rafId = requestAnimationFrame(loop);
    performanceMonitor.tickLoop('main');
    _tickFn?.();
    _postTickFn?.();
  };
  loop();
}

export function stopMainLoop() {
  _running = false;
  if (_rafId != null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  performanceMonitor.unregisterLoop('main');
  _owner = null;
  _tickFn = null;
  _postTickFn = null;
}

export function getMainLoopOwner() {
  return _owner;
}

export function isMainLoopRunning() {
  return _running;
}
