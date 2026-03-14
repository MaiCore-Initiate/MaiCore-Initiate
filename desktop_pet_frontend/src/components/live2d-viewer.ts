/* =============================================
   Live2D Viewer - pixi.js + pixi-live2d-display
   ============================================= */

import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { m3Shared } from '../styles/shared';

import type { Live2DModelInfo } from '../types';
import cubismCoreUrl from '../assets/live2dcubismcore.min.js?url';

// Dynamic imports for pixi - these are heavy and may fail in some Electron envs
let PIXI: typeof import('pixi.js') | null = null;
let Live2DModelClass: any = null;
/** Load Live2D Cubism 4 Core SDK from local bundled asset first. */
async function ensureCubismSDK(): Promise<void> {
  if (typeof (window as any).Live2DCubismCore !== 'undefined') return;

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cubism Core from ' + src));
    document.head.appendChild(script);
  });

  try {
    await loadScript(cubismCoreUrl);
    console.log('[live2d] Cubism Core loaded from bundled asset:', cubismCoreUrl);
    return;
  } catch (localErr) {
    console.warn('[live2d] Failed to load bundled Cubism Core:', localErr);
  }

  try {
    await loadScript('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js');
    console.log('[live2d] Cubism Core loaded from CDN fallback');
  } catch (cdnErr) {
    console.warn('[live2d] Failed to load Cubism 4 SDK from CDN fallback:', cdnErr);
    throw cdnErr;
  }
}


async function loadPixi() {
  if (!PIXI) {
    // Load Cubism SDK first (removed from index.html to avoid blocking the renderer)
    await ensureCubismSDK();
    PIXI = await import('pixi.js');
    const pixiAny = PIXI as any;
    // Transparent Electron windows are more stable with WebGL1 here.
    if (pixiAny.settings && pixiAny.ENV) {
      pixiAny.settings.PREFER_ENV = pixiAny.ENV.WEBGL;
    }
    // Use cubism4 build for .moc3 models
    const l2d = await import('pixi-live2d-display/cubism4');
    Live2DModelClass = l2d.Live2DModel;
    // Register pixi Ticker so Live2D model auto-updates
    Live2DModelClass.registerTicker(PIXI.Ticker);
  }
  return { PIXI: PIXI!, Live2DModel: Live2DModelClass };
}

function createStablePixiContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const attrs: WebGLContextAttributes = {
    alpha: true,
    depth: true,
    stencil: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  };

  const names: Array<'webgl' | 'experimental-webgl' | 'webgl2'> = ['webgl', 'experimental-webgl', 'webgl2'];

  for (const name of names) {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext(name, attrs) as WebGLRenderingContext | null;
    } catch (err) {
      console.warn('[live2d-viewer] Failed to create context', name, err);
      continue;
    }
    if (!gl) continue;

    const maxTextures = Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) || 0);
    const maxCombinedTextures = Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || 0);
    const contextAttrs = gl.getContextAttributes?.() ?? null;
    console.log('[live2d-viewer] WebGL probe', JSON.stringify({
      name,
      maxTextures,
      maxCombinedTextures,
      stencil: contextAttrs?.stencil ?? null,
      alpha: contextAttrs?.alpha ?? null,
    }));
    if (maxTextures > 0) {
      return gl;
    }
  }

  return null;
}

function patchBrokenTextureLimit(gl: WebGLRenderingContext | null): WebGLRenderingContext | null {
  if (!gl) return null;
  const patchedFlag = '__maicorePatchedGetParameter';
  if ((gl as any)[patchedFlag]) return gl;

  const originalGetParameter = gl.getParameter.bind(gl);
  gl.getParameter = ((pname: number) => {
    const value = originalGetParameter(pname);
    if (
      (pname === gl.MAX_TEXTURE_IMAGE_UNITS || pname === gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
      && (!Number.isFinite(Number(value)) || Number(value) <= 0)
    ) {
      return 8;
    }
    return value;
  }) as typeof gl.getParameter;
  (gl as any)[patchedFlag] = true;

  const maxTextures = Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) || 0);
  const maxCombinedTextures = Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || 0);
  if (maxTextures <= 0 || maxCombinedTextures <= 0) {
    console.warn('[live2d-viewer] WebGL texture unit probe returned invalid values, patched fallback applied');
  }
  return gl;
}

function clampNumber(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

@customElement('live2d-viewer')
export class Live2DViewer extends LitElement {
  static override styles = [
    m3Shared,
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        color: var(--md-sys-color-on-surface);
        flex-direction: column;
        gap: 12px;
      }
      .placeholder .pet-fallback {
        width: 180px;
        height: 180px;
        border-radius: 50%;
        background: var(--md-sys-color-primary-container, #cbefbd);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--md-sys-elevation-2);
        position: relative;
        animation: petBounce 2s ease-in-out infinite;
      }
      .placeholder .pet-fallback .material-symbols-outlined {
        font-size: 80px;
        color: var(--md-sys-color-on-primary-container, #072104);
        font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48;
      }
      @keyframes petBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      .placeholder .hint {
        background: var(--md-sys-color-surface-container, rgba(236,239,228,0.92));
        padding: 8px 16px;
        border-radius: var(--md-sys-shape-corner-medium, 12px);
        box-shadow: var(--md-sys-elevation-1);
        text-align: center;
      }
      .loading-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        z-index: 10;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--md-sys-color-outline-variant);
        border-top-color: var(--md-sys-color-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `,
  ];

  /** Model JSON URL to load (from backend or local) */
  @property({ type: String }) modelUrl = '';

  @state() private _loading = false;
  @state() private _error = '';
  @state() private _hasModel = false;

  @query('canvas') private _canvas!: HTMLCanvasElement;

  private _app: any = null;
  private _model: any = null;
  private _modelInfo: Live2DModelInfo | null = null;
  private _initInProgress = false;
  /** Cached expression definitions from model3.json (fallback for when expressionManager is null) */
  private _expressionDefs: Array<{ Name: string; File: string }> = [];
  /** Base URL for resolving relative expression file paths */
  private _modelBaseUrl = '';
  /** Watermark expression params - always applied as base layer every frame */
  private _watermarkParams: any[] | null = null;
  /** User-selected expression params - applied on top of watermark every frame */
  private _overlayExpressionParams: any[] | null = null;
  /** Auto blink state */
  private _blinkTimer = 0;
  private _nextBlinkTime = 0;
  private _isBlinking = false;
  private _blinkPhase = 0;
  /** Cached layout values for repositioning */
  private _layoutCanvasW = 400;
  private _layoutCanvasH = 400;
  private _layoutScale = 1;
  /** Original visible bounds captured at scale=1 */
  private _modelRawBounds = { x: 0, y: 0, width: 1, height: 1 };
  /** Current per-model zoom factor from shared settings */
  private _petZoom = 1;
  /** Scale multiplier applied on top of the auto-fit scale */
  private static readonly SCALE_K = 0.9;
  /** Persistent observer - rescales the model when the window size changes */
  private _zoomObserver: ResizeObserver | null = null;
  /** Mouse-follow interval ID */
  private _followMouseTimer: ReturnType<typeof setInterval> | null = null;
  /** Current active model id (for hot reload diff) */
  private _activeModelId = '';
  private _removeSharedStateListener: (() => void) | null = null;
  private _lastRequestedWindowW = 0;
  private _lastRequestedWindowH = 0;

  override async connectedCallback() {
    super.connectedCallback();
    // Auto-load the active model from backend
    void this._loadActiveModel();
    void this._applySharedSettings();

    // Listen for expression changes from settings page (in other window)
    window.addEventListener('storage', this._onStorageChange);
    this._removeSharedStateListener = window.electronAPI?.onSharedStateChanged?.((payload) => {
      if (payload.kind === 'settings') {
        void this._applySharedSettings();
      }
    }) ?? null;
    window.electronAPI?.onZoomChanged?.((zoom) => {
      const nextZoom = clampNumber(Number(zoom) || 1, 0.3, 2.5);
      if (Math.abs(nextZoom - this._petZoom) < 0.001) return;
      this._petZoom = nextZoom;
      this._fitWindowToModel(true);
    });

    // Start mouse tracking if enabled
    this._syncFollowMouse();
  }

  private _onStorageChange = (e: StorageEvent) => {
    if (e.key === 'live2d-watermark-expression') {
      console.log('[live2d-viewer] Watermark expression changed from settings:', e.newValue);
      if (this._expressionDefs.length === 0) {
        console.log('[live2d-viewer] Expressions not yet loaded, will apply on load');
        return;
      }
      this._loadWatermarkExpression(e.newValue || '');
    } else if (e.key === 'live2d-model-offset-y') {
      this._applyVerticalOffset();
    } else if (e.key === 'live2d-follow-mouse') {
      this._syncFollowMouse();
    }
  };

  /** Re-position model vertically when user drags the offset slider */
  private _applyVerticalOffset() {
    if (!this._model) return;
    this._layoutModel(this._layoutCanvasW, this._layoutCanvasH, this._layoutScale);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('storage', this._onStorageChange);
    this._removeSharedStateListener?.();
    this._removeSharedStateListener = null;
    this._stopFollowMouse();
    this._destroyApp(true);
  }

  private async _applySharedSettings() {
    try {
      const { getDesktopPetSettings } = await import('../api/client');
      const settings = await getDesktopPetSettings();
      if (!settings) return;
      const prevZoom = this._petZoom;
      const nextScale = Number(settings.scale ?? 1);
      if (Number.isFinite(nextScale)) {
        this._petZoom = clampNumber(nextScale, 0.3, 2.5);
      }
      const nextOnTop = settings?.window?.always_on_top;
      if (typeof nextOnTop === 'boolean') {
        window.electronAPI?.setAlwaysOnTop?.(nextOnTop);
      }
      const nextModelId = String(settings.model_id || '');
      if (nextModelId !== this._activeModelId) {
        await this._loadActiveModel(true);
      } else if (this._model && Math.abs(this._petZoom - prevZoom) > 0.001) {
        this._fitWindowToModel(true);
      }
    } catch {
      // ignore settings sync failures
    }
  }

  private _getTargetLayoutMetrics() {
    const raw = this._modelRawBounds;
    const rawW = Math.max(1, raw.width);
    const rawH = Math.max(1, raw.height);
    const PAD_X = 44;
    const PAD_TOP = 96;
    const EXTRA_BUBBLE_HEADROOM = 200;
    const PAD_BOTTOM = 20;
    const MIN_W = 220;
    const MIN_H = 260 + EXTRA_BUBBLE_HEADROOM;
    const MAX_W = Math.min(560, Math.round(window.screen.availWidth * 0.34));
    const BASE_MAX_H = Math.min(760, Math.round(window.screen.availHeight * 0.76));
    const MAX_H = Math.min(
      Math.max(MIN_H, window.screen.availHeight - 24),
      BASE_MAX_H + EXTRA_BUBBLE_HEADROOM,
    );
    const maxModelW = Math.max(140, MAX_W - PAD_X);
    const maxModelH = Math.max(160, MAX_H - PAD_TOP - PAD_BOTTOM - EXTRA_BUBBLE_HEADROOM);

    const fitScale = Math.min(maxModelW / rawW, maxModelH / rawH) * Live2DViewer.SCALE_K;
    let scale = fitScale * this._petZoom;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = fitScale;
    }

    const shrink = Math.min(
      maxModelW / Math.max(rawW * scale, 1),
      maxModelH / Math.max(rawH * scale, 1),
      1,
    );
    if (shrink < 1) {
      scale *= shrink;
    }

    return {
      width: clampNumber(Math.ceil(rawW * scale + PAD_X), MIN_W, MAX_W),
      height: clampNumber(Math.ceil(rawH * scale + PAD_TOP + PAD_BOTTOM + EXTRA_BUBBLE_HEADROOM), MIN_H, MAX_H),
      scale,
    };
  }

  private _layoutModel(cw: number, ch: number, scale: number) {
    if (!this._model) return;
    const raw = this._modelRawBounds;
    const userOffset = parseInt(localStorage.getItem('live2d-model-offset-y') || '0', 10);
    const scaledW = raw.width * scale;
    const posX = Math.round((cw - scaledW) / 2 - raw.x * scale);
    const posY = Math.round(ch - 14 + userOffset - (raw.y + raw.height) * scale);

    this._model.scale.set(scale);
    this._model.pivot.set(0, 0);
    this._model.position.set(posX, posY);
    this._layoutCanvasW = cw;
    this._layoutCanvasH = ch;
    this._layoutScale = scale;

    console.log('[live2d-viewer] Layout result', JSON.stringify({
      canvas: { width: cw, height: ch },
      zoom: Number(this._petZoom.toFixed(2)),
      scale: Number(scale.toFixed(4)),
      position: { x: posX, y: posY },
      rawBounds: {
        x: Number(raw.x.toFixed(2)),
        y: Number(raw.y.toFixed(2)),
        width: Number(raw.width.toFixed(2)),
        height: Number(raw.height.toFixed(2)),
      },
      visibleBounds: {
        left: Number((posX + raw.x * scale).toFixed(2)),
        top: Number((posY + raw.y * scale).toFixed(2)),
        width: Number((raw.width * scale).toFixed(2)),
        height: Number((raw.height * scale).toFixed(2)),
      },
    }));
  }

  private _fitWindowToModel(forceResize = false) {
    if (!this._model || !this._app) return;
    const metrics = this._getTargetLayoutMetrics();
    const rect = this.getBoundingClientRect();
    const currentW = Math.max(1, Math.round(rect.width || this._layoutCanvasW || metrics.width));
    const currentH = Math.max(1, Math.round(rect.height || this._layoutCanvasH || metrics.height));

    this._app.renderer.resize(currentW, currentH);
    this._layoutModel(currentW, currentH, metrics.scale);

    const needsResize =
      Math.abs(metrics.width - currentW) > 2
      || Math.abs(metrics.height - currentH) > 2;
    const duplicateRequest =
      Math.abs(metrics.width - this._lastRequestedWindowW) <= 1
      && Math.abs(metrics.height - this._lastRequestedWindowH) <= 1;
    if ((forceResize || needsResize) && !duplicateRequest) {
      this._lastRequestedWindowW = metrics.width;
      this._lastRequestedWindowH = metrics.height;
      window.electronAPI?.resizePetWindow?.(metrics.width, metrics.height);
    }
  }

  private async _loadActiveModel(forceReload = false) {
    try {
      const { getActiveLive2DModel } = await import('../api/client');
      const nextModel = await getActiveLive2DModel();
      if (!nextModel?.model_file) {
        this._modelInfo = null;
        this._activeModelId = '';
        this._error = 'Live2D 模型未配置';
        this._destroyApp(true);
        return;
      }
      const sameModel = nextModel.id === this._activeModelId && nextModel.model_file === this.modelUrl;
      if (!forceReload && sameModel && this._model) return;

      this._modelInfo = nextModel;
      this._activeModelId = nextModel.id;
      this.modelUrl = nextModel.model_file;
      // Set _hasModel so canvas element is rendered
      this._hasModel = true;
      // Wait for Lit to render the canvas element
      await this.updateComplete;
      // Need a second update cycle to ensure canvas is in DOM
      await new Promise(r => requestAnimationFrame(r));
      await this.updateComplete;
      await this._initLive2D();
    } catch (e) {
      console.warn('Failed to load active model info:', e);
    }
  }

  // Removed: updated() no longer triggers _initLive2D to avoid double-init race condition

  private async _initLive2D() {
    // Guard against double-init
    if (this._initInProgress) {
      console.log('[live2d-viewer] Init already in progress, skipping');
      return;
    }
    this._initInProgress = true;
    this._destroyApp();

    if (!this.modelUrl) {
      this._initInProgress = false;
      return;
    }

    this._loading = true;
    this._error = '';

    try {
      const { PIXI, Live2DModel } = await loadPixi();

      await this.updateComplete;

      const canvas = this.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        console.error('[live2d-viewer] Canvas element not found in shadow DOM');
        this._error = 'Canvas 未找到';
        this._loading = false;
        return;
      }

      const rect = this.getBoundingClientRect();
      const width = rect.width || 400;
      const height = rect.height || 600;

      console.log(`[live2d-viewer] Initializing pixi app ${width}x${height}, modelUrl=${this.modelUrl}`);

      const stableContext = patchBrokenTextureLimit(createStablePixiContext(canvas));

      this._app = new PIXI.Application({
        view: canvas,
        width,
        height,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
        powerPreference: 'high-performance',
        context: (stableContext as any) ?? undefined,
      });

      const rendererGl = (this._app.renderer as any)?.gl as WebGLRenderingContext | undefined;
      if (rendererGl) {
        const rendererAttrs = rendererGl.getContextAttributes?.() ?? null;
        console.log('[live2d-viewer] Renderer capabilities:', JSON.stringify({
          maxTextures: Number(rendererGl.getParameter(rendererGl.MAX_TEXTURE_IMAGE_UNITS) || 0),
          maxCombinedTextures: Number(rendererGl.getParameter(rendererGl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || 0),
          stencil: rendererAttrs?.stencil ?? null,
          alpha: rendererAttrs?.alpha ?? null,
        }));
      }

      console.log('[live2d-viewer] Loading Live2D model from:', this.modelUrl, 'baseUrl=', this._modelBaseUrl);
      this._model = await Live2DModel.from(this.modelUrl, {
        autoInteract: false,
        autoUpdate: true,
      });
      console.log('[live2d-viewer] Model loaded successfully:', this._model.width, this._model.height);

      // Reset auto blink state for new model
      this._blinkTimer = 0;
      this._nextBlinkTime = 2 + Math.random() * 4; // First blink in 2-6 seconds
      this._isBlinking = false;
      this._blinkPhase = 0;

      // Disable pixi event system on model tree to avoid pixi v7 compat errors
      // (pixi-live2d-display v0.4 doesn't support pixi v7 EventBoundary)
      this._model.eventMode = 'none';
      this._model.interactiveChildren = false;
      // Measure the actual visible bounds instead of assuming every model
      // shares the same origin and empty margins. This keeps wide or tall
      // models inside the transparent window more reliably.
      const rawBounds = this._model.getLocalBounds();
      this._modelRawBounds = {
        x: rawBounds.x,
        y: rawBounds.y,
        width: Math.max(1, rawBounds.width),
        height: Math.max(1, rawBounds.height),
      };
      const metrics = this._getTargetLayoutMetrics();
      console.log(`[live2d-viewer] Auto-size: rawBounds ${this._modelRawBounds.width}x${this._modelRawBounds.height}, ` +
        `zoom=${this._petZoom.toFixed(2)}, scale=${metrics.scale.toFixed(3)}, window ${metrics.width}x${metrics.height}`);

      this._layoutModel(width, height, metrics.scale);

      this._app.stage.addChild(this._model as any);
      this._hasModel = true;

      // Resize the transparent hit-area so it follows the actual visible model size.
      window.electronAPI?.resizePetWindow?.(metrics.width, metrics.height);

      // Persistent ResizeObserver: fires on initial resize and every zoom-driven resize
      // zoom-driven window resize.  Resizes pixi renderer, then recomputes
      // model scale + position from scratch (no accumulated state).
      this._zoomObserver?.disconnect();
      this._zoomObserver = new ResizeObserver((entries) => {
        const { width: nw, height: nh } = entries[0].contentRect;
        if (nw < 1 || nh < 1) return;
        if (!this._app || !this._model) return;
        this._app.renderer.resize(nw, nh);
        this._layoutModel(nw, nh, this._getTargetLayoutMetrics().scale);
      });
      this._zoomObserver.observe(this);

      // Compute base URL for relative file resolution
      const lastSlash = this.modelUrl.lastIndexOf('/');
      this._modelBaseUrl = lastSlash >= 0 ? this.modelUrl.substring(0, lastSlash + 1) : '';

      // Get expression definitions from API response (most reliable source)
      if (this._modelInfo?.expression_defs?.length) {
        this._expressionDefs = this._modelInfo.expression_defs;
        console.log('[live2d-viewer] Got', this._expressionDefs.length, 'expressions from API:', this._expressionDefs.map(d => d.Name));
      } else if (this._modelInfo?.expressions?.length) {
        // Fallback: API only returned expression names, so exp3.json cannot be loaded directly
        console.warn('[live2d-viewer] API returned expression names but no defs');
      }

      // Install per-frame expression hook via beforeModelUpdate event
      // This fires right before model.update() in Cubism4InternalModel.update(),
      // AFTER saveParameters/expressionManager/eyeBlink/physics/pose
      // Layered design: watermark (base) is ALWAYS applied, then overlay expression on top
      if (this._expressionDefs.length > 0) {
        const im = this._model.internalModel;
        im?.on('beforeModelUpdate', () => {
          const cm = im.coreModel;

          // Auto blink logic
          this._updateAutoBlink(cm);

          // Layer 1: Always apply watermark params (hide watermark)
          if (this._watermarkParams) {
            for (const p of this._watermarkParams) {
              const val = p.Value ?? 0;
              const blend = p.Blend || 'Add';
              if (blend === 'Add') {
                cm.addParameterValueById(p.Id, val, 1.0);
              } else if (blend === 'Multiply') {
                cm.multiplyParameterValueById(p.Id, val, 1.0);
              } else {
                cm.setParameterValueById(p.Id, val, 1.0);
              }
            }
          }
          // Layer 2: Apply user-selected expression on top
          if (this._overlayExpressionParams) {
            for (const p of this._overlayExpressionParams) {
              const val = p.Value ?? 0;
              const blend = p.Blend || 'Add';
              if (blend === 'Add') {
                cm.addParameterValueById(p.Id, val, 1.0);
              } else if (blend === 'Multiply') {
                cm.multiplyParameterValueById(p.Id, val, 1.0);
              } else {
                cm.setParameterValueById(p.Id, val, 1.0);
              }
            }
          }
        });
        console.log('[live2d-viewer] Installed beforeModelUpdate expression hook (layered + auto blink)');

      }

      // Log available expressions
      if (this._expressionDefs.length > 0) {
        console.log('[live2d-viewer] Expressions:', this._expressionDefs.map(d => d.Name));
      }

      // Load user-configured watermark expression as persistent base layer
      try {
        const savedWatermark = localStorage.getItem('live2d-watermark-expression');
        if (savedWatermark && this._expressionDefs.length > 0) {
          await this._loadWatermarkExpression(savedWatermark);
        }
      } catch (exprErr) {
        console.warn('[live2d-viewer] Failed to load watermark expression:', exprErr);
      }

      // Drag support via canvas DOM events (bypass pixi event system)
      this._setupDrag(canvas);

      // Restart mouse tracking (was stopped by _destroyApp during init)
      this._syncFollowMouse();
    } catch (e) {
      this._error = `Live2D model load error: ${e}`;
      console.error(this._error);
      this._destroyApp(true);
    } finally {
      this._loading = false;
      this._initInProgress = false;
    }
  }

  /**
   * Auto blink logic - called every frame in beforeModelUpdate
   * Simulates natural blinking with random intervals
   */
  private _updateAutoBlink(coreModel: any) {
    const deltaTime = 1 / 60; // Assume 60fps, adjust if needed
    this._blinkTimer += deltaTime;

    // Check if it's time to start a new blink
    if (!this._isBlinking && this._blinkTimer >= this._nextBlinkTime) {
      this._isBlinking = true;
      this._blinkPhase = 0;
      // Random next blink time: 2-6 seconds
      this._nextBlinkTime = this._blinkTimer + 2 + Math.random() * 4;
    }

    // Process blink animation
    if (this._isBlinking) {
      const blinkSpeed = 0.15; // Speed of blink animation
      this._blinkPhase += blinkSpeed;

      let eyeOpenness = 1.0;
      if (this._blinkPhase < 1.0) {
        // Closing phase (0 -> 1): eye goes from 1.0 to 0.0
        eyeOpenness = 1.0 - this._blinkPhase;
      } else if (this._blinkPhase < 2.0) {
        // Opening phase (1 -> 2): eye goes from 0.0 to 1.0
        eyeOpenness = this._blinkPhase - 1.0;
      } else {
        // Blink complete
        this._isBlinking = false;
        eyeOpenness = 1.0;
      }

      // Apply to eye parameters
      // Common Live2D parameter IDs for eyes
      const eyeParams = [
        'ParamEyeLOpen',
        'ParamEyeROpen',
        'ParamEyeBallX',
        'ParamEyeBallY'
      ];

      try {
        // Set left eye openness
        coreModel.setParameterValueById('ParamEyeLOpen', eyeOpenness);
        // Set right eye openness
        coreModel.setParameterValueById('ParamEyeROpen', eyeOpenness);
      } catch (e) {
        // Parameters might not exist in all models, silently ignore
      }
    }
  }

  private _setupDrag(canvas: HTMLCanvasElement) {
    if (!this._model) return;
    const model = this._model;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    canvas.style.cursor = 'grab';

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      dragging = true;
      // Convert DOM coords to pixi coords (account for resolution)
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      offsetX = px - model.x;
      offsetY = py - model.y;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width / (window.devicePixelRatio || 1);
      const scaleY = canvas.height / rect.height / (window.devicePixelRatio || 1);
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      model.x = px - offsetX;
      model.y = py - offsetY;
    });

    canvas.addEventListener('pointerup', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('pointerleave', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    });
  }

  private _destroyApp(resetView = false) {
    this._watermarkParams = null;
    this._overlayExpressionParams = null;
    this._zoomObserver?.disconnect();
    this._zoomObserver = null;
    this._stopFollowMouse();
    if (this._model) {
      this._model.destroy();
      this._model = null;
    }
    if (this._app) {
      this._app.destroy(false, { children: true });
      this._app = null;
    }
    if (resetView) {
      this._hasModel = false;
    }
  }

  /** Trigger a motion on the current model */
  async triggerMotion(group: string, index = 0): Promise<void> {
    if (this._model) {
      await this._model.motion(group, index);
    }
  }

  /** Trigger an expression by index as overlay */
  async triggerExpression(index = 0): Promise<void> {
    if (!this._model || index < 0 || index >= this._expressionDefs.length) return;
    const def = this._expressionDefs[index];
    const params = await this._loadExpressionParams(def.File);
    if (params) this._overlayExpressionParams = params;
  }

  /** Load watermark expression by name as persistent base layer */
  private async _loadWatermarkExpression(name: string): Promise<void> {
    if (!name) {
      this._watermarkParams = null;
      console.log('[live2d-viewer] Watermark expression cleared');
      return;
    }
    const def = this._expressionDefs.find(d => d.Name === name);
    if (!def) {
      console.warn(`[live2d-viewer] Watermark expression "${name}" not found`);
      return;
    }
    const params = await this._loadExpressionParams(def.File);
    if (params) {
      this._watermarkParams = params;
      console.log(`[live2d-viewer] Watermark base layer loaded: ${name} (${params.map(p => p.Id)})`);
    }
  }

  /** Fetch expression params from exp3.json file (does NOT apply them) */
  private async _loadExpressionParams(file: string): Promise<any[] | null> {
    try {
      const url = this._modelBaseUrl + encodeURIComponent(file);
      console.log(`[live2d-viewer] Fetching expression: ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`[live2d-viewer] Failed to fetch expression file: ${file} (${resp.status})`);
        return null;
      }
      const expJson = await resp.json();
      const params = expJson?.Parameters;
      if (!Array.isArray(params) || params.length === 0) {
        console.warn(`[live2d-viewer] Expression file has no parameters: ${file}`);
        return null;
      }
      console.log(`[live2d-viewer] Expression loaded: ${file} (${params.length} params: ${params.map((p: any) => p.Id).join(', ')})`);
      return params;
    } catch (e) {
      console.warn(`[live2d-viewer] Error loading expression ${file}:`, e);
      return null;
    }
  }

  /** Apply expression by name as overlay (watermark base layer remains active) */
  private async _applyExpressionByName(name: string): Promise<boolean> {
    if (!this._model) return false;

    // Find in our cached definitions
    const idx = this._expressionDefs.findIndex(d => d.Name === name);
    if (idx < 0) {
      console.warn(`[live2d-viewer] Expression "${name}" not found in`, this._expressionDefs.map(d => d.Name));
      return false;
    }

    const def = this._expressionDefs[idx];

    // Load as overlay expression (on top of watermark base)
    const params = await this._loadExpressionParams(def.File);
    if (params) {
      this._overlayExpressionParams = params;
      console.log(`[live2d-viewer] Overlay expression applied: ${name} (index ${idx})`);
      return true;
    }
    return false;
  }

  /** Clear overlay expression (only watermark base remains) */
  clearOverlayExpression(): void {
    this._overlayExpressionParams = null;
    console.log('[live2d-viewer] Overlay expression cleared');
  }

  /** Set expression by name (public API for pet-overlay and menu) */
  async setExpressionByName(name: string): Promise<boolean> {
    return this._applyExpressionByName(name);
  }

  /** Get list of available expression names (excludes the watermark expression) */
  getExpressionNames(): string[] {
    const watermarkName = localStorage.getItem('live2d-watermark-expression') || '';
    return this._expressionDefs
      .map(d => d.Name)
      .filter(name => name !== watermarkName);
  }

  /** Get model info */
  get modelInfo(): Live2DModelInfo | null {
    return this._modelInfo;
  }

  /* ---- Mouse follow (eye tracking) ---- */

  /** Start or stop the follow-mouse polling based on localStorage */
  private _syncFollowMouse() {
    const enabled = localStorage.getItem('live2d-follow-mouse') !== 'false';
    if (enabled && !this._followMouseTimer) {
      this._startFollowMouse();
    } else if (!enabled && this._followMouseTimer) {
      this._stopFollowMouse();
    }
  }

  private _startFollowMouse() {
    if (this._followMouseTimer) return;
    // Poll cursor position every 50ms for smooth tracking
    this._followMouseTimer = setInterval(async () => {
      if (!this._model) return;
      const pos = await window.electronAPI?.getCursorRelative?.();
      if (!pos) return;
      // Normalize to roughly [-1, 1] using half-window as reference range
      const nx = Math.max(-1, Math.min(1, pos.x / Math.max(pos.hw, 100)));
      const ny = Math.max(-1, Math.min(1, pos.y / Math.max(pos.hh, 100)));
      // model.focus() expects world-space pixel coordinates, not normalized values.
      // Convert [-1, 1] to pixi world coords relative to the model's position.
      const worldX = this._model.x + nx * (this._model.width / 2);
      const worldY = this._model.y + ny * (this._model.height / 2);
      this._model.focus(worldX, worldY);
    }, 50);
  }

  private _stopFollowMouse() {
    if (this._followMouseTimer) {
      clearInterval(this._followMouseTimer);
      this._followMouseTimer = null;
    }
  }

  override render() {
    return html`
      ${this._loading
        ? html`<div class="loading-overlay"><div class="spinner"></div></div>`
        : null}
      ${!this._hasModel && !this._loading
        ? html`
          <div class="placeholder">
            <div class="pet-fallback">
              <span class="material-symbols-outlined">pets</span>
            </div>
            <div class="hint">
              <span class="body-large">${this._error || 'Live2D 模型未加载'}</span><br/>
              <span class="body-small" style="color:var(--md-sys-color-outline)">
                右键 -> 设置 进行配置
              </span>
            </div>
          </div>`
        : null}
      ${this._hasModel ? html`<canvas></canvas>` : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'live2d-viewer': Live2DViewer;
  }
}


