import { DeleteBlockButton, LinkPendingOutline } from './BlockFrameControls'
import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchConnectionSource, type WorkbenchEnvVariableEntry, type WorkbenchPoint, type WorkbenchSize, type WorkbenchUninstallItemMeta } from '../types'

export const uninstallItemBlockMinSize: WorkbenchSize = { width: 520, height: 430 }
export const uninstallItemBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#dc2626'

export function resolveUninstallItemBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(uninstallItemBlockMinSize.width, size.width),
    y: bodyY + Math.max(uninstallItemBlockMinSize.height, size.height) / 2,
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
    <g transform={`translate(${uninstallItemBlockInputOffset.x - 2.5} ${uninstallItemBlockInputOffset.y - 2.5})`}>
      <circle cx="2.5" cy="2.5" r="2.5" fill={accent} stroke={accent} strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke={accent} strokeWidth="2" />
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
    <text x="22" y={y} fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="500" opacity="0.78" clipPath={`url(#${clipId})`}>
      <tspan>{label}</tspan>
      <tspan fontWeight="300">{value}</tspan>
    </text>
  )
}

function formatTomlString(value: string) {
  return value ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
}

function formatTomlArray(values: string[]) {
  return values.length ? `[${values.map(formatTomlString).join(', ')}]` : ''
}

function formatTomlBoolean(value: boolean) {
  return value ? 'true' : 'false'
}

function formatTomlEnvVariableEntry(value: WorkbenchEnvVariableEntry) {
  return `{name = ${formatTomlString(value.name)}, value = ${formatTomlString(value.value)}}`
}

function formatTomlInlineTableArray<T>(values: T[], formatter: (value: T) => string) {
  return values.length ? `[${values.map(formatter).join(', ')}]` : ''
}

export default function UninstallItemBlock({
  blockIndex,
  position,
  size,
  selected,
  linking = false,
  onSelect,
  onAddConnectorClick,
  onConnectorDragStart,
  onDelete,
  uninstallItem,
  dragHandlers,
  resizeHandlers,
}: {
  blockIndex: number
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  linking?: boolean
  onSelect?: () => void
  onAddConnectorClick?: () => void
  onConnectorDragStart?: (source: WorkbenchConnectionSource, fromPoint: WorkbenchPoint, event: React.PointerEvent<SVGGElement>) => void
  onDelete?: () => void
  uninstallItem: WorkbenchUninstallItemMeta
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyWidth = Math.max(uninstallItemBlockMinSize.width, size.width)
  const bodyHeight = Math.max(uninstallItemBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const contentClipId = `dfw-uninstall-item-block-content-clip-${blockIndex}`
  const outputOffset = resolveUninstallItemBlockOutputOffset({ width: bodyWidth, height: bodyHeight })
  const connectorY = outputOffset.y - 12
  const envInputList = uninstallItem.envInputList ?? []
  const envOutputList = uninstallItem.envOutputList ?? []
  const rows = [
    { label: '卸载ID：', value: formatTomlString(uninstallItem.id) },
    { label: '卸载名称：', value: formatTomlString(uninstallItem.name) },
    { label: '用户可选卸载：', value: formatTomlBoolean(uninstallItem.choose) },
    { label: '运行时：', value: formatTomlString(uninstallItem.runtime) },
    { label: '命令主题：', value: formatTomlString(uninstallItem.commandTheme) },
    { label: '需要卸载：', value: formatTomlBoolean(uninstallItem.uninstall) },
    { label: '卸载前停止：', value: formatTomlBoolean(uninstallItem.stopBeforeUninstall) },
    ...(uninstallItem.stopBeforeUninstall === true
      ? [{ label: '停止命令：', value: formatTomlArray(uninstallItem.stopCommandList ?? []) }]
      : []),
    { label: '删除实例配置：', value: formatTomlBoolean(uninstallItem.removeInstanceConfig) },
    { label: '删除运行时状态：', value: formatTomlBoolean(uninstallItem.removeRuntimeFiles) },
    { label: '删除部署目录：', value: formatTomlBoolean(uninstallItem.removeDeployRoot) },
    { label: '删除组件目录：', value: formatTomlBoolean(uninstallItem.removeComponent) },
    ...(uninstallItem.removeDeployRoot === true
      ? [{ label: '部署目标：', value: formatTomlArray(uninstallItem.deploymentTargets ?? []) }]
      : []),
    ...(uninstallItem.removeComponent === true
      ? [{ label: '组件目标：', value: formatTomlArray(uninstallItem.componentTargets ?? []) }]
      : []),
    { label: '卸载前操作：', value: formatTomlBoolean(uninstallItem.beforeCommand) },
    ...(uninstallItem.beforeCommand === true
      ? [{ label: '卸载前命令：', value: formatTomlArray(uninstallItem.beforeCommandList ?? []) }]
      : []),
    { label: '卸载后操作：', value: formatTomlBoolean(uninstallItem.afterCommand) },
    ...(uninstallItem.afterCommand === true
      ? [{ label: '卸载后命令：', value: formatTomlArray(uninstallItem.afterCommandList ?? []) }]
      : []),
    { label: '环境变量导入：', value: formatTomlBoolean(uninstallItem.envInput) },
    ...(uninstallItem.envInput === true
      ? [{ label: '导入变量：', value: formatTomlInlineTableArray(envInputList, formatTomlEnvVariableEntry) }]
      : []),
    { label: '环境变量导出：', value: formatTomlBoolean(uninstallItem.envOutput) },
    ...(uninstallItem.envOutput === true
      ? [{ label: '导出变量：', value: formatTomlInlineTableArray(envOutputList, formatTomlEnvVariableEntry) }]
      : []),
  ]

  return (
    <g transform={`translate(${position.x} ${position.y})`} data-workbench-block-id={`uninstall-item:${blockIndex}`}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}
      {linking && <LinkPendingOutline width={selectWidth} height={selectHeight} />}

      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="30" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" opacity="0.92" />
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={headerHeight} rx="30" fill={accent} opacity="0.16" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY + 30} width={bodyWidth} height={headerHeight - 30} fill={accent} opacity="0.16" />

      <defs>
        <clipPath id={contentClipId}>
          <rect x="18" y="76" width={bodyWidth - 36} height={bodyHeight - 96} />
        </clipPath>
      </defs>

      <text x="22" y="44" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor" opacity="0.82">
        [[UninstallItem]] {blockIndex}
      </text>
      {rows.map((row, index) => (
        <TextLine
          key={`${row.label}-${index}`}
          y={94 + index * 26}
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

      <InputPort />

      <g
        className="cursor-grab active:cursor-grabbing"
        onClick={event => {
          event.stopPropagation()
          onSelect?.()
        }}
        onDoubleClick={dragHandlers?.onHeaderDoubleClick}
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
      <g
        transform={`translate(${outputOffset.x} ${connectorY})`}
        className="cursor-pointer"
        onClick={event => {
          event.stopPropagation()
          onAddConnectorClick?.()
        }}
        onPointerDown={event => {
          event.stopPropagation()
          onConnectorDragStart?.('uninstall-item-output', { x: position.x + outputOffset.x, y: position.y + connectorY }, event)
        }}
      >
        <AddConnectorButton />
      </g>
      <DeleteBlockButton x={bodyX + bodyWidth - 43} y={bodyY + 15} onDelete={onDelete} />
    </g>
  )
}
