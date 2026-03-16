import { useState, useEffect } from 'react'
import { useSystemResources } from '../../hooks/useSystemResources'
import type { SystemInfo } from '../../types'
import GlassCard from '../ui/GlassCard'

const labelFont = { fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const valueFont = { fontSize: 20, fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", color: '#585858' }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-[17px] rounded-[8.5px] bg-black/30 relative" style={{ width: 358, border: '1px solid #000' }}>
      <div className="h-full rounded-[8.5px] transition-all duration-500" style={{ width: `${pct}%`, background: color, border: pct > 0 ? '1px solid #000' : 'none' }} />
    </div>
  )
}

export default function SystemOverviewCard() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const resources = useSystemResources()

  useEffect(() => {
    fetch('/api/system/info', { credentials: 'include' })
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {})
  }, [])

  const memUsed = resources?.memory_used_mb ?? 0
  const memTotal = resources?.memory_total_mb ?? info?.total_memory_mb ?? 1
  const cpuPct = resources?.cpu_percent ?? 0
  const cpuCount = resources?.cpu_count ?? info?.cpu_count ?? 0

  return (
    <GlassCard>
      <div className="p-[33px] flex flex-col h-full">
        <h2 className="text-black pb-[16px]" style={titleStyle}>系统概览</h2>

        <div className="space-y-[10px]">
          <div className="flex items-center gap-[12px]">
            <span className="text-black shrink-0 w-[80px]" style={labelFont}>内存用量</span>
            <ProgressBar value={memUsed} max={memTotal} color="#faa3cc" />
            <span className="shrink-0" style={valueFont}>{memUsed}MB/{memTotal}MB</span>
          </div>
          <div className="flex items-center gap-[12px]">
            <span className="shrink-0 w-[80px]">
              <span style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 20 }}>CPU</span>
              <span style={labelFont}>用量</span>
            </span>
            <ProgressBar value={cpuPct} max={100} color="#fff8a6" />
            <span className="shrink-0" style={valueFont}>CPU用量 | {cpuPct.toFixed(0)}% | {cpuCount}核</span>
          </div>
        </div>

        <div className="my-[12px] border-t border-[#707070]" />

        <div className="space-y-[5px]">
          {([
            ['设备名称', info?.hostname],
            ['处理器', info?.processor],
            ['GPU', info?.gpu],
            ['操作系统', info?.os],
          ] as const).map(([label, val]) => (
            <div key={label} className="flex items-baseline gap-[20px]">
              <span className="text-black shrink-0 w-[80px]" style={labelFont}>{label}</span>
              <span className="truncate" style={valueFont}>{val ?? '...'}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
