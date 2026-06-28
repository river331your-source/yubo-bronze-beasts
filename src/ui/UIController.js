import {
  ARTIFACTS,
  DEFAULT_ARTIFACT_INDEX,
  INTERACTION_MODES,
} from '../data/artifacts.js';

const GESTURE_LABELS = {
  none: '未检测到手势',
  fist: '握拳 — 完整形态',
  open: '张开 — 考古解构',
  ok: '👌 手电筒已开启',
  point: '食指指向',
  unknown: '识别中…',
};

const ARTIFACT_SECTIONS = new Set(['atlas', 'pattern']);

export class UIController {
  constructor() {
    this.mainPage = document.getElementById('main-page');
    this.enterBtn = document.getElementById('enter-btn');
    this.siteBrand = document.getElementById('site-brand');
    this.sectionHome = document.getElementById('section-home');
    this.artifactNav = document.getElementById('artifact-nav');
    this.stageColumn = document.getElementById('stage-column');
    this.sectionAtlas = document.getElementById('section-atlas');
    this.sectionPattern = document.getElementById('section-pattern');
    this.webglCanvas = document.getElementById('webgl-canvas');
    this.lineartCanvas = document.getElementById('pattern-lineart-canvas');
    this.carousel = document.getElementById('artifact-carousel');
    this.interactionPanel = document.getElementById('interaction-panel');
    this.artifactInfo = document.getElementById('artifact-info');
    this.interactionHint = document.getElementById('interaction-hint');
    this.materialTimeline = document.getElementById('material-timeline');
    this.materialSlider = document.getElementById('material-restore-slider');
    this.materialStageLabel = document.getElementById('material-stage-label');
    this.gestureLabel = document.getElementById('gesture-label');
    this.gestureStatus = document.getElementById('gesture-status');
    this.gestureDot = document.querySelector('.gesture-dot');

    this.currentMode = 'deconstruct';
    this.currentArtifactIndex = DEFAULT_ARTIFACT_INDEX;
    this.onModeChange = null;
    this.onArtifactSelect = null;
    this.onNavSelect = null;
    this.currentSection = 'home';

    this.mainBody = this.mainPage.querySelector('.main-body');
    this.sectionPlaceholder = document.getElementById('section-placeholder');

    this._bindEvents();
    this._buildCarousel();
  }

  _bindEvents() {
    this.siteBrand?.addEventListener('click', () => this.onNavSelect?.('home'));

    this.mainPage.querySelectorAll('.site-nav-item[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onNavSelect?.(btn.dataset.nav);
      });
    });

    this.interactionPanel?.addEventListener('click', (e) => {
      const card = e.target.closest('.mode-card[data-mode]');
      if (!card) return;
      this.setMode(card.dataset.mode);
    });

    this.mainPage.addEventListener(
      'wheel',
      (e) => {
        if (!ARTIFACT_SECTIONS.has(this.currentSection)) return;
        if (Math.abs(e.deltaY) < 20) return;
        e.preventDefault();
        const next =
          e.deltaY > 0
            ? Math.min(ARTIFACTS.length - 1, this.currentArtifactIndex + 1)
            : Math.max(0, this.currentArtifactIndex - 1);
        if (next !== this.currentArtifactIndex) {
          this.selectArtifact(next);
        }
      },
      { passive: false }
    );
  }

  _buildCarousel() {
    if (!this.carousel) return;
    ARTIFACTS.forEach((artifact, index) => {
      const item = document.createElement('button');
      item.className = `arc-node${index === DEFAULT_ARTIFACT_INDEX ? ' active' : ''}`;
      item.type = 'button';
      item.dataset.index = index;
      item.dataset.pos = index;
      item.innerHTML = `
        <span class="arc-dot"></span>
        <span class="arc-label">
          <span class="arc-name">${artifact.name}</span>
          <span class="arc-era">（${artifact.era}）</span>
        </span>
      `;
      item.addEventListener('click', () => this.selectArtifact(index));
      this.carousel.appendChild(item);
    });
  }

  /** 切换版块可见性（由 AppRouter 调用） */
  setSection(sectionId) {
    this.currentSection = sectionId;
    this.mainBody?.setAttribute('data-section', sectionId);

    const isHome = sectionId === 'home';
    const isAtlas = sectionId === 'atlas';
    const isPattern = sectionId === 'pattern';
    const isArtifact = ARTIFACT_SECTIONS.has(sectionId);

    this.sectionHome?.classList.toggle('section-hidden', !isHome);
    this.artifactNav?.classList.toggle('section-hidden', !isArtifact);
    this.stageColumn?.classList.toggle('section-hidden', !isArtifact);
    this.interactionPanel?.classList.toggle('section-hidden', !isAtlas);
    this.hidePlaceholder();

    if (isPlaceholderSection(sectionId)) {
      this.showPlaceholder(
        sectionId === 'craft' ? '青铜工艺' : '关于',
        sectionId === 'craft' ? 'BRONZE CRAFT' : 'ABOUT'
      );
    }

    if (isHome || isPlaceholderSection(sectionId)) {
      this._hideAllArtifactStages();
      this.interactionHint.hidden = true;
      this.artifactInfo.hidden = true;
      this.materialTimeline.hidden = true;
      this.showGestureUI(false);
    } else if (isAtlas) {
      this.currentMode = 'deconstruct';
      this._applyModeHint('deconstruct');
      this.interactionHint.hidden = false;
      this.artifactInfo.hidden = false;
      this.materialTimeline.hidden = true;
      this._syncArtifactStages();
      this._resetModeCards('deconstruct');
    } else if (isPattern) {
      this._applyModeHint('pattern');
      this.interactionHint.hidden = false;
      this.artifactInfo.hidden = false;
      this.materialTimeline.hidden = true;
      this._syncArtifactStages();
    }

    this.logSectionState('setSection');
  }

  /**
   * 同步图鉴 WebGL 层与纹样线稿层的显示
   * - 神兽图鉴导航：默认 WebGL；切到「纹样探秘」模式卡时显示线稿
   * - 纹样探秘导航：仅线稿层
   */
  syncArtifactStages() {
    this._syncArtifactStages();
    this.logSectionState('syncArtifactStages');
  }

  _syncArtifactStages() {
    const isAtlas = this.currentSection === 'atlas';
    const isPatternNav = this.currentSection === 'pattern';
    const atlasPatternMode = isAtlas && this.currentMode === 'pattern';

    const showWebgl = isAtlas && !atlasPatternMode;
    const showLineart = isPatternNav || atlasPatternMode;

    this.sectionAtlas?.classList.toggle('section-hidden', !showWebgl);
    this.sectionPattern?.classList.toggle('section-hidden', !showLineart);

    // 清理旧版 class 泄漏（opacity 叠层曾导致白屏）
    this.webglCanvas?.classList.remove('scene-hidden');
    this.lineartCanvas?.classList.remove('visible');
  }

  /** 离开文物相关版块时彻底隐藏两层舞台 */
  hideAllArtifactStages() {
    this._hideAllArtifactStages();
  }

  _hideAllArtifactStages() {
    this.sectionAtlas?.classList.add('section-hidden');
    this.sectionPattern?.classList.add('section-hidden');
    this.webglCanvas?.classList.remove('scene-hidden');
    this.lineartCanvas?.classList.remove('visible');
  }

  _applyModeHint(mode) {
    const config = INTERACTION_MODES[mode];
    if (config && this.interactionHint) {
      this.interactionHint.textContent = config.hint;
    }
  }

  _resetModeCards(mode) {
    this.interactionPanel?.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.classList.toggle('active', card.dataset.mode === mode);
    });
  }

  /** 调试：打印当前版块与各容器 display 状态 */
  logSectionState(source = 'manual') {
    const cs = (el) => (el ? getComputedStyle(el).display : 'missing');
    console.log(`[版块隔离] ${source}`, {
      currentSection: this.currentSection,
      currentMode: this.currentMode,
      '#section-atlas': cs(this.sectionAtlas),
      '#section-pattern': cs(this.sectionPattern),
      '#stage-column': cs(this.stageColumn),
      '#artifact-nav': cs(this.artifactNav),
      '#interaction-panel': cs(this.interactionPanel),
      hint: this.interactionHint?.textContent?.slice(0, 24),
    });
  }

  setActiveNav(navId) {
    this.mainPage.querySelectorAll('.site-nav-item[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === navId);
    });
  }

  showPlaceholder(title, subtitle) {
    if (!this.sectionPlaceholder) return;
    this.sectionPlaceholder.querySelector('.section-placeholder-zh').textContent = title;
    this.sectionPlaceholder.querySelector('.section-placeholder-en').textContent = subtitle;
    this.sectionPlaceholder.hidden = false;
    this.sectionPlaceholder.classList.add('visible');
  }

  hidePlaceholder() {
    if (!this.sectionPlaceholder) return;
    this.sectionPlaceholder.hidden = true;
    this.sectionPlaceholder.classList.remove('visible');
  }

  setMode(mode) {
    this.currentMode = mode;
    this._resetModeCards(mode);
    const config = INTERACTION_MODES[mode];
    if (config) {
      this._applyModeHint(mode);
      this.interactionHint.hidden = false;
    }
    this.materialTimeline.hidden = mode !== 'material';

    if (this.currentSection === 'atlas') {
      this._syncArtifactStages();
    }

    this.onModeChange?.(mode);
  }

  selectArtifact(index) {
    this.currentArtifactIndex = index;
    this.carousel?.querySelectorAll('.arc-node').forEach((item, i) => {
      item.classList.toggle('active', i === index);
      item.classList.toggle('loading', i === index && item.dataset.loading === 'true');
    });
    this.onArtifactSelect?.(index);
  }

  setArtifactLoading(index, loading) {
    const item = this.carousel?.querySelector(`[data-index="${index}"]`);
    if (item) {
      item.dataset.loading = loading ? 'true' : 'false';
      item.classList.toggle('loading', loading);
    }
  }

  updateArtifactInfo(artifact) {
    if (!this.artifactInfo) return;
    this.artifactInfo.querySelector('.artifact-name').textContent = artifact.name;
    this.artifactInfo.querySelector('.artifact-meta').textContent =
      `${artifact.era} · ${artifact.excavated}`;
  }

  showGestureUI(show) {
    if (this.gestureStatus) this.gestureStatus.hidden = !show;
    const pip = document.getElementById('camera-pip');
    const feed = document.getElementById('camera-feed');
    if (pip) pip.classList.toggle('visible', show);
    if (feed) feed.classList.toggle('visible', show);
  }

  updateGestureLabel(gesture) {
    this.gestureLabel.textContent = GESTURE_LABELS[gesture] ?? gesture;
    this.gestureDot.classList.toggle('active', gesture !== 'none');
  }

  showMaterialTimeline(show) {
    this.materialTimeline.hidden = !show;
  }

  updateMaterialRestoreUI(factor) {
    const pct = Math.round(factor * 100);
    const stage = this._getRestoreStageLabel(factor);
    if (this.materialStageLabel) {
      this.materialStageLabel.textContent = `${stage}  ${pct}%`;
    }
  }

  _getRestoreStageLabel(factor) {
    if (factor < 0.15) return '出土现状·青绿铜锈';
    if (factor < 0.55) return '锈色消退·铜质显现';
    if (factor < 0.9) return '渐复本色·吉金初现';
    return '初铸之态·灿若黄金';
  }
}

function isPlaceholderSection(sectionId) {
  return sectionId === 'craft' || sectionId === 'story';
}
