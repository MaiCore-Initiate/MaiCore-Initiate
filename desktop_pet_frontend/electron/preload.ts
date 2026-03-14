/* =============================================
   Electron Preload Script
   Exposes safe IPC bridge to renderer
   ============================================= */

import { contextBridge, ipcRenderer } from 'electron';

// 从命令行参数获取后端地址
const _argvIdx = process.argv.indexOf('--maicore-backend-url') >= 0 ? process.argv.indexOf('--maicore-backend-url') : process.argv.indexOf('--backend-url');
const backendUrl = process.env.MAICORE_BACKEND_URL
  || process.argv.find(arg => arg.startsWith('--maicore-backend-url='))?.split('=')[1]
  || process.argv.find(arg => arg.startsWith('--backend-url='))?.split('=')[1]
  || (_argvIdx >= 0 ? process.argv[_argvIdx + 1] : undefined)
  || 'http://127.0.0.1:10086';

// 从命令行参数获取 Auth Token（由 Python 启动时传入）
const _authIdx = process.argv.indexOf('--maicore-auth-token') >= 0 ? process.argv.indexOf('--maicore-auth-token') : process.argv.indexOf('--auth-token');
const authToken = process.env.MAICORE_AUTH_TOKEN || (_authIdx >= 0 ? process.argv[_authIdx + 1] : undefined) || '';

function toLocalAssetUrl(filePath: string): string {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  const encoded = encodeURI(normalized.startsWith('/') ? normalized : `/${normalized}`);
  return `maicore-file://${encoded}`;
}

// 向渲染进程暴露后端地址
contextBridge.exposeInMainWorld('__BACKEND_URL__', `${backendUrl}/api/pet-v2`);

// 向渲染进程暴露 HOST_BASE（不含 /api/pet-v2）和 AUTH_TOKEN
contextBridge.exposeInMainWorld('__BACKEND_HOST__', backendUrl);
contextBridge.exposeInMainWorld('__AUTH_TOKEN__', authToken);

contextBridge.exposeInMainWorld('electronAPI', {
  getSharedDesktopPetSettings: (): Promise<Record<string, any>> =>
    ipcRenderer.invoke('shared-state:get-settings'),

  patchSharedDesktopPetSettings: (patch: Record<string, any>): Promise<Record<string, any>> =>
    ipcRenderer.invoke('shared-state:patch-settings', patch),

  getSharedModelsCache: (): Promise<{ models: Record<string, any>[]; updated_at?: number }> =>
    ipcRenderer.invoke('shared-state:get-models-cache'),

  scanSharedLive2DModels: (): Promise<Record<string, any>[]> =>
    ipcRenderer.invoke('shared-state:scan-models'),

  getSharedRuntimeInfo: (): Promise<{ backend_url: string; auth_token: string; running?: boolean }> =>
    ipcRenderer.invoke('shared-state:get-runtime'),

  onSharedStateChanged: (callback: (payload: { kind: 'settings' | 'models_cache' | 'runtime' }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { kind: 'settings' | 'models_cache' | 'runtime' }) => callback(payload);
    ipcRenderer.on('shared-state-changed', listener);
    return () => ipcRenderer.removeListener('shared-state-changed', listener);
  },

  toLocalAssetUrl: (filePath: string): string =>
    toLocalAssetUrl(filePath),

  /** Get whether this is the 'pet' or 'panel' window */
  getWindowType: (): Promise<'pet' | 'panel' | 'menu' | 'unknown'> =>
    ipcRenderer.invoke('get-window-type'),

  /** Open the management panel window */
  openPanel: (page?: string): void =>
    ipcRenderer.send('open-panel', page),

  /** Close the panel window */
  closePanel: (): void =>
    ipcRenderer.send('close-panel'),

  /** Minimize the panel window */
  minimizePanel: (): void =>
    ipcRenderer.send('minimize-panel'),

  /** Start dragging the pet window */
  petDragStart: (): void =>
    ipcRenderer.send('pet-drag-start'),

  /** Stop dragging the pet window */
  petDragEnd: (): void =>
    ipcRenderer.send('pet-drag-end'),

  /** Set whether mouse events pass through pet window */
  setIgnoreMouse: (ignore: boolean): void =>
    ipcRenderer.send('set-ignore-mouse', ignore),

  /** Show native context menu on pet window */
  showPetContextMenu: (expressions: string[]): void =>
    ipcRenderer.send('pet-context-menu', expressions),

  /** Listen for menu action events from native context menu */
  onMenuAction: (callback: (action: string, data?: string) => void): void => {
    ipcRenderer.on('menu-action', (_event, action: string, data?: string) => callback(action, data));
  },

  /** Send menu action (from menu popup window) */
  menuAction: (action: string, data?: string): void =>
    ipcRenderer.send('menu-action', action, data),

  /** Close the menu popup window */
  closeMenuWindow: (): void =>
    ipcRenderer.send('close-menu-window'),

  /** Resize the menu popup window */
  resizeMenuWindow: (width: number, height: number): void =>
    ipcRenderer.send('resize-menu-window', width, height),

  /** Resize the pet window to fit the model */
  resizePetWindow: (width: number, height: number): void =>
    ipcRenderer.send('resize-pet-window', width, height),

  /** Zoom pet window by delta (left-click + scroll wheel) */
  zoomPetWindow: (delta: number): void =>
    ipcRenderer.send('zoom-pet-window', delta),

  /** Set pet zoom to absolute value (from settings slider) */
  setPetZoom: (zoom: number): void =>
    ipcRenderer.send('set-pet-zoom', zoom),

  /** Get current pet zoom factor */
  getPetZoom: (): Promise<number> =>
    ipcRenderer.invoke('get-pet-zoom'),

  /** Get cursor position relative to pet window center */
  getCursorRelative: (): Promise<{x: number; y: number; hw: number; hh: number} | null> =>
    ipcRenderer.invoke('get-cursor-relative'),

  /** Set pet window always-on-top */
  setAlwaysOnTop: (on: boolean): void =>
    ipcRenderer.send('set-always-on-top', on),

  /** Get pet window always-on-top state */
  getAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke('get-always-on-top'),

  /** Get whether this packaged app is registered to launch at login */
  getAutoLaunchEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('get-auto-launch-enabled'),

  /** Register or unregister this packaged app as a login item */
  setAutoLaunchEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-auto-launch-enabled', enabled),

  /** Listen for zoom changes from main process */
  onZoomChanged: (callback: (zoom: number) => void): void => {
    ipcRenderer.on('zoom-changed', (_event, zoom: number) => callback(zoom));
  },

  /** Get menu data (expression list) from main process - pull-based */
  getMenuData: (): Promise<string[]> =>
    ipcRenderer.invoke('get-menu-data'),

  /** Listen for navigation events from main process */
  onNavigate: (callback: (page: string) => void): void => {
    ipcRenderer.on('navigate', (_event, page: string) => callback(page));
  },
});

