import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'
import { useBgContext } from '../components/background/DynamicBackground'
import type { BgSettings } from '../components/background/DynamicBackground'

const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 2 }
const pillShadow = "absolute inset-0 rounded-[27px] pointer-events-none"
const pillShadowStyle = { border: '2px solid rgba(0,0,0,0.5)', boxShadow: '2px 3px 6px rgba(0,0,0,0.15)' }
const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }

interface BgFile { filename: string; size_kb: number; is_video: boolean }

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
      style={{ background: 'rgba(255,255,255,0.95)', border: '2px solid rgba(0,0,0,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', width: 240, top: pos.top, left: pos.left }}>
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
      <div className="rounded-[8px] h-[24px]" style={{ background: `rgb(${rgb})`, border: '1px solid rgba(0,0,0,0.15)' }} />
    </div>,
    document.body
  )
}

export default function Settings() {
  const { notify } = useNotification()
  const { settings: bgSettings, refreshFiles, refreshSettings } = useBgContext()

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
  useEffect(() => { loadPConfig(); loadToken(); loadBgFiles() }, [loadPConfig, loadToken, loadBgFiles])

  const getVal = (key: string) => pDirty[key] ?? key.split('.').reduce((o: any, k) => o?.[k], pConfig)
  const setVal = (key: string, v: any) => setPDirty(prev => ({ ...prev, [key]: v }))

  const savePConfig = async () => {
    if (Object.keys(pDirty).length === 0) return
    setPSaving(true)
    try {
      const r = await fetch('/api/settings/p-config', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: pDirty }) })
      const d = await r.json()
      if (d.success) { notify('配置已保存', 'success'); setPDirty({}); loadPConfig() }
      else notify('保存失败', 'error')
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <div onClick={() => onChange(!checked)} className="cursor-pointer shrink-0"
      style={{ width: 56, height: 30, borderRadius: 15, background: checked ? '#4AF933' : '#ccc', position: 'relative', transition: 'background 0.2s' }}>
      <div style={{ width: 24, height: 24, borderRadius: 12, background: '#fff', position: 'absolute', top: 3, left: checked ? 29 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </div>
  )

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
  const getExitActionDisplay = () => {
    const val = getVal('on_exit.process_action') || 'none'
    return EXIT_ACTION_MAP[val] || '无操作'
  }
  const handleExitActionChange = (display: string) => {
    setVal('on_exit.process_action', EXIT_ACTION_REVERSE_MAP[display])
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
      <div ref={containerRef} className="relative inline-flex items-center h-[40px] rounded-[20px] border-2 border-black/50 p-[4px]" style={{ filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.1))' }}>
        <div className="absolute h-[32px] rounded-[16px] bg-white border border-black/50 transition-all duration-300 ease-out" style={{ width: sliderStyle.width, left: sliderStyle.left, top: 2, filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.1))' }} />
        {options.map(opt => (
          <button key={opt} onClick={() => onChange(opt)} className="relative z-10 h-[32px] px-[12px] cursor-pointer bg-transparent border-none transition-colors duration-200" style={{ fontSize: 16, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", color: value === opt ? '#000' : 'rgba(0,0,0,0.4)' }}>
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
          </div>
          <div className="flex justify-end mt-[20px]">
            <button onClick={savePConfig} disabled={pSaving || Object.keys(pDirty).length === 0}
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
                  {f.is_video ? (
                    <video src={`/backgrounds/${f.filename}`} muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('/backgrounds/${f.filename}')` }} />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                    <div className="w-full p-[8px] bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                      <div className="truncate" style={{ ...monoFont, fontSize: 14 }}>{f.filename} ({f.size_kb}KB)</div>
                      <div className="flex gap-[6px] shrink-0">
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
              <span className="text-black/30 mt-[4px]" style={{ fontSize: 18 }}>支持 jpg/png/gif/webp/mp4/webm，最大50MB</span>
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
            <div className="flex items-center justify-between relative">
              <span style={labelFont} className="text-black/70">盖层颜色</span>
              <div className="flex items-center gap-[12px]">
                <div ref={colorAnchorRef} className="rounded-[10px] cursor-pointer border-2 border-black/20"
                  style={{ width: 40, height: 40, background: `rgb(${localBg.overlay_color})` }}
                  onClick={() => setColorPickerOpen(!colorPickerOpen)} />
                <span style={{ ...monoFont, fontSize: 20 }} className="text-black/50">{rgbToHex(localBg.overlay_color)}</span>
                {colorPickerOpen && (
                  <ColorPickerPopup color={localBg.overlay_color} anchorRef={colorAnchorRef}
                    onChange={c => saveBgSettings({ ...localBg, overlay_color: c })}
                    onClose={() => setColorPickerOpen(false)} />
                )}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
      </div>

      {/* 板块4：成员管理（预留） */}
      <div className="animate-fade-slide-up" style={{ animationDelay: '240ms' }}>
      <GlassCard>
        <div className="p-[30px] flex items-center justify-center" style={{ minHeight: 120 }}>
          <span className="text-black/30" style={sectionTitle}>成员管理 — 开发中</span>
        </div>
      </GlassCard>
      </div>
    </div>
  )
}
