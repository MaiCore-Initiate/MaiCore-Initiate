/* =============================================
   Chat Bubble - 会话聊天与历史记录页
   ============================================= */

import { LitElement, css, html, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { m3Shared, m3Scrollbar } from '../styles/shared';
import {
  activateChatSession,
  createChatSession,
  getChatMessages,
  getChatSessions,
  sendChatMessageToSession,
} from '../api/client';
import type { ChatRecordMessage, ChatSession } from '../types';

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  pending?: boolean;
};

@customElement('chat-bubble')
export class ChatBubble extends LitElement {
  static override styles = [
    m3Shared,
    m3Scrollbar,
    css`
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }

      .shell {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        background:
          radial-gradient(circle at top left, rgba(92, 132, 214, 0.1), transparent 42%),
          radial-gradient(circle at bottom right, rgba(76, 160, 122, 0.12), transparent 38%),
          var(--md-sys-color-surface);
      }

      .sessions {
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 18px 14px 14px;
        border-right: 1px solid var(--md-sys-color-outline-variant);
        background: color-mix(in srgb, var(--md-sys-color-surface-container-low) 88%, transparent);
        backdrop-filter: blur(18px);
      }

      .sessions-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .sessions-title {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .sessions-title .eyebrow {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--md-sys-color-primary);
      }

      .sessions-title .headline {
        font-size: 20px;
        line-height: 24px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
      }

      .sessions-title .hint {
        font-size: 12px;
        line-height: 18px;
        color: var(--md-sys-color-on-surface-variant);
      }

      .new-session-btn {
        width: 42px;
        height: 42px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 16px;
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        cursor: pointer;
        box-shadow: var(--md-sys-elevation-1);
        transition: transform 120ms ease, box-shadow 160ms ease;
        flex-shrink: 0;
      }

      .new-session-btn:hover {
        transform: translateY(-1px);
        box-shadow: var(--md-sys-elevation-2);
      }

      .new-session-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .session-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow-y: auto;
        padding-right: 4px;
      }

      .session-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 14px 12px;
        border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 68%, transparent);
        border-radius: 18px;
        background: color-mix(in srgb, var(--md-sys-color-surface) 82%, transparent);
        cursor: pointer;
        text-align: left;
        transition: transform 120ms ease, border-color 160ms ease, background 160ms ease;
      }

      .session-card:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--md-sys-color-primary) 36%, var(--md-sys-color-outline-variant));
      }

      .session-card.active {
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--md-sys-color-primary-container) 82%, transparent), transparent 160%),
          color-mix(in srgb, var(--md-sys-color-surface-container-high) 72%, transparent);
        border-color: color-mix(in srgb, var(--md-sys-color-primary) 52%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent);
      }

      .session-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .session-name {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .session-time {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        flex-shrink: 0;
      }

      .session-preview {
        font-size: 12px;
        line-height: 18px;
        min-height: 36px;
        color: var(--md-sys-color-on-surface-variant);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .session-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
      }

      .chat {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }

      .chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 22px 16px;
        border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent);
        backdrop-filter: blur(14px);
        background: color-mix(in srgb, var(--md-sys-color-surface) 80%, transparent);
      }

      .chat-title {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .chat-title .headline {
        font-size: 18px;
        line-height: 24px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chat-title .subline {
        font-size: 12px;
        line-height: 18px;
        color: var(--md-sys-color-on-surface-variant);
      }

      .error-banner {
        margin: 12px 22px 0;
        padding: 10px 12px;
        border-radius: 14px;
        background: color-mix(in srgb, #b3261e 12%, var(--md-sys-color-surface));
        border: 1px solid color-mix(in srgb, #b3261e 24%, transparent);
        color: color-mix(in srgb, #b3261e 78%, var(--md-sys-color-on-surface));
        font-size: 12px;
        line-height: 18px;
      }

      .messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 20px 22px 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .message {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: min(78%, 680px);
        animation: message-in 160ms ease;
      }

      @keyframes message-in {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .message.user {
        align-self: flex-end;
      }

      .message.assistant {
        align-self: flex-start;
      }

      .message.tool {
        align-self: center;
        max-width: min(88%, 720px);
      }

      .bubble {
        padding: 12px 16px;
        border-radius: 20px;
        font-size: 14px;
        line-height: 22px;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: var(--md-sys-elevation-1);
      }

      .message.user .bubble {
        background: linear-gradient(135deg, color-mix(in srgb, var(--md-sys-color-primary) 94%, white 6%), color-mix(in srgb, var(--md-sys-color-primary) 72%, black 10%));
        color: var(--md-sys-color-on-primary);
        border-bottom-right-radius: 6px;
      }

      .message.assistant .bubble {
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--md-sys-color-surface-container-highest) 88%, transparent), color-mix(in srgb, var(--md-sys-color-surface-container-high) 92%, transparent));
        color: color-mix(in srgb, var(--md-sys-color-on-surface) 94%, black 6%);
        border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 56%, transparent);
        border-bottom-left-radius: 6px;
      }

      .message.tool .bubble {
        background: color-mix(in srgb, var(--md-sys-color-secondary-container) 78%, transparent);
        color: var(--md-sys-color-on-secondary-container);
        border: 1px dashed color-mix(in srgb, var(--md-sys-color-outline) 48%, transparent);
        text-align: center;
      }

      .message.pending .bubble {
        opacity: 0.8;
      }

      .message-meta {
        font-size: 11px;
        line-height: 16px;
        color: var(--md-sys-color-on-surface-variant);
      }

      .message.user .message-meta {
        text-align: right;
      }

      .typing {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 12px 14px;
        border-radius: 18px 18px 18px 6px;
        background: color-mix(in srgb, var(--md-sys-color-surface-container-high) 92%, transparent);
        border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 54%, transparent);
      }

      .typing-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--md-sys-color-on-surface-variant);
        animation: typing-bounce 1.2s ease-in-out infinite;
      }

      .typing-dot:nth-child(2) {
        animation-delay: 0.15s;
      }

      .typing-dot:nth-child(3) {
        animation-delay: 0.3s;
      }

      @keyframes typing-bounce {
        0%, 80%, 100% {
          transform: translateY(0);
          opacity: 0.45;
        }
        40% {
          transform: translateY(-5px);
          opacity: 1;
        }
      }

      .empty {
        flex: 1;
        min-height: 280px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
        padding: 32px;
      }

      .empty .material-symbols-outlined {
        font-size: 56px;
        color: var(--md-sys-color-primary);
      }

      .composer {
        padding: 14px 22px 20px;
        border-top: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 72%, transparent);
        background: color-mix(in srgb, var(--md-sys-color-surface-container-low) 84%, transparent);
        backdrop-filter: blur(18px);
      }

      .composer-box {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 56px;
        gap: 12px;
        align-items: end;
      }

      textarea {
        width: 100%;
        min-height: 54px;
        max-height: 170px;
        padding: 14px 16px;
        resize: none;
        border-radius: 18px;
        border: 1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 80%, transparent);
        background: color-mix(in srgb, var(--md-sys-color-surface) 88%, transparent);
        color: var(--md-sys-color-on-surface);
        font-size: 14px;
        line-height: 22px;
        outline: none;
        box-sizing: border-box;
        font-family: inherit;
      }

      textarea:focus {
        border-color: color-mix(in srgb, var(--md-sys-color-primary) 72%, transparent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent);
      }

      .send-btn {
        width: 56px;
        height: 56px;
        border: none;
        border-radius: 18px;
        background: var(--md-sys-color-primary);
        color: var(--md-sys-color-on-primary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--md-sys-elevation-1);
        transition: transform 120ms ease, box-shadow 160ms ease;
      }

      .send-btn:hover {
        transform: translateY(-1px);
        box-shadow: var(--md-sys-elevation-2);
      }

      .send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .composer-hint {
        margin-top: 8px;
        font-size: 11px;
        line-height: 16px;
        color: var(--md-sys-color-on-surface-variant);
      }

      @media (max-width: 860px) {
        .shell {
          grid-template-columns: 1fr;
          grid-template-rows: 210px minmax(0, 1fr);
        }

        .sessions {
          border-right: none;
          border-bottom: 1px solid var(--md-sys-color-outline-variant);
        }

        .session-list {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(220px, 1fr);
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 4px;
        }

        .message {
          max-width: 92%;
        }
      }
    `,
  ];

  @state() private _sessions: ChatSession[] = [];
  @state() private _messages: ChatRecordMessage[] = [];
  @state() private _activeSessionId = '';
  @state() private _inputText = '';
  @state() private _loading = true;
  @state() private _sending = false;
  @state() private _creating = false;
  @state() private _error = '';
  @state() private _shareMemoryHint = true;
  @state() private _pendingUserMessage: DisplayMessage | null = null;

  @query('.messages') private _messagesEl!: HTMLElement;
  @query('textarea') private _textareaEl!: HTMLTextAreaElement;

  private _autoRefreshTimer: number | null = null;
  private readonly _AUTO_REFRESH_INTERVAL = 3000; // 3秒自动刷新一次

  override connectedCallback() {
    super.connectedCallback();
    void this._bootstrap();
    this._startAutoRefresh();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._stopAutoRefresh();
  }

  private async _bootstrap() {
    this._loading = true;
    this._error = '';
    try {
      const data = await getChatSessions();
      this._sessions = data.sessions;
      this._shareMemoryHint = data.shareMemoryBetweenSessionsSameModel;
      this._activeSessionId = data.activeSessionId ?? data.sessions[0]?.id ?? '';
      if (this._activeSessionId) {
        this._messages = await getChatMessages(this._activeSessionId);
      }
      this._scrollToBottom();
    } catch (error) {
      this._error = this._stringifyError(error, '加载聊天记录失败');
    } finally {
      this._loading = false;
    }
  }

  private _startAutoRefresh() {
    this._stopAutoRefresh();
    this._autoRefreshTimer = window.setInterval(() => {
      void this._autoRefreshMessages();
    }, this._AUTO_REFRESH_INTERVAL);
  }

  private _stopAutoRefresh() {
    if (this._autoRefreshTimer !== null) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  }

  private async _autoRefreshMessages() {
    // 如果正在发送消息或加载中，跳过本次刷新
    if (this._sending || this._loading || this._creating) return;

    // 如果没有活动会话，跳过
    if (!this._activeSessionId) return;

    try {
      // 静默刷新消息列表（不显示加载状态）
      const newMessages = await getChatMessages(this._activeSessionId);

      // 只有消息数量变化时才更新（避免不必要的重渲染）
      if (newMessages.length !== this._messages.length) {
        const wasAtBottom = this._isScrolledToBottom();
        this._messages = newMessages;

        // 如果用户之前在底部，自动滚动到新消息
        if (wasAtBottom) {
          this._scrollToBottom();
        }
      }

      // 同时刷新会话列表（更新最后消息预览）
      const data = await getChatSessions();
      this._sessions = data.sessions;
    } catch (error) {
      // 静默失败，不打断用户体验
      console.warn('[自动刷新] 刷新消息失败:', error);
    }
  }

  private _isScrolledToBottom(): boolean {
    if (!this._messagesEl) return true;
    const threshold = 50; // 50px 容差
    const scrollBottom = this._messagesEl.scrollHeight - this._messagesEl.scrollTop - this._messagesEl.clientHeight;
    return scrollBottom < threshold;
  }

  private _stringifyError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private _displayMessages(): DisplayMessage[] {
    const mapped = this._messages.map((item) => ({
      id: String(item.id),
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
    }));
    if (this._pendingUserMessage) {
      mapped.push(this._pendingUserMessage);
    }
    return mapped;
  }

  private _formatTime(isoTime: string): string {
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) return '--:--';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private _formatSessionTime(isoTime: string): string {
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return this._formatTime(isoTime);
    }
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  private _sessionPreview(session: ChatSession): string {
    const lastMessage = String(session.last_message ?? '').trim();
    if (lastMessage) return lastMessage;
    return session.message_count ? `共 ${session.message_count} 条消息` : '还没有消息，开始新的聊天吧';
  }

  private async _loadSession(sessionId: string, activate = false) {
    if (!sessionId) return;
    this._error = '';
    try {
      if (activate) {
        await activateChatSession(sessionId);
      }
      this._activeSessionId = sessionId;
      this._messages = await getChatMessages(sessionId);
      this._pendingUserMessage = null;
      this._scrollToBottom();

      // 切换会话后重启自动刷新定时器
      this._startAutoRefresh();
    } catch (error) {
      this._error = this._stringifyError(error, '加载会话失败');
    }
  }

  private async _refreshSessions(preferredSessionId?: string) {
    const data = await getChatSessions();
    this._sessions = data.sessions;
    this._shareMemoryHint = data.shareMemoryBetweenSessionsSameModel;
    const nextId = preferredSessionId || data.activeSessionId || data.sessions[0]?.id || '';
    this._activeSessionId = nextId;
  }

  private async _createSession() {
    if (this._creating) return;
    this._creating = true;
    this._error = '';
    try {
      const session = await createChatSession();
      await this._refreshSessions(session.id);
      this._messages = [];
      this._activeSessionId = session.id;
      this._pendingUserMessage = null;
    } catch (error) {
      this._error = this._stringifyError(error, '新建会话失败');
    } finally {
      this._creating = false;
    }
  }

  private _scrollToBottom() {
    requestAnimationFrame(() => {
      if (!this._messagesEl) return;
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    });
  }

  private _notifyActionChanges(actions: Array<Record<string, unknown>> | undefined) {
    if (!actions?.length) return;
    const types = actions
      .map((item) => String(item.function ?? ''))
      .map((name) => {
        if (name.includes('schedule')) return 'schedule';
        if (name.includes('todo')) return 'todo';
        return '';
      })
      .filter(Boolean);
    if (!types.length) return;
    this.dispatchEvent(
      new CustomEvent('data-changed', {
        bubbles: true,
        composed: true,
        detail: { types },
      }),
    );
  }

  private async _sendMessage() {
    const text = this._inputText.trim();
    if (!text || this._sending) return;

    if (!this._activeSessionId) {
      await this._createSession();
      if (!this._activeSessionId) return;
    }

    const pendingTimestamp = new Date().toISOString();
    this._pendingUserMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: pendingTimestamp,
      pending: true,
    };
    this._inputText = '';
    this._sending = true;
    this._error = '';
    this._scrollToBottom();

    try {
      const result = await sendChatMessageToSession(text, this._activeSessionId);
      this._notifyActionChanges(result.actions);
      await this._refreshSessions(result.session_id);
      this._messages = await getChatMessages(result.session_id);
      this._activeSessionId = result.session_id;
      this._pendingUserMessage = null;
      this._scrollToBottom();

      // 发送消息后重启自动刷新定时器
      this._startAutoRefresh();
    } catch (error) {
      this._error = this._stringifyError(error, '发送消息失败');
    } finally {
      this._sending = false;
      this._pendingUserMessage = null;
      this._resizeTextarea();
    }
  }

  private _handleTextareaInput(event: Event) {
    this._inputText = (event.target as HTMLTextAreaElement).value;
    this._resizeTextarea();
  }

  private _resizeTextarea() {
    requestAnimationFrame(() => {
      if (!this._textareaEl) return;
      this._textareaEl.style.height = 'auto';
      this._textareaEl.style.height = `${Math.min(this._textareaEl.scrollHeight, 170)}px`;
    });
  }

  private _handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this._sendMessage();
    }
  }

  private _currentSession(): ChatSession | undefined {
    return this._sessions.find((item) => item.id === this._activeSessionId);
  }

  override render() {
    const currentSession = this._currentSession();
    const messages = this._displayMessages();

    return html`
      <div class="shell">
        <aside class="sessions">
          <div class="sessions-header">
            <div class="sessions-title">
              <span class="eyebrow">Chat Memory</span>
              <span class="headline">聊天记录</span>
              <span class="hint">
                ${this._shareMemoryHint ? '同一 LLM 模型下会话共享长期记忆与印象' : '每个会话使用独立记忆与印象'}
              </span>
            </div>
            <button
              class="new-session-btn"
              title="新建会话"
              ?disabled=${this._creating}
              @click=${this._createSession}
            >
              <span class="material-symbols-outlined">edit_square</span>
            </button>
          </div>

          <div class="session-list">
            ${this._sessions.map((session) => html`
              <button
                class="session-card ${session.id === this._activeSessionId ? 'active' : ''}"
                @click=${() => this._loadSession(session.id, true)}
              >
                <div class="session-top">
                  <span class="session-name">${session.title || '新会话'}</span>
                  <span class="session-time">${this._formatSessionTime(session.last_active_at)}</span>
                </div>
                <div class="session-preview">${this._sessionPreview(session)}</div>
                <div class="session-meta">
                  <span>${session.persona_name || '桌宠'}</span>
                  <span>${session.message_count ?? 0} 条</span>
                </div>
              </button>
            `)}
          </div>
        </aside>

        <section class="chat">
          <div class="chat-header">
            <div class="chat-title">
              <span class="headline">${currentSession?.title || '新会话'}</span>
              <span class="subline">
                ${currentSession
                  ? `${currentSession.persona_name || '桌宠'} · 最近活跃于 ${this._formatSessionTime(currentSession.last_active_at) || '--'}`
                  : '会话会默认续用当前模型的上一次聊天'}
              </span>
            </div>
          </div>

          ${this._error
            ? html`<div class="error-banner">${this._error}</div>`
            : nothing}

          <div class="messages">
            ${this._loading
              ? html`
                <div class="empty">
                  <span class="material-symbols-outlined">hourglass_top</span>
                  <span>正在读取会话和聊天记录...</span>
                </div>
              `
              : messages.length === 0
                ? html`
                  <div class="empty">
                    <span class="material-symbols-outlined">forum</span>
                    <span class="title-medium">新的陪伴从这里开始</span>
                    <span class="body-medium">
                      这里会显示当前会话的完整聊天记录。<br />
                      新建会话后，会默认切换到它并保存后续消息。
                    </span>
                  </div>
                `
                : messages.map((message) => html`
                  <div class="message ${message.role} ${message.pending ? 'pending' : ''}">
                    <div class="bubble">${message.content}</div>
                    <div class="message-meta">
                      ${message.pending ? '发送中...' : this._formatTime(message.timestamp)}
                    </div>
                  </div>
                `)
            }

            ${this._sending
              ? html`
                <div class="typing">
                  <div class="typing-dot"></div>
                  <div class="typing-dot"></div>
                  <div class="typing-dot"></div>
                </div>
              `
              : nothing}
          </div>

          <div class="composer">
            <div class="composer-box">
              <textarea
                rows="1"
                placeholder="和桌宠说点什么..."
                .value=${this._inputText}
                @input=${this._handleTextareaInput}
                @keydown=${this._handleKeydown}
              ></textarea>
              <button
                class="send-btn"
                ?disabled=${this._sending || !this._inputText.trim()}
                @click=${this._sendMessage}
              >
                <span class="material-symbols-outlined">send</span>
              </button>
            </div>
            <div class="composer-hint">Enter 发送，Shift + Enter 换行。当前会话会自动续用并保存到桌宠长期记忆链路。</div>
          </div>
        </section>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-bubble': ChatBubble;
  }
}
