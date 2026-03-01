import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'

interface VersionInfo { name: string; display_name: string; type: string; [k: string]: any }
interface Instance {
  id: string; serial_number: string; nickname: string; bot_type: string
  version: string; qq_account: string; mai_path: string; mofox_path: string
}
interface DeployProgress {
  task_id: string; step: number; total_steps: number; step_name: string
  status: string; message: string; logs: string[]
}

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const btnFont = { fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative' as const, top: 2 }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: '#707070' }
const pillShadowStyle = { border: '2px solid rgba(0,0,0,0.5)', boxShadow: '2px 3px 6px rgba(0,0,0,0.15)' }
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
      style={{ background: selected ? 'rgba(255,255,255,0.6)' : 'transparent', border: '2px solid rgba(0,0,0,0.5)' }}>
      {selected && <div className="absolute inset-0 rounded-[27px] pointer-events-none" style={pillShadowStyle} />}
      <span style={btnFont}>{label}</span>
    </button>
  )
}

function CustomSelect({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 240 })
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
      <button ref={btnRef} disabled={disabled} onClick={() => !disabled && setOpen(!open)}
        className="w-full h-[54px] px-[22px] rounded-[27px] bg-white/60 border-2 border-black/50 flex items-center justify-between cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ ...monoFont, fontSize: 22 }}>
        <span className={sel ? 'text-black' : 'text-black/30'}>{sel?.label || placeholder || '请选择'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" /></svg>
      </button>
      {open && options.length > 0 && createPortal(
        <div className="fixed rounded-[20px] bg-white/95 backdrop-blur-xl border-2 border-black/30 overflow-y-auto custom-scrollbar"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH, zIndex: 9999, boxShadow: '4px 4px 12px rgba(0,0,0,0.15)' }}
          onMouseDown={e => e.stopPropagation()}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full px-[22px] py-[10px] text-left hover:bg-black/5 transition-colors cursor-pointer"
              style={{ ...monoFont, fontSize: 20, background: o.value === value ? 'rgba(0,0,0,0.06)' : undefined }}>
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
      <span className="text-black" style={smallLabel}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className="h-[54px] px-[22px] rounded-[27px] bg-white/60 border-2 border-black/50 outline-none text-black placeholder:text-black/20 disabled:opacity-40"
        style={{ ...monoFont, fontSize: 22 }} />
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
      <h2 className="text-black" style={sectionTitle}>{panelTitle}</h2>

      {/* 步骤指示器 */}
      <div className="flex gap-[8px] items-center flex-wrap">
        {stepNames.map((name, i) => {
          const step = i + 1
          const isCurrent = p?.step === step && p?.status === 'running'
          const isDone = p ? p.step > step || (p.step === step && p.status === 'completed') : false
          const isFailed = p?.step === step && p?.status === 'failed'
          return (
            <div key={i} className="flex items-center gap-[4px]">
              <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-sm font-bold transition-all"
                style={{ background: isFailed ? '#ef4444' : isDone ? '#22c55e' : isCurrent ? '#3b82f6' : 'rgba(0,0,0,0.15)', fontSize: 14 }}>
                {isDone ? '✓' : step}
              </div>
              <span style={{ ...monoFont, fontSize: 16, color: isCurrent ? '#000' : '#888' }}>{name}</span>
              {i < stepNames.length - 1 && <div className="w-[20px] h-[2px] bg-black/15 mx-[2px]" />}
            </div>
          )
        })}
      </div>

      {/* 进度条 */}
      <div className="h-[12px] rounded-full bg-black/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: p?.status === 'failed' ? '#ef4444' : '#22c55e' }} />
      </div>
      <span style={{ ...monoFont, fontSize: 18, color: '#555' }}>{p?.message || '等待中...'}</span>

      {/* 日志面板 */}
      <button onClick={() => setLogsOpen(!logsOpen)} className="self-start cursor-pointer" style={{ ...smallLabel, color: '#555' }}>
        {logsOpen ? '▼ 收起日志' : '▶ 展开日志'}
      </button>
      {logsOpen && (
        <div ref={logRef} className="h-[305px] overflow-y-auto rounded-[16px] bg-black/5 p-[16px] custom-scrollbar">
          {(p?.logs || []).map((l, i) => <div key={i} style={{ ...monoFont, fontSize: 14, color: '#555' }}>{l}</div>)}
        </div>
      )}

      {done && onDone && (
        <button onClick={onDone} className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{ background: p?.status === 'completed' ? 'rgba(74,222,128,0.3)' : 'rgba(255,100,100,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
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
  const [installWebui, setInstallWebui] = useState(false)
  const [installMofoxWebui, setInstallMofoxWebui] = useState(false)
  const [napcatVersions, setNapcatVersions] = useState<any[]>([])
  const [selectedNapcatVer, setSelectedNapcatVer] = useState('')

  // 加载版本
  useEffect(() => {
    if (!botType) { setVersions([]); setSelectedVersion(''); return }
    setVersionsLoading(true)
    fetch(`/api/deploy/versions/${botType}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setVersions(d.versions || []))
      .catch(() => setVersions([]))
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

  const canStep2 = botType && selectedVersion && nickname && installDir
  const serialNumber = nickname // 简化：用昵称作为序列号

  const handleDeploy = async () => {
    try {
      const res = await fetch('/api/deploy/instances', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_type: botType, version: versionObj, install_adapter: installAdapter,
          install_napcat: installNapcat, napcat_version: napcatObj || null,
          install_mongodb: installMongodb, install_webui: installWebui,
          install_mofox_admin_ui: false, install_mofox_webui: installMofoxWebui,
          install_dir: installDir, nickname, qq_account: qqAccount,
          serial_number: serialNumber,
        })
      })
      const d = await res.json()
      if (d.task_id) { setTaskId(d.task_id); setStep(4) }
      else notify(d.detail || '部署启动失败', 'error')
    } catch { notify('请求失败', 'error') }
  }

  const reset = () => { setStep(1); setTaskId(null); setBotType(''); setSelectedVersion(''); setNickname(''); setQqAccount(''); setInstallDir(''); setInstallAdapter(false); setInstallNapcat(false); setInstallMongodb(false); setInstallWebui(false); setInstallMofoxWebui(false) }

  const d = (i: number) => ({ animationDelay: `${i * 60}ms` })

  if (step === 4 && taskId) {
    return <ProgressPanel taskId={taskId} onDone={reset} />
  }

  return (
    <div className="flex flex-col gap-[20px]">
      {/* 步骤指示 */}
      <div className="flex gap-[12px] items-center animate-fade-slide-up" style={d(0)}>
        {['基础配置', '组件选择', '确认部署'].map((name, i) => (
          <div key={i} className="flex items-center gap-[6px]">
            <div className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: step > i + 1 ? '#22c55e' : step === i + 1 ? '#3b82f6' : 'rgba(0,0,0,0.15)', fontSize: 16 }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span style={{ ...smallLabel, color: step === i + 1 ? '#000' : '#888' }}>{name}</span>
            {i < 2 && <div className="w-[30px] h-[2px] bg-black/15" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-[16px]">
          <div className="grid grid-cols-2 gap-[16px] animate-fade-slide-up" style={d(1)}>
            <div className="flex flex-col gap-[6px]">
              <span className="text-black" style={smallLabel}>Bot 类型</span>
              <CustomSelect value={botType} onChange={v => { setBotType(v); setSelectedVersion('') }}
                options={[{ value: 'MaiBot', label: 'MaiBot' }, { value: 'MoFox_bot', label: 'MoFox_bot' }]} placeholder="选择Bot类型" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className="text-black" style={smallLabel}>版本</span>
              {versionsLoading ? (
                <div className="w-full h-[54px] px-[22px] rounded-[27px] bg-white/60 border-2 border-black/50 flex items-center gap-[10px]">
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.5)' }} />
                  <span className="text-black/40" style={{ ...monoFont, fontSize: 22 }}>正在获取版本列表...</span>
                </div>
              ) : (
                <CustomSelect value={selectedVersion} onChange={setSelectedVersion} disabled={!botType}
                  options={versions.map(v => ({ value: v.name, label: v.display_name || v.name }))} placeholder="选择版本" />
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
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
              <span style={smallLabel}>下一步</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 className="text-black" style={sectionTitle}>组件选择</h3>
          <div className="flex flex-col gap-[12px]">
            {botType === 'MaiBot' && <ToggleItem label="适配器" checked={installAdapter} onChange={setInstallAdapter} />}
            <ToggleItem label="NapCat" checked={installNapcat} onChange={setInstallNapcat} />
            {installNapcat && (
              <div className="ml-[40px]">
                <CustomSelect value={selectedNapcatVer} onChange={setSelectedNapcatVer}
                  options={napcatVersions.map(v => ({ value: v.name || v.tag_name, label: v.name || v.tag_name }))} placeholder="选择NapCat版本" />
              </div>
            )}
            {botType === 'MaiBot' && <ToggleItem label="MongoDB" checked={installMongodb} onChange={setInstallMongodb} />}
            {botType === 'MaiBot' && <ToggleItem label="WebUI" checked={installWebui} onChange={setInstallWebui} />}
            {botType === 'MoFox_bot' && <ToggleItem label="MoFox WebUI" checked={installMofoxWebui} onChange={setInstallMofoxWebui} />}
          </div>
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(1)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button onClick={() => setStep(3)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
              <span style={smallLabel}>下一步</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-[16px] animate-fade-slide-up">
          <h3 className="text-black" style={sectionTitle}>确认部署配置</h3>
          <div className="rounded-[20px] bg-white/40 p-[20px] flex flex-col gap-[6px]">
            {([
              ['Bot 类型', botType], ['版本', versionObj?.display_name || selectedVersion],
              ['实例昵称', nickname], ['安装目录', installDir],
              ...(qqAccount ? [['QQ 账号', qqAccount]] : []),
              ['适配器', installAdapter ? '是' : '否'], ['NapCat', installNapcat ? (selectedNapcatVer || '是') : '否'],
              ['MongoDB', installMongodb ? '是' : '否'],
              [botType === 'MoFox_bot' ? 'MoFox WebUI' : 'WebUI', (botType === 'MoFox_bot' ? installMofoxWebui : installWebui) ? '是' : '否'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex gap-[16px]">
                <span className="text-black shrink-0 w-[120px]" style={labelFont}>{k}</span>
                <span style={valueFont}>{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-[12px]">
            <button onClick={() => setStep(2)} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
              <span style={smallLabel}>上一步</span>
            </button>
            <button onClick={handleDeploy} className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
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
        style={{ background: checked ? '#22c55e' : 'rgba(0,0,0,0.15)' }}>
        <div className="absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white transition-all duration-200 shadow"
          style={{ left: checked ? 21 : 3 }} />
      </div>
      <span style={smallLabel}>{label}</span>
    </button>
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
          mai_path: cfg.mai_path || '', mofox_path: cfg.mofox_path || '',
        }))
        setInstances(list)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const inst = instances.find(i => i.serial_number === selected)

  useEffect(() => {
    if (!inst) { setVersions([]); setNewVersion(''); return }
    setVersionsLoading(true)
    fetch(`/api/deploy/versions/${inst.bot_type}`, { credentials: 'include' })
      .then(r => r.json()).then(d => setVersions(d.versions || [])).catch(() => {})
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
    <div className="flex gap-[24px] flex-1 min-h-0">
      <div className="w-[380px] shrink-0">
        <GlassCard>
          <div className="p-[24px] flex flex-col h-full">
            <h2 className="text-black pb-[12px]" style={sectionTitle}>选择实例</h2>
            <div className="flex items-center h-[54px] px-[22px] gap-[12px] rounded-[27px] bg-white/60 border-2 border-black/50 shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" /><line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索实例"
                className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20" style={{ ...monoFont, fontSize: 22 }} />
            </div>
            <div className="flex-1 overflow-y-auto mt-[12px] custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-[100px] gap-[10px] animate-fade-in">
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.5)' }} />
                  <span className="text-black/40" style={monoFont}>正在加载实例列表...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-[100px] rounded-[20px] border-3 border-dashed border-[#9e9e9e] animate-fade-in">
                  <span className="text-[#9e9e9e]" style={monoFont}>无实例</span>
                </div>
              ) : filtered.map((i, idx) => (
                <button key={i.serial_number} onClick={() => setSelected(i.serial_number)}
                  className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden animate-fade-slide-up"
                  style={{ height: 48, padding: i.serial_number === selected ? '0 20px' : '0 4px', borderRadius: i.serial_number === selected ? 24 : 6,
                    background: i.serial_number === selected ? 'rgba(255,255,255,0.6)' : 'transparent',
                    border: i.serial_number === selected ? '2px solid rgba(0,0,0,0.5)' : '2px solid transparent',
                    animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}>
                  <span className="truncate" style={{ ...monoFont, fontSize: 22 }}>{i.nickname}|{i.serial_number}</span>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="flex-1 min-w-0">
        {inst ? (
          <GlassCard key={`update-${inst.serial_number}`}>
            <div className="p-[28px] flex flex-col gap-[16px]">
              <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...getTextDriftStyle(0, 'title') }}>更新实例</h2>
              <div className="flex flex-col gap-[6px]">
                {([['实例昵称', inst.nickname], ['序列号', inst.serial_number], ['Bot 类型', inst.bot_type], ['当前版本', inst.version]] as [string, string][]).map(([k, v], idx) => (
                  <div key={k} className="flex gap-[16px]">
                    <span className="text-black shrink-0 animate-fade-slide-up" style={{ ...labelFont, ...getTextDriftStyle(idx + 1, 'label') }}>{k}</span>
                    <span className="animate-fade-slide-up" style={{ ...valueFont, ...getTextDriftStyle(idx + 1, 'value') }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-[6px]">
                <span className="text-black animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(6, 'label') }}>新版本</span>
                {versionsLoading ? (
                  <div className="w-full h-[54px] px-[22px] rounded-[27px] bg-white/60 border-2 border-black/50 flex items-center gap-[10px]">
                    <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.5)' }} />
                    <span className="text-black/40 animate-fade-slide-up" style={{ ...monoFont, fontSize: 22, ...getTextDriftStyle(7, 'hint') }}>正在获取版本列表...</span>
                  </div>
                ) : (
                  <CustomSelect value={newVersion} onChange={setNewVersion}
                    options={versions.map(v => ({ value: v.name, label: v.display_name || v.name }))} placeholder="选择新版本" />
                )}
              </div>
              <button disabled={!newVersion} onClick={handleUpdate}
                className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(96,165,250,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}>
                <span className="animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(8, 'value') }}>开始更新</span>
              </button>
            </div>
          </GlassCard>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>请选择一个实例</span>
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

  const reload = () => {
    setLoading(true)
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json()).then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([id, cfg]: [string, any]) => ({
          id, serial_number: cfg.serial_number || '', nickname: cfg.nickname || cfg.serial_number || '',
          bot_type: cfg.bot_type || 'MaiBot', version: cfg.version || '', qq_account: cfg.qq_account || '',
          mai_path: cfg.mai_path || '', mofox_path: cfg.mofox_path || '',
        }))
        setInstances(list); setSelected(null); setConfirmName('')
      }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const inst = instances.find(i => i.serial_number === selected)

  const handleDelete = async () => {
    if (!inst || confirmName !== inst.nickname) { notify('昵称不匹配', 'error'); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/deploy/instances/${inst.serial_number}/confirm-delete`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: inst.serial_number, confirm_nickname: confirmName, backup: true })
      })
      const d = await res.json()
      if (d.success) {
        const msg = d.backup_path ? `删除成功，备份位置：${d.backup_path}` : (d.message || '删除成功')
        notify(msg, 'success')
        reload()
      }
      else notify(d.detail || d.message || '删除失败', 'error')
    } catch { notify('请求失败', 'error') }
    setDeleting(false)
  }

  const filtered = instances.filter(i => !search || i.nickname.toLowerCase().includes(search.toLowerCase()) || i.serial_number.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex gap-[24px] flex-1 min-h-0">
      <div className="w-[380px] shrink-0">
        <GlassCard>
          <div className="p-[24px] flex flex-col h-full">
            <h2 className="text-black pb-[12px]" style={sectionTitle}>选择实例</h2>
            <div className="flex items-center h-[54px] px-[22px] gap-[12px] rounded-[27px] bg-white/60 border-2 border-black/50 shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" /><line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索实例"
                className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20" style={{ ...monoFont, fontSize: 22 }} />
            </div>
            <div className="flex-1 overflow-y-auto mt-[12px] custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-[100px] gap-[10px] animate-fade-in">
                  <div className="w-[20px] h-[20px] rounded-full animate-spin" style={{ border: '3px solid rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.5)' }} />
                  <span className="text-black/40" style={monoFont}>正在加载实例列表...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-[100px] rounded-[20px] border-3 border-dashed border-[#9e9e9e] animate-fade-in">
                  <span className="text-[#9e9e9e]" style={monoFont}>无实例</span>
                </div>
              ) : filtered.map((i, idx) => (
                <button key={i.serial_number} onClick={() => { setSelected(i.serial_number); setConfirmName('') }}
                  className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden animate-fade-slide-up"
                  style={{ height: 48, padding: i.serial_number === selected ? '0 20px' : '0 4px', borderRadius: i.serial_number === selected ? 24 : 6,
                    background: i.serial_number === selected ? 'rgba(255,255,255,0.6)' : 'transparent',
                    border: i.serial_number === selected ? '2px solid rgba(0,0,0,0.5)' : '2px solid transparent',
                    animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}>
                  <span className="truncate" style={{ ...monoFont, fontSize: 22 }}>{i.nickname}|{i.serial_number}</span>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="flex-1 min-w-0">
        {inst ? (
          <GlassCard key={`delete-${inst.serial_number}`}>
            <div className="p-[28px] flex flex-col gap-[16px]">
              <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...getTextDriftStyle(0, 'title') }}>删除实例</h2>
              <div className="flex flex-col gap-[6px]">
                {([['实例昵称', inst.nickname], ['序列号', inst.serial_number], ['Bot 类型', inst.bot_type], ['版本', inst.version],
                  ['路径', inst.bot_type === 'MaiBot' ? inst.mai_path : inst.mofox_path]] as [string, string][]).map(([k, v], idx) => (
                  <div key={k} className="flex gap-[16px]">
                    <span className="text-black shrink-0 animate-fade-slide-up" style={{ ...labelFont, ...getTextDriftStyle(idx + 1, 'label') }}>{k}</span>
                    <span className="animate-fade-slide-up" style={{ ...valueFont, ...getTextDriftStyle(idx + 1, 'value') }}>{v || '-'}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-[16px] bg-red-500/10 border-2 border-red-400/50 p-[16px]">
                <span className="animate-fade-slide-up" style={{ ...smallLabel, color: '#dc2626', ...getTextDriftStyle(7, 'hint') }}>此操作不可逆！请输入实例昵称「{inst.nickname}」以确认删除</span>
              </div>
              <div className="flex flex-col gap-[6px]">
                <span className="text-black animate-fade-slide-up" style={{ ...smallLabel, ...getTextDriftStyle(8, 'label') }}>输入实例昵称确认</span>
                <input
                  value={confirmName}
                  onChange={e => setConfirmName(e.target.value)}
                  placeholder={inst.nickname}
                  className="h-[54px] px-[22px] rounded-[27px] bg-white/60 border-2 border-black/50 outline-none text-black placeholder:text-black/20"
                  style={{ ...monoFont, fontSize: 22 }}
                />
              </div>
              <button disabled={confirmName !== inst.nickname || deleting} onClick={handleDelete}
                className="self-start h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(239,68,68,0.3)', border: '2px solid rgba(239,68,68,0.6)' }}>
                <span className="animate-fade-slide-up" style={{ ...smallLabel, color: '#dc2626', ...getTextDriftStyle(9, 'value') }}>{deleting ? '删除中...' : '确认删除'}</span>
              </button>
            </div>
          </GlassCard>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>请选择一个实例</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 主组件 ─── */
export default function Deployment() {
  const [tab, setTab] = useState<'deploy' | 'update' | 'delete'>('deploy')

  return (
    <div className="flex flex-col p-6 h-full">
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>部署管理</h1>

      <div className="flex gap-[10px] mb-[20px] animate-card-enter" style={{ animationDelay: '60ms' }}>
        <PillTab label="部署新实例" selected={tab === 'deploy'} onClick={() => setTab('deploy')} />
        <PillTab label="更新实例" selected={tab === 'update'} onClick={() => setTab('update')} />
        <PillTab label="删除实例" selected={tab === 'delete'} onClick={() => setTab('delete')} />
      </div>

      <div className="flex-1 min-h-0 animate-card-enter" style={{ animationDelay: '120ms' }}>
        <GlassCard>
          <div className="p-[28px] flex flex-col h-full overflow-y-auto custom-scrollbar">
            {tab === 'deploy' && <DeployNewTab />}
            {tab === 'update' && <UpdateTab />}
            {tab === 'delete' && <DeleteTab />}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
