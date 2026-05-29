import { useRef, useState } from 'react'
import { CircleX, House, Plus } from 'lucide-react'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const topTabsChromeWidth = 180
const topTabsGap = 9
const topTabsMinWidth = 407

export interface WorkbenchTab {
  id: string
  title: string
}

export interface WorkbenchTopTabsProps {
  onBackToLibrary: () => void
  leftBoundary: number
  initialTabs?: WorkbenchTab[]
  rightReservedWidth?: number
}

const defaultTabs: WorkbenchTab[] = [
  { id: 'workspace-0', title: '未命名' },
  { id: 'workspace-1', title: '未命名1' },
]

function Divider() {
  return (
    <span
      className="h-[30px] w-[2px] shrink-0 rounded-full"
      style={{ background: 'var(--dfw-bottom-divider)' }}
      aria-hidden
    />
  )
}

function tabWidth(title: string) {
  return Math.max(100, 62 + title.length * 18)
}

export default function WorkbenchTopTabs({
  onBackToLibrary,
  leftBoundary,
  initialTabs = defaultTabs,
  rightReservedWidth = 600,
}: WorkbenchTopTabsProps) {
  const [tabs, setTabs] = useState<WorkbenchTab[]>(initialTabs)
  const [activeId, setActiveId] = useState(initialTabs[0]?.id ?? '')
  const nextTabIndexRef = useRef(initialTabs.length)
  const tabsScrollerRef = useRef<HTMLDivElement | null>(null)
  const tabsWidth = tabs.reduce((total, tab, index) => {
    return total + tabWidth(tab.title) + (index > 0 ? topTabsGap : 0)
  }, 0)
  const toolbarWidth = Math.max(topTabsMinWidth, topTabsChromeWidth + tabsWidth)

  const createTab = () => {
    const index = nextTabIndexRef.current
    nextTabIndexRef.current += 1

    const nextTab = {
      id: `workspace-${index}`,
      title: `未命名${index}`,
    }

    setTabs(prev => [...prev, nextTab])
    setActiveId(nextTab.id)
    requestAnimationFrame(() => {
      const scroller = tabsScrollerRef.current
      if (!scroller) return
      scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' })
    })
  }

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return

    const closingIndex = tabs.findIndex(tab => tab.id === id)
    const nextTabs = tabs.filter(tab => tab.id !== id)
    setTabs(nextTabs)

    if (activeId === id) {
      const nextActive = nextTabs[Math.min(closingIndex, nextTabs.length - 1)]
      setActiveId(nextActive?.id ?? '')
    }
  }

  return (
    <nav
      data-workbench-ui
      className="pointer-events-none absolute top-[19.5px] z-30 h-[61px] transition-[left,right] duration-150 ease-out"
      style={{
        left: leftBoundary,
        right: rightReservedWidth,
        color: 'var(--dfw-text)',
        fontFamily: font,
      }}
      aria-label="工作区标签栏"
    >
      <div
        className="pointer-events-auto relative mx-auto h-[61px] max-w-full transition-[width] duration-150 ease-out"
        style={{ width: toolbarWidth }}
      >
        <div
          className="absolute inset-0 rounded-[30px] border"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
          }}
        />

        <button
          type="button"
          onClick={onBackToLibrary}
          className="absolute left-[10.5px] top-[10.5px] flex h-[40px] w-[40px] items-center justify-center rounded-full border-2 transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
          }}
          aria-label="返回主界面"
          title="返回主界面"
        >
          <House size={30} strokeWidth={2} />
        </button>

        <span className="absolute left-[70.5px] top-[15.5px]">
          <Divider />
        </span>

        <div
          ref={tabsScrollerRef}
          className="absolute left-[90px] right-[90px] top-[10px] flex h-[41px] items-center gap-[9px] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {tabs.map(tab => {
            const selected = tab.id === activeId
            const width = tabWidth(tab.title)

            return (
              <div
                key={tab.id}
                className="relative h-[40px] shrink-0 rounded-[20px] border text-[20px] font-medium leading-none transition-[background-color,opacity,transform] duration-150"
                style={{
                  width,
                  borderColor: 'var(--dfw-sidebar-border)',
                  background: selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  animation: 'dfw-top-tab-enter 0.16s ease-out both',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  className="absolute inset-0 rounded-[20px] text-left transition-colors hover:bg-[var(--dfw-control-hover)]"
                  aria-selected={selected}
                  role="tab"
                  title={tab.title}
                >
                  <span className="absolute left-[14px] right-[38px] top-0 block h-[40px] overflow-hidden whitespace-nowrap leading-[40px]">
                    {tab.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="absolute right-[8px] top-[10px] flex h-[20px] w-[20px] items-center justify-center rounded-full transition-colors hover:bg-[var(--dfw-control-hover)]"
                  aria-label={`关闭${tab.title}`}
                  title="关闭"
                >
                  <CircleX size={20} strokeWidth={1.5} />
                </button>
              </div>
            )
          })}
        </div>

        <span className="absolute right-[70.5px] top-[15.5px]">
          <Divider />
        </span>

        <button
          type="button"
          onClick={createTab}
          className="absolute right-[10.5px] top-[10.5px] flex h-[40px] w-[40px] items-center justify-center rounded-full border-2 transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
          }}
          aria-label="新建工作区"
          title="新建工作区"
        >
          <Plus size={30} strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}
