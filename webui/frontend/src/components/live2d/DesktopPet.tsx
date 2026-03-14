import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GlassCard from '../ui/GlassCard'
import { useNotification } from '../ui/Notification'

type Live2DModelMeta = {
  model_id: string
  model_json_url: string
  cover_url: string
  expressions: Array<{ name: string; file: string }>
  motions: Record<string, Array<{ index: number; file: string }>>
}

type DesktopPetSettings = {
  model_id: string
  scale: number
  opacity: number
  position: { x: number; y: number }
  window: { width: number; height: number; always_on_top: boolean; transparent: boolean }
  expression: string
  motion_group: string
  motion_index: number
  ai_enabled: boolean
  persona: { name: string; tone: string; system_prompt: string; greeting: string }
  memory: {
    share_between_sessions_same_model: boolean
    stage_management: {
      memory_digest_interval_turns: number
      impression_build_turns: number[]
      impression_rebuild_interval_turns: number
    }
  }
}

const defaultSettings: DesktopPetSettings = {
  model_id: '',
  scale: 1,
  opacity: 1,
  position: { x: 80, y: 120 },
  window: { width: 360, height: 520, always_on_top: true, transparent: true },
  expression: '',
  motion_group: '',
  motion_index: 0,
  ai_enabled: true,
  persona: {
    name: '',
    tone: '',
    system_prompt: '',
    greeting: '',
  },
  memory: {
    share_between_sessions_same_model: true,
    stage_management: {
      memory_digest_interval_turns: 50,
      impression_build_turns: [30, 50, 100, 150],
      impression_rebuild_interval_turns: 150,
    },
  },
}

const txt = { fontSize: 18, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const mono = { fontSize: 15, fontFamily: "'Cascadia Code', monospace" }

function mergeSettings(base: DesktopPetSettings, patch: Partial<DesktopPetSettings>): DesktopPetSettings {
  return {
    ...base,
    ...patch,
    position: { ...base.position, ...(patch.position || {}) },
    window: { ...base.window, ...(patch.window || {}) },
    persona: { ...base.persona, ...(patch.persona || {}) },
    memory: {
      ...base.memory,
      ...(patch.memory || {}),
      stage_management: {
        ...base.memory.stage_management,
        ...(patch.memory?.stage_management || {}),
      },
    },
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-[56px] h-[30px] rounded-full transition ${checked ? 'bg-green-500' : 'bg-black/20'}`}
    >
      <span className={`absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white transition ${checked ? 'left-[29px]' : 'left-[3px]'}`} />
    </button>
  )
}

function PositionPad({ position, onChange }: { position: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const box = ref.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      const x = Math.max(0, Math.round((e.clientX - rect.left) * 6))
      const y = Math.max(0, Math.round((e.clientY - rect.top) * 6))
      onChange({ x, y })
    }
    const onUp = () => setDrag(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, onChange])

  const left = `${Math.max(0, Math.min(100, (position.x / 1920) * 100))}%`
  const top = `${Math.max(0, Math.min(100, (position.y / 1080) * 100))}%`
  return (
    <div ref={ref} className="relative h-[140px] rounded-[12px] border border-black/20 bg-white/40">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      <button type="button" onMouseDown={() => setDrag(true)} className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border border-white" style={{ left, top }} />
    </div>
  )
}

export function DesktopPetManager({ compact = false }: { compact?: boolean }) {
  const { notify } = useNotification()
  const [settings, setSettings] = useState<DesktopPetSettings>(defaultSettings)
  const [models, setModels] = useState<Live2DModelMeta[]>([])
  const [runtime, setRuntime] = useState<{ running: boolean; pid: number | null }>({ running: false, pid: null })
  const [runtimePending, setRuntimePending] = useState(false)
  const [runtimeHint, setRuntimeHint] = useState('')
  const [chat, setChat] = useState('')
  const [reply, setReply] = useState('')
  const [buildTurnsText, setBuildTurnsText] = useState(defaultSettings.memory.stage_management.impression_build_turns.join(', '))
  const importRef = useRef<HTMLInputElement | null>(null)
  const coverRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(() => models.find(m => m.model_id === settings.model_id) || models[0] || null, [models, settings.model_id])
  const motionGroups = useMemo(() => selected ? Object.keys(selected.motions) : [], [selected])
  const motions = useMemo(() => selected?.motions?.[settings.motion_group] || [], [selected, settings.motion_group])

  const parsePositiveInt = useCallback((value: string, fallback: number) => {
    const parsed = Number.parseInt(String(value).trim(), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }, [])

  const parseTurnList = useCallback((value: string) => {
    const parsed = String(value)
      .split(/[，,、\s]+/)
      .map(item => Number.parseInt(item.trim(), 10))
      .filter(item => Number.isFinite(item) && item > 0)
    return Array.from(new Set(parsed)).sort((left, right) => left - right)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [mRes, sRes, rRes] = await Promise.all([
        fetch('/api/settings/live2d/models', { credentials: 'include' }),
        fetch('/api/settings/live2d/settings', { credentials: 'include' }),
        fetch('/api/settings/live2d/runtime/status', { credentials: 'include' }),
      ])
      const m = await mRes.json()
      const s = await sRes.json()
      const r = await rRes.json()
      const list: Live2DModelMeta[] = m?.models || []
      setModels(list)
      const merged = mergeSettings(defaultSettings, s?.value || {})
      if (!merged.model_id && list.length > 0) merged.model_id = list[0].model_id
      setSettings(merged)
      setBuildTurnsText(merged.memory.stage_management.impression_build_turns.join(', '))
      setRuntime({ running: !!r?.running, pid: r?.pid ?? null })
    } catch {
      notify('读取桌宠数据失败', 'error')
    }
  }, [notify])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    importRef.current?.setAttribute('webkitdirectory', '')
    importRef.current?.setAttribute('directory', '')
  }, [])

  const persist = useCallback(async (next: DesktopPetSettings) => {
    setSettings(next)
    try {
      const res = await fetch('/api/settings/live2d/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.detail || '保存失败')
      const merged = mergeSettings(defaultSettings, data.value || {})
      setSettings(merged)
      setBuildTurnsText(merged.memory.stage_management.impression_build_turns.join(', '))
    } catch (err: any) {
      notify(err?.message || '保存失败', 'error')
    }
  }, [notify])

  const applyPatch = (patch: Partial<DesktopPetSettings>) => void persist(mergeSettings(settings, patch))

  const handleImport = async (files: FileList) => {
    const arr = Array.from(files)
    if (!arr.length) return
    const rel = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    const folder = rel.includes('/') ? rel.split('/')[0] : arr[0].name.replace(/\.[^.]+$/, '')
    const form = new FormData()
    form.append('folder_name', folder)
    arr.forEach(f => form.append('files', f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name))
    const res = await fetch('/api/settings/live2d/import', { method: 'POST', credentials: 'include', body: form })
    const data = await res.json()
    if (!data?.success) throw new Error(data?.detail || '导入失败')
    notify('模型导入成功', 'success')
    await loadData()
  }

  const handleCover = async (file: File) => {
    if (!settings.model_id) return
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/settings/live2d/models/${encodeURIComponent(settings.model_id)}/cover`, { method: 'POST', credentials: 'include', body: form })
    const data = await res.json()
    if (!data?.success) throw new Error(data?.detail || '封面上传失败')
    notify('封面上传成功', 'success')
    await loadData()
  }

  const handleDeleteModel = async () => {
    if (!settings.model_id) return
    const res = await fetch(`/api/settings/live2d/models/${encodeURIComponent(settings.model_id)}`, { method: 'DELETE', credentials: 'include' })
    const data = await res.json()
    if (!data?.success) throw new Error(data?.detail || '删除失败')
    notify('模型已删除', 'success')
    await loadData()
  }

  const toggleRuntime = async () => {
    if (runtimePending) return
    const action = runtime.running ? 'stop' : 'start'
    setRuntimePending(true)
    setRuntimeHint(action === 'start' ? '正在请求启动桌宠悬浮窗...' : '正在请求停止桌宠悬浮窗...')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    try {
      const res = await fetch(`/api/settings/live2d/runtime/${action}`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.detail || (runtime.running ? '停止失败' : '启动失败'))
      }
      if (action === 'start') {
        setRuntimeHint('启动命令已发送，请留意系统是否弹出新窗口。')
        notify('桌宠悬浮窗启动请求已发送', 'success')
      } else {
        setRuntimeHint('桌宠悬浮窗已停止。')
      }
      await loadData()
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? '请求超时：后端启动桌宠无响应，请检查后端控制台日志。'
        : (err?.message || '切换运行状态失败')
      setRuntimeHint(msg)
      throw new Error(msg)
    } finally {
      window.clearTimeout(timeout)
      setRuntimePending(false)
    }
  }

  return (
    <GlassCard>
      <div className="p-[24px] space-y-4">
        {!compact ? <h2 className="text-black/80" style={{ fontSize: 36, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>Live2D 桌宠</h2> : null}
        <input ref={importRef} type="file" hidden multiple onChange={e => { if (e.target.files?.length) void handleImport(e.target.files).catch(err => notify(err?.message || '导入失败', 'error')); e.target.value = '' }} />
        <input ref={coverRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) void handleCover(f).catch(err => notify(err?.message || '封面上传失败', 'error')); e.target.value = '' }} />

        <div className="rounded-[10px] border border-black/15 bg-white/35 p-3 text-black/65" style={txt}>
          启动步骤：1. 导入模型文件夹，文件夹中需要包含 `.moc` 或 `.moc3` 文件。2. 选择模型。3. 点击“启动桌宠 (Electron)”。
          当前桌宠使用独立 Electron 悬浮窗，启动后会在系统桌面显示。
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className="bg-white/45 border border-black/25 rounded-[10px] px-3 py-2" style={txt} value={settings.model_id} onChange={e => applyPatch({ model_id: e.target.value })}>
            {(models.length ? models : [{ model_id: '', model_json_url: '', cover_url: '', expressions: [], motions: {} }]).map(m => <option key={m.model_id || 'none'} value={m.model_id}>{m.model_id || '暂无模型'}</option>)}
          </select>
          <button className="px-3 py-2 rounded-[10px] bg-white/45 border border-black/25" style={txt} onClick={() => importRef.current?.click()}>导入模型</button>
          <button className="px-3 py-2 rounded-[10px] bg-white/45 border border-black/25" style={txt} onClick={() => coverRef.current?.click()}>上传封面</button>
          <button className="px-3 py-2 rounded-[10px] bg-white/45 border border-black/25" style={txt} onClick={() => void handleDeleteModel().catch(err => notify(err?.message || '删除失败', 'error'))}>删除模型</button>
          <button
            className="px-3 py-2 rounded-[10px] bg-black/80 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            style={txt}
            disabled={runtimePending}
            onClick={() => void toggleRuntime().catch(err => notify(err?.message || '切换运行状态失败', 'error'))}
          >
            {runtimePending ? '处理中...' : (runtime.running ? '停止桌宠' : '启动桌宠 (Electron)')}
          </button>
          <span className="text-black/55" style={mono}>状态: {runtime.running ? `运行中 PID=${runtime.pid ?? '-'}` : '未运行'}</span>
        </div>
        {!runtime.running && (
          <div className="rounded-[8px] border border-emerald-500/30 bg-emerald-50/50 px-3 py-2 text-emerald-800/80" style={{ ...txt, fontSize: 14 }}>
            Electron 桌宠支持透明窗口、流畅渲染、AI 互动和鼠标视线跟随。
          </div>
        )}
        {runtimeHint ? (
          <div className="rounded-[8px] border border-black/15 bg-white/30 px-3 py-2 text-black/65" style={{ ...txt, fontSize: 16 }}>
            {runtimeHint}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <div className="h-[320px] rounded-[14px] overflow-hidden border border-black/15 bg-white/25 flex items-center justify-center">
            {selected?.cover_url ? (
              <img src={selected.cover_url} className="max-h-full max-w-full object-contain" alt={selected.model_id} />
            ) : (
              <span className="text-black/45" style={txt}>当前模型暂无封面，上传封面后会显示在这里</span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span style={txt}>缩放</span><input type="range" min={0.2} max={2.5} step={0.05} value={settings.scale} onChange={e => applyPatch({ scale: Number(e.target.value) })} /></div>
            <div className="flex items-center justify-between"><span style={txt}>透明度</span><input type="range" min={0.1} max={1} step={0.05} value={settings.opacity} onChange={e => applyPatch({ opacity: Number(e.target.value) })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <select className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={settings.expression} onChange={e => applyPatch({ expression: e.target.value })}>
                <option value="">默认表情</option>{(selected?.expressions || []).map(exp => <option key={exp.file} value={exp.file}>{exp.name}</option>)}
              </select>
              <select className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={settings.motion_group} onChange={e => applyPatch({ motion_group: e.target.value, motion_index: 0 })}>
                <option value="">默认动作组</option>{motionGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <select className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={settings.motion_index} onChange={e => applyPatch({ motion_index: Number(e.target.value) })}>
              {(motions.length ? motions : [{ index: 0, file: '' }]).map(m => <option key={m.index} value={m.index}>动作 {m.index}</option>)}
            </select>
            <PositionPad position={settings.position} onChange={v => applyPatch({ position: v })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={mono} type="number" value={settings.position.x} onChange={e => applyPatch({ position: { ...settings.position, x: Number(e.target.value) } })} />
              <input className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={mono} type="number" value={settings.position.y} onChange={e => applyPatch({ position: { ...settings.position, y: Number(e.target.value) } })} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span style={txt}>AI 文本互动</span><Toggle checked={settings.ai_enabled} onChange={v => applyPatch({ ai_enabled: v })} /></div>
            <div className="flex items-center justify-between"><span style={txt}>同模型跨会话共享记忆</span><Toggle checked={settings.memory.share_between_sessions_same_model} onChange={v => applyPatch({ memory: { ...settings.memory, share_between_sessions_same_model: v } })} /></div>
            <input className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={settings.persona.name} onChange={e => applyPatch({ persona: { ...settings.persona, name: e.target.value } })} placeholder="人格名称" />
            <input className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={settings.persona.tone} onChange={e => applyPatch({ persona: { ...settings.persona, tone: e.target.value } })} placeholder="人格语气" />
            <textarea className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1 resize-y" rows={3} style={txt} value={settings.persona.system_prompt} onChange={e => applyPatch({ persona: { ...settings.persona, system_prompt: e.target.value } })} placeholder="人格系统设定" />
            <textarea className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1 resize-y" rows={2} style={txt} value={settings.persona.greeting} onChange={e => applyPatch({ persona: { ...settings.persona, greeting: e.target.value } })} placeholder="问候语" />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1"
                style={mono}
                type="number"
                min={1}
                value={settings.memory.stage_management.memory_digest_interval_turns}
                onChange={e => applyPatch({
                  memory: {
                    ...settings.memory,
                    stage_management: {
                      ...settings.memory.stage_management,
                      memory_digest_interval_turns: parsePositiveInt(e.target.value, settings.memory.stage_management.memory_digest_interval_turns),
                    },
                  },
                })}
                placeholder="记忆整理间隔"
              />
              <input
                className="bg-white/45 border border-black/25 rounded-[8px] px-2 py-1"
                style={mono}
                type="number"
                min={1}
                value={settings.memory.stage_management.impression_rebuild_interval_turns}
                onChange={e => applyPatch({
                  memory: {
                    ...settings.memory,
                    stage_management: {
                      ...settings.memory.stage_management,
                      impression_rebuild_interval_turns: parsePositiveInt(e.target.value, settings.memory.stage_management.impression_rebuild_interval_turns),
                    },
                  },
                })}
                placeholder="印象重建间隔"
              />
            </div>
            <input
              className="w-full bg-white/45 border border-black/25 rounded-[8px] px-2 py-1"
              style={mono}
              type="text"
              value={buildTurnsText}
              onChange={e => setBuildTurnsText(e.target.value)}
              onBlur={() => {
                const turns = parseTurnList(buildTurnsText)
                const nextTurns = turns.length ? turns : defaultSettings.memory.stage_management.impression_build_turns
                setBuildTurnsText(nextTurns.join(', '))
                applyPatch({
                  memory: {
                    ...settings.memory,
                    stage_management: {
                      ...settings.memory.stage_management,
                      impression_build_turns: nextTurns,
                    },
                  },
                })
              }}
              placeholder="印象构建回合，例如 30, 50, 100, 150"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span style={txt}>窗口始终置顶</span><Toggle checked={settings.window.always_on_top} onChange={v => applyPatch({ window: { ...settings.window, always_on_top: v } })} /></div>
            <div className="flex items-center justify-between"><span style={txt}>透明背景</span><Toggle checked={settings.window.transparent} onChange={v => applyPatch({ window: { ...settings.window, transparent: v } })} /></div>
            <div className="flex gap-2">
              <input className="flex-1 bg-white/45 border border-black/25 rounded-[8px] px-2 py-1" style={txt} value={chat} onChange={e => setChat(e.target.value)} placeholder="和桌宠说点什么" />
              <button className="px-3 py-1 rounded-[8px] bg-black/80 text-white" style={txt} onClick={() => void fetch('/api/settings/live2d/chat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: chat }) }).then(r => r.json()).then(d => { if (!d?.success) throw new Error(d?.detail || '聊天失败'); setReply(d.reply || '') }).catch(err => notify(err?.message || '聊天失败', 'error'))}>发送</button>
            </div>
            <div className="min-h-[68px] rounded-[8px] border border-black/20 bg-white/35 p-2 text-black/65 whitespace-pre-wrap" style={txt}>{reply || settings.persona.greeting}</div>
            <div className="rounded-[8px] border border-black/15 bg-white/30 px-3 py-2 text-black/55" style={{ ...txt, fontSize: 14 }}>
              阶段记忆策略已与桌宠面板和后端共享配置同步，修改这里会立即写回同一份桌宠设置。
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
