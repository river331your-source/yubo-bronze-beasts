import './style.css';
import { performanceMonitor } from './debug/PerformanceMonitor.js';
import { stopMainLoop } from './core/FrameLoop.js';
import { UIController } from './ui/UIController.js';
import { AppRouter } from './core/AppRouter.js';
import { HomeSection } from './sections/HomeSection.js';
import { AtlasSection } from './sections/AtlasSection.js';
import { PatternSection } from './sections/PatternSection.js';
import { PlaceholderSection } from './sections/PlaceholderSection.js';
import { preloadTaotieGold } from './interactions/BronzeDoorGate.js';

const SECTION_IDS = ['home', 'atlas', 'pattern', 'craft', 'story'];

class App {
  constructor() {
    this.ui = new UIController();
    const homeSection = new HomeSection({
      enterBtn: document.getElementById('enter-btn'),
    });
    this.router = new AppRouter({
      ui: this.ui,
      sections: {
        home: homeSection,
        atlas: new AtlasSection({
          canvas: document.getElementById('webgl-canvas'),
          videoEl: document.getElementById('camera-feed'),
          ui: this.ui,
        }),
        pattern: new PatternSection({
          torchStage: document.getElementById('pattern-torch-stage'),
          sideSwitcher: document.getElementById('pattern-side-switcher'),
          videoEl: document.getElementById('camera-feed'),
          ui: this.ui,
        }),
        craft: new PlaceholderSection({
          ui: this.ui,
          title: '青铜工艺',
          subtitle: 'BRONZE CRAFT',
        }),
        story: new PlaceholderSection({
          ui: this.ui,
          title: '关于',
          subtitle: 'ABOUT',
        }),
      },
    });
    homeSection.router = this.router;
  }

  async init() {
    if (!document.getElementById('app') || !document.getElementById('main-page')) {
      console.error('[App] DOM 结构缺失 — 请硬刷新页面（Ctrl+Shift+R）');
      return;
    }

    performanceMonitor.init();
    preloadTaotieGold();
    this.ui.onNavSelect = (id) => this.router.switchSection(id);
    this.ui.onArtifactSelect = (index) => this.router.loadArtifact(index);
    this.ui.onModeChange = (mode) => this.router.switchMode(mode);
    this.ui.onCameraRetry = () => {
      const s = this.router.currentSection;
      if (s === 'atlas') this.router.sections.atlas?._initGestureAsync?.();
      else if (s === 'pattern') this.router.sections.pattern?._initGestureAsync?.();
    };
    this.ui.onTouchAction = (action) => {
      if (this.router.currentSection === 'atlas') this.router.sections.atlas?.handleTouchAction?.(action);
    };
    this._bindOrientationGate();

    // 每次刷新/冷启动一律从首页入场（青铜门仪式），不按 hash 直达展厅
    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    await this.router.switchSection('home');

    window.addEventListener('hashchange', this._onHashChange);
  }

  _onHashChange = () => {
    const id = location.hash.replace(/^#\/?/, '') || 'home';
    if (SECTION_IDS.includes(id) && id !== this.router.currentSection) {
      this.router.switchSection(id);
    }
  };

  _bindOrientationGate() {
    // 比赛手机版：竖屏完整可玩，orientation-gate 永不显示；
    // 横竖屏切换仅由 CSS responsive layout 承担，不阻止运行、不重复初始化。
    this.ui.setOrientationGate(false);
  }

  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
    stopMainLoop();
    const section = this.router?.currentSection;
    if (section && this.router.sections[section]) {
      this.router.sections[section].onLeave?.();
    }
    this.router.sections.atlas?.dispose?.();
    this.router.currentSection = null;
    performanceMonitor.dispose();
  }
}

let app = null;

async function bootstrap() {
  try {
    app?.destroy();
    app = new App();
    await app.init();
  } catch (err) {
    console.error('[App] 初始化失败:', err);
  }
}

bootstrap();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app?.destroy();
    app = null;
  });
}
