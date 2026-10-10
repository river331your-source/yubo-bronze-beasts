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
import { isMobilePortrait } from './utils/deviceProfile.js';
import { flushDeferredHeavyInit } from './utils/heavyInitGate.js';

const SECTION_IDS = ['home', 'atlas', 'pattern', 'craft', 'story'];

/** 真实可视高度：iPhone Safari 地址栏/工具栏会吃掉 100vh */
function syncVisualViewportHeight() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height || window.innerHeight);
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
  if (new URLSearchParams(location.search).has('vhdebug')) {
    console.log('[vhdebug]', {
      viewportHeight: viewport?.height ?? null,
      innerHeight: window.innerHeight,
      enterButton: document.querySelector('#enter-btn')?.getBoundingClientRect(),
    });
  }
}

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
    syncVisualViewportHeight();
    window.addEventListener('resize', syncVisualViewportHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(syncVisualViewportHeight, 100);
    });
    window.visualViewport?.addEventListener('resize', syncVisualViewportHeight);

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
    // 手机竖屏限定：竖屏只显示横屏提示，不初始化重资源；
    // 转横屏后自动隐藏并执行一次延迟初始化，防重复。
    const update = () => {
      const portrait = isMobilePortrait();
      this.ui.setOrientationGate(portrait);
      if (!portrait) flushDeferredHeavyInit('landscape');
    };
    update();
    this._onOrientationUpdate = update;
    window.addEventListener('orientationchange', () => setTimeout(update, 120));
    window.addEventListener('resize', update);
  }

  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
    if (this._onOrientationUpdate) {
      window.removeEventListener('resize', this._onOrientationUpdate);
      this._onOrientationUpdate = null;
    }
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
