/** 待定版块占位（无 WebGL / 摄像头） */
export class PlaceholderSection {
  constructor({ ui, title, subtitle }) {
    this.ui = ui;
    this.title = title;
    this.subtitle = subtitle;
    this.active = false;
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.ui.showPlaceholder(this.title, this.subtitle);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.ui.hidePlaceholder();
  }
}
