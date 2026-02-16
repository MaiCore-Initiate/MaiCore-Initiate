import { useState, useEffect, useMemo } from 'react'
import GlassCard from '../ui/GlassCard'

const titleStyle = { fontSize: 36, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", filter: 'drop-shadow(5px 3px 5px rgba(0,0,0,0.35))' }
const labelFont = { fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }

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

function getSlotCount(g: Granularity) { return g === '日' ? 12 : g === '周' ? 14 : 15 }

function getTimeLabels(g: Granularity): string[] {
  if (g === '日') return ['0:00', '2:00', '4:00', '6:00', '8:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
  if (g === '周') return ['Mon.', '', 'Tue.', '', 'Wed.', '', 'Thu.', '', 'Fri.', '', 'Sat.', '', 'Sun.', '']
  return Array.from({ length: 15 }, (_, i) => ((i * 2 + 1) % 4 === 1) ? `${i * 2 + 1}Day
  ` : '')
}

function getXLabelInterval(g: Granularity) { return g === '日' ? 2 : g === '周' ? 2 : 3 }

function catmullRomPath(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)]
    d += ` C${p1.x + (p2.x - p0.x) * tension},${p1.y + (p2.y - p0.y) * tension} ${p2.x - (p3.x - p1.x) * tension},${p2.y - (p3.y - p1.y) * tension} ${p2.x},${p2.y}`
  }
  return d
}

function timelineToSlots(timeline: TimelineItem[], slotCount: number): SlotItem[] {
  const slots = Array.from({ length: slotCount }, () => ({ starts: 0, uptime_m: 0 }))
  const sorted = [...timeline].reverse()
  sorted.forEach((item, i) => {
    const idx = Math.floor(i / 2)
    if (idx < slotCount) { slots[idx].starts += item.starts; slots[idx].uptime_m += item.uptime_s / 60 }
  })
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
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [instanceIds, setInstanceIds] = useState<string[]>([])
  const [instanceTimelines, setInstanceTimelines] = useState<Record<string, TimelineItem[]>>({})

  const apiGranularity = granularity === '日' ? 'hour' : 'day'
  const apiLimit = granularity === '月' ? 30 : granularity === '周' ? 7 : 24

  useEffect(() => {
    fetch(`/api/stats/timeline?granularity=${apiGranularity}&limit=${apiLimit}`, { credentials: 'include' })
      .then(r => r.json()).then((d: TimelineItem[]) => setTimeline(Array.isArray(d) ? d : [])).catch(() => setTimeline([]))
  }, [apiGranularity, apiLimit])

  useEffect(() => {
    if (!splitByInstance) return
    fetch('/api/stats/instances', { credentials: 'include' })
      .then(r => r.json()).then((ids: string[]) => setInstanceIds(Array.isArray(ids) ? ids : [])).catch(() => setInstanceIds([]))
  }, [splitByInstance])

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

  const slotCount = getSlotCount(granularity)
  const timeLabels = getTimeLabels(granularity)
  const labelInterval = getXLabelInterval(granularity)

  const series = useMemo(() => {
    if (!splitByInstance) return [{ id: '_all', slots: timelineToSlots(timeline, slotCount), colorIdx: 0 }]
    return instanceIds.map((id, idx) => ({ id, slots: timelineToSlots(instanceTimelines[id] ?? [], slotCount), colorIdx: idx % INSTANCE_COLORS.length }))
  }, [splitByInstance, timeline, instanceIds, instanceTimelines, slotCount])

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
    return { ...s, positions, curvePath: catmullRomPath(positions.map(p => ({ x: p.x, y: p.lineY }))), color: INSTANCE_COLORS[s.colorIdx] }
  })

  const hasData = series.some(s => s.slots.some(d => d.starts > 0 || d.uptime_m > 0))

  // 胶囊按钮样式
  const pillBtn = (active: boolean) => ({
    width: 44, height: 32, ...labelFont, fontSize: 18, fontWeight: 600 as const,
    background: active ? '#fff' : 'transparent', color: 'rgba(0,0,0,0.7)',
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
                  fontSize={10} fontFamily="'Cascadia Code', monospace" fill="rgba(0,0,0,0.45)">{label}</text>
              ))}

              {/* X轴标签 */}
              {timeLabels.map((label, i) => {
                if (!label || i % labelInterval !== 0) return null
                return (
                  <text key={`xl${i}`} x={padL + (i + 0.5) * (plotW / slotCount)} y={padT + plotH + 18} textAnchor="middle"
                    fontSize={10} fontFamily="'Cascadia Code', monospace" fill="rgba(0,0,0,0.45)">{label}</text>
                )
              })}

              {/* 柱状图 */}
              {seriesData.map((s, si) =>
                s.positions.map((p, i) => (
                  <rect key={`b${si}-${i}`} x={p.x - singleBarWidth / 2} y={p.barY} width={singleBarWidth} height={p.barH}
                    fill={`url(#barGrad${si})`} rx={2} style={{ transition: 'all 0.4s ease' }} />
                ))
              )}

              {/* 平滑曲线 */}
              {seriesData.map((s, si) => s.curvePath && (
                <g key={`c${si}`}>
                  <path d={s.curvePath} fill="none" stroke={s.color.line} strokeWidth={2}
                    strokeLinecap="round" style={{ transition: 'all 0.4s ease' }} />
                  {s.positions.map((p, i) => (
                    <circle key={`d${si}-${i}`} cx={p.x} cy={p.lineY} r={2.5}
                      fill="#fff" stroke={s.color.line} strokeWidth={1.5} style={{ transition: 'all 0.4s ease' }} />
                  ))}
                </g>
              ))}

              {!hasData && (
                <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle"
                  fontSize={14} fill="rgba(0,0,0,0.2)" style={labelFont}>暂无数据</text>
              )}
            </svg>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
