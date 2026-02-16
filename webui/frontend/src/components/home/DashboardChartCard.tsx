import { useState } from 'react'
import GlassCard from '../ui/GlassCard'

const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }
const labelFont = { fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }

const granularities = ['日', '周', '月'] as const

export default function DashboardChartCard() {
  const [granularity, setGranularity] = useState<typeof granularities[number]>('日')
  const [splitByInstance, setSplitByInstance] = useState(false)

  return (
    <GlassCard>
      <div className="p-[33px] flex flex-col h-full">
        <h2 className="text-black pb-[16px]" style={titleStyle}>仪表盘</h2>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-black/50" style={labelFont}>时间粒度</span>
            <div className="flex rounded-full border border-black/30 overflow-hidden">
              {granularities.map(g => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1 transition-all cursor-pointer ${granularity === g ? 'bg-black/10 text-black/80' : 'text-black/40 hover:text-black/60'}`}
                  style={{ fontSize: 16, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-black/50" style={labelFont}>实例区分</span>
            <button
              onClick={() => setSplitByInstance(!splitByInstance)}
              className="px-3 py-1 rounded-full border border-black/30 transition-all cursor-pointer"
              style={{
                fontSize: 16,
                fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif",
                background: splitByInstance ? 'rgba(0,0,0,0.1)' : 'transparent',
                color: splitByInstance ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.4)',
              }}
            >
              {splitByInstance ? '开' : '关'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center rounded-[20px] border-2 border-dashed border-black/20 min-h-[120px]">
          <span className="text-black/30" style={labelFont}>图表区域（待实现）</span>
        </div>
      </div>
    </GlassCard>
  )
}
