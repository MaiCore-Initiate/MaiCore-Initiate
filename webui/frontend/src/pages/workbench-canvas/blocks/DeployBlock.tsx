import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchPoint, type WorkbenchSize } from '../types'

export const deployBlockMinSize: WorkbenchSize = { width: 456, height: 210 }
export const deployBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#d97706'

function InputPort() {
  return (
    <g transform={`translate(${deployBlockInputOffset.x - 2.5} ${deployBlockInputOffset.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill={accent} stroke={accent} strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke={accent} strokeWidth="2" />
    </g>
  )
}

export default function DeployBlock({
  position,
  size,
  selected,
  onSelect,
  dragHandlers,
  resizeHandlers,
}: {
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  onSelect?: () => void
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyWidth = Math.max(deployBlockMinSize.width, size.width)
  const bodyHeight = Math.max(deployBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const contentClipId = 'dfw-deploy-block-content-clip'

  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}

      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="30" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={headerHeight} rx="30" fill={accent} opacity="0.2" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY + 30} width={bodyWidth} height={headerHeight - 30} fill={accent} opacity="0.2" />

      <defs>
        <clipPath id={contentClipId}>
          <rect x="18" y="76" width={bodyWidth - 36} height={bodyHeight - 96} />
        </clipPath>
      </defs>

      <text x="22" y="44" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        [DEPLOY]
      </text>
      <text x="22" y="94" fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="500" opacity="0.78" clipPath={`url(#${contentClipId})`}>
        <tspan>部署管理闸</tspan>
      </text>

      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx="30"
        fill="transparent"
        className="cursor-pointer"
        onClick={event => {
          event.stopPropagation()
          onSelect?.()
        }}
        onPointerDown={event => event.stopPropagation()}
      />

      <InputPort />

      <g
        className="cursor-grab active:cursor-grabbing"
        onClick={event => {
          event.stopPropagation()
          onSelect?.()
        }}
        onPointerDown={dragHandlers?.onHeaderPointerDown}
        onPointerMove={dragHandlers?.onHeaderPointerMove}
        onPointerUp={dragHandlers?.onHeaderPointerUp}
        onPointerCancel={dragHandlers?.onHeaderPointerCancel}
      >
        <rect x={bodyX} y={bodyY} width={bodyWidth} height={headerHeight} rx="30" fill="transparent" />
      </g>

      <rect
        x={bodyX + bodyWidth - 10}
        y={bodyY}
        width="20"
        height={bodyHeight}
        fill="transparent"
        className="cursor-ew-resize"
        onPointerDown={event => resizeHandlers?.onResizePointerDown?.('right', event)}
        onPointerMove={resizeHandlers?.onResizePointerMove}
        onPointerUp={resizeHandlers?.onResizePointerUp}
        onPointerCancel={resizeHandlers?.onResizePointerCancel}
      />
      <rect
        x={bodyX}
        y={bodyY + bodyHeight - 10}
        width={bodyWidth}
        height="20"
        fill="transparent"
        className="cursor-ns-resize"
        onPointerDown={event => resizeHandlers?.onResizePointerDown?.('bottom', event)}
        onPointerMove={resizeHandlers?.onResizePointerMove}
        onPointerUp={resizeHandlers?.onResizePointerUp}
        onPointerCancel={resizeHandlers?.onResizePointerCancel}
      />
      <rect
        x={bodyX + bodyWidth - 12}
        y={bodyY + bodyHeight - 12}
        width="24"
        height="24"
        fill="transparent"
        className="cursor-nwse-resize"
        onPointerDown={event => resizeHandlers?.onResizePointerDown?.('corner', event)}
        onPointerMove={resizeHandlers?.onResizePointerMove}
        onPointerUp={resizeHandlers?.onResizePointerUp}
        onPointerCancel={resizeHandlers?.onResizePointerCancel}
      />
    </g>
  )
}