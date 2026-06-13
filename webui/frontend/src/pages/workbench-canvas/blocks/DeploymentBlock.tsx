import { DeleteBlockButton, LinkPendingOutline } from './BlockFrameControls'
import { workbenchCanvasFont, type WorkbenchBlockDragHandlers, type WorkbenchBlockResizeHandlers, type WorkbenchConnectionSource, type WorkbenchDeploymentMeta, type WorkbenchEnvVariableEntry, type WorkbenchPoint, type WorkbenchSize, type WorkbenchVersionFormattingRule } from '../types'

export const deploymentBlockMinSize: WorkbenchSize = { width: 540, height: 430 }
export const deploymentBlockInputOffset: WorkbenchPoint = { x: 5, y: 92 }

const bodyX = 5
const bodyY = 5
const accent = '#d97706'

export function resolveDeploymentBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: bodyX + Math.max(deploymentBlockMinSize.width, size.width),
    y: bodyY + Math.max(deploymentBlockMinSize.height, size.height) / 2,
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
    <g transform={`translate(${deploymentBlockInputOffset.x - 2.5} ${deploymentBlockInputOffset.y - 2.5})`}>
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

export default function DeploymentBlock({
  blockIndex,
  position,
  size,
  selected,
  linking = false,
  onSelect,
  onAddConnectorClick,
  onConnectorDragStart,
  onDelete,
  deployment,
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
  deployment: WorkbenchDeploymentMeta
  dragHandlers?: WorkbenchBlockDragHandlers
  resizeHandlers?: WorkbenchBlockResizeHandlers
}) {
  const bodyWidth = Math.max(deploymentBlockMinSize.width, size.width)
  const bodyHeight = Math.max(deploymentBlockMinSize.height, size.height)
  const selectWidth = bodyWidth + 10
  const selectHeight = bodyHeight + 10
  const headerHeight = 58
  const contentClipId = `dfw-deployment-block-content-clip-${blockIndex}`
  const outputOffset = resolveDeploymentBlockOutputOffset({ width: bodyWidth, height: bodyHeight })
  const connectorY = outputOffset.y - 12
  const versionFile = deployment.versionFile ?? []
  const versionCustom = deployment.versionCustom ?? []
  const getLinkProvideList = deployment.getLinkProvideList ?? []
  const linkFile = deployment.linkFile ?? []
  const linkCustom = deployment.linkCustom ?? []
  const denoPermissions = deployment.denoPermissions ?? []
  const jvm = deployment.jvm ?? []
  const rows = [
    { label: '部署名称：', value: formatTomlString(deployment.name) },
    { label: '部署ID：', value: formatTomlString(deployment.id) },
    { label: '用户可选部署：', value: formatTomlBoolean(deployment.choose) },
    { label: '运行时：', value: formatTomlString(deployment.runtime) },
    { label: '命令主题：', value: formatTomlString(deployment.commandTheme) },
    { label: '需要部署：', value: formatTomlBoolean(deployment.deploy) },
    ...(deployment.deploy === true
      ? [
        { label: '命令行部署：', value: formatTomlBoolean(deployment.commandDeploy) },
        ...(deployment.commandDeploy === true ? [{ label: '部署命令：', value: formatTomlArray(deployment.deployCommandList) }] : []),
        ...(deployment.commandDeploy !== true
          ? [
            { label: '部署方式：', value: formatTomlString(deployment.deployMethod) },
            { label: '基础链接：', value: formatTomlString(deployment.baseLink) },
            { label: '获取方法：', value: formatTomlString(deployment.getMethod) },
            ...(deployment.getMethod === 'get_version'
              ? [
                { label: '版本获取：', value: formatTomlString(deployment.getVersion) },
                ...(deployment.getVersion === 'github_repo' ? [{ label: 'GitHub仓库：', value: formatTomlString(deployment.githubRepo) }] : []),
                ...(deployment.getVersion === 'filelink' ? [{ label: '版本文件来源：', value: formatTomlArray(versionFile) }] : []),
                ...(deployment.getVersion === 'custom'
                  ? [
                    { label: '版本脚本来源：', value: formatTomlArray(versionCustom) },
                    ...(hasDenoCustomSource(versionCustom) ? [{ label: 'Deno权限参数：', value: formatTomlArray(denoPermissions) }] : []),
                    ...(hasJvmCustomSource(versionCustom) ? [{ label: 'JVM参数：', value: formatTomlArray(jvm) }] : []),
                  ]
                  : []),
                { label: '版本拼接链接：', value: formatTomlString(deployment.splicingLink) },
                { label: '格式化版本：', value: formatTomlBoolean(deployment.formatVersion) },
                ...(deployment.formatVersion === true ? [{ label: '格式化规则：', value: formatTomlInlineTableArray(deployment.versionFormattingFormula, formatTomlVersionFormattingRule) }] : []),
              ]
              : []),
            ...(deployment.getMethod === 'get_link'
              ? [
                { label: '链接获取：', value: formatTomlString(deployment.getLink) },
                ...(deployment.getLink === 'filelink' || deployment.getLink === 'custom'
                  ? [{ label: '可选链接：', value: formatTomlArray(getLinkProvideList) }]
                  : []),
                ...(deployment.getLink === 'filelink' && getLinkProvideList.length === 0 ? [{ label: '链接文件来源：', value: formatTomlArray(linkFile) }] : []),
                ...(deployment.getLink === 'custom' && getLinkProvideList.length === 0
                  ? [
                    { label: '链接脚本来源：', value: formatTomlArray(linkCustom) },
                    ...(hasDenoCustomSource(linkCustom) ? [{ label: 'Deno权限参数：', value: formatTomlArray(denoPermissions) }] : []),
                    ...(hasJvmCustomSource(linkCustom) ? [{ label: 'JVM参数：', value: formatTomlArray(jvm) }] : []),
                  ]
                  : []),
              ]
              : []),
          ]
          : []),
        { label: '部署路径：', value: formatTomlString(deployment.deployPath) },
        ...(deployment.deployPath === '$CustomPath' ? [{ label: '自定义路径：', value: formatTomlString(deployment.customPath) }] : []),
      ]
      : []),
    { label: '用户可选版本：', value: formatTomlBoolean(deployment.userChoose) },
    ...(deployment.userChoose === true ? [{ label: '版本选择列表：', value: formatTomlArray(deployment.chooseList) }] : []),
    { label: '部署前操作：', value: formatTomlBoolean(deployment.beforeCommand) },
    ...(deployment.beforeCommand === true ? [{ label: '部署前命令：', value: formatTomlArray(deployment.beforeCommandList) }] : []),
    { label: '部署后操作：', value: formatTomlBoolean(deployment.afterCommand) },
    ...(deployment.afterCommand === true ? [{ label: '部署后命令：', value: formatTomlArray(deployment.afterCommandList) }] : []),
    { label: '环境变量导出：', value: formatTomlBoolean(deployment.envOutput) },
    ...(deployment.envOutput === true ? [{ label: '导出变量：', value: formatTomlInlineTableArray(deployment.envOutputList, formatTomlEnvVariableEntry) }] : []),
    { label: '环境变量导入：', value: formatTomlBoolean(deployment.envInput) },
    ...(deployment.envInput === true ? [{ label: '导入变量：', value: formatTomlInlineTableArray(deployment.envInputList, formatTomlEnvVariableEntry) }] : []),
  ]

  return (
    <g transform={`translate(${position.x} ${position.y})`} data-workbench-block-id={`deployment:${blockIndex}`}>
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
        [[Deployment]] {blockIndex}
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
          onConnectorDragStart?.('deployment-output', { x: position.x + outputOffset.x, y: position.y + connectorY }, event)
        }}
      >
        <AddConnectorButton />
      </g>
      <DeleteBlockButton x={bodyX + bodyWidth - 43} y={bodyY + 15} onDelete={onDelete} />
    </g>
  )
}
