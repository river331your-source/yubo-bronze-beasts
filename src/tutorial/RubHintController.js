/**
 * 捶拓情境教学：首次进入只出现一次轻提示，第一次触摸后消失。
 * 揭纸/保存沿用现有按钮逻辑。
 */
const STORAGE_KEY = 'yuboRubHintSeen';

export class RubHintController {
  constructor() {
    this.el = null;
    this._seen = false;
    try {
      this._seen = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch { /* ignore */ }
  }

  get seen() {
    return this._seen;
  }

  show(stageEl) {
    if (this._seen || !stageEl) return;
    this.hide();
    const el = document.createElement('div');
    el.className = 'rub-hint-card';
    el.innerHTML = `
      <p class="rub-hint-title">数字捶拓</p>
      <p class="rub-hint-desc">用手指轻触并滑动，让青铜纹样逐步显现</p>
      <button type="button" class="rub-hint-btn">开始捶拓</button>
    `;
    el.querySelector('.rub-hint-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    const dismissOnce = () => this.dismiss();
    el.addEventListener('pointerdown', dismissOnce, { once: true });
    stageEl.appendChild(el);
    this.el = el;
  }

  dismiss() {
    this._seen = true;
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* ignore */ }
    this.hide();
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }
}
