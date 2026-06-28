import './style.css';
import { UIController } from './ui/UIController.js';
import { AppRouter } from './core/AppRouter.js';
import { AtlasSection } from './sections/AtlasSection.js';
import { PatternSection } from './sections/PatternSection.js';
import { PlaceholderSection } from './sections/PlaceholderSection.js';

const SECTION_IDS = ['atlas', 'pattern', 'craft', 'story'];

class App {
  constructor() {
    this.ui = new UIController();
    this.router = new AppRouter({
      ui: this.ui,
      sections: {
        atlas: new AtlasSection({
          canvas: document.getElementById('webgl-canvas'),
          lineartCanvas: document.getElementById('pattern-lineart-canvas'),
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
    this.ui.onEnterMain = () => this._enterMain('atlas');
    this.ui.onLeaveMain = () => this.router.leaveSite();
    this.ui.onNavSelect = (id) => this._navigateTo(id);
    this.ui.onArtifactSelect = (index) => this.router.loadArtifact(index);
    this.ui.onModeChange = (mode) => {
      if (this.router.currentSection === 'atlas') {
        this.router.sections.atlas.switchMode(mode);
      }
    };

    const hashSection = location.hash.replace(/^#\/?/, '');
    const queryMain = new URLSearchParams(location.search).get('page') === 'main';

    if (SECTION_IDS.includes(hashSection)) {
      await this.ui.showMain();
      await this.router.enterSite(hashSection);
    } else if (queryMain) {
      await this.ui.showMain();
      await this.router.enterSite('atlas');
    }
  }

  async _enterMain(sectionId = 'atlas') {
    await this.router.enterSite(sectionId);
  }

  async _navigateTo(sectionId) {
    if (!this.ui.mainPage.classList.contains('active')) {
      await this.ui.showMain();
    }
    await this.router.switchSection(sectionId);
  }
}

const app = new App();
app.init();
