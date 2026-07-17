/**
 * 全站版块路由 — 同一时刻仅一个版块活跃
 * 切换流程: 上一版块 onLeave → 更新 UI → 新版块 onEnter
 */
import { purgeStaleBronzeGates } from '../interactions/BronzeDoorGate.js';

export class AppRouter {
  constructor({ ui, sections }) {
    this.ui = ui;
    this.sections = sections;
    this.currentSection = null;
    this._busy = false;
  }

  async switchSection(sectionId) {
    purgeStaleBronzeGates();

    if (this._busy) return;
    if (!this.sections[sectionId]) return;

    // 再次点击当前导航（如图鉴→图鉴）时重置为解构模式，避免线稿层残留
    if (sectionId === this.currentSection) {
      if (sectionId === 'atlas') {
        this.ui.setMode('deconstruct');
        this.sections.atlas.switchMode?.('deconstruct');
      }
      this.ui.logSectionState('AppRouter.switchSection(same)');
      return;
    }

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

    this.ui.logSectionState(`AppRouter.switchSection→${sectionId}`);

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
