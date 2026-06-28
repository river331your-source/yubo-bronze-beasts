import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { getViewportSize } from '../utils/viewport.js';
import { createPlaceholderModel } from './PlaceholderFactory.js';
import { PointCloudFromModel } from './PointCloudFromModel.js';
import { loadSceneEnvironment } from './EnvironmentLoader.js';
import { applyBronzePBRToModel } from './BronzePBRMaterial.js';

const TARGET_SIZE = 3;

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.loadingEl = document.getElementById('model-loading');
    this.artifacts = ARTIFACTS;
    this.currentIndex = 0;
    this.modelGroup = new THREE.Group();
    this.modelContainer = new THREE.Group();
    this.modelContainer.name = 'model-container';
    this.modelGroup.add(this.modelContainer);
    this.loadedModels = new Map();
    this.onModelLoaded = null;
    this.pointCloud = null;
    this.envMap = null;
    this.envSource = null;

    this._initScene();
    this._initLights();
    this._initControls();
    this._initEnvironment();
    this._clock = new THREE.Clock();
    this._fpsFrames = 0;
    this._fpsLast = performance.now();
    this._running = false;
    this._rafId = null;
    this._onWindowResize = () => this._onResize();
    this._startLoop();
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
    this.renderer.setSize(width, height);
    // PBR 色彩管理：sRGB 输出 + ACES 色调映射，金属高光与色彩更准确
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.add(this.modelGroup);

    const stage =
      this.canvas.closest('#atlas-viewport') ??
      this.canvas.closest('#stage-column') ??
      this.canvas.parentElement;
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    if (stage) this._resizeObserver.observe(stage);
    window.addEventListener('resize', this._onWindowResize);
  }

  _getStageSize() {
    const viewport = this.canvas.parentElement;
    const column = this.canvas.closest('#stage-column');
    const el =
      viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0
        ? viewport
        : column ?? viewport;
    if (!el) return getViewportSize();
    return {
      width: Math.max(1, el.clientWidth),
      height: Math.max(1, el.clientHeight),
    };
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
    // 切换文物：销毁旧点云，仅保留当前选中文物的粒子
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
      this.modelContainer.remove(this.modelContainer.children[0]);
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
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this._frameToCenter();
  }

  _tickFpsMonitor() {
    this._fpsFrames += 1;
    const now = performance.now();
    const elapsed = now - this._fpsLast;
    if (elapsed < 2000) return;
    const fps = (this._fpsFrames * 1000) / elapsed;
    const particles = this.pointCloud?.rnd?.length ?? 0;
    console.log(
      `[FPS] ${fps.toFixed(1)} fps | 粒子 ${particles}${particles >= 30000 ? ' (高密度)' : ''}`
    );
    this._fpsFrames = 0;
    this._fpsLast = now;
  }

  _startLoop() {
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this._rafId = requestAnimationFrame(tick);
      const dt = this._clock.getDelta();
      this.pointCloud?.update(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
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
    this._running = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this._resizeObserver?.disconnect();
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
