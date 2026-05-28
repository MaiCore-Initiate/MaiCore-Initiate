import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  CirclePlus,
  Clock,
  File,
  Globe,
  Plus,
  Search,
  Star,
  Upload,
} from 'lucide-react'
import { CardSquaresIcon, ListDashesIcon } from '../components/icons/SidebarIcons'

export type TemplateWorkbenchSection = 'recent' | 'my-templates' | 'market' | 'starred'
export type TemplateWorkbenchItemType = 'deployment-flow' | 'folder' | 'script' | 'archive'
export type TemplateWorkbenchLayout = 'card' | 'list'

export interface TemplateWorkbenchItem {
  id: string
  name: string
  type: TemplateWorkbenchItemType
  updatedAt: string
  childCount?: number
}

export interface TemplateWorkbenchSlots {
  sidebarFooter?: ReactNode
  toolbarTrailing?: ReactNode
  contentLeading?: ReactNode
  contentTrailing?: ReactNode
}

export interface TemplateWorkbenchProps {
  items?: TemplateWorkbenchItem[]
  slots?: TemplateWorkbenchSlots
  onCreateProject?: () => void
  onCreateFolder?: () => void
  onUploadProject?: () => void
  onImportProject?: () => void
  onOpenItem?: (item: TemplateWorkbenchItem) => void
  onSelectSection?: (section: TemplateWorkbenchSection) => void
  onReturnToSource?: () => void
}

const defaultItems: TemplateWorkbenchItem[] = [
  { id: 'draft-1', name: '未命名', type: 'deployment-flow', updatedAt: '20分钟前' },
  { id: 'draft-2', name: '未命名1', type: 'deployment-flow', updatedAt: '22分钟前' },
  { id: 'draft-3', name: '未命名2', type: 'deployment-flow', updatedAt: '30分钟前' },
  { id: 'folder-abc', name: 'abc', type: 'folder', updatedAt: '昨天', childCount: 3 },
]

const sidebarItems: Array<{ id: TemplateWorkbenchSection; label: string; icon: typeof Clock; top: number }> = [
  { id: 'recent', label: '最近', icon: Clock, top: 96 },
  { id: 'my-templates', label: '我的模板', icon: File, top: 149 },
  { id: 'market', label: '资源集市', icon: Globe, top: 202 },
]

const cardPositions = [
  { left: 400, top: 306 },
  { left: 693, top: 306 },
  { left: 986, top: 306 },
  { left: 1279, top: 306 },
]

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const gridBaseSpacing = 32
const gridMinScreenSpacing = 16
const gridMaxScreenSpacing = 48
const workbenchMinZoom = 0.08
const workbenchMaxZoom = 8
const leftSidebarDefaultWidth = 305
const leftSidebarCollapsedWidth = 70
const leftSidebarMinWidth = 150
const leftSidebarMaxWidth = 520

type OutlineIconType = 'boolean' | 'array' | 'object' | 'string' | 'number'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function resolveGridSpacing(scale: number) {
  let logicalSpacing = gridBaseSpacing
  let screenSpacing = logicalSpacing * scale

  while (screenSpacing < gridMinScreenSpacing) {
    logicalSpacing *= 2
    screenSpacing *= 2
  }

  while (screenSpacing > gridMaxScreenSpacing) {
    logicalSpacing /= 2
    screenSpacing /= 2
  }

  return { logicalSpacing, screenSpacing }
}

function SidebarToolButton({
  left,
  top = 20,
  label,
  onClick,
  children,
}: {
  left: number
  top?: number
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
      style={{
        left,
        top,
        borderColor: 'var(--dfw-sidebar-border)',
        background: 'var(--dfw-sidebar-bg)',
        color: 'var(--dfw-text)',
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function TextAlignLeftGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 41 41" fill="none" aria-hidden>
      <path d="M9.5 13h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 18h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 23h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 28h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function CaretGlyph({ direction }: { direction: 'down' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {direction === 'down'
        ? <path d="M14.25 5.5L8 11.75L1.75 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M5.5 1.75L11.75 8L5.5 14.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

function OutlineTypeIcon({ type }: { type: OutlineIconType }) {
  if (type === 'boolean') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M12.75 6.25L15.25 8.75L12.75 11.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.75 8.75H15.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.25 13.75L3.75 11.25L6.25 8.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.25 11.25H3.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'array') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M6.25 3.125H3.125V16.875H6.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.75 3.125H16.875V16.875H13.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'object') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M6.25 3.125C1.25 3.125 6.25 10 1.25 10C6.25 10 1.25 16.875 6.25 16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.75 3.125C18.75 3.125 13.75 10 18.75 10C13.75 10 18.75 16.875 13.75 16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'string') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 2.25H15.5C16.328 2.25 17 2.922 17 3.75V14.25C17 15.078 16.328 15.75 15.5 15.75H2.5C1.672 15.75 1 15.078 1 14.25V3.75C1 2.922 1.672 2.25 2.5 2.25Z" stroke="currentColor" />
        <path d="M4.438 6.5H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.438 9H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.438 11.5H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.125 7.5H16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.125 12.5H16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 3.125V16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 3.125V16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OutlineRow({
  top,
  label,
  labelLeft,
  caret,
  caretLeft,
  icon,
  iconLeft,
  muted = false,
  selected = false,
  width,
  selectedWidth,
}: {
  top: number
  label: string
  labelLeft: number
  caret?: 'down' | 'right'
  caretLeft?: number
  icon?: OutlineIconType
  iconLeft?: number
  muted?: boolean
  selected?: boolean
  width: number
  selectedWidth?: number
}) {
  const color = muted ? 'var(--dfw-outline-muted)' : 'var(--dfw-text)'
  return (
    <div className="absolute h-[24px]" style={{ left: 0, top, width }}>
      {selected && (
        <div
          className="absolute h-[24px]"
          style={{
            left: 6,
            top: 0,
            width: selectedWidth ?? width,
            background: 'var(--dfw-outline-selected-bg)',
            border: '1px solid var(--dfw-blue)',
          }}
        />
      )}
      {caret && (
        <span className="absolute top-[4px] flex h-[16px] w-[16px] items-center justify-center" style={{ left: caretLeft ?? 8, color }}>
          <CaretGlyph direction={caret} />
        </span>
      )}
      {icon && (
        <span className="absolute top-[2px] flex h-[20px] w-[20px] items-center justify-center" style={{ left: iconLeft ?? 38, color }}>
          <OutlineTypeIcon type={icon} />
        </span>
      )}
      <span
        className="absolute top-0 block h-[24px] overflow-hidden text-ellipsis whitespace-nowrap leading-[24px]"
        style={{
          left: labelLeft,
          right: 0,
          color,
          fontFamily: font,
          fontSize: 20,
          fontWeight: 300,
        }}
      >
        {label}
      </span>
    </div>
  )
}

function OutlineLine({ left, top, height, muted = false }: { left: number; top: number; height: number; muted?: boolean }) {
  return (
    <div
      className="absolute w-px"
      style={{
        left,
        top,
        height,
        background: muted ? 'var(--dfw-outline-muted)' : 'var(--dfw-text)',
      }}
      aria-hidden
    />
  )
}

function WorkbenchOutline({ sidebarWidth }: { sidebarWidth: number }) {
  const rowWidth = Math.max(0, sidebarWidth - 27)
  const selectedWidth = Math.max(0, sidebarWidth - 40)
  const dividerWidth = Math.max(0, sidebarWidth - 40)

  return (
    <div className="absolute" style={{ left: 13.16, top: 128.32, width: rowWidth, height: 500 }}>
      <span
        className="absolute leading-[24px]"
        style={{ left: 5.84, top: 0, color: 'var(--dfw-text)', fontFamily: font, fontSize: 20, fontWeight: 400 }}
      >
        大纲
      </span>

      <OutlineLine left={16} top={69} height={22} />
      <OutlineRow top={45} label="[MCStart]" labelLeft={25.84} caret="down" caretLeft={8} width={rowWidth} muted />
      <OutlineRow top={69} label="MCStart = true" labelLeft={55.84} icon="boolean" iconLeft={36} width={rowWidth} muted />

      <OutlineLine left={16} top={120} height={72} />
      <OutlineRow top={96} label="[MODINFO]" labelLeft={25.84} caret="down" caretLeft={8} width={rowWidth} />
      <OutlineRow top={120} label={'author = "MCStartTeam"'} labelLeft={55.84} icon="string" iconLeft={37} width={rowWidth} />
      <OutlineLine left={26} top={171} height={21} />
      <OutlineRow top={144} label="tags" labelLeft={55.84} caret="down" caretLeft={18} icon="array" iconLeft={36} width={rowWidth} />
      <OutlineRow top={168} label={'0 = "test"'} labelLeft={65.84} icon="string" iconLeft={47} width={rowWidth} selected selectedWidth={selectedWidth} />
      <span
        className="absolute leading-[24px]"
        style={{ left: 15.84, top: 193, color: 'var(--dfw-text)', fontFamily: font, fontSize: 20, fontWeight: 300 }}
      >
        ......
      </span>

      <OutlineLine left={16} top={244} height={72} />
      <OutlineRow top={220} label="[COMPONENTS]" labelLeft={25.84} caret="down" caretLeft={8} width={rowWidth} />
      <OutlineRow top={244} label="env_output = false" labelLeft={55.84} icon="boolean" iconLeft={36} width={rowWidth} />
      <OutlineRow top={268} label="env_input = false" labelLeft={55.84} icon="boolean" iconLeft={36} width={rowWidth} />
      <OutlineRow top={292} label="list" labelLeft={55.84} caret="right" caretLeft={18} icon="array" iconLeft={36} width={rowWidth} />

      <OutlineLine left={16} top={343} height={45} />
      <OutlineRow top={319} label="[[Component]]" labelLeft={25.84} caret="down" caretLeft={8} width={rowWidth} />
      <OutlineRow top={343} label="0" labelLeft={55.84} caret="right" caretLeft={18} icon="object" iconLeft={36} width={rowWidth} />
      <OutlineRow top={367} label="1" labelLeft={55.84} caret="right" caretLeft={18} icon="object" iconLeft={36} width={rowWidth} />

      <span
        className="absolute leading-[24px]"
        style={{ left: 11.84, top: 394, color: 'var(--dfw-text)', fontFamily: font, fontSize: 20, fontWeight: 300 }}
      >
        ......
      </span>
      <div className="absolute h-[24px]" style={{ left: -4.16, top: 433, width: dividerWidth, color: 'var(--dfw-text)' }}>
        <span
          className="absolute left-0 top-0 block h-[24px] overflow-hidden text-ellipsis whitespace-nowrap leading-[24px]"
          style={{ right: 34, fontFamily: font, fontSize: 20, fontWeight: 300 }}
        >
          特殊说明，数字键的图标是
        </span>
        <span className="absolute top-[2px] flex h-[20px] w-[20px] items-center justify-center" style={{ left: 246 }}>
          <OutlineTypeIcon type="number" />
        </span>
      </div>
    </div>
  )
}

function WorkbenchLeftSidebar({
  collapsed,
  width,
  onToggleCollapsed,
  onBackToLibrary,
  onResize,
}: {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onBackToLibrary: () => void
  onResize: (width: number) => void
}) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const nextWidth = start.width + event.clientX - start.x
    if (nextWidth < leftSidebarMinWidth - 24) {
      resizeStartRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onToggleCollapsed()
      return
    }
    onResize(clamp(nextWidth, leftSidebarMinWidth, leftSidebarMaxWidth))
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStartRef.current = null
  }

  if (collapsed) {
    return (
      <aside
        data-workbench-ui
        className="absolute left-0 top-0 z-20 h-[1080px]"
        style={{ width: leftSidebarCollapsedWidth }}
      >
        <div
          className="absolute inset-y-0 left-0 border"
          style={{
            width: leftSidebarCollapsedWidth,
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            borderRadius: '0 30px 30px 0',
          }}
        />
        <SidebarToolButton left={15} label="展开左侧边栏" onClick={onToggleCollapsed}>
          <TextAlignLeftGlyph />
        </SidebarToolButton>
      </aside>
    )
  }

  return (
    <aside data-workbench-ui className="absolute left-0 top-0 z-20 h-[1080px]" style={{ width }}>
      <div
        className="absolute inset-0 border"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          borderRadius: '0 30px 30px 0',
        }}
      />
      <SidebarToolButton left={20} label="返回项目列表" onClick={onBackToLibrary}>
        <ArrowLeft size={30} strokeWidth={2} />
      </SidebarToolButton>
      <SidebarToolButton left={70} label="收起左侧边栏" onClick={onToggleCollapsed}>
        <TextAlignLeftGlyph />
      </SidebarToolButton>
      <SidebarToolButton left={120} label="新建工作区">
        <Plus size={30} strokeWidth={2} />
      </SidebarToolButton>
      <div
        className="absolute h-px"
        style={{ left: 20, top: 109.5, width: Math.max(0, width - 40), background: 'var(--dfw-sidebar-border)' }}
        aria-hidden
      />
      <WorkbenchOutline sidebarWidth={width} />
      <div
        className="absolute bottom-[30px] right-[-5px] top-[30px] w-[10px] cursor-ew-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        aria-label="调整左侧边栏宽度"
        title="调整左侧边栏宽度"
      />
    </aside>
  )
}

function typeLabel(type: TemplateWorkbenchItemType) {
  const labels: Record<TemplateWorkbenchItemType, string> = {
    'deployment-flow': '部署流程',
    folder: '文件夹',
    script: '部署脚本',
    archive: '归档包',
  }
  return labels[type]
}

function FileCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="absolute rounded-[10px] border text-left transition-colors hover:bg-[var(--twb-hover)]"
      style={{ left, top, width: 272, height: 206.72, borderColor: 'var(--twb-card-border)', color: 'var(--twb-text)' }}
    >
      <div
        className="absolute inset-x-[-1px] bottom-[-1px] rounded-b-[10px] border"
        style={{ height: 53.72, borderColor: 'var(--twb-card-border)', background: 'var(--twb-bg)' }}
      />
      <div className="absolute" style={{ left: 7, top: 162 }}>
        <div className="leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.updatedAt}</div>
      </div>
      <Star size={25} strokeWidth={1.5} className="absolute" style={{ right: 7, bottom: 18 }} />
    </button>
  )
}

function FolderCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="absolute text-left transition-transform hover:-translate-y-[1px]"
      style={{ left, top, width: 273, height: 207, color: 'var(--twb-text)' }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 273 207" fill="none" aria-hidden>
        <path
          d="M12 1H88C90.4 1 92.7 1.8 94.7 3.2L134 31.5C136 32.9 138.3 33.7 140.7 33.7H261C267.1 33.7 272 38.6 272 44.7V195C272 201.1 267.1 206 261 206H12C5.9 206 1 201.1 1 195V12C1 5.9 5.9 1 12 1Z"
          fill="var(--twb-folder-fill)"
          stroke="var(--twb-folder-border)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M2 154H271V195C271 200.5 266.5 205 261 205H12C6.5 205 2 200.5 2 195V154Z" fill="var(--twb-folder-band)" />
        <path d="M2 154H271" stroke="var(--twb-card-border)" />
      </svg>
      <div className="absolute" style={{ left: 7, top: 162 }}>
        <div className="leading-none" style={{ fontFamily: font, fontSize: 18, fontWeight: 700 }}>{item.name}</div>
        <div className="mt-[7px] leading-none" style={{ color: 'var(--twb-muted)', fontFamily: font, fontSize: 15, fontWeight: 300 }}>{item.updatedAt}</div>
      </div>
      {typeof item.childCount === 'number' && (
        <div className="absolute leading-none" style={{ right: 20, top: 170, fontFamily: font, fontSize: 20, fontWeight: 500 }}>
          +{item.childCount}
        </div>
      )}
    </button>
  )
}

function ProjectCard({
  item,
  left,
  top,
  onOpen,
}: {
  item: TemplateWorkbenchItem
  left: number
  top: number
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  if (item.type === 'folder') return <FolderCard item={item} left={left} top={top} onOpen={onOpen} />
  return <FileCard item={item} left={left} top={top} onOpen={onOpen} />
}

function ListStarGlyph() {
  return (
    <>
      <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
      <path
        d="M12.913,18.378l4.725,3a.8.8,0,0,0,1.181-.891L17.45,15.106c0-.019-.009-.037-.012-.056s-.006-.038-.008-.057,0-.038,0-.057,0-.038,0-.057,0-.038,0-.057,0-.038.008-.057.007-.038.012-.056.01-.037.016-.055.013-.036.02-.054.015-.035.024-.052.017-.034.027-.05.02-.033.031-.048.022-.031.034-.046.024-.03.037-.044.026-.028.04-.041l.043-.038,4.237-3.534a.813.813,0,0,0-.45-1.434l-5.531-.356-.056-.005-.056-.009-.055-.013-.054-.017-.052-.021-.051-.025-.049-.028L15.561,8.8l-.044-.035-.041-.038c-.013-.013-.026-.027-.038-.041s-.024-.029-.035-.044-.022-.03-.032-.046-.02-.032-.029-.048-.017-.033-.025-.05-.015-.034-.021-.052L13.231,3.256q-.01-.028-.022-.055c-.008-.018-.017-.036-.027-.053s-.02-.034-.03-.051-.022-.033-.034-.048S13.093,3.018,13.08,3s-.027-.029-.041-.043-.029-.027-.044-.039l-.047-.036-.05-.032-.052-.028L12.79,2.8l-.056-.02-.057-.016-.058-.011-.059-.007-.059,0-.059,0-.059.007-.058.011-.057.016-.056.02-.054.024-.052.028-.05.032-.047.036q-.023.019-.044.039T11.92,3c-.013.015-.026.03-.038.046s-.023.032-.034.048-.021.034-.03.051-.018.035-.027.053-.016.036-.023.055L9.706,8.45q-.01.026-.021.052t-.025.05q-.013.025-.029.048T9.6,8.647q-.017.023-.035.044l-.038.041-.041.038L9.439,8.8l-.046.032-.049.028-.051.025-.052.021-.054.017-.055.013-.056.009-.056.005-5.531.356a.813.813,0,0,0-.45,1.434l4.237,3.534.043.038q.021.02.04.041c.013.014.025.029.037.044s.023.03.034.046.021.032.031.048.019.033.027.05.016.035.024.052.014.036.02.054.011.036.016.055.009.037.012.056.006.038.008.057,0,.038,0,.057,0,.038,0,.057,0,.038,0,.057,0,.038-.008.057-.007.037-.012.056L6.284,20.094a.949.949,0,0,0,1.406,1.069l4.4-2.784.047-.028.049-.024.05-.021.052-.017.053-.013.054-.01.054-.006.054,0,.054,0,.054.006.054.01.053.013.052.017.05.021.049.024Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </>
  )
}

function CloudArrowDownGlyph() {
  return (
    <>
      <rect width="32" height="32" transform="translate(0.5 0.5)" fill="none" />
      <path d="M15.262,22.263,19.5,26.5l4.237-4.237" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M19.5,16.5v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path
        d="M12.5,26.5h-3q-.172,0-.343-.008t-.343-.025q-.171-.017-.341-.042t-.339-.059q-.169-.034-.335-.075T7.468,26.2q-.164-.05-.326-.108t-.321-.124q-.159-.066-.314-.139T6.2,25.674q-.152-.081-.3-.169t-.29-.184q-.143-.1-.281-.2t-.271-.211q-.133-.109-.26-.225T4.55,24.45q-.122-.121-.237-.249t-.224-.26q-.109-.133-.211-.271t-.2-.281q-.1-.143-.184-.29t-.169-.3q-.081-.152-.154-.307t-.139-.314q-.066-.159-.124-.32T2.8,21.532q-.05-.165-.092-.331t-.075-.335q-.034-.168-.059-.339t-.042-.341q-.017-.171-.025-.343T2.5,19.5q0-.172.008-.344t.025-.343q.017-.171.042-.341t.059-.339q.034-.169.075-.335t.092-.331q.05-.164.108-.326t.124-.32q.066-.159.139-.314t.154-.307q.081-.152.169-.3t.184-.29q.1-.143.2-.281t.211-.271q.109-.133.224-.26t.237-.249q.122-.122.249-.237t.26-.225q.133-.109.271-.211t.281-.2q.143-.1.29-.184t.3-.169q.152-.081.307-.154t.314-.139q.159-.066.321-.124t.326-.108q.164-.05.331-.092t.335-.075q.169-.033.339-.059t.341-.042q.171-.017.343-.025T9.5,12.5a7.194,7.194,0,0,1,1.738.212"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M10.5,16.5q0-.3.017-.591t.052-.589q.035-.294.087-.585t.122-.579q.069-.288.156-.571t.189-.56q.1-.277.222-.548t.254-.534q.135-.263.285-.518t.315-.5q.165-.246.344-.481t.372-.46q.193-.224.4-.437t.424-.413q.218-.2.447-.387t.469-.36q.24-.173.49-.331t.509-.3q.259-.143.525-.271t.54-.24q.274-.112.554-.207t.565-.174q.285-.079.574-.141t.582-.106q.292-.045.587-.072t.59-.037q.3-.01.591,0t.59.033q.295.025.587.068t.582.1q.29.06.575.137t.566.17q.281.094.555.2t.542.236q.267.126.527.268t.511.3q.251.157.492.328t.472.356q.231.185.45.384t.427.41q.207.211.4.434t.375.457q.181.234.347.479t.319.5q.152.254.288.516t.258.532q.121.27.226.547t.193.559q.088.282.16.569t.126.578q.054.291.091.584t.057.589q.02.3.022.591t-.013.591q-.016.3-.048.589t-.083.586q-.05.291-.118.58t-.151.572q-.084.284-.185.562t-.218.55q-.117.272-.25.536t-.281.52q-.148.256-.312.5T28.5,22.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </>
  )
}

function FolderNotchGlyph() {
  return (
    <>
      <rect width="32" height="32" transform="translate(0.5 0.5)" fill="none" />
      <path
        d="M16.5,10.5H27.549l.049,0,.049.006.048.008.048.011.047.013.047.015.046.018.045.02.044.022.043.024.042.026.04.028.039.03.037.032.036.034.034.035.032.037.03.039.028.04.026.042.024.043.022.044.02.045q.009.023.018.046c.006.015.011.031.016.047s.009.031.013.047.008.032.011.048.006.032.008.048,0,.032.006.049,0,.033,0,.049,0,.033,0,.049v14c0,.016,0,.033,0,.049s0,.033,0,.049,0,.033-.006.049-.005.032-.008.048-.007.032-.011.048-.008.032-.013.047-.01.031-.016.047-.011.031-.018.046-.013.03-.02.045l-.022.044-.024.043-.026.042-.028.04-.03.039-.032.037-.034.036-.036.034-.037.032-.039.03-.04.028-.042.026-.043.024-.044.022-.045.02-.046.018-.047.016-.047.013-.048.011-.048.008L27.6,26.5l-.049,0H5.451l-.049,0-.049-.006L5.3,26.481l-.048-.011-.047-.013-.047-.016-.046-.018-.045-.02-.044-.022-.043-.024-.041-.026L4.9,26.3l-.039-.03-.037-.032-.036-.034-.034-.036-.032-.037L4.7,26.1l-.028-.04-.026-.042-.024-.043L4.6,25.927q-.011-.022-.02-.045c-.006-.015-.012-.03-.018-.046s-.011-.031-.015-.047-.009-.031-.013-.047-.008-.032-.011-.048-.006-.032-.008-.048,0-.032-.006-.049,0-.032,0-.049,0-.033,0-.049v-12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12.163,13.5H4.5v-5q0-.025,0-.049t0-.049q0-.024.006-.049T4.519,8.3q0-.024.011-.048t.013-.047q.007-.023.015-.047t.018-.046q.009-.023.02-.045l.022-.044.024-.043.026-.041L4.7,7.9l.03-.039.032-.037.034-.036.036-.034.037-.032L4.9,7.7l.04-.028.041-.026.043-.024L5.072,7.6l.045-.02.046-.018.047-.015.047-.013L5.3,7.519l.048-.008L5.4,7.5l.049,0h6.712a1.013,1.013,0,0,1,.6.2L16.5,10.5l-3.738,2.8a1.015,1.015,0,0,1-.136.085,1.013,1.013,0,0,1-.464.115Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </>
  )
}

function ProjectList({
  items,
  onOpen,
}: {
  items: TemplateWorkbenchItem[]
  onOpen?: (item: TemplateWorkbenchItem) => void
}) {
  const rowStart = 61
  const rowGap = 80
  const height = items.length > 0 ? rowStart + (items.length - 1) * rowGap + 60 : 121

  return (
    <div className="absolute" style={{ left: 400, top: 285, width: 1470, height, color: 'var(--twb-text)' }}>
      {items.map((item, index) => {
        const rowY = rowStart + index * rowGap
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen?.(item)}
            className="absolute z-0 rounded-[5px] transition-colors hover:bg-[var(--twb-hover)]"
            style={{ left: 0, top: rowY, width: 1470, height: 60 }}
            aria-label={`打开${item.name}`}
          />
        )
      })}
      <svg className="absolute left-0 top-0 z-10 pointer-events-none overflow-visible" width="1470" height={height} viewBox={`0 0 1470 ${height}`} fill="none" aria-hidden>
        <text x="0" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">名称</text>
        <text x="540" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">文件类型</text>
        <text x="1120" y="21" fill="var(--twb-muted)" fontSize="20" fontFamily={font} fontWeight="300">更新时间</text>
        <path d="M0 31H1470" stroke="var(--twb-muted)" strokeWidth="1" />

        {items.map((item, index) => {
          const rowY = rowStart + index * rowGap
          const isFolder = item.type === 'folder'
          return (
            <g key={item.id}>
              <rect x="0" y={rowY} width="60" height="60" rx="5" fill="var(--twb-bg)" stroke="var(--twb-border)" strokeWidth="0.4" />
              {!isFolder && (
                <g transform={`translate(69.5 ${rowY + 17.5})`}>
                  <ListStarGlyph />
                </g>
              )}
              <text x={isFolder ? 70 : 104} y={rowY + 40} fill="currentColor" fontSize="25" fontFamily={font} fontWeight="300">{item.name}</text>
              <g transform={`translate(539.5 ${rowY + 13.5})`}>
                {isFolder ? <FolderNotchGlyph /> : <CloudArrowDownGlyph />}
              </g>
              <text x="572" y={rowY + 40} fill="currentColor" fontSize="25" fontFamily={font} fontWeight="300">{typeLabel(item.type)}</text>
              <text x="1120" y={rowY + 40} fill="var(--twb-muted)" fontSize="25" fontFamily={font} fontWeight="300">{item.updatedAt}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function DeploymentFlowWorkbench({ onBackToLibrary }: { onBackToLibrary: () => void }) {
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(leftSidebarDefaultWidth)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; viewportX: number; viewportY: number } | null>(null)
  const grid = resolveGridSpacing(viewport.scale)
  const gridStyle = {
    backgroundSize: `${grid.screenSpacing}px ${grid.screenSpacing}px`,
    backgroundPosition: `${positiveModulo(viewport.x, grid.screenSpacing)}px ${positiveModulo(viewport.y, grid.screenSpacing)}px`,
  }

  useEffect(() => {
    const workbench = workbenchRef.current
    if (!workbench) return

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-workbench-ui]')) return

      event.preventDefault()
      event.stopPropagation()

      const rect = workbench.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      setViewport(prev => {
        const nextScale = clamp(prev.scale * Math.exp(-event.deltaY * 0.0012), workbenchMinZoom, workbenchMaxZoom)
        const scaleRatio = nextScale / prev.scale
        return {
          scale: nextScale,
          x: pointerX - (pointerX - prev.x) * scaleRatio,
          y: pointerY - (pointerY - prev.y) * scaleRatio,
        }
      })
    }

    workbench.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => workbench.removeEventListener('wheel', handleNativeWheel)
  }, [])

  useEffect(() => {
    const preventBrowserGestureZoom = (event: Event) => {
      event.preventDefault()
    }

    document.addEventListener('gesturestart', preventBrowserGestureZoom)
    document.addEventListener('gesturechange', preventBrowserGestureZoom)
    return () => {
      document.removeEventListener('gesturestart', preventBrowserGestureZoom)
      document.removeEventListener('gesturechange', preventBrowserGestureZoom)
    }
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('[data-workbench-ui]')) return
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPanning(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    setViewport(prev => ({
      ...prev,
      x: start.viewportX + event.clientX - start.x,
      y: start.viewportY + event.clientY - start.y,
    }))
  }

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panStartRef.current = null
    setIsPanning(false)
  }

  return (
    <div
      ref={workbenchRef}
      className="deployment-flow-workbench relative h-full w-full overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
      style={{
        background: 'var(--dfw-bg)',
        color: 'var(--dfw-text)',
        cursor: isPanning ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div className="deployment-flow-workbench-grid absolute inset-0 pointer-events-none" style={gridStyle} aria-hidden />
      <WorkbenchLeftSidebar
        collapsed={leftSidebarCollapsed}
        width={leftSidebarWidth}
        onToggleCollapsed={() => setLeftSidebarCollapsed(prev => !prev)}
        onResize={setLeftSidebarWidth}
        onBackToLibrary={onBackToLibrary}
      />
    </div>
  )
}

function ContentHeader({
  layoutMode,
  onToggleLayout,
}: {
  layoutMode: TemplateWorkbenchLayout
  onToggleLayout: () => void
}) {
  const LayoutIcon = layoutMode === 'card' ? CardSquaresIcon : ListDashesIcon
  return (
    <div className="absolute" style={{ left: 400, top: 98, width: 1470, height: 48, color: 'var(--twb-text)' }}>
      <svg className="absolute inset-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="1470" height="48" viewBox="0 0 1470 48" aria-hidden>
        <g transform="translate(-400 -98)">
          <path d="M0,.5H1470" transform="translate(400 144.5)" fill="none" stroke="currentColor" strokeWidth="1" />
          <g transform="translate(400 96.63)">
            <path d="M0,47H120" transform="translate(0 -0.63)" fill="none" stroke="var(--twb-blue)" strokeWidth="5" />
            <text transform="translate(0 33.37)" fill="currentColor" fontSize="30" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">
              全部项目
            </text>
          </g>
          <text transform="translate(530 130)" fill="currentColor" fontSize="30" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">
            回收站
          </text>
          <g transform="translate(1685.75 114.95)">
            <text transform="translate(0.25 23.05)" fill="currentColor" fontSize="25" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">
              更新时间
            </text>
            <g transform="translate(3 -2)">
              <path d="M121.125,11.75,113,19.875l-8.125-8.125" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              <rect width="32" height="32" transform="translate(97.25 0.05)" fill="none" />
            </g>
          </g>
        </g>
      </svg>
      <button type="button" className="absolute left-0 top-0 h-[48px] w-[120px]" aria-label="全部项目" />
      <button type="button" className="absolute left-[130px] top-0 h-[48px] w-[120px]" aria-label="回收站" />
      <button type="button" className="absolute left-[1285px] top-0 h-[48px] w-[140px]" aria-label="排序方式" />
      <button
        type="button"
        onClick={onToggleLayout}
        className="absolute left-[1438px] top-[15px] flex h-[32px] w-[32px] items-center justify-center transition-colors hover:bg-[var(--twb-hover)]"
        aria-label={layoutMode === 'card' ? '当前卡片布局，点击切换到列表布局' : '当前列表布局，点击切换到卡片布局'}
      >
        <LayoutIcon />
      </button>
    </div>
  )
}

function QuickActions({
  onCreateProject,
  onCreateFolder,
  onUploadProject,
}: {
  onCreateProject?: () => void
  onCreateFolder?: () => void
  onUploadProject?: () => void
}) {
  return (
    <div className="absolute" style={{ left: 400, top: 196, width: 961, height: 61, color: 'var(--twb-text)' }}>
      <svg className="absolute inset-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="961" height="61" viewBox="0 0 961 61" aria-hidden>
        <g transform="translate(-399.5 -195.5)">
          <g>
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><path d="M24.25,5.5v8.75H33Z" fill="currentColor" /></g>
              <path d="M31.75,35.5H9.25l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L8.772,35.4l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046-.038-.048-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055T8.1,34.728q-.012-.028-.022-.057c-.007-.019-.013-.039-.019-.058s-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061V6.75q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.06q.006-.03.013-.06t.016-.059q.009-.029.019-.058T8.1,6.272q.012-.028.025-.056t.028-.055q.014-.027.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04.048-.038.05-.035.052-.033.053-.03.055-.028L8.772,5.6l.057-.022.058-.019.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h15L33,14.25v20c0,.021,0,.041,0,.061s0,.041,0,.061,0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.012.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M24.25,5.5v8.75H33" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M16.75,24.25h7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,20.5V28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">新建项目</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">部署流程、部署脚本</text>
            </g>
          </g>

          <g transform="translate(330)">
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">新建文件夹</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">文件收纳归类</text>
            </g>
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><path d="M15.078,16.75H5.5V10.5q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061c0-.02.008-.04.013-.06s.01-.04.016-.059.012-.039.019-.058.014-.038.022-.057.016-.038.025-.056.018-.037.028-.055.02-.036.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04L6.005,9.5l.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022L6.387,9.3l.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h8.328a1.265,1.265,0,0,1,.75.25L20.5,13l-4.672,3.5a1.254,1.254,0,0,1-.17.107,1.241,1.241,0,0,1-.185.078,1.259,1.259,0,0,1-.395.065Z" fill="currentColor" /></g>
              <path d="M20.5,13H34.25l.061,0,.061,0,.061.008.061.01.06.014.059.016.058.019.057.022.056.025.055.028.054.03.052.033.05.035.048.038.046.04.044.042.042.044.04.047.038.048.035.05q.017.026.033.052c.01.017.021.035.03.053s.019.036.028.055.017.037.025.056.015.038.022.057.013.039.019.058.011.039.016.059.009.04.013.06.007.04.011.061.006.04.007.061,0,.041,0,.061,0,.041,0,.061v17.5c0,.021,0,.041,0,.061s0,.041,0,.061,0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.013.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0-.061,0H6.75l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L6.272,32.9l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046-.038-.048-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055T5.6,32.228q-.012-.028-.022-.057c-.007-.019-.013-.039-.019-.058s-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061v-15" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M15.078,16.75H5.5V10.5q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061c0-.02.008-.04.013-.06s.01-.04.016-.059.012-.039.019-.058.014-.038.022-.057.016-.038.025-.056.018-.037.028-.055.02-.036.03-.053l.033-.052.035-.05.038-.048.04-.046.042-.044.044-.042.046-.04L6.005,9.5l.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022L6.387,9.3l.059-.016.06-.013.06-.01.061-.008.061,0,.061,0h8.328a1.265,1.265,0,0,1,.75.25L20.5,13l-4.672,3.5a1.254,1.254,0,0,1-.17.107,1.241,1.241,0,0,1-.185.078,1.259,1.259,0,0,1-.395.065Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M16.75,23.625h7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,19.875v7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
          </g>

          <g transform="translate(660)">
            <rect width="300" height="60" rx="10" transform="translate(400 196)" fill="none" stroke="currentColor" strokeWidth="1" />
            <g transform="translate(657.5 213.5)">
              <rect width="24" height="24" transform="translate(0.5 0.5)" fill="none" />
              <path d="M4.25,12.5h16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M12.5,4.25v16.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <g transform="translate(-8 -2)">
              <text transform="translate(458 227)" fill="currentColor" fontSize="22" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="500">上传项目</text>
              <text transform="translate(458 249)" fill="var(--twb-muted)" fontSize="15" fontFamily="HarmonyOS Sans SC, HYWenHei, sans-serif" fontWeight="300">.toml、.zip、.mcsmod、.iso...</text>
            </g>
            <g transform="translate(404.5 205.5)">
              <rect width="40" height="40" transform="translate(0.5 0.5)" fill="none" />
              <g opacity="0.2"><rect width="32.5" height="12.5" rx="1" transform="translate(4.25 20.5)" fill="currentColor" /></g>
              <path d="M28,20.5h7.5l.061,0,.061,0,.061.007.061.01.06.013.059.016.058.019.057.022.056.025.055.028.054.03.052.033.05.035.048.038.046.04.044.042.042.045.04.046.038.048.035.05.033.052c.01.018.021.035.03.054s.019.036.028.055.017.037.025.056.015.038.022.057.013.039.019.058.011.039.016.059.009.04.013.06.007.04.011.061.006.04.007.061,0,.041,0,.061,0,.041,0,.061v10q0,.031,0,.061c0,.02,0,.041,0,.061s0,.041-.007.061-.006.04-.011.061-.008.04-.013.06-.01.04-.016.059-.012.039-.019.058-.014.038-.022.057-.016.038-.025.056-.018.037-.028.055-.02.036-.03.054-.021.035-.033.052l-.035.05-.038.048-.04.046-.042.044-.044.042-.046.04-.048.038-.05.035-.052.033-.054.03-.055.028-.056.025-.057.022-.058.019-.059.016-.06.013-.061.011-.061.007-.061,0L35.5,33H5.5l-.061,0-.061,0-.061-.007-.06-.011-.06-.013-.059-.016-.058-.019L5.022,32.9l-.056-.025-.055-.028-.053-.03-.052-.033-.05-.035-.048-.038-.046-.04-.044-.042-.042-.044-.04-.046L4.5,32.495l-.035-.05-.033-.052-.03-.054q-.014-.027-.028-.055t-.025-.056c-.008-.019-.015-.038-.022-.057s-.013-.039-.019-.058-.011-.039-.016-.059-.009-.04-.013-.06-.007-.04-.01-.061-.005-.04-.008-.061,0-.041,0-.061,0-.041,0-.061v-10q0-.031,0-.061t0-.061q0-.031.008-.061t.01-.061q.006-.03.013-.06t.016-.059q.009-.029.019-.058c.007-.019.014-.038.022-.057s.016-.038.025-.056.018-.037.028-.055.02-.036.03-.054l.033-.052.035-.05.038-.048.04-.046.042-.045.044-.042.046-.04.048-.038.05-.035.052-.033.053-.03.055-.028.056-.025.057-.022.058-.019.059-.016.06-.013.06-.01.061-.007.061,0,.061,0H13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M20.5,20.5V4.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <path d="M13,11.75l7.5-7.5,7.5,7.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <circle cx="1.875" cy="1.875" r="1.875" transform="translate(28 24.875)" fill="currentColor" />
            </g>
          </g>
        </g>
      </svg>
      <button type="button" onClick={onCreateProject} className="absolute left-0 top-0 h-[61px] w-[300px]" aria-label="新建项目" />
      <button type="button" onClick={onCreateFolder} className="absolute left-[330px] top-0 h-[61px] w-[300px]" aria-label="新建文件夹" />
      <button type="button" onClick={onUploadProject} className="absolute left-[660px] top-0 h-[61px] w-[300px]" aria-label="上传项目" />
    </div>
  )
}

export default function TemplateWorkbench({
  items,
  slots,
  onCreateProject,
  onCreateFolder,
  onUploadProject,
  onImportProject,
  onOpenItem,
  onSelectSection,
  onReturnToSource,
}: TemplateWorkbenchProps) {
  const [activeSection, setActiveSection] = useState<TemplateWorkbenchSection>('my-templates')
  const [layoutMode, setLayoutMode] = useState<TemplateWorkbenchLayout>('card')
  const [activeWorkbenchItem, setActiveWorkbenchItem] = useState<TemplateWorkbenchItem | null>(null)
  const projectItems = items ?? defaultItems

  const selectSection = (section: TemplateWorkbenchSection) => {
    setActiveSection(section)
    onSelectSection?.(section)
  }

  const openItem = (item: TemplateWorkbenchItem) => {
    onOpenItem?.(item)
    if (item.type === 'deployment-flow') {
      setActiveWorkbenchItem(item)
    }
  }

  if (activeWorkbenchItem) {
    return (
      <DeploymentFlowWorkbench
        onBackToLibrary={() => setActiveWorkbenchItem(null)}
      />
    )
  }

  return (
    <div className="template-workbench relative h-full w-full overflow-hidden" style={{ background: 'var(--twb-bg)', color: 'var(--twb-text)' }}>
      <aside className="absolute left-0 top-0 z-10 h-[1080px] w-[350px]" style={{ background: 'var(--twb-sidebar-bg)' }}>
        <button
          type="button"
          onClick={onReturnToSource}
          className="absolute left-[20px] top-[20px] flex h-[40px] items-center transition-colors hover:bg-[var(--twb-hover)]"
          style={{ width: 210, color: 'var(--twb-text)' }}
          aria-label="返回进入工作台前的页面"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.png`}
            alt=""
            aria-hidden
            className="h-[40px] w-[40px] rounded-[10px] object-cover"
          />
          <span className="ml-[10px] leading-none" style={{ fontFamily: font, fontSize: 30, fontWeight: 900 }}>
            MCStart
          </span>
        </button>

        {sidebarItems.map(({ id, label, icon: Icon, top }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSection(id)}
            className="absolute flex items-center text-left transition-colors hover:bg-[var(--twb-hover)]"
            style={{
              left: 20,
              top,
              width: 214,
              height: 40,
              background: activeSection === id ? 'var(--twb-selected)' : 'transparent',
              border: activeSection === id ? '1px solid var(--twb-blue)' : '1px solid transparent',
              color: 'var(--twb-text)',
            }}
          >
            <Icon size={32} className="ml-[3px]" />
            <span className="ml-[12px] leading-none" style={{ fontFamily: font, fontSize: 25, fontWeight: 500 }}>{label}</span>
          </button>
        ))}

        <div className="absolute left-[25px] top-[278px] h-px w-[300px]" style={{ background: 'var(--twb-border)' }} />
        <button
          type="button"
          onClick={() => selectSection('starred')}
          className="absolute flex items-center text-left transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 17, top: 296, width: 316, height: 40, color: 'var(--twb-text)' }}
        >
          <Star size={32} />
          <span className="ml-[17px] leading-none" style={{ fontFamily: font, fontSize: 25, fontWeight: 500 }}>星标工作台</span>
          <CirclePlus size={28} className="ml-auto" />
        </button>

        {slots?.sidebarFooter && <div className="absolute left-[25px] bottom-[25px] right-[25px]">{slots.sidebarFooter}</div>}
      </aside>

      <header className="absolute left-[350px] top-0 z-10 h-[71px] w-[1570px] border-b" style={{ borderColor: 'var(--twb-border)' }}>
        <button
          type="button"
          onClick={onCreateProject}
          className="absolute flex items-center justify-center transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 18, top: 19, width: 33, height: 33, color: 'var(--twb-text)' }}
        >
          <Plus size={32} />
        </button>
        <div className="absolute left-[69px] top-[16px] h-[40px] w-px" style={{ background: 'var(--twb-border)' }} />
        <label className="absolute flex items-center rounded-[6px] border" style={{ left: 95, top: 15, width: 482, height: 41, borderColor: 'var(--twb-border)', color: 'var(--twb-muted)' }}>
          <Search size={30} className="ml-[10px]" />
          <input
            className="ml-[10px] min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--twb-muted)]"
            placeholder="搜索项目、文件、文件夹"
            style={{ color: 'var(--twb-text)', fontFamily: font, fontSize: 20, fontWeight: 300 }}
          />
        </label>
        <div className="absolute" style={{ right: 30, top: 15 }}>{slots?.toolbarTrailing}</div>
        <button
          type="button"
          onClick={onReturnToSource}
          className="absolute flex items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 1345, top: 15, width: 41, height: 41, color: 'var(--twb-text)' }}
          aria-label="返回进入工作台前的页面"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="41" height="41" viewBox="0 0 41 41" fill="none" aria-hidden>
            <path
              fill="currentColor"
              d="M5.5 0L35.5 0C38.5376 0 41 2.46243 41 5.5L41 35.5C41 38.5376 38.5376 41 35.5 41L5.5 41C2.46243 41 2.98023e-08 38.5376 2.98023e-08 35.5L2.98023e-08 5.5C2.98023e-08 2.46243 2.46243 0 5.5 0ZM5.5 1C3.01472 1 1 3.01472 1 5.5L1 35.5C1 37.9853 3.01472 40 5.5 40L35.5 40C37.9853 40 40 37.9853 40 35.5L40 5.5C40 3.01472 37.9853 1 35.5 1L5.5 1Z"
            />
            <path
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              d="M26.5 17.5L26.5 21.5L14.5 21.5"
            />
            <path
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              d="M17.5 18.5L14.5 21.5L17.5 24.5"
            />
            <path
              fill="currentColor"
              d="M9.5 9.5L31.5 9.5C32.6046 9.5 33.5 10.3954 33.5 11.5L33.5 29.5C33.5 30.6046 32.6046 31.5 31.5 31.5L9.5 31.5C8.39543 31.5 7.5 30.6046 7.5 29.5L7.5 11.5C7.5 10.3954 8.39543 9.5 9.5 9.5ZM9.5 11.5C9.5 11.5 9.5 11.5 9.5 11.5L9.5 29.5C9.5 29.5 9.5 29.5 9.5 29.5L31.5 29.5C31.5 29.5 31.5 29.5 31.5 29.5L31.5 11.5C31.5 11.5 31.5 11.5 31.5 11.5L9.5 11.5Z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onImportProject}
          className="absolute flex items-center rounded-[6px] border transition-colors hover:bg-[var(--twb-hover)]"
          style={{ left: 1406, top: 15, width: 134, height: 41, borderColor: 'var(--twb-border)', color: 'var(--twb-text)' }}
        >
          <Upload size={32} className="ml-[8px]" />
          <span className="ml-[4px] leading-none" style={{ fontFamily: font, fontSize: 20, fontWeight: 500 }}>导入项目</span>
        </button>
      </header>

      <main className="absolute left-0 top-0 z-0 h-[1080px] w-[1920px]">
        <ContentHeader
          layoutMode={layoutMode}
          onToggleLayout={() => setLayoutMode(prev => prev === 'card' ? 'list' : 'card')}
        />

        <QuickActions
          onCreateProject={onCreateProject}
          onCreateFolder={onCreateFolder}
          onUploadProject={onUploadProject}
        />

        {slots?.contentLeading}

        {layoutMode === 'card' && projectItems.slice(0, 4).map((item, index) => (
          <ProjectCard
            key={item.id}
            item={item}
            left={cardPositions[index].left}
            top={cardPositions[index].top}
            onOpen={openItem}
          />
        ))}

        {layoutMode === 'list' && (
          <ProjectList items={projectItems} onOpen={openItem} />
        )}

        {slots?.contentTrailing}
      </main>
    </div>
  )
}
