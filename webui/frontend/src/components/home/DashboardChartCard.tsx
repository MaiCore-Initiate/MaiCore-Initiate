import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../ui/GlassCard'
import { useTheme } from '../theme/ThemeProvider'

// ─── 常量与类型 ──────────────────────────────────────────────

const titleStyle = {
  fontSize: 36,
  fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
  filter: 'drop-shadow(5px 3px 5px rgba(0,0,0,0.35))',
}
const labelFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }

const granularities = ['日', '周', '月'] as const
type Granularity = (typeof granularities)[number]

const INSTANCE_COLORS = [
  { bar: '#74ffb5', barEnd: '#3dd68c', line: 'rgba(16,185,129,0.7)' },
  { bar: '#7dd3fc', barEnd: '#38bdf8', line: 'rgba(56,189,248,0.7)' },
  { bar: '#fda4af', barEnd: '#fb7185', line: 'rgba(251,113,133,0.7)' },
  { bar: '#fde68a', barEnd: '#fbbf24', line: 'rgba(251,191,36,0.7)' },
  { bar: '#c4b5fd', barEnd: '#a78bfa', line: 'rgba(167,139,250,0.7)' },
  { bar: '#fdba74', barEnd: '#fb923c', line: 'rgba(251,146,60,0.7)' },
]

interface TimelineItem {
  period: string
  starts: number
  stops: number
  errors: number
  uptime_s: number
}
interface SlotItem {
  starts: number
  uptime_m: number
}

// ─── 工具函数 ──────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function slotCapMinutes(g: Granularity): number {
  switch (g) {
    case '日':
      return 60
    case '周':
      return 720
    case '月':
      return 1440
  }
}

function buildSlots(g: Granularity): { keys: string[]; labels: string[] } {
  const now = new Date()
  if (g === '日') {
    const y = now.getFullYear(),
      m = pad2(now.getMonth() + 1),
      d = pad2(now.getDate())
    const keys = Array.from({ length: 24 }, (_, i) => `${y}-${m}-${d}T${pad2(i)}:00:00`)
    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`)
    return { keys, labels }
  }
  if (g === '周') {
    const keys: string[] = [],
      labels: string[] = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const prefix = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
      keys.push(`${prefix}T_AM`, `${prefix}T_PM`)
      const dl = `${dt.getMonth() + 1}/${dt.getDate()}`
      labels.push(`${dl} AM`, `${dl} PM`)
    }
    return { keys, labels }
  }
  const keys: string[] = [],
    labels: string[] = []
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    keys.push(`${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`)
    labels.push(`${dt.getMonth() + 1}/${dt.getDate()}`)
  }
  return { keys, labels }
}

function getXLabelInterval(g: Granularity) {
  return g === '日' ? 3 : g === '周' ? 2 : 5
}

function catmullRomPath(points: { x: number; y: number }[], tension = 0.3, yMax?: number): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  const clampY = (cy: number, anchorY: number) => {
    if (yMax === undefined) return cy
    if (cy <= yMax) return cy
    const overshoot = cy - yMax
    const distFromMax = yMax - anchorY
    const k = distFromMax > 0 ? 5 / distFromMax : Infinity
    return yMax + overshoot * Math.exp(-k * overshoot)
  }
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1y = clampY(p1.y + (p2.y - p0.y) * tension, p1.y)
    const cp2y = clampY(p2.y - (p3.y - p1.y) * tension, p2.y)
    d += ` C${p1.x + (p2.x - p0.x) * tension},${cp1y} ${p2.x - (p3.x - p1.x) * tension},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

function periodToLocal(period: string, granularity: Granularity): string {
  if (granularity === '月') {
    // 后端返回的是 UTC 日期字符串（如 "2026-03-14"），直接返回即可
    return period
  }
  // 后端返回的是 UTC 时间字符串（如 "2026-03-14T08:00:00"）
  // 需要转换为本地时区的对应时间槽位
  const d = new Date(period + 'Z') // 明确标记为 UTC 时间
  const y = d.getFullYear(),
    m = pad2(d.getMonth() + 1),
    day = pad2(d.getDate()),
    h = d.getHours()
  if (granularity === '周') return `${y}-${m}-${day}T${h < 12 ? '_AM' : '_PM'}`
  return `${y}-${m}-${day}T${pad2(h)}:00:00`
}

function timelineToSlots(
  timeline: TimelineItem[],
  keys: string[],
  granularity: Granularity,
): SlotItem[] {
  const cap = slotCapMinutes(granularity)
  const slots = Array.from({ length: keys.length }, () => ({ starts: 0, uptime_m: 0 }))
  const keyIndex = new Map<string, number>()
  keys.forEach((k, i) => keyIndex.set(k, i))
  for (const item of timeline) {
    const localKey = periodToLocal(item.period, granularity)
    const idx = keyIndex.get(localKey)
    if (idx !== undefined) {
      slots[idx].starts += item.starts
      slots[idx].uptime_m += item.uptime_s / 60
    }
  }
  for (const slot of slots) {
    slot.uptime_m = Math.min(slot.uptime_m, cap)
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

function formatUptime(minutes: number, granularity: Granularity): string {
  if (granularity === '日') return `${minutes.toFixed(1)} min`
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes.toFixed(1)} min`
}

// ─── 平滑跟随 Hook ─────────────────────────────────────────

interface SmoothPos {
  x: number
  y: number
}

/**
 * 用 lerp + rAF 实现平滑跟随
 * @param target  目标位置 (null = 隐藏)
 * @param speed   追赶速度 0~1，越大越快，0.15~0.25 体感丝滑
 */
function useSmoothFollow(target: SmoothPos | null, speed = 0.18) {
  const currentRef = useRef<SmoothPos | null>(null)
  const targetRef = useRef<SmoothPos | null>(null)
  const rafRef = useRef(0)
  const [pos, setPos] = useState<SmoothPos | null>(null)

  // 始终保持最新目标
  targetRef.current = target

  useEffect(() => {
    // 目标消失 → 停止动画，立刻隐藏
    if (target === null) {
      cancelAnimationFrame(rafRef.current)
      currentRef.current = null
      setPos(null)
      return
    }

    // 首次出现 → 直接跳到目标位置（不做动画）
    if (currentRef.current === null) {
      currentRef.current = { ...target }
      setPos({ ...target })
    }

    const tick = () => {
      const cur = currentRef.current!
      const tgt = targetRef.current
      if (!tgt) return

      const dx = tgt.x - cur.x
      const dy = tgt.y - cur.y

      // 距离足够小就直接吸附，避免永远追不上
      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
        cur.x = tgt.x
        cur.y = tgt.y
      } else {
        cur.x += dx * speed
        cur.y += dy * speed
      }

      setPos({ x: cur.x, y: cur.y })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target !== null, speed])

  // target 变化时不重启动画循环，只更新 ref（循环内自动读取）
  return pos
}

// ─── Tooltip 浮窗组件 ──────────────────────────────────────

interface TooltipData {
  timeLabel: string
  entries: {
    id: string
    starts: number
    uptime_m: number
    color: (typeof INSTANCE_COLORS)[number]
  }[]
}

function ChartTooltip({
  data,
  pos,
  containerW,
  containerH,
  granularity,
}: {
  data: TooltipData
  pos: SmoothPos
  containerW: number
  containerH: number
  granularity: Granularity
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    if (tipRef.current) {
      setSize({ w: tipRef.current.offsetWidth, h: tipRef.current.offsetHeight })
    }
  }, [data])

  const offset = 16
  let left = pos.x + offset
  let top = pos.y + offset

  if (size.w > 0) {
    if (left + size.w > containerW - 8) left = pos.x - size.w - offset
    if (top + size.h > containerH - 8) top = pos.y - size.h - offset
    left = Math.max(4, left)
    top = Math.max(4, top)
  }

  const totalStarts = data.entries.reduce((s, e) => s + e.starts, 0)
  const totalUptime = data.entries.reduce((s, e) => s + e.uptime_m, 0)
  const showTotal = data.entries.length > 1

  return (
    <div
      ref={tipRef}
      className="absolute rounded-[10px] px-[12px] py-[8px]"
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
        top: 0,
        left: 0,
        border: '1px solid rgba(0,0,0,0.15)',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
        pointerEvents: 'none',
        zIndex: 10,
        minWidth: 140,
        willChange: 'transform',
      }}
    >
      <div
        className="pb-[4px] mb-[4px]"
        style={{
          ...labelFont,
          fontSize: 13,
          fontWeight: 700,
          color: 'rgba(0,0,0,0.7)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {data.timeLabel}
      </div>
      {data.entries.map((d, i) => (
        <div key={i} className="flex items-center gap-[6px] py-[1px]" style={{ ...monoFont, fontSize: 12 }}>
          <span
            className="inline-block w-[8px] h-[8px] rounded-[2px] shrink-0"
            style={{ background: d.color.bar, border: '1px solid rgba(0,0,0,0.1)' }}
          />
          <span style={{ color: 'rgba(0,0,0,0.5)', minWidth: 40 }}>
            {d.id === '_all' ? '全部' : `#${d.id}`}
          </span>
          <span style={{ color: 'rgba(0,0,0,0.75)', fontWeight: 600 }}>{d.starts}</span>
          <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10 }}>次</span>
          <span style={{ color: 'rgba(0,0,0,0.3)', margin: '0 2px' }}>|</span>
          <span style={{ color: 'rgba(0,0,0,0.75)', fontWeight: 600 }}>
            {formatUptime(d.uptime_m, granularity)}
          </span>
        </div>
      ))}
      {showTotal && (
        <div
          className="flex items-center gap-[6px] pt-[4px] mt-[4px]"
          style={{ ...monoFont, fontSize: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}
        >
          <span className="inline-block w-[8px] h-[8px] rounded-full shrink-0" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <span style={{ color: 'rgba(0,0,0,0.5)', minWidth: 40 }}>合计</span>
          <span style={{ color: 'rgba(0,0,0,0.75)', fontWeight: 600 }}>{totalStarts}</span>
          <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10 }}>次</span>
          <span style={{ color: 'rgba(0,0,0,0.3)', margin: '0 2px' }}>|</span>
          <span style={{ color: 'rgba(0,0,0,0.75)', fontWeight: 600 }}>
            {formatUptime(totalUptime, granularity)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── 实例选择弹出层 ────────────────────────────────────────

function InstancePickerPopover({
  anchorEl,
  pickerRef,
  search,
  onSearchChange,
  instanceIds,
  instanceInfo,
  selectedInstance,
  onSelect,
  onClose,
}: {
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

  const filtered = instanceIds.filter((id) => {
    if (!search) return true
    const s = search.toLowerCase()
    const info = instanceInfo[id]
    return (
      id.toLowerCase().includes(s) ||
      (info && (info.nickname.toLowerCase().includes(s) || info.serial.toLowerCase().includes(s)))
    )
  })

  return (
    <div
      className="fixed animate-scale-fade-in"
      style={{ zIndex: 9999, top: Math.min(rect.top, window.innerHeight - 300), left: rect.right + 8 }}
    >
      <div
        ref={pickerRef}
        className="relative w-[218px] rounded-[30px] flex flex-col p-[16px] gap-[10px] backdrop-blur-[50px]"
        style={{
          background: 'rgba(255, 255, 255, 0)',
          border: '2px solid rgba(0,0,0,0.48)',
          filter: 'drop-shadow(6px 6px 4px rgba(0,0,0,0.35))',
        }}
      >
        <div className="flex items-center h-[44px] px-[14px] gap-[8px] rounded-[22px] bg-white/60 border-2 border-black/50 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="9.5" cy="9.5" r="7.5" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />
            <line x1="15" y1="15.5" x2="22" y2="23" stroke="rgba(0,0,0,0.5)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search instance"
            className="flex-1 bg-transparent outline-none text-black placeholder:text-black/20"
            style={{ ...monoFont, fontSize: 13 }}
            autoFocus
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          <button
            onClick={() => onSelect('')}
            className="w-full text-left py-[4px] hover:bg-black/5 rounded-[4px] cursor-pointer transition-colors"
            style={{ ...monoFont, fontSize: 16, fontWeight: selectedInstance === '' ? 700 : 400 }}
          >
            全部
          </button>
          <hr className="border-[#707070]" />
          {filtered.map((id, i) => (
            <div key={id}>
              <button
                onClick={() => onSelect(id)}
                className="w-full text-left py-[4px] hover:bg-black/5 rounded-[4px] cursor-pointer transition-colors truncate"
                style={{ ...monoFont, fontSize: 16, fontWeight: selectedInstance === id ? 700 : 400 }}
              >
                {getLabel(id)}
              </button>
              {i < filtered.length - 1 && <hr className="border-[#707070]" />}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-[10px] text-center text-black/20" style={{ ...monoFont, fontSize: 14 }}>
              no instance
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────

export default function DashboardChartCard() {
  const { isDark } = useTheme()
  const [granularity, setGranularity] = useState<Granularity>('日')
  const [splitByInstance, setSplitByInstance] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState('')
  const [showInstancePicker, setShowInstancePicker] = useState(false)
  const [instanceSearch, setInstanceSearch] = useState('')
  const pickerBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [instanceIds, setInstanceIds] = useState<string[]>([])
  const [instanceInfo, setInstanceInfo] = useState<Record<string, { nickname: string; serial: string; abs: number }>>({})
  const [instanceTimelines, setInstanceTimelines] = useState<Record<string, TimelineItem[]>>({})

  const apiGranularity = granularity === '月' ? 'day' : 'hour'
  const apiLimit = granularity === '月' ? 30 : granularity === '周' ? 168 : 24

  // ── 数据获取 ──

  useEffect(() => {
    fetch('/api/stats/instances', { credentials: 'include' })
      .then((r) => r.json())
      .then((ids: string[]) => setInstanceIds(Array.isArray(ids) ? ids : []))
      .catch(() => setInstanceIds([]))
    fetch('/api/webui/instances', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: any) => {
        const map: Record<string, { nickname: string; serial: string; abs: number }> = {}
        for (const [, cfg] of Object.entries(d?.instances ?? {}) as [string, any][]) {
          map[cfg.serial_number] = {
            nickname: cfg.nickname || cfg.serial_number,
            serial: cfg.serial_number,
            abs: cfg.absolute_serial ?? 0,
          }
        }
        setInstanceInfo(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams({ granularity: apiGranularity, limit: String(apiLimit) })
    if (selectedInstance) params.set('instance_id', selectedInstance)
    fetch(`/api/stats/timeline?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: TimelineItem[]) => setTimeline(Array.isArray(d) ? d : []))
      .catch(() => setTimeline([]))
  }, [apiGranularity, apiLimit, selectedInstance])

  useEffect(() => {
    if (!splitByInstance || instanceIds.length === 0) return
    Promise.all(
      instanceIds.map((id) =>
        fetch(`/api/stats/timeline?granularity=${apiGranularity}&limit=${apiLimit}&instance_id=${id}`, { credentials: 'include' })
          .then((r) => r.json())
          .then((d: TimelineItem[]) => [id, Array.isArray(d) ? d : []] as const)
          .catch(() => [id, [] as TimelineItem[]] as const),
      ),
    ).then((results) => {
      const map: Record<string, TimelineItem[]> = {}
      results.forEach(([id, data]) => { map[id] = data })
      setInstanceTimelines(map)
    })
  }, [splitByInstance, instanceIds, apiGranularity, apiLimit])

  // ── 图表计算 ──

  const { keys: slotKeys, labels: timeLabels } = useMemo(() => buildSlots(granularity), [granularity])
  const slotCount = slotKeys.length
  const labelInterval = getXLabelInterval(granularity)

  const series = useMemo(() => {
    if (!splitByInstance) return [{ id: '_all', slots: timelineToSlots(timeline, slotKeys, granularity), colorIdx: 0 }]
    return instanceIds.map((id, idx) => ({
      id,
      slots: timelineToSlots(instanceTimelines[id] ?? [], slotKeys, granularity),
      colorIdx: idx % INSTANCE_COLORS.length,
    }))
  }, [splitByInstance, timeline, instanceIds, instanceTimelines, slotKeys, granularity])

  const rawMaxStarts = Math.max(1, ...series.flatMap((s) => s.slots.map((d) => d.starts)))
  const rawMaxUptime = Math.max(1, ...series.flatMap((s) => s.slots.map((d) => d.uptime_m)))
  const maxStarts = niceMax(rawMaxStarts)
  const maxUptime = niceMax(rawMaxUptime)

  const chartW = 480, chartH = 220
  const padL = 55, padR = 16, padT = 12, padB = 28
  const plotW = chartW - padL - padR, plotH = chartH - padT - padB

  const timeUnit = granularity === '日' ? 'min' : granularity === '周' ? 'h' : 'd'
  const timeDivisor = granularity === '日' ? 1 : granularity === '周' ? 60 : 1440

  const yTicks = 4
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const s = Math.round((maxStarts / (yTicks - 1)) * (yTicks - 1 - i))
    const t = Math.round((maxUptime / timeDivisor / (yTicks - 1)) * (yTicks - 1 - i))
    return `${s}/${t}${timeUnit}`
  })

  const seriesCount = series.length
  const totalBarWidth = Math.max(6, Math.min(26, (plotW / slotCount) * 0.6))
  const singleBarWidth = seriesCount > 1 ? totalBarWidth / seriesCount : totalBarWidth

  const seriesData = series.map((s, si) => {
    const offset = seriesCount > 1 ? (si - (seriesCount - 1) / 2) * singleBarWidth : 0
    const positions = s.slots.map((d, i) => {
      const x = padL + (i + 0.5) * (plotW / slotCount) + offset
      const barH = maxStarts > 0 ? (d.starts / maxStarts) * plotH : 0
      const lineY = maxUptime > 0 ? padT + plotH - (d.uptime_m / maxUptime) * plotH : padT + plotH
      return { x, barH, barY: padT + plotH - barH, lineY }
    })
    return {
      ...s,
      positions,
      curvePath: catmullRomPath(positions.map((p) => ({ x: p.x, y: p.lineY })), 0.3, padT + plotH),
      color: INSTANCE_COLORS[s.colorIdx],
    }
  })

  const hasData = series.some((s) => s.slots.some((d) => d.starts > 0 || d.uptime_m > 0))

  // ── Hover 状态 ──

  const [hoverSlot, setHoverSlot] = useState<{
    slotIdx: number
    svgX: number
    mouseX: number
    mouseY: number
  } | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)

  // 平滑跟随：把目标位置传给 hook，拿到插值后的位置
  const smoothTarget = useMemo<SmoothPos | null>(
    () => (hoverSlot ? { x: hoverSlot.mouseX, y: hoverSlot.mouseY } : null),
    [hoverSlot],
  )
  const smoothPos = useSmoothFollow(smoothTarget, 0.18)

  const handleMouseMove = useCallback(
    (evt: ReactMouseEvent<SVGSVGElement>) => {
      const svg = evt.currentTarget
      const svgRect = svg.getBoundingClientRect()
      const wrapRect = chartWrapRef.current?.getBoundingClientRect()
      if (svgRect.width <= 0 || !wrapRect) return

      const svgX = ((evt.clientX - svgRect.left) / svgRect.width) * chartW
      const plotX = svgX - padL
      if (plotX < 0 || plotX > plotW) {
        setHoverSlot(null)
        return
      }

      const slotIdx = Math.floor((plotX / plotW) * slotCount)
      if (slotIdx >= 0 && slotIdx < slotCount) {
        const centerSvgX = padL + (slotIdx + 0.5) * (plotW / slotCount)
        setHoverSlot({
          slotIdx,
          svgX: centerSvgX,
          mouseX: evt.clientX - wrapRect.left,
          mouseY: evt.clientY - wrapRect.top,
        })
      }
    },
    [slotCount, chartW, padL, plotW],
  )

  const handleMouseLeave = useCallback(() => setHoverSlot(null), [])

  const tooltipData = useMemo<TooltipData | null>(() => {
    if (hoverSlot == null) return null
    const { slotIdx } = hoverSlot
    return {
      timeLabel: timeLabels[slotIdx] || '',
      entries: seriesData.map((s) => ({
        id: s.id,
        starts: s.slots[slotIdx]?.starts ?? 0,
        uptime_m: s.slots[slotIdx]?.uptime_m ?? 0,
        color: s.color,
      })),
    }
  }, [hoverSlot, seriesData, timeLabels])

  // ── UI ──

  const pillBtn = (active: boolean) => ({
    width: 44,
    height: 32,
    ...labelFont,
    fontSize: 18,
    fontWeight: 600 as const,
    background: active ? (isDark ? 'rgba(255,255,255,0.18)' : '#ffffff89') : 'transparent',
    color: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.7)',
    boxShadow: active ? (isDark ? '0 0 10px rgba(255,255,255,0.06)' : '0 0 4px rgba(0,0,0,0.2)') : 'none',
    border: active ? `1px solid ${isDark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.5)'}` : '1px solid transparent',
    borderRadius: 16,
  })

  return (
    <GlassCard bgOpacity={isDark ? 0.72 : 0.45} borderColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.5)'}>
      <div className="px-[24px] py-[20px] flex h-full gap-[16px]">
        {/* 左侧面板 */}
        <div className="flex flex-col shrink-0" style={{ width: 150 }}>
          <h2 className="pb-[12px]" style={{ ...titleStyle, color: isDark ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.92)' }}>仪表盘</h2>

          <div className="flex flex-col gap-[4px] mb-[16px]">
            <span style={{ ...labelFont, fontSize: 17, color: isDark ? 'rgba(255,255,255,0.68)' : '#707070' }}>时间粒度</span>
            <div className="flex rounded-full overflow-hidden" style={{ border: `2px solid ${isDark ? 'rgba(255,255,255,0.3)' : '#707070'}`, width: 'fit-content', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
              {granularities.map((g) => (
                <button key={g} onClick={() => setGranularity(g)} className="transition-all cursor-pointer flex items-center justify-center" style={pillBtn(granularity === g)}>{g}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[4px]">
            <span style={{ ...labelFont, fontSize: 17, color: isDark ? 'rgba(255,255,255,0.68)' : '#707070' }}>区分实例</span>
            <div className="flex rounded-full overflow-hidden" style={{ border: `2px solid ${isDark ? 'rgba(255,255,255,0.3)' : '#707070'}`, width: 'fit-content', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
              {(['关', '开'] as const).map((opt) => (
                <button key={opt} onClick={() => setSplitByInstance(opt === '开')} className="transition-all cursor-pointer flex items-center justify-center" style={pillBtn((opt === '开') === splitByInstance)}>{opt}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[4px] mt-[16px]">
            <span style={{ ...labelFont, fontSize: 17, color: isDark ? 'rgba(255,255,255,0.68)' : '#707070' }}>筛选实例</span>
            <button
              ref={pickerBtnRef}
              onClick={() => { setShowInstancePicker((v) => !v); setInstanceSearch('') }}
              className="cursor-pointer text-center truncate"
              style={{
                ...labelFont, fontSize: 16, color: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.7)',
                border: `2px solid ${isDark ? 'rgba(255,255,255,0.3)' : '#707070'}`, borderRadius: 30,
                padding: '5px 14px', background: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff36', width: 145,
                filter: 'drop-shadow(3px 3px 3px rgba(0,0,0,0.16))',
              }}
            >{selectedInstance || '全部'}</button>
          </div>

          <div className="mt-auto flex flex-col gap-[4px] pt-[12px]">
            {seriesData.map((s, si) => (
              <div key={`leg${si}`} className="flex items-center gap-[4px]">
                <div className="w-[10px] h-[10px] rounded-[2px]" style={{ background: s.color.bar, border: `1px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'}` }} />
                <svg width="14" height="7" viewBox="0 0 14 7">
                  <path d="M0,5 C3,5 4,2 7,2 C10,2 11,5 14,5" fill="none" stroke={s.color.line} strokeWidth={1.5} />
                </svg>
                <span style={{ ...labelFont, fontSize: 11, color: isDark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.45)' }}>
                  {s.id === '_all' ? '全部' : `实例${s.id}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧图表 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="mb-[2px]" style={{ paddingLeft: padL }}>
            <span style={{ ...labelFont, fontSize: 20, color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)' }}>
              启动次数/启动时间({timeUnit})
            </span>
          </div>

          <div ref={chartWrapRef} className="flex-1 min-h-0 relative" style={{ overflow: 'hidden' }}>
            <svg
              width="100%" height="100%"
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
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
                return <line key={`g${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'} strokeWidth={1} />
              })}

              {/* 坐标轴 */}
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.5)'} strokeWidth={2} />
              <polygon points={`${padL},${padT - 6} ${padL - 4},${padT + 2} ${padL + 4},${padT + 2}`} fill={isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.5)'} />
              <line x1={padL} y1={padT + plotH} x2={padL + plotW + 8} y2={padT + plotH} stroke={isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.5)'} strokeWidth={2} />
              <polygon points={`${padL + plotW + 14},${padT + plotH} ${padL + plotW + 6},${padT + plotH - 4} ${padL + plotW + 6},${padT + plotH + 4}`} fill={isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.5)'} />

              {/* Y轴标签 */}
              {yLabels.map((label, i) => (
                <text key={`yl${i}`} x={padL - 6} y={padT + (i / (yTicks - 1)) * plotH + 4} textAnchor="end"
                  fontSize={10} fontFamily="'Ubuntu','HarmonyOS Sans SC','Cascadia Code', monospace" fill={isDark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.45)'}>{label}</text>
              ))}

              {/* X轴标签 */}
              {timeLabels.map((label, i) => {
                if (!label || i % labelInterval !== 0) return null
                return (
                  <text key={`xl${i}`} x={padL + (i + 0.5) * (plotW / slotCount)} y={padT + plotH + 18} textAnchor="middle"
                    fontSize={10} fontFamily="'Ubuntu','HarmonyOS Sans SC','Cascadia Code', monospace" fill={isDark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.45)'}>{label}</text>
                )
              })}

              {/* Hover 高亮背景 */}
              {hoverSlot && (
                <rect
                  x={padL + hoverSlot.slotIdx * (plotW / slotCount)}
                  y={padT} width={plotW / slotCount} height={plotH}
                  fill={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'} rx={2}
                />
              )}

              {/* 柱状图 */}
              {seriesData.map((s, si) => {
                const dimmed = splitByInstance && !!selectedInstance && s.id !== selectedInstance
                return s.positions.map((p, i) => (
                  <rect key={`b${si}-${i}`} x={p.x - singleBarWidth / 2} y={p.barY} width={singleBarWidth} height={p.barH}
                    fill={`url(#barGrad${si})`} rx={2} opacity={dimmed ? 0.2 : 1} style={{ transition: 'all 0.4s ease' }} />
                ))
              })}

              {/* 平滑曲线 */}
              {seriesData.map((s, si) => {
                if (!s.curvePath) return null
                const dimmed = splitByInstance && !!selectedInstance && s.id !== selectedInstance
                return (
                  <g key={`c${si}`} opacity={dimmed ? 0.2 : 1} style={{ transition: 'opacity 0.4s ease' }}>
                    <path d={s.curvePath} fill="none" stroke={s.color.line} strokeWidth={2}
                      strokeLinecap="round" style={{ transition: 'all 0.4s ease' }} />
                    {s.positions.map((p, i) => (
                      <circle key={`d${si}-${i}`} cx={p.x} cy={p.lineY}
                        r={hoverSlot?.slotIdx === i ? 4 : 2.5}
                        fill="#fff" stroke={s.color.line}
                        strokeWidth={hoverSlot?.slotIdx === i ? 2.5 : 1.5}
                        style={{ transition: 'r 0.15s ease, stroke-width 0.15s ease' }}
                      />
                    ))}
                  </g>
                )
              })}

              {/* Hover 虚线 */}
              {hoverSlot && (
                <line x1={hoverSlot.svgX} y1={padT} x2={hoverSlot.svgX} y2={padT + plotH}
                  stroke={isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)'} strokeWidth={1} strokeDasharray="4 3" />
              )}

              {!hasData && (
                <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle"
                  fontSize={14} fill={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)'} style={labelFont}>暂无数据</text>
              )}
            </svg>

            {/* Tooltip —— 使用平滑插值后的位置 */}
            {tooltipData && smoothPos && chartWrapRef.current && (
              <ChartTooltip
                data={tooltipData}
                pos={smoothPos}
                containerW={chartWrapRef.current.offsetWidth}
                containerH={chartWrapRef.current.offsetHeight}
                granularity={granularity}
              />
            )}
          </div>
        </div>
      </div>

      {showInstancePicker && pickerBtnRef.current && createPortal(
        <InstancePickerPopover
          anchorEl={pickerBtnRef.current} pickerRef={pickerRef}
          search={instanceSearch} onSearchChange={setInstanceSearch}
          instanceIds={instanceIds} instanceInfo={instanceInfo}
          selectedInstance={selectedInstance}
          onSelect={(id) => { setSelectedInstance(id); setShowInstancePicker(false) }}
          onClose={() => setShowInstancePicker(false)}
        />,
        document.body,
      )}
    </GlassCard>
  )
}
