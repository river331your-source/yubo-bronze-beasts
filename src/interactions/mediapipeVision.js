import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** 全局唯一 WASM 加载 Promise，避免重复插入 vision_wasm_internal.js */
let _visionPromise = null;

export function loadVisionWasm() {
  if (!_visionPromise) {
    _visionPromise = FilesetResolver.forVisionTasks(WASM_PATH);
  }
  return _visionPromise;
}

export async function createHandLandmarker() {
  const vision = await loadVisionWasm();
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}
