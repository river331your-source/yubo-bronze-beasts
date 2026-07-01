import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ARTIFACTS, MODEL_ASSET_REVISION } from '../data/artifacts.js';
import { performanceMonitor } from '../debug/PerformanceMonitor.js';
import { createPlaceholderModel } from './PlaceholderFactory.js';
import { PointCloudFromModel } from './PointCloudFromModel.js';
import { loadSceneEnvironment } from './EnvironmentLoader.js';
import { applyBronzePBRToModel } from './BronzePBRMaterial.js';
import { claimCanvasScene, releaseCanvasScene } from './canvasSceneRegistry.js';
import {
  logAtlasViewportDiagnostics,
  tickAtlasRenderDiagnostics,
  resetAtlasRenderCounter,
} from '../debug/atlasViewportDiagnostics.js';

const TARGET_SIZE = 3;

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    claimCanvasScene(canvas, this);
    this.loadingEl = document.getElementById('model-loading');
    this.artifacts = ARTIFACTS;
    this.currentIndex = 0;
    this.modelGroup = new THREE.Group();
    this.modelContainer = new THREE.Group();
    this.modelContainer.name = 'model-container';
    this.modelGroup.add(this.modelContainer);
    this.loadedModels = new Map();
    this._modelCacheRevision = MODEL_ASSET_REVISION;
    this.onModelLoaded = null;
    this.pointCloud = null;
    this.envMap = null;
    this.envSource = null;

    this._initScene();
    this._initLights();
    this._initControls();
    this._initEnvironment();
    this._clock = new THREE.Clock();
    this._lastGoodSize = { width: 1, height: 1 };
    this._resizeRetryId = null;
    this._running = false;
    this._rafId = null;
    this._frameListeners = new Set();
    this._postFrameListeners = new Set();
    this._onWindowResize = () => this._onResize();
  }

  /** 注册每帧回调（手势/交互/骨架），由唯一主循环驱动 */
  addFrameListener(fn) {
    this._frameListeners.add(fn);
  }

  removeFrameListener(fn) {
    this._frameListeners.delete(fn);
  }

  addPostFrameListener(fn) {
    this._postFrameListeners.add(fn);
  }

  removePostFrameListener(fn) {
    this._postFrameListeners.delete(fn);
  }

  startLoop() {
    if (this._running) return;
    performanceMonitor.clearLoops();
    this._startLoop();
  }

  stopLoop() {
    this._frameListeners.clear();
    this._postFrameListeners.clear();
    this._running = false;
    performanceMonitor.unregisterLoop('main');
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** 异步加载 IBL 环境（HDRI 优先，无文件则用 RoomEnvironment） */
  async _initEnvironment() {
    const { envMap, source } = await loadSceneEnvironment(this.renderer, this.scene);
    this.envMap = envMap;
    this.envSource = source;
    this._applyEnvironmentToModels();
  }

  /** 环境贴图就绪后，刷新已缓存模型材质 */
  _applyEnvironmentToModels() {
    for (const model of this.loadedModels.values()) {
      applyBronzePBRToModel(model, this.envMap);
    }
    const current = this.getCurrentModel();
    if (current) applyBronzePBRToModel(current, this.envMap);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d0a);
    this.scene.fog = new THREE.FogExp2(0x0a0d0a, 0.04);

    const { width, height } = this._getStageSize();
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 4.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(0x0a0d0a, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    // PBR 色彩管理：sRGB 输出 + ACES 色调映射，金属高光与色彩更准确
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.add(this.modelGroup);

    const stage = this.canvas.closest('#atlas-viewport');
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    if (stage) this._resizeObserver.observe(stage);
    window.addEventListener('resize', this._onWindowResize);

    logAtlasViewportDiagnostics('SceneManager._initScene', this);
  }

  /**
   * 仅测量 #atlas-viewport — 禁止回退到 #stage-column，
   * 否则纹样版块激活时 column 有尺寸但 viewport 隐藏，会导致 canvas 像素错位白屏
   */
  _getStageSize() {
    const viewport = this.canvas.closest('#atlas-viewport');
    if (!viewport) return this._lastGoodSize;

    const hidden =
      viewport.classList.contains('section-hidden') ||
      viewport.closest('.section-hidden') != null ||
      getComputedStyle(viewport).display === 'none';

    if (hidden) return this._lastGoodSize;

    const rect = viewport.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width > 0 && height > 0) {
      this._lastGoodSize = { width, height };
      return { width, height };
    }

    const cw = Math.floor(viewport.clientWidth);
    const ch = Math.floor(viewport.clientHeight);
    if (cw > 0 && ch > 0) {
      this._lastGoodSize = { width: cw, height: ch };
      return { width: cw, height: ch };
    }

    return this._lastGoodSize;
  }

  _scheduleResizeRetry() {
    if (this._resizeRetryId != null) return;
    this._resizeRetryId = requestAnimationFrame(() => {
      this._resizeRetryId = null;
      this._onResize();
    });
  }

  /** 三点布光 + 环境光 */
  _initLights() {
    // 环境光：整体提亮暗部，保留细节
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    // 主光：右上前方，暖色主照明
    this.keyLight = new THREE.DirectionalLight(0xfff0e0, 1.0);
    this.keyLight.position.set(3, 4, 5);
    this.scene.add(this.keyLight);

    // 补光：左侧冷色，填充阴影、增加体积感
    this.fillLight = new THREE.DirectionalLight(0xb8c8e0, 0.4);
    this.fillLight.position.set(-4, 0, 2);
    this.scene.add(this.fillLight);

    // 轮廓光：后方暖色，勾出边缘金属反光
    this.rimLight = new THREE.DirectionalLight(0xffd8a0, 0.6);
    this.rimLight.position.set(-2, 1, -3);
    this.scene.add(this.rimLight);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;
  }

  async loadArtifact(index) {
    if (this._modelCacheRevision !== MODEL_ASSET_REVISION) {
      this.loadedModels.clear();
      this._modelCacheRevision = MODEL_ASSET_REVISION;
      console.log('[SceneManager] 模型资源已更新，清除 FBX 缓存');
    }

    this.currentIndex = index;
    const artifact = this.artifacts[index];

    this._resetModelGroupTransform();
    this._clearModelContainer();
    this._showLoading();

    if (this.loadedModels.has(artifact.id)) {
      const cached = this.loadedModels.get(artifact.id);
      const instance = cached.clone(true);
      this.modelContainer.add(instance);
      this._buildPointCloud(instance);
      this._frameToCenter();
      this._hideLoading();
      this.frameModel();
      logAtlasViewportDiagnostics('loadArtifact.cached', this);
      return artifact;
    }

    try {
      const fbx = await this._loadFBX(artifact.modelPath);
      console.log('[SceneManager] FBX 加载成功:', artifact.name, artifact.modelPath);
      const model = this._prepareModel(fbx, artifact);
      this.loadedModels.set(artifact.id, model);

      const instance = model.clone(true);
      this.modelContainer.add(instance);
      this._buildPointCloud(instance);
      this._frameToCenter();
      this._hideLoading();

      if (this.onModelLoaded) this.onModelLoaded(model, artifact);
      this.frameModel();
      logAtlasViewportDiagnostics('loadArtifact.fbx', this);
    } catch (err) {
      console.warn(`模型加载失败 [${artifact.name}]:`, err.message);
      const placeholder = createPlaceholderModel(artifact.id);
      this._fitGroupToContainer(placeholder);
      applyBronzePBRToModel(placeholder, this.envMap);
      this.loadedModels.set(artifact.id, placeholder);
      const instance = placeholder.clone(true);
      this.modelContainer.add(instance);
      this._buildPointCloud(instance);
      this._frameToCenter();
      this._hideLoading();
      this.frameModel();
      logAtlasViewportDiagnostics('loadArtifact.placeholder', this);
    }

    return artifact;
  }

  _loadFBX(path) {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      const url = path
        .split('/')
        .map((seg, i) => (i === 0 || seg === '' ? seg : encodeURIComponent(seg)))
        .join('/');
      loader.load(url, resolve, undefined, reject);
    });
  }

  _prepareModel(fbx, artifact) {
    const group = new THREE.Group();
    group.name = artifact.id;

    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.originalPosition = child.position.clone();
      child.userData.originalRotation = child.rotation.clone();
    });

    group.add(fbx);
    this._fitGroupToContainer(group);
    applyBronzePBRToModel(group, this.envMap);
    return group;
  }

  /** Box3 居中 + 缩放到合适尺寸 */
  _fitGroupToContainer(group) {
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    group.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
    group.scale.setScalar(scale);
    group.updateWorldMatrix(true, true);
  }

  /** 相机对准舞台正中央 */
  _frameToCenter() {
    this.modelContainer.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(this.modelContainer);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const dist = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.25;

    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 0, Math.max(dist, 2.2));
    this.camera.lookAt(0, 0, 0);
    this.controls.minDistance = dist * 0.45;
    this.controls.maxDistance = dist * 2.8;
    this.controls.update();
  }

  _clearModelContainer() {
    if (this.pointCloud) {
      if (this.pointCloud.points?.parent) {
        this.pointCloud.points.parent.remove(this.pointCloud.points);
      }
      const n = this.pointCloud.rnd?.length ?? 0;
      this.pointCloud.dispose();
      this.pointCloud = null;
      if (n > 0) console.log(`[SceneManager] 点云已销毁 (${n} 粒子)`);
    }
    while (this.modelContainer.children.length > 0) {
      const child = this.modelContainer.children[0];
      this.modelContainer.remove(child);
      this._disposeObject3D(child);
    }
  }

  _resetModelGroupTransform() {
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.modelGroup.scale.set(1, 1, 1);
  }

  _showLoading() {
    if (this.loadingEl) {
      this.loadingEl.hidden = false;
      this.loadingEl.classList.remove('fade-out');
    }
  }

  _hideLoading() {
    if (this.loadingEl) {
      this.loadingEl.classList.add('fade-out');
      setTimeout(() => {
        if (this.loadingEl) this.loadingEl.hidden = true;
      }, 320);
    }
  }

  _buildPointCloud(modelRoot) {
    if (this.pointCloud) {
      if (this.pointCloud.points?.parent) {
        this.pointCloud.points.parent.remove(this.pointCloud.points);
      }
      this.pointCloud.dispose();
    }

    const artifact = this.getCurrentArtifact();
    this.pointCloud = new PointCloudFromModel();
    const ok = this.pointCloud.buildFromModel(
      modelRoot,
      this.modelContainer,
      artifact?.id ?? 'default'
    );
    if (ok) {
      this.modelContainer.add(this.pointCloud.points);
      this.pointCloud.setDeconstructState('solid');
      this.pointCloud.logSceneAttachment(this.scene);

      // E. 相机距离诊断
      const box = new THREE.Box3().setFromObject(this.modelContainer);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const camDist = this.camera.position.distanceTo(this.controls.target);
      console.log('[SceneManager] 相机诊断', {
        cameraPos: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
        distance: camDist.toFixed(2),
        modelMaxDim: maxDim.toFixed(2),
        near: this.camera.near,
        far: this.camera.far,
        canSeeModel: camDist > maxDim * 0.5 && camDist < this.camera.far,
      });
    } else {
      console.error('[SceneManager] 点云构建失败，解构模式将无粒子显示');
    }
  }

  setMeshVisible(visible) {
    const model = this.getCurrentModel();
    if (!model) return;
    model.traverse((c) => {
      if (c.isMesh) c.visible = visible;
    });
    if (visible) {
      this.pointCloud?.setDeconstructState('solid');
    }
  }

  setParticlesVisible(visible) {
    if (!this.pointCloud) return;
    if (visible) {
      this.pointCloud.setDeconstructState('cloud');
    } else {
      this.pointCloud.setDeconstructState('solid');
    }
  }

  getCurrentModel() {
    for (const child of this.modelContainer.children) {
      if (child.name !== 'point-cloud-from-model') return child;
    }
    return null;
  }

  getCurrentArtifact() {
    return this.artifacts[this.currentIndex];
  }

  countPolygons() {
    let count = 0;
    this.modelContainer.traverse((child) => {
      if (!child.isMesh?.geometry) return;
      const geo = child.geometry;
      if (geo.index) count += geo.index.count / 3;
      else if (geo.attributes.position) count += geo.attributes.position.count / 3;
    });
    return Math.round(count);
  }

  getModelRotationDeg() {
    const y = this.modelGroup.rotation.y;
    const deg = ((y * 180) / Math.PI) % 360;
    return deg < 0 ? deg + 360 : deg;
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = enabled;
  }

  resize() {
    this._onResize();
  }

  _onResize() {
    const { width, height } = this._getStageSize();
    if (width < 2 || height < 2) {
      this._scheduleResizeRetry();
      return;
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    logAtlasViewportDiagnostics('resize', this);
  }

  /** 模型加载后调用，resize 时不再重置相机（避免 ResizeObserver 连发导致画面跳动/白屏） */
  frameModel() {
    this._frameToCenter();
    this.renderer.render(this.scene, this.camera);
  }

  _tickFpsMonitor() {
    const particles = this.pointCloud?.rnd?.length ?? 0;
    performanceMonitor.setParticleCount(particles);
    performanceMonitor.tickRender();
  }

  _startLoop() {
    this._running = true;
    resetAtlasRenderCounter();
    performanceMonitor.registerLoop('main');
    logAtlasViewportDiagnostics('startLoop', this);
    const tick = () => {
      if (!this._running) {
        performanceMonitor.unregisterLoop('main');
        return;
      }
      this._rafId = requestAnimationFrame(tick);
      performanceMonitor.tickLoop('main');
      const dt = this._clock.getDelta();
      for (const fn of this._frameListeners) {
        fn(dt);
      }
      this.pointCloud?.update(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      tickAtlasRenderDiagnostics(this);
      for (const fn of this._postFrameListeners) {
        fn(dt);
      }
      this._tickFpsMonitor();
    };
    tick();
  }

  _disposeMaterial(material) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      Object.values(mat).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      mat.dispose();
    });
  }

  _disposeObject3D(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) this._disposeMaterial(child.material);
    });
  }

  dispose() {
    this.stopLoop();
    releaseCanvasScene(this.canvas, this);
    this._resizeObserver?.disconnect();
    if (this._resizeRetryId != null) {
      cancelAnimationFrame(this._resizeRetryId);
      this._resizeRetryId = null;
    }
    window.removeEventListener('resize', this._onWindowResize);

    if (this.pointCloud) {
      if (this.pointCloud.points?.parent) {
        this.pointCloud.points.parent.remove(this.pointCloud.points);
      }
      this.pointCloud.dispose();
      this.pointCloud = null;
    }

    for (const model of this.loadedModels.values()) {
      this._disposeObject3D(model);
    }
    this.loadedModels.clear();

    this._clearModelContainer();
    this.scene?.clear();
    this.controls?.dispose();

    this.envMap?.dispose();
    this.envMap = null;

    this.renderer?.forceContextLoss?.();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
