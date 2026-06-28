/**
 * 站点版块路由：同一时刻仅一个版块 mounted
 * 切换前先 unmount 上一版块，避免 rAF / WebGL / 摄像头冲突
 */
export class AppRouter {
  constructor({ ui, sections }) {
    this.ui = ui;
    this.sections = sections;
    this.currentSection = null;
    this._busy = false;
  }

  async enterSite(sectionId = 'atlas') {
    await this.switchSection(sectionId);
  }

  async leaveSite() {
    await this.switchSection(null);
  }

  async switchSection(sectionId) {
    if (this._busy || sectionId === this.currentSection) return;
    this._busy = true;

    const prev = this.currentSection;
    if (prev && this.sections[prev]) {
      this.sections[prev].stop();
    }

    this.currentSection = sectionId;

    if (sectionId) {
      this.ui.setSection(sectionId);
      this.ui.setActiveNav(sectionId);
      await this.sections[sectionId].start();
      history.replaceState(null, '', `#/${sectionId}`);
    } else {
      this.ui.setSection(null);
      this.ui.setActiveNav(null);
      history.replaceState(null, '', location.pathname + location.search);
    }

    this._busy = false;
  }

  loadArtifact(index) {
    const section = this.currentSection;
    this.sections[section]?.loadArtifact?.(index);
  }

  switchMode(mode) {
    if (this.currentSection === 'atlas') {
      this.sections.atlas.switchMode(mode);
    }
  }
}
