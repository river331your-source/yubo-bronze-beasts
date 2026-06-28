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
    this.landingPage = document.getElementById('landing-page');
    this.mainPage = document.getElementById('main-page');
    this.enterBtn = document.getElementById('enter-btn');
    this.siteBrand = document.getElementById('site-brand');
    this.sectionAtlas = document.getElementById('section-atlas');
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
    this.onEnterMain = null;
    this.onLeaveMain = null;
    this.onNavSelect = null;
    this.currentSection = null;

    this.mainBody = this.mainPage.querySelector('.main-body');
    this.sectionPlaceholder = document.getElementById('section-placeholder');

    console.log('[UIController] init', {
      sectionAtlas: this.sectionAtlas,
      carousel: this.carousel,
      interactionPanel: this.interactionPanel,
    });

    this._bindEvents();
    this._buildCarousel();
  }

  _bindEvents() {
    this.enterBtn.addEventListener('click', async () => {
      await this.showMain();
      this.onEnterMain?.();
    });

    this.siteBrand?.addEventListener('click', () => this.showLanding());

    this.mainPage.querySelectorAll('.site-nav-item[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.nav;
        if (id === 'home') {
          this.showLanding();
        } else {
          this.onNavSelect?.(id);
        }
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
        if (!this.mainPage.classList.contains('active')) return;
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
    if (!this.carousel) {
      console.error('[UIController] #artifact-carousel 未找到');
      return;
    }
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

  showMain() {
    return new Promise((resolve) => {
      this.landingPage.classList.add('page-exit');
      setTimeout(() => {
        this.landingPage.classList.remove('active', 'page-exit');
        this.mainPage.classList.add('active', 'page-enter');
        requestAnimationFrame(() => {
          setTimeout(() => {
            this.mainPage.classList.remove('page-enter');
            resolve();
          }, 100);
        });
      }, 420);
    });
  }

  showLanding() {
    this.onLeaveMain?.();
    this.setSection(null);
    this.setActiveNav(null);
    this.mainPage.classList.add('page-exit');
    setTimeout(() => {
      this.mainPage.classList.remove('active', 'page-exit');
      this.landingPage.classList.add('active', 'page-enter');
      requestAnimationFrame(() => {
        setTimeout(() => this.landingPage.classList.remove('page-enter'), 600);
      });
    }, 420);
  }

  setSection(sectionId) {
    this.currentSection = sectionId;
    this.mainBody?.setAttribute('data-section', sectionId ?? 'none');

    const isAtlas = sectionId === 'atlas';
    const isPattern = sectionId === 'pattern';
    const isArtifact = ARTIFACT_SECTIONS.has(sectionId);

    this.sectionAtlas?.classList.toggle('section-hidden', !isArtifact);
    this.interactionPanel?.classList.toggle('section-hidden', !isAtlas);
    this.hidePlaceholder();

    if (isPlaceholderSection(sectionId)) {
      this.showPlaceholder(
        sectionId === 'craft' ? '青铜工艺' : '关于',
        sectionId === 'craft' ? 'BRONZE CRAFT' : 'ABOUT'
      );
    }

    const webgl = document.getElementById('webgl-canvas');
    const lineart = document.getElementById('pattern-lineart-canvas');

    if (isAtlas) {
      this.interactionHint.hidden = false;
      this.artifactInfo.hidden = false;
      webgl?.classList.remove('scene-hidden');
      lineart?.classList.remove('visible');
    } else if (isPattern) {
      this.interactionHint.hidden = false;
      this.interactionHint.textContent = INTERACTION_MODES.pattern.hint;
      this.artifactInfo.hidden = false;
      webgl?.classList.add('scene-hidden');
    } else {
      this.interactionHint.hidden = true;
      this.artifactInfo.hidden = true;
      this.materialTimeline.hidden = true;
      webgl?.classList.remove('scene-hidden');
      lineart?.classList.remove('visible');
    }

    console.log('[UIController] setSection', sectionId, {
      atlasVisible: !this.sectionAtlas?.classList.contains('section-hidden'),
      panelVisible: !this.interactionPanel?.classList.contains('section-hidden'),
    });
  }

  setActiveNav(navId) {
    this.mainPage.querySelectorAll('.site-nav-item[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', navId != null && btn.dataset.nav === navId);
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
    this.interactionPanel?.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.classList.toggle('active', card.dataset.mode === mode);
    });
    const config = INTERACTION_MODES[mode];
    if (config) {
      this.interactionHint.textContent = config.hint;
      this.interactionHint.hidden = false;
    }
    this.materialTimeline.hidden = mode !== 'material';
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
