/* =============================================
   Context Menu Popup - 独立窗口的自定义右键菜单
   在单独的透明 BrowserWindow 中运行
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type {} from '../electron.d';

@customElement('context-menu-popup')
export class ContextMenuPopup extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background: transparent;
    }

    .menu {
      background: var(--md-sys-color-surface-container, #2b2f26);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25);
      width: 196px;
      padding: 6px 0;
      animation: menuIn 120ms ease-out;
      border: 1px solid rgba(255,255,255,0.06);
    }

    @keyframes menuIn {
      from { opacity: 0; transform: scale(0.92) translateY(-4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      font-size: 13px;
      color: var(--md-sys-color-on-surface, #e2e3da);
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: 'Noto Sans SC', system-ui, sans-serif;
      transition: background 100ms ease;
      box-sizing: border-box;
    }
    .menu-item:hover {
      background: var(--md-sys-color-surface-container-highest, rgba(255,255,255,0.08));
    }
    .menu-item:active {
      background: var(--md-sys-color-surface-container-highest, rgba(255,255,255,0.12));
    }

    .menu-icon {
      font-family: 'Material Symbols Outlined';
      font-size: 20px;
      color: var(--md-sys-color-on-surface-variant, #c3c8bb);
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      width: 20px;
      text-align: center;
      flex-shrink: 0;
    }

    .menu-divider {
      height: 1px;
      background: var(--md-sys-color-outline-variant, rgba(255,255,255,0.08));
      margin: 4px 8px;
    }

    /* Expression submenu */
    .sub-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      font-size: 13px;
      color: var(--md-sys-color-on-surface, #e2e3da);
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: 'Noto Sans SC', system-ui, sans-serif;
      transition: background 100ms ease;
      box-sizing: border-box;
    }
    .sub-header:hover {
      background: var(--md-sys-color-surface-container-highest, rgba(255,255,255,0.08));
    }
    .sub-header .left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sub-arrow {
      font-family: 'Material Symbols Outlined';
      font-size: 18px;
      color: var(--md-sys-color-on-surface-variant, #c3c8bb);
      transition: transform 150ms ease;
    }
    .sub-arrow.open { transform: rotate(180deg); }

    .submenu {
      max-height: 260px;
      overflow-y: auto;
      background: var(--md-sys-color-surface-container-low, rgba(0,0,0,0.15));
      animation: subFadeIn 120ms ease-out;
    }
    @keyframes subFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .submenu .menu-item {
      padding-left: 48px;
      font-size: 12px;
    }

    /* M3 Expressive scrollbar */
    .submenu::-webkit-scrollbar {
      width: 6px;
    }
    .submenu::-webkit-scrollbar-track {
      background: transparent;
      margin: 4px 0;
    }
    .submenu::-webkit-scrollbar-thumb {
      background: var(--md-sys-color-on-surface-variant, #c3c8bb);
      border-radius: 100px;
      opacity: 0.5;
    }
    .submenu::-webkit-scrollbar-thumb:hover {
      background: var(--md-sys-color-on-surface, #e2e3da);
    }
    .submenu::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;

  @state() private _expressions: string[] = [];
  @state() private _showExprSub = false;

  override connectedCallback() {
    super.connectedCallback();

    // Pull expression list from main process (avoids push timing race)
    window.electronAPI?.getMenuData?.().then((expressions: string[]) => {
      this._expressions = expressions || [];
    }).catch(() => {});

    // Close on window blur (click outside)
    window.addEventListener('blur', () => {
      this._close();
    });

    // Close on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._close();
    });
  }

  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;

  // Fixed menu width matching BrowserWindow initial width
  private static readonly MENU_W = 210;

  override updated() {
    // Only resize height dynamically; width is fixed to prevent feedback loop
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      const menu = this.shadowRoot?.querySelector('.menu') as HTMLElement;
      if (!menu) return;
      // scrollHeight gives full content height even with overflow children
      const h = Math.ceil(menu.scrollHeight) + 20;
      window.electronAPI?.resizeMenuWindow?.(ContextMenuPopup.MENU_W, h);
    }, 30);
  }

  private _action(action: string, data?: string) {
    window.electronAPI?.menuAction?.(action, data);
    // Small delay for visual feedback
    setTimeout(() => this._close(), 80);
  }

  private _close() {
    window.electronAPI?.closeMenuWindow?.();
  }

  override render() {
    return html`
      <div class="menu">
        <button class="menu-item" @click=${() => this._action('schedule')}>
          <span class="menu-icon">calendar_month</span>
          日程
        </button>
        <button class="menu-item" @click=${() => this._action('todo')}>
          <span class="menu-icon">checklist</span>
          待办
        </button>
        <button class="menu-item" @click=${() => this._action('chat')}>
          <span class="menu-icon">chat_bubble</span>
          聊天
        </button>

        ${this._expressions.length > 0
          ? html`
            <div class="menu-divider"></div>
            <button class="sub-header" @click=${() => (this._showExprSub = !this._showExprSub)}>
              <span class="left">
                <span class="menu-icon">mood</span>
                表情
              </span>
              <span class="sub-arrow ${this._showExprSub ? 'open' : ''}">expand_more</span>
            </button>
            ${this._showExprSub
              ? html`
                <div class="submenu">
                  ${this._expressions.map(name => html`
                    <button class="menu-item" @click=${() => this._action('expression', name)}>
                      ${name}
                    </button>
                  `)}
                  ${this._expressions.length > 0
                    ? html`
                      <div class="menu-divider"></div>
                      <button class="menu-item" @click=${() => this._action('clear-expression')}>
                        <span style="opacity:0.7">恢复默认</span>
                      </button>`
                    : nothing}
                </div>`
              : nothing}`
          : nothing}

        <div class="menu-divider"></div>
        <button class="menu-item" @click=${() => this._action('settings')}>
          <span class="menu-icon">settings</span>
          设置
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'context-menu-popup': ContextMenuPopup;
  }
}
