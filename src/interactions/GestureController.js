import { damp } from '../scene/PointCloudCastModel.js';
import { performanceMonitor } from '../debug/PerformanceMonitor.js';
import { createHandLandmarker } from './mediapipeVision.js';
import { getDeviceProfile } from '../utils/deviceProfile.js';

/** 指尖→掌心距离归一化后：低于此为"弯"，高于此为"伸" */
const FINGER_CURLED = 0.4;

/** MediaPipe 检测降频：桌面每帧，手机每2帧，低性能每3帧（运行时按设备复写） */
let MEDIAPIPE_DETECT_INTERVAL = 1;
try {
  MEDIAPIPE_DETECT_INTERVAL = getDeviceProfile().detectInterval;
} catch { /* 保持默认 1 */ }
export function getDetectInterval() {
  return MEDIAPIPE_DETECT_INTERVAL;
}
const FINGER_EXTENDED = 0.56;

/** 拍手判定：掌心距阈值 + 合拢速度 + 冷却（防连击） */
const CLAP_APART_DIST = 0.24;
const CLAP_NEAR_DIST = 0.11;
const CLAP_MIN_CLOSE_VELOCITY = 0.65;
const CLAP_COOLDOWN_MS = 900;

/** 同一 video 仅允许一个活跃 GestureController */
const videoOwners = new WeakMap();

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
    /** 拍手成功时回调（由 AtlasSection 注册） */
    this.onClap = null;

    this.currentGesture = 'none';
    this.handsDistance = 0;

    /** 调试：检测到的手数量、掌心距、冷却状态 */
    this.numHands = 0;
    this.palmDistance = 0;
    this.clapInCooldown = false;
    this.clapTriggeredThisFrame = false;

    /** 调试：当前解构手势 A | B | transition | fist | two_hands | none */
    this.deconstructMode = 'none';
    this.modeDisplayLabel = '等待手势…';

    this._prevPalmX = null;
    this._lastProcessTime = performance.now();
    /** 五指伸展度 0~1（平滑，指尖→掌心距离） */
    this._smoothExtend = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };

    /** 拍手：上一帧双手掌心距、是否曾分开、冷却截止 */
    this._prevTwoHandPalmDist = null;
    this._handsWereApart = false;
    this._clapCooldownUntil = 0;
    this._detectFrame = 0;
    /** @type {Array<Array<{x:number,y:number,z:number}>>|null} */
    this._landmarkPrev = null;
    /** @type {Array<Array<{x:number,y:number,z:number}>>|null} */
    this._landmarkCurr = null;
    this._interpStep = 0;
    /** 每帧用于交互的插值关键点（骨架/掌心读取此值） */
    this._activeLandmarks = null;
  }

  async init() {
    const prev = videoOwners.get(this.videoEl);
    if (prev && prev !== this) {
      prev.dispose();
    }

    this.landmarker = await createHandLandmarker();

    await this._startCamera();
    this.running = true;
    videoOwners.set(this.videoEl, this);
  }

  /**
   * 每帧：插值关键点并处理手势逻辑（轻量，不阻塞渲染）
   */
  tickProcess() {
    if (!this.running || !this.landmarker) return;

    const landmarks = this._getInterpolatedLandmarks();
    if (landmarks) {
      this._activeLandmarks = landmarks;
      this._processResults({ landmarks });
    }

    if (this._landmarkCurr) {
      this._interpStep = Math.min(
        this._interpStep + 1,
        MEDIAPIPE_DETECT_INTERVAL
      );
    }
  }

  /**
   * 渲染后调用：MediaPipe 检测（重计算，避免卡住 WebGL 帧）
   */
  tickDetect() {
    if (!this.running || !this.landmarker) return;
    if (this.videoEl.readyState < 2) return;

    this._detectFrame += 1;
    if (this._detectFrame % MEDIAPIPE_DETECT_INTERVAL !== 0) return;

    const results = this.landmarker.detectForVideo(
      this.videoEl,
      performance.now()
    );
    this.lastResults = results;
    performanceMonitor.tickMediapipe();

    const landmarks = results.landmarks ?? [];
    if (!landmarks.length) {
      this._commitDetection([]);
      this._activeLandmarks = null;
      this._processResults({ landmarks: [] });
      return;
    }
    this._commitDetection(landmarks);
  }

  /** @deprecated 兼容旧调用，等同 tickProcess */
  tick() {
    this.tickProcess();
  }

  _commitDetection(landmarks) {
    if (!landmarks.length) {
      this._landmarkPrev = null;
      this._landmarkCurr = null;
      this._interpStep = 0;
      return;
    }

    this._landmarkPrev = this._landmarkCurr
      ? this._cloneLandmarks(this._landmarkCurr)
      : this._cloneLandmarks(landmarks);
    this._landmarkCurr = this._cloneLandmarks(landmarks);
    this._interpStep = 0;
  }

  _cloneLandmarks(hands) {
    return hands.map((hand) => hand.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  }

  _lerpLandmarks(from, to, t) {
    const alpha = Math.min(1, Math.max(0, t));
    return to.map((hand, hi) =>
      hand.map((p, li) => {
        const a = from[hi]?.[li] ?? p;
        return {
          x: a.x + (p.x - a.x) * alpha,
          y: a.y + (p.y - a.y) * alpha,
          z: a.z + (p.z - a.z) * alpha,
        };
      })
    );
  }

  _getInterpolatedLandmarks() {
    if (!this._landmarkCurr?.length) return null;
    if (!this._landmarkPrev || this._interpStep <= 0) {
      return this._landmarkCurr;
    }
    const t = this._interpStep / MEDIAPIPE_DETECT_INTERVAL;
    return this._lerpLandmarks(this._landmarkPrev, this._landmarkCurr, t);
  }

  /** 骨架叠加层读取的 landmarks */
  getDisplayLandmarks() {
    return this._activeLandmarks ?? this.lastResults?.landmarks ?? null;
  }

  async _startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('CAMERA_UNSUPPORTED');
      err.code = 'CAMERA_UNSUPPORTED';
      throw err;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      const name = err?.name ?? '';
      err.code =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'CAMERA_DENIED'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'CAMERA_ABSENT'
            : name === 'NotReadableError' || name === 'AbortError'
              ? 'CAMERA_BUSY'
              : 'CAMERA_FAILED';
      console.warn('[GestureController] 摄像头启动失败:', name, err?.message ?? err);
      throw err;
    }
    this.videoEl.srcObject = stream;
    await this.videoEl.play();
  }

  _processResults(results) {
    const hands = results.landmarks ?? [];
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastProcessTime) / 1000);
    this._lastProcessTime = now;
    this.numHands = hands.length;
    this.clapTriggeredThisFrame = false;

    if (hands.length === 0) {
      this._resetClapState();
      this.resetPalmTracking();
      this.deconstructMode = 'none';
      this.modeDisplayLabel = '未检测到手势';
      this.palmDistance = 0;
      this._emitGesture('none');
      this._emitHandsDistance(0);
      return;
    }

    // 【手数量分流】双手 → 拍手判定，不跑单手解构/消散
    if (hands.length >= 2) {
      this._processTwoHands(hands, now, dt);
      return;
    }

    // 【手数量分流】单手 → 原有握拳/A/B/平移逻辑，拍手不介入
    this._resetClapState();
    const lm = hands[0];
    this._updateSmoothFingerExtend(lm, dt);
    this.deconstructMode = this._resolveDeconstructMode(lm);
    this.modeDisplayLabel = this._modeToDisplayLabel(this.deconstructMode);

    const uiGesture = this._classifyUiGesture(lm);
    this._emitGesture(uiGesture);
    this._emitHandsDistance(0);
  }

  /** 双手帧：掌心距离 + 拍手判定（含速度阈值与冷却） */
  _processTwoHands(hands, now, dt) {
    this.resetPalmTracking();
    this.palmDistance = this._calcPalmDistance(hands[0], hands[1]);
    this.clapInCooldown = now < this._clapCooldownUntil;

    if (this.palmDistance > CLAP_APART_DIST) {
      this._handsWereApart = true;
    }

    let closeVelocity = 0;
    if (this._prevTwoHandPalmDist != null && dt > 0) {
      closeVelocity = (this._prevTwoHandPalmDist - this.palmDistance) / dt;
    }

  // 【拍手判定】曾分开 + 骤近至阈值 + 合拢速度够快
    if (
      !this.clapInCooldown &&
      this._handsWereApart &&
      this.palmDistance < CLAP_NEAR_DIST &&
      closeVelocity > CLAP_MIN_CLOSE_VELOCITY &&
      this._prevTwoHandPalmDist != null &&
      this._prevTwoHandPalmDist >= CLAP_NEAR_DIST
    ) {
      this._clapCooldownUntil = now + CLAP_COOLDOWN_MS;
      this._handsWereApart = false;
      this.clapTriggeredThisFrame = true;
      this.clapInCooldown = true;
      this.deconstructMode = 'clap';
      this.modeDisplayLabel = '拍手 · 切换文物';
      this._emitGesture('clap');
      if (this.onClap) this.onClap();
    } else {
      this.deconstructMode = 'two_hands';
      this.modeDisplayLabel = this._twoHandsDebugLabel(closeVelocity);
      this._emitGesture('two_hands');
    }

    this._prevTwoHandPalmDist = this.palmDistance;
    this._emitHandsDistance(this._calcHandsDistance(hands[0], hands[1]));
  }

  _twoHandsDebugLabel(closeVelocity) {
    const dist = this.palmDistance.toFixed(2);
    const vel = closeVelocity.toFixed(2);
    const cd = this.clapInCooldown ? '冷却中' : '就绪';
    return `双手 · 距${dist} · 速${vel} · 拍手${cd}`;
  }

  _resetClapState() {
    this._prevTwoHandPalmDist = null;
    this._handsWereApart = false;
    this.palmDistance = 0;
    this.clapInCooldown = performance.now() < this._clapCooldownUntil;
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
      case 'two_hands':
        return this._twoHandsDebugLabel(0);
      case 'clap':
        return '拍手 · 切换文物 ✓';
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
      this._smoothExtend[k] = damp(this._smoothExtend[k], raw[i], 18, dt);
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
   * 【手数量分流】双手时返回 null，不驱动单手解构/消散
   */
  mapGestureToStages() {
    if (this.numHands >= 2) return null;

    const lm = this._activeLandmarks?.[0];
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

  /** 拍手用：两手掌心欧氏距离（归一化坐标，未压缩） */
  _calcPalmDistance(handA, handB) {
    return this._dist2d(this._getPalmCenter(handA), this._getPalmCenter(handB));
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
    const lm = this._activeLandmarks?.[0];
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
    const lm = this._activeLandmarks?.[0];
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
    if (!this._activeLandmarks?.[0]) return null;
    const tip = this._activeLandmarks[0][8];
    return { x: 1 - tip.x, y: tip.y };
  }

  stop() {
    this.dispose();
  }

  dispose() {
    this.running = false;
    this.onGestureChange = null;
    this.onHandsDistanceChange = null;
    this.onClap = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.lastResults = null;
    this._landmarkPrev = null;
    this._landmarkCurr = null;
    this._activeLandmarks = null;
    this.currentGesture = 'none';
    this.deconstructMode = 'none';
    this.resetPalmTracking();
    const stream = this.videoEl.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    this.videoEl.srcObject = null;
    this.videoEl.pause?.();
    if (videoOwners.get(this.videoEl) === this) {
      videoOwners.delete(this.videoEl);
    }
  }
}
