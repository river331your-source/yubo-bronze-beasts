/**
 * MediaPipe 手部 21 关键点 — 由主循环驱动 draw()，不自建 RAF
 */
export class SkeletonOverlay {
  constructor(videoEl, canvasEl, gestureController) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.gesture = gestureController;
    this.ctx = canvasEl.getContext('2d');
    this.running = true;
  }

  draw() {
    if (!this.running) return;
    this._draw();
  }

  _draw() {
    const { video, canvas, ctx } = this;
    if (!video.videoWidth) return;

    const w = video.clientWidth;
    const h = video.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const hands = this.gesture.getDisplayLandmarks() ?? [];
    hands.forEach((landmarks, handIdx) => {
      const hue = handIdx === 0 ? '#C9A84C' : '#6F9478';
      const joint = handIdx === 0 ? '#e8d090' : '#8fae94';

      landmarks.forEach((p, i) => {
        const x = (1 - p.x) * w;
        const y = p.y * h;
        const r = i === 0 ? 4 : i % 4 === 0 ? 3 : 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? hue : joint;
        ctx.fill();
        ctx.strokeStyle = 'rgba(7, 10, 8, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
    });
  }

  stop() {
    this.running = false;
  }
}
