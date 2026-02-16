import { useState, useEffect } from 'react'
import GlassCard from '../ui/GlassCard'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'
import type { Page } from '../../types'

const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }

const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  home: HomeIcon, instances: InstancesIcon, config: ConfigIcon,
  knowledge: KnowledgeIcon, 'db-migration': DbMigrationIcon,
  plugins: PluginsIcon, deploy: DeployIcon, status: StatusIcon,
  logs: LogsIcon, misc: MiscIcon, settings: SettingsIcon,
}

interface QuickItem { id: string; page: Page; label: string }

const defaultItems: QuickItem[] = [
  { id: '1', page: 'plugins', label: '组件下载' },
  { id: '2', page: 'instances', label: '注册实例' },
  { id: '3', page: 'config', label: '编辑实例配置' },
]

export default function QuickAccessCard() {
  const [items, setItems] = useState<QuickItem[]>(defaultItems)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('quickAccessItems')
    if (saved) try { setItems(JSON.parse(saved)) } catch { /* ignore */ }
  }, [])

  const removeItem = (id: string) => {
    const next = items.filter(i => i.id !== id)
    setItems(next)
    localStorage.setItem('quickAccessItems', JSON.stringify(next))
  }

  return (
    <GlassCard>
      <div className="p-[33px] flex flex-col">
        <div className="flex items-center justify-between pb-[16px]">
          <h2 className="text-black" style={titleStyle}>快捷访问</h2>
          <button
            onClick={() => setEditing(e => !e)}
            className="w-[40px] h-[40px] rounded-[9px] border-3 border-black/50 flex items-center justify-center cursor-pointer hover:border-black/70 transition-colors"
            style={{ filter: 'drop-shadow(5px 3px 3px rgba(0,0,0,0.16))' }}
          >
            <svg width="30" height="30 " viewBox="0 0 20 20" fill="none">
              <line x1="3" y1="4" x2="17" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="3" y1="10" x2="17" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="3" y1="16" x2="17" y2="16" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="7" cy="4" r="2" fill="rgba(0,0,0,0.5)" />
              <circle cx="13" cy="10" r="2" fill="rgba(0,0,0,0.5)" />
              <circle cx="9" cy="16" r="2" fill="rgba(0,0,0,0.5)" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-center gap-[7px]">
          {items.length === 0 ? (
            <div className="flex items-center justify-center rounded-[30px] border-3 border-dashed border-[#9e9e9e]" style={{ width: 316, height: 60 }}>
              <span className="text-[#9e9e9e] font-semibold text-base" style={{ fontFamily: "'Segoe UI', sans-serif" }}>no items</span>
            </div>
          ) : items.map(item => {
            const Icon = iconMap[item.page]
            return (
              <div key={item.id} className="flex items-center gap-[8px]">
                <button
                  className="flex items-center gap-3 cursor-pointer transition-all backdrop-blur-[4px]"
                  style={{
                    width: 316, height: 60, borderRadius: 30, paddingLeft: 16,
                    border: '3px solid rgba(112,112,112,0.45)', background: 'transparent',
                  }}
                >
                  {Icon && <Icon className="text-[#707070]" />}
                  <span
                    className="text-[#707070]"
                    style={{ fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", fontWeight: 400, marginTop: 4 }}
                  >
                    {item.label}
                  </span>
                </button>
                {editing && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-black/40 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </GlassCard>
  )
}
