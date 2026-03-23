import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'
import { resolveOverlayColor, useBgContext } from '../components/background/DynamicBackground'
import type { BgSettings } from '../components/background/DynamicBackground'
import { useTheme, type ThemeMode } from '../components/theme/ThemeProvider'

const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 2 }
const pillShadow = "absolute inset-0 rounded-[27px] pointer-events-none"
const pillShadowStyle = { border: '2px solid var(--mc-border-strong)', boxShadow: '2px 3px 6px var(--mc-shadow-soft)' }
const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} className="cursor-pointer shrink-0"
      style={{ width: 56, height: 30, borderRadius: 15, background: checked ? '#4AF933' : '#ccc', position: 'relative', transition: 'background 0.2s' }}>
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#fff', position: 'absolute', top: 3, left: checked ? 29 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </div>
  )
}

interface BgFile { filename: string; size_kb: number; is_video: boolean }

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm'])
const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024
const MAX_VIDEO_FILE_SIZE = 600 * 1024 * 1024

function getFileExt(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ''
}

function toBackgroundFileUrl(filename: string): string {
  return `/backgrounds/${encodeURIComponent(filename)}`
}

function toThumbnailUrl(filename: string): string {
  return `/api/settings/backgrounds/thumbnail/${encodeURIComponent(filename)}?w=320&h=180`
}

function formatFileSize(sizeKb: number): string {
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)}MB`
  return `${sizeKb.toFixed(0)}KB`
}

/** RGB string <-> hex helpers */
function rgbToHex(rgb: string): string {
  try {
    const [r, g, b] = rgb.split(',').map(s => parseInt(s.trim()))
    return '#' + [r, g, b].map(v => (v || 0).toString(16).padStart(2, '0')).join('')
  } catch { return '#ffffff' }
}
function hexToRgb(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '255,255,255'
  return m.map(h => parseInt(h, 16)).join(',')
}

/** Color picker popup — rendered via portal to escape GlassCard z-index */
function ColorPickerPopup({ color, onChange, onClose, anchorRef }: { color: string; onChange: (rgb: string) => void; onClose: () => void; anchorRef: React.RefObject<HTMLDivElement | null> }) {
  const [hex, setHex] = useState(rgbToHex(color))
  const [rgb, setRgb] = useState(color)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 8, left: rect.right - 280 })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const onHexChange = (h: string) => { setHex(h); const r = hexToRgb(h); setRgb(r); onChange(r) }
  const onRgbChange = (r: string) => { setRgb(r); setHex(rgbToHex(r)); onChange(r) }

  return createPortal(
    <div ref={popupRef} className="fixed z-[9999] rounded-[20px] p-[20px] space-y-[12px]"
      style={{ backgroundColor: 'var(--mc-panel-solid)', border: '2px solid var(--mc-border-soft)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: 240, top: pos.top, left: pos.left }}>
      {/* Color preview + native picker trigger */}
      <div className="flex items-center gap-[12px]">
        <label className="relative cursor-pointer shrink-0 block overflow-hidden rounded-[12px] border-2 border-black/20" style={{ width: 60, height: 60 }}>
          <input type="color" value={hex} onChange={e => onHexChange(e.target.value)}
            className="absolute cursor-pointer border-0" style={{ top: -8, left: -8, width: 76, height: 76, padding: 0 }} />
        </label>
        <div className="flex-1 min-w-0 space-y-[6px]">
          <div className="flex items-center gap-[4px]">
            <span className="text-black/50 shrink-0" style={{ fontSize: 13 }}>HEX</span>
            <input type="text" value={hex} onChange={e => onHexChange(e.target.value)}
              className="w-full bg-white/50 border border-black/20 rounded-[8px] px-2 text-black/70 focus:outline-none"
              style={{ ...monoFont, fontSize: 14, height: 26 }} />
          </div>
          <div className="flex items-center gap-[4px]">
            <span className="text-black/50 shrink-0" style={{ fontSize: 13 }}>RGB</span>
            <input type="text" value={rgb} onChange={e => onRgbChange(e.target.value)}
              className="w-full bg-white/50 border border-black/20 rounded-[8px] px-2 text-black/70 focus:outline-none"
              style={{ ...monoFont, fontSize: 14, height: 26 }} />
          </div>
        </div>
      </div>
      {/* Preview bar */}
      <div className="rounded-[8px] h-[24px]" style={{ background: `rgb(${rgb})`, border: '1px solid var(--mc-border-soft)' }} />
    </div>,
    document.body
  )
}

type PetCfg = {
  model_id: string
  scale: number
  opacity: number
  ai_enabled: boolean
  window: { always_on_top: boolean; transparent: boolean; width: number; height: number }
  persona: { name: string; tone: string; system_prompt: string; greeting: string }
}

const defaultPetCfg: PetCfg = {
  model_id: '',
  scale: 1,
  opacity: 1,
  ai_enabled: true,
  window: { always_on_top: true, transparent: true, width: 360, height: 520 },
  persona: { name: '', tone: '', system_prompt: '', greeting: '' },
}

function mergePet(base: PetCfg, patch: any): PetCfg {
  return {
    ...base,
    ...patch,
    window: { ...base.window, ...(patch?.window || {}) },
    persona: { ...base.persona, ...(patch?.persona || {}) },
  }
}

const petFieldClass = 'bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none'
const petFieldStyle = { ...monoFont, fontSize: 20, width: 260, height: 40 }

/** 桌宠配置面板（精简版，与 Electron 设置共用同一后端接口） */
export function PetConfigPanel() {
  const { notify } = useNotification()
  const [cfg, setCfg] = useState<PetCfg>(defaultPetCfg)
  const [models, setModels] = useState<string[]>([])
  const [runtime, setRuntime] = useState({ running: false, pid: null as number | null })
  const [pending, setPending] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const load = useCallback(async () => {
    try {
      const [mRes, sRes, rRes] = await Promise.all([
        fetch('/api/settings/live2d/models', { credentials: 'include' }),
        fetch('/api/settings/live2d/settings', { credentials: 'include' }),
        fetch('/api/settings/live2d/runtime/status', { credentials: 'include' }),
      ])
      const m = await mRes.json()
      const s = await sRes.json()
      const r = await rRes.json()
      setModels((m?.models ?? []).map((x: any) => x.model_id).filter(Boolean))
      if (s?.value) setCfg(mergePet(defaultPetCfg, s.value))
      setRuntime({ running: !!r?.running, pid: r?.pid ?? null })
    } catch {
      // ignore load errors
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/settings`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'pet_settings_updated') void load()
        } catch {
          // ignore malformed payload
        }
      }
      ws.onclose = () => { timer = setTimeout(connect, 5000) }
      ws.onerror = () => { ws.close() }
    }
    connect()
    return () => { clearTimeout(timer); wsRef.current?.close() }
  }, [load])

  useEffect(() => { void load() }, [load])

  const save = async (next: PetCfg) => {
    setCfg(next)
    try {
      const res = await fetch('/api/settings/live2d/settings', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      })
      const d = await res.json()
      if (!d?.success) notify('保存失败', 'error')
      else if (d.value) setCfg(mergePet(defaultPetCfg, d.value))
    } catch {
      notify('保存失败', 'error')
    }
  }

  const patch = (p: any) => void save(mergePet(cfg, p))

  const patchWindowNumber = (key: 'width' | 'height', value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    patch({ window: { [key]: parsed } })
  }

  const toggleRuntime = async () => {
    if (pending) return
    setPending(true)
    const action = runtime.running ? 'stop' : 'start'
    try {
      const res = await fetch(`/api/settings/live2d/runtime/${action}`, { method: 'POST', credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.success) throw new Error(d?.detail || (runtime.running ? '停止失败' : '启动失败'))
      notify(runtime.running ? '桌宠已停止' : '桌宠启动请求已发送', 'success')
      await load()
    } catch (e: any) {
      notify(e?.message || '操作失败', 'error')
    }
    setPending(false)
  }

  return (
    <div className="space-y-[12px]">
      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">Live2D 模型</span>
        <select value={cfg.model_id} onChange={e => patch({ model_id: e.target.value })}
          className={petFieldClass}
          style={petFieldStyle}>
          {models.length === 0 && <option value="">暂无模型</option>}
          {models.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">缩放</span>
        <div className="flex items-center gap-[12px]">
          <input type="range" min={0.2} max={2.5} step={0.05} value={cfg.scale} onChange={e => patch({ scale: Number(e.target.value) })} style={{ width: 200 }} />
          <span style={{ ...monoFont, fontSize: 20, width: 56 }} className="text-black/50 text-right">{cfg.scale.toFixed(2)}x</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">透明度</span>
        <div className="flex items-center gap-[12px]">
          <input type="range" min={0.1} max={1} step={0.05} value={cfg.opacity} onChange={e => patch({ opacity: Number(e.target.value) })} style={{ width: 200 }} />
          <span style={{ ...monoFont, fontSize: 20, width: 56 }} className="text-black/50 text-right">{cfg.opacity.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">窗口尺寸</span>
        <div className="flex items-center gap-[10px]">
          <input type="number" min={180} max={1200} value={cfg.window?.width ?? 360}
            onChange={e => patchWindowNumber('width', e.target.value)}
            className={petFieldClass}
            style={{ ...petFieldStyle, width: 120, textAlign: 'right' }} />
          <span style={{ ...monoFont, fontSize: 18 }} className="text-black/40">×</span>
          <input type="number" min={180} max={1600} value={cfg.window?.height ?? 520}
            onChange={e => patchWindowNumber('height', e.target.value)}
            className={petFieldClass}
            style={{ ...petFieldStyle, width: 120, textAlign: 'right' }} />
        </div>
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">窗口置顶</span>
        <Toggle checked={!!cfg.window?.always_on_top} onChange={v => patch({ window: { always_on_top: v } })} />
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">透明窗口</span>
        <Toggle checked={!!cfg.window?.transparent} onChange={v => patch({ window: { transparent: v } })} />
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">AI 对话</span>
        <Toggle checked={!!cfg.ai_enabled} onChange={v => patch({ ai_enabled: v })} />
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">人格名称</span>
        <input type="text" value={cfg.persona?.name ?? ''} onChange={e => patch({ persona: { name: e.target.value } })}
          className={petFieldClass}
          style={petFieldStyle} />
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">语气风格</span>
        <input type="text" value={cfg.persona?.tone ?? ''} onChange={e => patch({ persona: { tone: e.target.value } })}
          className={petFieldClass}
          style={petFieldStyle} />
      </div>

      <div className="flex items-center justify-between py-[6px]">
        <span style={labelFont} className="text-black/70">问候语</span>
        <input type="text" value={cfg.persona?.greeting ?? ''} onChange={e => patch({ persona: { greeting: e.target.value } })}
          className={petFieldClass}
          style={petFieldStyle} />
      </div>

      <div className="flex items-start justify-between py-[6px] gap-[12px]">
        <span style={labelFont} className="text-black/70 pt-[8px]">系统提示词</span>
        <textarea value={cfg.persona?.system_prompt ?? ''} onChange={e => patch({ persona: { system_prompt: e.target.value } })}
          className={
            `${petFieldClass} py-3 resize-y`
          }
          style={{ ...monoFont, fontSize: 18, width: 260, minHeight: 92 }} />
      </div>

      <div className="flex items-center justify-between pt-[12px]">
        <span style={{ ...monoFont, fontSize: 18 }} className="text-black/50">
          {runtime.running ? `运行中 · PID ${runtime.pid ?? '-'}` : '未运行'}
        </span>
        <button onClick={() => void toggleRuntime()} disabled={pending}
          className="relative rounded-[27px] px-[30px] py-[10px] bg-white/30 hover:bg-white/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <div className={pillShadow} style={pillShadowStyle} />
          <span style={btnFont} className="text-black/70">{pending ? '处理中...' : runtime.running ? '停止桌宠' : '启动桌宠'}</span>
        </button>
      </div>

      <p className="text-right text-black/35" style={{ fontSize: 14 }}>
        模型导入、封面和表情管理请前往「杂项 → 桌宠」标签页。
      </p>
    </div>
  )
}

/** LLM配置组件 */
function LLMConfigSection() {
  const { notify } = useNotification()
  const [llmConfig, setLlmConfig] = useState({
    provider: 'openai',
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 1000,
    timeout: 30
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadLLMConfig()
  }, [])

  const loadLLMConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/llm-config', { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setLlmConfig(data.value)
      }
    } catch (error) {
      console.error('加载LLM配置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveLLMConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/llm-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: llmConfig })
      })
      const data = await res.json()
      if (data.success) {
        notify('LLM配置已保存', 'success')
        await loadLLMConfig()
      } else {
        notify(data.message || '保存失败', 'error')
      }
    } catch (error) {
      console.error('保存LLM配置失败:', error)
      notify('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#adb5bd' }}>加载中...</div>
  }

  return (
    <div className="space-y-[16px]">
      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">提供商</span>
        <select
          value={llmConfig.provider}
          onChange={(e) => setLlmConfig({ ...llmConfig, provider: e.target.value })}
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
          style={{ ...monoFont, fontSize: 22, width: 300, height: 40 }}
        >
          <option value="openai">OpenAI</option>
          <option value="azure">Azure OpenAI</option>
          <option value="gemini">Google Gemini</option>
          <option value="claude">Anthropic Claude</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">API Key</span>
        <input
          type="password"
          value={llmConfig.api_key}
          onChange={(e) => setLlmConfig({ ...llmConfig, api_key: e.target.value })}
          placeholder="请输入API Key"
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
          style={{ ...monoFont, fontSize: 22, width: 300, height: 40 }}
        />
      </div>

      {/* Base URL仅在OpenAI/Azure时显示 */}
      {(llmConfig.provider === 'openai' || llmConfig.provider === 'azure') && (
      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">Base URL</span>
        <input
          type="text"
          value={llmConfig.base_url}
          onChange={(e) => setLlmConfig({ ...llmConfig, base_url: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
          style={{ ...monoFont, fontSize: 22, width: 300, height: 40 }}
        />
      </div>
      )}

      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">模型</span>
        <input
          type="text"
          value={llmConfig.model}
          onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
          placeholder={
            llmConfig.provider === 'openai' ? 'gpt-4o-mini' :
            llmConfig.provider === 'gemini' ? 'gemini-1.5-flash' :
            llmConfig.provider === 'claude' ? 'claude-3-5-sonnet-20241022' :
            'gpt-4o-mini'
          }
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
          style={{ ...monoFont, fontSize: 22, width: 300, height: 40 }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">Temperature</span>
        <div className="flex items-center gap-[12px]">
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={llmConfig.temperature}
            onChange={(e) => setLlmConfig({ ...llmConfig, temperature: Number(e.target.value) })}
            style={{ width: 200 }}
          />
          <span style={{ ...monoFont, fontSize: 20, width: 50 }} className="text-black/50 text-right">
            {llmConfig.temperature.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span style={labelFont} className="text-black/70">Max Tokens</span>
        <input
          type="number"
          min={100}
          max={4000}
          value={llmConfig.max_tokens}
          onChange={(e) => setLlmConfig({ ...llmConfig, max_tokens: Number(e.target.value) })}
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
          style={{ ...monoFont, fontSize: 22, width: 120, height: 40, textAlign: 'right' }}
        />
      </div>

      <div className="flex justify-end mt-[24px]">
        <button
          onClick={saveLLMConfig}
          disabled={saving}
          className="relative rounded-[27px] px-[40px] py-[12px] bg-gradient-to-br from-blue-400 to-blue-600 text-white hover:from-blue-500 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={btnFont}
        >
          <div className={pillShadow} style={pillShadowStyle} />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

export default function Settings() {
  const { notify } = useNotification()
  const { settings: bgSettings, refreshFiles, refreshSettings } = useBgContext()
  const { mode, setMode, resolvedTheme } = useTheme()

  const [pConfig, setPConfig] = useState<Record<string, any>>({})
  const [pDirty, setPDirty] = useState<Record<string, any>>({})
  const [pSaving, setPSaving] = useState(false)
  const [currentToken, setCurrentToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [bgFiles, setBgFiles] = useState<BgFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorAnchorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localBg, setLocalBg] = useState<BgSettings>({ ...bgSettings })
  const [webshellUseProfile, setWebshellUseProfile] = useState(false)
  const [webuiDirty, setWebuiDirty] = useState(false)
  useEffect(() => { setLocalBg({ ...bgSettings }) }, [bgSettings])

  const loadPConfig = useCallback(() => {
    fetch('/api/settings/p-config', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setPConfig(d.data) }).catch(() => {})
  }, [])
  const loadToken = useCallback(() => {
    fetch('/api/settings/token/current', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setCurrentToken(d.token) }).catch(() => {})
  }, [])
  const loadBgFiles = useCallback(() => {
    fetch('/api/settings/backgrounds', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setBgFiles(d.files) }).catch(() => {})
  }, [])
  const loadWebUIConfig = useCallback(() => {
    fetch('/api/webui/config', { credentials: 'include' })
      .then(r => r.json())
      .then(cfg => {
        const v = !!cfg?.terminal?.webshell_use_profile
        setWebshellUseProfile(v)
        setWebuiDirty(false)
      })
      .catch(() => {})
  }, [])
  useEffect(() => { loadPConfig(); loadToken(); loadBgFiles(); loadWebUIConfig() }, [loadPConfig, loadToken, loadBgFiles, loadWebUIConfig])

  const getVal = (key: string) => pDirty[key] ?? key.split('.').reduce((o: any, k) => o?.[k], pConfig)
  const setVal = (key: string, v: any) => setPDirty(prev => ({ ...prev, [key]: v }))

  const savePConfig = async () => {
    if (Object.keys(pDirty).length === 0 && !webuiDirty) return
    setPSaving(true)
    try {
      let ok = true

      if (Object.keys(pDirty).length > 0) {
        const r = await fetch('/api/settings/p-config', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: pDirty })
        })
        const d = await r.json()
        if (!d.success) ok = false
      }

      if (webuiDirty) {
        const r2 = await fetch('/api/webui/config', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'terminal.webshell_use_profile', value: webshellUseProfile })
        })
        const d2 = await r2.json()
        if (!d2.success) ok = false
      }

      if (ok) {
        notify('配置已保存', 'success')
        setPDirty({})
        setWebuiDirty(false)
        loadPConfig()
        loadWebUIConfig()
      } else {
        notify('保存失败', 'error')
      }
    } catch { notify('保存失败', 'error') }
    setPSaving(false)
  }

  const saveToken = async () => {
    try {
      const r = await fetch('/api/settings/token/change', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_token: newToken }) })
      const d = await r.json()
      if (d.success) { notify('Token已更新', 'success'); setCurrentToken(d.token); setNewToken('') }
      else notify(d.detail || '更新失败', 'error')
    } catch { notify('更新失败', 'error') }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = getFileExt(file.name)
      const isVideo = VIDEO_EXTENSIONS.has(ext)
      const isImage = IMAGE_EXTENSIONS.has(ext)
      if (!isVideo && !isImage) {
        notify(`不支持的文件类型: ${file.name}`, 'warning')
        continue
      }
      const maxSize = isVideo ? MAX_VIDEO_FILE_SIZE : MAX_IMAGE_FILE_SIZE
      if (file.size > maxSize) {
        notify(`${file.name} 超过${isVideo ? '视频600MB' : '图片50MB'}大小限制`, 'warning')
        continue
      }

      const form = new FormData()
      form.append('file', file)
      try {
        const r = await fetch('/api/settings/backgrounds/upload', { method: 'POST', credentials: 'include', body: form })
        const d = await r.json()
        if (d.success) { notify(`已上传: ${file.name}`, 'success') }
        else notify(d.detail || `上传失败: ${file.name}`, 'error')
      } catch { notify(`上传失败: ${file.name}`, 'error') }
    }
    setUploading(false)
    loadBgFiles()
    refreshFiles()
  }

  const deleteBg = async (filename: string) => {
    try {
      const r = await fetch(`/api/settings/backgrounds/${encodeURIComponent(filename)}`, { method: 'DELETE', credentials: 'include' })
      const d = await r.json()
      if (d.success) { notify('已删除', 'success'); loadBgFiles(); refreshFiles() }
      else notify('删除失败', 'error')
    } catch { notify('删除失败', 'error') }
  }

  const saveBgSettings = async (s: BgSettings) => {
    setLocalBg(s)
    try {
      await fetch('/api/preferences/bg_settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: s }) })
      refreshSettings()
    } catch {}
  }

  const pinFile = (filename: string) => saveBgSettings({ ...localBg, pinned_file: localBg.pinned_file === filename ? '' : filename })

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  // 退出操作选项
  const EXIT_ACTION_OPTIONS = ['询问', '一律关闭', '一律保留']
  const EXIT_ACTION_MAP: Record<string, string> = {
    'ask': '询问',
    'terminate': '一律关闭',
    'keep': '一律保留',
  }
  const EXIT_ACTION_REVERSE_MAP: Record<string, string> = {
    '询问': 'ask',
    '一律关闭': 'terminate',
    '一律保留': 'keep',
  }
  const THEME_MODE_OPTIONS = ['跟随系统', '浅色', '暗色']
  const THEME_MODE_MAP: Record<ThemeMode, string> = {
    system: '跟随系统',
    light: '浅色',
    dark: '暗色',
  }
  const THEME_MODE_REVERSE_MAP: Record<string, ThemeMode> = {
    '跟随系统': 'system',
    '浅色': 'light',
    '暗色': 'dark',
  }
  const getExitActionDisplay = () => {
    const val = getVal('on_exit.process_action') || 'none'
    return EXIT_ACTION_MAP[val] || '无操作'
  }
  const handleExitActionChange = (display: string) => {
    setVal('on_exit.process_action', EXIT_ACTION_REVERSE_MAP[display])
  }
  const handleThemeModeChange = (display: string) => {
    const next = THEME_MODE_REVERSE_MAP[display]
    if (next) setMode(next)
  }

  // 滑块选择器组件
  const ActionSlider = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [sliderStyle, setSliderStyle] = useState({ left: 5, width: 89 })

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const idx = Math.max(0, options.indexOf(value))
      const btn = container.querySelectorAll('button')[idx] as HTMLElement | undefined
      if (btn) {
        setSliderStyle({ left: btn.offsetLeft, width: btn.offsetWidth })
      }
    }, [value, options])

    return (
      <div ref={containerRef} className="relative inline-flex items-center h-[40px] rounded-[20px] p-[4px]" style={{ border: '2px solid var(--mc-border-strong)', filter: 'drop-shadow(2px 2px 2px var(--mc-shadow-soft))' }}>
        <div className="absolute h-[32px] rounded-[16px] transition-all duration-300 ease-out" style={{ width: sliderStyle.width, left: sliderStyle.left, top: 2, backgroundColor: 'var(--mc-panel-solid)', border: '1px solid var(--mc-border-strong)', filter: 'drop-shadow(2px 2px 2px var(--mc-shadow-soft))' }} />
        {options.map(opt => (
          <button key={opt} onClick={() => onChange(opt)} className="relative z-10 h-[32px] px-[12px] cursor-pointer bg-transparent border-none transition-colors duration-200" style={{ fontSize: 16, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", color: value === opt ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }}>
            {opt}
          </button>
        ))}
      </div>
    )
  }

  const ConfigRow = ({ label, configKey, type = 'number' }: { label: string; configKey: string; type?: 'toggle' | 'number' | 'text' | 'exit_action' }) => (
    <div className="flex items-center justify-between py-[10px]">
      <span style={labelFont} className="text-black/70">{label}</span>
      {type === 'toggle' ? (
        <Toggle checked={!!getVal(configKey)} onChange={v => setVal(configKey, v)} />
      ) : type === 'exit_action' ? (
        <ActionSlider value={getExitActionDisplay()} onChange={handleExitActionChange} options={EXIT_ACTION_OPTIONS} />
      ) : (
        <input type={type === 'number' ? 'number' : 'text'} value={getVal(configKey) ?? ''}
          onChange={e => setVal(configKey, type === 'number' ? Number(e.target.value) : e.target.value)}
          className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none focus:border-black/50"
          style={{ ...monoFont, fontSize: 22, width: 200, height: 40, textAlign: 'right' }} />
      )}
    </div>
  )

  const resolvedOverlayColor = resolveOverlayColor(localBg, resolvedTheme)

// ── Render ──
  return (
    <div className="p-[40px] space-y-[30px]">
      <h1 className="text-black/80 select-none animate-fade-slide-up" style={pageTitleStyle}>设置</h1>

      {/* 板块1：主程序配置 */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '60ms' }}>
      <GlassCard>
        <div className="p-[30px]">
          <h2 className="text-black/80 mb-[20px]" style={sectionTitle}>主程序配置</h2>
          <div className="space-y-[4px]">
            <ConfigRow label="日志保留天数" configKey="logging.log_rotation_days" type="number" />
            <ConfigRow label="最大版本显示数" configKey="display.max_versions_display" type="number" />
            <ConfigRow label="退出时进程处理" configKey="on_exit.process_action" type="exit_action" />
            <ConfigRow label="Windows通知中心" configKey="notifications.windows_center_enabled" type="toggle" />
            <ConfigRow label="最小化到托盘" configKey="ui.minimize_to_tray" type="toggle" />
            <div className="flex items-center justify-between py-[10px]">
              <span style={labelFont} className="text-black/70">WebShell 使用 PowerShell Profile（Oh-My-Posh）</span>
              <Toggle
                checked={webshellUseProfile}
                onChange={v => {
                  setWebshellUseProfile(v)
                  setWebuiDirty(true)
                }}
              />
            </div>
          </div>
          <div className="flex justify-end mt-[20px]">
            <button onClick={savePConfig} disabled={pSaving || (Object.keys(pDirty).length === 0 && !webuiDirty)}
              className="relative rounded-[27px] px-[30px] py-[10px] bg-white/30 hover:bg-white/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <div className={pillShadow} style={pillShadowStyle} />
              <span style={btnFont} className="text-black/70">{pSaving ? '保存中...' : '保存配置'}</span>
            </button>
          </div>
        </div>
      </GlassCard>
      </div>

      {/* 板块2：安全配置 */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '120ms' }}>
      <GlassCard>
        <div className="p-[30px]">
          <h2 className="text-black/80 mb-[20px]" style={sectionTitle}>安全配置</h2>
          <div className="space-y-[16px]">
            <div>
              <span style={labelFont} className="text-black/70">当前Token</span>
              <div className="flex items-center gap-[12px] mt-[8px]">
                <div className="flex-1 bg-white/30 border-2 border-black/30 rounded-[15px] px-4 py-[6px] text-black/70 cursor-pointer select-all"
                  style={{ ...monoFont, fontSize: 22, minHeight: 40 }} onClick={() => setShowToken(!showToken)}>
                  {showToken ? currentToken : '••••••••••••••••'}
                </div>
              </div>
            </div>
            <div>
              <span style={labelFont} className="text-black/70">更改Token</span>
              <div className="flex items-center gap-[12px] mt-[8px]">
                <input type="text" value={newToken} onChange={e => setNewToken(e.target.value)}
                  placeholder="输入新Token（留空自动生成）"
                  className="flex-1 bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 placeholder-black/30 focus:outline-none focus:border-black/50"
                  style={{ ...monoFont, fontSize: 22, height: 40 }} />
                <button onClick={() => setNewToken(crypto.randomUUID().replace(/-/g, ''))}
                  className="relative rounded-[27px] px-[20px] py-[6px] bg-white/30 hover:bg-white/50 transition-colors cursor-pointer">
                  <div className={pillShadow} style={pillShadowStyle} />
                  <span style={{ ...btnFont, fontSize: 22 }} className="text-black/70">随机生成</span>
                </button>
                <button onClick={saveToken}
                  className="relative rounded-[27px] px-[20px] py-[6px] bg-white/30 hover:bg-white/50 transition-colors cursor-pointer">
                  <div className={pillShadow} style={pillShadowStyle} />
                  <span style={{ ...btnFont, fontSize: 22 }} className="text-black/70">保存</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
      </div>

      {/* 板块3：页面配置（背景管理） */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '180ms' }}>
      <GlassCard>
        <div className="p-[30px]">
          <h2 className="text-black/80 mb-[20px]" style={sectionTitle}>页面配置</h2>

          <div className="flex items-center justify-between mb-[10px]">
            <span style={labelFont} className="text-black/70">界面主题</span>
            <ActionSlider value={THEME_MODE_MAP[mode]} onChange={handleThemeModeChange} options={THEME_MODE_OPTIONS} />
          </div>
          <p className="mb-[20px] text-black/45" style={{ ...monoFont, fontSize: 16 }}>
            当前生效主题：{resolvedTheme === 'dark' ? '暗色' : '浅色'}。选择“跟随系统”时会实时响应系统主题变化。
          </p>

          {/* 自定义背景开关 */}
          <div className="flex items-center justify-between mb-[20px]">
            <span style={labelFont} className="text-black/70">自定义背景</span>
            <Toggle checked={localBg.use_custom_background} onChange={v => saveBgSettings({ ...localBg, use_custom_background: v })} />
          </div>

          {/* 背景文件网格 - 仅在自定义背景开启时显示 */}
          {localBg.use_custom_background && (
          <>
            <div className="grid grid-cols-4 gap-[16px] mb-[24px]">
              {bgFiles.map(f => (
                <div key={f.filename} className="relative rounded-[15px] overflow-hidden border-2 border-black/20 group" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={toThumbnailUrl(f.filename)}
                    loading="lazy"
                    decoding="async"
                    alt={f.filename}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = f.is_video ? '/default_backgrounds/default.jpg' : toBackgroundFileUrl(f.filename) }}
                  />
                  {f.is_video && (
                    <div className="absolute top-[6px] left-[6px] px-[7px] py-[1px] rounded-[8px] bg-black/55 text-white/90" style={{ ...monoFont, fontSize: 12 }}>
                      视频
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <div className="w-full p-[8px] bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                      <div className="truncate" style={{ ...monoFont, fontSize: 14 }}>{f.filename} ({formatFileSize(f.size_kb)})</div>
                      <div className="flex gap-[6px] shrink-0">
                        <a
                          href={toBackgroundFileUrl(f.filename)}
                          download={f.filename}
                          onClick={e => e.stopPropagation()}
                          className="px-[8px] py-[2px] rounded-[10px] text-white hover:bg-white/20 transition-colors"
                          style={{ fontSize: 14 }}
                        >
                          导出
                        </a>
                        <button onClick={() => pinFile(f.filename)} className="px-[8px] py-[2px] rounded-[10px] text-white hover:bg-white/20 transition-colors" style={{ fontSize: 14 }}>
                          {localBg.pinned_file === f.filename ? '取消固定' : '固定'}
                        </button>
                        <button onClick={() => deleteBg(f.filename)} className="px-[8px] py-[2px] rounded-[10px] text-red-300 hover:bg-red-500/30 transition-colors" style={{ fontSize: 14 }}>删除</button>
                      </div>
                    </div>
                  </div>
                  {localBg.pinned_file === f.filename && (
                    <div className="absolute top-[6px] right-[6px] bg-green-500 text-white rounded-full px-[8px] py-[1px]" style={{ fontSize: 12 }}>固定</div>
                  )}
                </div>
              ))}
            </div>

            {/* 拖拽上传区 */}
            <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[20px] py-[30px] flex flex-col items-center justify-center cursor-pointer transition-colors mb-[24px] ${dragOver ? 'border-blue-400 bg-blue-50/30' : 'border-black/30 hover:border-black/50'}`}>
              <span className="text-black/50" style={labelFont}>{uploading ? '上传中...' : '拖拽或点击上传背景图片/视频'}</span>
              <span className="text-black/30 mt-[4px]" style={{ fontSize: 18 }}>支持 jpg/png/gif/webp/mp4/webm，图片最大50MB，视频最大600MB</span>
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" multiple hidden onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
            </div>
          </>
          )}

          {/* 盖层控制 */}
          <div className="space-y-[16px]">
            {/* 轮播间隔 - 仅在自定义背景开启时显示 */}
            {localBg.use_custom_background && (
            <div className="flex items-center justify-between">
              <span style={labelFont} className="text-black/70">轮播间隔（分钟）</span>
              <input type="number" min={1} value={localBg.interval_minutes}
                onChange={e => saveBgSettings({ ...localBg, interval_minutes: Math.max(1, Number(e.target.value)) })}
                className="bg-white/30 border-2 border-black/30 rounded-[15px] px-4 text-black/70 focus:outline-none"
                style={{ ...monoFont, fontSize: 22, width: 120, height: 40, textAlign: 'right' }} />
            </div>
            )}
            <div className="flex items-center justify-between">
              <span style={labelFont} className="text-black/70">盖层不透明度</span>
              <div className="flex items-center gap-[12px]">
                <input type="range" min={0} max={1} step={0.05} value={localBg.overlay_opacity} onChange={e => saveBgSettings({ ...localBg, overlay_opacity: Number(e.target.value) })} style={{ width: 200 }} />
                <span style={{ ...monoFont, fontSize: 20, width: 50 }} className="text-black/50 text-right">{localBg.overlay_opacity.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={labelFont} className="text-black/70">盖层模糊度</span>
              <div className="flex items-center gap-[12px]">
                <input type="range" min={0} max={20} step={1} value={localBg.overlay_blur} onChange={e => saveBgSettings({ ...localBg, overlay_blur: Number(e.target.value) })} style={{ width: 200 }} />
                <span style={{ ...monoFont, fontSize: 20, width: 50 }} className="text-black/50 text-right">{localBg.overlay_blur}px</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span style={labelFont} className="text-black/70">盖层颜色跟随主题</span>
              <Toggle
                checked={localBg.overlay_color_auto !== false}
                onChange={v => saveBgSettings(v
                  ? { ...localBg, overlay_color_auto: true }
                  : { ...localBg, overlay_color_auto: false, overlay_color: resolvedOverlayColor })}
              />
            </div>
            <div className="flex items-center justify-between relative">
              <span style={labelFont} className="text-black/70">盖层颜色</span>
              <div className="flex items-center gap-[12px]">
                <div ref={colorAnchorRef} className="rounded-[10px] cursor-pointer border-2 border-black/20"
                  style={{ width: 40, height: 40, background: `rgb(${resolvedOverlayColor})`, opacity: localBg.overlay_color_auto !== false ? 0.85 : 1 }}
                  onClick={() => {
                    if (localBg.overlay_color_auto !== false) {
                      void saveBgSettings({ ...localBg, overlay_color_auto: false, overlay_color: resolvedOverlayColor })
                    }
                    setColorPickerOpen(!colorPickerOpen)
                  }} />
                <span style={{ ...monoFont, fontSize: 20 }} className="text-black/50">
                  {localBg.overlay_color_auto !== false ? `自动 · ${rgbToHex(resolvedOverlayColor)}` : rgbToHex(resolvedOverlayColor)}
                </span>
                {colorPickerOpen && (
                  <ColorPickerPopup color={resolvedOverlayColor} anchorRef={colorAnchorRef}
                    onChange={c => saveBgSettings({ ...localBg, overlay_color_auto: false, overlay_color: c })}
                    onClose={() => setColorPickerOpen(false)} />
                )}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
      </div>

      {/* 板块4：桌宠设置 */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '240ms' }}>
      <GlassCard>
        <div className="p-[30px]">
          <h2 className="text-black/80 mb-[20px]" style={sectionTitle}>桌宠设置（已迁移）</h2>
          <div className="rounded-[14px] border-2 border-black/15 bg-white/35 p-[18px] text-black/65" style={labelFont}>
            桌宠配置入口已统一到「杂项 → 桌宠」，避免多页面并行改动导致配置不同步。
            <div className="mt-[8px] text-black/45" style={{ ...monoFont, fontSize: 16 }}>
              当前页不再提供旧版桌宠配置编辑。
            </div>
          </div>
        </div>
      </GlassCard>
      </div>

      {/* 板块4.5：LLM配置 */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '270ms' }}>
      <GlassCard>
        <div className="p-[30px]">
          <h2 className="text-black/80 mb-[20px]" style={sectionTitle}>AI配置</h2>
          <LLMConfigSection />
        </div>
      </GlassCard>
      </div>

      {/* 板块5：成员管理（预留） */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '300ms' }}>
      <GlassCard>
        <div className="p-[30px] flex items-center justify-center" style={{ minHeight: 120 }}>
          <span className="text-black/30" style={sectionTitle}>成员管理 — 开发中</span>
        </div>
      </GlassCard>
      </div>
    </div>
  )
}
