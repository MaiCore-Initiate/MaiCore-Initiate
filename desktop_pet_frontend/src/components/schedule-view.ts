/* =============================================
   Schedule View - 日程视图
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared, cardStyles, m3Scrollbar } from '../styles/shared';
import { getSchedules, createSchedule, deleteSchedule } from '../api/client';
import type { ScheduleEvent, CreateScheduleParams, EventPriority } from '../types';
import './custom-select';

@customElement('schedule-view')
export class ScheduleView extends LitElement {
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
        color: var(--md-sys-color-on-surface);
      }

      /* Date nav */
      .date-nav {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .date-nav input[type="date"] {
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        padding: 8px 12px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .date-nav input[type="date"]:focus {
        border-color: var(--md-sys-color-primary);
      }

      /* Icon button */
      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        cursor: pointer;
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .icon-btn:hover {
        background: var(--md-sys-color-surface-container-highest);
      }

      /* View mode tabs */
      .view-tabs {
        display: flex;
        gap: 4px;
        padding: 4px;
        background: var(--md-sys-color-surface-container-low);
        border-radius: var(--md-sys-shape-corner-full);
        flex-shrink: 0;
      }
      .view-tab {
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
      .view-tab:hover {
        background: var(--md-sys-color-surface-container);
      }
      .view-tab.active {
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
      .fab:active {
        transform: scale(0.97);
      }

      /* Event list */
      .event-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-height: 0;
      }

      .event-card {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
        position: relative;
      }
      .event-card:hover {
        box-shadow: var(--md-sys-elevation-1);
      }

      .priority-bar {
        width: 4px;
        border-radius: 2px;
        flex-shrink: 0;
        align-self: stretch;
      }
      .priority-low { background: var(--md-sys-color-outline); }
      .priority-normal { background: var(--md-sys-color-primary); }
      .priority-high { background: var(--md-sys-color-tertiary); }
      .priority-urgent { background: var(--md-sys-color-error); }

      .event-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .event-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .event-time {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }
      .event-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .tag {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-secondary-container);
        color: var(--md-sys-color-on-secondary-container);
      }

      .event-actions {
        display: flex;
        align-items: flex-start;
        opacity: 0;
        transition: opacity var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .event-card:hover .event-actions {
        opacity: 1;
      }

      .delete-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-error);
        cursor: pointer;
      }
      .delete-btn:hover {
        background: var(--md-sys-color-error-container);
      }

      /* Empty state */
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

      /* Form dialog */
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-emphasized-decelerate);
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .dialog {
        background: var(--md-sys-color-surface-container-high);
        border-radius: var(--md-sys-shape-corner-extra-large);
        padding: 24px;
        width: 90%;
        max-width: 480px;
        box-shadow: var(--md-sys-elevation-3);
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: relative;
        z-index: 501;
        animation: slideUp var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
      }
      @keyframes slideUp {
        from { transform: translateY(32px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .dialog h3 {
        font-size: 22px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .field label {
        font-size: 12px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface-variant);
      }
      .field input,
      .field select,
      .field textarea {
        font-family: var(--md-sys-typescale-body-font);
        font-size: 14px;
        padding: 10px 12px;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-low);
        color: var(--md-sys-color-on-surface);
        outline: none;
        transition: border-color var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .field input:focus,
      .field select:focus,
      .field textarea:focus {
        border-color: var(--md-sys-color-primary);
      }
      .field textarea {
        resize: vertical;
        min-height: 60px;
      }
      .field custom-select {
        width: 100%;
      }
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .btn-text {
        padding: 8px 16px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-primary);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .btn-text:hover {
        background: var(--md-sys-color-primary-container);
      }
      .btn-filled {
        padding: 8px 20px;
        border: none;
        border-radius: var(--md-sys-shape-corner-full);
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .btn-filled:hover {
        box-shadow: var(--md-sys-elevation-1);
      }
      .btn-filled:disabled {
        opacity: 0.38;
        cursor: not-allowed;
      }
    `,
  ];

  @state() private _events: ScheduleEvent[] = [];
  @state() private _selectedDate = this._todayStr();
  @state() private _showDialog = false;
  @state() private _loading = false;
  @state() private _viewMode: 'day' | 'month' | 'all' = 'day';
  @state() private _formPriority: EventPriority = 'normal';
  @state() private _formRepeatType: string = 'none';
  @state() private _formReminderMinutes: number = 15;

  override connectedCallback() {
    super.connectedCallback();
    this._fetchEvents();
  }

  private _todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private _getMonthStr(date: string): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private async _fetchEvents() {
    this._loading = true;
    try {
      if (this._viewMode === 'all') {
        // 获取全部日程（不传日期参数）
        this._events = await getSchedules('');
      } else if (this._viewMode === 'month') {
        // 获取当月日程（需要后端支持月份查询，暂时获取全部再过滤）
        const allEvents = await getSchedules('');
        const monthStr = this._getMonthStr(this._selectedDate);
        this._events = allEvents.filter(e => e.start_time.startsWith(monthStr));
      } else {
        // 日视图
        this._events = await getSchedules(this._selectedDate);
      }
    } catch (e) {
      console.error('Failed to fetch schedules:', e);
      this._events = [];
    } finally {
      this._loading = false;
    }
  }

  private _onDateChange(e: Event) {
    this._selectedDate = (e.target as HTMLInputElement).value;
    this._fetchEvents();
  }

  private _prevDay() {
    const d = new Date(this._selectedDate);
    d.setDate(d.getDate() - 1);
    this._selectedDate = d.toISOString().slice(0, 10);
    this._fetchEvents();
  }

  private _nextDay() {
    const d = new Date(this._selectedDate);
    d.setDate(d.getDate() + 1);
    this._selectedDate = d.toISOString().slice(0, 10);
    this._fetchEvents();
  }

  private _switchViewMode(mode: 'day' | 'month' | 'all') {
    this._viewMode = mode;
    this._fetchEvents();
  }

  private _getEmptyMessage(): string {
    if (this._viewMode === 'all') return '暂无日程';
    if (this._viewMode === 'month') return '本月没有日程';
    return '今天没有日程';
  }

  private _formatDate(isoTime: string): string {
    const d = new Date(isoTime);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  private async _handleDelete(id: string) {
    try {
      await deleteSchedule(id);
      this._events = this._events.filter(e => e.id !== id);
    } catch (e) {
      console.error('Failed to delete schedule:', e);
    }
  }

  private async _handleCreate(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);

    const params: CreateScheduleParams = {
      title: fd.get('title') as string,
      description: fd.get('description') as string || undefined,
      start_time: `${fd.get('start_date')}T${fd.get('start_time') || '00:00'}:00`,
      end_time: fd.get('end_time') ? `${fd.get('start_date')}T${fd.get('end_time')}:00` : undefined,
      priority: this._formPriority,
      repeat_type: this._formRepeatType as any,
      remind_before_minutes: this._formReminderMinutes,
      tags: (fd.get('tags') as string)?.split(',').map(t => t.trim()).filter(Boolean),
      location: fd.get('location') as string || undefined,
    };

    try {
      const created = await createSchedule(params);
      this._events = [...this._events, created];
      this._showDialog = false;
      // 重置表单
      this._formPriority = 'normal';
      this._formRepeatType = 'none';
      this._formReminderMinutes = 15;
    } catch (err) {
      console.error('Failed to create schedule:', err);
    }
  }

  private _formatTime(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  }

  override render() {
    return html`
      <div class="header">
        <h2>日程</h2>
        <button class="fab" @click=${() => (this._showDialog = true)}>
          <span class="material-symbols-outlined">add</span>
          新建日程
        </button>
      </div>

      <div class="view-tabs">
        <button
          class="view-tab ${this._viewMode === 'day' ? 'active' : ''}"
          @click=${() => this._switchViewMode('day')}>
          日视图
        </button>
        <button
          class="view-tab ${this._viewMode === 'month' ? 'active' : ''}"
          @click=${() => this._switchViewMode('month')}>
          月视图
        </button>
        <button
          class="view-tab ${this._viewMode === 'all' ? 'active' : ''}"
          @click=${() => this._switchViewMode('all')}>
          全部
        </button>
      </div>

      ${this._viewMode !== 'all' ? html`
        <div class="date-nav">
          <button class="icon-btn" @click=${this._prevDay}>
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <input type="date" .value=${this._selectedDate} @change=${this._onDateChange} />
          <button class="icon-btn" @click=${this._nextDay}>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
          <button class="icon-btn" @click=${() => { this._selectedDate = this._todayStr(); this._fetchEvents(); }}>
            <span class="material-symbols-outlined">today</span>
          </button>
        </div>
      ` : nothing}

      <div class="event-list">
        ${this._events.length === 0 && !this._loading
          ? html`
            <div class="empty">
              <span class="material-symbols-outlined">event_busy</span>
              <span class="body-medium">${this._getEmptyMessage()}</span>
            </div>`
          : this._events.map(ev => html`
            <div class="event-card">
              <div class="priority-bar priority-${ev.priority}"></div>
              <div class="event-content">
                <div class="event-title">${ev.title}</div>
                <div class="event-time">
                  ${this._viewMode === 'all' || this._viewMode === 'month'
                    ? html`${this._formatDate(ev.start_time)} | `
                    : nothing}
                  ${ev.all_day ? '全天' : `${this._formatTime(ev.start_time)} - ${this._formatTime(ev.end_time)}`}
                  ${ev.location ? html` | ${ev.location}` : nothing}
                </div>
                ${ev.tags?.length
                  ? html`<div class="event-tags">${ev.tags.map(t => html`<span class="tag">${t}</span>`)}</div>`
                  : nothing}
              </div>
              <div class="event-actions">
                <button class="delete-btn" @click=${() => this._handleDelete(ev.id)}
                  title="删除">
                  <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                </button>
              </div>
            </div>
          `)
        }
      </div>

      ${this._showDialog ? this._renderDialog() : nothing}
    `;
  }

  private _renderDialog() {
    return html`
      <div class="dialog-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this._showDialog = false; }}>
        <div class="dialog">
          <h3>新建日程</h3>
          <form @submit=${this._handleCreate}>
            <div class="field">
              <label>标题 *</label>
              <input name="title" required placeholder="日程标题" />
            </div>
            <div class="field">
              <label>描述</label>
              <textarea name="description" placeholder="可选描述"></textarea>
            </div>
            <div class="field">
              <label>日期 *</label>
              <input name="start_date" type="date" required .value=${this._selectedDate} />
            </div>
            <div style="display:flex;gap:8px">
              <div class="field" style="flex:1">
                <label>开始时间</label>
                <input name="start_time" type="time" />
              </div>
              <div class="field" style="flex:1">
                <label>结束时间</label>
                <input name="end_time" type="time" />
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <div class="field" style="flex:1">
                <label>优先级</label>
                <custom-select
                  .options=${[
                    { value: 'low', label: '低' },
                    { value: 'normal', label: '普通' },
                    { value: 'high', label: '高' },
                    { value: 'urgent', label: '紧急' }
                  ]}
                  .value=${this._formPriority}
                  @change=${(e: CustomEvent) => this._formPriority = e.detail.value as EventPriority}
                ></custom-select>
              </div>
              <div class="field" style="flex:1">
                <label>地点</label>
                <input name="location" placeholder="可选" />
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <div class="field" style="flex:1">
                <label>重复类型</label>
                <custom-select
                  .options=${[
                    { value: 'none', label: '不重复' },
                    { value: 'daily', label: '每日' },
                    { value: 'weekly', label: '每周' },
                    { value: 'monthly', label: '每月' },
                    { value: 'yearly', label: '每年' }
                  ]}
                  .value=${this._formRepeatType}
                  @change=${(e: CustomEvent) => this._formRepeatType = e.detail.value}
                ></custom-select>
              </div>
              <div class="field" style="flex:1">
                <label>提前提醒</label>
                <custom-select
                  .options=${[
                    { value: '0', label: '不提醒' },
                    { value: '5', label: '5分钟前' },
                    { value: '15', label: '15分钟前' },
                    { value: '30', label: '30分钟前' },
                    { value: '60', label: '1小时前' },
                    { value: '1440', label: '1天前' }
                  ]}
                  .value=${String(this._formReminderMinutes)}
                  @change=${(e: CustomEvent) => this._formReminderMinutes = parseInt(e.detail.value)}
                ></custom-select>
              </div>
            </div>
            <div class="field">
              <label>标签（逗号分隔）</label>
              <input name="tags" placeholder="工作, 会议" />
            </div>
            <div class="dialog-actions">
              <button type="button" class="btn-text" @click=${() => (this._showDialog = false)}>取消</button>
              <button type="submit" class="btn-filled">创建</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'schedule-view': ScheduleView;
  }
}
