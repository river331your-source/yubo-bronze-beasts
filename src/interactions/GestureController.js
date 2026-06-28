import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class GestureController {
  constructor(videoEl) {
    this.videoEl = videoEl;
    this.landmarker = null;
    this.running = false;
    this.lastResults = null;

    this.onGestureChange = null;
    this.onHandsDistanceChange = null;

    this.currentGesture = 'none';
    this.handsDistance = 0;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    await this._startCamera();
    this.running = true;
    this._detectLoop();
  }

  async _startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
    });
    this.videoEl.srcObject = stream;
    await this.videoEl.play();
  }

  _detectLoop() {
    if (!this.running || !this.landmarker) return;

    if (this.videoEl.readyState >= 2) {
      const results = this.landmarker.detectForVideo(
        this.videoEl,
        performance.now()
      );
      this.lastResults = results;
      this._processResults(results);
    }

    requestAnimationFrame(() => this._detectLoop());
  }

  _processResults(results) {
    const hands = results.landmarks ?? [];

    if (hands.length === 0) {
      this._emitGesture('none');
      this._emitHandsDistance(0);
      return;
    }

    const gesture = this._classifyGesture(hands[0]);
    this._emitGesture(gesture);

    if (hands.length >= 2) {
      const dist = this._calcHandsDistance(hands[0], hands[1]);
      this._emitHandsDistance(dist);
    } else {
      this._emitHandsDistance(0);
    }
  }

  _classifyGesture(landmarks) {
    const wrist = landmarks[0];
    const tips = [4, 8, 12, 16, 20];
    const mcp = [2, 5, 9, 13, 17];

    const fingersExtended = tips.map((tipIdx, i) => {
      const tip = landmarks[tipIdx];
      const base = landmarks[mcp[i]];
      const distTip = this._dist2d(tip, wrist);
      const distBase = this._dist2d(base, wrist);
      if (i === 0) {
        return tip.x < landmarks[3].x;
      }
      return distTip > distBase * 1.15;
    });

    const extendedCount = fingersExtended.filter(Boolean).length;

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = this._dist2d(thumbTip, indexTip);
    const isOK =
      pinchDist < 0.05 &&
      fingersExtended[1] &&
      !fingersExtended[2] &&
      !fingersExtended[3] &&
      !fingersExtended[4];

    if (isOK) return 'ok';
    if (extendedCount === 0) return 'fist';
    if (extendedCount >= 4) return 'open';
    if (fingersExtended[1] && extendedCount <= 2) return 'point';
    return 'unknown';
  }

  _calcHandsDistance(handA, handB) {
    const wristA = handA[0];
    const wristB = handB[0];
    const dist = this._dist2d(wristA, wristB);
    return Math.min(1, Math.max(0, (dist - 0.15) / 0.55));
  }

  _dist2d(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _emitGesture(gesture) {
    if (gesture !== this.currentGesture) {
      this.currentGesture = gesture;
      if (this.onGestureChange) this.onGestureChange(gesture);
    }
  }

  _emitHandsDistance(dist) {
    if (Math.abs(dist - this.handsDistance) > 0.01) {
      this.handsDistance = dist;
      if (this.onHandsDistanceChange) this.onHandsDistanceChange(dist);
    }
  }

  /** 返回 0~1 手掌张开程度（用于连续解构进度） */
  getHandOpenness() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;

    const wrist = lm[0];
    const tips = [4, 8, 12, 16, 20];
    const mcp = [2, 5, 9, 13, 17];

    let extended = 0;
    tips.forEach((tipIdx, i) => {
      const tip = lm[tipIdx];
      const base = lm[mcp[i]];
      const distTip = this._dist2d(tip, wrist);
      const distBase = this._dist2d(base, wrist);
      if (i === 0 ? tip.x < lm[3].x : distTip > distBase * 1.15) extended++;
    });

    return extended / 5;
  }

  /** 手掌追踪 → 模型 rotation（归一化屏幕 + 弧度） */
  getHandTrackTransform() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;

    const wrist = lm[0];
    const middle = lm[9];
    const indexMcp = lm[5];

    const px = 1 - (wrist.x * 0.45 + middle.x * 0.35 + indexMcp.x * 0.2);
    const py = wrist.y * 0.45 + middle.y * 0.35 + indexMcp.y * 0.2;

    const rotY = (px - 0.5) * Math.PI * 1.25;
    const rotX = (py - 0.5) * Math.PI * 0.42;

    const dx = middle.x - wrist.x;
    const dy = middle.y - wrist.y;
    const roll = Math.atan2(dx, -dy) * 0.35;

    return { rotX, rotY, rotZ: roll, present: true, px, py };
  }

  /** 返回 16:9 画幅内的归一化坐标 (0~1) */
  getIndexFingerScreenPos() {
    if (!this.lastResults?.landmarks?.[0]) return null;
    const tip = this.lastResults.landmarks[0][8];
    return {
      x: 1 - tip.x,
      y: tip.y,
    };
  }

  stop() {
    this.dispose();
  }

  dispose() {
    this.running = false;
    this.onGestureChange = null;
    this.onHandsDistanceChange = null;

    this.landmarker?.close?.();
    this.landmarker = null;
    this.lastResults = null;
    this.currentGesture = 'none';

    const stream = this.videoEl.srcObject;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    this.videoEl.srcObject = null;
    this.videoEl.pause?.();
  }
}
