/* =============================================
   Pet App - 根组件，按窗口类型分发渲染
   - pet window -> PetOverlay (桌面悬浮)
   - panel window -> PanelShell (管理面板)
   ============================================= */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

// Lazy-load heavy sub-components so pet-app always registers
const loadOverlay = () => import('./pet-overlay').catch(e => console.warn('pet-overlay load failed:', e));
const loadPanel = () => import('./panel-shell').catch(e => console.warn('panel-shell load failed:', e));
const loadMenu = () => import('./context-menu-popup').catch(e => console.warn('context-menu-popup load failed:', e));

@customElement('pet-app')
export class PetApp extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      background: transparent;
    }
  `;

  @state() private _windowType: 'pet' | 'panel' | 'menu' | 'unknown' = 'unknown';

  override connectedCallback() {
    super.connectedCallback();
    this._detectWindowType();
  }

  private async _detectWindowType() {
    // Determine window type from hash or Electron IPC
    const hash = window.location.hash.replace('#', '');
    if (hash === '/pet') {
      this._windowType = 'pet';
    } else if (hash === '/panel') {
      this._windowType = 'panel';
    } else if (hash.startsWith('/menu')) {
      this._windowType = 'menu';
    } else if (window.electronAPI) {
      try {
        this._windowType = await window.electronAPI.getWindowType();
      } catch {
        this._windowType = 'pet'; // fallback
      }
    } else {
      // Fallback for browser dev: default to panel
      this._windowType = 'panel';
    }

    // Load the needed sub-component
    if (this._windowType === 'pet') {
      await loadOverlay();
    } else if (this._windowType === 'panel') {
      await loadPanel();
    } else if (this._windowType === 'menu') {
      await loadMenu();
    }
  }

  override render() {
    switch (this._windowType) {
      case 'pet':
        return html`<pet-overlay></pet-overlay>`;
      case 'panel':
        return html`<panel-shell></panel-shell>`;
      case 'menu':
        return html`<context-menu-popup></context-menu-popup>`;
      default:
        return html`<div style="color:white;font-size:16px;padding:20px;">加载中...</div>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pet-app': PetApp;
  }
}
