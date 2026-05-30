import { workbenchCanvasFont, type WorkbenchPoint } from './types'

const componentsAccent = '#127439'
const componentsFill = '#009200'
const componentAccent = '#00d000'
const componentFill = '#7fff9f'

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

export default function AddNodePopover({
  position,
  componentsVisible,
  onAddComponents,
  onClose,
}: {
  position: WorkbenchPoint
  componentsVisible: boolean
  onAddComponents: () => void
  onClose: () => void
}) {
  return (
    <g
      transform={`translate(${position.x} ${position.y})`}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      style={{ filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.18))' }}
    >
      <rect x="1" y="1" width="350" height="500" rx="30" fill="var(--dfw-bg)" stroke="var(--dfw-sidebar-border)" strokeWidth="2" />
      <text x="21" y="49.85" fontSize="30" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        组件
      </text>

      <ComponentNodeRow
        y={57}
        label="组件管理闸"
        code="[COMPONENTS]"
        swatchFill={componentsFill}
        swatchStroke={componentsAccent}
        disabled={componentsVisible}
        onClick={onAddComponents}
      />
      <ComponentNodeRow
        y={92}
        label="组件界定器"
        code="[[Component]]"
        swatchFill={componentFill}
        swatchStroke={componentAccent}
        disabled
      />

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
    </g>
  )
}
