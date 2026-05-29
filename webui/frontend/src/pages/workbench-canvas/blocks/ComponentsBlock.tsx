import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchPoint, type WorkbenchSize } from '../types'

export const componentsBlockMinSize: WorkbenchSize = { width: 456, height: 342 }
export const componentsBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#22b386'

export function resolveComponentsBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(componentsBlockMinSize.width, size.width),
    y: bodyY + Math.max(componentsBlockMinSize.height, size.height) / 2,
  }
}

function AddConnectorButton() {
  return (
    <g transform="translate(-12 0)">
      <circle cx="12" cy="12" r="12" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <path d="M7,12h10" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12,7v10" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </g>
  )
}

function InputPort() {
  return (
    <g transform={`translate(${componentsBlockInputOffset.x - 2.5} ${componentsBlockInputOffset.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill={accent} stroke={accent} strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke={accent} strokeWidth="2" />
    </g>
  )
}

function TextLine({
  x = 22,
  y,
  label,
  value,
  clipId,
  opacity = 1,
}: {
  x?: number
  y: number
  label: string
  value: string
  clipId: string
  opacity?: number
}) {
  return (
    <text x={x} y={y} fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="500" opacity={opacity} clipPath={`url(#${clipId})`}>
      <tspan>{label}</tspan>
      <tspan fontWeight="300">{value}</tspan>
    </text>
  )
}

export default function ComponentsBlock({
  position,
  size,
  selected,
  onSelect,
  onAddConnectorClick,
  dragHandlers,
  resizeHandlers,
}: {
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  onSelect?: () => void
  onAddConnectorClick?: () => void
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyWidth = Math.max(componentsBlockMinSize.width, size.width)
  const bodyHeight = Math.max(componentsBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const sectionClipId = 'dfw-components-block-section-clip'
  const componentClipId = 'dfw-components-block-component-clip'
  const componentY = 156
  const componentHeight = Math.max(136, bodyHeight - componentY - 22)
  const outputOffset = resolveComponentsBlockOutputOffset({ width: bodyWidth, height: bodyHeight })
  const connectorY = outputOffset.y - 12

  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}

      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx="30"
        fill="var(--dfw-bg)"
        stroke={accent}
        strokeWidth="2"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={headerHeight}
        rx="30"
        fill={accent}
        opacity="0.24"
        stroke={accent}
        strokeWidth="2"
      />
      <rect x={bodyX} y={bodyY + 30} width={bodyWidth} height={headerHeight - 30} fill={accent} opacity="0.24" />

      <defs>
        <clipPath id={sectionClipId}>
          <rect x="18" y="76" width={bodyWidth - 36} height="70" />
        </clipPath>
        <clipPath id={componentClipId}>
          <rect x="36" y={componentY + 48} width={bodyWidth - 72} height={componentHeight - 58} />
        </clipPath>
      </defs>

      <text x="22" y="44" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        [COMPONENTS]
      </text>
      <TextLine y={94} label="环境变量导出：" value="false" clipId={sectionClipId} />
      <TextLine y={120} label="环境变量导入：" value="false" clipId={sectionClipId} />
      <TextLine y={146} label="组件列表：" value='["python-runtime"]' clipId={sectionClipId} />

      <rect
        x="25"
        y={componentY}
        width={bodyWidth - 40}
        height={componentHeight}
        rx="22"
        fill={accent}
        opacity="0.12"
        stroke={accent}
        strokeWidth="2"
      />
      <text x="42" y={componentY + 34} fontSize="22" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor" opacity="0.78">
        [[Component]]
      </text>
      <TextLine x={42} y={componentY + 68} label="组件名称：" value="Python Runtime" clipId={componentClipId} opacity={0.72} />
      <TextLine x={42} y={componentY + 94} label="组件ID：" value="python-runtime" clipId={componentClipId} opacity={0.72} />
      <TextLine x={42} y={componentY + 120} label="需要安装：" value="true" clipId={componentClipId} opacity={0.72} />
      <TextLine x={42} y={componentY + 146} label="版本检查：" value="true" clipId={componentClipId} opacity={0.72} />

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

      <g
        transform={`translate(${outputOffset.x} ${connectorY})`}
        className="cursor-pointer"
        onClick={event => {
          event.stopPropagation()
          onAddConnectorClick?.()
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        <AddConnectorButton />
      </g>
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
