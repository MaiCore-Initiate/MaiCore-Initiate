import { DeleteBlockButton, LinkPendingOutline } from './BlockFrameControls'
import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchConnectionSource, type WorkbenchPoint, type WorkbenchSize } from '../types'

export const deployBlockMinSize: WorkbenchSize = { width: 456, height: 240 }
export const deployBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#d97706'

export function resolveDeployBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(deployBlockMinSize.width, size.width) / 2,
    y: bodyY + Math.max(deployBlockMinSize.height, size.height),
  }
}

export function resolveDeployBlockConfigOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(deployBlockMinSize.width, size.width),
    y: bodyY + Math.max(deployBlockMinSize.height, size.height) / 2,
  }
}

function AddConnectorButton({ label }: { label?: string }) {
  return (
    <g transform="translate(-12 0)">
      <circle cx="12" cy="12" r="12" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <path d="M7,12h10" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12,7v10" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      {label ? <title>{label}</title> : null}
    </g>
  )
}

function InputPort() {
  return (
    <g transform={`translate(${deployBlockInputOffset.x - 2.5} ${deployBlockInputOffset.y - 2.5})`}>
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
}: {
  x?: number
  y: number
  label: string
  value: string
  clipId: string
}) {
  return (
    <text x={x} y={y} fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="500" opacity="0.78" clipPath={`url(#${clipId})`}>
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

export default function DeployBlock({
  position,
  size,
  selected,
  linking = false,
  onSelect,
  onDeploymentConnectorClick,
  onConfigConnectorClick,
  onConnectorDragStart,
  onDelete,
  deployEnvOutput,
  deployEnvInput,
  deployList,
  dragHandlers,
  resizeHandlers,
}: {
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  linking?: boolean
  onSelect?: () => void
  onDeploymentConnectorClick?: () => void
  onConfigConnectorClick?: () => void
  onConnectorDragStart?: (source: WorkbenchConnectionSource, fromPoint: WorkbenchPoint, event: React.PointerEvent<SVGGElement>) => void
  onDelete?: () => void
  deployEnvOutput: boolean
  deployEnvInput: boolean
  deployList: string[]
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyWidth = Math.max(deployBlockMinSize.width, size.width)
  const bodyHeight = Math.max(deployBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const delimiterHeight = 34
  const delimiterWidth = Math.max(140, bodyWidth - 70)
  const delimiterX = bodyX + (bodyWidth - delimiterWidth) / 2
  const delimiterY = bodyY + bodyHeight - 57
  const contentClipId = 'dfw-deploy-block-content-clip'
  const deploymentOutputOffset = resolveDeployBlockOutputOffset({ width: bodyWidth, height: bodyHeight })
  const deploymentConnectorX = deploymentOutputOffset.x
  const deploymentConnectorY = deploymentOutputOffset.y - 12
  const configOutputOffset = resolveDeployBlockConfigOutputOffset({ width: bodyWidth, height: bodyHeight })
  const configConnectorX = configOutputOffset.x
  const configConnectorY = configOutputOffset.y - 12
  const rows = [
    { label: '环境变量导出：', value: formatTomlBoolean(deployEnvOutput) },
    { label: '环境变量导入：', value: formatTomlBoolean(deployEnvInput) },
    { label: '部署ID列表：', value: formatTomlArray(deployList) },
  ]

  return (
    <g transform={`translate(${position.x} ${position.y})`} data-workbench-block-id="deploy">
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}
      {linking && <LinkPendingOutline width={selectWidth} height={selectHeight} />}

      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="30" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={headerHeight} rx="30" fill={accent} opacity="0.2" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY + 30} width={bodyWidth} height={headerHeight - 30} fill={accent} opacity="0.2" />

      <defs>
        <clipPath id={contentClipId}>
          <rect x="18" y="76" width={bodyWidth - 36} height={Math.max(20, delimiterY - 86)} />
        </clipPath>
      </defs>

      <text x="22" y="44" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        [DEPLOY]
      </text>
      {rows.map((row, index) => (
        <TextLine
          key={row.label}
          y={94 + index * 26}
          label={row.label}
          value={row.value}
          clipId={contentClipId}
        />
      ))}

      <rect
        x={delimiterX}
        y={delimiterY}
        width={delimiterWidth}
        height={delimiterHeight}
        rx="10"
        fill="var(--dfw-bg)"
        stroke={accent}
        strokeWidth="1.5"
        opacity="0.9"
      />
      <text
        x={bodyX + bodyWidth / 2}
        y={delimiterY + 23}
        textAnchor="middle"
        fontSize="18"
        fontFamily={workbenchCanvasFont}
        fontWeight="500"
        fill="currentColor"
        opacity="0.86"
      >
        部署界定器
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
        transform={`translate(${deploymentConnectorX} ${deploymentConnectorY})`}
        className="cursor-crosshair"
        onClick={event => {
          event.stopPropagation()
          onDeploymentConnectorClick?.()
        }}
        onPointerDown={event => {
          event.stopPropagation()
          onConnectorDragStart?.('deploy-deployment', { x: position.x + deploymentConnectorX, y: position.y + deploymentConnectorY }, event)
        }}
      >
        <AddConnectorButton label="连接部署界定器" />
        <circle cx="0" cy="12" r="18" fill="transparent" />
      </g>
      <g
        transform={`translate(${configConnectorX} ${configConnectorY})`}
        className="cursor-crosshair"
        onClick={event => {
          event.stopPropagation()
          onConfigConnectorClick?.()
        }}
        onPointerDown={event => {
          event.stopPropagation()
          onConnectorDragStart?.('deploy-config', { x: position.x + configConnectorX, y: position.y + configConnectorY }, event)
        }}
      >
        <AddConnectorButton label="连接配置管理闸" />
        <circle cx="0" cy="12" r="18" fill="transparent" />
      </g>
      <DeleteBlockButton x={bodyX + bodyWidth - 43} y={bodyY + 15} onDelete={onDelete} />
    </g>
  )
}
