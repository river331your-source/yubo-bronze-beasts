/** MediaPipe 手部 21 关键点连线 */
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/**
 * 摄像头小窗 + MediaPipe 手部骨架实时渲染
 */
export class SkeletonOverlay {
  constructor(videoEl, canvasEl, gestureController) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.gesture = gestureController;
    this.ctx = canvasEl.getContext('2d');
    this.running = true;
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    this._draw();
    requestAnimationFrame(() => this._loop());
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

    const hands = this.gesture.lastResults?.landmarks ?? [];
    hands.forEach((landmarks, handIdx) => {
      const hue = handIdx === 0 ? '#C9A84C' : '#6F9478';
      const joint = handIdx === 0 ? '#e8d090' : '#8fae94';

      ctx.strokeStyle = hue;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      HAND_CONNECTIONS.forEach(([a, b]) => {
        const p1 = landmarks[a];
        const p2 = landmarks[b];
        if (!p1 || !p2) return;
        ctx.beginPath();
        ctx.moveTo((1 - p1.x) * w, p1.y * h);
        ctx.lineTo((1 - p2.x) * w, p2.y * h);
        ctx.stroke();
      });

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
