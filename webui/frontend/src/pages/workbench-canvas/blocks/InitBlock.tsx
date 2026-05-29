import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockMeta, type WorkbenchBlockResizeHandlers, type WorkbenchPoint, type WorkbenchSize } from '../types'

const inputPortOffset: WorkbenchPoint = { x: 5, y: 115.5 }

function AddConnectorButton() {
  return (
    <g transform="translate(-12 0)">
      <circle cx="12" cy="12" r="12" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <path d="M7,12h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12,7v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </g>
  )
}

function InputPort() {
  return (
    <g transform={`translate(${inputPortOffset.x - 2.5} ${inputPortOffset.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </g>
  )
}

function TextLine({
  y,
  label,
  value,
  clipId,
}: {
  y: number
  label: string
  value: string
  clipId: string
}) {
  return (
    <text x="15" y={y} fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="500" clipPath={`url(#${clipId})`}>
      <tspan>{label}</tspan>
      <tspan fontWeight="300">{value}</tspan>
    </text>
  )
}

function formatTomlString(value: string) {
  return value ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
}

function formatTomlArray(values: string[]) {
  return values.length ? `[${values.map(value => formatTomlString(value)).join(', ')}]` : ''
}

function formatTomlBoolean(value: boolean | null) {
  if (value === null) return ''
  return value ? 'true' : 'false'
}

export default function InitBlock({
  position,
  size,
  selected,
  onSelect,
  meta,
  dragHandlers,
  resizeHandlers,
}: {
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  onSelect?: () => void
  meta: WorkbenchBlockMeta
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyX = 5
  const bodyY = 5
  const bodyWidth = Math.max(301, size.width)
  const bodyHeight = Math.max(221, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerWidth = bodyWidth
  const connectorX = bodyX + bodyWidth
  const connectorY = bodyY + bodyHeight / 2 - 12
  const contentClipId = 'dfw-init-block-content-clip'
  const rows = [
    { label: '模版作者：', value: formatTomlString(meta.author) },
    { label: '模版标签：', value: formatTomlArray(meta.tags) },
    { label: '模版描述：', value: formatTomlString(meta.description) },
    { label: '模版唯一ID：', value: formatTomlString(meta.modId) },
    { label: '模版显示名称：', value: formatTomlString(meta.modName) },
    { label: '模版版本：', value: formatTomlString(meta.version) },
    { label: '最低支持版本：', value: formatTomlString(meta.minVersion) },
    { label: '最高支持版本：', value: formatTomlString(meta.maxVersion) },
    { label: '启用文件导入：', value: formatTomlBoolean(meta.fileImport) },
    ...(meta.fileImport === true ? [{ label: '文件导入列表：', value: formatTomlArray(meta.fileImportList) }] : []),
    { label: '运行时环境：', value: formatTomlString(meta.runtime) },
    { label: '平台限制：', value: formatTomlArray(meta.platforms) },
    { label: '模版格式版本：', value: formatTomlString(meta.schemaVersion) },
  ]

  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="30" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <path d={`M30,0H${headerWidth - 30}a30,30,0,0,1,30,30V53H0V30A30,30,0,0,1,30,0Z`} transform="translate(5 5)" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
      <defs>
        <clipPath id={contentClipId}>
          <rect x="15" y="64" width={bodyWidth - 30} height={bodyHeight - 84} />
        </clipPath>
      </defs>
      <text x="20" y="42" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="500">初始化块</text>
      {rows.map((row, index) => (
        <TextLine
          key={row.label}
          y={89 + index * 24}
          label={row.label}
          value={row.value}
          clipId={contentClipId}
        />
      ))}
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
      <g transform={`translate(${connectorX} ${connectorY})`}>
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
        <path d={`M30,0H${headerWidth - 30}a30,30,0,0,1,30,30V53H0V30A30,30,0,0,1,30,0Z`} transform="translate(5 5)" fill="transparent" />
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
