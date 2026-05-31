import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchComponentMeta, type WorkbenchConnectorDragHandlers, type WorkbenchEnvVariableEntry, type WorkbenchPoint, type WorkbenchSize, type WorkbenchVersionFormattingRule } from '../types'

export const componentBlockMinSize: WorkbenchSize = { width: 520, height: 430 }
export const componentBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#22b386'

export function resolveComponentBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(componentBlockMinSize.width, size.width),
    y: bodyY + Math.max(componentBlockMinSize.height, size.height) / 2,
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

function InputPort({ dragHandlers }: { dragHandlers?: WorkbenchConnectorDragHandlers }) {
  return (
    <g
      transform={`translate(${componentBlockInputOffset.x - 2.5} ${componentBlockInputOffset.y - 2.5})`}
      className={dragHandlers ? 'cursor-crosshair' : undefined}
      onPointerDown={dragHandlers?.onConnectorPointerDown}
      onPointerMove={dragHandlers?.onConnectorPointerMove}
      onPointerUp={dragHandlers?.onConnectorPointerUp}
      onPointerCancel={dragHandlers?.onConnectorPointerCancel}
    >
      <circle cx="2.5" cy="2.5" r="2.5" fill={accent} stroke={accent} strokeWidth="2" />
      <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke={accent} strokeWidth="2" />
      {dragHandlers ? <circle cx="2.5" cy="2.5" r="18" fill="transparent" /> : null}
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

function hasDenoCustomSource(values: string[]) {
  return values.some(value => value.toLowerCase().includes('.ts'))
}

function hasJvmCustomSource(values: string[]) {
  return values.some(value => {
    const normalized = value.toLowerCase()
    return normalized.includes('.java') || normalized.includes('.jar')
  })
}

function formatTomlVersionFormattingRule(value: WorkbenchVersionFormattingRule) {
  return `{match = ${formatTomlString(value.match)}, replace = ${formatTomlString(value.replace)}}`
}

function formatTomlEnvVariableEntry(value: WorkbenchEnvVariableEntry) {
  return `{name = ${formatTomlString(value.name)}, value = ${formatTomlString(value.value)}}`
}

function formatTomlInlineTableArray<T>(values: T[], formatter: (value: T) => string) {
  return values.length ? `[${values.map(formatter).join(', ')}]` : ''
}

function formatTomlBoolean(value: boolean | null) {
  if (value === null) return ''
  return value ? 'true' : 'false'
}

export default function ComponentBlock({
  blockIndex,
  position,
  size,
  selected,
  onSelect,
  onAddConnectorClick,
  component,
  dragHandlers,
  resizeHandlers,
  inputDragHandlers,
}: {
  blockIndex: number
  position: WorkbenchPoint
  size: WorkbenchSize
  selected: boolean
  onSelect?: () => void
  onAddConnectorClick?: () => void
  component: WorkbenchComponentMeta
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
  inputDragHandlers?: WorkbenchConnectorDragHandlers
}) {
  const bodyWidth = Math.max(componentBlockMinSize.width, size.width)
  const bodyHeight = Math.max(componentBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const contentClipId = `dfw-component-block-content-clip-${blockIndex}`
  const outputOffset = resolveComponentBlockOutputOffset({ width: bodyWidth, height: bodyHeight })
  const connectorY = outputOffset.y - 12
  const versionFile = component.versionFile ?? []
  const versionCustom = component.versionCustom ?? []
  const getLinkProvideList = component.getLinkProvideList ?? []
  const linkFile = component.linkFile ?? []
  const linkCustom = component.linkCustom ?? []
  const denoPermissions = component.denoPermissions ?? []
  const jvm = component.jvm ?? []
  const rows = [
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
        ...(component.getVersion === 'github_repo' ? [{ label: 'GitHub仓库：', value: formatTomlString(component.githubRepo) }] : []),
        ...(component.getVersion === 'filelink' ? [{ label: '版本文件来源：', value: formatTomlArray(versionFile) }] : []),
        ...(component.getVersion === 'custom'
          ? [
            { label: '版本脚本来源：', value: formatTomlArray(versionCustom) },
            ...(hasDenoCustomSource(versionCustom) ? [{ label: 'Deno权限参数：', value: formatTomlArray(denoPermissions) }] : []),
            ...(hasJvmCustomSource(versionCustom) ? [{ label: 'JVM参数：', value: formatTomlArray(jvm) }] : []),
          ]
          : []),
        { label: '版本拼接链接：', value: formatTomlString(component.splicingLink) },
        { label: '格式化版本：', value: formatTomlBoolean(component.formatVersion) },
        ...(component.formatVersion === true ? [{ label: '格式化规则：', value: formatTomlInlineTableArray(component.versionFormattingFormula, formatTomlVersionFormattingRule) }] : []),
      ]
      : []),
    ...(component.getMethod === 'get_link'
      ? [
        { label: '链接获取方式：', value: formatTomlString(component.getLink) },
        ...(component.getLink === 'filelink' || component.getLink === 'custom'
          ? [{ label: '可选链接：', value: formatTomlArray(getLinkProvideList) }]
          : []),
        ...(component.getLink === 'filelink' && getLinkProvideList.length === 0
          ? [{ label: '链接文件来源：', value: formatTomlArray(linkFile) }]
          : []),
        ...(component.getLink === 'custom' && getLinkProvideList.length === 0
          ? [
            { label: '链接脚本来源：', value: formatTomlArray(linkCustom) },
            ...(hasDenoCustomSource(linkCustom) ? [{ label: 'Deno权限参数：', value: formatTomlArray(denoPermissions) }] : []),
            ...(hasJvmCustomSource(linkCustom) ? [{ label: 'JVM参数：', value: formatTomlArray(jvm) }] : []),
          ]
          : []),
      ]
      : []),
    { label: '用户可选版本：', value: formatTomlBoolean(component.userChoose) },
    ...(component.userChoose === true ? [{ label: '版本选择列表：', value: formatTomlArray(component.chooseList) }] : []),
    ...(component.install === true
      ? [
        { label: '命令行安装：', value: formatTomlBoolean(component.commandInstall) },
        ...(component.commandInstall === true ? [{ label: '安装命令：', value: formatTomlArray(component.installCommandList) }] : []),
        ...(component.commandInstall !== true
          ? [
            { label: '安装操作：', value: formatTomlString(component.installOperate) },
            ...(component.installOperate === 'custom' ? [{ label: '自定义安装规则：', value: formatTomlArray(component.installCustomList) }] : []),
          ]
          : []),
        { label: '安装路径：', value: formatTomlString(component.installPath) },
        ...(component.installPath === '$CustomPath' ? [{ label: '自定义路径：', value: formatTomlString(component.customPath) }] : []),
      ]
      : []),
    { label: '安装前操作：', value: formatTomlBoolean(component.beforeCommand) },
    ...(component.beforeCommand === true ? [{ label: '安装前命令：', value: formatTomlArray(component.beforeCommandList) }] : []),
    { label: '安装后操作：', value: formatTomlBoolean(component.afterCommand) },
    ...(component.afterCommand === true ? [{ label: '安装后命令：', value: formatTomlArray(component.afterCommandList) }] : []),
    { label: '环境变量导出：', value: formatTomlBoolean(component.envOutput) },
    ...(component.envOutput === true ? [{ label: '导出变量：', value: formatTomlInlineTableArray(component.envOutputList, formatTomlEnvVariableEntry) }] : []),
    { label: '环境变量导入：', value: formatTomlBoolean(component.envInput) },
    ...(component.envInput === true ? [{ label: '导入变量：', value: formatTomlInlineTableArray(component.envInputList, formatTomlEnvVariableEntry) }] : []),
  ]

  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      {selected && (
        <rect x="0" y="0" width={selectWidth} height={selectHeight} rx="36" fill="none" stroke="var(--dfw-blue)" strokeWidth="2" />
      )}

      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} rx="30" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" opacity="0.92" />
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={headerHeight} rx="30" fill={accent} opacity="0.16" stroke={accent} strokeWidth="2" />
      <rect x={bodyX} y={bodyY + 30} width={bodyWidth} height={headerHeight - 30} fill={accent} opacity="0.16" />

      <defs>
        <clipPath id={contentClipId}>
          <rect x="18" y="76" width={bodyWidth - 36} height={bodyHeight - 96} />
        </clipPath>
      </defs>

      <text x="22" y="44" fontSize="25" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor" opacity="0.82">
        [[Component]] {blockIndex}
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
      <InputPort dragHandlers={inputDragHandlers} />

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
