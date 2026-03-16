/* =============================================
   Electron Main Process
   - Pet window: transparent, frameless, always-on-top
   - Panel window: schedule/todo/settings management
   - System tray
   ============================================= */

import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'node:path';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'maicore-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const isDev = !app.isPackaged;
const startupLogPath = path.join(findSharedProjectRoot(), 'log', 'desktop_pet_electron.log');

type SharedStateKind = 'settings' | 'models_cache' | 'runtime';

type SharedSettings = Record<string, any>;
type SharedRuntimeInfo = {
  backend_url: string;
  auth_token: string;
  running?: boolean;
  pid?: number | null;
  started_at?: number | null;
  updated_at?: number;
};
type SharedModelsCache = {
  models: Record<string, any>[];
  updated_at?: number;
};

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:10086';
const DEFAULT_SHARED_SETTINGS: SharedSettings = {
  enabled: false,
  model_id: '',
  scale: 1.0,
  opacity: 1.0,
  position: { x: 80, y: 120 },
  window: { width: 360, height: 520, always_on_top: true, transparent: true },
  expression: '',
  motion_group: '',
  motion_index: 0,
  face_capture_enabled: false,
  face_capture_source: 'camera',
  face_smoothing: 0.45,
  ai_enabled: true,
  persona: {
    name: '',
    tone: '',
    system_prompt: '',
    greeting: '',
  },
  memory: {
    share_between_sessions_same_model: true,
    embedding: {
      provider: '',
      base_url: '',
      api_key: '',
      model: '',
    },
    rerank: {
      provider: '',
      base_url: '',
      api_key: '',
      model: '',
    },
  },
};
const LIVE2D_COVER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const LIVE2D_CUSTOM_COVER_PREFIX = '__cover_custom';
const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.moc3': 'application/octet-stream',
  '.moc': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  for (const [key, value] of Object.entries(incoming)) {
    if (isRecord(value) && isRecord(target[key])) {
      deepMerge(target[key], value);
      continue;
    }
    target[key] = value;
  }
  return target;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizePersona(value: unknown): Record<string, string> {
  const persona = isRecord(value) ? value : {};
  return {
    name: String(persona.name ?? '').trim(),
    tone: String(persona.tone ?? '').trim(),
    system_prompt: String(persona.system_prompt ?? '').trim(),
    greeting: String(persona.greeting ?? '').trim(),
  };
}

function normalizeSharedSettings(value?: Record<string, any> | null): SharedSettings {
  const result = deepMerge(structuredClone(DEFAULT_SHARED_SETTINGS), isRecord(value) ? value : {});
  const pos = isRecord(result.position) ? result.position : {};
  const win = isRecord(result.window) ? result.window : {};
  const persona = isRecord(result.persona) ? result.persona : {};
  const memory = isRecord(result.memory) ? result.memory : {};
  const embedding = isRecord(memory.embedding) ? memory.embedding : {};
  const rerank = isRecord(memory.rerank) ? memory.rerank : {};
  const modelOverrides = isRecord(result.model_overrides) ? result.model_overrides : {};

  result.enabled = Boolean(result.enabled);
  result.model_id = String(result.model_id ?? '').trim();
  result.scale = clamp(toFiniteNumber(result.scale, 1.0), 0.2, 4.0);
  result.opacity = clamp(toFiniteNumber(result.opacity, 1.0), 0.1, 1.0);
  result.position = {
    x: Math.round(toFiniteNumber(pos.x, DEFAULT_SHARED_SETTINGS.position.x)),
    y: Math.round(toFiniteNumber(pos.y, DEFAULT_SHARED_SETTINGS.position.y)),
  };
  result.window = {
    width: Math.round(clamp(toFiniteNumber(win.width, 360), 180, 1200)),
    height: Math.round(clamp(toFiniteNumber(win.height, 520), 180, 1600)),
    always_on_top: Boolean(win.always_on_top ?? true),
    transparent: Boolean(win.transparent ?? true),
  };
  result.expression = String(result.expression ?? '').trim();
  result.motion_group = String(result.motion_group ?? '').trim();
  result.motion_index = Math.max(0, Math.round(toFiniteNumber(result.motion_index, 0)));
  result.face_capture_enabled = Boolean(result.face_capture_enabled);
  result.face_capture_source = String(result.face_capture_source ?? 'camera').trim() || 'camera';
  result.face_smoothing = clamp(toFiniteNumber(result.face_smoothing, 0.45), 0, 1);
  result.ai_enabled = Boolean(result.ai_enabled ?? true);
  result.persona = normalizePersona(persona);
  result.memory = {
    share_between_sessions_same_model: Boolean(memory.share_between_sessions_same_model ?? true),
    embedding: {
      provider: String(embedding.provider ?? '').trim(),
      base_url: String(embedding.base_url ?? '').trim(),
      api_key: String(embedding.api_key ?? '').trim(),
      model: String(embedding.model ?? '').trim(),
    },
    rerank: {
      provider: String(rerank.provider ?? '').trim(),
      base_url: String(rerank.base_url ?? '').trim(),
      api_key: String(rerank.api_key ?? '').trim(),
      model: String(rerank.model ?? '').trim(),
    },
  };
  result.model_overrides = Object.fromEntries(
    Object.entries(modelOverrides)
      .map(([rawModelId, rawOverride]) => {
        const modelId = String(rawModelId ?? '').trim();
        if (!modelId || !isRecord(rawOverride)) return null;
        const override: Record<string, any> = {};
        const overrideWin = isRecord(rawOverride.window) ? rawOverride.window : {};
        const overrideScale = Number(rawOverride.scale);
        if (Number.isFinite(overrideScale)) {
          override.scale = clamp(overrideScale, 0.3, 2.5);
        }
        const overrideWidth = Number(overrideWin.width);
        const overrideHeight = Number(overrideWin.height);
        if (Number.isFinite(overrideWidth) || Number.isFinite(overrideHeight)) {
          override.window = {
            width: Math.round(clamp(Number.isFinite(overrideWidth) ? overrideWidth : DEFAULT_SHARED_SETTINGS.window.width, 180, 1200)),
            height: Math.round(clamp(Number.isFinite(overrideHeight) ? overrideHeight : DEFAULT_SHARED_SETTINGS.window.height, 180, 1600)),
          };
        }
        if (isRecord(rawOverride.persona)) {
          override.persona = normalizePersona(rawOverride.persona);
        }
        return Object.keys(override).length ? [modelId, override] : null;
      })
      .filter((entry): entry is [string, Record<string, any>] => Boolean(entry)),
  );
  return result;
}

function resolveEffectiveSharedSettings(settings: SharedSettings): SharedSettings {
  const result = normalizeSharedSettings(settings);
  const modelId = String(result.model_id ?? '').trim();
  if (!modelId) return result;
  const override = isRecord(result.model_overrides?.[modelId]) ? result.model_overrides[modelId] : null;
  if (!override) return result;

  const overrideScale = Number(override.scale);
  if (Number.isFinite(overrideScale)) {
    result.scale = clamp(overrideScale, 0.3, 2.5);
  }

  const overrideWindow = isRecord(override.window) ? override.window : null;
  if (overrideWindow) {
    const width = Number(overrideWindow.width);
    const height = Number(overrideWindow.height);
    if (Number.isFinite(width)) {
      result.window.width = Math.round(clamp(width, 180, 1200));
    }
    if (Number.isFinite(height)) {
      result.window.height = Math.round(clamp(height, 180, 1600));
    }
  }

  if (isRecord(override.persona)) {
    result.persona = normalizePersona(override.persona);
  }

  return result;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    writeStartupLog('readJsonFile failed', { filePath, error });
    return null;
  }
}

function writeJsonFile(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = JSON.stringify(payload, null, 2);
  let lastError: unknown = null;
  for (let i = 0; i < 8; i++) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'EPERM' && code !== 'EACCES') {
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  throw lastError;
}

function isSubPath(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findSharedProjectRoot(): string {
  const seeds = [
    process.env.MAICORE_PROJECT_ROOT,
    process.cwd(),
    __dirname,
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../../../..'),
    path.dirname(process.execPath),
    path.resolve(path.dirname(process.execPath), '..'),
    path.resolve(path.dirname(process.execPath), '../..'),
    path.resolve(path.dirname(process.execPath), '../../..'),
  ].filter((value): value is string => Boolean(value));

  const visited = new Set<string>();
  for (const seed of seeds) {
    let current = path.resolve(seed);
    for (let i = 0; i < 8; i++) {
      if (visited.has(current)) break;
      visited.add(current);
      const dataDir = path.join(current, 'data');
      if (
        fs.existsSync(dataDir)
        && (fs.existsSync(path.join(dataDir, 'Live_2D'))
          || fs.existsSync(path.join(current, 'src'))
          || fs.existsSync(path.join(current, 'webui')))
      ) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return path.resolve(process.cwd());
}

const projectRoot = findSharedProjectRoot();
const sharedDataDir = path.join(projectRoot, 'data');
const sharedSettingsPath = path.join(sharedDataDir, 'desktop_pet_settings.json');
const sharedModelsCachePath = path.join(sharedDataDir, 'desktop_pet_models_cache.json');
const sharedRuntimePath = path.join(sharedDataDir, 'desktop_pet_runtime.json');
const live2dRoot = path.join(sharedDataDir, 'Live_2D');

function readStoredSharedDesktopPetSettings(): SharedSettings {
  return normalizeSharedSettings(readJsonFile<SharedSettings>(sharedSettingsPath));
}

function readSharedDesktopPetSettings(): SharedSettings {
  return resolveEffectiveSharedSettings(readStoredSharedDesktopPetSettings());
}

function writeSharedDesktopPetSettings(settings: Record<string, any>): SharedSettings {
  const normalized = normalizeSharedSettings(settings);
  writeJsonFile(sharedSettingsPath, normalized);
  return resolveEffectiveSharedSettings(normalized);
}

function patchSharedDesktopPetSettings(patch: Record<string, any>): SharedSettings {
  const current = readStoredSharedDesktopPetSettings();
  return writeSharedDesktopPetSettings(deepMerge(current, isRecord(patch) ? patch : {}));
}

function readSharedModelsCache(): SharedModelsCache {
  const raw = readJsonFile<SharedModelsCache>(sharedModelsCachePath);
  return {
    models: Array.isArray(raw?.models) ? raw.models : [],
    updated_at: typeof raw?.updated_at === 'number' ? raw.updated_at : undefined,
  };
}

function readSharedRuntimeInfo(): SharedRuntimeInfo {
  const raw = readJsonFile<SharedRuntimeInfo>(sharedRuntimePath);
  return {
    backend_url: String(raw?.backend_url ?? '').trim() || DEFAULT_BACKEND_URL,
    auth_token: String(raw?.auth_token ?? '').trim(),
    running: Boolean(raw?.running),
    pid: typeof raw?.pid === 'number' ? raw.pid : null,
    started_at: typeof raw?.started_at === 'number' ? raw.started_at : null,
    updated_at: typeof raw?.updated_at === 'number' ? raw.updated_at : undefined,
  };
}

function writeSharedRuntimeInfo(patch: Record<string, any>): SharedRuntimeInfo {
  const current = readJsonFile<Record<string, any>>(sharedRuntimePath) ?? {};
  const next = {
    ...current,
    ...patch,
    updated_at: Date.now(),
  };
  writeJsonFile(sharedRuntimePath, next);
  return readSharedRuntimeInfo();
}

function toMaicoreFileUrl(filePath: string): string {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const normalized = path.resolve(raw).replace(/\\/g, '/');
  const encoded = encodeURI(normalized.startsWith('/') ? normalized : `/${normalized}`);
  return `maicore-file://${encoded}`;
}

function decodeMaicoreFileUrl(requestUrl: string): string | null {
  try {
    const parsed = new URL(requestUrl);
    let pathname = decodeURIComponent(parsed.pathname || '');
    if (process.platform === 'win32') {
      const host = decodeURIComponent(parsed.hostname || '');
      if (/^[a-z]$/i.test(host)) {
        pathname = `${host.toUpperCase()}:${pathname}`;
      } else if (pathname.startsWith('/')) {
        pathname = pathname.slice(1);
      }
    }
    return path.normalize(pathname);
  } catch {
    return null;
  }
}

function readJsonWithFallback(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return {};
    }
  }
}

function findLocalModelJson(modelDir: string): string | null {
  const directModel3 = fs.readdirSync(modelDir)
    .filter((name) => name.endsWith('.model3.json'))
    .sort((a, b) => a.localeCompare(b))[0];
  if (directModel3) return path.join(modelDir, directModel3);

  const directModel = fs.readdirSync(modelDir)
    .filter((name) => name.endsWith('.model.json'))
    .sort((a, b) => a.localeCompare(b))[0];
  if (directModel) return path.join(modelDir, directModel);

  const queue = [modelDir];
  while (queue.length) {
    const current = queue.shift()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.name.endsWith('.model3.json') || entry.name.endsWith('.model.json')) {
        return fullPath;
      }
    }
  }
  return null;
}

function isValidLive2DFolder(modelDir: string): boolean {
  const queue = [modelDir];
  while (queue.length) {
    const current = queue.shift()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && ['.moc', '.moc3'].includes(path.extname(entry.name).toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function extractLocalLive2DMetadata(modelDir: string): Record<string, any> {
  const modelJsonPath = findLocalModelJson(modelDir);
  const expressions: Array<{ name: string; file: string }> = [];
  const motions: Record<string, Array<{ index: number; file: string }>> = {};
  let textureCount = 0;

  if (modelJsonPath && fs.existsSync(modelJsonPath)) {
    const modelData = readJsonWithFallback(modelJsonPath);
    const refs = isRecord(modelData.FileReferences) ? modelData.FileReferences : {};
    const expressionList = Array.isArray(refs.Expressions) ? refs.Expressions : [];
    for (const item of expressionList) {
      if (!isRecord(item)) continue;
      const fileName = String(item.File ?? '').trim();
      const name = String(item.Name ?? '').trim() || path.parse(fileName).name;
      if (fileName) expressions.push({ name, file: fileName });
    }

    const motionMap = isRecord(refs.Motions) ? refs.Motions : {};
    for (const [group, value] of Object.entries(motionMap)) {
      if (!Array.isArray(value)) continue;
      const groupItems = value
        .map((item, index) => {
          if (!isRecord(item)) return null;
          const fileName = String(item.File ?? '').trim();
          return fileName ? { index, file: fileName } : null;
        })
        .filter((item): item is { index: number; file: string } => Boolean(item));
      if (groupItems.length) motions[group] = groupItems;
    }

    const textures = Array.isArray(refs.Textures) ? refs.Textures : [];
    textureCount = textures.length;
  }

  if (!expressions.length) {
    const queue = [modelDir];
    while (queue.length) {
      const current = queue.shift()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith('.exp3.json')) {
          expressions.push({
            name: path.parse(entry.name).name,
            file: path.relative(modelDir, fullPath).split(path.sep).join('/'),
          });
        }
      }
    }
  }

  if (!Object.keys(motions).length) {
    const motionFiles: string[] = [];
    const queue = [modelDir];
    while (queue.length) {
      const current = queue.shift()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith('.motion3.json')) {
          motionFiles.push(path.relative(modelDir, fullPath).split(path.sep).join('/'));
        }
      }
    }
    motionFiles.sort((a, b) => a.localeCompare(b));
    if (motionFiles.length) {
      motions.default = motionFiles.map((file, index) => ({ index, file }));
    }
  }

  let coverPath = '';
  for (const ext of LIVE2D_COVER_EXTENSIONS) {
    const candidate = path.join(modelDir, `${LIVE2D_CUSTOM_COVER_PREFIX}${ext}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      coverPath = candidate;
      break;
    }
  }
  if (!coverPath) {
    const fallback = fs.readdirSync(modelDir)
      .sort((a, b) => a.localeCompare(b))
      .find((name) => LIVE2D_COVER_EXTENSIONS.includes(path.extname(name).toLowerCase()));
    if (fallback) {
      coverPath = path.join(modelDir, fallback);
    }
  }

  return {
    model_id: path.basename(modelDir),
    path: modelDir,
    model_json: modelJsonPath ? path.basename(modelJsonPath) : '',
    model_json_url: '',
    model_json_path: modelJsonPath ?? '',
    cover_url: '',
    cover_path: coverPath,
    expressions,
    motions,
    texture_count: textureCount,
  };
}

function scanSharedLive2DModels(): Record<string, any>[] {
  if (!fs.existsSync(live2dRoot) || !fs.statSync(live2dRoot).isDirectory()) {
    return [];
  }
  const models = fs.readdirSync(live2dRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(live2dRoot, entry.name))
    .filter((modelDir) => {
      try {
        return isValidLive2DFolder(modelDir);
      } catch {
        return false;
      }
    })
    .map((modelDir) => extractLocalLive2DMetadata(modelDir));

  writeJsonFile(sharedModelsCachePath, {
    models,
    updated_at: Date.now(),
  });
  return models;
}

function broadcastSharedStateChanged(kind: SharedStateKind): void {
  for (const win of [petWindow, panelWindow, menuWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('shared-state-changed', { kind });
    }
  }
}

function writeStartupLog(message: string, extra?: unknown) {
  try {
    fs.mkdirSync(path.dirname(startupLogPath), { recursive: true });
    const line = `[${new Date().toISOString()}] ${message}${extra === undefined ? '' : ` ${JSON.stringify(extra)}`}\n`;
    fs.appendFileSync(startupLogPath, line, 'utf8');
  } catch {
  }
}

function attachWindowDebugLog(win: BrowserWindow, name: string) {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeStartupLog(`${name}:console`, { level, message, line, sourceId });
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeStartupLog(`${name}:did-fail-load`, { errorCode, errorDescription, validatedURL, isMainFrame });
  });
  win.webContents.on('did-finish-load', () => {
    writeStartupLog(`${name}:did-finish-load`, { url: win.webContents.getURL() });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    writeStartupLog(`${name}:render-process-gone`, details);
  });
  win.webContents.on('unresponsive', () => {
    writeStartupLog(`${name}:unresponsive`);
  });
}

function getAutoLaunchEnabled(): boolean {
  if (!app.isPackaged) return false;
  try {
    const loginItem = app.getLoginItemSettings({
      path: process.execPath,
      args: [],
    });
    return Boolean(loginItem.openAtLogin);
  } catch (error) {
    writeStartupLog('getAutoLaunchEnabled failed', error);
    return false;
  }
}

function setAutoLaunchEnabled(enabled: boolean): boolean {
  if (!app.isPackaged) {
    writeStartupLog('setAutoLaunchEnabled skipped in dev', { enabled });
    return false;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: [],
    });
  } catch (error) {
    writeStartupLog('setAutoLaunchEnabled failed', { enabled, error });
  }
  const actual = getAutoLaunchEnabled();
  writeStartupLog('setAutoLaunchEnabled result', {
    enabled,
    actual,
    execPath: process.execPath,
  });
  return actual;
}

function syncAutoLaunchFromSettings(settings = readStoredSharedDesktopPetSettings()): boolean {
  return setAutoLaunchEnabled(Boolean(settings.enabled));
}

function clampBoundsToDisplay(bounds: { x: number; y: number; width: number; height: number }) {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2),
  });
  const workArea = display.workArea;
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height);
  return {
    x: clamp(bounds.x, workArea.x, maxX),
    y: clamp(bounds.y, workArea.y, maxY),
    width: bounds.width,
    height: bounds.height,
  };
}

function persistPetWindowState(options: {
  position?: boolean;
  size?: boolean;
  scale?: boolean;
  alwaysOnTop?: boolean;
}): void {
  if (!petWindow) return;
  const patch: Record<string, any> = {};
  const bounds = petWindow.getBounds();
  if (options.position) {
    patch.position = { x: bounds.x, y: bounds.y };
  }
  if (options.size || options.alwaysOnTop) {
    patch.window = {};
    if (options.size) {
      patch.window.width = petBaseW;
      patch.window.height = petBaseH;
    }
    if (options.alwaysOnTop) {
      patch.window.always_on_top = petWindow.isAlwaysOnTop();
    }
  }
  if (options.scale) {
    patch.scale = petZoom;
  }
  if (!Object.keys(patch).length) return;
  try {
    const currentSettings = readStoredSharedDesktopPetSettings();
    const modelId = String(currentSettings.model_id ?? '').trim();
    if ((options.size || options.scale) && modelId) {
      patch.model_overrides = patch.model_overrides ?? {};
      patch.model_overrides[modelId] = patch.model_overrides[modelId] ?? {};
      if (options.size) {
        patch.model_overrides[modelId].window = {
          width: petBaseW,
          height: petBaseH,
        };
      }
      if (options.scale) {
        patch.model_overrides[modelId].scale = petZoom;
      }
    }
    writeSharedDesktopPetSettings(deepMerge(currentSettings, patch));
  } catch (error) {
    writeStartupLog('persistPetWindowState failed', error);
  }
}

function applySharedSettingsToPetWindow(settings = readSharedDesktopPetSettings()): void {
  initialPosition = { x: settings.position.x, y: settings.position.y };
  initialSize = { width: settings.window.width, height: settings.window.height };
  petBaseW = settings.window.width;
  petBaseH = settings.window.height;
  petZoom = clamp(toFiniteNumber(settings.scale, petZoom), 0.3, 2.5);
  initialAlwaysOnTop = Boolean(settings.window.always_on_top);
  initialTransparent = Boolean(settings.window.transparent);

  if (!petWindow || petWindow.isDestroyed()) return;

  petWindow.setAlwaysOnTop(initialAlwaysOnTop);
  petWindow.setBounds(clampBoundsToDisplay({
    x: settings.position.x,
    y: settings.position.y,
    width: petBaseW,
    height: petBaseH,
  }));
  petWindow.webContents.send('zoom-changed', petZoom);
  panelWindow?.webContents.send('zoom-changed', petZoom);
}

function handleSharedStateChanged(kind: SharedStateKind): void {
  if (kind === 'settings') {
    try {
      applySharedSettingsToPetWindow();
    } catch (error) {
      writeStartupLog('applySharedSettingsToPetWindow failed', error);
    }
  } else if (kind === 'runtime') {
    startupSharedRuntime = readSharedRuntimeInfo();
    if (!hasExplicitBackend) {
      backendUrl = startupSharedRuntime.backend_url || DEFAULT_BACKEND_URL;
    }
    if (!hasExplicitToken) {
      authToken = startupSharedRuntime.auth_token || '';
    }
  }
  broadcastSharedStateChanged(kind);
}

function startSharedStateWatchers(): void {
  return;
}

function stopSharedStateWatchers(): void {
  sharedStateWatchersStarted = false;
  for (const timer of sharedStateWatchTimers.values()) {
    clearTimeout(timer);
  }
  sharedStateWatchTimers.clear();
  for (const watcher of sharedStateWatchers.values()) {
    try {
      watcher.close();
    } catch {
    }
  }
  sharedStateWatchers.clear();
}

function registerMaicoreFileProtocol(): void {
  protocol.handle('maicore-file', async (request) => {
    const localPath = decodeMaicoreFileUrl(request.url);
    writeStartupLog('maicore-file request', { url: request.url, localPath });
    if (!localPath || !isSubPath(localPath, live2dRoot) || !fs.existsSync(localPath)) {
      writeStartupLog('maicore-file reject', {
        url: request.url,
        localPath,
        exists: localPath ? fs.existsSync(localPath) : false,
      });
      return new Response('Not Found', { status: 404 });
    }
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) {
      writeStartupLog('maicore-file reject non-file', { localPath });
      return new Response('Not Found', { status: 404 });
    }
    const body = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': MIME_TYPES[ext] || 'application/octet-stream',
        'cache-control': 'no-cache',
      },
    });
  });
}
let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let menuWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sharedStateWatchersStarted = false;
const sharedStateWatchers = new Map<SharedStateKind, fs.FSWatcher>();
const sharedStateWatchTimers = new Map<SharedStateKind, ReturnType<typeof setTimeout>>();

// Store menu expressions for pull-based IPC (avoids timing race)
let pendingMenuExpressions: string[] = [];

// Pet window zoom state
const startupSharedSettings = readSharedDesktopPetSettings();
let startupSharedRuntime = readSharedRuntimeInfo();
let petBaseW = startupSharedSettings.window.width;
let petBaseH = startupSharedSettings.window.height;
let petZoom = clamp(toFiniteNumber(startupSharedSettings.scale, 1.0), 0.3, 2.5);
let initialAlwaysOnTop = Boolean(startupSharedSettings.window.always_on_top);
let initialTransparent = Boolean(startupSharedSettings.window.transparent);

// 解析命令行参数
const args = process.argv.slice(1);
let backendUrl = process.env.MAICORE_BACKEND_URL || '';
let initialPosition = {
  x: startupSharedSettings.position.x,
  y: startupSharedSettings.position.y,
};
let initialSize = {
  width: startupSharedSettings.window.width,
  height: startupSharedSettings.window.height,
};
let authToken = process.env.MAICORE_AUTH_TOKEN || '';  // Bearer Token，供 Electron 与后端鉴权
let hasExplicitBackend = Boolean(process.env.MAICORE_BACKEND_URL);
let hasExplicitToken = Boolean(process.env.MAICORE_AUTH_TOKEN);
let hasExplicitPosition = false;
let hasExplicitSize = false;
const envPosition = process.env.MAICORE_PET_POSITION || '';
if (envPosition.includes(',')) {
  const [x, y] = envPosition.split(',').map(Number);
  if (!isNaN(x) && !isNaN(y)) {
    initialPosition = { x, y };
    hasExplicitPosition = true;
  }
}

const envSize = process.env.MAICORE_PET_SIZE || '';
if (envSize.includes('x')) {
  const [width, height] = envSize.split('x').map(Number);
  if (!isNaN(width) && !isNaN(height)) {
    initialSize = { width, height };
    petBaseW = width;
    petBaseH = height;
    hasExplicitSize = true;
  }
}


for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--maicore-backend-url' || args[i] === '--backend-url') && args[i + 1]) {
    backendUrl = args[i + 1];
    hasExplicitBackend = true;
    i++;
  }
  if ((args[i] === '--maicore-position' || args[i] === '--position') && args[i + 1]) {
    const [x, y] = args[i + 1].split(',').map(Number);
    if (!isNaN(x) && !isNaN(y)) {
      initialPosition = { x, y };
      hasExplicitPosition = true;
    }
    i++;
  }
  if ((args[i] === '--maicore-size' || args[i] === '--size') && args[i + 1]) {
    const [width, height] = args[i + 1].split('x').map(Number);
    if (!isNaN(width) && !isNaN(height)) {
      initialSize = { width, height };
      petBaseW = width;
      petBaseH = height;
      hasExplicitSize = true;
    }
    i++;
  }
  if ((args[i] === '--maicore-auth-token' || args[i] === '--auth-token') && args[i + 1]) {
    authToken = args[i + 1];
    hasExplicitToken = true;
    i++;
  }
}

if (!hasExplicitBackend) {
  backendUrl = startupSharedRuntime.backend_url || DEFAULT_BACKEND_URL;
}
if (!hasExplicitToken) {
  authToken = startupSharedRuntime.auth_token || '';
}
if (!hasExplicitPosition) {
  initialPosition = {
    x: startupSharedSettings.position.x,
    y: startupSharedSettings.position.y,
  };
}
if (!hasExplicitSize) {
  initialSize = {
    width: startupSharedSettings.window.width,
    height: startupSharedSettings.window.height,
  };
  petBaseW = initialSize.width;
  petBaseH = initialSize.height;
}
backendUrl = backendUrl || DEFAULT_BACKEND_URL;

writeStartupLog('startup args', {
  backendUrl,
  initialPosition,
  initialSize,
  petZoom,
  authTokenConfigured: Boolean(authToken),
  projectRoot,
  sharedDataDir,
  isPackaged: app.isPackaged,
});

process.on('uncaughtException', (error) => {
  writeStartupLog('uncaughtException', {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  writeStartupLog('unhandledRejection', reason);
});

console.log('[Electron] startup args:', { backendUrl, initialPosition, initialSize });

/* ---- Pet Window (Desktop Overlay) ---- */

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;

  // 使用共享配置中的基础尺寸，实际窗口尺寸会叠加当前缩放
  const petW = initialSize.width;
  const petH = initialSize.height;

  // 计算窗口位置
  let petX: number;
  let petY: number;

  if (Number.isFinite(initialPosition.x) && Number.isFinite(initialPosition.y)) {
    // 使用共享配置或命令行指定的位置
    petX = initialPosition.x;
    petY = initialPosition.y;
  } else {
    // 使用默认位置（右下角）
    petX = screenW - petW - 40;
    petY = screenH - petH - 20;
  }

  const clampedPetBounds = clampBoundsToDisplay({ x: petX, y: petY, width: petW, height: petH });

  petWindow = new BrowserWindow({
    ...clampedPetBounds,
    transparent: initialTransparent,
    frame: false,
    resizable: false,
    alwaysOnTop: initialAlwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowDebugLog(petWindow, 'pet');

  // Show window once content is ready
  petWindow.once('ready-to-show', () => {
    petWindow?.show();
  });

  // Make click-through on transparent areas
  petWindow.setIgnoreMouseEvents(false);

  if (isDev) {
    petWindow.loadURL('http://localhost:5500/#/pet');
    petWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    petWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/pet' });
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });

  return petWindow;
}

/* ---- Panel Window (Management UI) ---- */

function createPanelWindow() {
  if (panelWindow) {
    panelWindow.focus();
    return panelWindow;
  }

  panelWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#73796d',
      height: 40,
    },
    backgroundColor: '#f8faf0',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachWindowDebugLog(panelWindow, 'panel');

  if (isDev) {
    panelWindow.loadURL('http://localhost:5500/#/panel');
  } else {
    panelWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/panel' });
  }

  panelWindow.on('closed', () => {
    panelWindow = null;
  });

  return panelWindow;
}

/* ---- System Tray ---- */

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  writeStartupLog('createTray icon', { iconPath, empty: icon.isEmpty() });

  if (icon.isEmpty()) {
    writeStartupLog('createTray skipped: icon empty');
    return null;
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示桌宠',
      click: () => {
        if (petWindow) {
          petWindow.show();
        } else {
          createPetWindow();
        }
      },
    },
    {
      label: '打开面板',
      click: () => createPanelWindow(),
    },
    { type: 'separator' },
    {
      label: '隐藏桌宠',
      click: () => petWindow?.hide(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('MaiCore 桌宠');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    createPanelWindow();
  });

  writeStartupLog('createTray success');
  return tray;
}

/* ---- IPC Handlers ---- */


function setupIPC() {
  ipcMain.handle('shared-state:get-settings', () => {
    return readSharedDesktopPetSettings();
  });

  ipcMain.handle('shared-state:patch-settings', (_event, patch: Record<string, any>) => {
    const next = patchSharedDesktopPetSettings(patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      const actualEnabled = syncAutoLaunchFromSettings(readStoredSharedDesktopPetSettings());
      if (Boolean(next.enabled) !== actualEnabled) {
        const corrected = patchSharedDesktopPetSettings({ enabled: actualEnabled });
        applySharedSettingsToPetWindow(corrected);
        broadcastSharedStateChanged('settings');
        return corrected;
      }
    }
    applySharedSettingsToPetWindow(next);
    broadcastSharedStateChanged('settings');
    return next;
  });

  ipcMain.handle('shared-state:get-models-cache', () => {
    return readSharedModelsCache();
  });

  ipcMain.handle('shared-state:scan-models', () => {
    return scanSharedLive2DModels();
  });

  ipcMain.handle('shared-state:get-runtime', () => {
    return readSharedRuntimeInfo();
  });

  ipcMain.handle('get-auto-launch-enabled', () => {
    const configured = Boolean(readStoredSharedDesktopPetSettings().enabled);
    const actual = getAutoLaunchEnabled();
    return app.isPackaged ? actual : configured;
  });

  ipcMain.handle('set-auto-launch-enabled', (_event, enabled: boolean) => {
    const actual = app.isPackaged ? setAutoLaunchEnabled(Boolean(enabled)) : Boolean(enabled);
    const next = patchSharedDesktopPetSettings({ enabled: actual });
    broadcastSharedStateChanged('settings');
    return actual;
  });

  // Open panel from pet window
  ipcMain.on('open-panel', (_event, page?: string) => {
    const win = createPanelWindow();
    if (page) {
      win.webContents.send('navigate', page);
    }
  });

  // Close panel
  ipcMain.on('close-panel', () => {
    panelWindow?.close();
  });

  // Minimize panel
  ipcMain.on('minimize-panel', () => {
    panelWindow?.minimize();
  });

  // Drag pet window - main process polls cursor for DPI-correct coords
  let dragOffset: { x: number; y: number } | null = null;
  let dragSize: { w: number; h: number } | null = null;
  let lastCursor: { x: number; y: number } | null = null;
  let dragInterval: ReturnType<typeof setInterval> | null = null;

  ipcMain.on('pet-drag-start', () => {
    if (!petWindow) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = petWindow.getPosition();
    const [ww, wh] = petWindow.getSize();
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
    dragSize = { w: ww, h: wh };
    lastCursor = { x: cursor.x, y: cursor.y };

    if (dragInterval) clearInterval(dragInterval);
    dragInterval = setInterval(() => {
      if (!petWindow || !dragOffset || !dragSize || !lastCursor) return;
      const pos = screen.getCursorScreenPoint();
      // Skip if cursor hasn't moved
      if (pos.x === lastCursor.x && pos.y === lastCursor.y) return;
      lastCursor = { x: pos.x, y: pos.y };
      // Use setBounds to lock size and prevent DPI-triggered resizing
      petWindow.setBounds({
        x: pos.x - dragOffset.x,
        y: pos.y - dragOffset.y,
        width: dragSize.w,
        height: dragSize.h,
      });
    }, 16); // ~60fps
  });

  ipcMain.on('pet-drag-end', () => {
    dragOffset = null;
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
    persistPetWindowState({ position: true });
  });

  // Set pet window mouse passthrough for transparent areas
  ipcMain.on('set-ignore-mouse', (_event, ignore: boolean) => {
    petWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // Resize pet window to fit model and store it as the base size for zoom
  ipcMain.on('resize-pet-window', (_event, width: number, height: number) => {
    if (!petWindow) return;
    const nextW = Math.round(clamp(width, 180, 1200));
    const nextH = Math.round(clamp(height, 180, 1600));
    const bounds = petWindow.getBounds();
    if (
      Math.abs(bounds.width - nextW) <= 1
      && Math.abs(bounds.height - nextH) <= 1
      && Math.abs(petBaseW - nextW) <= 1
      && Math.abs(petBaseH - nextH) <= 1
    ) {
      return;
    }
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    });
    const workArea = display.workArea;
    petBaseW = nextW;
    petBaseH = nextH;
    const nextX = clamp(
      Math.round(bounds.x + (bounds.width - nextW) / 2),
      workArea.x,
      workArea.x + workArea.width - nextW,
    );
    const nextY = clamp(
      Math.round(bounds.y + bounds.height - nextH),
      workArea.y,
      workArea.y + workArea.height - nextH,
    );
    petWindow.setBounds({
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
    });
    persistPetWindowState({ position: true, size: true, scale: true, alwaysOnTop: true });
  });

  // Zoom factor is handled by the renderer, which will re-fit the model and
  // request an exact window size that matches the visible content.
  ipcMain.on('zoom-pet-window', (_event, delta: number) => {
    petZoom = Math.max(0.3, Math.min(2.5, Math.round((petZoom + delta) * 100) / 100));
    persistPetWindowState({ position: true, scale: true });
    petWindow?.webContents.send('zoom-changed', petZoom);
    panelWindow?.webContents.send('zoom-changed', petZoom);
  });

  ipcMain.on('set-pet-zoom', (_event, zoom: number) => {
    petZoom = Math.max(0.3, Math.min(2.5, zoom));
    persistPetWindowState({ position: true, scale: true });
    petWindow?.webContents.send('zoom-changed', petZoom);
    panelWindow?.webContents.send('zoom-changed', petZoom);
  });

  // Get current pet zoom
  ipcMain.handle('get-pet-zoom', () => petZoom);

  // Get global cursor position relative to pet window center (for mouse tracking)
  ipcMain.handle('get-cursor-relative', () => {
    if (!petWindow) return null;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return { x: cursor.x - cx, y: cursor.y - cy, hw: bounds.width / 2, hh: bounds.height / 2 };
  });

  // Toggle always-on-top for pet window
  ipcMain.on('set-always-on-top', (_event, on: boolean) => {
    petWindow?.setAlwaysOnTop(on);
    persistPetWindowState({ alwaysOnTop: true });
  });

  ipcMain.handle('get-always-on-top', () => {
    return petWindow?.isAlwaysOnTop() ?? true;
  });

  // Custom styled context menu popup window
  ipcMain.on('pet-context-menu', (_event, expressions: string[]) => {
    if (!petWindow) return;

    // Close existing menu window
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
      menuWindow = null;
    }

    const cursor = screen.getCursorScreenPoint();
    const menuW = 210;
    // Use collapsed menu height for initial positioning (4 items + dividers 鈮?230px)
    // The window itself is taller (transparent), and dynamic resize will adjust later
    const posH = 240;
    const winH = 500; // generous transparent window height for expanded content

    // Clamp to screen bounds using the visible menu height
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: sx, y: sy, width: sw, height: sh } = display.workArea;
    let mx = cursor.x;
    let my = cursor.y;
    if (mx + menuW > sx + sw) mx = sx + sw - menuW;
    if (my + posH > sy + sh) my = Math.max(sy, sy + sh - posH);

    menuWindow = new BrowserWindow({
      width: menuW,
      height: winH,
      x: mx,
      y: my,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Store expressions so menu popup can pull them via invoke
    pendingMenuExpressions = expressions;

    menuWindow.once('ready-to-show', () => {
      menuWindow?.show();
    });

    menuWindow.on('blur', () => {
      if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.close();
      }
    });

    menuWindow.on('closed', () => {
      menuWindow = null;
    });

    if (isDev) {
      menuWindow.loadURL('http://localhost:5500/#/menu');
    } else {
      menuWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/menu' });
    }
  });

  // Menu popup actions 鈫?forward to pet window or open panel
  ipcMain.on('menu-action', (_event, action: string, data?: string) => {
    if (action === 'schedule' || action === 'todo' || action === 'chat' || action === 'settings') {
      const win = createPanelWindow();
      win.webContents.send('navigate', action);
    } else if (action === 'expression' && data) {
      petWindow?.webContents.send('menu-action', 'expression', data);
    } else if (action === 'clear-expression') {
      petWindow?.webContents.send('menu-action', 'clear-expression');
    }
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
    }
  });

  // Close menu window
  ipcMain.on('close-menu-window', () => {
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.close();
    }
  });

  // Resize menu popup window dynamically (e.g. when submenu opens/closes)
  ipcMain.on('resize-menu-window', (_event, width: number, height: number) => {
    if (!menuWindow || menuWindow.isDestroyed()) return;
    const [mx, my] = menuWindow.getPosition();
    const display = screen.getDisplayNearestPoint({ x: mx, y: my });
    const { y: sy, height: sh } = display.workArea;
    // If new height would push below screen, shift window up
    let newY = my;
    if (my + height > sy + sh) {
      newY = Math.max(sy, sy + sh - height);
    }
    menuWindow.setBounds({ x: mx, y: newY, width, height });
  });

  // Get menu data (expressions) - pull-based to avoid race condition
  ipcMain.handle('get-menu-data', () => {
    return pendingMenuExpressions;
  });

  // Get window type
  ipcMain.handle('get-window-type', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === petWindow) return 'pet';
    if (win === panelWindow) return 'panel';
    if (win === menuWindow) return 'menu';
    return 'unknown';
  });
}

/* ---- Pet Zoom Helper ---- */

function applyPetZoom() {
  petWindow?.webContents.send('zoom-changed', petZoom);
  panelWindow?.webContents.send('zoom-changed', petZoom);
}

/* ---- App Lifecycle ---- */

app.whenReady().then(() => {
  writeStartupLog('app ready');
  writeSharedRuntimeInfo({
    backend_url: backendUrl,
    auth_token: authToken,
    settings_owner: 'electron',
    electron_running: true,
    electron_pid: process.pid,
  });
  registerMaicoreFileProtocol();
  startSharedStateWatchers();
  setupIPC();
  syncAutoLaunchFromSettings();
  createPetWindow();
  try {
    createTray();
  } catch (error) {
    writeStartupLog('createTray failed', error);
  }
  writeStartupLog('startup complete');
});

app.on('window-all-closed', () => {
  // Don't quit on all windows closed - keep tray alive
});

app.on('activate', () => {
  if (!petWindow) {
    createPetWindow();
  }
});

app.on('before-quit', () => {
  writeSharedRuntimeInfo({
    backend_url: backendUrl,
    auth_token: authToken,
    settings_owner: 'backend',
    electron_running: false,
    electron_pid: null,
  });
  stopSharedStateWatchers();
  tray?.destroy();
});


