/**
 * HOME 版块 — 金色标题 + 入场动画 +「进入展厅」
 * onEnter: 绑定进入按钮、播放入场动画
 * onLeave: 解绑按钮（无 WebGL / 摄像头）
 */
export class HomeSection {
  constructor({ enterBtn, onRequestAtlas }) {
    this.enterBtn = enterBtn;
    this.onRequestAtlas = onRequestAtlas;
    this.root = document.getElementById('section-home');
    this.active = false;
    this._onEnterClick = () => this.onRequestAtlas?.();
  }

  async onEnter() {
    if (this.active) return;
    this.active = true;
    this.enterBtn?.addEventListener('click', this._onEnterClick);
    this._playEnterAnimation();
  }

  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.enterBtn?.removeEventListener('click', this._onEnterClick);
  }

  _playEnterAnimation() {
    if (!this.root) return;
    this.root.classList.remove('home-animate');
    void this.root.offsetWidth;
    this.root.classList.add('home-animate');
  }
}
