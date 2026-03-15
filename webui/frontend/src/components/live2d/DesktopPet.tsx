import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Loader2, Play, Save, Search, Square } from 'lucide-react'
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

type RuntimeState = {
  running: boolean
  pid: number | null
  electron_path?: string | null
}

type UsagePoint = {
  date: string
  minutes: number
}

type UsageSession = {
  start: string
  end: string | null
  minutes: number
}

type UsageStats = {
  today_minutes: number
  week_minutes: number
  month_minutes: number
  current_session_minutes: number
  running: boolean
  daily?: UsagePoint[]
  daily_stats?: UsagePoint[]
  sessions?: UsageSession[]
}

type StatsView = 'daily' | 'weekly' | 'monthly'

type ChartData = {
  label: string
  value: number
  detail: string
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
const sectionClass = 'rounded-[18px] border border-black/12 bg-white/28 p-4 sm:p-5'
const softButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[10px] border border-black/20 bg-white/45 px-3 py-2 text-black/80 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60'

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

function padNumber(value: number) {
  return String(value).padStart(2, '0')
}

function createDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function createMonthKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  return next
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  const offset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - offset)
  return next
}

function formatMinutes(minutes: number) {
  if (minutes >= 60) {
    const hours = minutes / 60
    return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)} 小时`
  }
  return `${Math.round(minutes)} 分钟`
}

function buildChartData(usageStats: UsageStats | null, statsView: StatsView): ChartData[] {
  if (!usageStats) return []

  const dailyStats = usageStats.daily_stats?.length ? usageStats.daily_stats : (usageStats.daily || [])
  if (statsView === 'daily') {
    return dailyStats.map(item => ({
      label: item.date.slice(5).replace('-', '/'),
      value: item.minutes,
      detail: item.date,
    }))
  }

  const sessions = Array.isArray(usageStats.sessions) ? usageStats.sessions : []
  if (statsView === 'weekly') {
    const currentWeek = startOfWeek(new Date())
    const buckets = Array.from({ length: 4 }, (_, index) => {
      const start = addDays(currentWeek, -7 * (3 - index))
      const end = addDays(start, 7)
      return {
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        detail: `${createDateKey(start)} 开始的这一周`,
        start,
        end,
        value: 0,
      }
    })

    sessions.forEach(session => {
      const startedAt = new Date(session.start)
      if (Number.isNaN(startedAt.getTime())) return
      const bucket = buckets.find(item => startedAt >= item.start && startedAt < item.end)
      if (!bucket) return
      bucket.value += Math.max(0, Math.round(session.minutes || 0))
    })

    return buckets.map(({ label, value, detail }) => ({ label, value, detail }))
  }

  const currentMonth = new Date()
  currentMonth.setDate(1)
  currentMonth.setHours(0, 0, 0, 0)
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const start = addMonths(currentMonth, -(5 - index))
    const end = addMonths(start, 1)
    return {
      label: `${start.getFullYear()}/${padNumber(start.getMonth() + 1)}`,
      detail: `${createMonthKey(start)} 月`,
      start,
      end,
      value: 0,
    }
  })

  sessions.forEach(session => {
    const startedAt = new Date(session.start)
    if (Number.isNaN(startedAt.getTime())) return
    const bucket = monthBuckets.find(item => startedAt >= item.start && startedAt < item.end)
    if (!bucket) return
    bucket.value += Math.max(0, Math.round(session.minutes || 0))
  })

  return monthBuckets.map(({ label, value, detail }) => ({ label, value, detail }))
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[56px] rounded-full transition ${checked ? 'bg-green-500' : 'bg-black/20'}`}
    >
      <span className={`absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white transition ${checked ? 'left-[29px]' : 'left-[3px]'}`} />
    </button>
  )
}

function PositionPad({ position, onChange }: { position: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    if (!drag) return
    const onMove = (event: MouseEvent) => {
      const box = ref.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      const x = Math.max(0, Math.round((event.clientX - rect.left) * 6))
      const y = Math.max(0, Math.round((event.clientY - rect.top) * 6))
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
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <button
        type="button"
        onMouseDown={() => setDrag(true)}
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-500"
        style={{ left, top }}
      />
    </div>
  )
}

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
  textStyle = mono,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
  textStyle?: typeof txt | typeof mono
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 })

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const dropUp = spaceBelow < 150 && spaceAbove > spaceBelow
    const maxHeight = Math.min(240, dropUp ? spaceAbove : spaceBelow)
    setPos({
      top: dropUp ? rect.top - Math.max(maxHeight, 60) - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(maxHeight, 60),
    })
  }, [open])

  const selectedOption = options.find(option => option.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(current => !current)}
        className={`w-full rounded-[10px] border border-black/25 bg-white/45 px-3 py-2 text-left text-black/85 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
        style={textStyle}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={`truncate ${selectedOption ? 'text-black/85' : 'text-black/35'}`}>{selectedOption?.label || placeholder || '请选择'}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-black/45 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && options.length > 0 ? createPortal(
        <div
          className="fixed overflow-y-auto rounded-[16px] border border-black/20 bg-white/95 backdrop-blur-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999, boxShadow: '4px 4px 12px rgba(0,0,0,0.15)' }}
          onMouseDown={event => event.stopPropagation()}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className="w-full px-3 py-2 text-left transition hover:bg-black/5"
              style={{ ...textStyle, background: option.value === value ? 'rgba(0,0,0,0.06)' : undefined }}
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
function BarChart({ data }: { data: ChartData[] }) {
  const maxValue = Math.max(...data.map(item => item.value), 0)

  if (!data.length) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-[14px] border border-dashed border-black/15 bg-white/20 text-black/45" style={txt}>
        暂无统计数据
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-black/10 bg-white/20 p-3">
      <div className="flex h-[240px] items-end gap-3">
        {data.map(item => {
          const height = maxValue > 0 ? Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0) : 0
          return (
            <div key={`${item.detail}-${item.label}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-center text-[11px] text-black/55" style={mono}>{item.value} 分</span>
              <div className="relative flex h-[180px] w-full items-end rounded-[10px] bg-black/5 px-1 pb-1">
                <div className="w-full rounded-[8px] bg-gradient-to-t from-blue-500 via-sky-400 to-cyan-200 transition-[height]" style={{ height: `${height}%` }} title={`${item.detail}：${item.value} 分钟`} />
              </div>
              <span className="text-center text-[11px] text-black/55" style={mono}>{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DesktopPetManager({ compact = false }: { compact?: boolean }) {
  const { notify } = useNotification()
  const [settings, setSettings] = useState<DesktopPetSettings>(defaultSettings)
  const [models, setModels] = useState<Live2DModelMeta[]>([])
  const [runtime, setRuntime] = useState<RuntimeState>({ running: false, pid: null, electron_path: null })
  const [runtimePending, setRuntimePending] = useState(false)
  const [runtimeHint, setRuntimeHint] = useState('')
  const [chat, setChat] = useState('')
  const [reply, setReply] = useState('')
  const [buildTurnsText, setBuildTurnsText] = useState(defaultSettings.memory.stage_management.impression_build_turns.join(', '))
  const [exePath, setExePath] = useState('')
  const [savedExePath, setSavedExePath] = useState('')
  const [exeFound, setExeFound] = useState(false)
  const [findingPath, setFindingPath] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [statsView, setStatsView] = useState<StatsView>('daily')
  const importRef = useRef<HTMLInputElement | null>(null)
  const coverRef = useRef<HTMLInputElement | null>(null)
  const savedExePathRef = useRef('')

  const selected = useMemo(() => models.find(model => model.model_id === settings.model_id) || models[0] || null, [models, settings.model_id])
  const motionGroups = useMemo(() => (selected ? Object.keys(selected.motions) : []), [selected])
  const motions = useMemo(() => selected?.motions?.[settings.motion_group] || [], [selected, settings.motion_group])
  const chartData = useMemo(() => buildChartData(usageStats, statsView), [statsView, usageStats])
  const pathDirty = exePath.trim() !== savedExePath.trim()
  const currentSessionVisible = runtime.running || usageStats?.running || (usageStats?.current_session_minutes ?? 0) > 0

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

  const syncSavedExePath = useCallback((path: string) => {
    const previousSavedPath = savedExePathRef.current
    savedExePathRef.current = path
    setSavedExePath(path)
    setExeFound(Boolean(path))
    setExePath(current => {
      const trimmed = current.trim()
      if (!trimmed || trimmed === previousSavedPath) return path
      return current
    })
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [modelsRes, settingsRes, runtimeRes] = await Promise.all([
        fetch('/api/settings/live2d/models', { credentials: 'include' }),
        fetch('/api/settings/live2d/settings', { credentials: 'include' }),
        fetch('/api/settings/live2d/runtime/status', { credentials: 'include' }),
      ])
      const modelsData = await modelsRes.json()
      const settingsData = await settingsRes.json()
      const runtimeData = await runtimeRes.json()
      const modelList: Live2DModelMeta[] = modelsData?.models || []
      setModels(modelList)
      const merged = mergeSettings(defaultSettings, settingsData?.value || {})
      if (!merged.model_id && modelList.length > 0) merged.model_id = modelList[0].model_id
      setSettings(merged)
      setBuildTurnsText(merged.memory.stage_management.impression_build_turns.join(', '))
      setRuntime({
        running: !!runtimeData?.running,
        pid: runtimeData?.pid ?? null,
        electron_path: runtimeData?.electron_path ?? null,
      })
      syncSavedExePath(String(runtimeData?.electron_path || '').trim())
    } catch {
      notify('读取桌宠数据失败', 'error')
    }
  }, [notify, syncSavedExePath])

  const loadUsageStats = useCallback(async (silent = false) => {
    try {
      const res = await fetch('/api/settings/live2d/usage-stats', { credentials: 'include' })
      const data = await res.json()
      if (data?.success === false) throw new Error(data?.detail || '加载使用统计失败')
      setUsageStats({
        today_minutes: Number(data?.today_minutes || 0),
        week_minutes: Number(data?.week_minutes || 0),
        month_minutes: Number(data?.month_minutes || 0),
        current_session_minutes: Number(data?.current_session_minutes || 0),
        running: !!data?.running,
        daily: Array.isArray(data?.daily) ? data.daily : [],
        daily_stats: Array.isArray(data?.daily_stats) ? data.daily_stats : [],
        sessions: Array.isArray(data?.sessions) ? data.sessions : [],
      })
    } catch (err: any) {
      if (!silent) notify(err?.message || '加载使用统计失败', 'error')
    }
  }, [notify])

  useEffect(() => {
    void loadData()
    void loadUsageStats()
  }, [loadData, loadUsageStats])

  useEffect(() => {
    importRef.current?.setAttribute('webkitdirectory', '')
    importRef.current?.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    if (!runtime.running) return
    const interval = window.setInterval(() => {
      void loadUsageStats(true)
    }, 60000)
    return () => window.clearInterval(interval)
  }, [loadUsageStats, runtime.running])

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

  const persistExePath = useCallback(async (path: string, options?: { showBusy?: boolean; successMessage?: string }) => {
    const trimmed = path.trim()
    if (!trimmed) throw new Error('请输入桌宠程序路径')
    if (trimmed === savedExePathRef.current.trim()) return trimmed

    if (options?.showBusy) setSavingPath(true)
    try {
      const res = await fetch('/api/settings/live2d/electron/set-path', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      })
      const data = await res.json()
      if (!res.ok || data?.success === false) throw new Error(data?.detail || '保存失败')
      const nextPath = String(data?.path || trimmed)
      savedExePathRef.current = nextPath
      setSavedExePath(nextPath)
      setExePath(nextPath)
      setExeFound(true)
      setRuntime(current => ({ ...current, electron_path: nextPath }))
      if (options?.successMessage) notify(options.successMessage, 'success')
      return nextPath
    } finally {
      if (options?.showBusy) setSavingPath(false)
    }
  }, [notify])

  const findExePath = useCallback(async () => {
    setFindingPath(true)
    try {
      const res = await fetch('/api/settings/live2d/electron/find', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok || data?.success === false) throw new Error(data?.detail || '查找失败')
      if (data?.found && data?.path) {
        const nextPath = String(data.path)
        setExePath(nextPath)
        setExeFound(true)
        await persistExePath(nextPath)
        setRuntimeHint('已找到并自动保存桌宠程序路径。')
        notify('找到桌宠程序并已自动保存', 'success')
        return
      }
      setExeFound(false)
      setRuntimeHint('未找到桌宠程序，请手动填写 exe 路径后保存。')
      notify('未找到桌宠程序，请手动设置路径', 'warning')
    } catch (err: any) {
      notify(err?.message || '查找失败', 'error')
    } finally {
      setFindingPath(false)
    }
  }, [notify, persistExePath])

  const saveExePath = useCallback(async () => {
    try {
      await persistExePath(exePath, { showBusy: true, successMessage: '路径已保存' })
      setRuntimeHint('桌宠程序路径已保存，之后刷新页面也会继续显示。')
    } catch (err: any) {
      notify(err?.message || '保存失败', 'error')
    }
  }, [exePath, notify, persistExePath])

  const handleImport = async (files: FileList) => {
    const arr = Array.from(files)
    if (!arr.length) return
    const relativePath = (arr[0] as File & { webkitRelativePath?: string }).webkitRelativePath || ''
    const folder = relativePath.includes('/') ? relativePath.split('/')[0] : arr[0].name.replace(/\.[^.]+$/, '')
    const form = new FormData()
    form.append('folder_name', folder)
    arr.forEach(file => form.append('files', file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name))
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
      if (action === 'start' && exePath.trim()) {
        await persistExePath(exePath)
        setRuntimeHint('已自动保存当前桌宠路径，正在请求启动桌宠悬浮窗...')
      }
      const res = await fetch(`/api/settings/live2d/runtime/${action}`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.detail || (runtime.running ? '停止失败' : '启动失败'))
      if (action === 'start') {
        setRuntimeHint('启动命令已发送，请留意系统是否弹出新窗口。')
        notify('桌宠悬浮窗启动请求已发送', 'success')
      } else {
        setRuntimeHint('桌宠悬浮窗已停止。')
      }
      await Promise.all([loadData(), loadUsageStats(true)])
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? '请求超时：后端启动桌宠无响应，请检查后端控制台日志。' : (err?.message || '切换运行状态失败')
      setRuntimeHint(message)
      throw new Error(message)
    } finally {
      window.clearTimeout(timeout)
      setRuntimePending(false)
    }
  }

  const usageSummary = [
    { label: '今日', value: formatMinutes(usageStats?.today_minutes ?? 0) },
    { label: '本周', value: formatMinutes(usageStats?.week_minutes ?? 0) },
    { label: '本月', value: formatMinutes(usageStats?.month_minutes ?? 0) },
  ]

  return (
    <GlassCard>
      <div className="space-y-4 p-[24px]">
        {!compact ? <h2 className="text-black/80" style={{ fontSize: 36, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>Live2D 桌宠</h2> : null}
        <input ref={importRef} type="file" hidden multiple onChange={event => { if (event.target.files?.length) void handleImport(event.target.files).catch(err => notify(err?.message || '导入失败', 'error')); event.target.value = '' }} />
        <input ref={coverRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={event => { const file = event.target.files?.[0]; if (file) void handleCover(file).catch(err => notify(err?.message || '封面上传失败', 'error')); event.target.value = '' }} />

        <section className={`${sectionClass} bg-blue-50/45`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <h3 className="text-black/80" style={{ ...txt, fontSize: 28 }}>桌宠启动器</h3>
                <p className="text-black/65" style={{ ...txt, fontSize: 15 }}>
                  路径不会在页面加载时自动查找。只有点击“查找桌宠”时，才会按配置、本地构建目录和注册表顺序手动定位。
                </p>
              </div>
              <div className="rounded-[12px] border border-black/10 bg-white/45 px-3 py-2 text-black/60" style={{ ...mono, fontSize: 13 }}>
                当前模型：{settings.model_id || '未选择'}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input className="w-full rounded-[12px] border border-black/20 bg-white/60 px-3 py-3 text-black/85" style={mono} value={exePath} placeholder="请输入桌宠程序 exe 路径，或点击右侧按钮手动查找" onChange={event => {
                setExePath(event.target.value)
                if (event.target.value.trim() !== savedExePath.trim()) setExeFound(false)
              }} />
              <button className={softButtonClass} style={txt} disabled={findingPath} onClick={() => void findExePath()}>
                {findingPath ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {findingPath ? '查找中...' : '查找桌宠'}
              </button>
              <button className={softButtonClass} style={txt} disabled={savingPath || !exePath.trim()} onClick={() => void saveExePath()}>
                {savingPath ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingPath ? '保存中...' : '保存路径'}
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-[14px] border border-black/10 bg-white/35 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1 text-black/65">
                <div style={mono}>路径状态：{pathDirty ? '已修改，待保存' : (savedExePath ? '已保存' : (exeFound ? '已找到，待保存' : '未设置'))}</div>
                <div style={mono}>运行状态：{runtime.running ? `运行中 PID=${runtime.pid ?? '-'}` : '未运行'}</div>
              </div>
              <button className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-black/85 px-4 py-3 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60" style={txt} disabled={runtimePending || (!runtime.running && !models.length)} onClick={() => void toggleRuntime().catch(err => notify(err?.message || '切换运行状态失败', 'error'))}>
                {runtimePending ? <Loader2 className="h-4 w-4 animate-spin" /> : (runtime.running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />)}
                {runtimePending ? '处理中...' : (runtime.running ? '停止桌宠' : '启动桌宠')}
              </button>
            </div>

            {!models.length ? (
              <div className="rounded-[12px] border border-amber-500/20 bg-amber-50/60 px-3 py-2 text-amber-900/80" style={{ ...txt, fontSize: 14 }}>
                当前还没有导入模型。展开下方设置面板后，先导入包含 `.moc` 或 `.moc3` 文件的模型文件夹。
              </div>
            ) : null}
            {!runtime.running ? (
              <div className="rounded-[12px] border border-emerald-500/20 bg-emerald-50/60 px-3 py-2 text-emerald-900/80" style={{ ...txt, fontSize: 14 }}>
                Electron 桌宠支持透明窗口、流畅渲染、AI 互动和鼠标视线跟随。启动前可以先在下方折叠面板里调整模型与窗口参数。
              </div>
            ) : null}

            {runtimeHint ? (
              <div className="rounded-[12px] border border-black/10 bg-white/40 px-3 py-2 text-black/65" style={{ ...txt, fontSize: 15 }}>
                {runtimeHint}
              </div>
            ) : null}
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-black/80" style={{ ...txt, fontSize: 28 }}>桌宠设置</h3>
              <p className="text-black/60" style={{ ...txt, fontSize: 14 }}>
                这里与桌宠程序共享同一份设置；若桌宠程序面板也修改了相同项，以桌宠程序面板内的结果为准。
              </p>
            </div>
            <button className={softButtonClass} style={txt} onClick={() => setCollapsed(value => !value)}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              {collapsed ? '展开设置' : '收起设置'}
            </button>
          </div>

          {!collapsed ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[12px] border border-black/10 bg-white/30 p-3 text-black/65" style={{ ...txt, fontSize: 14 }}>
                启动步骤：1. 导入模型文件夹。2. 选择模型。3. 根据需要调整缩放、窗口与人格设置。4. 回到上方点击“启动桌宠”。
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1 max-w-[360px]">
                  <CustomSelect
                    value={settings.model_id}
                    onChange={value => applyPatch({ model_id: value })}
                    options={(models.length ? models : [{ model_id: '', model_json_url: '', cover_url: '', expressions: [], motions: {} }]).map(model => ({ value: model.model_id, label: model.model_id || '暂无模型' }))}
                    placeholder="选择模型"
                    textStyle={txt}
                  />
                </div>
                <button className={softButtonClass} style={txt} onClick={() => importRef.current?.click()}>导入模型</button>
                <button className={softButtonClass} style={txt} onClick={() => coverRef.current?.click()}>上传封面</button>
                <button className={softButtonClass} style={txt} onClick={() => void handleDeleteModel().catch(err => notify(err?.message || '删除失败', 'error'))}>删除模型</button>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="flex h-[320px] items-center justify-center overflow-hidden rounded-[14px] border border-black/15 bg-white/25">
                  {selected?.cover_url ? (
                    <img src={selected.cover_url} className="max-h-full max-w-full object-contain" alt={selected.model_id} />
                  ) : (
                    <span className="text-black/45" style={txt}>当前模型暂无封面，上传封面后会显示在这里</span>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4"><span style={txt}>缩放</span><input type="range" min={0.2} max={2.5} step={0.05} value={settings.scale} onChange={event => applyPatch({ scale: Number(event.target.value) })} /></div>
                  <div className="flex items-center justify-between gap-4"><span style={txt}>透明度</span><input type="range" min={0.1} max={1} step={0.05} value={settings.opacity} onChange={event => applyPatch({ opacity: Number(event.target.value) })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      value={settings.expression}
                      onChange={value => applyPatch({ expression: value })}
                      options={[{ value: '', label: '默认表情' }, ...(selected?.expressions || []).map(expression => ({ value: expression.file, label: expression.name }))]}
                      placeholder="默认表情"
                      textStyle={txt}
                    />
                    <CustomSelect
                      value={settings.motion_group}
                      onChange={value => applyPatch({ motion_group: value, motion_index: 0 })}
                      options={[{ value: '', label: '默认动作组' }, ...motionGroups.map(group => ({ value: group, label: group }))]}
                      placeholder="默认动作组"
                      textStyle={txt}
                    />
                  </div>
                  <CustomSelect
                    value={String(settings.motion_index)}
                    onChange={value => applyPatch({ motion_index: Number(value) })}
                    options={(motions.length ? motions : [{ index: 0, file: '' }]).map(motion => ({ value: String(motion.index), label: `动作 ${motion.index}` }))}
                    placeholder="选择动作"
                    textStyle={txt}
                  />
                  <PositionPad position={settings.position} onChange={value => applyPatch({ position: value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={mono} type="number" value={settings.position.x} onChange={event => applyPatch({ position: { ...settings.position, x: Number(event.target.value) } })} />
                    <input className="rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={mono} type="number" value={settings.position.y} onChange={event => applyPatch({ position: { ...settings.position, y: Number(event.target.value) } })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span style={txt}>AI 文本互动</span><Toggle checked={settings.ai_enabled} onChange={value => applyPatch({ ai_enabled: value })} /></div>
                  <div className="flex items-center justify-between"><span style={txt}>同模型跨会话共享记忆</span><Toggle checked={settings.memory.share_between_sessions_same_model} onChange={value => applyPatch({ memory: { ...settings.memory, share_between_sessions_same_model: value } })} /></div>
                  <input className="w-full rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={txt} value={settings.persona.name} onChange={event => applyPatch({ persona: { ...settings.persona, name: event.target.value } })} placeholder="人格名称" />
                  <input className="w-full rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={txt} value={settings.persona.tone} onChange={event => applyPatch({ persona: { ...settings.persona, tone: event.target.value } })} placeholder="人格语气" />
                  <textarea className="w-full resize-y rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" rows={3} style={txt} value={settings.persona.system_prompt} onChange={event => applyPatch({ persona: { ...settings.persona, system_prompt: event.target.value } })} placeholder="人格系统设定" />
                  <textarea className="w-full resize-y rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" rows={2} style={txt} value={settings.persona.greeting} onChange={event => applyPatch({ persona: { ...settings.persona, greeting: event.target.value } })} placeholder="问候语" />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={mono} type="number" min={1} value={settings.memory.stage_management.memory_digest_interval_turns} onChange={event => applyPatch({
                      memory: {
                        ...settings.memory,
                        stage_management: {
                          ...settings.memory.stage_management,
                          memory_digest_interval_turns: parsePositiveInt(event.target.value, settings.memory.stage_management.memory_digest_interval_turns),
                        },
                      },
                    })} placeholder="记忆整理间隔" />
                    <input className="rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={mono} type="number" min={1} value={settings.memory.stage_management.impression_rebuild_interval_turns} onChange={event => applyPatch({
                      memory: {
                        ...settings.memory,
                        stage_management: {
                          ...settings.memory.stage_management,
                          impression_rebuild_interval_turns: parsePositiveInt(event.target.value, settings.memory.stage_management.impression_rebuild_interval_turns),
                        },
                      },
                    })} placeholder="印象重建间隔" />
                  </div>
                  <input className="w-full rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={mono} type="text" value={buildTurnsText} onChange={event => setBuildTurnsText(event.target.value)} onBlur={() => {
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
                  }} placeholder="印象构建回合，例如 30, 50, 100, 150" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span style={txt}>窗口始终置顶</span><Toggle checked={settings.window.always_on_top} onChange={value => applyPatch({ window: { ...settings.window, always_on_top: value } })} /></div>
                  <div className="flex items-center justify-between"><span style={txt}>透明背景</span><Toggle checked={settings.window.transparent} onChange={value => applyPatch({ window: { ...settings.window, transparent: value } })} /></div>
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-[8px] border border-black/25 bg-white/45 px-2 py-1" style={txt} value={chat} onChange={event => setChat(event.target.value)} placeholder="和桌宠说点什么" />
                    <button className="rounded-[8px] bg-black/80 px-3 py-1 text-white" style={txt} onClick={() => void fetch('/api/settings/live2d/chat', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ message: chat }),
                    }).then(res => res.json()).then(data => {
                      if (!data?.success) throw new Error(data?.detail || '聊天失败')
                      setReply(data.reply || '')
                    }).catch(err => notify(err?.message || '聊天失败', 'error'))}>发送</button>
                  </div>
                  <div className="min-h-[68px] whitespace-pre-wrap rounded-[8px] border border-black/20 bg-white/35 p-2 text-black/65" style={txt}>{reply || settings.persona.greeting}</div>
                  <div className="rounded-[8px] border border-black/15 bg-white/30 px-3 py-2 text-black/55" style={{ ...txt, fontSize: 14 }}>
                    阶段记忆策略已与桌宠面板和后端共享配置同步，修改这里会立即写回同一份桌宠设置。
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className={sectionClass}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h3 className="text-black/80" style={{ ...txt, fontSize: 28 }}>使用概览</h3>
                <p className="text-black/60" style={{ ...txt, fontSize: 14 }}>
                  统计按会话开始时间归档，支持最近 7 天、最近 4 周和最近 6 个月视图切换。
                </p>
              </div>
              <div className="inline-flex rounded-[12px] border border-black/10 bg-white/35 p-1">
                {([
                  { key: 'daily', label: '每日' },
                  { key: 'weekly', label: '每周' },
                  { key: 'monthly', label: '每月' },
                ] as Array<{ key: StatsView; label: string }>).map(item => (
                  <button key={item.key} type="button" className={`rounded-[10px] px-4 py-2 transition ${statsView === item.key ? 'bg-blue-500 text-white shadow-sm' : 'text-black/65 hover:bg-white/55'}`} style={txt} onClick={() => setStatsView(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {usageSummary.map(item => (
                <div key={item.label} className="rounded-[14px] border border-black/10 bg-white/32 px-4 py-3">
                  <div className="text-black/55" style={{ ...txt, fontSize: 14 }}>{item.label}</div>
                  <div className="mt-1 text-black/80" style={{ ...txt, fontSize: 24 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <BarChart data={chartData} />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="rounded-[12px] border border-black/10 bg-white/25 px-4 py-3 text-black/65" style={{ ...txt, fontSize: 14 }}>
                {statsView === 'daily' ? '每日视图展示最近 7 天使用时长。' : null}
                {statsView === 'weekly' ? '每周视图展示最近 4 个自然周的使用时长汇总。' : null}
                {statsView === 'monthly' ? '每月视图展示最近 6 个自然月的使用时长汇总。' : null}
              </div>
              <div className="rounded-[12px] border border-blue-500/15 bg-blue-50/55 px-4 py-3 text-blue-950/85" style={{ ...txt, fontSize: 14 }}>
                {currentSessionVisible ? `当前会话：${formatMinutes(usageStats?.current_session_minutes ?? 0)}` : '当前会话：桌宠未运行'}
              </div>
            </div>
          </div>
        </section>
      </div>
    </GlassCard>
  )
}




