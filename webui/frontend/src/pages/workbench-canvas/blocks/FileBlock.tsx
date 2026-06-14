import type { PointerEvent as ReactPointerEvent } from 'react'
import { DeleteBlockButton } from './BlockFrameControls'
import { getFileIconByName } from './fileIcons'
import {
  workbenchCanvasFont,
  type WorkbenchBlockDragHandlers,
  type WorkbenchConnectionSource,
  type WorkbenchFileMeta,
  type WorkbenchPoint,
  type WorkbenchSize,
} from '../types'

export const fileBlockMinSize: WorkbenchSize = { width: 215, height: 208 }

const iconAreaCenterX = 102
const iconAreaCenterY = 84
const iconSize = 152
const selectionRadius = 101
const connectorRadius = 12
const connectorCenterY = 95
const connectorInset = 13.5
const textBaselineY = 182

export function resolveFileBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  const width = Math.max(fileBlockMinSize.width, size.width)
  return {
    x: width - connectorInset,
    y: connectorCenterY,
  }
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
  return `${(size / (1024 * 1024)).toFixed(1)}MB`
}

function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

export default function FileBlock({
  blockId,
  position,
  size,
  selected,
  linking = false,
  onSelect,
  onBodyDoubleClick,
  onDelete,
  onConnectorDragStart,
  file,
  dragHandlers,
}: {
  blockId: string
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  linking?: boolean
  onSelect?: () => void
  onBodyDoubleClick?: (event: React.MouseEvent<SVGGElement>) => void
  onDelete?: () => void
  onConnectorDragStart?: (source: WorkbenchConnectionSource, fromPoint: WorkbenchPoint, event: ReactPointerEvent<SVGGElement>) => void
  file: WorkbenchFileMeta
  dragHandlers?: WorkbenchBlockDragHandlers
}) {
  const bodyWidth = Math.max(fileBlockMinSize.width, size.width)
  const bodyHeight = Math.max(fileBlockMinSize.height, size.height)
  const connectorCenterX = bodyWidth - connectorInset
  const label = truncateLabel(`${file.name}|${formatFileSize(file.size)}`, 20)
  const Icon = getFileIconByName(file.name)

  return (
    <g
      transform={`translate(${position.x} ${position.y})`}
      data-workbench-block-id={blockId}
    >
      {(selected || linking) && (
        <circle
          cx={Math.min(iconAreaCenterX, bodyWidth - 58)}
          cy={iconAreaCenterY}
          r={selectionRadius}
          fill="none"
          stroke={selected ? 'var(--dfw-blue)' : '#8fdca4'}
          strokeWidth={selected ? '2' : '3'}
          opacity={selected ? 1 : 0.9}
        >
          {linking && <animate attributeName="opacity" values="0.35;1;0.35" dur="1.2s" repeatCount="indefinite" />}
        </circle>
      )}

      <g
        className="cursor-grab active:cursor-grabbing"
        onClick={event => {
          event.stopPropagation()
          onSelect?.()
        }}
        onDoubleClick={event => {
          event.stopPropagation()
          onBodyDoubleClick?.(event)
        }}
        onPointerDown={dragHandlers?.onHeaderPointerDown}
        onPointerMove={dragHandlers?.onHeaderPointerMove}
        onPointerUp={dragHandlers?.onHeaderPointerUp}
        onPointerCancel={dragHandlers?.onHeaderPointerCancel}
      >
        <rect
          x="0"
          y="0"
          width={bodyWidth}
          height={bodyHeight}
          fill="transparent"
        />

        <foreignObject
          x={Math.min(iconAreaCenterX, bodyWidth - 58) - iconSize / 2}
          y={iconAreaCenterY - iconSize / 2}
          width={iconSize}
          height={iconSize}
          style={{
            pointerEvents: 'none',
            overflow: 'visible',
            color: 'var(--dfw-text)',
          }}
        >
          <Icon size={iconSize} />
        </foreignObject>

        <text
          x={bodyWidth / 2}
          y={textBaselineY}
          fontSize="20"
          fontFamily={workbenchCanvasFont}
          fontWeight="400"
          fill="currentColor"
          textAnchor="middle"
          lengthAdjust="spacingAndGlyphs"
          textLength={Math.min(bodyWidth - 48, Math.max(120, label.length * 11))}
        >
          {label}
        </text>
      </g>

      <g
        transform={`translate(${connectorCenterX} ${connectorCenterY})`}
        className="cursor-pointer"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => {
          event.stopPropagation()
          onConnectorDragStart?.('file-output', { x: position.x + connectorCenterX, y: position.y + connectorCenterY }, event)
        }}
      >
        <circle cx="0" cy="0" r="18" fill="transparent" />
        <circle cx="0" cy="0" r={connectorRadius} fill="#fff" stroke="#000" strokeWidth="2" />
        <path d="M-5 0H5" fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" />
        <path d="M0 -5V5" fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" />
      </g>

      {selected ? <DeleteBlockButton x={bodyWidth - 36} y={4} onDelete={onDelete} /> : null}
    </g>
  )
}
