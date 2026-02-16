import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'

interface Instance {
  serial: string
  nickname: string
  absoluteSerial: number
  botType: string
  version: string
  qqAccount: string
}

const monoFont = { fontFamily: "'Cascadia Code', monospace" }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: '#707070' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }

interface Toast { id: number; message: string; type: 'success' | 'error' }
let toastId = 0

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null
  return createPortal(
    <div className="fixed bottom-[24px] right-[24px] flex flex-col gap-[10px] z-50">
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-scale-fade-in px-[24px] py-[14px] rounded-[16px] backdrop-blur-[30px] border-2 cursor-pointer"
          style={{
            background: t.type === 'success' ? 'rgba(180,255,180,0.7)' : 'rgba(255,180,180,0.7)',
            borderColor: t.type === 'success' ? 'rgba(0,160,0,0.4)' : 'rgba(200,0,0,0.4)',
            filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.2))',
          }}
          onClick={() => onRemove(t.id)}
        >
          <span style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body
  )
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const remove = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => remove(id), 3000)
  }, [remove])
  return { toasts, push, remove }
}

const PRESETS: Record<string, { label: string; components: string[] }[]> = {
  MoFox_bot: [
    { label: '主程序+WebUI', components: ['mai', 'webui'] },
    { label: '主程序+NapCatQQ+WebUI', components: ['mai', 'napcat', 'webui'] },
    { label: '主程序+适配器+WebUI', components: ['mai', 'adapter', 'webui'] },
    { label: '主程序+适配器+NapCatQQ+WebUI', components: ['mai', 'adapter', 'napcat', 'webui'] },
  ],
  MaiBot: [
    { label: '主程序+WebUI', components: ['mai', 'webui'] },
    { label: '主程序+NapCatQQ+WebUI', components: ['mai', 'napcat', 'webui'] },
    { label: '主程序+适配器+WebUI', components: ['mai', 'adapter', 'webui'] },
    { label: '主程序+适配器+NapCatQQ+WebUI', components: ['mai', 'adapter', 'napcat', 'webui'] },
  ],
}

const ADVANCED_ITEMS: Record<string, { label: string; components: string[] }[]> = {
  MoFox_bot: [
    { label: '主程序+WebUI', components: ['mai', 'webui'] },
    { label: '适配器', components: ['adapter'] },
    { label: 'NapCatQQ', components: ['napcat'] },
  ],
  MaiBot: [
    { label: '主程序+WebUI', components: ['mai', 'webui'] },
    { label: '适配器', components: ['adapter'] },
    { label: 'NapCatQQ', components: ['napcat'] },
  ],
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m}m` : `${m}m`
}

function PillButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[54px] px-[24px] rounded-[27px] cursor-pointer transition-all duration-300 shrink-0"
      style={{
        background: selected ? 'rgba(255,255,255,0.6)' : 'transparent',
        border: '2px solid rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", position: 'relative', top: 2 }}>{label}</span>
    </button>
  )
}

function LaunchPanel({ instance, toast }: { instance: Instance; toast: (msg: string, type: 'success' | 'error') => void }) {
  const [mode, setMode] = useState<'none' | 'preset' | 'advanced'>('none')
  const [presetIdx, setPresetIdx] = useState<number | null>(null)
  const [advancedSelected, setAdvancedSelected] = useState<Set<number>>(new Set())
  const [summary, setSummary] = useState<{ launch_count: number; total_uptime_s: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const presets = PRESETS[instance.botType] ?? PRESETS.MaiBot
  const advancedItems = ADVANCED_ITEMS[instance.botType] ?? ADVANCED_ITEMS.MaiBot

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

  const handleStart = async () => {
    if (nothingSelected) return
    const components = mode === 'preset'
      ? presets[presetIdx!].components
      : Array.from(advancedSelected).flatMap(i => advancedItems[i].components)
    setLoading(true)
    try {
      const res = await fetch(`/api/launcher/instances/${instance.serial}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ serial_number: instance.serial, components }),
      })
      const data = await res.json()
      if (data.success !== false) {
        toast('实例启动成功', 'success')
        setRunning(true)
      } else {
        toast(data.detail || data.message || '启动失败', 'error')
      }
    } catch {
      toast('启动请求失败，请检查服务器', 'error')
    }
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/launcher/instances/${instance.serial}/stop`, {
        method: 'POST', credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        toast(`已停止 ${data.stopped_pids?.length ?? 0} 个进程`, 'success')
        setRunning(false)
      } else {
        toast(data.detail || '停止失败', 'error')
      }
    } catch {
      toast('停止请求失败，请检查服务器', 'error')
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
    ['实例类型', instance.botType],
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

  return (
    <GlassCard>
      <div className="p-[28px] flex flex-col h-full">
        {/* 实例概览 */}
        <h2 className="text-black" style={sectionTitle}>实例概览</h2>
        <div className="flex gap-0 mt-[8px]">
          <div className="space-y-[2px]">
            {leftData.map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-[16px]">
                <span className="text-black shrink-0" style={labelFont}>{label}</span>
                <span style={valueFont}>{val}</span>
              </div>
            ))}
          </div>
          <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0 mx-[100px]" />
          <div className="space-y-[2px]">
            {rightData.map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-[16px]">
                <span className="text-black shrink-0" style={labelFont}>{label}</span>
                <span style={valueFont}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 启动选项 */}
        <h2 className="text-black mt-[16px]" style={sectionTitle}>启动选项</h2>
        <div className="flex flex-wrap gap-[10px] mt-[6px]">
          {presets.map((p, i) => (
            <PillButton key={i} label={p.label} selected={mode === 'preset' && presetIdx === i} onClick={() => selectPreset(i)} />
          ))}
        </div>

        {/* 高级启动项 + 启动实例 并排 */}
        <div className="flex mt-[16px] flex-1 min-h-0">
          {/* 高级启动项 */}
          <div className="flex-1 min-w-0">
            <h2 className="text-black" style={sectionTitle}>高级启动项</h2>
            <div className="flex flex-wrap gap-[10px] mt-[6px]">
              {advancedItems.map((item, i) => (
                <PillButton key={i} label={item.label} selected={mode === 'advanced' && advancedSelected.has(i)} onClick={() => toggleAdvanced(i)} />
              ))}
            </div>
          </div>

          {/* 分隔线 + 启动实例 */}
          <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0 mx-[30px]" />
          <div className="flex flex-col items-center shrink-0 mr-[100px]">
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
  )
}

export default function Instances() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { toasts, push, remove } = useToast()

  useEffect(() => {
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([, cfg]: [string, any]) => ({
          serial: cfg.serial_number,
          nickname: cfg.nickname || cfg.serial_number,
          absoluteSerial: cfg.absolute_serial ?? 0,
          botType: cfg.bot_type || 'MaiBot',
          version: cfg.version || '',
          qqAccount: cfg.qq_account || '',
        }))
        setInstances(list)
      })
      .catch(() => {})
  }, [])

  const filtered = instances.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return i.nickname.toLowerCase().includes(s) || i.serial.toLowerCase().includes(s)
  })

  const selectedInstance = instances.find(i => i.serial === selected)

  return (
    <>
    <div className="flex flex-col p-6 h-full">
      {/* 页面标题 */}
      <h1 className="text-black shrink-0 mb-[16px]" style={pageTitleStyle}>实例启动/多开</h1>

      {/* 卡片区域 */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* 左侧：实例选择卡片 */}
        <div className="w-[425px] shrink-0">
          <GlassCard>
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
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center h-[120px] rounded-[20px] border-3 border-dashed border-[#9e9e9e]">
                    <span className="text-[#9e9e9e] font-semibold text-base" style={monoFont}>no instance</span>
                  </div>
                ) : (
                  filtered.map((inst, i) => {
                    const isSelected = inst.serial === selected
                    const label = `${inst.nickname}|${inst.serial}|${inst.absoluteSerial}`
                    return (
                      <div key={inst.serial}>
                        {isSelected && i > 0 && <div className="h-[6px]" />}
                        <button
                          className="w-full flex items-center cursor-pointer transition-all duration-300 overflow-hidden"
                          onClick={() => setSelected(inst.serial)}
                          style={{
                            height: 54,
                            padding: isSelected ? '0 20px' : '0 4px',
                            borderRadius: isSelected ? 27 : 6,
                            background: isSelected ? 'rgba(255,255,255,0.6)' : 'transparent',
                            border: isSelected ? '2px solid rgba(0,0,0,0.5)' : '2px solid transparent',
                          }}
                        >
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                          <span className="truncate shrink-0" style={{ ...monoFont, fontSize: 30 }}>{label}</span>
                          <div className="transition-all duration-300" style={{ flex: isSelected ? 1 : 0 }} />
                        </button>
                        {isSelected && i < filtered.length - 1 && <div className="h-[6px]" />}
                        {!isSelected && i < filtered.length - 1 && <hr className="border-[#707070]" />}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 右侧：操作面板 */}
        <div className="flex-1 min-w-0">
          {selectedInstance ? (
            <LaunchPanel instance={selectedInstance} toast={push} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-black/20" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
                请选择一个实例
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
    <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  )
}
