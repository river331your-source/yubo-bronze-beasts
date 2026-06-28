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

    // 转手旋转：上一帧手掌朝向角（手腕→中指根），用于帧间增量
    this._prevTwistAngle = null;
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
      this._prevTwistAngle = null;
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

  /** 掌心参考点：腕 + 四指 MCP 均值 */
  _getPalmCenter(lm) {
    const ids = [0, 5, 9, 13, 17];
    let x = 0;
    let y = 0;
    ids.forEach((i) => {
      x += lm[i].x;
      y += lm[i].y;
    });
    return { x: x / ids.length, y: y / ids.length };
  }

  /**
   * 【张合控制拆解】返回 0~1 手掌张开程度
   * 五指指尖到掌心的平均距离，连续映射：距离小→握拳(0)，距离大→张开(1)
   */
  getHandOpenness() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;

    const palm = this._getPalmCenter(lm);
    const tips = [4, 8, 12, 16, 20];
    let avgTipDist = 0;
    tips.forEach((i) => {
      avgTipDist += this._dist2d(lm[i], palm);
    });
    avgTipDist /= tips.length;

    // 以腕→中指根距离为手尺度，归一化到 0~1
    const handScale = Math.max(this._dist2d(lm[0], lm[9]), 0.04);
    const ratio = avgTipDist / handScale;
    const openMin = 0.38;
    const openMax = 1.05;
    return Math.min(1, Math.max(0, (ratio - openMin) / (openMax - openMin)));
  }

  /**
   * 【旋转控制视角】手腕→中指根向量在屏幕平面的朝向角
   * 返回本帧相对上一帧的角度增量（弧度）；手不动则 delta≈0
   */
  _calcTwistAngle(lm) {
    const wrist = lm[0];
    const middleMcp = lm[9];
    const dx = middleMcp.x - wrist.x;
    const dy = middleMcp.y - wrist.y;
    return Math.atan2(dx, -dy);
  }

  /**
   * 【旋转控制视角】帧间手掌旋转增量
   * 手往左转 delta>0，往右转 delta<0（前置摄像头镜像后仍符合直觉）
   */
  getHandTwistDelta() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;

    const angle = this._calcTwistAngle(lm);

    if (this._prevTwistAngle === null) {
      this._prevTwistAngle = angle;
      return { delta: 0, angle };
    }

    let delta = angle - this._prevTwistAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    this._prevTwistAngle = angle;

    // 死区：抑制握拳/微抖引起的角度噪声
    const deadZone = 0.006;
    if (Math.abs(delta) < deadZone) delta = 0;

    // 前置摄像头 x 轴镜像：取反使「手左转→模型左转」
    return { delta: -delta, angle };
  }

  /** 手掌位置追踪 → 绝对 rotation（纹样/鼠标回退等场景保留） */
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
    this._prevTwistAngle = null;

    const stream = this.videoEl.srcObject;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    this.videoEl.srcObject = null;
    this.videoEl.pause?.();
  }
}
