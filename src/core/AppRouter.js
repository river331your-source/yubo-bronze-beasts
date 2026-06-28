/**
 * 全站版块路由 — 同一时刻仅一个版块活跃
 * 切换流程: 上一版块 onLeave → 更新 UI → 新版块 onEnter
 */
export class AppRouter {
  constructor({ ui, sections }) {
    this.ui = ui;
    this.sections = sections;
    this.currentSection = null;
    this._busy = false;
  }

  async switchSection(sectionId) {
    if (this._busy || sectionId === this.currentSection) return;
    if (!this.sections[sectionId]) return;
    this._busy = true;

    const prev = this.currentSection;
    if (prev && this.sections[prev]) {
      this.sections[prev].onLeave?.();
    }

    this.currentSection = sectionId;
    this.ui.setSection(sectionId);
    this.ui.setActiveNav(sectionId);
    this.ui.logSectionState('AppRouter.switchSection');

    await this.sections[sectionId].onEnter?.();

    const hash = sectionId === 'home' ? '' : `#/${sectionId}`;
    history.replaceState(null, '', location.pathname + location.search + hash);

    this._busy = false;
  }

  loadArtifact(index) {
    this.sections[this.currentSection]?.loadArtifact?.(index);
  }

  switchMode(mode) {
    if (this.currentSection === 'atlas') {
      this.sections.atlas.switchMode(mode);
    }
  }
}
