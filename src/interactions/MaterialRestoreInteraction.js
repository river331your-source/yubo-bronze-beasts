import { createMaterialRestoreShader } from '../scene/MaterialRestoreShader.js';

/**
 * 材质还原：时间轴滑块控制 uRestore（0~1）
 * GPU 实时混合出土锈绿态 ⇄ 初铸吉金态（颜色 + 锈迹 + 高光三层同步）
 */
export class MaterialRestoreInteraction {
  constructor(sceneManager, ui) {
    this.sceneManager = sceneManager;
    this.ui = ui;
    this.active = false;
    this.restoreProgress = 0;

    this.shaderMaterial = createMaterialRestoreShader();
    /** @type {Map<string, THREE.Material|THREE.Material[]>} */
    this._savedMaterials = new Map();

    this._onSliderInput = (e) => {
      if (!this.active) return;
      const v = parseInt(e.target.value, 10) / 100;
      this.setRestore(v);
    };

    this.ui.materialSlider?.addEventListener('input', this._onSliderInput);
  }

  activate() {
    this.active = true;
    this.sceneManager.setAutoRotate(true);
    this.sceneManager.pointCloud?.setSimulationPaused(true);
    this.sceneManager.setParticlesVisible(false);
    this.sceneManager.setMeshVisible(true);
    this._applyShaderMaterials();
    this.ui.showMaterialTimeline(true);

    const slider = this.ui.materialSlider;
    if (slider) slider.value = String(Math.round(this.restoreProgress * 100));
    this.setRestore(this.restoreProgress);
  }

  deactivate() {
    this.active = false;
    this.sceneManager.pointCloud?.setSimulationPaused(false);
    this._restoreOriginalMaterials();
    this.ui.showMaterialTimeline(false);
    this.sceneManager.setMeshVisible(false);
    this.sceneManager.setParticlesVisible(true);
  }

  /** 滑块 / 手势共用：设置还原进度 0~1 */
  setRestore(factor) {
    this.restoreProgress = Math.max(0, Math.min(1, factor));
    this.shaderMaterial.uniforms.uRestore.value = this.restoreProgress;
    this.ui.updateMaterialRestoreUI(this.restoreProgress);
  }

  /** 可选：双手距离控制（与滑块二选一或并存） */
  onHandsDistance(distance) {
    if (!this.active) return;
    this.setRestore(distance);
    const slider = this.ui.materialSlider;
    if (slider) slider.value = String(Math.round(this.restoreProgress * 100));
  }

  /** 每帧更新主光方向 */
  update() {
    if (!this.active) return;
    const light = this.sceneManager.keyLight;
    if (!light) return;
    this.shaderMaterial.uniforms.uLightDir.value
      .copy(light.position)
      .normalize();
  }

  _applyShaderMaterials() {
    this._restoreOriginalMaterials();
    const model = this.sceneManager.getCurrentModel();
    if (!model) return;

    model.traverse((child) => {
      if (!child.isMesh) return;
      this._savedMaterials.set(child.uuid, child.material);
      child.material = this.shaderMaterial;
    });
  }

  _restoreOriginalMaterials() {
    const model = this.sceneManager.getCurrentModel();
    if (!model) {
      this._savedMaterials.clear();
      return;
    }

    model.traverse((child) => {
      if (!child.isMesh) return;
      const orig = this._savedMaterials.get(child.uuid);
      if (orig) child.material = orig;
    });
    this._savedMaterials.clear();
  }

  dispose() {
    this.deactivate();
    this.ui.materialSlider?.removeEventListener('input', this._onSliderInput);
    this.shaderMaterial?.dispose?.();
  }
}
