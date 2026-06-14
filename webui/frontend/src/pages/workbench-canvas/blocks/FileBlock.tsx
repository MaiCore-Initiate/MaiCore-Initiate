import { DeleteBlockButton, LinkPendingOutline } from './BlockFrameControls'
import {
  workbenchCanvasFont,
  type WorkbenchBlockDragHandlers,
  type WorkbenchFileMeta,
  type WorkbenchPoint,
  type WorkbenchSize,
} from '../types'

export const fileBlockMinSize: WorkbenchSize = { width: 200, height: 120 }

const bodyX = 5
const bodyY = 5
const accent = '#f59e0b'

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.') + 1)
  return (
    <text
      x="14"
      y="27"
      fontSize="14"
      fontFamily={workbenchCanvasFont}
      fontWeight="600"
      fill={accent}
    >
      {ext.toUpperCase().slice(0, 4)}
    </text>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
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
  file: WorkbenchFileMeta
  dragHandlers?: WorkbenchBlockDragHandlers
}) {
  const bodyWidth = Math.max(fileBlockMinSize.width, size.width)
  const bodyHeight = Math.max(fileBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 38
  const contentClipId = `dfw-file-block-content-clip-${file.id}`
  const languageLabel = LANGUAGE_LABEL[file.language] ?? file.language
  return (
    <g transform={`translate(${position.x} ${position.y})`} data-workbench-block-id={blockId}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="20" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}
      {linking && <LinkPendingOutline width={selectWidth} height={selectHeight} />}

      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx="20"
        fill="var(--dfw-bg)"
        stroke={accent}
        strokeWidth="2"
        opacity="0.95"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={headerHeight}
        rx="20"
        fill={accent}
        opacity="0.18"
        stroke={accent}
        strokeWidth="2"
      />
      <rect
        x={bodyX}
        y={bodyY + 20}
        width={bodyWidth}
        height={headerHeight - 20}
        fill={accent}
        opacity="0.18"
      />

      <defs>
        <clipPath id={contentClipId}>
          <rect x="10" y="48" width={bodyWidth - 20} height={bodyHeight - 56} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${contentClipId})`}>
        <FileTypeIcon name={file.name} />
        <text
          x={bodyWidth - 16}
          y="27"
          fontSize="12"
          fontFamily={workbenchCanvasFont}
          fontWeight="500"
          fill="currentColor"
          opacity="0.7"
          textAnchor="end"
        >
          {formatSize(file.size)}
        </text>
        <text
          x="14"
          y="68"
          fontSize="14"
          fontFamily={workbenchCanvasFont}
          fontWeight="500"
          fill="currentColor"
          opacity="0.86"
        >
          {file.name}
        </text>
        <text
          x="14"
          y="92"
          fontSize="11"
          fontFamily={workbenchCanvasFont}
          fontWeight="400"
          fill="currentColor"
          opacity="0.55"
        >
          {languageLabel}
        </text>
        <text
          x="14"
          y={bodyHeight - 12}
          fontSize="10"
          fontFamily={workbenchCanvasFont}
          fontWeight="400"
          fill="currentColor"
          opacity="0.4"
        >
          双击编辑
        </text>
      </g>

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
        <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="20" fill="transparent" />
      </g>

      <DeleteBlockButton x={bodyX + bodyWidth - 43} y={bodyY + 8} onDelete={onDelete} />
    </g>
  )
}
