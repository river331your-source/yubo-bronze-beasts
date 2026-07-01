import './style.css';
import { performanceMonitor } from './debug/PerformanceMonitor.js';
import { UIController } from './ui/UIController.js';
import { AppRouter } from './core/AppRouter.js';
import { HomeSection } from './sections/HomeSection.js';
import { AtlasSection } from './sections/AtlasSection.js';
import { PatternSection } from './sections/PatternSection.js';
import { PlaceholderSection } from './sections/PlaceholderSection.js';

const SECTION_IDS = ['home', 'atlas', 'pattern', 'craft', 'story'];

class App {
  constructor() {
    this.ui = new UIController();
    this.router = new AppRouter({
      ui: this.ui,
      sections: {
        home: new HomeSection({
          enterBtn: document.getElementById('enter-btn'),
          onRequestAtlas: () => this.router.switchSection('atlas'),
        }),
        atlas: new AtlasSection({
          canvas: document.getElementById('webgl-canvas'),
          videoEl: document.getElementById('camera-feed'),
          ui: this.ui,
        }),
        pattern: new PatternSection({
          lineartCanvas: document.getElementById('pattern-lineart-canvas'),
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
  }

  async init() {
    if (!document.getElementById('app') || !document.getElementById('main-page')) {
      console.error('[App] DOM 结构缺失 — 请硬刷新页面（Ctrl+Shift+R）');
      return;
    }

    performanceMonitor.init();
    this.ui.onNavSelect = (id) => this.router.switchSection(id);
    this.ui.onArtifactSelect = (index) => this.router.loadArtifact(index);
    this.ui.onModeChange = (mode) => this.router.switchMode(mode);

    const hashSection = location.hash.replace(/^#\/?/, '');
    const initial = SECTION_IDS.includes(hashSection) ? hashSection : 'home';
    await this.router.switchSection(initial);

    window.addEventListener('hashchange', this._onHashChange);
  }

  _onHashChange = () => {
    const id = location.hash.replace(/^#\/?/, '') || 'home';
    if (SECTION_IDS.includes(id) && id !== this.router.currentSection) {
      this.router.switchSection(id);
    }
  };

  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
    const section = this.router?.currentSection;
    if (section && this.router.sections[section]) {
      this.router.sections[section].onLeave?.();
    }
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
