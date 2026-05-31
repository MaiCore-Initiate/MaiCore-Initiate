import { workbenchCanvasFont, type WorkbenchConnectionSource, type WorkbenchPoint } from './types'

const componentsAccent = '#127439'
const componentsFill = '#009200'
const componentAccent = '#00d000'
const componentFill = '#7fff9f'
const deployAccent = '#d97706'
const deployFill = '#f59e0b'

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
  return (
    <g
      className={disabled ? 'cursor-default' : 'cursor-pointer'}
      opacity={disabled ? 0.48 : 1}
      onClick={event => {
        event.stopPropagation()
        if (!disabled) onClick?.()
      }}
      onPointerDown={event => event.stopPropagation()}
    >
      <rect
        x="21"
        y={y}
        width="300"
        height="28"
        rx="5"
        fill="var(--dfw-bg)"
        stroke="var(--dfw-sidebar-border)"
        strokeWidth="1"
      />
      <rect x="24.09" y={y + 3} width="22" height="22" rx="3" fill={swatchFill} stroke={swatchStroke} strokeWidth="2" opacity="0.7" />
      <text x="49.79" y={y + 21.34} fontSize="20" fontFamily={workbenchCanvasFont} fontWeight="300" fill="currentColor">
        <tspan>{label}</tspan>
        <tspan fontSize="15" fill="var(--dfw-outline-muted)"> {code}</tspan>
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

export default function AddNodePopover({
  position,
  componentsVisible,
  deployVisible,
  source = null,
  onAddComponents,
  onAddDeploy,
  onAddComponent,
  onClose,
}: {
  position: WorkbenchPoint
  componentsVisible: boolean
  deployVisible: boolean
  source?: WorkbenchConnectionSource | null
  onAddComponents: () => void
  onAddDeploy: () => void
  onAddComponent: () => void
  onClose: () => void
}) {
  const rows = [
    ...(shouldShowComponents(source)
      ? [{ key: 'components', label: '组件管理闸', code: '[COMPONENTS]', fill: componentsFill, stroke: componentsAccent, disabled: componentsVisible, onClick: onAddComponents }]
      : []),
    ...(shouldShowComponent(source)
      ? [{ key: 'component', label: '组件界定器', code: '[[Component]]', fill: componentFill, stroke: componentAccent, disabled: false, onClick: onAddComponent }]
      : []),
    ...(shouldShowDeploy(source)
      ? [{ key: 'deploy', label: '部署管理闸', code: '[DEPLOY]', fill: deployFill, stroke: deployAccent, disabled: deployVisible, onClick: onAddDeploy }]
      : []),
  ]

  return (
    <svg
      data-workbench-ui
      width="352"
      height="502"
      viewBox="0 0 352 502"
      className="absolute z-10 overflow-visible"
      style={{
        left: position.x,
        top: position.y,
        color: 'var(--dfw-text)',
        filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.18))',
      }}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <rect x="1" y="1" width="350" height="500" rx="30" fill="var(--dfw-bg)" stroke="var(--dfw-sidebar-border)" strokeWidth="2" />
      <text x="21" y="49.85" fontSize="30" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        组件
      </text>

      {rows.map((row, index) => (
        <ComponentNodeRow
          key={row.key}
          y={57 + index * 35}
          label={row.label}
          code={row.code}
          swatchFill={row.fill}
          swatchStroke={row.stroke}
          disabled={row.disabled}
          onClick={row.onClick}
        />
      ))}

      <g
        className="cursor-pointer"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        <rect x="321" y="0" width="31" height="31" rx="15.5" fill="transparent" />
      </g>
    </svg>
  )
}