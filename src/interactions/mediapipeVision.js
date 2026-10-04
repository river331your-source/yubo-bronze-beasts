import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

function resolveBase(p) {
  const base = import.meta.env.BASE_URL || './';
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}${p}`.replace(/\/+/g, '/').replace(/^\.\//, './');
}

const WASM_PATH = resolveBase('mediapipe/wasm');
const MODEL_PATH = resolveBase('mediapipe/hand_landmarker.task');

let _visionPromise = null;

export function loadVisionWasm() {
  if (!_visionPromise) {
    _visionPromise = FilesetResolver.forVisionTasks(WASM_PATH);
  }
  return _visionPromise;
}

export function getLocalMediapipePaths() {
  return { wasmPath: WASM_PATH, modelPath: MODEL_PATH };
}

async function createWithDelegate(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

export async function createHandLandmarker() {
  const vision = await loadVisionWasm();
  try {
    return await createWithDelegate(vision, 'GPU');
  } catch (err) {
    console.warn('[mediapipe] GPU delegate 初始化失败，fallback 到 CPU:', err?.message ?? err);
    return createWithDelegate(vision, 'CPU');
  }
}
