import { useState, useEffect } from 'react'
import { useSystemResources } from '../../hooks/useSystemResources'
import type { SystemInfo } from '../../types'

const cardStyle = "bg-white border-2 border-[#797979] rounded-[30px] backdrop-blur-[50px] p-6 flex flex-col"
const cardShadow = { boxShadow: '8px 8px 12px rgba(0,0,0,0.57)' }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif", filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.3))' }
const labelStyle = { fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }
const valueStyle = { fontSize: 20, fontFamily: "'Cascadia Code', monospace", color: '#585858' }

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-[17px] rounded-[8.5px] bg-black/30 overflow-hidden" style={{ maxWidth: 358 }}>
      <div className="h-full rounded-[8.5px] transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
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

  return (
    <div className={cardStyle} style={cardShadow}>
      <h2 className="text-black/80 mb-4" style={titleStyle}>系统概览</h2>

      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-black/60" style={labelStyle}>内存</span>
            <span style={valueStyle}>{memUsed} / {memTotal} MB</span>
          </div>
          <ProgressBar value={memUsed} max={memTotal} color="#faa3cc" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-black/60" style={labelStyle}>CPU</span>
            <span style={valueStyle}>{cpuPct.toFixed(1)}%</span>
          </div>
          <ProgressBar value={cpuPct} max={100} color="#fff8a6" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-auto">
        {[
          ['设备名称', info?.hostname],
          ['处理器', info?.processor],
          ['GPU', info?.gpu],
          ['操作系统', info?.os],
        ].map(([label, val]) => (
          <div key={label as string}>
            <span className="text-black/50" style={labelStyle}>{label}</span>
            <p className="truncate" style={valueStyle}>{val ?? '...'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
