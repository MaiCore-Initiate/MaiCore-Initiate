import { useState, useEffect, useRef } from 'react'
import GlassCard from '../components/ui/GlassCard'
import AccessGuard from '../components/ui/AccessGuard'
import Modal from '../components/ui/Modal'
import { useNotification } from '../components/ui/Notification'
import { useAccountSystem } from '../lib/account-system'

interface Instance {
  serial: string
  nickname: string
  absoluteSerial: number
  botType: string
  version: string
  qqAccount: string
  adapterMode: string
  installOptions: Record<string, any>
}

type BotType = 'MaiBot' | 'MoFox-Core' | 'Neo-MoFox'

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: 'var(--mc-text-secondary)' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }

const PRESETS: Record<BotType, { label: string; components: string[] }[]> = {
  MaiBot: [
    { label: '主程序+适配器+控制面板', components: ['mai','adapter', 'webui'] },
    { label: '主程序+适配器+NapCat+控制面板', components: ['mai', 'adapter', 'napcat', 'webui'] },
  ],
  'MoFox-Core': [
    { label: '主程序（内置适配器）+WebUI', components: ['mai'] },
    { label: '主程序（内置适配器）+NapCatQQ+WebUI', components: ['mai', 'napcat'] },
  ],
  'Neo-MoFox': [
    { label: '主程序（内置适配器）+WebUI', components: ['mai'] },
    { label: '主程序（内置适配器）+NapCatQQ+WebUI', components: ['mai', 'napcat'] },
  ],
}

const ADVANCED_ITEMS: Record<BotType, { label: string; components: string[] }[]> = {
  MaiBot: [
    { label: '主程序+WebUI', components: ['mai', 'webui'] },
    { label: '适配器', components: ['adapter'] },
    { label: 'NapCatQQ', components: ['napcat'] },
  ],
  'MoFox-Core': [
    { label: '主程序（内置适配器）+WebUI', components: ['mai'] },
    { label: 'NapCatQQ', components: ['napcat'] },
  ],
  'Neo-MoFox': [
    { label: '主程序（内置适配器）+WebUI', components: ['mai'] },
    { label: 'NapCatQQ', components: ['napcat'] },
  ],
}

function normalizeBotType(botType: string): BotType {
  if (botType === 'MoFox_bot' || botType === 'MoFox-Core') return 'MoFox-Core'
  if (botType === 'Neo-MoFox') return 'Neo-MoFox'
  return 'MaiBot'
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m}m` : `${m}m`
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

function isPluginAdapter(instance: Instance): boolean {
  if (instance.adapterMode === 'plugin' || instance.installOptions?.adapter_mode === 'plugin') return true
  const version = instance.version.trim().toLowerCase()
  return normalizeBotType(instance.botType) === 'MaiBot' && (
    version === 'main' ||
    version === 'dev' ||
    version === 'master' ||
    isVersionAtLeast(version, '1.0.0')
  )
}

function PillButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[54px] px-[24px] rounded-[27px] cursor-pointer transition-all duration-300 shrink-0"
      style={{
        background: selected ? 'var(--mc-choice-selected-bg)' : 'transparent',
        border: '2px solid var(--mc-choice-selected-border)',
      }}
    >
      <span style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", position: 'relative', top: 2 }}>{label}</span>
    </button>
  )
}

function LaunchPanel({ instance }: { instance: Instance }) {
  const { notify } = useNotification()
  const [mode, setMode] = useState<'none' | 'preset' | 'advanced'>('none')
  const [presetIdx, setPresetIdx] = useState<number | null>(null)
  const [advancedSelected, setAdvancedSelected] = useState<Set<number>>(new Set())
  const [summary, setSummary] = useState<{ launch_count: number; total_uptime_s: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [showNapcatModal, setShowNapcatModal] = useState(false)
  const [pendingComponents, setPendingComponents] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const normalizedBotType = normalizeBotType(instance.botType)
  const adapterIsPlugin = isPluginAdapter(instance)
  const presets = PRESETS[normalizedBotType].map(p => ({
    ...p,
    label: adapterIsPlugin ? p.label.replace('+适配器', '') : p.label,
    components: adapterIsPlugin ? p.components.filter(c => c !== 'adapter') : p.components,
  }))
  const advancedItems = ADVANCED_ITEMS[normalizedBotType].filter(item => (
    !adapterIsPlugin || !item.components.includes('adapter')
  ))

  useEffect(() => {
    setPresetIdx(null)
    setAdvancedSelected(new Set())
    setMode('none')
    fetch(`/api/stats/summary?instance_id=${instance.serial}`, { credentials: 'include' })
      .then(r => r.json()).then(setSummary).catch(() => setSummary(null))

    const checkStatus = () =>
      fetch(`/api/launcher/instances/${instance.serial}/status`, { credentials: 'include' })
        .then(r => r.json()).then(d => setRunning(!!d.running)).catch(() => {})
    checkStatus()
    pollRef.current = setInterval(checkStatus, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [instance.serial])

  const nothingSelected = mode === 'none' || (mode === 'preset' && presetIdx === null) || (mode === 'advanced' && advancedSelected.size === 0)

  const doStart = async (components: string[], useNapcatShell?: boolean) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/launcher/instances/${instance.serial}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serial_number: instance.serial,
          components,
          use_napcat_shell: useNapcatShell ?? false,
        }),
      })
      const data = await res.json()
      if (data.success !== false) {
        notify('实例启动成功', 'success')
        setRunning(true)
        // 保存本次启动选项到后端，供快捷启动使用
        fetch(`/api/preferences/launch_opts_${instance.serial}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ value: { components, useNapcatShell: useNapcatShell ?? false } }),
        }).catch(() => {})
      } else {
        notify(data.detail || data.message || '启动失败', 'error')
      }
    } catch {
      notify('启动请求失败，请检查服务器', 'error')
    }
    setLoading(false)
  }

  const handleStart = () => {
    if (nothingSelected) return
    const components = mode === 'preset'
      ? presets[presetIdx!].components
      : Array.from(advancedSelected).flatMap(i => advancedItems[i].components)

    // 如果包含 napcat 组件，弹窗询问是否使用 NapCat.Shell 快捷登录
    if (components.includes('napcat')) {
      setPendingComponents(components)
      setShowNapcatModal(true)
    } else {
      doStart(components)
    }
  }

  const handleNapcatChoice = (useShell: boolean) => {
    setShowNapcatModal(false)
    doStart(pendingComponents, useShell)
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/launcher/instances/${instance.serial}/stop`, {
        method: 'POST', credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        notify(`已停止 ${data.stopped_pids?.length ?? 0} 个进程`, 'success')
        setRunning(false)
      } else {
        notify(data.detail || '停止失败', 'error')
      }
    } catch {
      notify('停止请求失败，请检查服务器', 'error')
    }
    setLoading(false)
  }

  const toggleAdvanced = (idx: number) => {
    setAdvancedSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      if (next.size === 0) {
        setMode('none')
      } else {
        setMode('advanced')
      }
      return next
    })
    setPresetIdx(null)
  }

  const selectPreset = (idx: number) => {
    if (mode === 'preset' && presetIdx === idx) {
      setPresetIdx(null)
      setMode('none')
    } else {
      setPresetIdx(idx)
      setMode('preset')
    }
    setAdvancedSelected(new Set())
  }

  const leftData = [
    ['实例类型', normalizedBotType],
    ['实例昵称', instance.nickname],
    ['实例序列号', instance.serial],
    ['实例绝对序列号', String(instance.absoluteSerial)],
  ]
  const rightData = [
    ['注册时间', '-'],
    ['启动次数', summary ? String(summary.launch_count) : '-'],
    ['运行时间', summary ? formatUptime(summary.total_uptime_s) : '-'],
    ['当前版本', instance.version || '-'],
  ]

  const modalTitleFont = { fontSize: 32, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
  const modalBodyFont = { fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }

  const d = (i: number) => ({ animationDelay: `${i * 60}ms` })

  return (
    <>
      <GlassCard key={instance.serial}>
        <div className="p-[28px] flex flex-col h-full">
          {/* 实例概览 */}
          <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(0) }}>实例概览</h2>
          <div className="flex gap-0 mt-[8px] animate-fade-slide-up" style={d(1)}>
            <div className="space-y-[2px]">
              {leftData.map(([label, val], i) => (
                <div key={label} className="flex items-baseline gap-[16px] animate-fade-slide-up" style={d(2 + i)}>
                  <span className="text-black shrink-0" style={labelFont}>{label}</span>
                  <span style={valueFont}>{val}</span>
                </div>
              ))}
            </div>
            <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0 mx-[100px]" />
            <div className="space-y-[2px]">
              {rightData.map(([label, val], i) => (
                <div key={label} className="flex items-baseline gap-[16px] animate-fade-slide-up" style={d(2 + i)}>
                  <span className="text-black shrink-0" style={labelFont}>{label}</span>
                  <span style={valueFont}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 启动选项 */}
          <h2 className="text-black mt-[16px] animate-fade-slide-up" style={{ ...sectionTitle, ...d(6) }}>启动选项</h2>
          <div className="flex flex-wrap gap-[10px] mt-[6px]">
            {presets.map((p, i) => (
              <div key={i} className="animate-fade-slide-up" style={d(7 + i)}>
                <PillButton label={p.label} selected={mode === 'preset' && presetIdx === i} onClick={() => selectPreset(i)} />
              </div>
            ))}
          </div>

          {/* 高级启动项 + 启动实例 并排 */}
          <div className="flex mt-[16px] flex-1 min-h-0">
            {/* 高级启动项 */}
            <div className="flex-1 min-w-0">
              <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(11) }}>高级启动项</h2>
              <div className="flex flex-wrap gap-[10px] mt-[6px]">
                {advancedItems.map((item, i) => (
                  <div key={i} className="animate-fade-slide-up" style={d(12 + i)}>
                    <PillButton label={item.label} selected={mode === 'advanced' && advancedSelected.has(i)} onClick={() => toggleAdvanced(i)} />
                  </div>
                ))}
              </div>
            </div>

            {/* 分隔线 + 启动实例 */}
            <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0 mx-[30px] animate-fade-slide-up" style={d(15)} />
            <div className="flex flex-col items-center shrink-0 mr-[100px] animate-fade-slide-up" style={d(15)}>
              <h2 className="text-black mr-[40px]" style={sectionTitle}>{running ? '停止实例' : '启动实例'}</h2>
              <button
                onClick={running ? handleStop : handleStart}
                disabled={loading || (!running && nothingSelected)}
                className="w-[100px] h-[100px] rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed mt-[40px] mr-[80px]"
                style={{
                  background: running ? '#ffaeae' : '#b3ffae',
                  border: running ? '10px solid #ff9f9f' : '10px solid #a4ff9f',
                  opacity: loading ? 0.4 : (!running && nothingSelected) ? 0.5 : 1,
                }}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: running ? '#c00' : '#060' }} />
                ) : running ? (
                  <svg width="40" height="40" viewBox="0 0 40 40">
                    <rect x="4" y="4" width="32" height="32" rx="4" fill={running ? '#ff6b6b' : '#52ff48'} />
                  </svg>
                ) : (
                  <svg width="81" height="93" viewBox="0 0 150 150" overflow="visible">
                    <g transform="translate(129 29) rotate(90)" fill="#b3ffae">
                      <path d="M82.14 74.71 L47.08 70.63 L46.5 70.57 L45.92 70.63 L10.86 74.71 L31.92 46.17 L32.26 45.71 L32.49 45.18 L46.5 12.64 L60.51 45.18 L60.74 45.71 L61.08 46.17 Z" stroke="none"/>
                      <path d="M46.5 25.29 L36.63 48.21 L21.72 68.41 L46.5 65.53 L71.28 68.41 L56.37 48.21 Z M46.5 0 L65.1 43.2 L93 81 L46.5 75.6 L0 81 L27.9 43.2 Z" stroke="none" fill="#52ff48"/>
                    </g>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* NapCat.Shell 快捷登录弹窗 */}
      <Modal open={showNapcatModal} onClose={() => setShowNapcatModal(false)} width={480}>
        <div className="p-[32px] flex flex-col items-center gap-[20px]">
          <h3 className="text-black text-center" style={modalTitleFont}>NapCat.Shell 快捷登录</h3>
          <p className="text-black/60 text-center" style={modalBodyFont}>
            检测到启动组件包含 NapCatQQ，是否使用 NapCat.Shell 快捷登录？
          </p>
          <div className="flex gap-[16px] mt-[8px]">
            <button
              onClick={() => handleNapcatChoice(true)}
              className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: 'rgba(74,222,128,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}
            >
              <span style={modalBodyFont}>使用快捷登录</span>
            </button>
            <button
              onClick={() => handleNapcatChoice(false)}
              className="h-[50px] px-[32px] rounded-[25px] cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.3)', border: '2px solid rgba(0,0,0,0.5)' }}
            >
              <span style={modalBodyFont}>跳过</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default function Instances() {
  const { can } = useAccountSystem()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([, cfg]: [string, any]) => ({
          serial: cfg.serial_number,
          nickname: cfg.nickname || cfg.serial_number,
          absoluteSerial: cfg.absolute_serial ?? 0,
          botType: normalizeBotType(cfg.bot_type || 'MaiBot'),
          version: cfg.version || '',
          qqAccount: cfg.qq_account || '',
          adapterMode: cfg.adapter_mode || cfg.install_options?.adapter_mode || '',
          installOptions: cfg.install_options || {},
        }))
        setInstances(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = instances.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return i.nickname.toLowerCase().includes(s) || i.serial.toLowerCase().includes(s)
  })

  const selectedInstance = instances.find(i => i.serial === selected)
  const canControlInstances = can('instances.control')

  return (
    <div className="flex flex-col p-6 h-full overflow-hidden">
      {/* 页面标题 */}
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>实例启动/多开</h1>

      {/* 卡片区域 */}
      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
        {/* 左侧：实例选择卡片 */}
        <div className="w-[425px] h-full min-h-0 shrink-0 animate-card-enter">
          <GlassCard bgOpacity={0.62}>
            <div className="p-[24px] flex flex-col h-full">
              <h2 className="text-black pb-[12px]" style={sectionTitle}>选择实例</h2>

              <div className="flex items-center h-[71px] px-[22px] gap-[12px] rounded-[35.5px] bg-white/60 border-2 border-black/50 shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
                  <line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search instance"
                  className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
                  style={{ ...monoFont, fontSize: 25 }}
                />
              </div>

              <div className="flex-1 overflow-y-auto mt-[12px] px-[4px]">
                {loading ? (
                  <div className="flex items-center justify-center h-[120px] gap-[10px] animate-fade-in">
                  <div className="rounded-full animate-spin" style={{ width: 20, height: 20, border: '3px solid var(--mc-loading-ring)', borderTopColor: 'var(--mc-loading-ring-active)' }} />
                    <span className="text-black/40" style={monoFont}>正在加载实例列表...</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] rounded-[20px] border-3 border-dashed animate-fade-in" style={{ borderColor: 'var(--mc-empty-border)' }}>
                    <span className="font-semibold text-base" style={{ ...monoFont, color: 'var(--mc-empty-text)' }}>no instance</span>
                  </div>
                ) : (
                  filtered.map((inst, i) => {
                    const isSelected = inst.serial === selected
                    const label = `${inst.nickname}|${inst.serial}|${inst.absoluteSerial}`
                    return (
                      <div key={inst.serial} className="animate-fade-slide-up" style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}>
                        {isSelected && i > 0 && <div className="h-[6px]" />}
                        <button
                          className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden"
                          onClick={() => setSelected(inst.serial)}
                          style={{
                            height: 54,
                            padding: isSelected ? '0 20px' : '0 4px',
                            borderRadius: isSelected ? 27 : 6,
                            background: isSelected ? 'var(--mc-choice-selected-bg)' : 'transparent',
                            border: isSelected ? '2px solid var(--mc-choice-selected-border)' : '2px solid transparent',
                          }}
                        >
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                          <span className="truncate shrink-0" style={{ ...monoFont, fontSize: 30 }}>{label}</span>
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                        </button>
                        {isSelected && i < filtered.length - 1 && <div className="h-[6px]" />}
                        {!isSelected && i < filtered.length - 1 && <hr style={{ borderColor: 'var(--mc-divider-strong)' }} />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 右侧：操作面板 */}
        <div className="flex-1 min-w-0 h-full min-h-0 animate-card-enter" style={{ animationDelay: '80ms' }}>
          <AccessGuard
            allowed={canControlInstances}
            className="h-full"
            detail="当前账号仅可查看实例列表，不能执行启动、停止与高级启动操作。"
          >
            {selectedInstance ? (
              <LaunchPanel instance={selectedInstance} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                  请选择一个实例
                </span>
              </div>
            )}
          </AccessGuard>
        </div>
      </div>
    </div>
  )
}
