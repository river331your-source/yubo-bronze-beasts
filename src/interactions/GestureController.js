import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { damp } from '../scene/PointCloudCastModel.js';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** 指尖→掌心距离归一化后：低于此为"弯"，高于此为"伸" */
const FINGER_CURLED = 0.4;
const FINGER_EXTENDED = 0.56;

/**
 * 手势 A/B 靠后三指区分（互斥）：
 * - A 考古解构：食+拇伸，中/无/小弯
 * - B 粒子消散：五指全伸
 * 平移维度：掌心 X → rotation.y（与弯伸正交）
 */
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

    /** 调试：当前解构手势 A | B | transition | fist | none */
    this.deconstructMode = 'none';
    this.modeDisplayLabel = '等待手势…';

    this._prevPalmX = null;
    this._lastProcessTime = performance.now();
    /** 五指伸展度 0~1（平滑，指尖→掌心距离） */
    this._smoothExtend = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
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
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastProcessTime) / 1000);
    this._lastProcessTime = now;

    if (hands.length === 0) {
      this.resetPalmTracking();
      this.deconstructMode = 'none';
      this.modeDisplayLabel = '未检测到手势';
      this._emitGesture('none');
      this._emitHandsDistance(0);
      return;
    }

    const lm = hands[0];
    this._updateSmoothFingerExtend(lm, dt);
    this.deconstructMode = this._resolveDeconstructMode(lm);
    this.modeDisplayLabel = this._modeToDisplayLabel(this.deconstructMode);

    const uiGesture = this._classifyUiGesture(lm);
    this._emitGesture(uiGesture);

    if (hands.length >= 2) {
      this._emitHandsDistance(this._calcHandsDistance(hands[0], hands[1]));
    } else {
      this._emitHandsDistance(0);
    }
  }

  /** 纹样模式：👌 捏合手电（与 A 考古姿态区分：需拇指食指捏拢） */
  _isOkPinch(lm) {
    const pinchDist = this._dist2d(lm[4], lm[8]);
    return (
      pinchDist < 0.05 &&
      this._smoothExtend.index >= FINGER_EXTENDED &&
      this._smoothExtend.middle <= FINGER_CURLED &&
      this._smoothExtend.ring <= FINGER_CURLED &&
      this._smoothExtend.pinky <= FINGER_CURLED
    );
  }

  _classifyUiGesture(lm) {
    if (this._isOkPinch(lm)) return 'ok';
    switch (this.deconstructMode) {
      case 'A':
        return 'archaeology';
      case 'B':
        return 'dissolve';
      case 'fist':
        return 'fist';
      case 'transition':
        return 'transition';
      default:
        return 'unknown';
    }
  }

  _modeToDisplayLabel(mode) {
    switch (mode) {
      case 'A':
        return '手势A · 考古解构';
      case 'B':
        return '手势B · 粒子消散';
      case 'transition':
        return 'A→B 过渡';
      case 'fist':
        return '握拳 · 聚合';
      default:
        return '识别中…';
    }
  }

  /**
   * 每指伸展度：指尖到掌心距离 / 手尺度，0=弯 1=伸
   * 全部五指统一用距离判定（含拇指）
   */
  _calcFingerExtendScores(lm) {
    const palm = this._getPalmCenter(lm);
    const tips = [4, 8, 12, 16, 20];
    const handScale = Math.max(this._dist2d(lm[0], lm[9]), 0.04);

    return tips.map((tipIdx) => {
      const ratio = this._dist2d(lm[tipIdx], palm) / handScale;
      return Math.min(1, Math.max(0, (ratio - 0.34) / (0.72 - 0.34)));
    });
  }

  /** 帧间阻尼平滑，避免临界抖动导致 A/B 跳变 */
  _updateSmoothFingerExtend(lm, dt) {
    const raw = this._calcFingerExtendScores(lm);
    const keys = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    keys.forEach((k, i) => {
      this._smoothExtend[k] = damp(this._smoothExtend[k], raw[i], 14, dt);
    });
  }

  _isFingerExtended(key) {
    return this._smoothExtend[key] >= FINGER_EXTENDED;
  }

  _isFingerCurled(key) {
    return this._smoothExtend[key] <= FINGER_CURLED;
  }

  /**
   * 【后三指区分 A/B】
   * A: index+thumb伸 && middle+ring+pinky弯
   * B: 五指全伸
   */
  _isGestureA() {
    const s = this._smoothExtend;
    return (
      s.index >= FINGER_EXTENDED &&
      s.thumb >= FINGER_EXTENDED &&
      s.middle <= FINGER_CURLED &&
      s.ring <= FINGER_CURLED &&
      s.pinky <= FINGER_CURLED
    );
  }

  _isGestureB() {
    const s = this._smoothExtend;
    return (
      s.thumb >= FINGER_EXTENDED &&
      s.index >= FINGER_EXTENDED &&
      s.middle >= FINGER_EXTENDED &&
      s.ring >= FINGER_EXTENDED &&
      s.pinky >= FINGER_EXTENDED
    );
  }

  _isFist() {
    const s = this._smoothExtend;
    const avg = (s.thumb + s.index + s.middle + s.ring + s.pinky) / 5;
    return avg <= 0.32;
  }

  _resolveDeconstructMode(lm) {
    if (this._isOkPinch(lm)) return 'none';
    if (this._isGestureB()) return 'B';
    if (this._isGestureA()) return 'A';
    if (this._isFist()) return 'fist';

    const s = this._smoothExtend;
    if (s.index >= FINGER_EXTENDED && s.thumb >= FINGER_EXTENDED) {
      return 'transition';
    }
    return 'unknown';
  }

  /**
   * 解构阶段 + 标注显隐系数
   * labelOpacity: A=1, B=0, A→B 过渡=1-dissolve
   */
  mapGestureToStages() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;

    const mode = this.deconstructMode;
    const s = this._smoothExtend;

    if (mode === 'B') {
      return {
        mode: 'B',
        deconstruct: 1,
        dissolve: 1,
        labelOpacity: 0,
        uiGesture: 'dissolve',
      };
    }

    if (mode === 'A') {
      return {
        mode: 'A',
        deconstruct: 1,
        dissolve: 0,
        labelOpacity: 1,
        uiGesture: 'archaeology',
      };
    }

    if (mode === 'fist') {
      return {
        mode: 'fist',
        deconstruct: 0,
        dissolve: 0,
        labelOpacity: 0,
        uiGesture: 'fist',
      };
    }

    if (mode === 'transition') {
      const backAvg = (s.middle + s.ring + s.pinky) / 3;
      const dissolve = this._smoothstep(
        (backAvg - FINGER_CURLED) / (FINGER_EXTENDED - FINGER_CURLED)
      );
      return {
        mode: 'transition',
        deconstruct: 1,
        dissolve,
        labelOpacity: 1 - dissolve,
        uiGesture: 'transition',
      };
    }

    const openness = this.getHandOpenness() ?? 0;
    return {
      mode: 'unknown',
      deconstruct: Math.min(1, openness * 1.2),
      dissolve: 0,
      labelOpacity: openness > 0.35 ? 0.6 : 0,
      uiGesture: 'unknown',
    };
  }

  _smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
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

  getHandOpenness() {
    const s = this._smoothExtend;
    return (s.thumb + s.index + s.middle + s.ring + s.pinky) / 5;
  }

  getPalmCenterX() {
    const lm = this.lastResults?.landmarks?.[0];
    if (!lm) return null;
    const palm = this._getPalmCenter(lm);
    return 1 - palm.x;
  }

  getPalmSlideDelta() {
    const x = this.getPalmCenterX();
    if (x == null) return null;

    if (this._prevPalmX === null) {
      this._prevPalmX = x;
      return { delta: 0, x };
    }

    let delta = x - this._prevPalmX;
    this._prevPalmX = x;

    if (Math.abs(delta) < 0.0015) delta = 0;
    return { delta, x };
  }

  resetPalmTracking() {
    this._prevPalmX = null;
  }

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
    return { rotX, rotY, rotZ: 0, present: true, px, py };
  }

  getIndexFingerScreenPos() {
    if (!this.lastResults?.landmarks?.[0]) return null;
    const tip = this.lastResults.landmarks[0][8];
    return { x: 1 - tip.x, y: tip.y };
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
    this.deconstructMode = 'none';
    this.resetPalmTracking();
    const stream = this.videoEl.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    this.videoEl.srcObject = null;
    this.videoEl.pause?.();
  }
}
