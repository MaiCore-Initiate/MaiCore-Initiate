/* =============================================
   Settings Page - 设置页
   ============================================= */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { m3Shared, cardStyles, m3Scrollbar } from '../styles/shared';
import {
  getLive2DModels,
  switchLive2DModel,
  scanLive2DModels,
  getActiveLive2DModel,
  getDesktopPetSettings,
  patchDesktopPetSettings,
  getLLMConfig,
  updateLLMConfig,
} from '../api/client';
import type { Live2DModelInfo } from '../types';

@customElement('settings-page')
export class SettingsPage extends LitElement {
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
        gap: 20px;
        overflow-y: auto;
        user-select: none;
      }
      .header h2 {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }

      /* Section */
      .section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .section-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Model grid */
      .model-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
      }
      .model-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px 12px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        cursor: pointer;
        border: 2px solid transparent;
        transition: all var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
      }
      .model-card:hover {
        box-shadow: var(--md-sys-elevation-1);
        border-color: var(--md-sys-color-outline-variant);
      }
      .model-card.active {
        border-color: var(--md-sys-color-primary);
        background: var(--md-sys-color-primary-container);
      }
      .model-preview {
        width: 80px;
        height: 80px;
        border-radius: var(--md-sys-shape-corner-small);
        background: var(--md-sys-color-surface-container-highest);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .model-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .model-preview .material-symbols-outlined {
        font-size: 36px;
        color: var(--md-sys-color-outline);
      }
      .model-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
      .model-card.active .model-name {
        color: var(--md-sys-color-on-primary-container);
      }

      /* Action bar */
      .action-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .btn-outlined {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: var(--md-sys-shape-corner-full);
        background: transparent;
        color: var(--md-sys-color-primary);
        font-family: var(--md-sys-typescale-label-font);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .btn-outlined:hover {
        background: var(--md-sys-color-primary-container);
      }

      /* Toggle row */
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .toggle-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .toggle-label .primary {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
      }
      .toggle-label .secondary {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }

      /* Switch */
      .switch {
        position: relative;
        width: 52px;
        height: 32px;
        flex-shrink: 0;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .switch-track {
        position: absolute;
        inset: 0;
        border-radius: 16px;
        background: var(--md-sys-color-surface-container-highest);
        border: 2px solid var(--md-sys-color-outline);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
        cursor: pointer;
      }
      .switch-track::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--md-sys-color-outline);
        top: 50%;
        left: 6px;
        transform: translateY(-50%);
        transition: all var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      .switch input:checked + .switch-track {
        background: var(--md-sys-color-primary);
        border-color: var(--md-sys-color-primary);
      }
      .switch input:checked + .switch-track::after {
        background: var(--md-sys-color-on-primary);
        left: 26px;
        width: 20px;
        height: 20px;
      }

      /* About */
      .about {
        padding: 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 20px;
      }
      .about strong {
        color: var(--md-sys-color-on-surface);
      }

      /* Empty */
      .empty-models {
        padding: 24px;
        text-align: center;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 13px;
      }

      /* Expression select */
      .expression-select {
        padding: 8px 12px;
        border-radius: var(--md-sys-shape-corner-small, 8px);
        border: 1px solid var(--md-sys-color-outline);
        background: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-family: var(--md-sys-typescale-body-font);
        cursor: pointer;
        min-width: 120px;
      }
      .expression-select:focus {
        outline: 2px solid var(--md-sys-color-primary);
        outline-offset: -1px;
      }

      /* Slider row */
      .slider-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .slider-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .slider-value {
        font-size: 12px;
        font-weight: 500;
        color: var(--md-sys-color-primary);
        min-width: 40px;
        text-align: right;
      }
      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: var(--md-sys-color-surface-container-highest);
        outline: none;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--md-sys-color-primary);
        cursor: pointer;
        box-shadow: var(--md-sys-elevation-1);
        transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
      }
      input[type="range"]::-webkit-slider-thumb:hover {
        box-shadow: var(--md-sys-elevation-2);
      }
      .btn-text-small {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border: none;
        border-radius: var(--md-sys-shape-corner-small);
        background: transparent;
        color: var(--md-sys-color-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: var(--md-sys-typescale-label-font);
      }
      .btn-text-small:hover {
        background: var(--md-sys-color-primary-container);
      }

      .persona-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .persona-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .persona-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .persona-field.full {
        grid-column: 1 / -1;
      }
      .persona-label {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        font-weight: 500;
      }
      .persona-input,
      .persona-textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--md-sys-color-outline);
        background: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-family: var(--md-sys-typescale-body-font);
      }
      .persona-textarea {
        min-height: 92px;
        resize: vertical;
        line-height: 1.5;
      }
      .persona-input:focus,
      .persona-textarea:focus {
        outline: 2px solid var(--md-sys-color-primary);
        outline-offset: -1px;
      }
      .persona-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .persona-tip {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
      }

      .config-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: var(--md-sys-shape-corner-medium);
        background: var(--md-sys-color-surface-container-low);
      }
      .config-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .config-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .config-field.full {
        grid-column: 1 / -1;
      }
      .config-input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--md-sys-color-outline);
        background: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        font-family: var(--md-sys-typescale-body-font);
      }
      .config-input:focus {
        outline: 2px solid var(--md-sys-color-primary);
        outline-offset: -1px;
      }
      .config-hint {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }
      .config-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      @media (max-width: 720px) {
        .persona-grid {
          grid-template-columns: 1fr;
        }
        .config-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];

  @state() private _models: Live2DModelInfo[] = [];
  @state() private _activeModelId = '';
  @state() private _scanning = false;
  @state() private _expressions: string[] = [];
  @state() private _watermarkExpression = '';
  @state() private _modelOffsetY = 0;
  @state() private _modelZoom = 1.0;
  @state() private _shareSameModelMemory = true;
  @state() private _personaName = '';
  @state() private _personaTone = '';
  @state() private _personaGreeting = '';
  @state() private _personaSystemPrompt = '';
  @state() private _personaSaving = false;
  @state() private _personaMsg = '';
  @state() private _memoryDigestIntervalTurns = '50';
  @state() private _impressionBuildTurns = '30, 50, 100, 150';
  @state() private _impressionRebuildIntervalTurns = '150';
  @state() private _memoryStageSaving = false;
  @state() private _memoryStageMsg = '';

  // Local settings stored in-memory; in a real app these would persist
  @state() private _reminderEnabled = true;
  @state() private _darkMode = false;
  @state() private _alwaysOnTop = true;
  @state() private _autoLaunch = false;
  @state() private _followMouse = true;

  // LLM 配置
  @state() private _llmConfig: Record<string, any> = {};
  @state() private _llmSaving = false;
  @state() private _llmMsg = '';

  override connectedCallback() {
    super.connectedCallback();
    this._loadModels();
    this._darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this._watermarkExpression = localStorage.getItem('live2d-watermark-expression') || '';
    this._modelOffsetY = parseInt(localStorage.getItem('live2d-model-offset-y') || '0', 10);
    this._followMouse = localStorage.getItem('live2d-follow-mouse') !== 'false';
    // Load zoom from main process
    window.electronAPI?.getPetZoom?.().then(z => { this._modelZoom = z ?? 1.0; });
    // Listen for zoom changes (from pet window wheel)
    window.electronAPI?.onZoomChanged?.((z) => { this._modelZoom = z; });
    // Load always-on-top state
    window.electronAPI?.getAlwaysOnTop?.().then(v => { this._alwaysOnTop = v ?? true; });
    // 加载 LLM 配置并连接 WebSocket
    void this._loadLLMConfig();
    void this._syncSharedPetSettings();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
  }

  private async _loadLLMConfig() {
    try {
      this._llmConfig = await getLLMConfig();
    } catch { /* ignore */ }
  }

  private async _syncSharedPetSettings() {
    try {
      const settings = await getDesktopPetSettings();
      if (!settings) return;
      const nextScale = Number(settings.scale ?? 1);
      if (Number.isFinite(nextScale)) {
        this._modelZoom = Math.max(0.3, Math.min(2.5, Math.round(nextScale * 100) / 100));
      }
      const nextOnTop = settings?.window?.always_on_top;
      if (typeof nextOnTop === 'boolean') {
        this._alwaysOnTop = nextOnTop;
        window.electronAPI?.setAlwaysOnTop?.(nextOnTop);
      }
      const nextAutoLaunch = await window.electronAPI?.getAutoLaunchEnabled?.();
      if (typeof nextAutoLaunch === 'boolean') {
        this._autoLaunch = nextAutoLaunch;
      } else {
        this._autoLaunch = Boolean(settings.enabled);
      }
      this._shareSameModelMemory = Boolean(settings?.memory?.share_between_sessions_same_model ?? true);
      const stageManagement = settings?.memory?.stage_management ?? {};
      this._memoryDigestIntervalTurns = String(stageManagement?.memory_digest_interval_turns ?? 50).trim() || '50';
      const buildTurns = Array.isArray(stageManagement?.impression_build_turns)
        ? stageManagement.impression_build_turns
        : [30, 50, 100, 150];
      this._impressionBuildTurns = buildTurns
        .map((item: unknown) => String(item).trim())
        .filter(Boolean)
        .join(', ');
      this._impressionRebuildIntervalTurns = String(stageManagement?.impression_rebuild_interval_turns ?? 150).trim() || '150';
      this._personaName = String(settings?.persona?.name ?? '').trim();
      this._personaTone = String(settings?.persona?.tone ?? '').trim();
      this._personaGreeting = String(settings?.persona?.greeting ?? '').trim();
      this._personaSystemPrompt = String(settings?.persona?.system_prompt ?? '').trim();
    } catch {
      // ignore
    }
  }

  private async _saveSharedPetSettings(patch: Record<string, any>) {
    await patchDesktopPetSettings(patch);
  }

  private _parsePositiveInt(value: string, fallback: number): number {
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private _parseTurnList(value: string): number[] {
    const values = String(value)
      .split(/[，,、\s]+/)
      .map(item => Number.parseInt(item.trim(), 10))
      .filter(item => Number.isFinite(item) && item > 0);
    return Array.from(new Set(values)).sort((left, right) => left - right);
  }

  private async _saveMemoryStageManagement() {
    if (this._memoryStageSaving) return;
    this._memoryStageSaving = true;
    this._memoryStageMsg = '';
    try {
      const memoryDigestIntervalTurns = this._parsePositiveInt(this._memoryDigestIntervalTurns, 50);
      const impressionBuildTurns = this._parseTurnList(this._impressionBuildTurns);
      const impressionRebuildIntervalTurns = this._parsePositiveInt(this._impressionRebuildIntervalTurns, 150);
      const normalizedBuildTurns = impressionBuildTurns.length > 0 ? impressionBuildTurns : [30, 50, 100, 150];

      this._memoryDigestIntervalTurns = String(memoryDigestIntervalTurns);
      this._impressionBuildTurns = normalizedBuildTurns.join(', ');
      this._impressionRebuildIntervalTurns = String(impressionRebuildIntervalTurns);

      await this._saveSharedPetSettings({
        memory: {
          stage_management: {
            memory_digest_interval_turns: memoryDigestIntervalTurns,
            impression_build_turns: normalizedBuildTurns,
            impression_rebuild_interval_turns: impressionRebuildIntervalTurns,
          },
        },
      });
      this._memoryStageMsg = '阶段整理规则已保存';
    } catch {
      this._memoryStageMsg = '保存失败';
    } finally {
      this._memoryStageSaving = false;
    }
  }

  private async _saveLLMConfig() {
    this._llmSaving = true;
    this._llmMsg = '';
    try {
      await updateLLMConfig(this._llmConfig);
      this._llmMsg = '配置已保存';
    } catch {
      this._llmMsg = '保存失败';
    } finally {
      this._llmSaving = false;
    }
  }

  private _updateLLMField(key: string, value: string) {
    this._llmConfig = { ...this._llmConfig, [key]: value };
  }

  private async _loadModels() {
    try {
      const [models, active] = await Promise.all([getLive2DModels(), getActiveLive2DModel()]);
      this._models = models;
      this._activeModelId = active?.id ?? '';
      // Use expressions directly from API response (no need to fetch model3.json)
      this._expressions = active?.expressions ?? [];
    } catch (e) {
      console.error('Failed to load models:', e);
    }
  }

  private async _handleSwitch(modelId: string) {
    if (modelId === this._activeModelId) return;
    try {
      await switchLive2DModel(modelId);
      await this._syncSharedPetSettings();
      await this._loadModels();
      this._activeModelId = modelId;
      const model = this._models.find(m => m.id === modelId);
      this._expressions = model?.expressions ?? [];
      this._watermarkExpression = '';
      localStorage.removeItem('live2d-watermark-expression');
      this.dispatchEvent(new CustomEvent('model-changed', { detail: { modelId }, bubbles: true, composed: true }));
    } catch (e) {
      console.error('Failed to switch model:', e);
    }
  }

  private async _handleScan() {
    this._scanning = true;
    try {
      this._models = await scanLive2DModels();
    } catch (e) {
      console.error('Failed to scan models:', e);
    } finally {
      this._scanning = false;
    }
  }

  private _handleWatermarkChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    this._watermarkExpression = val;
    if (val) {
      localStorage.setItem('live2d-watermark-expression', val);
    } else {
      localStorage.removeItem('live2d-watermark-expression');
    }
  }

  private _handleModelOffsetChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    this._modelOffsetY = val;
    localStorage.setItem('live2d-model-offset-y', String(val));
  }

  private _resetModelOffset() {
    this._modelOffsetY = 0;
    localStorage.setItem('live2d-model-offset-y', '0');
  }

  private _handleZoomChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    this._modelZoom = Math.round(val * 100) / 100;
    window.electronAPI?.setPetZoom?.(this._modelZoom);
    void this._saveSharedPetSettings({ scale: this._modelZoom });
  }

  private _resetZoom() {
    this._modelZoom = 1.0;
    window.electronAPI?.setPetZoom?.(1.0);
    void this._saveSharedPetSettings({ scale: 1.0 });
  }

  private async _saveModelPersona() {
    if (!this._activeModelId || this._personaSaving) return;
    this._personaSaving = true;
    this._personaMsg = '';
    try {
      await this._saveSharedPetSettings({
        model_overrides: {
          [this._activeModelId]: {
            persona: {
              name: this._personaName,
              tone: this._personaTone,
              greeting: this._personaGreeting,
              system_prompt: this._personaSystemPrompt,
            },
          },
        },
      });
      this._personaMsg = '当前模型人格已保存';
      await this._syncSharedPetSettings();
    } catch {
      this._personaMsg = '保存失败';
    } finally {
      this._personaSaving = false;
    }
  }

  override render() {
    return html`
      <div class="header">
        <h2>设置</h2>
      </div>

      <!-- Live2D Models -->
      <div class="section">
        <span class="section-title">Live2D 模型</span>
        <div class="action-bar">
          <button class="btn-outlined" @click=${this._handleScan} ?disabled=${this._scanning}>
            <span class="material-symbols-outlined" style="font-size:18px">refresh</span>
            ${this._scanning ? '扫描中...' : '扫描模型'}
          </button>
        </div>
        ${this._models.length > 0
          ? html`
            <div class="model-grid">
              ${this._models.map(m => html`
                <div class="model-card ${m.id === this._activeModelId ? 'active' : ''}"
                  @click=${() => this._handleSwitch(m.id)}>
                  <div class="model-preview">
                    ${m.preview_image
                      ? html`<img src="${m.preview_image}" alt="${m.name}" />`
                      : html`<span class="material-symbols-outlined">face</span>`}
                  </div>
                  <span class="model-name">${m.name || m.id}</span>
                </div>
              `)}
            </div>`
          : html`<div class="empty-models">未找到模型。请将 .moc3 模型放入 assets/live2d/ 目录后点击扫描。</div>`}
      </div>

      ${this._activeModelId
        ? html`
          <div class="section">
            <span class="section-title">当前模型人格</span>
            <div class="persona-card">
              <div class="persona-tip">当前正在编辑模型「${this._activeModelId}」的人格设定。不同 Live2D 模型不会共享这里的名字、语气、问候和系统设定。</div>
              <div class="persona-grid">
                <label class="persona-field">
                  <span class="persona-label">人格名称</span>
                  <input class="persona-input" .value=${this._personaName}
                    @input=${(e: Event) => { this._personaName = (e.target as HTMLInputElement).value; this._personaMsg = ''; }} />
                </label>
                <label class="persona-field">
                  <span class="persona-label">语气描述</span>
                  <input class="persona-input" .value=${this._personaTone}
                    @input=${(e: Event) => { this._personaTone = (e.target as HTMLInputElement).value; this._personaMsg = ''; }} />
                </label>
                <label class="persona-field full">
                  <span class="persona-label">开场问候</span>
                  <input class="persona-input" .value=${this._personaGreeting}
                    @input=${(e: Event) => { this._personaGreeting = (e.target as HTMLInputElement).value; this._personaMsg = ''; }} />
                </label>
                <label class="persona-field full">
                  <span class="persona-label">系统人格设定</span>
                  <textarea class="persona-textarea" .value=${this._personaSystemPrompt}
                    @input=${(e: Event) => { this._personaSystemPrompt = (e.target as HTMLTextAreaElement).value; this._personaMsg = ''; }}></textarea>
                </label>
              </div>
              <div class="persona-actions">
                <span class="persona-tip">${this._personaMsg || '切换模型后，这里会自动切换到对应模型的人格配置。'}</span>
                <button class="btn-outlined" @click=${this._saveModelPersona} ?disabled=${this._personaSaving}>
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                  ${this._personaSaving ? '保存中...' : '保存当前模型人格'}
                </button>
              </div>
            </div>
          </div>`
        : nothing}

      <!-- Watermark Expression -->
      ${this._expressions.length > 0
        ? html`
          <div class="section">
            <span class="section-title">水印设置</span>
            <div class="toggle-row">
              <div class="toggle-label">
                <span class="primary">水印遮盖表情</span>
                <span class="secondary">选择后将持续显示此表情以遮盖水印，右键菜单可叠加其他表情</span>
              </div>
              <select class="expression-select" .value=${this._watermarkExpression}
                @change=${(e: Event) => this._handleWatermarkChange(e)}>
                <option value="">不使用</option>
                ${this._expressions.map(name => html`
                  <option value="${name}" ?selected=${name === this._watermarkExpression}>${name}</option>
                `)}
              </select>
            </div>
          </div>`
        : nothing}

      <!-- Model Position Adjustment -->
      <div class="section">
        <span class="section-title">模型位置</span>
        <div class="slider-row">
          <div class="slider-header">
            <div class="toggle-label">
              <span class="primary">模型垂直偏移</span>
              <span class="secondary">向上拖动可露出被遮挡的鞋子，向下可隐藏底部</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="slider-value">${this._modelOffsetY}px</span>
              ${this._modelOffsetY !== 0
                ? html`<button class="btn-text-small" @click=${this._resetModelOffset}>重置</button>`
                : nothing}
            </div>
          </div>
          <input type="range" min="-300" max="300" step="5"
            .value=${String(this._modelOffsetY)}
            @input=${this._handleModelOffsetChange} />
        </div>
        <div class="slider-row">
          <div class="slider-header">
            <div class="toggle-label">
              <span class=\"primary\">桌宠大小</span>
              <span class=\"secondary\">滚轮也可以在桌宠窗口直接缩放，整体等比放大缩小</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="slider-value">${Math.round(this._modelZoom * 100)}%</span>
              ${this._modelZoom !== 1.0
                ? html`<button class="btn-text-small" @click=${this._resetZoom}>重置</button>`
                : nothing}
            </div>
          </div>
          <input type="range" min="0.3" max="2.0" step="0.05"
            .value=${String(this._modelZoom)}
            @input=${this._handleZoomChange} />
        </div>
      </div>

      <!-- Preferences -->
      <div class="section">
        <span class="section-title">偏好设置</span>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">同模型跨会话共享记忆</span>
            <span class="secondary">开启后，不同会话会共享同一 LLM 模型下积累的长期记忆与用户印象</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._shareSameModelMemory}
              @change=${(e: Event) => {
                this._shareSameModelMemory = (e.target as HTMLInputElement).checked;
                void this._saveSharedPetSettings({
                  memory: {
                    share_between_sessions_same_model: this._shareSameModelMemory,
                  },
                });
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="config-card">
          <div class="config-hint">阶段记忆策略会决定多久整理一次长期记忆，以及在什么回合数构建用户印象。修改后会同步到 WebUI 后端解析和桌宠聊天运行时。</div>
          <div class="config-grid">
            <label class="config-field">
              <span class="persona-label">记忆整理间隔</span>
              <input
                class="config-input"
                type="number"
                min="1"
                step="1"
                .value=${this._memoryDigestIntervalTurns}
                @input=${(e: Event) => { this._memoryDigestIntervalTurns = (e.target as HTMLInputElement).value; this._memoryStageMsg = ''; }}
              />
              <span class="config-hint">单会话每多少轮用户消息整理一次长期记忆。</span>
            </label>
            <label class="config-field">
              <span class="persona-label">印象重建间隔</span>
              <input
                class="config-input"
                type="number"
                min="1"
                step="1"
                .value=${this._impressionRebuildIntervalTurns}
                @input=${(e: Event) => { this._impressionRebuildIntervalTurns = (e.target as HTMLInputElement).value; this._memoryStageMsg = ''; }}
              />
              <span class="config-hint">超过初始阶段后，每隔多少轮再次刷新用户印象。</span>
            </label>
            <label class="config-field full">
              <span class="persona-label">印象构建回合</span>
              <input
                class="config-input"
                type="text"
                .value=${this._impressionBuildTurns}
                @input=${(e: Event) => { this._impressionBuildTurns = (e.target as HTMLInputElement).value; this._memoryStageMsg = ''; }}
                placeholder="例如：30, 50, 100, 150"
              />
              <span class="config-hint">使用逗号分隔多个触发点，例如 30, 50, 100, 150。系统会自动去重、排序并过滤无效值。</span>
            </label>
          </div>
          <div class="config-actions">
            <span class="config-hint">${this._memoryStageMsg || '建议把记忆整理周期设得更长一点，避免每轮对话都额外消耗时间。'}</span>
            <button class="btn-outlined" @click=${this._saveMemoryStageManagement} ?disabled=${this._memoryStageSaving}>
              <span class="material-symbols-outlined" style="font-size:16px">save</span>
              ${this._memoryStageSaving ? '保存中...' : '保存阶段策略'}
            </button>
          </div>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">窗口置顶</span>
            <span class="secondary">桌宠始终显示在其他窗口之上</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._alwaysOnTop}
              @change=${(e: Event) => {
                this._alwaysOnTop = (e.target as HTMLInputElement).checked;
                window.electronAPI?.setAlwaysOnTop?.(this._alwaysOnTop);
                void this._saveSharedPetSettings({ window: { always_on_top: this._alwaysOnTop } });
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">开机自启动</span>
            <span class="secondary">登录 Windows 后自动启动独立桌宠</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._autoLaunch}
              @change=${async (e: Event) => {
                const desired = (e.target as HTMLInputElement).checked;
                this._autoLaunch = desired;
                try {
                  const actual = await window.electronAPI?.setAutoLaunchEnabled?.(desired);
                  this._autoLaunch = typeof actual === 'boolean' ? actual : desired;
                } catch {
                  this._autoLaunch = !desired;
                }
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">眼神追踪</span>
            <span class="secondary">桌宠的视线始终跟随鼠标方向</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._followMouse}
              @change=${(e: Event) => {
                this._followMouse = (e.target as HTMLInputElement).checked;
                localStorage.setItem('live2d-follow-mouse', String(this._followMouse));
              }} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">日程提醒</span>
            <span class="secondary">在日程开始前收到通知</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._reminderEnabled}
              @change=${(e: Event) => (this._reminderEnabled = (e.target as HTMLInputElement).checked)} />
            <div class="switch-track"></div>
          </label>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <span class="primary">深色模式</span>
            <span class="secondary">跟随系统或手动切换</span>
          </div>
          <label class="switch">
            <input type="checkbox" .checked=${this._darkMode}
              @change=${(e: Event) => (this._darkMode = (e.target as HTMLInputElement).checked)} />
            <div class="switch-track"></div>
          </label>
        </div>
      </div>

      <!-- LLM 配置 -->
      <div class="section">
        <span class="section-title">LLM 配置（与主程序同步）</span>
        <div class="toggle-row" style="flex-direction:column;align-items:stretch;gap:10px">
          ${(['provider', 'base_url', 'model', 'api_key'] as const).map(key => html`
            <div style="display:flex;align-items:center;gap:8px">
              <label style="width:80px;font-size:12px;color:var(--md-sys-color-on-surface-variant);flex-shrink:0">
                ${key === 'base_url' ? 'Base URL' : key === 'api_key' ? 'API Key' : key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
              <input
                type="${key === 'api_key' ? 'password' : 'text'}"
                style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--md-sys-color-outline);background:var(--md-sys-color-surface-container);color:var(--md-sys-color-on-surface);font-size:13px;font-family:monospace"
                .value=${this._llmConfig[key] ?? ''}
                placeholder=${key === 'api_key' ? '***已配置***' : ''}
                @input=${(e: Event) => this._updateLLMField(key, (e.target as HTMLInputElement).value)}
              />
            </div>
          `)}
          <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
            ${this._llmMsg ? html`<span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">${this._llmMsg}</span>` : nothing}
            <button class="btn-outlined" @click=${this._saveLLMConfig} ?disabled=${this._llmSaving}>
              <span class="material-symbols-outlined" style="font-size:16px">save</span>
              ${this._llmSaving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="section">
        <span class="section-title">关于</span>
        <div class="about">
          <strong>MaiCoreStart桌宠</strong> v5.0.1<br/>
          MaiCoreStart桌宠，来源Neo-MoFox插件<br/>
          开源协议：AGPLv3.0
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage;
  }
}
