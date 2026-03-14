/* =============================================
   Todo Panel - 待办面板
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared, cardStyles, m3Scrollbar } from '../styles/shared';
import { getTodos, createTodo, toggleTodo, deleteTodo, getTodoStats } from '../api/client';
import type { TodoItem, TodoStats, CreateTodoParams, EventPriority } from '../types';
import './custom-select';

@customElement('todo-panel')
export class TodoPanel extends LitElement {
  static override styles = [
    m3Shared,
    cardStyles,
    m3Scrollbar,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 16px;
        gap: 16px;
        overflow-y: auto;
      }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .header h2 {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }

      /* Stats bar */
      .stats-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
      .stat-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        border-radius: var(--md-sys-shape-corner-full);
        font-size: 12px;
        font-weight: 500;
      }
      .stat-chip.pending {
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
      }
      .stat-chip.done {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }
      .stat-chip.overdue {
        background: var(--md-sys-color-error-container);
        color: var(--md-sys-color-on-error-container);
      }

      /* Filter tabs */
      .filter-tabs {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .filter-tab {
        padding: 6px 16px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .filter-tab:hover {
        background: var(--md-sys-color-surface-container-highest);
      }
      .filter-tab.active {
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }

      /* FAB */
      .fab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border: none;
        border-radius: var(--md-sys-shape-corner-large);
        background: var(--md-sys-color-primary-container);
        color: var(--md-sys-color-on-primary-container);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: var(--md-sys-elevation-2);
        transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard),
                    transform 200ms var(--md-sys-motion-easing-standard);
      }
      .fab:hover {
        box-shadow: var(--md-sys-elevation-3);
        transform: translateY(-1px);
      }
      .fab:active { transform: scale(0.97); }

      /* Todo list */
      .todo-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-height: 0;
      }

      .todo-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
      }
      .todo-item:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
      .todo-item.done {
        opacity: 0.6;
      }

      /* Checkbox */
      .checkbox {
        width: 22px;
        height: 22px;
        border: 2px solid var(--md-sys-color-on-surface-variant);
        border-radius: var(--md-sys-shape-corner-extra-small);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .checkbox:hover {
        border-color: var(--md-sys-color-primary);
      }
      .checkbox.checked {
        background: var(--md-sys-color-primary);
        border-color: var(--md-sys-color-primary);
      }
      .checkbox.checked .material-symbols-outlined {
        color: var(--md-sys-color-on-primary);
        font-size: 16px;
      }

      .todo-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .todo-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .todo-item.done .todo-title {
        text-decoration: line-through;
        color: var(--md-sys-color-on-surface-variant);
      }
      .todo-meta {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .todo-meta .overdue {
        color: var(--md-sys-color-error);
        font-weight: 500;
      }

      .priority-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .priority-dot.low { background: var(--md-sys-color-outline); }
      .priority-dot.normal { background: var(--md-sys-color-primary); }
      .priority-dot.high { background: var(--md-sys-color-tertiary); }
      .priority-dot.urgent { background: var(--md-sys-color-error); }

      .todo-actions {
        display: flex;
        opacity: 0;
        transition: opacity var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .todo-item:hover .todo-actions {
        opacity: 1;
      }
      .delete-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-error);
        cursor: pointer;
      }
      .delete-btn:hover {
        background: var(--md-sys-color-error-container);
      }

      /* Empty */
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }
      .empty .material-symbols-outlined {
        font-size: 48px;
        color: var(--md-sys-color-outline);
      }

      /* Quick add bar */
      .quick-add {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-shrink: 0;
      }
      .quick-add input[type="text"] {
        flex: 1;
        max-width: 400px;
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        padding: 10px 14px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .quick-add input[type="text"]:focus {
        border-color: var(--md-sys-color-primary);
      }
      .quick-add select {
        font-family: var(--md-sys-typescale-body-font);
        font-size: 13px;
        padding: 8px 10px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
      }
      .quick-add custom-select {
        width: 100px;
        flex-shrink: 0;
      }
      .add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        cursor: pointer;
        flex-shrink: 0;
        position: relative;
        z-index: 200;
        transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .add-btn:hover {
        box-shadow: var(--md-sys-elevation-1);
      }

      /* M3 Date/Time Picker */
      .date-trigger {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface-variant);
        font-family: var(--md-sys-typescale-body-font);
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        flex-shrink: 0;
        height: 36px;
      }
      .date-trigger:hover {
        background: var(--md-sys-color-surface-container);
        border-color: var(--md-sys-color-outline);
      }
      .date-trigger.has-value {
        border-color: var(--md-sys-color-primary);
        color: var(--md-sys-color-primary);
      }
      .date-trigger .material-symbols-outlined {
        font-size: 18px;
      }
      .date-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        border-radius: 50%;
        background: var(--md-sys-color-surface-container-highest);
        color: var(--md-sys-color-on-surface-variant);
        cursor: pointer;
        padding: 0;
        font-size: 0;
        line-height: 1;
      }
      .date-clear .material-symbols-outlined {
        font-size: 12px;
      }

      /* Picker popover */
      .picker-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 99;
      }
      .picker-popover {
        position: fixed;
        z-index: 100;
        background: var(--md-sys-color-surface-container-high);
        border-radius: var(--md-sys-shape-corner-extra-large);
        box-shadow: var(--md-sys-elevation-3);
        padding: 16px;
        min-width: 300px;
        animation: pickerIn var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
      }
      @keyframes pickerIn {
        from { opacity: 0; transform: translateY(-8px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .picker-header .title-small {
        font-size: 14px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
      }
      .picker-nav {
        display: flex;
        gap: 2px;
      }
      .picker-nav button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        cursor: pointer;
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .picker-nav button:hover {
        background: var(--md-sys-color-surface-container-highest);
      }
      .picker-nav button .material-symbols-outlined {
        font-size: 20px;
      }

      .picker-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        margin-bottom: 4px;
      }
      .picker-weekdays span {
        font-size: 11px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface-variant);
        padding: 4px 0;
      }

      .picker-days {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }
      .picker-day {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-on-surface);
        font-family: var(--md-sys-typescale-body-font);
        font-size: 13px;
        cursor: pointer;
        margin: 0 auto;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .picker-day:hover {
        background: var(--md-sys-color-surface-container-highest);
      }
      .picker-day.other-month {
        color: var(--md-sys-color-outline);
        opacity: 0.5;
      }
      .picker-day.today {
        border: 1px solid var(--md-sys-color-primary);
        font-weight: 600;
      }
      .picker-day.selected {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        font-weight: 600;
      }
      .picker-day.selected:hover {
        background: var(--md-sys-color-primary);
      }

      .picker-body {
        display: flex;
        gap: 12px;
      }
      .picker-calendar {
        flex: 1;
        min-width: 0;
      }
      .picker-time-side {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding-left: 12px;
        border-left: 1px solid var(--md-sys-color-outline-variant);
      }
      .picker-time-side .material-symbols-outlined {
        font-size: 18px;
        color: var(--md-sys-color-on-surface-variant);
        margin-bottom: 4px;
      }
      .time-input {
        width: 44px;
        text-align: center;
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        font-weight: 500;
        padding: 6px 4px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface);
        outline: none;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .time-input:focus {
        border-color: var(--md-sys-color-primary);
      }
      .time-sep {
        font-size: 16px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
      }
      .picker-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
      }
      .picker-btn {
        padding: 6px 16px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .picker-btn.text {
        background: transparent;
        color: var(--md-sys-color-primary);
      }
      .picker-btn.text:hover {
        background: var(--md-sys-color-primary-container);
      }
      .picker-btn.filled {
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
      }
      .picker-btn.filled:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
    `,
  ];

  @state() private _todos: TodoItem[] = [];
  @state() private _stats: TodoStats | null = null;
  @state() private _filter: string = 'pending';
  @state() private _loading = false;
  @state() private _newTitle = '';
  @state() private _newPriority: EventPriority = 'normal';
  @state() private _newDueDate = '';
  @state() private _pickerOpen = false;
  @state() private _pickerYear = new Date().getFullYear();
  @state() private _pickerMonth = new Date().getMonth();
  @state() private _pickerDay: number | null = null;
  @state() private _pickerHour = '';
  @state() private _pickerMinute = '';
  @state() private _pickerPos = { top: 0, left: 0 };

  override connectedCallback() {
    super.connectedCallback();
    this._fetchAll();
  }

  private async _fetchAll() {
    this._loading = true;
    try {
      const [todos, stats] = await Promise.all([
        getTodos(this._filter === 'all' ? undefined : this._filter),
        getTodoStats(),
      ]);
      this._todos = todos;
      this._stats = stats;
    } catch (e) {
      console.error('Failed to fetch todos:', e);
    } finally {
      this._loading = false;
    }
  }

  private _setFilter(f: string) {
    this._filter = f;
    this._fetchAll();
  }

  private async _handleToggle(id: string) {
    try {
      const updated = await toggleTodo(id);
      this._todos = this._todos.map(t => (t.id === id ? updated : t));
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to toggle todo:', e);
    }
  }

  private async _handleDelete(id: string) {
    try {
      await deleteTodo(id);
      this._todos = this._todos.filter(t => t.id !== id);
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to delete todo:', e);
    }
  }

  private async _handleQuickAdd() {
    if (!this._newTitle.trim()) return;
    const params: CreateTodoParams = {
      title: this._newTitle.trim(),
      priority: this._newPriority,
    };
    if (this._newDueDate) {
      params.due_date = new Date(this._newDueDate).toISOString();
    }
    try {
      const created = await createTodo(params);
      this._todos = [created, ...this._todos];
      this._newTitle = '';
      this._newDueDate = '';
      this._stats = await getTodoStats();
    } catch (e) {
      console.error('Failed to create todo:', e);
    }
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this._handleQuickAdd();
    }
  }

  private _isOverdue(todo: TodoItem): boolean {
    if (!todo.due_date || todo.status === 'done' || todo.status === 'cancelled') return false;
    return new Date(todo.due_date) < new Date();
  }

  private _formatDueDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    if (hh === '00' && mi === '00') return `${mm}-${dd}`;
    return `${mm}-${dd} ${hh}:${mi}`;
  }

  /* ---- M3 Date/Time Picker ---- */

  private _openPicker() {
    // Always open downward, right-aligned to trigger
    const trigger = this.shadowRoot?.querySelector('.date-trigger') as HTMLElement | null;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      let left = rect.right - 320;
      if (left < 8) left = 8;
      this._pickerPos = { top: rect.bottom + 4, left };
    }
    if (this._newDueDate) {
      const d = new Date(this._newDueDate);
      this._pickerYear = d.getFullYear();
      this._pickerMonth = d.getMonth();
      this._pickerDay = d.getDate();
      this._pickerHour = String(d.getHours()).padStart(2, '0');
      this._pickerMinute = String(d.getMinutes()).padStart(2, '0');
    } else {
      const now = new Date();
      this._pickerYear = now.getFullYear();
      this._pickerMonth = now.getMonth();
      this._pickerDay = null;
      this._pickerHour = '';
      this._pickerMinute = '';
    }
    this._pickerOpen = true;
  }

  private _closePicker() {
    this._pickerOpen = false;
  }

  private _pickerPrevMonth() {
    if (this._pickerMonth === 0) {
      this._pickerMonth = 11;
      this._pickerYear--;
    } else {
      this._pickerMonth--;
    }
  }

  private _pickerNextMonth() {
    if (this._pickerMonth === 11) {
      this._pickerMonth = 0;
      this._pickerYear++;
    } else {
      this._pickerMonth++;
    }
  }

  private _pickerSelectDay(day: number, isOtherMonth = false) {
    if (isOtherMonth) return;
    this._pickerDay = day;
  }

  private _pickerConfirm() {
    if (this._pickerDay === null) {
      this._closePicker();
      return;
    }
    const h = parseInt(this._pickerHour) || 0;
    const m = parseInt(this._pickerMinute) || 0;
    const d = new Date(this._pickerYear, this._pickerMonth, this._pickerDay, h, m);
    // Format as local datetime string for storage
    const pad = (n: number) => String(n).padStart(2, '0');
    this._newDueDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this._closePicker();
  }

  private _pickerClear() {
    this._newDueDate = '';
    this._closePicker();
  }

  private _getCalendarDays(): Array<{ day: number; thisMonth: boolean; isToday: boolean }> {
    const year = this._pickerYear;
    const month = this._pickerMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth();
    const todayD = today.getDate();

    const result: Array<{ day: number; thisMonth: boolean; isToday: boolean }> = [];
    // Monday-based: convert Sunday(0)->6, Mon(1)->0, ...
    const startOffset = (firstDay + 6) % 7;

    for (let i = startOffset - 1; i >= 0; i--) {
      result.push({ day: daysInPrev - i, thisMonth: false, isToday: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, thisMonth: true, isToday: d === todayD && month === todayM && year === todayY });
    }
    const remaining = 7 - (result.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        result.push({ day: d, thisMonth: false, isToday: false });
      }
    }
    return result;
  }

  private _dueDateDisplay(): string {
    if (!this._newDueDate) return '';
    return this._formatDueDate(this._newDueDate);
  }

  private _renderPicker() {
    if (!this._pickerOpen) return nothing;
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const days = this._getCalendarDays();
    return html`
      <div class="picker-overlay" @click=${this._closePicker}></div>
      <div class="picker-popover"
           style="top:${this._pickerPos.top}px; left:${this._pickerPos.left}px;"
           @click=${(e: Event) => e.stopPropagation()}>
        <div class="picker-header">
          <span class="title-small">${this._pickerYear}年 ${monthNames[this._pickerMonth]}</span>
          <div class="picker-nav">
            <button @click=${this._pickerPrevMonth}>
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <button @click=${this._pickerNextMonth}>
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        <div class="picker-body">
          <div class="picker-calendar">
            <div class="picker-weekdays">
              ${['一', '二', '三', '四', '五', '六', '日'].map(d => html`<span>${d}</span>`)}
            </div>
            <div class="picker-days">
              ${days.map(d => {
                const selected = d.thisMonth && d.day === this._pickerDay;
                return html`
                  <button class="picker-day
                    ${d.thisMonth ? '' : 'other-month'}
                    ${d.isToday ? 'today' : ''}
                    ${selected ? 'selected' : ''}"
                    @click=${() => this._pickerSelectDay(d.day, !d.thisMonth)}>
                    ${d.day}
                  </button>`;
              })}
            </div>
          </div>
          <div class="picker-time-side">
            <span class="material-symbols-outlined">schedule</span>
            <input class="time-input" type="text" maxlength="2" placeholder="时"
              .value=${this._pickerHour}
              @input=${(e: Event) => {
                let v = (e.target as HTMLInputElement).value.replace(/\D/g, '');
                if (parseInt(v) > 23) v = '23';
                this._pickerHour = v;
              }} />
            <span class="time-sep">:</span>
            <input class="time-input" type="text" maxlength="2" placeholder="分"
              .value=${this._pickerMinute}
              @input=${(e: Event) => {
                let v = (e.target as HTMLInputElement).value.replace(/\D/g, '');
                if (parseInt(v) > 59) v = '59';
                this._pickerMinute = v;
              }} />
          </div>
        </div>

        <div class="picker-actions">
          <button class="picker-btn text" @click=${this._pickerClear}>清除</button>
          <button class="picker-btn filled" @click=${this._pickerConfirm}>确定</button>
        </div>
      </div>
    `;
  }

  override render() {
    const s = this._stats;
    return html`
      <div class="header">
        <h2>待办事项</h2>
      </div>

      ${s ? html`
        <div class="stats-bar">
          <span class="stat-chip pending">待处理: ${s.pending + s.in_progress}</span>
          <span class="stat-chip done">已完成: ${s.done}</span>
          ${s.overdue > 0 ? html`<span class="stat-chip overdue">已逾期: ${s.overdue}</span>` : nothing}
        </div>
      ` : nothing}

      <div class="filter-tabs">
        ${(['pending', 'all', 'done', 'cancelled'] as const).map(f => {
          const labels: Record<string, string> = { pending: '待处理', all: '全部', done: '已完成', cancelled: '已取消' };
          return html`
          <button class="filter-tab ${this._filter === f ? 'active' : ''}"
            @click=${() => this._setFilter(f)}>${labels[f]}</button>
        `; })}
      </div>

      <div class="quick-add">
        <input type="text" placeholder="添加新待办..."
          .value=${this._newTitle}
          @input=${(e: Event) => (this._newTitle = (e.target as HTMLInputElement).value)}
          @keydown=${this._handleKeydown} />
        <div style="position:relative;">
          <button class="date-trigger ${this._newDueDate ? 'has-value' : ''}"
            @click=${() => this._openPicker()}>
            <span class="material-symbols-outlined">event</span>
            ${this._newDueDate
              ? html`${this._dueDateDisplay()}
                <span class="date-clear" @click=${(e: Event) => { e.stopPropagation(); this._newDueDate = ''; }}>
                  <span class="material-symbols-outlined">close</span>
                </span>`
              : html`截止时间`}
          </button>
          ${this._renderPicker()}
        </div>
        <custom-select
          .options=${[
            { value: 'low', label: '低' },
            { value: 'normal', label: '普通' },
            { value: 'high', label: '高' },
            { value: 'urgent', label: '紧急' }
          ]}
          .value=${this._newPriority}
          @change=${(e: CustomEvent) => this._newPriority = e.detail.value as EventPriority}
        ></custom-select>
        <button class="add-btn" @click=${this._handleQuickAdd}>
          <span class="material-symbols-outlined" style="font-size:20px">add</span>
        </button>
      </div>

      <div class="todo-list">
        ${this._todos.length === 0 && !this._loading
          ? html`
            <div class="empty">
              <span class="material-symbols-outlined">checklist</span>
              <span class="body-medium">暂无待办事项</span>
            </div>`
          : this._todos.map(todo => html`
            <div class="todo-item ${todo.status === 'done' ? 'done' : ''}">
              <div class="checkbox ${todo.status === 'done' ? 'checked' : ''}"
                @click=${() => this._handleToggle(todo.id)}>
                ${todo.status === 'done'
                  ? html`<span class="material-symbols-outlined">check</span>`
                  : nothing}
              </div>
              <span class="priority-dot ${todo.priority}"></span>
              <div class="todo-content">
                <div class="todo-title">${todo.title}</div>
                <div class="todo-meta">
                  ${todo.due_date
                    ? html`<span class="${this._isOverdue(todo) ? 'overdue' : ''}">${this._formatDueDate(todo.due_date)}</span>`
                    : nothing}
                  ${todo.tags?.length
                    ? html`<span>${todo.tags.join(', ')}</span>`
                    : nothing}
                </div>
              </div>
              <div class="todo-actions">
                <button class="delete-btn" @click=${() => this._handleDelete(todo.id)}>
                  <span class="material-symbols-outlined" style="font-size:16px">close</span>
                </button>
              </div>
            </div>
          `)
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'todo-panel': TodoPanel;
  }
}
