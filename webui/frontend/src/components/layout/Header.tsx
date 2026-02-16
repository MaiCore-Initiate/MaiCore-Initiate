import { useState, useCallback } from 'react'
import type { Tab } from '../../types'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'
import type { Page } from '../../types'

const pageIcons: Record<Page, React.FC<React.SVGProps<SVGSVGElement>>> = {
  home: HomeIcon, instances: InstancesIcon, config: ConfigIcon, knowledge: KnowledgeIcon,
  'db-migration': DbMigrationIcon, plugins: PluginsIcon, deploy: DeployIcon,
  status: StatusIcon, logs: LogsIcon, misc: MiscIcon, settings: SettingsIcon,
}

interface HeaderProps {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab: () => void
  onLogout: () => void
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" className={className}>
      <line x2="24.042" transform="rotate(45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x2="24.042" transform="translate(0 17) rotate(-45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function Header({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab, onLogout }: HeaderProps) {
  const [closingId, setClosingId] = useState<string | null>(null)

  const handleClose = useCallback((id: string) => {
    setClosingId(id)
    setTimeout(() => {
      setClosingId(null)
      onCloseTab(id)
    }, 200)
  }, [onCloseTab])

  return (
    <header className="h-[87px] flex items-center px-[8px] border-b border-[#707070] shrink-0">
      {/* 签页背景衬底 */}
      <div
        className="flex items-center gap-0 h-[71px] px-[6px]"
        style={{
          borderRadius: 35.5,
          border: '2px solid #000',
          boxShadow: '5px 5px 4px rgba(0,0,0,0.161)',
        }}
      >
        {tabs.map((tab, i) => {
          const active = tab.id === activeTabId
          const closing = tab.id === closingId
          const Icon = pageIcons[tab.page]
          return (
            <div key={tab.id} className="flex items-center">
              {i > 0 && (
                <div className="w-[3px] h-[34px] bg-black/60 rounded-full mx-[4px]" />
              )}
              <div
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-[8px] h-[61px] px-[16px] cursor-pointer select-none shrink-0 transition-all backdrop-blur-[4px] ${closing ? '' : 'animate-tab-enter'}`}
                style={{
                  borderRadius: 30.5,
                  border: active ? '5px solid rgba(0,0,0,0.5)' : '1px solid #000',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  overflow: 'hidden',
                  ...(closing ? { opacity: 0, maxWidth: '0px', transition: 'opacity 0.2s ease, max-width 0.2s ease', padding: 0 } : {}),
                }}
              >
                <Icon className="text-black" style={{ width: 28, height: 28 }} />
                <span
                  className="text-black"
                  style={{ fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", fontWeight: 600, marginTop: 4 }}
                >
                  {tab.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleClose(tab.id) }}
                  className="ml-[4px] text-black/40 hover:text-black/70 transition-colors cursor-pointer"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          )
        })}

        {/* 分隔线 + 新增按钮 */}
        <div className="w-[3px] h-[34px] bg-black/60 rounded-full mx-[4px]" />
        <button
          onClick={onAddTab}
          className="opacity-60 hover:opacity-80 transition-opacity cursor-pointer mx-[8px]"
          style={{ transform: 'rotate(45deg)' }}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={onLogout}
        className="px-4 py-2 text-black/50 hover:text-black/80 transition-colors shrink-0 cursor-pointer"
        style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}
      >
        退出
      </button>
    </header>
  )
}
