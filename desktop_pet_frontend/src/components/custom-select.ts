/* =============================================
   Custom Select - 自定义Material Design风格下拉框
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';

export interface SelectOption {
  value: string;
  label: string;
}

// 全局管理当前打开的下拉框
let currentOpenSelect: CustomSelect | null = null;

@customElement('custom-select')
export class CustomSelect extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: inline-block;
        position: relative;
        min-width: 120px;
      }

      .select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        cursor: pointer;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        user-select: none;
      }

      .select-trigger:hover {
        background: var(--md-sys-color-surface-container);
        border-color: var(--md-sys-color-outline);
      }

      .select-trigger.open {
        border-color: var(--md-sys-color-primary);
        background: var(--md-sys-color-surface-container);
      }

      .select-trigger .material-symbols-outlined {
        font-size: 20px;
        color: var(--md-sys-color-on-surface-variant);
        transition: transform var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }

      .select-trigger.open .material-symbols-outlined {
        transform: rotate(180deg);
      }

      .dropdown {
        position: fixed;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--md-sys-color-surface-container);
        border-radius: var(--md-sys-shape-corner-medium);
        box-shadow: var(--md-sys-elevation-2);
        z-index: 100;
        box-sizing: border-box;
        animation: dropdownIn var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
      }

      /* 在对话框内时使用更高的层级 */
      :host-context(.dialog) .dropdown {
        z-index: 502;
      }

      @keyframes dropdownIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .option {
        padding: 12px 16px;
        cursor: pointer;
        font-size: 14px;
        color: var(--md-sys-color-on-surface);
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        box-sizing: border-box;
      }

      .option:hover {
        background: var(--md-sys-color-surface-container-highest);
      }

      .option.selected {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
        font-weight: 500;
      }

      /* Scrollbar */
      .dropdown::-webkit-scrollbar {
        width: 8px;
      }
      .dropdown::-webkit-scrollbar-track {
        background: transparent;
      }
      .dropdown::-webkit-scrollbar-thumb {
        background: var(--md-sys-color-outline-variant);
        border-radius: 4px;
      }
      .dropdown::-webkit-scrollbar-thumb:hover {
        background: var(--md-sys-color-outline);
      }
    `,
  ];

  @property({ type: Array }) options: SelectOption[] = [];
  @property({ type: String }) value = '';
  @property({ type: String }) placeholder = '请选择';
  @property({ type: String }) name = '';

  @state() private _isOpen = false;
  @state() private _dropdownStyle = '';

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._handleOutsideClick);
    window.addEventListener('scroll', this._updateDropdownPosition, true);
    window.addEventListener('resize', this._updateDropdownPosition);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
    window.removeEventListener('scroll', this._updateDropdownPosition, true);
    window.removeEventListener('resize', this._updateDropdownPosition);
  }

  private _handleOutsideClick = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this._isOpen = false;
    }
  };

  private _updateDropdownPosition = () => {
    if (!this._isOpen) return;

    const trigger = this.shadowRoot?.querySelector('.select-trigger') as HTMLElement;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const dropdownHeight = 240; // max-height
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Calculate position
    let top = rect.bottom + 4;
    let maxHeight = Math.min(dropdownHeight, spaceBelow - 8);

    // If not enough space below, try above
    if (spaceBelow < 100 && spaceAbove > spaceBelow) {
      top = rect.top - Math.min(dropdownHeight, spaceAbove - 8) - 4;
      maxHeight = Math.min(dropdownHeight, spaceAbove - 8);
    }

    this._dropdownStyle = `
      position: fixed;
      top: ${top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      max-height: ${maxHeight}px;
    `;
  };

  private _toggleDropdown(e: Event) {
    e.stopPropagation();

    // 如果有其他下拉框打开，先关闭它
    if (currentOpenSelect && currentOpenSelect !== this) {
      currentOpenSelect._isOpen = false;
    }

    this._isOpen = !this._isOpen;

    // 更新全局引用
    if (this._isOpen) {
      currentOpenSelect = this;
      // 计算下拉框位置
      requestAnimationFrame(() => this._updateDropdownPosition());
    } else {
      currentOpenSelect = null;
    }
  }

  private _selectOption(option: SelectOption) {
    this.value = option.value;
    this._isOpen = false;
    currentOpenSelect = null;
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: option.value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _getSelectedLabel(): string {
    const selected = this.options.find(opt => opt.value === this.value);
    return selected ? selected.label : this.placeholder;
  }

  override render() {
    return html`
      <div
        class="select-trigger ${this._isOpen ? 'open' : ''}"
        @click=${this._toggleDropdown}
      >
        <span>${this._getSelectedLabel()}</span>
        <span class="material-symbols-outlined">expand_more</span>
      </div>

      ${this._isOpen
        ? html`
            <div class="dropdown" style="${this._dropdownStyle}">
              ${this.options.map(
                option => html`
                  <div
                    class="option ${option.value === this.value ? 'selected' : ''}"
                    @click=${() => this._selectOption(option)}
                  >
                    ${option.label}
                  </div>
                `
              )}
            </div>
          `
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'custom-select': CustomSelect;
  }
}
