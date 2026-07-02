/**
 * 性能诊断：角标 FPS + 定期 console 输出
 * 开发模式或 URL ?perf=1 时启用
 */
class PerformanceMonitor {
  constructor() {
    this.enabled = false;
    this.particleCount = 0;
    /** @type {Map<string, { active: boolean, frames: number }>} */
    this.loops = new Map();
    this._renderFrames = 0;
    this._renderFps = 0;
    this._renderLast = performance.now();
    this._mpFrames = 0;
    this._mpHz = 0;
    this._mpLast = performance.now();
    this._hudEl = null;
    this._hudTimer = null;
    this._logTimer = null;
  }

  init(options = {}) {
    const params = new URLSearchParams(location.search);
    this.enabled =
      options.enabled ??
      (params.has('perf') || localStorage.getItem('perf') === '1');
    if (!this.enabled) return;

    this.clearLoops();
    this._createHud();
    this._hudTimer = window.setInterval(() => this._updateHud(), 250);
    this._logTimer = window.setInterval(() => this._logConsole(), 3000);
    console.info('[性能诊断] 已启用 — 角标 FPS + 每 3s console 报告');
  }

  dispose() {
    if (this._hudTimer != null) {
      clearInterval(this._hudTimer);
      this._hudTimer = null;
    }
    if (this._logTimer != null) {
      clearInterval(this._logTimer);
      this._logTimer = null;
    }
    this._hudEl?.remove();
    this._hudEl = null;
    this.loops.clear();
    this.enabled = false;
  }

  registerLoop(name) {
    if (!this.enabled) return;
    this.loops.set(name, { active: true, frames: 0 });
  }

  unregisterLoop(name) {
    this.loops.delete(name);
  }

  /** 启动新版块主循环前清空陈旧注册（HMR / 泄漏遗留） */
  clearLoops() {
    this.loops.clear();
  }

  /** 每帧调用，标记该循环本帧仍在运行 */
  tickLoop(name) {
    if (!this.enabled) return;
    const entry = this.loops.get(name);
    if (entry) entry.frames += 1;
  }

  /** WebGL 渲染帧（用于主 FPS） */
  tickRender() {
    if (!this.enabled) return;
    this._renderFrames += 1;
    const now = performance.now();
    const elapsed = now - this._renderLast;
    if (elapsed >= 500) {
      this._renderFps = (this._renderFrames * 1000) / elapsed;
      this._renderFrames = 0;
      this._renderLast = now;
    }
  }

  /** MediaPipe detectForVideo 每调用一次 */
  tickMediapipe() {
    if (!this.enabled) return;
    this._mpFrames += 1;
    const now = performance.now();
    const elapsed = now - this._mpLast;
    if (elapsed >= 1000) {
      this._mpHz = (this._mpFrames * 1000) / elapsed;
      this._mpFrames = 0;
      this._mpLast = now;
    }
  }

  setParticleCount(count) {
    this.particleCount = count;
  }

  getActiveLoopNames() {
    return [...this.loops.keys()];
  }

  _createHud() {
    const el = document.createElement('div');
    el.id = 'perf-hud';
    el.className = 'perf-hud--visible';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="perf-hud-row perf-hud-fps">FPS —</div>
      <div class="perf-hud-row perf-hud-particles">粒子 —</div>
      <div class="perf-hud-row perf-hud-mp">MediaPipe — Hz</div>
      <div class="perf-hud-row perf-hud-raf">RAF —</div>
    `;
    const host = document.getElementById('viewport-16-9') ?? document.body;
    host.appendChild(el);
    this._hudEl = el;
  }

  _updateHud() {
    if (!this.enabled || !this._hudEl) return;

    const fps = this._hudEl.querySelector('.perf-hud-fps');
    const particles = this._hudEl.querySelector('.perf-hud-particles');
    const mp = this._hudEl.querySelector('.perf-hud-mp');
    const raf = this._hudEl.querySelector('.perf-hud-raf');

    const active = this.getActiveLoopNames();
    const fpsVal = this._renderFps;
    const fpsClass =
      fpsVal >= 55 ? 'perf-ok' : fpsVal >= 30 ? 'perf-warn' : 'perf-bad';

    if (fps) {
      fps.textContent = `FPS ${fpsVal.toFixed(0)}`;
      fps.className = `perf-hud-row perf-hud-fps ${fpsClass}`;
    }
    if (particles) {
      particles.textContent = `粒子 ${this.particleCount.toLocaleString()}`;
    }
    if (mp) {
      mp.textContent = `MediaPipe ${this._mpHz.toFixed(0)} Hz`;
    }
    if (raf) {
      const count = active.length;
      const ok = count === 1;
      raf.textContent = ok
        ? `RAF×1 ${active[0]}`
        : `RAF×${count} ⚠ ${active.join(', ')}`;
      raf.className = `perf-hud-row perf-hud-raf ${ok ? 'perf-ok' : 'perf-bad'}`;
      raf.title = active.join('\n');
    }
  }

  _logConsole() {
    const active = this.getActiveLoopNames();

    const report = {
      fps: Number(this._renderFps.toFixed(1)),
      particles: this.particleCount,
      activeRafLoops: active,
      activeRafCount: active.length,
      mediapipeHz: Number(this._mpHz.toFixed(1)),
    };

    console.log('[性能诊断]', report);

    if (active.length !== 1) {
      console.warn(
        `[性能诊断] ⚠ 应有 1 个 RAF 循环，当前 ${active.length} 个:`,
        active
      );
    }
    if (this.particleCount >= 30000 && this._renderFps < 45) {
      console.warn('[性能诊断] ⚠ 3 万粒子 + FPS 偏低，可考虑降低 PARTICLE_COUNT');
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();
