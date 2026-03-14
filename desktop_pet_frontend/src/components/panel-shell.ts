/* =============================================
   Panel Shell - 管理面板窗口 (Schedule / Todo / Chat / Settings)
   带 Navigation Rail + 自定义标题栏
   ============================================= */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';

import './schedule-view';
import './todo-panel';
import './chat-bubble';
import './settings-page';

type PageId = 'schedule' | 'todo' | 'chat' | 'settings';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'schedule', label: '日程', icon: 'calendar_month' },
  { id: 'todo', label: '待办', icon: 'checklist' },
  { id: 'chat', label: '聊天', icon: 'chat_bubble' },
  { id: 'settings', label: '设置', icon: 'settings' },
];

@customElement('panel-shell')
export class PanelShell extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: flex;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        user-select: none;
      }

      /* Navigation rail */
      .nav-rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 80px;
        padding: 12px 0;
        gap: 4px;
        background: var(--md-sys-color-surface);
        border-right: 1px solid var(--md-sys-color-outline-variant);
        flex-shrink: 0;
        /* Allow window drag from the rail top area */
        -webkit-app-region: drag;
      }
      .nav-logo {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
        color: var(--md-sys-color-primary);
      }
      .nav-logo .material-symbols-outlined {
        font-size: 28px;
        font-variation-settings: 'FILL' 1, 'wght' 500;
      }

      .nav-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
        width: 64px;
        border: none;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        cursor: pointer;
        border-radius: var(--md-sys-shape-corner-large);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        -webkit-app-region: no-drag;
      }
      .nav-item:hover {
        background: var(--md-sys-color-surface-container-high);
      }
      .nav-item .icon-wrapper {
        width: 56px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--md-sys-shape-corner-full);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .nav-item.active .icon-wrapper {
        background: var(--md-sys-color-secondary-container);
      }
      .nav-item.active {
        color: var(--md-sys-color-on-surface);
      }
      .nav-item .material-symbols-outlined {
        font-size: 24px;
        transition: font-variation-settings var(--md-sys-motion-duration-short);
      }
      .nav-item.active .material-symbols-outlined {
        font-variation-settings: 'FILL' 1, 'wght' 500;
      }
      .nav-item .label {
        font-size: 12px;
        font-weight: 500;
      }

      /* Content */
      .content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* Title bar drag region */
      .titlebar {
        height: 40px;
        -webkit-app-region: drag;
        flex-shrink: 0;
      }

      .page {
        flex: 1;
        overflow: hidden;
        animation: pageIn var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
      }
      @keyframes pageIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Responsive: bottom nav */
      @media (max-width: 640px) {
        :host {
          flex-direction: column-reverse;
        }
        .nav-rail {
          flex-direction: row;
          width: 100%;
          height: 64px;
          padding: 0 8px;
          border-right: none;
          border-top: 1px solid var(--md-sys-color-outline-variant);
          justify-content: space-around;
          -webkit-app-region: no-drag;
        }
        .nav-logo { display: none; }
        .nav-item { width: auto; flex: 1; padding: 6px 0; }
        .titlebar { display: none; }
      }
    `,
  ];

  @state() private _activePage: PageId = 'schedule';

  override connectedCallback() {
    super.connectedCallback();

    // Listen for navigation from Electron main process (via pet overlay)
    window.electronAPI?.onNavigate((page: string) => {
      if (['schedule', 'todo', 'chat', 'settings'].includes(page)) {
        this._activePage = page as PageId;
      }
    });
  }

  private _navigate(page: PageId) {
    this._activePage = page;
  }

  private _renderPage() {
    switch (this._activePage) {
      case 'schedule':
        return html`<div class="page"><schedule-view></schedule-view></div>`;
      case 'todo':
        return html`<div class="page"><todo-panel></todo-panel></div>`;
      case 'chat':
        return html`<div class="page"><chat-bubble></chat-bubble></div>`;
      case 'settings':
        return html`<div class="page"><settings-page></settings-page></div>`;
    }
  }

  override render() {
    return html`
      <nav class="nav-rail">
        <div class="nav-logo">
          <span class="material-symbols-outlined">cruelty_free</span>
        </div>
        ${NAV_ITEMS.map(item => html`
          <button class="nav-item ${this._activePage === item.id ? 'active' : ''}"
            @click=${() => this._navigate(item.id)}>
            <div class="icon-wrapper">
              <span class="material-symbols-outlined">${item.icon}</span>
            </div>
            <span class="label">${item.label}</span>
          </button>
        `)}
      </nav>
      <div class="content">
        <div class="titlebar"></div>
        ${this._renderPage()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'panel-shell': PanelShell;
  }
}
