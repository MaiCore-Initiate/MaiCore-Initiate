import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { workbenchCanvasFont, type WorkbenchConnectionSource, type WorkbenchPoint } from './types'

const componentsAccent = '#127439'
const componentsFill = '#009200'
const componentAccent = '#00d000'
const componentFill = '#7fff9f'
const deployAccent = '#d97706'
const deployFill = '#f59e0b'
const deploymentAccent = '#f59e0b'
const deploymentFill = '#fde68a'
const configAccent = '#6d28d9'
const configFill = '#8b5cf6'
const configItemAccent = '#a78bfa'
const configItemFill = '#ddd6fe'
const launchAccent = '#0f766e'
const launchFill = '#14b8a6'
const launchItemAccent = '#2dd4bf'
const launchItemFill = '#99f6e4'
const uninstallAccent = '#991b1b'
const uninstallFill = '#dc2626'
const uninstallItemAccent = '#f87171'
const uninstallItemFill = '#fecaca'
const fileAccent = '#b45309'
const fileFill = '#f59e0b'

const POPOVER_WIDTH = 296
const POPOVER_MAX_HEIGHT = 420
const ROW_HEIGHT = 32
const ROW_SPACING = 38
const TITLE_HEIGHT = 28
const TITLE_GAP = 11
const GROUP_GAP = 54
const FIRST_ROW_Y = 54
const TOP_PADDING = 14
const BOTTOM_PADDING = 14

function ComponentNodeRow({
  y,
  label,
  code,
  swatchFill,
  swatchStroke,
  disabled = false,
  onClick,
}: {
  y: number
  label: string
  code: string
  swatchFill: string
  swatchStroke: string
  disabled?: boolean
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const showHover = hovered && !disabled

  return (
    <g
      className={disabled ? 'cursor-default' : 'cursor-pointer'}
      opacity={disabled ? 0.42 : 1}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={event => {
        event.stopPropagation()
        if (!disabled) onClick?.()
      }}
      onPointerDown={event => event.stopPropagation()}
    >
      <rect
        x="18"
        y={y}
        width={POPOVER_WIDTH - 36}
        height={ROW_HEIGHT}
        rx="8"
        fill="var(--dfw-bg)"
        stroke={showHover ? swatchStroke : 'var(--dfw-sidebar-border)'}
        strokeWidth={showHover ? '1.5' : '1'}
        style={{ transition: 'all 0.18s ease' }}
      />
      <rect
        x="24"
        y={y + 5}
        width="22"
        height="22"
        rx="5"
        fill={swatchFill}
        opacity="0.88"
      />
      <rect
        x="24"
        y={y + 5}
        width="22"
        height="22"
        rx="5"
        fill="none"
        stroke={swatchStroke}
        strokeWidth="1.5"
        opacity="0.95"
      />
      <rect
        x="27"
        y={y + 8}
        width="13"
        height="2"
        rx="1"
        fill="white"
        opacity="0.55"
      />
      {disabled && (
        <path
          d={`M${30} ${y + 16} L${34} ${y + 20} L${41} ${y + 11}`}
          fill="none"
          stroke={swatchStroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <text
        x="56"
        y={y + 19}
        fontSize="13"
        fontFamily={workbenchCanvasFont}
        fontWeight="500"
        fill="currentColor"
      >
        {label}
      </text>
      <text
        x="56"
        y={y + 29}
        fontSize="10"
        fontFamily={workbenchCanvasFont}
        fontWeight="300"
        fill="var(--dfw-outline-muted)"
        letterSpacing="0.4"
      >
        {code}
      </text>
    </g>
  )
}

function shouldShowComponents(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'init-components'
}

function shouldShowDeploy(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'components-deploy'
}

function shouldShowComponent(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'components-component'
}

function shouldShowDeployment(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'deploy-deployment'
}

function shouldShowConfig(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'deploy-config'
}

function shouldShowConfigItem(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'config-item'
}

function shouldShowLaunch(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'config-launch'
}

function shouldShowLaunchItem(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'launch-item'
}

function shouldShowUninstall(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'launch-uninstall'
}

function shouldShowUninstallItem(source: WorkbenchConnectionSource | null) {
  return source === null || source === 'uninstall-item'
}

function GroupTitle({
  y,
  label,
  accent,
}: {
  y: number
  label: string
  accent: string
}) {
  return (
    <g>
      <rect
        x="18"
        y={y - 18}
        width="3"
        height="22"
        rx="1.5"
        fill={accent}
      />
      <text
        x="28"
        y={y}
        fontSize="20"
        fontFamily={workbenchCanvasFont}
        fontWeight="600"
        fill="currentColor"
      >
        {label}
      </text>
    </g>
  )
}

export default function AddNodePopover({
  position,
  componentsVisible,
  deployVisible,
  configVisible,
  launchVisible,
  uninstallVisible,
  source = null,
  onAddComponents,
  onAddDeploy,
  onAddConfig,
  onAddLaunch,
  onAddUninstall,
  onAddComponent,
  onAddDeployment,
  onAddConfigItem,
  onAddLaunchItem,
  onAddUninstallItem,
  onAddFile,
  onClose,
}: {
  position: WorkbenchPoint
  componentsVisible: boolean
  deployVisible: boolean
  configVisible: boolean
  launchVisible: boolean
  uninstallVisible: boolean
  source?: WorkbenchConnectionSource | null
  onAddComponents: () => void
  onAddDeploy: () => void
  onAddConfig: () => void
  onAddLaunch: () => void
  onAddUninstall: () => void
  onAddComponent: () => void
  onAddDeployment: () => void
  onAddConfigItem: () => void
  onAddLaunchItem: () => void
  onAddUninstallItem: () => void
  onAddFile: () => void
  onClose: () => void
}) {
  const [closeHovered, setCloseHovered] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const lastAnchorRef = useRef<{ x: number; y: number }>({ x: position.x, y: position.y })

  useEffect(() => {
    if (lastAnchorRef.current.x !== position.x || lastAnchorRef.current.y !== position.y) {
      lastAnchorRef.current = { x: position.x, y: position.y }
      setDragOffset({ x: 0, y: 0 })
    }
  }, [position.x, position.y])

  const componentRows = [
    ...(shouldShowComponents(source)
      ? [{ key: 'components', label: '组件管理闸', code: '[COMPONENTS]', fill: componentsFill, stroke: componentsAccent, disabled: componentsVisible, onClick: onAddComponents }]
      : []),
    ...(shouldShowComponent(source)
      ? [{ key: 'component', label: '组件界定器', code: '[[Component]]', fill: componentFill, stroke: componentAccent, disabled: false, onClick: onAddComponent }]
      : []),
  ]
  const deployRows = [
    ...(shouldShowDeploy(source)
      ? [{ key: 'deploy', label: '部署管理闸', code: '[DEPLOY]', fill: deployFill, stroke: deployAccent, disabled: deployVisible, onClick: onAddDeploy }]
      : []),
    ...(shouldShowDeployment(source)
      ? [{ key: 'deployment', label: '部署界定器', code: '[[Deployment]]', fill: deploymentFill, stroke: deploymentAccent, disabled: false, onClick: onAddDeployment }]
      : []),
  ]
  const configRows = [
    ...(shouldShowConfig(source)
      ? [{ key: 'config', label: '配置管理闸', code: '[CONFIG]', fill: configFill, stroke: configAccent, disabled: configVisible, onClick: onAddConfig }]
      : []),
    ...(shouldShowConfigItem(source)
      ? [{ key: 'config-item', label: '配置界定器', code: '[[ConfigItem]]', fill: configItemFill, stroke: configItemAccent, disabled: false, onClick: onAddConfigItem }]
      : []),
  ]
  const launchRows = [
    ...(shouldShowLaunch(source)
      ? [{ key: 'launch', label: '启动管理闸', code: '[LAUNCH]', fill: launchFill, stroke: launchAccent, disabled: launchVisible, onClick: onAddLaunch }]
      : []),
    ...(shouldShowLaunchItem(source)
      ? [{ key: 'launch-item', label: '启动项', code: '[[LaunchItem]]', fill: launchItemFill, stroke: launchItemAccent, disabled: false, onClick: onAddLaunchItem }]
      : []),
  ]
  const uninstallRows = [
    ...(shouldShowUninstall(source)
      ? [{ key: 'uninstall', label: '卸载管理闸', code: '[UNINSTALL]', fill: uninstallFill, stroke: uninstallAccent, disabled: uninstallVisible, onClick: onAddUninstall }]
      : []),
    ...(shouldShowUninstallItem(source)
      ? [{ key: 'uninstall-item', label: '卸载项', code: '[[UninstallItem]]', fill: uninstallItemFill, stroke: uninstallItemAccent, disabled: false, onClick: onAddUninstallItem }]
      : []),
  ]
  const fileRows = [
    ...(source === null
      ? [{ key: 'file', label: '导入文件', code: '[[File]]', fill: fileFill, stroke: fileAccent, disabled: false, onClick: onAddFile }]
      : []),
  ]

  const lastComponentRowY = componentRows.length > 0
    ? FIRST_ROW_Y + (componentRows.length - 1) * ROW_SPACING
    : FIRST_ROW_Y - GROUP_GAP
  const deployTitleY = lastComponentRowY + GROUP_GAP
  const deployRowStartY = deployTitleY + TITLE_GAP
  const lastDeployRowY = deployRows.length > 0
    ? deployRowStartY + (deployRows.length - 1) * ROW_SPACING
    : deployRowStartY - GROUP_GAP
  const configTitleY = lastDeployRowY + GROUP_GAP
  const configRowStartY = configTitleY + TITLE_GAP
  const lastConfigRowY = configRows.length > 0
    ? configRowStartY + (configRows.length - 1) * ROW_SPACING
    : configRowStartY - GROUP_GAP
  const launchTitleY = lastConfigRowY + GROUP_GAP
  const launchRowStartY = launchTitleY + TITLE_GAP
  const lastLaunchRowY = launchRows.length > 0
    ? launchRowStartY + (launchRows.length - 1) * ROW_SPACING
    : launchRowStartY - GROUP_GAP
  const uninstallTitleY = lastLaunchRowY + GROUP_GAP
  const uninstallRowStartY = uninstallTitleY + TITLE_GAP
  const lastUninstallRowY = uninstallRows.length > 0
    ? uninstallRowStartY + (uninstallRows.length - 1) * ROW_SPACING
    : uninstallRowStartY - GROUP_GAP
  const fileTitleY = lastUninstallRowY + GROUP_GAP
  const fileRowStartY = fileTitleY + TITLE_GAP

  const lastRowBottomY = Math.max(
    componentRows.length > 0 ? FIRST_ROW_Y + (componentRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
    deployRows.length > 0 ? deployRowStartY + (deployRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
    configRows.length > 0 ? configRowStartY + (configRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
    launchRows.length > 0 ? launchRowStartY + (launchRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
    uninstallRows.length > 0 ? uninstallRowStartY + (uninstallRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
    fileRows.length > 0 ? fileRowStartY + (fileRows.length - 1) * ROW_SPACING + ROW_HEIGHT : 0,
  )
  const popoverHeight = TOP_PADDING + Math.max(TITLE_HEIGHT, lastRowBottomY) + BOTTOM_PADDING

  const handleSvgPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: dragOffset.x,
      startOffsetY: dragOffset.y,
    }
  }

  const handleSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDragOffset({
      x: drag.startOffsetX + (event.clientX - drag.startClientX),
      y: drag.startOffsetY + (event.clientY - drag.startClientY),
    })
  }

  const handleSvgPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  return (
    <div
      data-workbench-ui
      className="absolute z-10 overflow-hidden"
      style={{
        left: position.x + dragOffset.x,
        top: position.y + dragOffset.y,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        borderRadius: 14,
        background: 'var(--dfw-bg)',
        border: '1.5px solid var(--dfw-sidebar-border)',
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
        boxShadow: '0 12px 24px rgba(0, 0, 0, 0.22)',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
      onClick={event => event.stopPropagation()}
    >
      <div
        className="overflow-y-auto overflow-x-hidden"
        style={{
          maxHeight: POPOVER_MAX_HEIGHT,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <svg
          data-workbench-ui
          width={POPOVER_WIDTH}
          height={popoverHeight}
          viewBox={`0 0 ${POPOVER_WIDTH} ${popoverHeight}`}
          style={{ display: 'block', fill: 'currentColor' }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
        >
          {componentRows.length > 0 && (
            <GroupTitle y={FIRST_ROW_Y - 8} label="组件" accent="#22b386" />
          )}
          {componentRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={FIRST_ROW_Y + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}

          {deployRows.length > 0 && (
            <GroupTitle y={deployTitleY} label="部署" accent="#d97706" />
          )}
          {deployRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={deployRowStartY + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}

          {configRows.length > 0 && (
            <GroupTitle y={configTitleY} label="配置" accent="#8b5cf6" />
          )}
          {configRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={configRowStartY + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}

          {launchRows.length > 0 && (
            <GroupTitle y={launchTitleY} label="启动" accent="#14b8a6" />
          )}
          {launchRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={launchRowStartY + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}

          {uninstallRows.length > 0 && (
            <GroupTitle y={uninstallTitleY} label="卸载" accent="#dc2626" />
          )}

          {uninstallRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={uninstallRowStartY + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}

          {fileRows.length > 0 && (
            <GroupTitle y={fileTitleY} label="文件" accent={fileAccent} />
          )}

          {fileRows.map((row, index) => (
            <ComponentNodeRow
              key={row.key}
              y={fileRowStartY + index * ROW_SPACING}
              label={row.label}
              code={row.code}
              swatchFill={row.fill}
              swatchStroke={row.stroke}
              disabled={row.disabled}
              onClick={row.onClick}
            />
          ))}
        </svg>
      </div>
      <button
        type="button"
        className="absolute cursor-pointer transition-colors"
        style={{
          right: 6,
          top: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          background: closeHovered ? 'rgba(217, 119, 6, 0.18)' : 'rgba(125, 125, 125, 0.08)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          color: 'var(--dfw-text)',
          zIndex: 1,
        }}
        onPointerEnter={() => setCloseHovered(true)}
        onPointerLeave={() => setCloseHovered(false)}
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
        onPointerDown={event => event.stopPropagation()}
        aria-label="关闭添加节点菜单"
        title="关闭"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2 2 L10 10 M10 2 L2 10"
            stroke={closeHovered ? '#d97706' : 'currentColor'}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity={closeHovered ? 0.95 : 0.55}
          />
        </svg>
      </button>
    </div>
  )
}
