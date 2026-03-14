/* =============================================
   Pet Overlay - 桌宠桌面悬浮窗口
   透明背景 + Live2D + 气泡对话 + 右键菜单
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';
import { getTodos, getSchedules, getDesktopPetSettings, sendChatMessage } from '../api/client';
import type { TodoItem, ScheduleEvent } from '../types';

// Lazy-load live2d-viewer to avoid pixi.js blocking the main component
import('./live2d-viewer').catch(() => {
  console.warn('Live2D viewer failed to load - running without it');
});

@customElement('pet-overlay')
export class PetOverlay extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: block;
        width: 100vw;
        height: 100vh;
        background: transparent !important;
        user-select: none;
        cursor: default;
        --pet-overlay-float-width: clamp(220px, 72vw, 380px);
        --pet-overlay-head-top: clamp(10px, 6vh, 34px);
        --pet-overlay-head-gap: clamp(10px, 2.2vh, 16px);
        --pet-overlay-glass-blur: 20px;
        --pet-overlay-bottom-gap: clamp(56px, 11vh, 108px);
        --pet-bubble-bg: linear-gradient(180deg, rgba(247, 250, 247, 0.94), rgba(228, 234, 232, 0.9));
        --pet-bubble-text: #10161c;
        --pet-bubble-border: rgba(255,255,255,0.72);
        --pet-bubble-shadow: 0 16px 34px rgba(7, 12, 18, 0.22);
        --pet-composer-bg: linear-gradient(180deg, rgba(245, 248, 248, 0.94), rgba(220, 228, 230, 0.9));
        --pet-composer-text: #10161c;
        --pet-composer-border: rgba(255,255,255,0.72);
        --pet-textarea-bg: rgba(255,255,255,0.38);
        --pet-textarea-text: #11181f;
        --pet-textarea-placeholder: rgba(17, 24, 31, 0.52);
        --pet-hint-text: rgba(17, 24, 31, 0.7);
        --pet-send-bg: rgba(15, 22, 29, 0.82);
        --pet-send-bg-hover: rgba(15, 22, 29, 0.92);
        --pet-send-text: rgba(255,255,255,0.96);
        --pet-toggle-bg: rgba(20, 27, 34, 0.15);
        --pet-toggle-bg-hover: rgba(20, 27, 34, 0.84);
        --pet-toggle-border: rgba(255,255,255,0.32);
        --pet-toggle-text: rgba(255,255,255,0.94);
        --pet-toggle-idle-opacity: 0.15;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --pet-bubble-bg: linear-gradient(180deg, rgba(19, 25, 31, 0.94), rgba(9, 13, 18, 0.92));
          --pet-bubble-text: rgba(247, 251, 255, 0.98);
          --pet-bubble-border: rgba(255,255,255,0.12);
          --pet-bubble-shadow: 0 18px 36px rgba(0, 0, 0, 0.42);
          --pet-composer-bg: linear-gradient(180deg, rgba(23, 29, 36, 0.95), rgba(10, 14, 19, 0.92));
          --pet-composer-text: rgba(246, 250, 255, 0.98);
          --pet-composer-border: rgba(255,255,255,0.14);
          --pet-textarea-bg: rgba(5, 8, 13, 0.22);
          --pet-textarea-text: rgba(246, 250, 255, 0.97);
          --pet-textarea-placeholder: rgba(240, 245, 255, 0.48);
          --pet-hint-text: rgba(239, 244, 255, 0.72);
          --pet-send-bg: rgba(255,255,255,0.16);
          --pet-send-bg-hover: rgba(255,255,255,0.24);
          --pet-send-text: rgba(255,255,255,0.96);
          --pet-toggle-bg: rgba(255,255,255,0.15);
          --pet-toggle-bg-hover: rgba(36, 44, 52, 0.88);
          --pet-toggle-border: rgba(255,255,255,0.22);
          --pet-toggle-text: rgba(255,255,255,0.95);
        }
      }

      .container {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Chat bubble floating above the pet */
      .bubble-area {
        position: absolute;
        top: var(--pet-overlay-head-top);
        left: 50%;
        transform: translate(
          calc(-50% + var(--pet-bubble-offset-x, 0px)),
          var(--pet-bubble-offset-y, 0px)
        );
        z-index: 10;
        width: min(var(--pet-overlay-float-width), calc(100vw - 24px));
        pointer-events: none;
        display: flex;
        justify-content: center;
      }
      .bubble {
        background: var(--pet-bubble-bg);
        color: var(--pet-bubble-text);
        padding: 12px 16px;
        border-radius: 18px;
        border: 1px solid var(--pet-bubble-border);
        font-size: clamp(12px, 2.7vw, 13px);
        line-height: 1.45;
        font-weight: 500;
        letter-spacing: 0.01em;
        font-family: 'Noto Sans SC', system-ui, sans-serif;
        box-shadow: var(--pet-bubble-shadow);
        max-width: 100%;
        word-break: break-word;
        white-space: pre-wrap;
        animation: bubbleIn 300ms ease-out;
        pointer-events: auto;
        position: relative;
        backdrop-filter: blur(var(--pet-overlay-glass-blur));
        -webkit-backdrop-filter: blur(var(--pet-overlay-glass-blur));
        cursor: grab;
      }
      .bubble.dragging {
        cursor: grabbing;
      }
      .bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -8px;
        transform: translateX(-50%);
        width: 18px;
        height: 12px;
        background: inherit;
        clip-path: polygon(50% 100%, 0 0, 100% 0);
        filter: drop-shadow(0 3px 4px rgba(0,0,0,0.08));
      }
      @keyframes bubbleIn {
        from { opacity: 0; transform: translateY(8px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .bubble-fade {
        animation: bubbleOut 300ms var(--md-sys-motion-easing-emphasized-accelerate) forwards;
      }
      @keyframes bubbleOut {
        to { opacity: 0; transform: translateY(-4px) scale(0.97); }
      }

      /* Live2D area - takes most of the window */
      .live2d-area {
        flex: 1;
        width: 100%;
      }

      .chat-launcher {
        position: absolute;
        left: 14px;
        bottom: 14px;
        z-index: 12;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--pet-overlay-head-gap);
        pointer-events: none;
      }
      .chat-toggle {
        pointer-events: auto;
        width: 42px;
        height: 42px;
        padding: 0;
        border: 1px solid var(--pet-toggle-border);
        border-radius: 50%;
        background: var(--pet-toggle-bg);
        backdrop-filter: blur(var(--pet-overlay-glass-blur));
        -webkit-backdrop-filter: blur(var(--pet-overlay-glass-blur));
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        color: var(--pet-toggle-text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: var(--pet-toggle-idle-opacity);
        transition: transform 180ms ease, background 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
      }
      .chat-toggle:hover {
        transform: translateY(-1px);
        background: var(--pet-toggle-bg-hover);
        box-shadow: 0 14px 28px rgba(0,0,0,0.24);
        opacity: 1;
      }
      .chat-toggle:focus-visible {
        opacity: 1;
        outline: 2px solid rgba(255,255,255,0.65);
        outline-offset: 2px;
      }
      .chat-toggle .material-symbols-outlined {
        font-size: 18px;
        font-variation-settings: 'FILL' 1, 'wght' 500;
      }
      .chat-composer-wrap {
        position: absolute;
        left: 50%;
        bottom: var(--pet-overlay-bottom-gap);
        transform: translateX(-50%);
        z-index: 12;
        width: min(var(--pet-overlay-float-width), calc(100vw - 24px));
        pointer-events: none;
      }
      .chat-composer {
        pointer-events: auto;
        width: 100%;
        min-width: 0;
        padding: clamp(12px, 3vw, 14px);
        border-radius: 22px;
        background: var(--pet-composer-bg);
        color: var(--pet-composer-text);
        border: 1px solid var(--pet-composer-border);
        box-shadow:
          0 22px 46px rgba(0,0,0,0.28),
          inset 0 1px 0 rgba(255,255,255,0.08);
        backdrop-filter: blur(var(--pet-overlay-glass-blur));
        -webkit-backdrop-filter: blur(var(--pet-overlay-glass-blur));
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .chat-composer textarea {
        width: 100%;
        min-height: clamp(72px, 18vh, 108px);
        max-height: clamp(104px, 30vh, 164px);
        resize: none;
        border: none;
        outline: none;
        background: var(--pet-textarea-bg);
        color: var(--pet-textarea-text);
        border-radius: 16px;
        padding: 12px 14px;
        box-sizing: border-box;
        font-size: clamp(12px, 2.8vw, 14px);
        line-height: 1.5;
        font-family: 'Noto Sans SC', system-ui, sans-serif;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          inset 0 0 0 1px rgba(255,255,255,0.04);
      }
      .chat-composer textarea::placeholder {
        color: var(--pet-textarea-placeholder);
      }
      .chat-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .chat-hint {
        font-size: clamp(10px, 2.4vw, 11px);
        color: var(--pet-hint-text);
        font-weight: 500;
      }
      .chat-send {
        border: none;
        border-radius: 999px;
        background: var(--pet-send-bg);
        color: var(--pet-send-text);
        padding: 10px 14px;
        min-width: 76px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        transition: background 180ms ease, transform 180ms ease;
      }
      .chat-send:hover:not(:disabled) {
        background: var(--pet-send-bg-hover);
        transform: translateY(-1px);
      }
      .chat-send:disabled {
        cursor: wait;
        opacity: 0.66;
      }

      /* Drag handle - invisible, covers the model area */
      .drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        -webkit-app-region: no-drag;
        cursor: grab;
        z-index: 5;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
    `,
  ];

  @state() private _bubbleText = '';
  @state() private _bubbleFading = false;
  @state() private _bubbleOffsetX = 0;
  @state() private _bubbleOffsetY = 0;
  @state() private _composerOpen = false;
  @state() private _draftMessage = '';
  @state() private _sending = false;

  @query('.composer-input') private _composerInput?: HTMLTextAreaElement;

  private _bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private _dragging = false;
  /** Queued bubble messages waiting to display */
  private _bubbleQueue: Array<{ text: string; duration: number }> = [];
  private _hourlyTimer: ReturnType<typeof setTimeout> | null = null;
  private _reminderTimer: ReturnType<typeof setInterval> | null = null;
  private _bubbleDragging = false;
  private _bubbleDragOrigin: { x: number; y: number; offsetX: number; offsetY: number } | null = null;
  /** Set of already-reminded item IDs to avoid duplicate alerts */
  private _remindedIds = new Set<string>();

  private static readonly BUBBLE_OFFSET_X_KEY = 'pet-bubble-offset-x';
  private static readonly BUBBLE_OFFSET_Y_KEY = 'pet-bubble-offset-y';

  override connectedCallback() {
    super.connectedCallback();
    try {
      this._bubbleOffsetX = Number(localStorage.getItem(PetOverlay.BUBBLE_OFFSET_X_KEY) || '0') || 0;
      this._bubbleOffsetY = Number(localStorage.getItem(PetOverlay.BUBBLE_OFFSET_Y_KEY) || '0') || 0;
    } catch {
      this._bubbleOffsetX = 0;
      this._bubbleOffsetY = 0;
    }
    // Show a greeting bubble briefly on start (auto-hide after 5s)
    void this._showConfiguredGreeting();

    // Start hourly chime
    this._scheduleHourlyChime();

    // Start todo/schedule reminder polling (every 30s)
    this._reminderTimer = setInterval(() => this._checkReminders(), 30_000);
    // Initial check after 6s (let greeting bubble finish first)
    setTimeout(() => this._checkReminders(), 6000);

    // Listen for native menu actions from Electron
    window.electronAPI?.onMenuAction((action, data) => {
      if (action === 'expression' && data) {
        this._setExpression(data);
      } else if (action === 'clear-expression') {
        this._clearExpression();
      } else if (action === 'schedule' || action === 'todo' || action === 'chat' || action === 'settings') {
        window.electronAPI?.openPanel(action);
      }
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (this._hourlyTimer) clearTimeout(this._hourlyTimer);
    if (this._reminderTimer) clearInterval(this._reminderTimer);
  }

  /** Show a temporary chat bubble above the pet. durationMs=0 means persistent. */
  private _showBubble(text: string, durationMs = 5000) {
    // If a bubble is currently showing, queue the new one
    if (this._bubbleText && text !== this._bubbleText) {
      this._bubbleQueue.push({ text, duration: durationMs });
      return;
    }
    this._bubbleFading = false;
    this._bubbleText = text;
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (durationMs <= 0) return; // persistent bubble
    this._bubbleTimer = setTimeout(() => {
      this._bubbleFading = true;
      setTimeout(() => {
        this._bubbleText = '';
        this._bubbleFading = false;
        // Show next queued bubble
        this._processQueue();
      }, 300);
    }, durationMs);
  }

  private async _showConfiguredGreeting() {
    let greeting = 'Hi~ 我是你的桌宠！右键点我打开菜单~';
    try {
      const settings = await getDesktopPetSettings();
      const personaName = String(settings?.persona?.name ?? '').trim();
      const personaGreeting = String(settings?.persona?.greeting ?? '').trim();
      if (personaGreeting) {
        greeting = personaName ? `${personaName}：${personaGreeting}` : personaGreeting;
      }
    } catch {
      // ignore
    }
    this._showBubble(greeting, 5000);
  }

  private _processQueue() {
    if (this._bubbleQueue.length === 0) return;
    const next = this._bubbleQueue.shift()!;
    // Small delay so the fade-out finishes visually
    setTimeout(() => this._showBubble(next.text, next.duration), 200);
  }

  /* ---- Hourly chime (整点报时) ---- */

  private _scheduleHourlyChime() {
    const now = new Date();
    // Milliseconds until the next full hour
    const msToNext = (60 - now.getMinutes()) * 60_000
                   - now.getSeconds() * 1000
                   - now.getMilliseconds();
    this._hourlyTimer = setTimeout(() => {
      this._onHourlyChime();
      // Then repeat every hour
      this._hourlyTimer = setInterval(() => this._onHourlyChime(), 3_600_000) as any;
    }, msToNext);
  }

  private _onHourlyChime() {
    const h = new Date().getHours();
    const period = h < 6 ? '深夜' : h < 9 ? '早上' : h < 12 ? '上午'
                 : h === 12 ? '中午' : h < 14 ? '下午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
    const greetings: Record<string, string> = {
      '深夜': '夜深了，注意休息哦~',
      '早上': '早安！新的一天开始啦~',
      '上午': '上午好，加油工作！',
      '中午': '中午啦，记得吃饭哦~',
      '下午': '下午好，继续加油！',
      '晚上': '晚上好，辛苦啦~',
    };
    const greeting = greetings[period] || '';
    this._showBubble(`🕐 ${period}${h}点了！${greeting}`, 6000);
  }

  /* ---- Todo & Schedule reminders (待办/日程提醒) ---- */

  private async _checkReminders() {
    const now = Date.now();
    try {
      await Promise.all([
        this._checkTodoReminders(now),
        this._checkScheduleReminders(now),
      ]);
    } catch {
      // Silently ignore network errors — will retry next cycle
    }
  }

  private async _checkTodoReminders(now: number) {
    const todos: TodoItem[] = await getTodos();
    for (const t of todos) {
      if (t.is_deleted || t.status === 'done' || t.status === 'cancelled') continue;
      if (!t.due_date) continue;
      const due = new Date(t.due_date).getTime();
      if (isNaN(due)) continue;
      const diff = due - now;
      const key = `todo-${t.id}`;
      // Already reminded
      if (this._remindedIds.has(key)) continue;
      // Remind if overdue or within 15 minutes
      if (diff <= 15 * 60_000) {
        this._remindedIds.add(key);
        if (diff <= 0) {
          this._showBubble(`⚠️ 待办已过期：${t.title}`, 8000);
        } else {
          const mins = Math.ceil(diff / 60_000);
          this._showBubble(`📋 待办提醒：「${t.title}」将在${mins}分钟后到期`, 8000);
        }
      }
    }
  }

  private async _checkScheduleReminders(now: number) {
    const today = new Date().toISOString().slice(0, 10);
    const events: ScheduleEvent[] = await getSchedules(today);
    for (const ev of events) {
      if (ev.is_deleted) continue;
      const start = new Date(ev.start_time).getTime();
      if (isNaN(start)) continue;
      const remindMs = (ev.remind_before_minutes ?? 15) * 60_000;
      const diff = start - now;
      const key = `sched-${ev.id}`;
      if (this._remindedIds.has(key)) continue;
      // Remind when within remind_before_minutes window
      if (diff <= remindMs && diff > -5 * 60_000) {
        this._remindedIds.add(key);
        if (diff <= 0) {
          this._showBubble(`📅 日程开始了：${ev.title}`, 8000);
        } else {
          const mins = Math.ceil(diff / 60_000);
          this._showBubble(`📅 日程提醒：「${ev.title}」将在${mins}分钟后开始`, 8000);
        }
      }
    }
  }

  /* ---- Window dragging via IPC ---- */

  private _onDragStart = (e: PointerEvent) => {
    // Only left button
    if (e.button !== 0) return;
    this._dragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    window.electronAPI?.petDragStart();
  };

  private _onDragEnd = (e: PointerEvent) => {
    if (!this._dragging) return;
    this._dragging = false;
    window.electronAPI?.petDragEnd();
  };

  /* ---- Scroll to zoom (left button + wheel) ---- */

  private _onWheel = (e: WheelEvent) => {
    // Only zoom when left mouse button is held down
    if (!(e.buttons & 1)) return;
    e.preventDefault();
    // deltaY < 0 = scroll up = zoom in
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    window.electronAPI?.zoomPetWindow(delta);
  };

  /* ---- Context menu (native via Electron IPC) ---- */

  private _onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Get expression names from viewer, then show native menu
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    const expressions: string[] = viewer?.getExpressionNames?.() || [];
    window.electronAPI?.showPetContextMenu(expressions);
  };

  private async _setExpression(name: string) {
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    if (viewer) {
      const ok = await viewer.setExpressionByName?.(name);
      if (ok) {
        this._showBubble(`表情: ${name}`, 2000);
      }
    }
  }

  private _clearExpression() {
    const viewer = this.shadowRoot?.querySelector('live2d-viewer') as any;
    if (viewer) {
      viewer.clearOverlayExpression?.();
      this._showBubble('已恢复默认', 2000);
    }
  }

  private async _toggleComposer() {
    const nextOpen = !this._composerOpen;
    this._composerOpen = nextOpen;
    if (!nextOpen) return;
    await this.updateComplete;
    this._composerInput?.focus();
  }

  private _onDraftInput(e: Event) {
    this._draftMessage = (e.target as HTMLTextAreaElement).value;
  }

  private async _sendQuickMessage() {
    const text = this._draftMessage.trim();
    if (!text || this._sending) return;
    this._sending = true;
    this._showBubble(`我：${text}`, 3200);
    try {
      const result = await sendChatMessage(text);
      const reply = String(result?.reply ?? '').trim() || '我刚刚走神了一下，再和我说一次吧~';
      this._draftMessage = '';
      this._composerOpen = false;
      this._showBubble(reply, 8000);
    } catch {
      this._showBubble('消息没发出去，检查一下桌宠后端连接哦~', 5000);
    } finally {
      this._sending = false;
    }
  }

  private _onDraftKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this._sendQuickMessage();
    }
  }

  private _persistBubbleOffset() {
    try {
      localStorage.setItem(PetOverlay.BUBBLE_OFFSET_X_KEY, String(Math.round(this._bubbleOffsetX)));
      localStorage.setItem(PetOverlay.BUBBLE_OFFSET_Y_KEY, String(Math.round(this._bubbleOffsetY)));
    } catch {
      // ignore storage failures
    }
  }

  private _onBubblePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    this._bubbleDragging = true;
    this._bubbleDragOrigin = {
      x: e.clientX,
      y: e.clientY,
      offsetX: this._bubbleOffsetX,
      offsetY: this._bubbleOffsetY,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  private _onBubblePointerMove(e: PointerEvent) {
    if (!this._bubbleDragging || !this._bubbleDragOrigin) return;
    const dx = e.clientX - this._bubbleDragOrigin.x;
    const dy = e.clientY - this._bubbleDragOrigin.y;
    this._bubbleOffsetX = this._bubbleDragOrigin.offsetX + dx;
    this._bubbleOffsetY = this._bubbleDragOrigin.offsetY + dy;
  }

  private _onBubblePointerUp(e: PointerEvent) {
    if (!this._bubbleDragging) return;
    this._bubbleDragging = false;
    this._bubbleDragOrigin = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    this._persistBubbleOffset();
  }

  private _resetBubblePosition() {
    this._bubbleOffsetX = 0;
    this._bubbleOffsetY = 0;
    this._persistBubbleOffset();
  }

  override render() {
    return html`
      <div class="container" @contextmenu=${this._onContextMenu}>

        <!-- Chat bubble -->
        ${this._bubbleText
          ? html`
            <div class="bubble-area" style=${`--pet-bubble-offset-x:${this._bubbleOffsetX}px; --pet-bubble-offset-y:${this._bubbleOffsetY}px;`}>
              <div
                class="bubble ${this._bubbleFading ? 'bubble-fade' : ''} ${this._bubbleDragging ? 'dragging' : ''}"
                title="按住拖动对话框，双击复位"
                @pointerdown=${this._onBubblePointerDown}
                @pointermove=${this._onBubblePointerMove}
                @pointerup=${this._onBubblePointerUp}
                @pointercancel=${this._onBubblePointerUp}
                @dblclick=${this._resetBubblePosition}
              >
                ${this._bubbleText}
              </div>
            </div>`
          : nothing}

        <!-- Drag handle (transparent, sits on top of Live2D) -->
        <div class="drag-handle"
          @pointerdown=${this._onDragStart}
          @pointerup=${this._onDragEnd}
          @pointercancel=${this._onDragEnd}
          @wheel=${this._onWheel}>
        </div>

        <!-- Live2D model -->
        <div class="live2d-area">
          <live2d-viewer></live2d-viewer>
        </div>

        ${this._composerOpen
          ? html`
            <div class="chat-composer-wrap">
              <div class="chat-composer">
                <textarea
                  class="composer-input"
                  .value=${this._draftMessage}
                  placeholder="想和桌宠说点什么呀..."
                  @input=${this._onDraftInput}
                  @keydown=${this._onDraftKeydown}
                ></textarea>
                <div class="chat-actions">
                  <span class="chat-hint">Enter 发送，Shift+Enter 换行</span>
                  <button class="chat-send" ?disabled=${this._sending || !this._draftMessage.trim()}
                    @click=${() => void this._sendQuickMessage()}>
                    <span class="material-symbols-outlined" style="font-size:16px">send</span>
                    ${this._sending ? '发送中' : '发送'}
                  </button>
                </div>
              </div>
            </div>`
          : nothing}

        <div class="chat-launcher">
          <button class="chat-toggle" title="快捷发送消息" @click=${() => void this._toggleComposer()}>
            <span class="material-symbols-outlined">${this._composerOpen ? 'close' : 'chat_bubble'}</span>
          </button>
        </div>

      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pet-overlay': PetOverlay;
  }
}
