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
    const gold = this.ui.patternTorchStage?.querySelector('.pattern-lineart--gold');
    gold?.classList.remove('pattern-lineart--lit');
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
