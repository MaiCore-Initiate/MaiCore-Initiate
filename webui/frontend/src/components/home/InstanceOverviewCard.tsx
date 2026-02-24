import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../ui/GlassCard'
import { useNotification } from '../ui/Notification'

const labelFont = { fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 20, fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace", color: '#585858' }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }

interface Instance {
  serial: string
  name: string
  status: string
}

function AddInstancePopover({ anchorRef, instances, onSelect, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  instances: Instance[]
  onSelect: (inst: Instance) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 8, left: rect.right - 327 })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = instances.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.serial.includes(search)
  )

  if (!pos) return null

  return createPortal(
    <div className="fixed animate-scale-fade-in" style={{ zIndex: 9999, top: pos.top, left: pos.left }}>
      <div
        ref={ref}
        className="relative w-[327px] rounded-[30px] bg-white/1 flex flex-col p-[20px] gap-[12px] backdrop-blur-[50px]"
      >
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ borderRadius: 30, border: '2px solid #0000007c', filter: 'drop-shadow(6px 6px 4px rgba(0,0,0,0.35))' }}
      />
      <div className="flex items-center h-[44px] px-[16px] gap-[10px] rounded-[22px] bg-white/60 border-2 border-black/50 shrink-0">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="shrink-0">
          <circle cx="9" cy="9" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
          <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search instance"
          className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20 text-sm"
          style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }}
          autoFocus
        />
      </div>
      <div className="flex-1 max-h-[240px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] rounded-[20px] border-3 border-dashed border-[#9e9e9e]">
            <span className="text-[#9e9e9e] font-semibold text-base" style={{ fontFamily: "'Segoe UI', 'HarmonyOS Sans SC', sans-serif" }}>no instance</span>
          </div>
        ) : (
          <div className="px-[6px]">
            {filtered.map((inst, i) => (
              <div key={inst.serial}>
                <button
                  onClick={() => onSelect(inst)}
                  className="w-full text-left py-[6px] hover:bg-black/5 rounded-[6px] px-[4px] cursor-pointer transition-colors text-sm"
                  style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }}
                >
                  {inst.name}|{inst.serial}
                </button>
                {i < filtered.length - 1 && <hr className="border-[#707070]" />}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body
  )
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${(seconds / 3600).toFixed(1)}h`
}

export default function InstanceOverviewCard() {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<Instance[]>([])
  const [showPopover, setShowPopover] = useState(false)
  const [favorites, setFavorites] = useState<Instance[]>([])
  const [summary, setSummary] = useState<{ launch_count: number; total_uptime_s: number; error_count: number } | null>(null)
  const [launching, setLaunching] = useState<string | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  // 从后端加载收藏实例
  useEffect(() => {
    fetch('/api/preferences/favorite_instances', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setFavorites(d.value) })
      .catch(() => {})
  }, [])

  const saveFavorites = (next: Instance[]) => {
    setFavorites(next)
    fetch('/api/preferences/favorite_instances', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ value: next }),
    }).catch(() => {})
  }

  const quickLaunch = async (serial: string) => {
    let opts: { components: string[]; useNapcatShell: boolean } | null = null
    try {
      const r = await fetch(`/api/preferences/launch_opts_${serial}`, { credentials: 'include' })
      if (r.ok) { const d = await r.json(); opts = d.value }
    } catch {}
    if (!opts) { notify('该实例没有上次启动记录，请先在实例页面启动一次', 'warning'); return }
    setLaunching(serial)
    try {
      const res = await fetch(`/api/launcher/instances/${serial}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ serial_number: serial, components: opts.components, use_napcat_shell: opts.useNapcatShell }),
      })
      const data = await res.json()
      if (data.success !== false) { notify('快捷启动成功', 'success') }
      else { notify(data.detail || data.message || '启动失败', 'error') }
    } catch { notify('启动请求失败', 'error') }
    setLaunching(null)
  }

  useEffect(() => {
    // 从 webui/instances 获取实例列表
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const map = d?.instances ?? {}
        const list: Instance[] = Object.entries(map).map(([key, cfg]: [string, any]) => ({
          serial: cfg.serial_number || key,
          name: cfg.nickname || key,
          status: 'stopped',
        }))
        setInstances(list)
      })
      .catch(() => {})

    // 获取统计摘要
    fetch('/api/stats/summary', { credentials: 'include' })
      .then(r => r.json())
      .then(setSummary)
      .catch(() => {})
  }, [])

  const running = instances.filter(i => i.status === 'running').length
  const stopped = instances.length - running

  const stats = [
    ['注册实例', `${instances.length} 例`],
    ['已启动实例', `${running} 例`],
    ['未启动实例', `${stopped} 例`],
    ['启动次数', summary ? `${summary.launch_count} 次` : '- 次'],
    ['启动时长', summary ? formatUptime(summary.total_uptime_s) : '- h'],
  ]

  const displayList = favorites.length > 0 ? favorites : instances
  const isFavMode = favorites.length > 0

  return (
    <GlassCard>
      <div className="p-[33px] flex flex-col h-full">
        <h2 className="text-black pb-[16px]" style={titleStyle}>实例概览</h2>

        <div className="flex flex-1 gap-0">
          {/* 左侧统计 */}
          <div className="space-y-[6px] pr-[24px]">
            {stats.map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-[16px]">
                <span className="text-black shrink-0 w-[100px]" style={labelFont}>{label}</span>
                <span style={valueFont}>{val}</span>
              </div>
            ))}
          </div>

          {/* 分隔线 */}
          <div className="w-[3px] self-stretch bg-black/50 rounded-full shrink-0" />

          {/* 右侧常用实例 */}
          <div className="flex-1 pl-[24px] flex flex-col relative">
            <span className="text-black mb-[12px]" style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
              常用实例/快捷启动
            </span>
            <div className="flex-1 relative">
              {displayList.length === 0 ? (
                <div className="flex items-center justify-center h-full rounded-[20px] border-2 border-dashed border-black/15 relative">
                  <span className="text-black/20" style={{ fontSize: 20, fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }}>No instances</span>
                  <button
                    ref={addBtnRef}
                    onClick={() => setShowPopover(v => !v)}
                    className="absolute bottom-[8px] right-[8px] w-[36px] h-[36px] rounded-full border border-black/15 flex items-center justify-center text-black/20 hover:text-black/40 hover:border-black/30 transition-colors cursor-pointer"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="6" y1="0" x2="6" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-[10px]">
                    {displayList.slice(0, 6).map(inst => (
                      <div
                        key={inst.serial}
                        onClick={() => quickLaunch(inst.serial)}
                        className="flex items-center gap-[8px] px-[16px] h-[40px] rounded-[20px] border-2 border-[#707070] cursor-pointer hover:bg-white/30 transition-all"
                        style={{ filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))', opacity: launching === inst.serial ? 0.5 : 1 }}
                      >
                        {launching === inst.serial && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black/50 shrink-0" />}
                        <span className="truncate max-w-[90px]" style={{ fontSize: 20, fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }}>
                          {inst.name}
                        </span>
                        {isFavMode && (
                        <button
                          onClick={() => saveFavorites(favorites.filter(x => x.serial !== inst.serial))}
                          className="text-black/40 hover:text-black/70 transition-colors cursor-pointer"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <line x2="14.142" transform="rotate(45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <line x2="14.142" transform="translate(0 10) rotate(-45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    ref={addBtnRef}
                    onClick={() => setShowPopover(v => !v)}
                    className="absolute bottom-0 right-0 w-[50px] h-[50px] rounded-full border-2 border-[#707070] flex items-center justify-center text-black/60 hover:text-black/80 transition-colors cursor-pointer"
                    style={{ filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))' }}
                  >
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" style={{ transform: 'rotate(45deg)' }}>
                      <line x2="24.042" transform="rotate(45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      <line x2="24.042" transform="translate(0 17) rotate(-45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}
              {showPopover && (
                <AddInstancePopover
                  anchorRef={addBtnRef}
                  instances={instances}
                  onSelect={inst => {
                    if (!favorites.find(f => f.serial === inst.serial)) {
                      saveFavorites([...favorites, inst])
                    }
                    setShowPopover(false)
                  }}
                  onClose={() => setShowPopover(false)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
