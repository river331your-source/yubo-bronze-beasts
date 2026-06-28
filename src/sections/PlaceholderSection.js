/** 待定版块占位（无 WebGL / 摄像头） */
export class PlaceholderSection {
  constructor({ ui, title, subtitle }) {
    this.ui = ui;
    this.title = title;
    this.subtitle = subtitle;
    this.active = false;
  }

  /** onEnter: 显示占位内容 */
  async onEnter() {
    if (this.active) return;
    this.active = true;
    this.ui.showPlaceholder(this.title, this.subtitle);
  }

  /** onLeave: 隐藏占位 */
  onLeave() {
    if (!this.active) return;
    this.active = false;
    this.ui.hidePlaceholder();
  }
}
