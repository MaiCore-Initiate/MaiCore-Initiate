import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'

interface VersionInfo { name: string; display_name: string; type: string; [k: string]: any }
interface Instance {
  id: string; serial_number: string; nickname: string; bot_type: string
  version: string; qq_account: string; mai_path: string; mofox_path: string; neo_mofox_path: string
  is_published_template?: boolean; published_active?: boolean; deployment_flow_name?: string
  deployment_flow_sequence?: string; deployment_profile?: Record<string, any>
}
interface DeployProgress {
  task_id: string; step: number; total_steps: number; step_name: string
  status: string; message: string; logs: string[]
}

type SelectOption = { value: string; label: string; disabled?: boolean }
type DeployTab = 'deploy' | 'update' | 'delete' | 'flow'

interface PublishedFlowSummary {
  sequence: string
  template_id: string
  name: string
  version: string
  description: string
  author: string
  cover?: string | null
  published?: boolean
  invalid?: boolean
  invalid_reason?: string
  component_count?: number
  deployment_count?: number
  launch_count?: number
  config_count?: number
  uninstall_count?: number
}

interface TemplateFormField {
  key: string
  label: string
  field_type: 'text' | 'select' | 'boolean' | 'hidden'
  required?: boolean
  default?: any
  options?: Array<{ label: string; value: string }>
  description?: string
}

interface PublishedFlowDetail extends PublishedFlowSummary {
  form?: { fields?: TemplateFormField[] }
  components?: Array<Record<string, any>>
  deployments?: Array<Record<string, any>>
  launches?: Array<Record<string, any>>
  configs?: Array<Record<string, any>>
  uninstalls?: Array<Record<string, any>>
}

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 2 }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: 'var(--mc-text-secondary)' }
const pillShadowStyle = { border: '2px solid var(--mc-border-strong)', boxShadow: '2px 3px 6px var(--mc-shadow-soft)' }
const smallLabel = { fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }

function getTextDriftStyle(index: number, lane: 'title' | 'label' | 'value' | 'hint') {
  const cfg = lane === 'title'
    ? { delayStep: 75, duration: 560 }
    : lane === 'label'
      ? { delayStep: 68, duration: 500 }
      : lane === 'value'
        ? { delayStep: 48, duration: 320 }
        : { delayStep: 58, duration: 420 }
  return {
    animationDelay: `${index * cfg.delayStep}ms`,
    animationDuration: `${cfg.duration}ms`,
    animationFillMode: 'backwards' as const,
  }
}

function PillTab({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="h-[54px] px-[24px] rounded-[27px] cursor-pointer transition-all duration-300 shrink-0 relative"
      style={{ background: selected ? 'var(--mc-choice-selected-bg)' : 'transparent', border: '2px solid var(--mc-choice-selected-border)' }}>
      {selected && <div className="absolute inset-0 rounded-[27px] pointer-events-none" style={pillShadowStyle} />}
      <span style={btnFont}>{label}</span>
    </button>
  )
}

function normalizeVersionList(payload: any): VersionInfo[] {
  const list = Array.isArray(payload?.versions)
    ? payload.versions
    : Array.isArray(payload)
      ? payload
      : [
          ...(Array.isArray(payload?.releases) ? payload.releases : []),
          ...(Array.isArray(payload?.branches) ? payload.branches : []),
        ]

  const mapped = list
    .map((item: any): VersionInfo | null => {
      const rawName = item?.name ?? item?.tag_name
      const name = typeof rawName === 'string' ? rawName.trim() : ''
      if (!name) return null
      return {
        ...item,
        name,
        display_name: item?.display_name || item?.label || item?.title || name,
        type: item?.type || (item?.tag_name ? 'release' : 'branch'),
      } as VersionInfo
    })
    .filter((item: VersionInfo | null): item is VersionInfo => !!item)

  const seen = new Set<string>()
  return mapped.filter((item: VersionInfo) => {
    const key = `${item.type}:${item.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isVersionAtLeast(version: string, target: string): boolean {
  const parse = (value: string) => {
    const clean = value.trim().toLowerCase().replace(/^v/, '').split('-')[0]
    const parts = clean.split('.').map(part => Number.parseInt(part, 10))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  const left = parse(version)
  const right = parse(target)
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return true
    if (left[i] < right[i]) return false
  }
  return true
}

function hasBuiltinWebUI(version: string): boolean {
  const clean = version.trim().toLowerCase()
  return clean.includes('main') || clean.includes('dev') || isVersionAtLeast(clean, '0.12.2')
}

function usesPluginAdapter(version: string): boolean {
  const clean = version.trim().toLowerCase()
  return clean === 'main' || clean === 'dev' || clean === 'master' || isVersionAtLeast(clean, '1.0.0')
}

function CustomSelect({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void
  options: SelectOption[]; placeholder?: string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 240 })
  const displayOptions = options.length > 0 ? options : [{ value: '__empty__', label: '暂无可用选项', disabled: true }]
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      const dropUp = spaceBelow < 150 && spaceAbove > spaceBelow
      const maxH = Math.min(240, dropUp ? spaceAbove : spaceBelow)
      setPos({ top: dropUp ? r.top - Math.max(maxH, 60) - 4 : r.bottom + 4, left: r.left, width: r.width, maxH: Math.max(maxH, 60) })
    }
  }, [open])
  const sel = options.find(o => o.value === value)
  return (
    <div ref={ref} className="relative">
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => !disabled && setOpen(v => !v)}
        className="w-full h-[54px] px-[22px] rounded-[27px] flex items-center justify-between cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ ...monoFont, fontSize: 22, background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
        <span style={{ color: sel ? 'var(--mc-text-primary)' : 'var(--mc-text-faint)' }}>{sel?.label || placeholder || '请选择'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="var(--mc-icon-stroke)" strokeWidth="2.5" strokeLinecap="round" /></svg>
      </button>
      {open && createPortal(
        <div className="fixed rounded-[20px] backdrop-blur-xl overflow-y-auto custom-scrollbar"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH, zIndex: 9999, boxShadow: '4px 4px 12px var(--mc-shadow-soft)', background: 'var(--mc-panel-bg-strong)', border: '2px solid var(--mc-border-soft)' }}
          onMouseDown={e => e.stopPropagation()}>
          {displayOptions.map(o => (
            <button key={o.value} type="button" disabled={o.disabled} onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false) }}
              className="w-full px-[22px] py-[10px] text-left transition-colors cursor-pointer disabled:cursor-default"
              style={{ ...monoFont, fontSize: 20, color: o.disabled ? 'var(--mc-text-faint)' : 'var(--mc-text-primary)', background: o.value === value ? 'var(--mc-choice-selected-bg)' : 'transparent' }}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className="h-[54px] px-[22px] rounded-[27px] outline-none disabled:opacity-40"
        style={{ ...monoFont, fontSize: 22, background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)', color: 'var(--mc-text-primary)' }} />
    </div>
  )
}

/* ─── WebSocket 进度 Hook ─── */
function useDeployProgress(taskId: string | null): DeployProgress | null {
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!taskId) { setProgress(null); return }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'deployment_progress' }))
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'deployment_progress' && msg.data?.task_id === taskId) {
          setProgress(msg.data as DeployProgress)
        }
      } catch {}
    }
    ws.onclose = () => {}
    return () => { ws.close(); wsRef.current = null }
  }, [taskId])

  return progress
}

/* ─── 进度面板 ─── */
function ProgressPanel({ taskId, onDone }: { taskId: string; onDone?: () => void }) {
  const progress = useDeployProgress(taskId)
  const [fallback, setFallback] = useState<DeployProgress | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [stepStatuses, setStepStatuses] = useState<Record<number, string>>({})

  useEffect(() => {
    setStepStatuses({})
  }, [taskId])

  // 轮询备用
  useEffect(() => {
    const iv = setInterval(() => {
      fetch(`/api/deploy/progress/${taskId}`, { credentials: 'include' })
        .then(r => r.json()).then(d => { if (d.success !== false) setFallback(d) }).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [taskId])

  const p = progress || fallback
  const done = p?.status === 'completed' || p?.status === 'failed'

  useEffect(() => {
    if (!p?.step) return
    setStepStatuses(prev => {
      const current = prev[p.step]
      const next = p.status
      const priority = (status?: string) => {
        if (status === 'failed') return 4
        if (status === 'warning') return 3
        if (status === 'completed') return 2
        if (status === 'running') return 1
        return 0
      }
      if (priority(current) >= priority(next)) return prev
      return { ...prev, [p.step]: next }
    })
  }, [p?.step, p?.status])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [p?.logs])

  const isUpdateTask = taskId.startsWith('update_')
  const deployStepNames = ['安装本体', '安装适配器', '安装NapCat', 'WebUI配置', 'Python环境', '配置文件']
  const updateStepNames = ['准备更新', '创建备份', '更新代码', '更新依赖', '恢复数据', '更新配置']
  const stepNames = isUpdateTask ? updateStepNames : deployStepNames
  const totalSteps = p?.total_steps || stepNames.length
  const pct = p ? Math.round((p.step / Math.max(1, totalSteps)) * 100) : 0
  const panelTitle = done
    ? (p?.status === 'completed' ? (isUpdateTask ? '更新完成' : '部署完成') : (isUpdateTask ? '更新失败' : '部署失败'))
    : (isUpdateTask ? '更新进行中' : '部署进行中')

  return (
    <div className="flex flex-col gap-[16px] animate-fade-slide-up">
      <h2 style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>{panelTitle}</h2>

      {/* 步骤指示器 */}
      <div className="flex gap-[8px] items-center flex-wrap">
        {stepNames.map((name, i) => {
          const step = i + 1
          const isCurrent = p?.step === step && p?.status === 'running'
          const recordedStatus = stepStatuses[step]
          const isDone = recordedStatus === 'completed' || (!recordedStatus && !!p && p.step > step)
          const isWarning = recordedStatus === 'warning'
          const isFailed = recordedStatus === 'failed'
          const bg = isFailed
            ? '#ef4444'
            : isWarning
              ? '#f59e0b'
              : isDone
                ? '#22c55e'
                : isCurrent
                  ? '#3b82f6'
                  : 'var(--mc-control-solid)'
          return (
            <div key={i} className="flex items-center gap-[4px]">
              <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-sm font-bold transition-all"
                style={{ background: bg, fontSize: 14 }}>
                {isFailed ? '×' : isWarning ? '!' : isDone ? '✓' : step}
              </div>
              <span style={{ ...monoFont, fontSize: 16, color: isCurrent ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }}>{name}</span>
              {i < stepNames.length - 1 && <div className="w-[20px] h-[2px] mx-[2px]" style={{ background: 'var(--mc-border-soft)' }} />}
            </div>
          )
        })}
      </div>

      {/* 进度条 */}
      <div className="h-[12px] rounded-full overflow-hidden" style={{ background: 'var(--mc-control-bg-soft)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: p?.status === 'failed' ? '#ef4444' : '#22c55e' }} />
      </div>
      <span style={{ ...monoFont, fontSize: 18, color: 'var(--mc-text-secondary)' }}>{p?.message || '等待中...'}</span>

      {/* 日志面板 */}
      <button onClick={() => setLogsOpen(!logsOpen)} className="self-start cursor-pointer" style={{ ...smallLabel, color: 'var(--mc-text-secondary)' }}>
        {logsOpen ? '▼ 收起日志' : '▶ 展开日志'}
      </button>
      {logsOpen && (
        <div ref={logRef} className="h-[305px] overflow-y-auto rounded-[16px] p-[16px] custom-scrollbar" style={{ background: 'var(--mc-panel-bg-soft)', border: '1px solid var(--mc-border-soft)' }}>
          {(p?.logs || []).map((l, i) => <div key={i} style={{ ...monoFont, fontSize: 14, color: 'var(--mc-text-secondary)' }}>{l}</div>)}
        </div>
      )}

      {done && onDone && (
        <button onClick={onDone} className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{ background: p?.status === 'completed' ? 'rgba(74,222,128,0.3)' : 'rgba(255,100,100,0.3)', border: '2px solid var(--mc-border-strong)' }}>
          <span style={smallLabel}>{p?.status === 'completed' ? '完成' : '返回'}</span>
        </button>
      )}
    </div>
  )
}

/* ─── 子标签页1：部署新实例（向导式分步表单） ─── */
function DeployNewTab() {
  const { notify } = useNotification()
  const [step, setStep] = useState(1)
  const [taskId, setTaskId] = useState<string | null>(null)

  // Step 1
  const [botType, setBotType] = useState('')
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [nickname, setNickname] = useState('')
  const [qqAccount, setQqAccount] = useState('')
  const [installDir, setInstallDir] = useState('')
  const [versionsLoading, setVersionsLoading] = useState(false)

  // Step 2
  const [installAdapter, setInstallAdapter] = useState(false)
  const [installNapcat, setInstallNapcat] = useState(false)
  const [installMongodb, setInstallMongodb] = useState(false)
  const [napcatVersions, setNapcatVersions] = useState<any[]>([])
  const [selectedNapcatVer, setSelectedNapcatVer] = useState('')

  // 加载版本
  useEffect(() => {
    if (!botType) { setVersions([]); setSelectedVersion(''); return }
    setVersionsLoading(true)
    fetch(`/api/deploy/versions/${botType}`, { credentials: 'include' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.detail || '获取版本列表失败')
        const next = normalizeVersionList(d)
        setVersions(next)
        if (!next.length) notify('未获取到可用版本，请检查 GitHub 连接或后端日志', 'error')
      })
      .catch((err: any) => { setVersions([]); notify(err?.message || '获取版本列表失败', 'error') })
      .finally(() => setVersionsLoading(false))
  }, [botType])

  // 加载NapCat版本
  useEffect(() => {
    if (!installNapcat) return
    fetch('/api/deploy/napcat/versions', { credentials: 'include' })
      .then(r => r.json()).then(d => setNapcatVersions(d.versions || []))
      .catch(() => {})
  }, [installNapcat])

  const versionObj = versions.find(v => v.name === selectedVersion)
  const napcatObj = napcatVersions.find(v => v.name === selectedNapcatVer || v.tag_name === selectedNapcatVer)
  const selectedVersionName = versionObj?.name || selectedVersion
  const adapterAsPlugin = botType === 'MaiBot' && usesPluginAdapter(selectedVersionName)
  const webuiBuiltIn = botType !== 'MaiBot' || hasBuiltinWebUI(selectedVersionName)

  const canStep2 = botType && selectedVersion && nickname && installDir
  const serialNumber = nickname // 简化：用昵称作为序列号
  const shouldInstallAdapter = botType === 'MaiBot' ? installAdapter : false
  const shouldInstallWebUI = webuiBuiltIn

  const handleDeploy = async () => {
    try {
      const res = await fetch('/api/deploy/instances', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_type: botType, version: versionObj, install_adapter: shouldInstallAdapter,
          install_napcat: installNapcat, napcat_version: napcatObj || null,
          install_mongodb: installMongodb, install_webui: shouldInstallWebUI,
          install_mofox_admin_ui: false, install_mofox_webui: false,
          install_dir: installDir, nickname, qq_account: qqAccount,
          serial_number: serialNumber,
        })
      })
      const d = await res.json()
      if (d.task_id) { setTaskId(d.task_id); setStep(4) }
      else notify(d.detail || '部署启动失败', 'error')
    } catch { notify('请求失败', 'error') }
  }

  const reset = () => { setStep(1); setTaskId(null); setBotType(''); setSelectedVersion(''); setNickname(''); setQqAccount(''); setInstallDir(''); setInstallAdapter(false); setInstallNapcat(false); setInstallMongodb(false); setSelectedNapcatVer('') }

  const d = (i: number) => ({ animationDelay: `${i * 60}ms` })

  if (step === 4 && taskId) {
    return <ProgressPanel taskId={taskId} onDone={reset} />
  }

  return (
    <div className="flex flex-col gap-[20px] h-full min-h-0 overflow-y-auto custom-scrollbar pr-[4px]">
      {/* 步骤指示 */}
      <div className="flex gap-[12px] items-center animate-fade-slide-up" style={d(0)}>
        {['基础配置', '组件选择', '确认部署'].map((name, i) => (
          <div key={i} className="flex items-center gap-[6px]">
            <div className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: step > i + 1 ? '#22c55e' : step === i + 1 ? '#3b82f6' : 'var(--mc-control-solid)', fontSize: 16 }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span style={{ ...smallLabel, color: step === i + 1 ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }}>{name}</span>
            {i < 2 && <div className="w-[30px] h-[2px]" style={{ background: 'var(--mc-border-soft)' }} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-[16px]">
          <div className="grid grid-cols-2 gap-[16px] animate-fade-slide-up" style={d(1)}>
            <div className="flex flex-col gap-[6px]">
              <span style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>Bot 类型</span>
              <CustomSelect value={botType} onChange={v => { setBotType(v); setSelectedVersion('') }}
                options={[
                  { value: 'MaiBot', label: 'MaiBot' },
                  { value: 'MoFox-Core', label: 'MoFox-Core' },
                  { value: 'Neo-MoFox', label: 'Neo-MoFox' }
                ]} placeholder="选择Bot类型" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <span style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>版本</span>
              {versionsLoading ? (
                <div className="w-full h-[54px] px-[22px] rounded-[27px] flex items-center gap-[10px]" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
                  <span style={{ ...monoFont, fontSize: 22, color: 'var(--mc-text-faint)' }}>正在获取版本列表...</span>
                </div>
              ) : (
                <CustomSelect value={selectedVersion} onChange={setSelectedVersion} disabled={!botType}
                  options={versions.map(v => ({ value: v.name, label: v.display_name || v.name }))} placeholder="选择版本" />
              )}
              {!versionsLoading && !!botType && versions.length === 0 && (
                <span style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-muted)' }}>当前未获取到版本列表，点击下拉可查看空状态提示</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[16px] animate-fade-slide-up" style={d(2)}>
            <InputField label="实例昵称" value={nickname} onChange={setNickname} placeholder="例如: my_bot" />
            <InputField label="QQ 账号（可选）" value={qqAccount} onChange={setQqAccount} placeholder="留空跳过" />
          </div>
          <div className="animate-fade-slide-up" style={d(3)}>
            <InputField label="安装目录" value={installDir} onChange={setInstallDir} placeholder="例如: D:\instances" />
          </div>
          <div className="animate-fade-slide-up" style={d(4)}>
            <button disabled={!canStep2} onClick={() => setStep(2)}
              className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>下一步</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>组件选择</h3>
          <div className="flex flex-col gap-[12px]">
            {botType === 'MaiBot' && <ToggleItem label={adapterAsPlugin ? '适配器插件' : '适配器'} checked={installAdapter} onChange={setInstallAdapter} />}
            <ToggleItem label="NapCat" checked={installNapcat} onChange={setInstallNapcat} />
            {installNapcat && (
              <div className="ml-[40px]">
                <CustomSelect value={selectedNapcatVer} onChange={setSelectedNapcatVer}
                  options={napcatVersions.map(v => ({ value: v.name || v.tag_name, label: v.name || v.tag_name }))} placeholder="选择NapCat版本" />
              </div>
            )}
            {botType === 'MaiBot' && <ToggleItem label="MongoDB" checked={installMongodb} onChange={setInstallMongodb} />}
            <div className="ml-[56px]">
              <span style={{ ...monoFont, fontSize: 18, color: 'var(--mc-text-muted)' }}>
                {webuiBuiltIn ? 'WebUI 已内置，无需单独勾选' : '当前版本未内置 WebUI，将跳过 WebUI 部署'}
              </span>
            </div>
          </div>
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(1)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button onClick={() => setStep(3)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>下一步</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>确认部署配置</h3>
          <div className="rounded-[20px] p-[20px] flex flex-col gap-[6px]" style={{ background: 'var(--mc-panel-bg-soft)', border: '1px solid var(--mc-border-soft)' }}>
            {([
              ['Bot 类型', botType], ['版本', versionObj?.display_name || selectedVersion],
              ['实例昵称', nickname], ['安装目录', installDir],
              ...(qqAccount ? [['QQ 账号', qqAccount]] : []),
              ['适配器', botType === 'MaiBot' ? (installAdapter ? (adapterAsPlugin ? '插件适配器' : '外置适配器') : '不安装') : '内置适配器'],
              ['NapCat', installNapcat ? (selectedNapcatVer || '是') : '否'],
              ...(botType === 'MaiBot' ? [['MongoDB', installMongodb ? '是' : '否']] : []),
              ['WebUI', shouldInstallWebUI ? '内置' : '跳过'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex gap-[16px]">
                <span className="shrink-0 w-[120px]" style={{ ...labelFont, color: 'var(--mc-text-primary)' }}>{k}</span>
                <span style={valueFont}>{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(2)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button onClick={handleDeploy} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>开始部署</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-[12px] cursor-pointer">
      <div className="w-[44px] h-[26px] rounded-full transition-all duration-200 relative"
        style={{ background: checked ? '#22c55e' : 'var(--mc-control-solid)' }}>
        <div className="absolute top-[3px] w-[20px] h-[20px] rounded-full transition-all duration-200 shadow"
          style={{ left: checked ? 21 : 3, background: 'var(--mc-panel-bg-strong)' }} />
      </div>
      <span style={smallLabel}>{label}</span>
    </button>
  )
}

function FormFieldInput({ field, value, onChange, disabled }: {
  field: TemplateFormField
  value: any
  onChange: (value: any) => void
  disabled?: boolean
}) {
  if (field.field_type === 'hidden') return null
  if (field.field_type === 'boolean') {
    return (
      <div className="flex flex-col gap-[4px]">
        <ToggleItem label={field.label} checked={Boolean(value)} onChange={onChange} />
        {field.description && <span style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-muted)' }}>{field.description}</span>}
      </div>
    )
  }
  if (field.field_type === 'select') {
    return (
      <div className="flex flex-col gap-[6px]">
        <span style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>{field.label}{field.required ? ' *' : ''}</span>
        <CustomSelect
          value={String(value ?? '')}
          onChange={onChange}
          disabled={disabled}
          options={(field.options ?? []).map(option => ({ value: String(option.value), label: option.label || String(option.value) }))}
          placeholder="请选择"
        />
        {field.description && <span style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-muted)' }}>{field.description}</span>}
      </div>
    )
  }
  return (
    <InputField
      label={`${field.label}${field.required ? ' *' : ''}`}
      value={String(value ?? '')}
      onChange={onChange}
      placeholder={field.description || field.label}
      disabled={disabled}
    />
  )
}

function buildInitialInputs(fields: TemplateFormField[]) {
  const values: Record<string, any> = {}
  fields.forEach(field => {
    if (field.default !== undefined && field.default !== null) values[field.key] = field.default
    else if (field.field_type === 'boolean') values[field.key] = false
    else values[field.key] = ''
  })
  return values
}

function flowCoverUrl(flow: PublishedFlowSummary | PublishedFlowDetail) {
  return flow.cover ? `/api/template-workbench/projects/${encodeURIComponent(flow.sequence)}/cover` : ''
}

function isDeploymentSetupField(field: TemplateFormField) {
  const key = String(field.key || '')
  if (field.field_type === 'hidden') return false
  if (key.startsWith('component::')) return false
  if (key.startsWith('launch::') || key.startsWith('config::') || key.startsWith('uninstall::')) return false
  if (/^(path|version|link)::(launch|config|uninstall)::/.test(key)) return false
  return true
}

function DeploymentFlowTab() {
  const { notify } = useNotification()
  const [flows, setFlows] = useState<PublishedFlowSummary[]>([])
  const [detail, setDetail] = useState<PublishedFlowDetail | null>(null)
  const [inputs, setInputs] = useState<Record<string, any>>({})
  const [step, setStep] = useState(1)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  const allFields = detail?.form?.fields ?? []
  const componentFields = allFields.filter(field => field.key.startsWith('component::'))
  const infoFields = allFields.filter(isDeploymentSetupField)
  const forcedComponents = (detail?.components ?? []).filter(component => !component.choose)
  const selectableComponentIds = new Set(componentFields.map(field => field.key.replace(/^component::/, '')))

  useEffect(() => {
    setLoading(true)
    fetch('/api/deployment-mod/published', { credentials: 'include' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.success === false) throw new Error(data.detail || '读取部署流失败')
        setFlows(data.templates ?? [])
      })
      .catch((err: any) => notify(err?.message || '读取部署流失败', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const loadDetail = async (sequence: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/deployment-mod/published/${encodeURIComponent(sequence)}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) throw new Error(data.detail || '读取部署流详情失败')
      const nextDetail = data.template as PublishedFlowDetail
      setDetail(nextDetail)
      const nextInputs = buildInitialInputs(nextDetail.form?.fields ?? [])
      nextInputs.nickname = nextInputs.nickname || ''
      nextInputs.serial_number = nextInputs.serial_number || ''
      setInputs(nextInputs)
      setStep(2)
    } catch (err: any) {
      notify(err?.message || '读取部署流详情失败', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const setInputValue = (key: string, value: any) => {
    setInputs(prev => ({ ...prev, [key]: value }))
  }

  const canContinueInfo = infoFields.every(field => {
    if (!field.required) return true
    const value = inputs[field.key]
    return value !== undefined && value !== null && String(value).trim() !== ''
  })

  const handleDeploy = async () => {
    if (!detail) return
    try {
      const res = await fetch(`/api/deployment-mod/published/${encodeURIComponent(detail.sequence)}/deploy`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_inputs: inputs }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '部署流启动失败')
      setTaskId(data.task_id)
      setStep(4)
    } catch (err: any) {
      notify(err?.message || '部署流启动失败', 'error')
    }
  }

  const reset = () => {
    setDetail(null)
    setInputs({})
    setStep(1)
    setTaskId(null)
  }

  if (step === 4 && taskId) {
    return <ProgressPanel taskId={taskId} onDone={reset} />
  }

  return (
    <div className="flex flex-col gap-[18px] h-full min-h-0 overflow-y-auto custom-scrollbar pr-[4px]">
      <div className="flex gap-[12px] items-center animate-fade-slide-up">
        {['选择部署流', '信息输入', '组件选择', '执行结果'].map((name, index) => (
          <div key={name} className="flex items-center gap-[6px]">
            <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: step > index + 1 ? '#22c55e' : step === index + 1 ? '#3b82f6' : 'var(--mc-control-solid)', fontSize: 15 }}>
              {step > index + 1 ? '✓' : index + 1}
            </div>
            <span style={{ ...smallLabel, color: step === index + 1 ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }}>{name}</span>
            {index < 3 && <div className="w-[24px] h-[2px]" style={{ background: 'var(--mc-border-soft)' }} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-[16px]">
          {loading ? (
            <div className="col-span-full flex items-center gap-[10px] h-[100px] justify-center">
              <div className="w-[22px] h-[22px] rounded-full animate-spin" style={{ border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
              <span style={{ ...monoFont, color: 'var(--mc-text-faint)' }}>正在加载部署流...</span>
            </div>
          ) : flows.length === 0 ? (
            <div className="col-span-full rounded-[20px] border-3 border-dashed p-[40px] text-center" style={{ borderColor: 'var(--mc-empty-border)' }}>
              <span style={{ ...monoFont, color: 'var(--mc-empty-text)' }}>暂无已发布部署流</span>
            </div>
          ) : flows.map((flow, index) => {
            const cover = flowCoverUrl(flow)
            return (
              <button
                key={flow.sequence}
                type="button"
                disabled={Boolean(flow.invalid) || detailLoading}
                onClick={() => void loadDetail(flow.sequence)}
                className="min-h-[190px] rounded-[18px] overflow-hidden text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed animate-fade-slide-up transition-transform hover:scale-[1.01] active:scale-[0.99]"
                style={{ animationDelay: `${index * 50}ms`, background: 'var(--mc-panel-bg-soft)', border: '2px solid var(--mc-border-soft)' }}
              >
                <div className="h-[88px] bg-cover bg-center flex items-center justify-center" style={{ backgroundImage: cover ? `url("${cover}")` : undefined, backgroundColor: 'var(--mc-control-bg-soft)' }}>
                  {!cover && <span style={{ ...sectionTitle, color: 'var(--mc-text-faint)' }}>MOD</span>}
                </div>
                <div className="p-[14px] flex flex-col gap-[4px]">
                  <span className="truncate" style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>{flow.name || flow.template_id}</span>
                  <span style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-secondary)' }}>版本：{flow.version || '-'}</span>
                  <span className="line-clamp-2" style={{ ...monoFont, fontSize: 15, color: flow.invalid ? '#dc2626' : 'var(--mc-text-muted)' }}>
                    {flow.invalid ? flow.invalid_reason : (flow.description || '无描述')}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {step === 2 && detail && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>{detail.name}</h3>
          <div className="grid grid-cols-2 gap-[16px]">
            {infoFields.map(field => (
              <FormFieldInput key={field.key} field={field} value={inputs[field.key]} onChange={value => setInputValue(field.key, value)} />
            ))}
          </div>
          {infoFields.length === 0 && (
            <span style={{ ...monoFont, color: 'var(--mc-text-muted)' }}>该部署流不需要额外信息。</span>
          )}
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(1)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button disabled={!canContinueInfo} onClick={() => setStep(3)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>下一步</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && detail && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>组件选择</h3>
          {componentFields.length > 0 ? (
            <div className="flex flex-col gap-[10px]">
              {componentFields.map(field => (
                <FormFieldInput key={field.key} field={field} value={inputs[field.key]} onChange={value => setInputValue(field.key, value)} />
              ))}
            </div>
          ) : (
            <span style={{ ...monoFont, color: 'var(--mc-text-muted)' }}>该部署流没有用户可选组件。</span>
          )}
          {forcedComponents.length > 0 && (
            <div className="rounded-[16px] p-[16px]" style={{ background: 'var(--mc-panel-bg-soft)', border: '1px solid var(--mc-border-soft)' }}>
              <span style={{ ...smallLabel, color: 'var(--mc-text-primary)' }}>强制安装或检查的组件</span>
              <div className="mt-[8px] flex flex-wrap gap-[8px]">
                {forcedComponents.map(component => (
                  <span key={String(component.id || component.name)} className="rounded-[12px] px-[12px] py-[4px]" style={{ ...monoFont, fontSize: 16, background: 'var(--mc-control-bg-soft)', color: 'var(--mc-text-secondary)', border: '1px solid var(--mc-border-soft)' }}>
                    {String(component.name || component.id)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(detail.components ?? []).filter(component => component.choose && !selectableComponentIds.has(String(component.id))).length > 0 && (
            <span style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-muted)' }}>部分可选组件不是安装项，已按模板默认逻辑处理。</span>
          )}
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(2)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button onClick={handleDeploy} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer" style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid var(--mc-border-strong)' }}>
              <span style={smallLabel}>开始部署</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 子标签页2：更新实例 ─── */
function UpdateTab() {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [newVersion, setNewVersion] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [versionsLoading, setVersionsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json()).then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([id, cfg]: [string, any]) => ({
          id, serial_number: cfg.serial_number || '', nickname: cfg.nickname || cfg.serial_number || '',
          bot_type: cfg.bot_type || 'MaiBot', version: cfg.version || '', qq_account: cfg.qq_account || '',
          mai_path: cfg.mai_path || '', mofox_path: cfg.mofox_path || '', neo_mofox_path: cfg.neo_mofox_path || '',
        }))
        setInstances(list)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const inst = instances.find(i => i.serial_number === selected)

  useEffect(() => {
    if (!inst) { setVersions([]); setNewVersion(''); return }
    setVersionsLoading(true)
    fetch(`/api/deploy/versions/${inst.bot_type}`, { credentials: 'include' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.detail || '获取版本列表失败')
        const next = normalizeVersionList(d)
        setVersions(next)
        if (!next.length) notify('未获取到可用版本，请检查 GitHub 连接或后端日志', 'error')
      })
      .catch((err: any) => { setVersions([]); notify(err?.message || '获取版本列表失败', 'error') })
      .finally(() => setVersionsLoading(false))
  }, [inst?.bot_type])

  const handleUpdate = async () => {
    if (!inst || !newVersion) return
    const vObj = versions.find(v => v.name === newVersion)
    try {
      const res = await fetch('/api/deploy/execute-update', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: inst.serial_number, new_version: vObj })
      })
      const d = await res.json()
      if (d.task_id) setTaskId(d.task_id)
      else notify(d.detail || '更新启动失败', 'error')
    } catch { notify('请求失败', 'error') }
  }

  if (taskId) return <ProgressPanel taskId={taskId} onDone={() => setTaskId(null)} />

  const filtered = instances.filter(i => !search || i.nickname.toLowerCase().includes(search.toLowerCase()) || i.serial_number.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex gap-[24px] flex-1 min-h-0 overflow-hidden">
      <div className="w-[380px] h-full min-h-0 shrink-0">
        <GlassCard>
          <div className="p-[24px] flex flex-col h-full">
            <h2 className="pb-[12px]" style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>选择实例</h2>
            <div className="flex items-center h-[54px] px-[22px] gap-[12px] rounded-[27px] shrink-0" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9.5" cy="9.5" r="7.5" stroke="var(--mc-icon-stroke)" strokeWidth="3" /><line x1="15" y1="15.5" x2="22" y2="23" stroke="var(--mc-icon-stroke)" strokeWidth="3" strokeLinecap="round" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索实例"
                className="flex-1 bg-transparent outline-none" style={{ ...monoFont, fontSize: 22, color: 'var(--mc-text-primary)' }} />
            </div>
            <div className="flex-1 overflow-y-auto mt-[12px] custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-[100px] gap-[10px] animate-fade-in">
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
                  <span style={{ ...monoFont, color: 'var(--mc-text-faint)' }}>正在加载实例列表...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-[100px] rounded-[20px] border-3 border-dashed animate-fade-in" style={{ borderColor: 'var(--mc-empty-border)' }}>
                  <span style={{ ...monoFont, color: 'var(--mc-empty-text)' }}>无实例</span>
                </div>
              ) : filtered.map((i, idx) => (
                <button key={i.serial_number} onClick={() => setSelected(i.serial_number)}
                  className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden animate-fade-slide-up"
                  style={{ height: 48, padding: i.serial_number === selected ? '0 20px' : '0 4px', borderRadius: i.serial_number === selected ? 24 : 6,
                    background: i.serial_number === selected ? 'var(--mc-choice-selected-bg)' : 'transparent',
                    border: i.serial_number === selected ? '2px solid var(--mc-choice-selected-border)' : '2px solid transparent',
                    animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}>
                  <span className="truncate" style={{ ...monoFont, fontSize: 22 }}>{i.nickname}|{i.serial_number}</span>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="flex-1 min-w-0 h-full min-h-0">
        {inst ? (
          <GlassCard key={`update-${inst.serial_number}`}>
            <div className="p-[28px] flex flex-col gap-[16px]">
              <h2 className="animate-fade-slide-up" style={{ ...sectionTitle, ...getTextDriftStyle(0, 'title'), color: 'var(--mc-text-primary)' }}>更新实例</h2>
              <div className="flex flex-col gap-[6px]">
                {([['实例昵称', inst.nickname], ['序列号', inst.serial_number], ['Bot 类型', inst.bot_type], ['当前版本', inst.version]] as [string, string][]).map(([k, v], idx) => (
                  <div key={k} className="flex gap-[16px]">
                    <span className="shrink-0 animate-fade-slide-up" style={{ ...labelFont, ...getTextDriftStyle(idx + 1, 'label'), color: 'var(--mc-text-primary)' }}>{k}</span>
                    <span className="animate-fade-slide-up" style={{ ...valueFont, ...getTextDriftStyle(idx + 1, 'value') }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-[6px]">
                <span className="animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(6, 'label'), color: 'var(--mc-text-primary)' }}>新版本</span>
                {versionsLoading ? (
                  <div className="w-full h-[54px] px-[22px] rounded-[27px] flex items-center gap-[10px]" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
                    <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
                    <span className="animate-fade-slide-up" style={{ ...monoFont, fontSize: 22, ...getTextDriftStyle(7, 'hint'), color: 'var(--mc-text-faint)' }}>正在获取版本列表...</span>
                  </div>
                ) : (
                  <CustomSelect value={newVersion} onChange={setNewVersion}
                    options={versions.map(v => ({ value: v.name, label: v.display_name || v.name }))} placeholder="选择新版本" />
                )}
                {!versionsLoading && versions.length === 0 && (
                  <span className="animate-fade-slide-up" style={{ ...monoFont, fontSize: 16, ...getTextDriftStyle(7, 'hint'), color: 'var(--mc-text-muted)' }}>当前未获取到版本列表，点击下拉可查看空状态提示</span>
                )}
              </div>
              <button disabled={!newVersion} onClick={handleUpdate}
                className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(96,165,250,0.3)', border: '2px solid var(--mc-border-strong)' }}>
                <span className="animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(8, 'value') }}>开始更新</span>
              </button>
            </div>
          </GlassCard>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", color: 'var(--mc-text-faint)' }}>请选择一个实例</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 子标签页3：删除实例 ─── */
function DeleteTab() {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [taskId, setTaskId] = useState<string | null>(null)

  const reload = () => {
    setLoading(true)
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json()).then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([id, cfg]: [string, any]) => ({
          id, serial_number: cfg.serial_number || '', nickname: cfg.nickname || cfg.serial_number || '',
          bot_type: cfg.bot_type || 'MaiBot', version: cfg.version || '', qq_account: cfg.qq_account || '',
          mai_path: cfg.mai_path || '', mofox_path: cfg.mofox_path || '', neo_mofox_path: cfg.neo_mofox_path || '',
          is_published_template: Boolean(cfg.is_published_template),
          published_active: cfg.published_active !== false,
          deployment_flow_name: cfg.deployment_flow_name || '',
          deployment_flow_sequence: cfg.deployment_flow_sequence || '',
          deployment_profile: cfg.deployment_profile || {},
        }))
        setInstances(list); setSelected(null); setConfirmName('')
      }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const inst = instances.find(i => i.serial_number === selected)

  const handleDelete = async () => {
    if (!inst || confirmName !== inst.nickname) { notify('昵称不匹配', 'error'); return }
    if (inst.is_published_template && inst.published_active === false) {
      notify('该实例所属部署流已取消发布，不能删除', 'error')
      return
    }
    setDeleting(true)
    try {
      const isFlowInstance = Boolean(inst.is_published_template)
      const res = await fetch(isFlowInstance ? `/api/deployment-mod/instances/${encodeURIComponent(inst.serial_number)}/stage` : `/api/deploy/instances/${inst.serial_number}/confirm-delete`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFlowInstance ? { stage: 'uninstall', user_inputs: {} } : { serial_number: inst.serial_number, confirm_nickname: confirmName, backup: true })
      })
      const d = await res.json()
      if (isFlowInstance && d.task_id) {
        setTaskId(d.task_id)
        notify('卸载任务已启动', 'success')
      } else if (d.success) {
        const msg = d.backup_path ? `删除成功，备份位置：${d.backup_path}` : (d.message || '删除成功')
        notify(msg, 'success')
        reload()
      }
      else notify(d.detail || d.message || '删除失败', 'error')
    } catch { notify('请求失败', 'error') }
    setDeleting(false)
  }

  const filtered = instances.filter(i => !search || i.nickname.toLowerCase().includes(search.toLowerCase()) || i.serial_number.toLowerCase().includes(search.toLowerCase()))

  if (taskId) return <ProgressPanel taskId={taskId} onDone={() => { setTaskId(null); reload() }} />

  return (
    <div className="flex gap-[24px] flex-1 min-h-0 overflow-hidden">
      <div className="w-[380px] h-full min-h-0 shrink-0">
        <GlassCard>
          <div className="p-[24px] flex flex-col h-full">
            <h2 className="pb-[12px]" style={{ ...sectionTitle, color: 'var(--mc-text-primary)' }}>选择实例</h2>
            <div className="flex items-center h-[54px] px-[22px] gap-[12px] rounded-[27px] shrink-0" style={{ background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9.5" cy="9.5" r="7.5" stroke="var(--mc-icon-stroke)" strokeWidth="3" /><line x1="15" y1="15.5" x2="22" y2="23" stroke="var(--mc-icon-stroke)" strokeWidth="3" strokeLinecap="round" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索实例"
                className="flex-1 bg-transparent outline-none" style={{ ...monoFont, fontSize: 22, color: 'var(--mc-text-primary)' }} />
            </div>
            <div className="flex-1 overflow-y-auto mt-[12px] custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-[100px] gap-[10px] animate-fade-in">
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
                  <span style={{ ...monoFont, color: 'var(--mc-text-faint)' }}>正在加载实例列表...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-[100px] rounded-[20px] border-3 border-dashed animate-fade-in" style={{ borderColor: 'var(--mc-empty-border)' }}>
                  <span style={{ ...monoFont, color: 'var(--mc-empty-text)' }}>无实例</span>
                </div>
              ) : filtered.map((i, idx) => (
                <button key={i.serial_number} onClick={() => { setSelected(i.serial_number); setConfirmName('') }}
                  className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden animate-fade-slide-up"
                  style={{ height: 48, padding: i.serial_number === selected ? '0 20px' : '0 4px', borderRadius: i.serial_number === selected ? 24 : 6,
                    background: i.serial_number === selected ? 'var(--mc-choice-selected-bg)' : 'transparent',
                    border: i.serial_number === selected ? '2px solid var(--mc-choice-selected-border)' : '2px solid transparent',
                    animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}>
                  <span className="truncate" style={{ ...monoFont, fontSize: 22 }}>{i.nickname}|{i.serial_number}</span>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="flex-1 min-w-0 h-full min-h-0">
        {inst ? (
          <GlassCard key={`delete-${inst.serial_number}`}>
            <div className="p-[28px] flex flex-col gap-[16px]">
              <h2 className="animate-fade-slide-up" style={{ ...sectionTitle, ...getTextDriftStyle(0, 'title'), color: 'var(--mc-text-primary)' }}>删除实例</h2>
              <div className="flex flex-col gap-[6px]">
                {([['实例昵称', inst.nickname], ['序列号', inst.serial_number], ['Bot 类型', inst.bot_type], ['版本', inst.version],
                  ['路径', inst.bot_type === 'MaiBot' ? inst.mai_path : inst.bot_type === 'MoFox-Core' ? inst.mofox_path : inst.neo_mofox_path]] as [string, string][]).map(([k, v], idx) => (
                  <div key={k} className="flex gap-[16px]">
                    <span className="shrink-0 animate-fade-slide-up" style={{ ...labelFont, ...getTextDriftStyle(idx + 1, 'label'), color: 'var(--mc-text-primary)' }}>{k}</span>
                    <span className="animate-fade-slide-up" style={{ ...valueFont, ...getTextDriftStyle(idx + 1, 'value') }}>{v || '-'}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-[16px] bg-red-500/10 border-2 border-red-400/50 p-[16px]">
                <span className="animate-fade-slide-up" style={{ ...smallLabel, color: '#dc2626', ...getTextDriftStyle(7, 'hint') }}>此操作不可逆！请输入实例昵称「{inst.nickname}」以确认删除</span>
              </div>
              {inst.is_published_template && (
                <div className="rounded-[16px] p-[14px]" style={{ background: inst.published_active === false ? 'rgba(120,120,120,0.16)' : 'rgba(96,165,250,0.16)', border: '1px solid var(--mc-border-soft)' }}>
                  <span style={{ ...monoFont, fontSize: 18, color: 'var(--mc-text-secondary)' }}>
                    {inst.published_active === false ? '部署流已取消发布，删除权限已收回。' : `将通过部署流「${inst.deployment_flow_name || inst.deployment_profile?.uninstall_id || '未命名'}」的卸载逻辑删除。`}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-[6px]">
                <span className="animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(8, 'label'), color: 'var(--mc-text-primary)' }}>输入实例昵称确认</span>
                <input
                  value={confirmName}
                  onChange={e => setConfirmName(e.target.value)}
                  placeholder={inst.nickname}
                  className="h-[54px] px-[22px] rounded-[27px] outline-none"
                  style={{ ...monoFont, fontSize: 22, background: 'var(--mc-control-bg)', border: '2px solid var(--mc-border-strong)', color: 'var(--mc-text-primary)' }}
                />
              </div>
              <button disabled={confirmName !== inst.nickname || deleting || (inst.is_published_template && inst.published_active === false)} onClick={handleDelete}
                className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(239,68,68,0.3)', border: '2px solid rgba(239,68,68,0.6)' }}>
                <span className="animate-fade-slide-up" style={{ ...smallLabel, color: '#dc2626', ...getTextDriftStyle(9, 'value') }}>{deleting ? '删除中...' : '确认删除'}</span>
              </button>
            </div>
          </GlassCard>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", color: 'var(--mc-text-faint)' }}>请选择一个实例</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 主组件 ─── */
export default function Deployment() {
  const [tab, setTab] = useState<DeployTab>('deploy')

  return (
    <div className="flex flex-col p-6 h-full overflow-hidden">
      <h1 className="shrink-0 mb-[16px] animate-card-enter" style={{ ...pageTitleStyle, color: 'var(--mc-text-primary)' }}>部署管理</h1>

      <div className="flex gap-[10px] mb-[20px] animate-card-enter" style={{ animationDelay: '60ms' }}>
        <PillTab label="部署新实例" selected={tab === 'deploy'} onClick={() => setTab('deploy')} />
        <PillTab label="更新实例" selected={tab === 'update'} onClick={() => setTab('update')} />
        <PillTab label="删除实例" selected={tab === 'delete'} onClick={() => setTab('delete')} />
        <PillTab label="部署流" selected={tab === 'flow'} onClick={() => setTab('flow')} />
      </div>

      <div className="flex-1 min-h-0 animate-card-enter" style={{ animationDelay: '120ms' }}>
        <GlassCard>
          <div className="p-[28px] flex flex-col h-full overflow-hidden">
            {tab === 'deploy' && <DeployNewTab />}
            {tab === 'update' && <UpdateTab />}
            {tab === 'delete' && <DeleteTab />}
            {tab === 'flow' && <DeploymentFlowTab />}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
