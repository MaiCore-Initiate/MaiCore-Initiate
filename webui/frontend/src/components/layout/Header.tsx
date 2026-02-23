import { useState, useCallback, useRef, useEffect } from 'react'
import type { Tab, Page } from '../../types'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'

const MAX_TABS = 12

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
  onCloseOtherTabs: (id: string) => void
  onCloseRightTabs: (id: string) => void
  onReorderTabs: (from: number, to: number) => void
  onAddTab: () => void
  onLogout: () => void
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 17 17" fill="none" className={className}>
      <line x2="24.042" transform="rotate(45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x2="24.042" transform="translate(0 17) rotate(-45)" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function ScrollArrow({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={direction === 'left' ? '向左滚动' : '向右滚动'}
      className="flex items-center justify-center w-[28px] h-[28px] text-black/40 hover:text-black/70 transition-colors cursor-pointer shrink-0 z-20"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d={direction === 'left' ? 'M8 1L3 6L8 11' : 'M4 1L9 6L4 11'}
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export default function Header({ tabs, activeTabId, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseRightTabs, onReorderTabs, onAddTab, onLogout }: HeaderProps) {
  const [closingId, setClosingId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // 使用 1px 的容差，避免浮点数计算导致的闪烁
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [updateScrollState, tabs.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        el.scrollBy({ left: e.deltaY, behavior: 'smooth' })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [contextMenu])

  const handleClose = useCallback((id: string) => {
    if (tabs.length <= 1) return
    setClosingId(id)
    setTimeout(() => { setClosingId(null); onCloseTab(id) }, 200)
  }, [onCloseTab, tabs.length])

  const scroll = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })

  const handleDragStart = (e: React.DragEvent, i: number) => {
    setDragIndex(i)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(i)
  }
  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragIndex
    setDragIndex(null)
    setDragOverIndex(null)
    if (fromIndex !== null && fromIndex !== toIndex) onReorderTabs(fromIndex, toIndex)
  }
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const atLimit = tabs.length >= MAX_TABS

  return (
    <header className="h-[87px] flex items-center px-[8px] border-b border-[#707070] shrink-0 gap-[10px]">
      {/* 标签栏主胶囊容器：添加 overflow-hidden 以修复子元素溢出圆角的问题 */}
      <div
        className="relative flex items-center h-[71px] min-w-0 overflow-hidden bg-white/5"
        style={{ borderRadius: 35.5, border: '2px solid #000', boxShadow: '5px 5px 4px rgba(0,0,0,0.161)' }}
      >
        {/* 左侧：滚动区域 Wrapper (占据剩余空间) */}
        <div className="relative h-full min-w-0 overflow-hidden flex items-center">
          
          {/* 左滚动箭头遮罩 */}
          <div 
            className={`absolute left-0 z-10 flex items-center h-full pl-[4px] pr-[12px] transition-opacity duration-200 pointer-events-none ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.95) 40%, transparent)' }}
          >
            <div className="pointer-events-auto">
              <ScrollArrow direction="left" onClick={() => scroll(-1)} />
            </div>
          </div>

          {/* 实际滚动容器 */}
          <div
            ref={scrollRef}
            className="flex items-center h-full px-[6px] overflow-x-auto scrollbar-hide"
          >
            {tabs.map((tab, i) => {
              const active = tab.id === activeTabId
              const closing = tab.id === closingId
              const dragging = dragIndex === i
              const Icon = pageIcons[tab.page]
              const showDropLeft = dragOverIndex === i && dragIndex !== null && dragIndex > i
              const showDropRight = dragOverIndex === i && dragIndex !== null && dragIndex < i
              
              return (
                <div key={tab.id} className="flex items-center shrink-0">
                  {/* 分隔线：除了第一个元素，或者当前是激活态，或者前一个是激活态时需要考虑隐藏逻辑，这里简化保留原逻辑 */}
                  {i > 0 && <div className="w-[3px] h-[34px] bg-black/60 rounded-full mx-[4px] shrink-0" />}
                  
                  {/* 拖拽指示器 */}
                  {showDropLeft && <div className="w-[3px] h-[40px] bg-blue-500 rounded-full mx-[2px] shrink-0 transition-all" />}
                  
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    onContextMenu={(e) => handleContextMenu(e, tab.id)}
                    onClick={() => onSelectTab(tab.id)}
                    className={`group flex items-center gap-[8px] h-[61px] px-[16px] cursor-pointer select-none shrink-0 transition-all duration-200 backdrop-blur-[4px] ${closing ? '' : 'animate-tab-enter'}`}
                    style={{
                      borderRadius: 30.5,
                      border: active ? '5px solid rgba(0,0,0,0.5)' : `1px solid ${dragging ? 'transparent' : '#000'}`,
                      background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                      overflow: 'hidden',
                      opacity: dragging ? 0.4 : 1,
                      maxWidth: 220, 
                      minWidth: 80,
                      // 平滑关闭动画
                      ...(closing ? { maxWidth: 0, padding: 0, minWidth: 0, opacity: 0, margin: 0, border: 0 } : {}),
                    }}
                  >
                    <Icon className="text-black shrink-0" style={{ width: 28, height: 28 }} />
                    <span
                      className="text-black whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{ fontSize: 25, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif", fontWeight: 600, marginTop: 4 }}
                    >
                      {tab.label}
                    </span>
                    {tabs.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClose(tab.id) }}
                        title="关闭标签页"
                        className={`ml-[2px] w-[20px] h-[20px] flex items-center justify-center text-black/40 hover:text-black/70 transition-all cursor-pointer shrink-0 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                  
                  {showDropRight && <div className="w-[3px] h-[40px] bg-blue-500 rounded-full mx-[2px] shrink-0 transition-all" />}
                </div>
              )
            })}
          </div>

          {/* 右滚动箭头遮罩 (在滚动区域内部，但在内容之上) */}
          <div 
            className={`absolute right-0 z-10 flex items-center h-full pr-[4px] pl-[12px] transition-opacity duration-200 pointer-events-none ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'linear-gradient(to left, rgba(255,255,255,0.95) 40%, transparent)' }}
          >
            <div className="pointer-events-auto">
              <ScrollArrow direction="right" onClick={() => scroll(1)} />
            </div>
          </div>
        </div>

        {/* 右侧：固定区域（分隔线 + 新增按钮）- 不随标签滚动 */}
        <div className="flex items-center shrink-0 pr-[16px] pl-[4px] bg-transparent z-20 relative">
          <div className="w-[3px] h-[34px] bg-black/60 rounded-full mx-[4px]" />
          <button
            onClick={atLimit ? undefined : onAddTab}
            className={`mx-[4px] w-[22px] h-[22px] flex items-center justify-center transition-opacity cursor-pointer ${atLimit ? 'opacity-20 cursor-not-allowed' : 'opacity-60 hover:opacity-80'}`}
            style={{ transform: 'rotate(45deg)' }}
            title={atLimit ? '已达最大标签数' : '新建标签页'}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* 退出按钮 */}
      <button
        onClick={onLogout}
        className="ml-auto shrink-0 cursor-pointer text-black/50 hover:text-black/80 hover:bg-black/5 transition-all select-none"
        style={{
          fontSize: 20, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif",
          border: '2px solid #000', borderRadius: 30, padding: '8px 20px',
          boxShadow: '5px 5px 4px rgba(0,0,0,0.161)',
        }}
      >
        退出
      </button>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 backdrop-blur-[20px] bg-white/90 border-2 border-black/10 rounded-[16px] py-[6px] shadow-xl min-w-[160px]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 130) }}
        >
          {[
            { label: '关闭当前标签', action: () => { handleClose(contextMenu.tabId); setContextMenu(null) }, disabled: tabs.length <= 1 },
            { label: '关闭其他标签', action: () => { onCloseOtherTabs(contextMenu.tabId); setContextMenu(null) }, disabled: tabs.length <= 1 },
            { label: '关闭右侧标签', action: () => { onCloseRightTabs(contextMenu.tabId); setContextMenu(null) }, disabled: tabs.findIndex(t => t.id === contextMenu.tabId) >= tabs.length - 1 },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.disabled ? undefined : item.action}
              className={`block w-full text-left px-[16px] py-[8px] whitespace-nowrap transition-colors ${item.disabled ? 'text-black/30 cursor-not-allowed' : 'text-black/80 hover:bg-black/10 cursor-pointer'}`}
              style={{ fontSize: 16, fontFamily: "'HYWenHei', 'Yu Gothic UI', sans-serif" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
