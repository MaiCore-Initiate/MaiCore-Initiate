import { useMemo, useState } from 'react'
import { Bug, ChevronDown, Play, Plus, TextAlignCenter } from 'lucide-react'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

const zoomOptions = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

export interface WorkbenchBottomBarProps {
  scale: number
  collapsedLeft: number
  onScaleChange?: (scale: number) => void
  onAddNode?: () => void
  onRun?: () => void
  onDebug?: () => void
}

function formatZoom(scale: number) {
  return `${Math.round(scale * 100)}%`
}

function Divider() {
  return (
    <span
      className="mx-[19px] h-[30px] w-[2px] shrink-[2] rounded-full"
      style={{ background: 'var(--dfw-bottom-divider)' }}
      aria-hidden
    />
  )
}

function TextAlignCenterGlyph({ size = 30 }: { size?: number }) {
  return <TextAlignCenter size={size} strokeWidth={2} />
}

export default function WorkbenchBottomBar({
  scale,
  collapsedLeft,
  onScaleChange,
  onAddNode,
  onRun,
  onDebug,
}: WorkbenchBottomBarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const zoomLabel = useMemo(() => formatZoom(scale), [scale])

  return (
    <div
      data-workbench-ui
      className="absolute bottom-[30px] z-30 h-[61px] border transition-[left,width,max-width,border-radius,transform,background-color] duration-200 ease-out"
      style={{
        left: collapsed ? collapsedLeft : '50%',
        width: collapsed ? 61 : 589,
        maxWidth: collapsed ? 61 : 'calc(100% - 32px)',
        transform: collapsed ? 'translateX(0) scale(1)' : 'translateX(-50%) scale(1)',
        borderRadius: collapsed ? 999 : 30,
        borderColor: 'var(--dfw-sidebar-border)',
        background: 'var(--dfw-sidebar-bg)',
        color: 'var(--dfw-text)',
        fontFamily: font,
        overflow: zoomOpen && !collapsed ? 'visible' : 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute inset-0 flex items-center justify-center rounded-full transition-[opacity,transform,background-color] duration-150 hover:bg-[var(--dfw-control-hover)]"
        style={{
          opacity: collapsed ? 1 : 0,
          transform: collapsed ? 'scale(1)' : 'scale(0.72)',
          pointerEvents: collapsed ? 'auto' : 'none',
        }}
        aria-label="展开底栏"
        title="展开底栏"
      >
        <TextAlignCenterGlyph />
      </button>

      <div
        className="flex h-full w-full items-center px-[10px] transition-[opacity,transform] duration-150 ease-out"
        style={{
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'scale(0.86)' : 'scale(1)',
          transformOrigin: 'left center',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
        aria-hidden={collapsed}
      >
      <button
        type="button"
        onClick={() => {
          setZoomOpen(false)
          setCollapsed(true)
        }}
        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
        }}
        aria-label="收起底栏"
        title="收起底栏"
      >
        <TextAlignCenterGlyph />
      </button>

      <Divider />

      <div className="relative h-[40px] min-w-[84px] flex-[1_1_105px] max-w-[105px]">
        <button
          type="button"
          onClick={() => setZoomOpen(prev => !prev)}
          className="flex h-[40px] w-full items-center justify-between gap-[8px] rounded-[20px] border px-[8px] text-[20px] font-medium leading-none transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            fontFamily: font,
          }}
          aria-expanded={zoomOpen}
          aria-label={`缩放倍率 ${zoomLabel}`}
          title="缩放倍率"
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{zoomLabel}</span>
          <ChevronDown size={28} strokeWidth={2} className="shrink-0" />
        </button>

        {zoomOpen && (
            <div
            className="absolute bottom-[48px] left-0 grid w-full min-w-[105px] origin-bottom overflow-hidden rounded-[12px] border py-[4px]"
            style={{
              borderColor: 'var(--dfw-sidebar-border)',
              background: 'var(--dfw-sidebar-bg)',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.16)',
              animation: 'dfw-bottom-menu-in 0.14s ease-out both',
            }}
          >
            {zoomOptions.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onScaleChange?.(option)
                  setZoomOpen(false)
                }}
                className="h-[28px] px-[10px] text-left text-[16px] leading-[28px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{ fontFamily: font }}
              >
                {formatZoom(option)}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      <button
        type="button"
        onClick={onAddNode}
        className="flex h-[40px] min-w-[54px] flex-[1.3_1_144px] max-w-[144px] items-center justify-center gap-[12px] rounded-[20px] border px-[8px] text-[20px] font-medium leading-none transition-opacity hover:opacity-[0.88]"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-bottom-add-bg)',
          color: 'var(--dfw-bottom-action-text)',
          fontFamily: font,
        }}
        aria-label="添加节点"
        title="添加节点"
      >
        <Plus size={30} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">添加节点</span>
      </button>

      <Divider />

      <div className="relative h-[40px] min-w-[84px] flex-[1.45_1_159px] max-w-[159px]">
        <button
          type="button"
          onClick={onDebug}
          className="absolute inset-0 flex items-center justify-end rounded-[20px] border pr-[9px] transition-opacity hover:opacity-[0.88]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-bottom-debug-bg)',
            color: 'var(--dfw-bottom-action-text)',
          }}
          aria-label="调试"
          title="调试"
        >
          <Bug size={30} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onRun}
          className="absolute bottom-0 left-0 top-0 z-10 flex w-[min(120px,calc(100%-39px))] min-w-[45px] items-center justify-center gap-[8px] rounded-[20px] border px-[8px] text-[20px] font-medium leading-none transition-opacity hover:opacity-[0.88]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-bottom-run-bg)',
            color: 'var(--dfw-bottom-action-text)',
            fontFamily: font,
          }}
          aria-label="试运行"
          title="试运行"
        >
          <Play size={30} strokeWidth={2} className="shrink-0" />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">试运行</span>
        </button>
      </div>
      </div>
    </div>
  )
}
