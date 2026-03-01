import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'

interface RuntimeSystemSnapshot {
  cpu_percent: number
  cpu_count: number
  memory_percent: number
  memory_used_mb: number
  memory_total_mb: number
  memory_available_mb: number
  gpu_available: boolean
  gpu_name: string | null
  gpu_percent: number | null
  gpu_memory_used_mb: number | null
  gpu_memory_total_mb: number | null
}

interface RuntimeProcessSnapshot {
  pid: number
  title: string
  component: string
  instance_id: string | null
  instance_name: string | null
  command: string
  cwd: string
  status: string
  cpu_percent: number
  memory_mb: number
  memory_percent: number
  thread_count: number
  start_time: number | null
  start_time_iso: string | null
  uptime_s: number
}

interface RuntimeOverview {
  success: boolean
  timestamp: string
  system: RuntimeSystemSnapshot
  summary: {
    total_processes: number
    running_instances: number
    total_memory_mb: number
    avg_cpu_percent: number
    by_component: Record<string, number>
  }
  processes: RuntimeProcessSnapshot[]
}

interface RuntimeMetrics {
  success: boolean
  timestamp: string
  system: RuntimeSystemSnapshot
  processes: Array<{
    pid: number
    cpu_percent: number
    memory_mb: number
    memory_percent: number
    uptime_s: number
    status: string
  }>
}

interface RuntimeProcessDetail {
  pid: number
  name: string
  title: string
  component: string
  instance_id: string | null
  status: string
  cpu_percent: number
  memory_mb: number
  memory_percent: number
  rss_bytes: number
  vms_bytes: number
  thread_count: number
  open_files: number
  create_time: number
  create_time_iso: string | null
  uptime_s: number
  cwd: string
  exe: string
  username: string
  command: string
  cmdline: string[]
  io: {
    read_bytes: number
    write_bytes: number
    read_count: number
    write_count: number
  }
  children: Array<{
    pid: number
    name: string
    status: string
    cpu_percent: number
    memory_mb: number
  }>
  connections: Array<{
    status: string
    local_addr: string | null
    remote_addr: string | null
  }>
}

interface RuntimeProcessDetailResponse {
  success: boolean
  timestamp: string
  process: RuntimeProcessDetail
}

interface TrendPoint {
  t: number
  cpu: number
  gpu: number
  memory: number
}

type ViewMode = 'overview' | 'detail'
type SystemMetricKey = 'cpu' | 'gpu' | 'memory'
type ProcessMetricKey = 'cpu' | 'memory'
type WindowSec = 60 | 180

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace" }
const labelFont = { fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 25, ...monoFont, color: '#707070' }
const sectionTitle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const smallLabel = { fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const smallValue = { fontSize: 20, ...monoFont, color: '#707070' }

const HISTORY_MAX_POINTS = 180

function pushTrendPoint(prev: TrendPoint[], next: TrendPoint, maxPoints = HISTORY_MAX_POINTS): TrendPoint[] {
  const merged = [...prev, next]
  if (merged.length <= maxPoints) return merged
  return merged.slice(merged.length - maxPoints)
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  const sec = Math.floor(seconds % 60)
  const min = Math.floor((seconds / 60) % 60)
  const hour = Math.floor(seconds / 3600)
  if (hour > 0) return `${hour}h ${min}m ${sec}s`
  if (min > 0) return `${min}m ${sec}s`
  return `${sec}s`
}

function formatNumber(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '-'
  return v.toFixed(digits)
}

function bytesToMb(v: number): string {
  if (!Number.isFinite(v)) return '-'
  return `${(v / (1024 * 1024)).toFixed(2)} MB`
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(value)))
  const norm = value / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function formatPointTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function catmullRomPath(
  points: Array<{ x: number; y: number }>,
  tension = 0.25,
  minY = Number.NEGATIVE_INFINITY,
  maxY = Number.POSITIVE_INFINITY,
): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`

  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = clamp(p1.y + (p2.y - p0.y) * tension, minY, maxY)
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = clamp(p2.y - (p3.y - p1.y) * tension, minY, maxY)
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${clamp(p2.y, minY, maxY)}`
  }
  return d
}

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('run')) return '#1f8f4b'
  if (s.includes('sleep')) return '#a47700'
  if (s.includes('stop') || s.includes('dead') || s.includes('zombie')) return '#c44646'
  return '#6b7280'
}

function ProcessTrendPanel({
  points,
  metric,
  windowSec,
  onChangeMetric,
  onChangeWindow,
}: {
  points: TrendPoint[]
  metric: ProcessMetricKey
  windowSec: WindowSec
  onChangeMetric: (key: ProcessMetricKey) => void
  onChangeWindow: (sec: WindowSec) => void
}) {
  const width = 1100
  const height = 310
  const padL = 56
  const padR = 16
  const padT = 20
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const baseY = padT + plotH

  const visiblePoints = useMemo(() => points.slice(-windowSec), [points, windowSec])

  const config = metric === 'cpu'
    ? { label: 'CPU', color: '#1d4ed8', unit: '%', max: 100 }
    : { label: '内存', color: '#b45309', unit: 'MB', max: niceMax(Math.max(1, ...visiblePoints.map(p => Math.max(0, p.memory)))) }

  const values = visiblePoints.map(p => metric === 'cpu' ? clamp(p.cpu, 0, 100) : Math.max(0, p.memory))
  const coords = values.map((v, i) => ({
    x: padL + (values.length <= 1 ? 0 : (i / (values.length - 1)) * plotW),
    y: baseY - (v / config.max) * plotH,
  }))

  const linePath = catmullRomPath(coords, 0.22, padT, baseY)
  const areaPath = linePath && coords.length > 1
    ? `${linePath} L${coords[coords.length - 1].x},${baseY} L${coords[0].x},${baseY} Z`
    : ''
  const peakY = coords.length > 0 ? Math.min(...coords.map(c => c.y)) : padT
  const currentVal = values.length > 0 ? values[values.length - 1] : 0
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [mouseX, setMouseX] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const hoverPoint = hoverIndex != null ? visiblePoints[hoverIndex] : null
  const hoverX = mouseX != null ? padL + clamp((mouseX - padL) / plotW, 0, 1) * plotW : null

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const handleWheel = (evt: WheelEvent) => {
      if (evt.deltaY === 0) return
      evt.preventDefault()
      evt.stopPropagation()
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [])

  const handleMouseMove = (evt: ReactMouseEvent<SVGSVGElement>) => {
    if (coords.length === 0) return
    const svg = evt.currentTarget
    svgRef.current = svg
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return

    const svgX = ((evt.clientX - rect.left) / rect.width) * width

    const plotX = svgX - padL
    if (plotX < 0 || plotX > plotW) {
      setHoverIndex(null)
      setMouseX(null)
      setTooltipPos(null)
      return
    }

    const ratio = clamp(plotX / plotW, 0, 1)
    const idx = Math.round(ratio * (coords.length - 1))
    setHoverIndex(idx)
    setMouseX(svgX)

    const wrapRect = chartWrapRef.current?.getBoundingClientRect()
    if (wrapRect) {
      setTooltipPos({
        x: evt.clientX - wrapRect.left + 15,
        y: evt.clientY - wrapRect.top + 15,
      })
    }
  }

  const handleMouseLeave = () => {
    setHoverIndex(null)
    setMouseX(null)
    setTooltipPos(null)
  }

  const handleWheel = useCallback((evt: ReactWheelEvent<SVGSVGElement>) => {
    if (evt.deltaY === 0) return
    evt.preventDefault()
    evt.stopPropagation()
    const order: ProcessMetricKey[] = ['cpu', 'memory']
    const idx = order.indexOf(metric)
    const nextIdx = (idx + (evt.deltaY > 0 ? 1 : -1) + order.length) % order.length
    onChangeMetric(order[nextIdx])
  }, [metric, onChangeMetric])

  const buttonStyle = (active: boolean) => ({
    height: 46,
    borderRadius: 23,
    border: `2px solid ${active ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.28)'}`,
    background: active ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.28)',
    cursor: 'pointer',
  })

  return (
    <div className="rounded-[22px] p-[14px]" style={{ border: '2px solid rgba(0,0,0,0.25)', boxShadow: '2px 3px 8px rgba(0,0,0,0.12)' }}>
      <div className="flex gap-[14px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-[8px] px-[4px]">
            <span style={{ ...smallLabel, fontSize: 24 }}>进程实时资源折线图（最近{windowSec === 60 ? '60秒' : '3分钟'}）</span>
            <span style={{ ...smallValue, color: config.color, fontSize: 24 }}>
              {config.label} {formatNumber(currentVal)}{config.unit}
            </span>
          </div>

          <div
            ref={chartWrapRef}
            className="relative"
            style={{ overflow: 'hidden', overscrollBehavior: 'none' }}
          >
            <svg
              width="100%"
              height="320"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              style={{ overflow: 'hidden', display: 'block' }}
            >
              <defs>
                <linearGradient id={`process-fill-${metric}`} gradientUnits="userSpaceOnUse" x1={0} y1={peakY} x2={0} y2={baseY}>
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }, (_, i) => {
                const y = padT + (i / 4) * plotH
                return <line key={`grid-${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />
              })}

              <line x1={padL} y1={padT} x2={padL} y2={baseY} stroke="rgba(0,0,0,0.45)" strokeWidth={2} />
              <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(0,0,0,0.45)" strokeWidth={2} />

              {Array.from({ length: 5 }, (_, i) => {
                const val = config.max - (config.max * i) / 4
                const y = padT + (i / 4) * plotH + 4
                return (
                  <text key={`tick-${i}`} x={padL - 8} y={y} textAnchor="end" fill="rgba(0,0,0,0.52)" style={{ fontSize: 12, ...monoFont }}>
                    {formatNumber(val, config.max >= 100 ? 0 : 1)}{config.unit}
                  </text>
                )
              })}

              {areaPath && <path d={areaPath} fill={`url(#process-fill-${metric})`} />}
              {hoverX != null && (
                <line
                  x1={hoverX}
                  y1={padT}
                  x2={hoverX}
                  y2={baseY}
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={1.5}
                  strokeDasharray="6 6"
                />
              )}
              {linePath && <path d={linePath} fill="none" stroke={config.color} strokeWidth={2.7} strokeLinecap="round" />}
              <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" />
            </svg>

            {hoverPoint && tooltipPos && (
              <div
                className="absolute rounded-[12px] px-[10px] py-[8px] transition-all duration-75"
                style={{
                  left: Math.max(6, tooltipPos.x),
                  top: Math.max(6, tooltipPos.y),
                  border: '1px solid rgba(0,0,0,0.22)',
                  background: 'rgba(255,255,255,0.85)',
                  boxShadow: '1px 2px 6px rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                  zIndex: 8,
                  minWidth: 156,
                }}
              >
                <div style={{ ...smallLabel, fontSize: 15 }}>{formatPointTime(hoverPoint.t)}</div>
                <div style={{ ...smallValue, fontSize: 15 }}>CPU {formatNumber(clamp(hoverPoint.cpu, 0, 100), 1)}%</div>
                <div style={{ ...smallValue, fontSize: 15 }}>内存 {formatNumber(Math.max(0, hoverPoint.memory), 1)} MB</div>
                <div style={{ ...smallValue, fontSize: 15 }}>GPU -</div>
              </div>
            )}
          </div>
        </div>

        <div className="w-[190px] shrink-0 flex flex-col gap-[8px]">
          <div style={{ ...smallLabel, fontSize: 22 }}>查看指标</div>
          <button style={buttonStyle(metric === 'cpu')} onClick={() => onChangeMetric('cpu')}>
            <span style={smallLabel}>CPU</span>
          </button>
          <button style={buttonStyle(metric === 'memory')} onClick={() => onChangeMetric('memory')}>
            <span style={smallLabel}>内存</span>
          </button>
          <div className="mt-[8px]" style={{ ...smallLabel, fontSize: 20 }}>时间窗</div>
          <button style={buttonStyle(windowSec === 60)} onClick={() => onChangeWindow(60)}>
            <span style={smallLabel}>60 秒</span>
          </button>
          <button style={buttonStyle(windowSec === 180)} onClick={() => onChangeWindow(180)}>
            <span style={smallLabel}>3 分钟</span>
          </button>
          <div className="mt-[8px] rounded-[14px] p-[10px]" style={{ border: '1px solid rgba(0,0,0,0.2)' }}>
            <div style={{ ...smallValue, fontSize: 16, lineHeight: 1.5 }}>
              当前显示：{config.label}（滚轮可切换CPU/内存）
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemTrendPanel({
  points,
  metric,
  windowSec,
  onChangeMetric,
  onChangeWindow,
  gpuAvailable,
}: {
  points: TrendPoint[]
  metric: SystemMetricKey
  windowSec: WindowSec
  onChangeMetric: (key: SystemMetricKey) => void
  onChangeWindow: (sec: WindowSec) => void
  gpuAvailable: boolean
}) {
  const width = 1100
  const height = 310
  const padL = 56
  const padR = 16
  const padT = 20
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const baseY = padT + plotH

  const visiblePoints = useMemo(() => points.slice(-windowSec), [points, windowSec])

  const config = {
    cpu: { label: 'CPU', color: '#1d4ed8', unit: '%' },
    gpu: { label: 'GPU', color: '#7e22ce', unit: '%' },
    memory: { label: '内存', color: '#b45309', unit: '%' },
  }[metric]

  const values = visiblePoints.map(p => {
    if (metric === 'cpu') return p.cpu
    if (metric === 'gpu') return p.gpu
    return p.memory
  })

  const clamped = values.map(v => clamp(v, 0, 100))
  const coords = clamped.map((v, i) => ({
    x: padL + (clamped.length <= 1 ? 0 : (i / (clamped.length - 1)) * plotW),
    y: baseY - (v / 100) * plotH,
  }))

  const linePath = catmullRomPath(coords, 0.22, padT, baseY)
  const areaPath = linePath && coords.length > 1
    ? `${linePath} L${coords[coords.length - 1].x},${baseY} L${coords[0].x},${baseY} Z`
    : ''
  const peakY = coords.length > 0 ? Math.min(...coords.map(c => c.y)) : padT
  const currentVal = clamped.length > 0 ? clamped[clamped.length - 1] : 0
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [mouseX, setMouseX] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const hoverPoint = hoverIndex != null ? visiblePoints[hoverIndex] : null
  const hoverX = mouseX != null ? padL + clamp((mouseX - padL) / plotW, 0, 1) * plotW : null

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const handleWheel = (evt: WheelEvent) => {
      if (evt.deltaY === 0) return
      evt.preventDefault()
      evt.stopPropagation()
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [])

  const handleMouseMove = (evt: ReactMouseEvent<SVGSVGElement>) => {
    if (coords.length === 0) return
    const svg = evt.currentTarget
    svgRef.current = svg
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return

    const svgX = ((evt.clientX - rect.left) / rect.width) * width

    const plotX = svgX - padL
    if (plotX < 0 || plotX > plotW) {
      setHoverIndex(null)
      setMouseX(null)
      setTooltipPos(null)
      return
    }

    const ratio = clamp(plotX / plotW, 0, 1)
    const idx = Math.round(ratio * (coords.length - 1))
    setHoverIndex(idx)
    setMouseX(svgX)

    const wrapRect = chartWrapRef.current?.getBoundingClientRect()
    if (wrapRect) {
      setTooltipPos({
        x: evt.clientX - wrapRect.left + 15,
        y: evt.clientY - wrapRect.top + 15,
      })
    }
  }

  const handleMouseLeave = () => {
    setHoverIndex(null)
    setMouseX(null)
    setTooltipPos(null)
  }

  const handleWheel = useCallback((evt: ReactWheelEvent<SVGSVGElement>) => {
    if (evt.deltaY === 0) return
    evt.preventDefault()
    evt.stopPropagation()
    const order: SystemMetricKey[] = gpuAvailable ? ['cpu', 'gpu', 'memory'] : ['cpu', 'memory']
    const idx = order.indexOf(metric)
    const nextIdx = (idx + (evt.deltaY > 0 ? 1 : -1) + order.length) % order.length
    onChangeMetric(order[nextIdx])
  }, [metric, onChangeMetric, gpuAvailable])

  const buttonStyle = (active: boolean, disabled = false) => ({
    height: 46,
    borderRadius: 23,
    border: `2px solid ${active ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.28)'}`,
    background: active ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.28)',
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  return (
    <div className="rounded-[22px] p-[14px]" style={{ border: '2px solid rgba(0,0,0,0.25)', boxShadow: '2px 3px 8px rgba(0,0,0,0.12)' }}>
      <div className="flex gap-[14px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-[8px] px-[4px]">
            <span style={{ ...smallLabel, fontSize: 24 }}>系统实时资源折线图（最近{windowSec === 60 ? '60秒' : '3分钟'}）</span>
            <span style={{ ...smallValue, color: config.color, fontSize: 24 }}>
              {config.label} {formatNumber(currentVal)}{config.unit}
            </span>
          </div>

          <div
            ref={chartWrapRef}
            className="relative"
            style={{ overflow: 'hidden', overscrollBehavior: 'none' }}
          >
            <svg
              width="100%"
              height="320"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              style={{ overflow: 'hidden', display: 'block' }}
            >
              <defs>
                <linearGradient id={`system-fill-${metric}`} gradientUnits="userSpaceOnUse" x1={0} y1={peakY} x2={0} y2={baseY}>
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }, (_, i) => {
                const y = padT + (i / 4) * plotH
                return <line key={`grid-${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />
              })}

              <line x1={padL} y1={padT} x2={padL} y2={baseY} stroke="rgba(0,0,0,0.45)" strokeWidth={2} />
              <line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke="rgba(0,0,0,0.45)" strokeWidth={2} />

              {Array.from({ length: 5 }, (_, i) => {
                const val = 100 - i * 25
                const y = padT + (i / 4) * plotH + 4
                return (
                  <text key={`tick-${val}`} x={padL - 8} y={y} textAnchor="end" fill="rgba(0,0,0,0.52)" style={{ fontSize: 12, ...monoFont }}>
                    {val}%
                  </text>
                )
              })}

              {areaPath && <path d={areaPath} fill={`url(#system-fill-${metric})`} />}
              {hoverX != null && (
                <line
                  x1={hoverX}
                  y1={padT}
                  x2={hoverX}
                  y2={baseY}
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={1.5}
                  strokeDasharray="6 6"
                />
              )}
              {linePath && <path d={linePath} fill="none" stroke={config.color} strokeWidth={2.7} strokeLinecap="round" />}
              <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" />
            </svg>

            {hoverPoint && tooltipPos && (
              <div
                className="absolute rounded-[12px] px-[10px] py-[8px] transition-all duration-75"
                style={{
                  left: Math.max(6, tooltipPos.x),
                  top: Math.max(6, tooltipPos.y),
                  border: '1px solid rgba(0,0,0,0.22)',
                  background: 'rgba(255,255,255,0.85)',
                  boxShadow: '1px 2px 6px rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                  zIndex: 8,
                  minWidth: 156,
                }}
              >
                <div style={{ ...smallLabel, fontSize: 15 }}>{formatPointTime(hoverPoint.t)}</div>
                <div style={{ ...smallValue, fontSize: 15 }}>CPU {formatNumber(clamp(hoverPoint.cpu, 0, 100), 1)}%</div>
                <div style={{ ...smallValue, fontSize: 15 }}>内存 {formatNumber(clamp(hoverPoint.memory, 0, 100), 1)}%</div>
                <div style={{ ...smallValue, fontSize: 15 }}>
                  GPU {gpuAvailable ? `${formatNumber(clamp(hoverPoint.gpu, 0, 100), 1)}%` : 'N/A'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-[190px] shrink-0 flex flex-col gap-[8px]">
          <div style={{ ...smallLabel, fontSize: 22 }}>查看指标</div>
          <button style={buttonStyle(metric === 'cpu')} onClick={() => onChangeMetric('cpu')}>
            <span style={smallLabel}>CPU</span>
          </button>
          <button
            style={buttonStyle(metric === 'gpu', !gpuAvailable)}
            onClick={() => { if (gpuAvailable) onChangeMetric('gpu') }}
            disabled={!gpuAvailable}
          >
            <span style={smallLabel}>GPU</span>
          </button>
          <button style={buttonStyle(metric === 'memory')} onClick={() => onChangeMetric('memory')}>
            <span style={smallLabel}>内存</span>
          </button>
          <div className="mt-[8px]" style={{ ...smallLabel, fontSize: 20 }}>时间窗</div>
          <button style={buttonStyle(windowSec === 60)} onClick={() => onChangeWindow(60)}>
            <span style={smallLabel}>60 秒</span>
          </button>
          <button style={buttonStyle(windowSec === 180)} onClick={() => onChangeWindow(180)}>
            <span style={smallLabel}>3 分钟</span>
          </button>
          <div className="mt-[8px] rounded-[14px] p-[10px]" style={{ border: '1px solid rgba(0,0,0,0.2)' }}>
            <div style={{ ...smallValue, fontSize: 16, lineHeight: 1.5 }}>
              {metric === 'gpu' && !gpuAvailable ? '未检测到可用GPU监控数据' : `当前显示：${config.label}（滚轮可切换CPU/GPU/内存）`}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] p-[16px] min-w-[210px]" style={{ border: '2px solid rgba(0,0,0,0.24)', boxShadow: '2px 3px 6px rgba(0,0,0,0.1)' }}>
      <div style={{ ...smallLabel, opacity: 0.75 }}>{label}</div>
      <div style={{ ...valueFont, fontSize: 30 }}>{value}</div>
    </div>
  )
}

export default function Status() {
  const { notify } = useNotification()

  // ★ 核心修复：用 ref 包装 notify，使 useCallback 不再依赖它
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [overview, setOverview] = useState<RuntimeOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [liveSystem, setLiveSystem] = useState<RuntimeSystemSnapshot | null>(null)
  const [systemMetric, setSystemMetric] = useState<SystemMetricKey>('cpu')
  const [systemWindowSec, setSystemWindowSec] = useState<WindowSec>(60)
  const [processMetric, setProcessMetric] = useState<ProcessMetricKey>('cpu')
  const [processWindowSec, setProcessWindowSec] = useState<WindowSec>(60)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [detail, setDetail] = useState<RuntimeProcessDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [actionLoading, setActionLoading] = useState<'stop' | 'restart' | null>(null)

  const [systemTrend, setSystemTrend] = useState<TrendPoint[]>([])
  const [processTrend, setProcessTrend] = useState<TrendPoint[]>([])

  // ★ 依赖数组为空 —— notify 通过 notifyRef 间接访问，引用稳定
  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoadingOverview(true)
    try {
      const res = await fetch('/api/runtime/overview', { credentials: 'include' })
      const data = await res.json() as RuntimeOverview
      if (data.success) setOverview(data)
      else if (!silent) notifyRef.current('读取运行总览失败', 'error')
    } catch {
      if (!silent) notifyRef.current('读取运行总览失败', 'error')
    } finally {
      if (!silent) setLoadingOverview(false)
    }
  }, [])

  // ★ 依赖数组为空 —— 同理
  const loadDetail = useCallback(async (pid: number, silent = false) => {
    if (!silent) setLoadingDetail(true)
    try {
      const res = await fetch(`/api/runtime/processes/${pid}`, { credentials: 'include' })
      const data = await res.json() as RuntimeProcessDetailResponse
      if (res.ok && data.success) {
        setDetail(data.process)
      } else if (!silent) {
        notifyRef.current((data as unknown as { detail?: string }).detail || '读取进程详情失败', 'error')
      }
    } catch {
      if (!silent) notifyRef.current('读取进程详情失败', 'error')
    } finally {
      if (!silent) setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview(false)
    const timer = setInterval(() => { void loadOverview(true) }, 3000)
    return () => clearInterval(timer)
  }, [loadOverview])

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/runtime/metrics', { credentials: 'include' })
        const data = await res.json() as RuntimeMetrics
        if (!data.success) return

        const now = Date.now()
        setLiveSystem(data.system)
        setSystemTrend(prev => pushTrendPoint(prev, {
          t: now,
          cpu: data.system.cpu_percent,
          gpu: Number(data.system.gpu_percent ?? 0),
          memory: data.system.memory_percent,
        }))

        if (selectedPid != null) {
          const target = data.processes.find(p => p.pid === selectedPid)
          if (target) {
            setProcessTrend(prev => pushTrendPoint(prev, {
              t: now,
              cpu: target.cpu_percent,
              gpu: 0,
              memory: target.memory_mb,
            }))
          }
        }
      } catch {
        // 轮询静默失败
      }
    }

    void tick()
    const timer = setInterval(() => { void tick() }, 1000)
    return () => clearInterval(timer)
  }, [selectedPid])

  useEffect(() => {
    if (selectedPid == null) {
      setDetail(null)
      setProcessTrend([])
      return
    }

    setProcessTrend([])
    setProcessMetric('cpu')
    void loadDetail(selectedPid, false)
    const timer = setInterval(() => { void loadDetail(selectedPid, true) }, 3000)
    return () => clearInterval(timer)
  }, [selectedPid, loadDetail])

  const openProcessDetail = (pid: number) => {
    setSelectedPid(pid)
    setViewMode('detail')
  }

  const backToOverview = () => {
    setViewMode('overview')
  }

  // ★ 使用 notifyRef.current 替代 notify
  const handleProcessAction = async (action: 'stop' | 'restart') => {
    if (selectedPid == null) return
    setActionLoading(action)
    try {
      const res = await fetch(`/api/runtime/processes/${selectedPid}/${action}`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json() as { success?: boolean; message?: string; detail?: string }
      if (data.success) {
        notifyRef.current(data.message || (action === 'stop' ? '进程已停止' : '进程已重启'), 'success')
        void loadOverview(true)
        if (action === 'stop') {
          setViewMode('overview')
          setSelectedPid(null)
        } else {
          void loadDetail(selectedPid, true)
        }
      } else {
        notifyRef.current(data.detail || data.message || '操作失败', 'error')
      }
    } catch {
      notifyRef.current('请求失败', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const systemStats = liveSystem ?? overview?.system
  const summary = overview?.summary
  const processes = overview?.processes ?? []

  const sortedComponentTags = useMemo(() => {
    const byComponent = summary?.by_component ?? {}
    return Object.entries(byComponent).sort((a, b) => b[1] - a[1])
  }, [summary])

  const d = (i: number) => ({ animationDelay: `${i * 60}ms` })

  if (viewMode === 'detail') {
    return (
      <div className="min-h-full p-[30px] pb-[20px]">
        <div className="h-full flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h1 className="text-black animate-fade-slide-up" style={{ ...pageTitleStyle, ...d(0) }}>运行状态 - 进程详情</h1>
            <button
              onClick={backToOverview}
              className="h-[50px] px-[24px] rounded-[25px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95"
              style={{ border: '2px solid rgba(0,0,0,0.5)', background: 'rgba(255,255,255,0.4)' }}
            >
              <span style={smallLabel}>返回总览</span>
            </button>
          </div>

          <GlassCard>
            <div className="p-[24px] h-full flex flex-col gap-[18px]">
              {loadingDetail && !detail ? (
                <div className="flex items-center justify-center h-full text-black/30" style={labelFont}>加载中...</div>
              ) : detail ? (
                <>
                  <div className="flex items-center justify-between gap-[12px]">
                    <div className="min-w-0">
                      <h2 className="truncate text-black" style={sectionTitle}>{detail.title || detail.name}</h2>
                      <div className="flex items-center gap-[16px] mt-[4px]">
                        <span style={smallValue}>PID {detail.pid}</span>
                        <span style={{ ...smallValue, color: statusColor(detail.status) }}>{detail.status}</span>
                        <span style={smallValue}>{detail.instance_id ? `实例 ${detail.instance_id}` : '未绑定实例'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-[10px] shrink-0">
                      <button
                        onClick={() => { void handleProcessAction('restart') }}
                        disabled={actionLoading !== null}
                        className="h-[44px] px-[18px] rounded-[22px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        style={{ border: '2px solid rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.45)' }}
                      >
                        <span style={smallLabel}>{actionLoading === 'restart' ? '重启中...' : '重启进程'}</span>
                      </button>
                      <button
                        onClick={() => { void handleProcessAction('stop') }}
                        disabled={actionLoading !== null}
                        className="h-[44px] px-[18px] rounded-[22px] cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        style={{ border: '2px solid rgba(176,35,35,0.5)', background: 'rgba(255,190,190,0.45)' }}
                      >
                        <span style={{ ...smallLabel, color: '#8f1f1f' }}>{actionLoading === 'stop' ? '停止中...' : '停止进程'}</span>
                      </button>
                    </div>
                  </div>

                  <ProcessTrendPanel
                    points={processTrend}
                    metric={processMetric}
                    windowSec={processWindowSec}
                    onChangeMetric={setProcessMetric}
                    onChangeWindow={setProcessWindowSec}
                  />

                  <div className="grid grid-cols-2 gap-x-[26px] gap-y-[8px]">
                    {[
                      ['组件', detail.component || '-'],
                      ['CPU', `${formatNumber(detail.cpu_percent)}%`],
                      ['内存', `${formatNumber(detail.memory_mb)} MB (${formatNumber(detail.memory_percent)}%)`],
                      ['线程数', String(detail.thread_count)],
                      ['打开文件', String(detail.open_files)],
                      ['运行时长', formatUptime(detail.uptime_s)],
                      ['启动时间', detail.create_time_iso || '-'],
                      ['用户', detail.username || '-'],
                      ['工作目录', detail.cwd || '-'],
                      ['可执行文件', detail.exe || '-'],
                      ['命令', detail.command || '-'],
                      ['RSS / VMS', `${bytesToMb(detail.rss_bytes)} / ${bytesToMb(detail.vms_bytes)}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-[10px] min-w-0">
                        <span className="shrink-0 text-black" style={smallLabel}>{k}</span>
                        <span className="truncate" style={smallValue} title={v}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-[16px] min-h-0 flex-1">
                    <div className="rounded-[16px] p-[12px] overflow-auto custom-scrollbar" style={{ border: '2px solid rgba(0,0,0,0.2)' }}>
                      <div className="mb-[8px] text-black" style={smallLabel}>子进程（{detail.children.length}）</div>
                      {detail.children.length === 0 ? (
                        <div style={smallValue}>无</div>
                      ) : detail.children.map(ch => (
                        <div key={ch.pid} className="flex items-center justify-between gap-[8px] py-[4px]">
                          <span className="truncate" style={smallValue} title={`${ch.name} (${ch.pid})`}>{ch.name} ({ch.pid})</span>
                          <span style={smallValue}>{formatNumber(ch.memory_mb)} MB</span>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[16px] p-[12px] overflow-auto custom-scrollbar" style={{ border: '2px solid rgba(0,0,0,0.2)' }}>
                      <div className="mb-[8px] text-black" style={smallLabel}>网络连接（最多20条）</div>
                      {detail.connections.length === 0 ? (
                        <div style={smallValue}>无</div>
                      ) : detail.connections.map((conn, i) => (
                        <div key={`${conn.local_addr ?? 'l'}-${conn.remote_addr ?? 'r'}-${i}`} className="py-[4px]">
                          <div className="truncate" style={smallValue} title={`${conn.local_addr ?? '-'} -> ${conn.remote_addr ?? '-'}`}>
                            {`${conn.local_addr ?? '-'} -> ${conn.remote_addr ?? '-'}`}
                          </div>
                          <div style={{ ...smallValue, fontSize: 16 }}>{conn.status}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-black/30" style={labelFont}>未找到进程详情</div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full p-[30px] pb-[20px]">
      <div className="h-full flex flex-col gap-[20px]">
        <h1 className="text-black animate-fade-slide-up" style={{ ...pageTitleStyle, ...d(0) }}>查看运行状态</h1>

        <GlassCard>
          <div className="p-[24px] h-full flex flex-col gap-[18px]">
            {loadingOverview && !overview ? (
              <div className="flex items-center justify-center h-full text-black/30" style={labelFont}>加载中...</div>
            ) : (
              <>
                <h2 className="text-black animate-fade-slide-up" style={{ ...sectionTitle, ...d(1) }}>总览</h2>

                <div className="flex flex-wrap gap-[10px] animate-fade-slide-up" style={d(2)}>
                  <StatCard label="托管进程数" value={String(summary?.total_processes ?? 0)} />
                  <StatCard label="运行实例数" value={String(summary?.running_instances ?? 0)} />
                  <StatCard label="系统CPU" value={systemStats ? `${formatNumber(systemStats.cpu_percent)}%` : '-'} />
                  <StatCard label="系统内存" value={systemStats ? `${formatNumber(systemStats.memory_percent)}%` : '-'} />
                  <StatCard label="进程总内存" value={`${formatNumber(summary?.total_memory_mb ?? 0)} MB`} />
                  <StatCard label="进程平均CPU" value={`${formatNumber(summary?.avg_cpu_percent ?? 0)}%`} />
                </div>

                <SystemTrendPanel
                  points={systemTrend}
                  metric={systemMetric}
                  windowSec={systemWindowSec}
                  onChangeMetric={setSystemMetric}
                  onChangeWindow={setSystemWindowSec}
                  gpuAvailable={Boolean(systemStats?.gpu_available)}
                />

                <div className="flex items-center justify-between">
                  <h2 className="text-black" style={sectionTitle}>托管进程</h2>
                  <div className="flex items-center gap-[8px] flex-wrap">
                    {sortedComponentTags.map(([name, count]) => (
                      <span
                        key={name}
                        className="px-[10px] py-[4px] rounded-[12px]"
                        style={{ border: '1px solid rgba(0,0,0,0.25)', ...smallValue, fontSize: 16 }}
                      >
                        {name}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[18px] p-[10px] flex-1 min-h-0 overflow-auto custom-scrollbar" style={{ border: '2px solid rgba(0,0,0,0.22)' }}>
                  {processes.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-black/35" style={labelFont}>当前没有托管进程在运行</div>
                  ) : (
                    <div className="flex flex-col gap-[8px]">
                      {processes.map((p, idx) => (
                        <div
                          key={p.pid}
                          className="rounded-[14px] p-[12px] flex items-center gap-[10px] animate-fade-slide-up"
                          style={{ ...d(3 + idx), border: '2px solid rgba(0,0,0,0.18)', background: 'rgba(255,255,255,0.25)' }}
                        >
                          <div className="w-[10px] h-[10px] rounded-full shrink-0" style={{ background: statusColor(p.status) }} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-black" style={{ ...smallLabel, fontSize: 24 }} title={p.title}>{p.title}</div>
                            <div className="flex items-center gap-[14px] flex-wrap">
                              <span style={smallValue}>PID {p.pid}</span>
                              <span style={smallValue}>{p.component || '-'}</span>
                              <span style={smallValue}>{p.instance_name ? `${p.instance_name} (${p.instance_id})` : '未绑定实例'}</span>
                              <span style={smallValue}>CPU {formatNumber(p.cpu_percent)}%</span>
                              <span style={smallValue}>内存 {formatNumber(p.memory_mb)} MB</span>
                              <span style={smallValue}>运行 {formatUptime(p.uptime_s)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => openProcessDetail(p.pid)}
                            className="h-[40px] px-[14px] rounded-[20px] shrink-0 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-95"
                            style={{ border: '2px solid rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.45)' }}
                          >
                            <span style={smallLabel}>查看详情</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}