/**
 * 常驻交互指南：快速查阅卡 + 重播新手引导入口。
 * 复用教程骨架绘制（小尺寸静态帧），不依赖摄像头。
 */
const GUIDE_ITEMS = [
  { anim: 'fist', label: '聚形：握拳，粒子凝聚成器' },
  { anim: 'archaeology', label: '解构：解构手势，探索结构' },
  { anim: 'dissolve', label: '消散：消散手势，化为粒子' },
  { anim: 'clap', label: '切换文物：双手拍合' },
  { anim: null, label: '数字捶拓：手指滑动' },
];

export class GuideOverlay {
  constructor(drawHand) {
    this._drawHand = drawHand;
    this.root = null;
    this.onReplay = null;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'guide-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="guide-card">
        <h3>交互指南</h3>
        <p class="guide-en">GUIDE</p>
        <div class="guide-rows"></div>
        <div class="guide-actions">
          <button type="button" class="guide-btn guide-replay">重新播放新手引导</button>
          <button type="button" class="guide-btn guide-close">关闭</button>
        </div>
      </div>
    `;
    const rows = root.querySelector('.guide-rows');
    for (const item of GUIDE_ITEMS) {
      const row = document.createElement('div');
      row.className = 'guide-row';
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 96;
      row.appendChild(cv);
      const span = document.createElement('span');
      span.textContent = item.label;
      row.appendChild(span);
      rows.appendChild(row);
      if (item.anim && this._drawHand) {
        this._drawHand(cv, item.anim);
      }
    }
    root.querySelector('.guide-replay')?.addEventListener('click', () => {
      this.hide();
      this.onReplay?.();
    });
    root.querySelector('.guide-close')?.addEventListener('click', () => this.hide());
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.hide();
    });
    document.body.appendChild(root);
    this.root = root;
  }

  show() {
    if (this.root) this.root.hidden = false;
  }

  hide() {
    if (this.root) this.root.hidden = true;
  }
}
