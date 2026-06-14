import { DeleteBlockButton, LinkPendingOutline } from './BlockFrameControls'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getFileIconByName } from './fileIcons'
import {
  workbenchCanvasFont,
  type WorkbenchBlockDragHandlers,
  type WorkbenchConnectionSource,
  type WorkbenchFileMeta,
  type WorkbenchPoint,
  type WorkbenchSize,
} from '../types'

export const fileBlockMinSize: WorkbenchSize = { width: 100, height: 130 }

const accent = '#f59e0b'
const blockWidth = fileBlockMinSize.width

// 圆圈直径
const circleDiameter = 60
// 圆圈中心 X：稍偏左，给右侧连接点让出位置
const circleCx = 38
// 圆圈中心 Y
const circleCy = 44
// 文件名区域起始 Y
const nameY = 88
// 右侧连接点 X（圆圈右侧外缘）
const portX = circleCx + circleDiameter / 2 + 4
const portY = circleCy

export function resolveFileBlockOutputOffset(_size: WorkbenchSize): WorkbenchPoint {
  return { x: portX, y: portY }
}

const LANGUAGE_LABEL: Record<string, string> = {
  python: 'Python',
  powershell: 'PowerShell',
  shell: 'Shell',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  plaintext: 'Plain Text',
  java: 'Java',
  ini: 'INI / TOML',
  xml: 'XML',
  yaml: 'YAML',
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
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const languageLabel = LANGUAGE_LABEL[file.language] ?? file.language
  const Icon = getFileIconByName(file.name)

  return (
    <g
      transform={`translate(${position.x} ${position.y})`}
      data-workbench-block-id={blockId}
    >
      {selected && (
        <rect
          x="0"
          y="0"
          width={selectWidth}
          height={selectHeight}
          rx="14"
          fill="none"
          stroke="var(--dfw-blue)"
          strokeWidth="2"
        />
      )}
      {linking && <LinkPendingOutline width={selectWidth} height={selectHeight} />}

      {/* 整个区域：圆圈 + 名字 + 连接点都包在拖拽 + 双击事件里 */}
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
        {/* 圆圈背景：accent 边 + 半透明填充 */}
        <circle
          cx={circleCx}
          cy={circleCy}
          r={circleDiameter / 2}
          fill={accent}
          fillOpacity="0.18"
          stroke={accent}
          strokeWidth="2"
        />

        {/* 图标 */}
        <foreignObject
          x={circleCx - 24}
          y={circleCy - 24}
          width="48"
          height="48"
          style={{
            pointerEvents: 'none',
            overflow: 'visible',
            color: 'var(--dfw-text)',
          }}
        >
          <Icon size={48} />
        </foreignObject>

        {/* 右侧连接点：透明 18px 圆（hit area）+ 8px 可见点 */}
        <g
          style={{ pointerEvents: 'auto' }}
          className="cursor-crosshair"
          onPointerDown={event => {
            event.stopPropagation()
            onConnectorDragStart?.('file-output', { x: position.x + portX, y: position.y + portY }, event)
          }}
        >
          <circle cx={portX} cy={portY} r="9" fill="transparent" />
          <circle
            cx={portX}
            cy={portY}
            r="4"
            fill="var(--dfw-bg)"
            stroke={accent}
            strokeWidth="2"
          />
        </g>

        {/* 文件名 */}
        <text
          x={blockWidth / 2}
          y={nameY}
          fontSize="13"
          fontFamily={workbenchCanvasFont}
          fontWeight="500"
          fill="currentColor"
          textAnchor="middle"
        >
          {file.name.length > 14 ? file.name.slice(0, 13) + '…' : file.name}
        </text>
        <text
          x={blockWidth / 2}
          y={nameY + 16}
          fontSize="10"
          fontFamily={workbenchCanvasFont}
          fontWeight="300"
          fill="currentColor"
          opacity="0.55"
          textAnchor="middle"
        >
          {languageLabel} · {(file.size / 1024).toFixed(1)} KB
        </text>
        <text
          x={blockWidth / 2}
          y={nameY + 32}
          fontSize="9"
          fontFamily={workbenchCanvasFont}
          fontWeight="300"
          fill="currentColor"
          opacity="0.4"
          textAnchor="middle"
        >
          双击编辑
        </text>
      </g>

      <DeleteBlockButton x={bodyWidth - 43} y={4} onDelete={onDelete} />
    </g>
  )
}
