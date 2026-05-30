import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchComponentMeta, type WorkbenchPoint, type WorkbenchSize } from '../types'

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

function formatTomlString(value: string) {
  return value ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
}

function formatTomlArray(values: string[]) {
  return values.length ? `[${values.map(formatTomlString).join(', ')}]` : ''
}

function formatTomlBoolean(value: boolean | null) {
  if (value === null) return ''
  return value ? 'true' : 'false'
}

export default function ComponentsBlock({
  position,
  size,
  selected,
  onSelect,
  onAddConnectorClick,
  componentsEnvOutput,
  componentsEnvInput,
  componentsList,
  component,
  dragHandlers,
  resizeHandlers,
}: {
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  onSelect?: () => void
  onAddConnectorClick?: () => void
  componentsEnvOutput: boolean | null
  componentsEnvInput: boolean | null
  componentsList: string[]
  component: WorkbenchComponentMeta
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
  const sectionRows = [
    { label: '环境变量导出：', value: formatTomlBoolean(componentsEnvOutput) },
    { label: '环境变量导入：', value: formatTomlBoolean(componentsEnvInput) },
    { label: '组件ID列表：', value: formatTomlArray(componentsList) },
  ]
  const componentRows = [
    { label: '组件名称：', value: formatTomlString(component.name) },
    { label: '组件ID：', value: formatTomlString(component.id) },
    ...(component.install === true ? [{ label: '用户可选安装：', value: formatTomlBoolean(component.choose) }] : []),
    { label: '运行时：', value: formatTomlString(component.runtime) },
    { label: '命令主题：', value: formatTomlString(component.commandTheme) },
    { label: '需要安装：', value: formatTomlBoolean(component.install) },
    { label: '检查已安装：', value: formatTomlBoolean(component.check) },
    ...(component.check === true
      ? [
        { label: '检查命令：', value: formatTomlArray(component.checkCommand) },
        { label: '版本关键字：', value: formatTomlArray(component.checkVersionContains) },
        { label: '版本正则：', value: formatTomlArray(component.checkVersionRegex) },
      ]
      : []),
    { label: '获取方法：', value: formatTomlString(component.getMethod) },
    ...(component.getMethod === 'direct' ? [{ label: '直接下载链接：', value: formatTomlString(component.directLink) }] : []),
    ...(component.getMethod === 'get_version'
      ? [
        { label: '版本获取方式：', value: formatTomlString(component.getVersion) },
        { label: 'GitHub仓库：', value: formatTomlString(component.githubRepo) },
        { label: '版本拼接链接：', value: formatTomlString(component.splicingLink) },
        { label: '格式化版本：', value: formatTomlBoolean(component.formatVersion) },
      ]
      : []),
    ...(component.getMethod === 'get_link'
      ? [
        { label: '链接获取方式：', value: formatTomlString(component.getLink) },
        { label: '可选链接：', value: formatTomlArray(component.getLinkProvideList) },
      ]
      : []),
    { label: '用户可选版本：', value: formatTomlBoolean(component.userChoose) },
    ...(component.userChoose === true ? [{ label: '版本选择列表：', value: formatTomlArray(component.chooseList) }] : []),
    ...(component.install === true
      ? [
        { label: '命令行安装：', value: formatTomlBoolean(component.commandInstall) },
        { label: '安装操作：', value: formatTomlString(component.installOperate) },
        { label: '安装路径：', value: formatTomlString(component.installPath) },
      ]
      : []),
    { label: '安装前操作：', value: formatTomlBoolean(component.beforeCommand) },
    ...(component.beforeCommand === true ? [{ label: '安装前命令：', value: formatTomlArray(component.beforeCommandList) }] : []),
    { label: '安装后操作：', value: formatTomlBoolean(component.afterCommand) },
    ...(component.afterCommand === true ? [{ label: '安装后命令：', value: formatTomlArray(component.afterCommandList) }] : []),
    { label: '环境变量导出：', value: formatTomlBoolean(component.envOutput) },
    ...(component.envOutput === true ? [{ label: '导出变量：', value: formatTomlArray(component.envOutputList) }] : []),
    { label: '环境变量导入：', value: formatTomlBoolean(component.envInput) },
    ...(component.envInput === true ? [{ label: '导入变量：', value: formatTomlArray(component.envInputList) }] : []),
  ]

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
      {sectionRows.map((row, index) => (
        <TextLine
          key={row.label}
          y={94 + index * 26}
          label={row.label}
          value={row.value}
          clipId={sectionClipId}
        />
      ))}

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
      {componentRows.map((row, index) => (
        <TextLine
          key={`${row.label}-${index}`}
          x={42}
          y={componentY + 68 + index * 26}
          label={row.label}
          value={row.value}
          clipId={componentClipId}
          opacity={0.72}
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
