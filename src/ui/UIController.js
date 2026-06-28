import {
  ARTIFACTS,
  DEFAULT_ARTIFACT_INDEX,
  INTERACTION_MODES,
} from '../data/artifacts.js';
import relics from '../data/relics.json';
import {
  bindRelicSilhouetteFallback,
  resolvePublicAsset,
} from './relicSilhouetteFallback.js';

const GESTURE_LABELS = {
  none: '未检测到手势',
  fist: '握拳 · 聚合',
  archaeology: '手势A · 考古解构',
  dissolve: '手势B · 粒子消散',
  transition: 'A→B 过渡',
  two_hands: '双手 · 拍手切件',
  clap: '拍手 · 切换文物',
  ok: '👌 手电筒已开启',
  point: '食指指向',
  unknown: '识别中…',
};


export class UIController {
  constructor() {
    this.mainPage = document.getElementById('main-page');
    this.enterBtn = document.getElementById('enter-btn');
    this.siteBrand = document.getElementById('site-brand');
    this.sectionHome = document.getElementById('section-home');
    this.artifactNav = document.getElementById('artifact-nav');
    this.stageColumn = document.getElementById('stage-column');
    this.sectionAtlas = document.getElementById('section-atlas');
    this.atlasViewport = document.getElementById('atlas-viewport');
    this.sectionPattern = document.getElementById('section-pattern');
    this.webglCanvas = document.getElementById('webgl-canvas');
    this.lineartCanvas = document.getElementById('pattern-lineart-canvas');
    this.carousel = document.getElementById('artifact-carousel');
    this.artifactPrevBtn = document.getElementById('artifact-prev-btn');
    this.interactionPanel = document.getElementById('interaction-panel');
    this.artifactInfo = document.getElementById('artifact-info');
    this.interactionHint = document.getElementById('interaction-hint');
    this.materialTimeline = document.getElementById('material-timeline');
    this.materialSlider = document.getElementById('material-restore-slider');
    this.materialStageLabel = document.getElementById('material-stage-label');
    this.gestureLabel = document.getElementById('gesture-label');
    this.gestureStatus = document.getElementById('gesture-status');
    this.gestureDot = document.querySelector('.gesture-dot');
    this.clapFlash = document.getElementById('clap-flash');

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
      const mode = card.dataset.mode;
      // 纹样探秘独立导航：不在图鉴内叠线稿层，直接切版块
      if (mode === 'pattern') {
        this.onNavSelect?.('pattern');
        return;
      }
      this.setMode(mode);
    });

    this.artifactPrevBtn?.addEventListener('click', () => this.selectPrevArtifact());

    this.mainPage.addEventListener(
      'wheel',
      (e) => {
        if (this.currentSection !== 'atlas') return;
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
      const relic = relics[artifact.id] ?? {};
      const name = relic.name ?? artifact.name;
      const era = relic.era ?? artifact.era;
      const thumbnail = resolvePublicAsset(relic.thumbnail ?? '');

      const item = document.createElement('button');
      item.className = `arc-node${index === DEFAULT_ARTIFACT_INDEX ? ' active' : ''}`;
      item.type = 'button';
      item.dataset.index = String(index);
      item.dataset.pos = String(index);
      item.innerHTML = `
        <span class="arc-dot" aria-hidden="true"></span>
        <span class="arc-node-body">
          <img
            class="arc-silhouette"
            src="${thumbnail}"
            alt=""
            decoding="async"
            draggable="false"
          />
          <span class="arc-label">
            <span class="arc-name">${name}</span>
            <span class="arc-era">${era}</span>
          </span>
        </span>
      `;
      item.addEventListener('click', () => this.selectArtifact(index));
      const silhouette = item.querySelector('.arc-silhouette');
      if (silhouette) {
        bindRelicSilhouetteFallback(silhouette, { id: artifact.id, src: thumbnail });
      }
      this.carousel.appendChild(item);
    });
  }

  /** 切换版块可见性（由 AppRouter 调用） */
  setSection(sectionId) {
    // 先全部隐藏舞台层，再只打开目标版块（根治残留）
    this._hideAllArtifactStages();

    this.currentSection = sectionId;
    this.mainBody?.setAttribute('data-section', sectionId);

    const isHome = sectionId === 'home';
    const isAtlas = sectionId === 'atlas';
    const isPattern = sectionId === 'pattern';
    const isArtifactStage = isAtlas || isPattern;

    this.sectionHome?.classList.toggle('section-hidden', !isHome);
    this.stageColumn?.classList.toggle('section-hidden', !isArtifactStage);
    this.hidePlaceholder();

    if (isPlaceholderSection(sectionId)) {
      this.showPlaceholder(
        sectionId === 'craft' ? '青铜工艺' : '关于',
        sectionId === 'craft' ? 'BRONZE CRAFT' : 'ABOUT'
      );
    }

    if (isHome || isPlaceholderSection(sectionId)) {
      this.interactionHint.hidden = true;
      this.artifactInfo.hidden = true;
      this.materialTimeline.hidden = true;
      this.showGestureUI(false);
    } else if (isAtlas) {
      this.currentMode = 'deconstruct';
      this._applySectionHint('atlas', 'deconstruct');
      this.interactionHint.hidden = false;
      this.artifactInfo.hidden = false;
      this.materialTimeline.hidden = true;
      this._syncArtifactStages();
      this._resetModeCards('deconstruct');
    } else if (isPattern) {
      this._applySectionHint('pattern');
      this.interactionHint.hidden = false;
      this.artifactInfo.hidden = true;
      this.materialTimeline.hidden = true;
      this._syncArtifactStages();
    }

    this.logSectionState('setSection');
  }

  /**
   * 同步图鉴 WebGL 与纹样线稿层 — 严格按顶部导航隔离，不混用
   * - 神兽图鉴：仅 #section-atlas + #atlas-viewport（粒子/WebGL）
   * - 纹样探秘：仅 #section-pattern（线稿）
   */
  syncArtifactStages() {
    this._syncArtifactStages();
    this.logSectionState('syncArtifactStages');
  }

  _syncArtifactStages() {
    const isAtlas = this.currentSection === 'atlas';
    const isPatternNav = this.currentSection === 'pattern';

    this.sectionAtlas?.classList.toggle('section-hidden', !isAtlas);
    this.atlasViewport?.classList.toggle('section-hidden', !isAtlas);
    this.sectionPattern?.classList.toggle('section-hidden', !isPatternNav);

    if (!isPatternNav) {
      this._clearLineartCanvas();
    }

    this.webglCanvas?.classList.remove('scene-hidden');
    this.lineartCanvas?.classList.remove('visible');
  }

  /** 离开文物相关版块时彻底隐藏两层舞台 */
  hideAllArtifactStages() {
    this._hideAllArtifactStages();
  }

  _hideAllArtifactStages() {
    this.sectionAtlas?.classList.add('section-hidden');
    this.atlasViewport?.classList.add('section-hidden');
    this.sectionPattern?.classList.add('section-hidden');
    this._clearLineartCanvas();
    this.webglCanvas?.classList.remove('scene-hidden');
    this.lineartCanvas?.classList.remove('visible');
  }

  _clearLineartCanvas() {
    const canvas = this.lineartCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return;
    ctx.fillStyle = '#070A08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** 提示语归属版块：atlas 用手势提示，pattern 用手电提示 */
  _applySectionHint(section, mode = null) {
    if (!this.interactionHint) return;
    const hintMode =
      section === 'atlas' ? mode ?? this.currentMode : 'pattern';
    const config = INTERACTION_MODES[hintMode];
    if (config) {
      this.interactionHint.textContent = config.hint;
      this.interactionHint.dataset.hintSection = section;
    }
  }

  _applyModeHint(mode) {
    if (this.currentSection === 'atlas') {
      this._applySectionHint('atlas', mode);
    } else if (this.currentSection === 'pattern') {
      this._applySectionHint('pattern');
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
    const vis = (el) =>
      el ? el.classList.contains('section-hidden') : 'missing';
    console.log(`[版块隔离] ${source}`, {
      currentSection: this.currentSection,
      currentMode: this.currentMode,
      hintSection: this.interactionHint?.dataset.hintSection ?? 'unset',
      hintPreview: this.interactionHint?.textContent?.slice(0, 28),
      '#section-atlas': cs(this.sectionAtlas),
      '#section-atlas.hidden': vis(this.sectionAtlas),
      '#atlas-viewport': cs(this.atlasViewport),
      '#atlas-viewport.hidden': vis(this.atlasViewport),
      '#section-pattern': cs(this.sectionPattern),
      '#section-pattern.hidden': vis(this.sectionPattern),
      '#stage-column': cs(this.stageColumn),
      bothStagesVisible:
        !this.sectionAtlas?.classList.contains('section-hidden') &&
        !this.sectionPattern?.classList.contains('section-hidden'),
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
    if (mode === 'pattern') {
      this.onNavSelect?.('pattern');
      return;
    }
    if (this.currentSection !== 'atlas') return;

    this.currentMode = mode;
    this._resetModeCards(mode);
    const config = INTERACTION_MODES[mode];
    if (config) {
      this._applySectionHint('atlas', mode);
      this.interactionHint.hidden = false;
    }
    this.materialTimeline.hidden = mode !== 'material';
    this._syncArtifactStages();
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

  /** 圆形按钮：切换到上一件（循环） */
  selectPrevArtifact() {
    const prev = (this.currentArtifactIndex - 1 + ARTIFACTS.length) % ARTIFACTS.length;
    this.selectArtifact(prev);
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

  /** 解构模式调试：显示 A/B/握拳/双手/拍手 状态（每帧更新） */
  updateGestureDebugLabel(text) {
    if (this.gestureLabel) {
      this.gestureLabel.textContent = text;
      this.gestureDot.classList.toggle('active', text !== '未检测到手势' && text !== '等待手势…');
    }
  }

  /** 拍手切换文物：屏幕白光快闪反馈 */
  playClapFlash() {
    const el = this.clapFlash;
    if (!el) return;
    el.classList.remove('fade');
    el.classList.add('active');
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        el.classList.add('fade');
        el.classList.remove('active');
        window.setTimeout(() => el.classList.remove('fade'), 380);
      }, 70);
    });
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
