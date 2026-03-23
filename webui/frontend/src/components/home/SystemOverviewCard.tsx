import { useState, useEffect } from 'react'
import { useSystemResources } from '../../hooks/useSystemResources'
import type { SystemInfo } from '../../types'
import GlassCard from '../ui/GlassCard'
import { useTheme } from '../theme/ThemeProvider'

const labelFont = { fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }

function ProgressBar({ value, max, color, isDark }: { value: number; max: number; color: string; isDark: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      className="h-[17px] rounded-[8.5px] relative"
      style={{
        width: 358,
        background: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.35)'}`,
        boxShadow: isDark ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
      }}
    >
      <div
        className="h-full rounded-[8.5px] transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: color,
          border: pct > 0 ? `1px solid ${isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}` : 'none',
          boxShadow: pct > 0 ? (isDark ? '0 0 14px rgba(255,255,255,0.08)' : 'none') : 'none',
        }}
      />
    </div>
  )
}

export default function SystemOverviewCard() {
  const { isDark } = useTheme()
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
  const valueFont = {
    fontSize: 20,
    fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace",
    color: isDark ? 'rgba(255,255,255,0.72)' : '#585858',
    fontWeight: isDark ? 600 : 400,
  }
  const titleColor = isDark ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.92)'
  const labelColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.9)'
  const dividerColor = isDark ? 'rgba(255,255,255,0.18)' : '#707070'

  return (
    <GlassCard bgOpacity={isDark ? 0.72 : 0.45} borderColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.5)'}>
      <div className="p-[33px] flex flex-col h-full">
        <h2 className="pb-[16px]" style={{ ...titleStyle, color: titleColor }}>系统概览</h2>

        <div className="space-y-[10px]">
          <div className="flex items-center gap-[12px]">
            <span className="shrink-0 w-[80px]" style={{ ...labelFont, color: labelColor }}>内存用量</span>
            <ProgressBar value={memUsed} max={memTotal} color="#f6a7cb" isDark={isDark} />
            <span className="shrink-0" style={valueFont}>{memUsed}MB/{memTotal}MB</span>
          </div>
          <div className="flex items-center gap-[12px]">
            <span className="shrink-0 w-[80px]">
              <span style={{ fontFamily: "'Ubuntu','HarmonyOS Sans SC', 'Cascadia Code', monospace", fontSize: 20, color: labelColor }}>CPU</span>
              <span style={{ ...labelFont, color: labelColor }}>用量</span>
            </span>
            <ProgressBar value={cpuPct} max={100} color="#fff0a0" isDark={isDark} />
            <span className="shrink-0" style={valueFont}>CPU用量 | {cpuPct.toFixed(0)}% | {cpuCount}核</span>
          </div>
        </div>

        <div className="my-[12px]" style={{ borderTop: `1px solid ${dividerColor}` }} />

        <div className="space-y-[5px]">
          {([
            ['设备名称', info?.hostname],
            ['处理器', info?.processor],
            ['GPU', info?.gpu],
            ['操作系统', info?.os],
          ] as const).map(([label, val]) => (
            <div key={label} className="flex items-baseline gap-[20px]">
              <span className="shrink-0 w-[80px]" style={{ ...labelFont, color: labelColor }}>{label}</span>
              <span className="truncate" style={valueFont}>{val ?? '...'}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
