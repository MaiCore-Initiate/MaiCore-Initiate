import { useState, useEffect } from 'react'

const cardStyle = "bg-white border-2 border-[#797979] rounded-[30px] backdrop-blur-[50px] p-6 flex flex-col"
const cardShadow = { boxShadow: '8px 8px 12px rgba(0,0,0,0.57)' }
const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif", filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.3))' }
const labelStyle = { fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }
const valueStyle = { fontSize: 20, fontFamily: "'Cascadia Code', monospace", color: '#585858' }

interface Instance {
  serial: string
  name: string
  status: string
}

export default function InstanceOverviewCard() {
  const [instances, setInstances] = useState<Instance[]>([])

  useEffect(() => {
    fetch('/api/instances', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setInstances(d.data || d || []))
      .catch(() => {})
  }, [])

  const running = instances.filter(i => i.status === 'running').length
  const stopped = instances.length - running

  return (
    <div className={cardStyle} style={cardShadow}>
      <h2 className="text-black/80 mb-4" style={titleStyle}>实例概览</h2>

      <div className="flex gap-8">
        {/* 左侧统计 */}
        <div className="space-y-2">
          {[
            ['注册实例', instances.length],
            ['已启动', running],
            ['未启动', stopped],
          ].map(([label, val]) => (
            <div key={label as string} className="flex items-center gap-3">
              <span className="text-black/50" style={labelStyle}>{label}</span>
              <span style={valueStyle}>{val}</span>
            </div>
          ))}
        </div>

        {/* 右侧常用实例列表 */}
        <div className="flex-1">
          <span className="text-black/50 mb-2 block" style={labelStyle}>常用实例</span>
          <div className="flex flex-wrap gap-2">
            {instances.length === 0 && <span className="text-black/30" style={valueStyle}>暂无实例</span>}
            {instances.slice(0, 6).map(inst => (
              <span
                key={inst.serial}
                className="px-3 py-1 rounded-full border border-black/30 text-black/60 truncate max-w-[150px]"
                style={{ fontSize: 16, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
              >
                {inst.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
