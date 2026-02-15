import type { Tab } from '../../types'

interface HeaderProps {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab: () => void
  onLogout: () => void
}

export default function Header({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab, onLogout }: HeaderProps) {
  return (
    <header className="h-[87px] flex items-center gap-2 px-4 bg-white/5 backdrop-blur-[30px] border-b border-black/10">
      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className="flex items-center gap-2 px-5 py-2 cursor-pointer select-none shrink-0 transition-all"
              style={{
                borderRadius: 20,
                border: active ? '5px solid rgba(0,0,0,0.5)' : '1px solid #000',
                background: active ? 'rgba(255,255,255,0.25)' : 'transparent',
              }}
            >
              <span
                className={active ? 'text-black/80' : 'text-black/50'}
                style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
              >
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
                  className="ml-1 text-black/40 hover:text-black/70 transition-colors"
                  style={{ fontSize: 16, lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {/* 新增标签按钮 */}
        <button
          onClick={onAddTab}
          className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full border border-black/30 text-black/40 hover:text-black/70 hover:border-black/50 transition-all cursor-pointer"
          style={{ fontSize: 20 }}
        >
          +
        </button>
      </div>

      <button
        onClick={onLogout}
        className="ml-4 px-4 py-2 text-black/50 hover:text-black/80 transition-colors shrink-0 cursor-pointer"
        style={{ fontSize: 18, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
      >
        退出
      </button>
    </header>
  )
}
