import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import WorkbenchBottomBar from './WorkbenchBottomBar'
import WorkbenchRightSidebar, { rightSidebarCollapsedWidth, rightSidebarExpandedWidth } from './WorkbenchRightSidebar'
import WorkbenchTopTabs from './WorkbenchTopTabs'
import WorkbenchCanvas from './workbench-canvas/WorkbenchCanvas'
import type { WorkbenchBlockId } from './workbench-canvas/types'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const gridBaseSpacing = 32
const gridMinScreenSpacing = 16
const gridMaxScreenSpacing = 48
const workbenchMinZoom = 0.08
const workbenchMaxZoom = 8
const leftSidebarDefaultWidth = 305
const leftSidebarCollapsedWidth = 70
const leftSidebarMinWidth = 180
const leftSidebarMaxWidth = 520
const outlineRowHeight = 24
const outlineIndent = 10
const outlineBaseCaretLeft = 8
const outlineBaseIconLeft = 36
const outlineBaseTextLeft = 25.84
const outlineIconTextGap = 19.84
const bottomBarZoomAnimationMs = 180
const blockNames: Record<WorkbenchBlockId, string> = {
  start: '起始端点',
  init: '初始化块',
}

type WorkbenchViewport = { scale: number; x: number; y: number }

export type OutlineIconType = 'boolean' | 'array' | 'object' | 'string' | 'number'
export type OutlineNodeTone = 'normal' | 'locked' | 'note'

export interface OutlineNode {
  id: string
  label: string
  icon?: OutlineIconType
  trailingIcon?: OutlineIconType
  children?: OutlineNode[]
  defaultExpanded?: boolean
  defaultSelected?: boolean
  tone?: OutlineNodeTone
  selectable?: boolean
}

export interface DeploymentFlowWorkbenchProps {
  onBackToLibrary: () => void
  outline?: OutlineNode[]
  projectSequence?: string
}

interface WorkbenchProjectInfo {
  sequence: string
  mod_name: string
  path: string
}

const defaultOutline: OutlineNode[] = [
  {
    id: 'mcstart',
    label: '[MCStart]',
    defaultExpanded: true,
    tone: 'locked',
    children: [
      { id: 'mcstart-enabled', label: 'MCStart = true', icon: 'boolean', tone: 'locked' },
    ],
  },
  {
    id: 'modinfo',
    label: '[MODINFO]',
    defaultExpanded: true,
    children: [
      { id: 'modinfo-author', label: 'author = "MCStartTeam"', icon: 'string' },
      {
        id: 'modinfo-tags',
        label: 'tags',
        icon: 'array',
        defaultExpanded: true,
        children: [
          { id: 'modinfo-tags-0', label: '0 = "test"', icon: 'string', defaultSelected: true },
        ],
      },
    ],
  },
  {
    id: 'components',
    label: '[COMPONENTS]',
    defaultExpanded: true,
    children: [
      { id: 'components-env-output', label: 'env_output = false', icon: 'boolean' },
      { id: 'components-env-input', label: 'env_input = false', icon: 'boolean' },
      {
        id: 'components-list',
        label: 'list',
        icon: 'array',
        children: [
          { id: 'components-list-0', label: '0', icon: 'object' },
          { id: 'components-list-1', label: '1', icon: 'object' },
        ],
      },
    ],
  },
  {
    id: 'component-array',
    label: '[[Component]]',
    defaultExpanded: true,
    children: [
      { id: 'component-array-0', label: '0', icon: 'object' },
      { id: 'component-array-1', label: '1', icon: 'object' },
    ],
  },
]

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

function collectDefaultExpanded(nodes: OutlineNode[], result = new Set<string>()) {
  for (const node of nodes) {
    if (node.defaultExpanded) result.add(node.id)
    if (node.children) collectDefaultExpanded(node.children, result)
  }
  return result
}

function firstSelectableNode(nodes: OutlineNode[]): string {
  for (const node of nodes) {
    if (node.defaultSelected && node.selectable !== false) return node.id
    if (node.children) {
      const child = firstSelectableNode(node.children)
      if (child) return child
    }
  }

  for (const node of nodes) {
    if (node.selectable !== false) return node.id
    if (node.children) {
      const child = firstSelectableNode(node.children)
      if (child) return child
    }
  }
  return ''
}

interface FlattenedOutlineNode {
  node: OutlineNode
  depth: number
  hasChildren: boolean
  expanded: boolean
}

interface OutlineLineSegment {
  id: string
  depth: number
  startIndex: number
  endIndex: number
}

function flattenOutline(
  nodes: OutlineNode[],
  expanded: Set<string>,
  depth = 0,
): FlattenedOutlineNode[] {
  return nodes.flatMap(node => {
    const hasChildren = Boolean(node.children?.length)
    const isExpanded = hasChildren && expanded.has(node.id)
    const current = [{ node, depth, hasChildren, expanded: isExpanded }]
    if (!isExpanded || !node.children) return current
    return [...current, ...flattenOutline(node.children, expanded, depth + 1)]
  })
}

function collectOutlineLineSegments(flatNodes: FlattenedOutlineNode[]): OutlineLineSegment[] {
  return flatNodes.flatMap((item, index) => {
    if (!item.expanded) return []

    let lastDescendantIndex = index
    for (let nextIndex = index + 1; nextIndex < flatNodes.length; nextIndex += 1) {
      if (flatNodes[nextIndex].depth <= item.depth) break
      lastDescendantIndex = nextIndex
    }

    if (lastDescendantIndex === index) return []

    return [{
      id: `${item.node.id}-outline-line`,
      depth: item.depth,
      startIndex: index + 1,
      endIndex: lastDescendantIndex,
    }]
  })
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

function OutlineTree({
  nodes,
  sidebarWidth,
}: {
  nodes: OutlineNode[]
  sidebarWidth: number
}) {
  const [expanded, setExpanded] = useState(() => collectDefaultExpanded(nodes))
  const [selectedId, setSelectedId] = useState(() => firstSelectableNode(nodes))
  const flatNodes = useMemo(() => flattenOutline(nodes, expanded), [nodes, expanded])
  const lineSegments = useMemo(() => collectOutlineLineSegments(flatNodes), [flatNodes])
  const rowWidth = Math.max(0, sidebarWidth - 27)
  const selectedWidth = Math.max(0, sidebarWidth - 40)

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="absolute" style={{ left: 13.16, top: 128.32, width: rowWidth, bottom: 16 }}>
      <span
        className="absolute leading-[24px]"
        style={{ left: 5.84, top: 0, color: 'var(--dfw-text)', fontFamily: font, fontSize: 20, fontWeight: 400 }}
      >
        大纲
      </span>

      <div className="absolute left-0 right-0 top-[45px] bottom-0 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
          {lineSegments.map(segment => (
            <span
              key={segment.id}
              className="absolute w-px transition-[top,height,opacity] duration-150 ease-out"
              style={{
                left: outlineBaseCaretLeft + 8 + segment.depth * outlineIndent,
                top: segment.startIndex * outlineRowHeight,
                height: Math.max(0, (segment.endIndex - segment.startIndex + 1) * outlineRowHeight - 2),
                background: 'var(--dfw-text)',
              }}
            />
          ))}
        </div>
        {flatNodes.map(({ node, depth, hasChildren, expanded: isExpanded }, index) => {
          const depthOffset = depth * outlineIndent
          const iconLeft = outlineBaseIconLeft + depthOffset
          const textLeft = node.icon ? iconLeft + outlineIconTextGap : outlineBaseTextLeft + depthOffset
          const color = node.tone === 'locked' ? 'var(--dfw-outline-muted)' : 'var(--dfw-text)'
          const selectable = node.selectable !== false
          const selected = selectable && node.id === selectedId

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                if (hasChildren) toggleExpanded(node.id)
                if (selectable) setSelectedId(node.id)
              }}
              className="absolute left-0 h-[24px] text-left transition-[top,background-color,opacity,transform] duration-150 ease-out hover:bg-[var(--dfw-outline-hover)]"
              style={{
                top: index * outlineRowHeight,
                width: rowWidth,
                color,
                cursor: selectable || hasChildren ? 'pointer' : 'default',
                animation: 'dfw-outline-row-enter 0.16s ease-out both',
              }}
              aria-expanded={hasChildren ? isExpanded : undefined}
            >
              {selected && (
                <span
                  className="absolute left-[6px] top-0 h-[24px]"
                  style={{
                    width: selectedWidth,
                    background: 'var(--dfw-outline-selected-bg)',
                    border: '1px solid var(--dfw-blue)',
                  }}
                />
              )}
              {hasChildren && (
                <span
                  className="absolute top-[4px] z-20 flex h-[16px] w-[16px] items-center justify-center transition-transform duration-150 ease-out"
                  style={{
                    left: outlineBaseCaretLeft + depthOffset,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M5.5 1.75L11.75 8L5.5 14.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {node.icon && (
                <span className="absolute top-[2px] z-20 flex h-[20px] w-[20px] items-center justify-center" style={{ left: iconLeft }}>
                  <OutlineTypeIcon type={node.icon} />
                </span>
              )}
              <span
                className="absolute top-0 z-20 block h-[24px] overflow-hidden text-ellipsis whitespace-nowrap leading-[24px]"
                style={{
                  left: textLeft,
                  right: node.trailingIcon ? 32 : 4,
                  fontFamily: font,
                  fontSize: 20,
                  fontWeight: 300,
                }}
              >
                {node.label}
              </span>
              {node.trailingIcon && (
                <span className="absolute right-[14px] top-[2px] z-20 flex h-[20px] w-[20px] items-center justify-center">
                  <OutlineTypeIcon type={node.trailingIcon} />
                </span>
              )}
            </button>
          )
        })}
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
  outline,
}: {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onBackToLibrary: () => void
  onResize: (width: number) => void
  outline: OutlineNode[]
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
        className="absolute left-0 top-0 z-20 h-full"
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
    <aside data-workbench-ui className="absolute left-0 top-0 z-20 h-full" style={{ width }}>
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
      <OutlineTree nodes={outline} sidebarWidth={width} />
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

export default function DeploymentFlowWorkbench({
  onBackToLibrary,
  outline = defaultOutline,
  projectSequence,
}: DeploymentFlowWorkbenchProps) {
  const [viewport, setViewport] = useState<WorkbenchViewport>({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(leftSidebarDefaultWidth)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(rightSidebarExpandedWidth)
  const [projectInfo, setProjectInfo] = useState<WorkbenchProjectInfo | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<WorkbenchBlockId | null>(null)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; viewportX: number; viewportY: number } | null>(null)
  const viewportRef = useRef<WorkbenchViewport>(viewport)
  const viewportAnimationFrameRef = useRef<number | null>(null)
  const grid = resolveGridSpacing(viewport.scale)
  const gridStyle = {
    backgroundSize: `${grid.screenSpacing}px ${grid.screenSpacing}px`,
    backgroundPosition: `${positiveModulo(viewport.x, grid.screenSpacing)}px ${positiveModulo(viewport.y, grid.screenSpacing)}px`,
  }
  const topTabs = useMemo(() => [{
    id: 'workspace-0',
    title: projectInfo?.mod_name || '未命名',
  }], [projectInfo?.mod_name])

  const cancelViewportAnimation = () => {
    if (viewportAnimationFrameRef.current === null) return
    cancelAnimationFrame(viewportAnimationFrameRef.current)
    viewportAnimationFrameRef.current = null
  }

  const updateViewport = (nextViewport: WorkbenchViewport | ((current: WorkbenchViewport) => WorkbenchViewport)) => {
    setViewport(prev => {
      const next = typeof nextViewport === 'function' ? nextViewport(prev) : nextViewport
      viewportRef.current = next
      return next
    })
  }

  const animateViewportTo = (target: WorkbenchViewport) => {
    cancelViewportAnimation()

    const start = viewportRef.current
    const startedAt = performance.now()

    const step = (now: number) => {
      const progress = clamp((now - startedAt) / bottomBarZoomAnimationMs, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      updateViewport({
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      })

      if (progress < 1) {
        viewportAnimationFrameRef.current = requestAnimationFrame(step)
      } else {
        viewportAnimationFrameRef.current = null
      }
    }

    viewportAnimationFrameRef.current = requestAnimationFrame(step)
  }

  useEffect(() => () => cancelViewportAnimation(), [])

  useEffect(() => {
    if (!projectSequence) {
      setProjectInfo(null)
      return
    }

    let cancelled = false
    const loadProject = async () => {
      try {
        const response = await fetch(`/api/template-workbench/projects/${encodeURIComponent(projectSequence)}`, { credentials: 'include' })
        if (!response.ok) throw new Error(`加载工作台项目失败: ${response.status}`)
        const project = await response.json() as WorkbenchProjectInfo
        if (!cancelled) setProjectInfo(project)
      } catch (error) {
        console.error(error)
        if (!cancelled) setProjectInfo(null)
      }
    }

    void loadProject()
    return () => {
      cancelled = true
    }
  }, [projectSequence])

  useEffect(() => {
    const workbench = workbenchRef.current
    if (!workbench) return

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-workbench-ui]')) return

      cancelViewportAnimation()
      event.preventDefault()
      event.stopPropagation()

      const rect = workbench.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      updateViewport(prev => {
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
    cancelViewportAnimation()
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
    updateViewport(prev => ({
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

  const setScaleFromBottomBar = (scale: number) => {
    const workbench = workbenchRef.current
    if (!workbench) {
      updateViewport(prev => ({ ...prev, scale: clamp(scale, workbenchMinZoom, workbenchMaxZoom) }))
      return
    }

    const rect = workbench.getBoundingClientRect()
    const pointerX = rect.width / 2
    const pointerY = rect.height / 2

    const current = viewportRef.current
    const nextScale = clamp(scale, workbenchMinZoom, workbenchMaxZoom)
    const scaleRatio = nextScale / current.scale
    animateViewportTo({
      scale: nextScale,
      x: pointerX - (pointerX - current.x) * scaleRatio,
      y: pointerY - (pointerY - current.y) * scaleRatio,
    })
  }

  const leftSidebarRight = leftSidebarCollapsed ? leftSidebarCollapsedWidth : leftSidebarWidth
  const rightSidebarLeft = rightSidebarCollapsed ? rightSidebarCollapsedWidth : rightSidebarWidth

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
      <WorkbenchCanvas
        viewport={viewport}
        selectedBlockId={selectedBlockId}
        onSelectedBlockChange={setSelectedBlockId}
      />
      <WorkbenchLeftSidebar
        collapsed={leftSidebarCollapsed}
        width={leftSidebarWidth}
        onToggleCollapsed={() => setLeftSidebarCollapsed(prev => !prev)}
        onResize={setLeftSidebarWidth}
        onBackToLibrary={onBackToLibrary}
        outline={outline}
      />
      <WorkbenchTopTabs
        onBackToLibrary={onBackToLibrary}
        leftBoundary={leftSidebarRight}
        rightReservedWidth={rightSidebarLeft}
        initialTabs={topTabs}
      />
      <WorkbenchRightSidebar
        collapsed={rightSidebarCollapsed}
        width={rightSidebarWidth}
        onToggleCollapsed={() => setRightSidebarCollapsed(prev => !prev)}
        onResize={setRightSidebarWidth}
        selectedName={selectedBlockId ? blockNames[selectedBlockId] : '无'}
      />
      <WorkbenchBottomBar
        scale={viewport.scale}
        leftBoundary={leftSidebarRight}
        rightReservedWidth={rightSidebarLeft}
        collapsedLeft={leftSidebarRight + 30}
        onScaleChange={setScaleFromBottomBar}
      />
    </div>
  )
}
