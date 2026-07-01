/** 同一 canvas 仅允许一个 SceneManager，避免多 WebGL 上下文叠加重置导致白屏 */
const owners = new WeakMap();

export function claimCanvasScene(canvas, manager) {
  const prev = owners.get(canvas);
  if (prev && prev !== manager) {
    console.warn('[SceneManager] 释放旧 WebGL 实例（canvas 被重新占用）');
    prev.dispose();
  }
  owners.set(canvas, manager);
}

export function releaseCanvasScene(canvas, manager) {
  if (owners.get(canvas) === manager) {
    owners.delete(canvas);
  }
}
