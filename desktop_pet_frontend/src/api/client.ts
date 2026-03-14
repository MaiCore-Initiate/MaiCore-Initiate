/* =============================================
   API Client - 与 MaiCore 后端对接
   ============================================= */

import type {
  ScheduleEvent,
  TodoItem,
  TodoStats,
  Live2DModelInfo,
  ChatSession,
  ChatRecordMessage,
  SendChatResult,
  CreateScheduleParams,
  CreateTodoParams,
  ApiResponse,
} from '../types';

const DEFAULT_HOST_BASE: string = (window as any).__BACKEND_HOST__ || 'http://127.0.0.1:10086';
const DEFAULT_AUTH_TOKEN: string = (window as any).__AUTH_TOKEN__ || '';
const IS_ELECTRON = Boolean(window.electronAPI);

export async function getRuntimeConnectionInfo(): Promise<{ hostBase: string; authToken: string; petApiBase: string }> {
  try {
    const runtime = await window.electronAPI?.getSharedRuntimeInfo?.();
    const hostBase = String(runtime?.backend_url ?? '').trim() || DEFAULT_HOST_BASE;
    const authToken = String(runtime?.auth_token ?? '').trim() || DEFAULT_AUTH_TOKEN;
    return {
      hostBase,
      authToken,
      petApiBase: `${hostBase}/api/pet-v2`,
    };
  } catch {
    return {
      hostBase: DEFAULT_HOST_BASE,
      authToken: DEFAULT_AUTH_TOKEN,
      petApiBase: `${DEFAULT_HOST_BASE}/api/pet-v2`,
    };
  }
}

void getRuntimeConnectionInfo().then(({ hostBase, authToken, petApiBase }) => {
  console.log('[API Client] 使用后端地址:', petApiBase, '| HOST_BASE:', hostBase, '| 认证:', authToken ? '已配置' : '未配置');
});

function _buildHeaders(authToken: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  return headers;
}

function _toAbsoluteUrl(url: string, hostBase: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${hostBase}${raw}`;
  return `${hostBase}/${raw.replace(/^\/+/, '')}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { petApiBase, authToken } = await getRuntimeConnectionInfo();
  let res: Response;
  try {
    res = await fetch(`${petApiBase}${path}`, {
      ...init,
      headers: _buildHeaders(authToken, init?.headers),
      credentials: 'include', // MaiCore需要携带cookie
    });
  } catch {
    throw new Error(`Network error: ${path}`);
  }
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new Error((body as ApiResponse).error ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${path}`);
  }
}

async function _requestHostJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { hostBase, authToken } = await getRuntimeConnectionInfo();
  let res: Response;
  try {
    res = await fetch(`${hostBase}${path}`, {
      ...init,
      headers: _buildHeaders(authToken, init?.headers),
      credentials: 'include',
    });
  } catch {
    throw new Error(`Network error: ${path}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function _normalizeExpressionDefs(items: any[]): Array<{ Name: string; File: string }> {
  return (Array.isArray(items) ? items : [])
    .map((item: any) => {
      if (typeof item === 'string') return { Name: item, File: '' };
      return {
        Name: String(item?.Name ?? item?.name ?? ''),
        File: String(item?.File ?? item?.file ?? ''),
      };
    })
    .filter((item: { Name: string; File: string }) => Boolean(item.Name));
}

function _toLocalAssetUrl(filePath: string): string {
  return window.electronAPI?.toLocalAssetUrl?.(filePath) || '';
}

function _mapModelInfo(model: any, hostBase: string): Live2DModelInfo {
  const expressionDefs = _normalizeExpressionDefs(model?.expressions ?? []);
  const localModelFile = _toLocalAssetUrl(String(model?.model_json_path ?? '').trim());
  const localPreviewImage = _toLocalAssetUrl(String(model?.cover_path ?? '').trim());
  return {
    id: model?.model_id ?? model?.id ?? '',
    name: model?.model_id ?? model?.name ?? '',
    path: model?.path ?? '',
    model_file: localModelFile || _toAbsoluteUrl(model?.model_json_url ?? model?.model_file ?? model?.model_json ?? '', hostBase),
    preview_image: localPreviewImage || _toAbsoluteUrl(model?.cover_url ?? model?.preview_image ?? '', hostBase),
    motions: model?.motions ?? [],
    expressions: expressionDefs
      .map((item) => item.Name)
      .filter(Boolean),
    expression_defs: expressionDefs,
    description: model?.description ?? '',
  };
}

async function _getLocalSharedSettings(): Promise<Record<string, any> | null> {
  try {
    return await window.electronAPI?.getSharedDesktopPetSettings?.() ?? null;
  } catch {
    return null;
  }
}

async function _patchLocalSharedSettings(value: Record<string, any>): Promise<Record<string, any> | null> {
  try {
    return await window.electronAPI?.patchSharedDesktopPetSettings?.(value) ?? null;
  } catch {
    return null;
  }
}

async function _getLocalLive2DModels(): Promise<Live2DModelInfo[]> {
  const { hostBase } = await getRuntimeConnectionInfo();
  try {
    const cache = await window.electronAPI?.getSharedModelsCache?.();
    const cachedModels = Array.isArray(cache?.models) ? cache.models : [];
    const sourceModels = cachedModels.length ? cachedModels : (await window.electronAPI?.scanSharedLive2DModels?.() ?? []);
    return sourceModels.map((model) => _mapModelInfo(model, hostBase));
  } catch {
    return [];
  }
}

/* ---- Schedule ---- */

export async function getSchedules(date?: string): Promise<ScheduleEvent[]> {
  const q = date ? `?date=${date}` : '';
  const r = await request<ApiResponse<ScheduleEvent[]>>(`/schedules${q}`);
  return r.data ?? [];
}

export async function createSchedule(params: CreateScheduleParams): Promise<ScheduleEvent> {
  const r = await request<ApiResponse<ScheduleEvent>>('/schedules', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return r.data!;
}

export async function deleteSchedule(id: string): Promise<void> {
  // MaiCore使用RESTful路径参数
  await request<ApiResponse>(`/schedules/${id}`, { method: 'DELETE' });
}

/* ---- Todo ---- */

export async function getTodos(status?: string): Promise<TodoItem[]> {
  const q = status ? `?status=${status}` : '';
  const r = await request<ApiResponse<TodoItem[]>>(`/todos${q}`);
  return r.data ?? [];
}

export async function createTodo(params: CreateTodoParams): Promise<TodoItem> {
  const r = await request<ApiResponse<TodoItem>>('/todos', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return r.data!;
}

export async function toggleTodo(id: string): Promise<TodoItem> {
  // MaiCore使用RESTful路径参数
  const r = await request<ApiResponse<TodoItem>>(`/todos/${id}/toggle`, { method: 'PATCH' });
  return r.data!;
}

export async function deleteTodo(id: string): Promise<void> {
  // MaiCore使用RESTful路径参数
  await request<ApiResponse>(`/todos/${id}`, { method: 'DELETE' });
}

export async function getTodoStats(): Promise<TodoStats> {
  const r = await request<ApiResponse<TodoStats>>('/todos/stats');
  return r.data!;
}

/* ---- Live2D ---- */

export async function getLive2DModels(): Promise<Live2DModelInfo[]> {
  if (IS_ELECTRON) {
    const localModels = await _getLocalLive2DModels();
    if (localModels.length > 0) {
      return localModels;
    }
  }
  try {
    const { hostBase } = await getRuntimeConnectionInfo();
    const r = await _requestHostJson<{ models?: any[] }>('/api/settings/live2d/models');
    return (r.models ?? []).map((model) => _mapModelInfo(model, hostBase));
  } catch {
    return _getLocalLive2DModels();
  }
}

export async function getDesktopPetSettings(): Promise<Record<string, any> | null> {
  if (IS_ELECTRON) {
    return _getLocalSharedSettings();
  }
  try {
    const data = await _requestHostJson<{ value?: Record<string, any> | null }>('/api/settings/live2d/settings');
    return data?.value ?? null;
  } catch {
    return _getLocalSharedSettings();
  }
}

export async function patchDesktopPetSettings(value: Record<string, any>): Promise<Record<string, any> | null> {
  if (IS_ELECTRON) {
    return _patchLocalSharedSettings(value);
  }
  try {
    const data = await _requestHostJson<{ value?: Record<string, any> | null }>('/api/settings/live2d/settings', {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
    return data?.value ?? null;
  } catch {
    return _patchLocalSharedSettings(value);
  }
}

export async function getActiveLive2DModel(): Promise<Live2DModelInfo | null> {
  try {
    const [models, settings] = await Promise.all([
      getLive2DModels(),
      getDesktopPetSettings(),
    ]);
    const activeId = String(settings?.model_id ?? '').trim();
    if (activeId) {
      const found = models.find((model) => model.id === activeId);
      if (found) return found;
    }
    return models[0] ?? null;
  } catch {
    return null;
  }
}

export async function switchLive2DModel(modelId: string): Promise<void> {
  const next = await patchDesktopPetSettings({ model_id: modelId });
  if (!next || String(next.model_id ?? '') !== modelId) {
    throw new Error(`切换模型失败: ${modelId}`);
  }
}

export async function scanLive2DModels(): Promise<Live2DModelInfo[]> {
  try {
    return await getLive2DModels();
  } catch {
    return _getLocalLive2DModels();
  }
}

/* ---- Chat ---- */

export async function sendChatMessage(message: string): Promise<SendChatResult> {
  const r = await request<ApiResponse<SendChatResult>>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  return r.data!;
}

export async function getChatSessions(): Promise<{
  sessions: ChatSession[];
  activeSessionId: string | null;
  modelKey: string;
  shareMemoryBetweenSessionsSameModel: boolean;
}> {
  const r = await request<ApiResponse<ChatSession[]> & {
    active_session_id?: string | null;
    model_key?: string;
    share_memory_between_sessions_same_model?: boolean;
  }>('/chat/sessions');
  return {
    sessions: r.data ?? [],
    activeSessionId: r.active_session_id ?? null,
    modelKey: r.model_key ?? '',
    shareMemoryBetweenSessionsSameModel: Boolean(r.share_memory_between_sessions_same_model ?? true),
  };
}

export async function getActiveChatSession(): Promise<ChatSession | null> {
  const r = await request<ApiResponse<ChatSession>>('/chat/sessions/active');
  return r.data ?? null;
}

export async function createChatSession(title = ''): Promise<ChatSession> {
  const r = await request<ApiResponse<ChatSession>>('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return r.data!;
}

export async function activateChatSession(sessionId: string): Promise<ChatSession> {
  const r = await request<ApiResponse<ChatSession>>(`/chat/sessions/${sessionId}/activate`, {
    method: 'POST',
  });
  return r.data!;
}

export async function getChatMessages(sessionId: string): Promise<ChatRecordMessage[]> {
  const r = await request<ApiResponse<ChatRecordMessage[]>>(`/chat/sessions/${sessionId}/messages`);
  return r.data ?? [];
}

export async function sendChatMessageToSession(message: string, sessionId?: string): Promise<SendChatResult> {
  const r = await request<ApiResponse<SendChatResult>>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
  });
  return r.data!;
}

/* ---- Health ---- */

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

/* ---- LLM Config ---- */

export async function getLLMConfig(): Promise<Record<string, any>> {
  try {
    const r = await _requestHostJson<{ value?: Record<string, any> }>('/api/settings/llm-config');
    return r.value ?? {};
  } catch {
    return {};
  }
}

export async function updateLLMConfig(config: Record<string, any>): Promise<void> {
  await _requestHostJson('/api/settings/llm-config', {
    method: 'PUT',
    body: JSON.stringify({ value: config }),
  });
}

export function onSharedStateChanged(callback: (payload: { kind: 'settings' | 'models_cache' | 'runtime' }) => void): () => void {
  return window.electronAPI?.onSharedStateChanged?.(callback) ?? (() => {});
}
