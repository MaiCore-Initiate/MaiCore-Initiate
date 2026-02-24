import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../ui/GlassCard'

const titleStyle = { fontSize: 36, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(5px 3px 5px rgba(0,0,0,0.35))' }
const labelFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }

const granularities = ['日', '周', '月'] as const
type Granularity = typeof granularities[number]

const INSTANCE_COLORS = [
  { bar: '#74ffb5', barEnd: '#3dd68c', line: 'rgba(16,185,129,0.7)' },
  { bar: '#7dd3fc', barEnd: '#38bdf8', line: 'rgba(56,189,248,0.7)' },
  { bar: '#fda4af', barEnd: '#fb7185', line: 'rgba(251,113,133,0.7)' },
  { bar: '#fde68a', barEnd: '#fbbf24', line: 'rgba(251,191,36,0.7)' },
  { bar: '#c4b5fd', barEnd: '#a78bfa', line: 'rgba(167,139,250,0.7)' },
  { bar: '#fdba74', barEnd: '#fb923c', line: 'rgba(251,146,60,0.7)' },
]

interface TimelineItem { period: string; starts: number; stops: number; errors: number; uptime_s: number }
interface SlotItem { starts: number; uptime_m: number }

function pad2(n: number) { return String(n).padStart(2, '0') }

/** 根据粒度生成槽位的 period key 和显示标签 */
function buildSlots(g: Granularity): { keys: string[]; labels: string[] } {
  const now = new Date()
  if (g === '日') {
    // 今天 0:00 ~ 23:00，24个槽位，每槽1小时
    const y = now.getFullYear(), m = pad2(now.getMonth() + 1), d = pad2(now.getDate())
    const keys = Array.from({ length: 24 }, (_, i) => `${y}-${m}-${d}T${pad2(i)}:00:00`)
    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`)
    return { keys, labels }
  }
  if (g === '周') {
    // 往前7天，每天2槽（AM 0-11 / PM 12-23），共14槽
    // 每槽对应12个小时的 hour period keys
    const keys: string[] = []
    const labels: string[] = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const prefix = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
      keys.push(`${prefix}T_AM`) // AM: hours 0-11
      keys.push(`${prefix}T_PM`) // PM: hours 12-23
      const dl = `${dt.getMonth() + 1}/${dt.getDate()}`
      labels.push(`${dl} AM`)
      labels.push(`${dl} PM`)
    }
    return { keys, labels }
  }
  // 月：往前30天，每天1槽
  const keys: string[] = []
  const labels: string[] = []
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    keys.push(`${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`)
    labels.push(`${dt.getMonth() + 1}/${dt.getDate()}`)
  }
  return { keys, labels }
}

function getXLabelInterval(g: Granularity) { return g === '日' ? 3 : g === '周' ? 2 : 5 }

function catmullRomPath(points: { x: number; y: number }[], tension = 0.3, yMax?: number): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  // 指数衰减约束：越接近 yMax，控制点 y 偏移越被削减
  const clampY = (cy: number, anchorY: number) => {
    if (yMax === undefined) return cy
    if (cy <= yMax) return cy
    // 超出部分用指数衰减拉回
    const overshoot = cy - yMax
    const distFromMax = yMax - anchorY
    const k = distFromMax > 0 ? 5 / distFromMax : Infinity
    return yMax + overshoot * Math.exp(-k * overshoot)
  }
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1y = clampY(p1.y + (p2.y - p0.y) * tension, p1.y)
    const cp2y = clampY(p2.y - (p3.y - p1.y) * tension, p2.y)
    d += ` C${p1.x + (p2.x - p0.x) * tension},${cp1y} ${p2.x - (p3.x - p1.x) * tension},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

/** 将 UTC period 字符串转为本地时间的 period key */
function periodToLocal(period: string, granularity: Granularity): string {
  if (granularity === '月') {
    // day period "2026-02-19" → 解析为 UTC 日期，转本地
    const d = new Date(period + 'T12:00:00Z') // 用中午避免跨日
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  // hour period "2026-02-19T09:00:00" → 解析为 UTC，取本地小时
  const d = new Date(period + 'Z')
  const y = d.getFullYear(), m = pad2(d.getMonth() + 1), day = pad2(d.getDate()), h = pad2(d.getHours())
  if (granularity === '周') {
    return `${y}-${m}-${day}T${d.getHours() < 12 ? '_AM' : '_PM'}`
  }
  return `${y}-${m}-${day}T${h}:00:00`
}

/** 将 API 返回的 timeline 数据映射到对应的槽位 */
function timelineToSlots(timeline: TimelineItem[], keys: string[], granularity: Granularity): SlotItem[] {
  const slots = Array.from({ length: keys.length }, () => ({ starts: 0, uptime_m: 0 }))
  const keyIndex = new Map<string, number>()
  keys.forEach((k, i) => keyIndex.set(k, i))

  for (const item of timeline) {
    const localKey = periodToLocal(item.period, granularity)
    if (granularity === '周') {
      const idx = keyIndex.get(localKey)
      if (idx !== undefined) { slots[idx].starts += item.starts; slots[idx].uptime_m += item.uptime_s / 60 }
    } else {
      const idx = keyIndex.get(localKey)
      if (idx !== undefined) { slots[idx].starts += item.starts; slots[idx].uptime_m += item.uptime_s / 60 }
    }
  }
  return slots
}

function niceMax(val: number): number {
  if (val <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  const norm = val / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

export default function DashboardChartCard() {
  const [granularity, setGranularity] = useState<Granularity>('日')
  const [splitByInstance, setSplitByInstance] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<string>('')  // '' = 全部
  const [showInstancePicker, setShowInstancePicker] = useState(false)
  const [instanceSearch, setInstanceSearch] = useState('')
  const pickerBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [instanceIds, setInstanceIds] = useState<string[]>([])
  const [instanceInfo, setInstanceInfo] = useState<Record<string, { nickname: string; serial: string; abs: number }>>({})
  const [instanceTimelines, setInstanceTimelines] = useState<Record<string, TimelineItem[]>>({})

  // 周模式也用 hour 粒度（需要区分 AM/PM），日和周都请求 hour，月请求 day
  const apiGranularity = granularity === '月' ? 'day' : 'hour'
  const apiLimit = granularity === '月' ? 30 : granularity === '周' ? 168 : 24

  // 获取实例列表（stats + webui/instances 合并）
  useEffect(() => {
    fetch('/api/stats/instances', { credentials: 'include' })
      .then(r => r.json()).then((ids: string[]) => setInstanceIds(Array.isArray(ids) ? ids : [])).catch(() => setInstanceIds([]))
    fetch('/api/webui/instances', { credentials: 'include' })
      .then(r => r.json()).then((d: any) => {
        const map: Record<string, { nickname: string; serial: string; abs: number }> = {}
        for (const [, cfg] of Object.entries(d?.instances ?? {}) as [string, any][]) {
          map[cfg.serial_number] = { nickname: cfg.nickname || cfg.serial_number, serial: cfg.serial_number, abs: cfg.absolute_serial ?? 0 }
        }
        setInstanceInfo(map)
      }).catch(() => {})
  }, [])

  // 获取汇总/单实例 timeline
  useEffect(() => {
    const params = new URLSearchParams({ granularity: apiGranularity, limit: String(apiLimit) })
    if (selectedInstance) params.set('instance_id', selectedInstance)
    fetch(`/api/stats/timeline?${params}`, { credentials: 'include' })
      .then(r => r.json()).then((d: TimelineItem[]) => setTimeline(Array.isArray(d) ? d : [])).catch(() => setTimeline([]))
  }, [apiGranularity, apiLimit, selectedInstance])

  // 获取每个实例的 timeline（区分实例模式）
  useEffect(() => {
    if (!splitByInstance || instanceIds.length === 0) return
    Promise.all(instanceIds.map(id =>
      fetch(`/api/stats/timeline?granularity=${apiGranularity}&limit=${apiLimit}&instance_id=${id}`, { credentials: 'include' })
        .then(r => r.json()).then((d: TimelineItem[]) => [id, Array.isArray(d) ? d : []] as const)
        .catch(() => [id, [] as TimelineItem[]] as const)
    )).then(results => {
      const map: Record<string, TimelineItem[]> = {}
      results.forEach(([id, data]) => { map[id] = data })
      setInstanceTimelines(map)
    })
  }, [splitByInstance, instanceIds, apiGranularity, apiLimit])

  const { keys: slotKeys, labels: timeLabels } = useMemo(() => buildSlots(granularity), [granularity])
  const slotCount = slotKeys.length
  const labelInterval = getXLabelInterval(granularity)

  const series = useMemo(() => {
    if (!splitByInstance) return [{ id: '_all', slots: timelineToSlots(timeline, slotKeys, granularity), colorIdx: 0 }]
    return instanceIds.map((id, idx) => ({ id, slots: timelineToSlots(instanceTimelines[id] ?? [], slotKeys, granularity), colorIdx: idx % INSTANCE_COLORS.length }))
  }, [splitByInstance, timeline, instanceIds, instanceTimelines, slotKeys, granularity])

  const rawMaxStarts = Math.max(1, ...series.flatMap(s => s.slots.map(d => d.starts)))
  const rawMaxUptime = Math.max(1, ...series.flatMap(s => s.slots.map(d => d.uptime_m)))
  const maxStarts = niceMax(rawMaxStarts)
  const maxUptime = niceMax(rawMaxUptime)

  // 紧凑 SVG 尺寸
  const chartW = 480, chartH = 220
  const padL = 55, padR = 16, padT = 12, padB = 28
  const plotW = chartW - padL - padR, plotH = chartH - padT - padB

  // 时间分度值：日=min, 周=h, 月=d
  const timeUnit = granularity === '日' ? 'min' : granularity === '周' ? 'h' : 'd'
  const timeDivisor = granularity === '日' ? 1 : granularity === '周' ? 60 : 1440

  const yTicks = 4
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const s = Math.round((maxStarts / (yTicks - 1)) * (yTicks - 1 - i))
    const t = Math.round((maxUptime / timeDivisor / (yTicks - 1)) * (yTicks - 1 - i))
    return `${s}/${t}${timeUnit}`
  })

  const seriesCount = series.length
  const totalBarWidth = Math.max(6, Math.min(26, plotW / slotCount * 0.6))
  const singleBarWidth = seriesCount > 1 ? totalBarWidth / seriesCount : totalBarWidth

  const seriesData = series.map((s, si) => {
    const offset = seriesCount > 1 ? (si - (seriesCount - 1) / 2) * singleBarWidth : 0
    const positions = s.slots.map((d, i) => {
      const x = padL + (i + 0.5) * (plotW / slotCount) + offset
      const barH = maxStarts > 0 ? (d.starts / maxStarts) * plotH : 0
      const lineY = maxUptime > 0 ? padT + plotH - (d.uptime_m / maxUptime) * plotH : padT + plotH
      return { x, barH, barY: padT + plotH - barH, lineY }
    })
    return { ...s, positions, curvePath: catmullRomPath(positions.map(p => ({ x: p.x, y: p.lineY })), 0.3, padT + plotH), color: INSTANCE_COLORS[s.colorIdx] }
  })

  const hasData = series.some(s => s.slots.some(d => d.starts > 0 || d.uptime_m > 0))

  // 胶囊按钮样式
  const pillBtn = (active: boolean) => ({
    width: 44, height: 32, ...labelFont, fontSize: 18, fontWeight: 600 as const,
    background: active ? '#ffffff89' : 'transparent', color: 'rgba(0,0,0,0.7)',
    boxShadow: active ? '0 0 4px rgba(0,0,0,0.2)' : 'none',
    border: active ? '1px solid rgba(0,0,0,0.5)' : '1px solid transparent',
    borderRadius: 16,
  })

  return (
    <GlassCard>
      <div className="px-[24px] py-[20px] flex h-full gap-[16px]">
        {/* 左侧 */}
        <div className="flex flex-col shrink-0" style={{ width: 150 }}>
          <h2 className="text-black pb-[12px]" style={titleStyle}>仪表盘</h2>

          <div className="flex flex-col gap-[4px] mb-[16px]">
            <span className="text-[#707070]" style={{ ...labelFont, fontSize: 17 }}>时间粒度</span>
            <div className="flex rounded-full overflow-hidden" style={{ border: '2px solid #707070', width: 'fit-content' }}>
              {granularities.map(g => (
                <button key={g} onClick={() => setGranularity(g)}
                  className="transition-all cursor-pointer flex items-center justify-center"
                  style={pillBtn(granularity === g)}
                >{g}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[4px]">
            <span className="text-[#707070]" style={{ ...labelFont, fontSize: 17 }}>区分实例</span>
            <div className="flex rounded-full overflow-hidden" style={{ border: '2px solid #707070', width: 'fit-content' }}>
              {(['关', '开'] as const).map(opt => (
                <button key={opt} onClick={() => setSplitByInstance(opt === '开')}
                  className="transition-all cursor-pointer flex items-center justify-center"
                  style={pillBtn((opt === '开') === splitByInstance)}
                >{opt}</button>
              ))}
            </div>
          </div>

          {/* 筛选实例 */}
          <div className="flex flex-col gap-[4px] mt-[16px] backdrop-blur-[50px ">
            <span className="text-[#707070]" style={{ ...labelFont, fontSize: 17 }}>筛选实例</span>
            <button
              ref={pickerBtnRef}
              onClick={() => { setShowInstancePicker(v => !v); setInstanceSearch('') }}
              className="cursor-pointer text-center truncate"
              style={{
                ...labelFont, fontSize: 16, color: 'rgba(0,0,0,0.7)',
                border: '2px solid #707070', borderRadius: 30,
                padding: '5px 14px', background: '#ffffff36', width: 145,
                filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))',
              }}
            >{selectedInstance || '全部'}</button>
          </div>

          {/* 图例放左侧底部 */}
          <div className="mt-auto flex flex-col gap-[4px] pt-[12px]">
            {seriesData.map((s, si) => (
              <div key={`leg${si}`} className="flex items-center gap-[4px]">
                <div className="w-[10px] h-[10px] rounded-[2px]" style={{ background: s.color.bar, border: '1px solid rgba(0,0,0,0.15)' }} />
                <svg width="14" height="7" viewBox="0 0 14 7">
                  <path d="M0,5 C3,5 4,2 7,2 C10,2 11,5 14,5" fill="none" stroke={s.color.line} strokeWidth={1.5} />
                </svg>
                <span style={{ ...labelFont, fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                  {s.id === '_all' ? '全部' : `实例${s.id}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧图表 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="mb-[2px]" style={{ paddingLeft: padL }}>
            <span style={{ ...labelFont, fontSize: 20, color: 'rgba(0,0,0,0.35)' }}>启动次数/启动时间({timeUnit})</span>
          </div>

          <div className="flex-1 min-h-0">
            <svg width="100%" height="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet">
              <defs>
                {seriesData.map((s, si) => (
                  <linearGradient key={`bg${si}`} id={`barGrad${si}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color.bar} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={s.color.barEnd} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>

              {/* 网格线 */}
              {Array.from({ length: yTicks }, (_, i) => {
                const y = padT + (i / (yTicks - 1)) * plotH
                return <line key={`g${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
              })}

              {/* 坐标轴 */}
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
              <polygon points={`${padL},${padT - 6} ${padL - 4},${padT + 2} ${padL + 4},${padT + 2}`} fill="rgba(0,0,0,0.5)" />
              <line x1={padL} y1={padT + plotH} x2={padL + plotW + 8} y2={padT + plotH} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
              <polygon points={`${padL + plotW + 14},${padT + plotH} ${padL + plotW + 6},${padT + plotH - 4} ${padL + plotW + 6},${padT + plotH + 4}`} fill="rgba(0,0,0,0.5)" />

              {/* Y轴标签 */}
              {yLabels.map((label, i) => (
                <text key={`yl${i}`} x={padL - 6} y={padT + (i / (yTicks - 1)) * plotH + 4} textAnchor="end"
                  fontSize={10} fontFamily="'Ubuntu','HarmonyOS Sans SC','Cascadia Code', monospace" fill="rgba(0,0,0,0.45)">{label}</text>
              ))}

              {/* X轴标签 */}
              {timeLabels.map((label, i) => {
                if (!label || i % labelInterval !== 0) return null
                return (
                  <text key={`xl${i}`} x={padL + (i + 0.5) * (plotW / slotCount)} y={padT + plotH + 18} textAnchor="middle"
                    fontSize={10} fontFamily="'Ubuntu','HarmonyOS Sans SC','Cascadia Code', monospace" fill="rgba(0,0,0,0.45)">{label}</text>
                )
              })}

              {/* 柱状图 */}
              {seriesData.map((s, si) => {
                const dimmed = splitByInstance && selectedInstance && s.id !== selectedInstance
                return s.positions.map((p, i) => (
                  <rect key={`b${si}-${i}`} x={p.x - singleBarWidth / 2} y={p.barY} width={singleBarWidth} height={p.barH}
                    fill={`url(#barGrad${si})`} rx={2} opacity={dimmed ? 0.2 : 1} style={{ transition: 'all 0.4s ease' }} />
                ))
              })}

              {/* 平滑曲线 */}
              {seriesData.map((s, si) => {
                if (!s.curvePath) return null
                const dimmed = splitByInstance && selectedInstance && s.id !== selectedInstance
                return (
                  <g key={`c${si}`} opacity={dimmed ? 0.2 : 1} style={{ transition: 'opacity 0.4s ease' }}>
                    <path d={s.curvePath} fill="none" stroke={s.color.line} strokeWidth={2}
                      strokeLinecap="round" style={{ transition: 'all 0.4s ease' }} />
                    {s.positions.map((p, i) => (
                      <circle key={`d${si}-${i}`} cx={p.x} cy={p.lineY} r={2.5}
                        fill="#fff" stroke={s.color.line} strokeWidth={1.5} style={{ transition: 'all 0.4s ease' }} />
                    ))}
                  </g>
                )
              })}

              {!hasData && (
                <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle"
                  fontSize={14} fill="rgba(0,0,0,0.2)" style={labelFont}>暂无数据</text>
              )}
            </svg>
          </div>
        </div>
      </div>
      {showInstancePicker && pickerBtnRef.current && createPortal(
        <InstancePickerPopover
          anchorEl={pickerBtnRef.current}
          pickerRef={pickerRef}
          search={instanceSearch}
          onSearchChange={setInstanceSearch}
          instanceIds={instanceIds}
          instanceInfo={instanceInfo}
          selectedInstance={selectedInstance}
          onSelect={id => { setSelectedInstance(id); setShowInstancePicker(false) }}
          onClose={() => setShowInstancePicker(false)}
        />,
        document.body
      )}
    </GlassCard>
  )
}

function InstancePickerPopover({ anchorEl, pickerRef, search, onSearchChange, instanceIds, instanceInfo, selectedInstance, onSelect, onClose }: {
  anchorEl: HTMLElement
  pickerRef: React.RefObject<HTMLDivElement | null>
  search: string
  onSearchChange: (v: string) => void
  instanceIds: string[]
  instanceInfo: Record<string, { nickname: string; serial: string; abs: number }>
  selectedInstance: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const rect = anchorEl.getBoundingClientRect()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, pickerRef])

  const getLabel = (id: string) => {
    const info = instanceInfo[id]
    return info ? `${info.nickname}|${info.serial}|${info.abs}` : id
  }

  const filtered = instanceIds.filter(id => {
    if (!search) return true
    const s = search.toLowerCase()
    const info = instanceInfo[id]
    return id.toLowerCase().includes(s) || (info && (info.nickname.toLowerCase().includes(s) || info.serial.toLowerCase().includes(s)))
  })

  return (
    <div className="fixed animate-scale-fade-in" style={{ zIndex: 9999, top: Math.min(rect.top, window.innerHeight - 300), left: rect.right + 8 }}>
      <div
        ref={pickerRef}
        className="relative w-[218px] rounded-[30px] flex flex-col p-[16px] gap-[10px] backdrop-blur-[50px]"
        style={{ background: 'rgba(255, 255, 255, 0)', border: '2px solid rgba(0,0,0,0.48)', filter: 'drop-shadow(6px 6px 4px rgba(0,0,0,0.35))' }}
      >
        {/* 搜索框 */}
        <div className="flex items-center h-[44px] px-[14px] gap-[8px] rounded-[22px] bg-white/60 border-2 border-black/50 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
            <line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <input
            value={search} onChange={e => onSearchChange(e.target.value)}
            placeholder="Search instance"
            className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
            style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 13 }}
            autoFocus
          />
        </div>
        {/* 列表 */}
        <div className="max-h-[200px] overflow-y-auto">
          <button
            onClick={() => onSelect('')}
            className="w-full text-left py-[4px] hover:bg-black/5 rounded-[4px] cursor-pointer transition-colors"
            style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 16, fontWeight: selectedInstance === '' ? 700 : 400 }}
          >全部</button>
          <hr className="border-[#707070]" />
          {filtered.map((id, i) => (
            <div key={id}>
              <button
                onClick={() => onSelect(id)}
                className="w-full text-left py-[4px] hover:bg-black/5 rounded-[4px] cursor-pointer transition-colors truncate"
                style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 16, fontWeight: selectedInstance === id ? 700 : 400 }}
              >{getLabel(id)}</button>
              {i < filtered.length - 1 && <hr className="border-[#707070]" />}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-[10px] text-center text-black/20" style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 14 }}>
              no instance
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
