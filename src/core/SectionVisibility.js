/**
 * 版块可见性 — 唯一入口，避免多处 toggle 打架
 * 规则：先全部隐藏，再只显示目标；图鉴/纹样 DOM 完全独立
 */
export class SectionVisibility {
  /** @param {import('../ui/UIController.js').UIController} ui */
  constructor(ui) {
    this.ui = ui;
  }

  clearLineart() {
    const canvas = this.ui.lineartCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return;
    ctx.fillStyle = '#070A08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** 隐藏所有舞台层（图鉴 shell + 纹样层） */
  hideAllStages() {
    this.ui.sectionAtlas?.classList.add('section-hidden');
    this.ui.sectionPattern?.classList.add('section-hidden');
    this.clearLineart();
  }

  /**
   * @param {'atlas'|'pattern'|null} stage  null = 仅隐藏，不显示任何舞台层
   */
  showStage(stage) {
    this.hideAllStages();
    if (stage === 'atlas') {
      this.ui.sectionAtlas?.classList.remove('section-hidden');
    } else if (stage === 'pattern') {
      this.ui.sectionPattern?.classList.remove('section-hidden');
    }
  }
}
