import { workbenchCanvasFont, type WorkbenchPoint } from './types'

const accent = '#22b386'

function PlusGlyph({ x, y, disabled = false }: { x: number; y: number; disabled?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={disabled ? 0.42 : 1}>
      <circle cx="11" cy="11" r="10" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <path d="M6.5,11h9" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M11,6.5v9" fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </g>
  )
}

function CloseGlyph() {
  return (
    <g>
      <path d="M7,7L17,17" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M17,7L7,17" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </g>
  )
}

function NodeOption({
  y,
  title,
  detail,
  disabled = false,
  onClick,
}: {
  y: number
  title: string
  detail: string
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
      <rect x="12" y={y} width="236" height="52" rx="12" fill={accent} opacity="0.12" stroke={accent} strokeWidth="1.5" />
      <PlusGlyph x={26} y={y + 15} disabled={disabled} />
      <text x="62" y={y + 24} fontSize="18" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        {title}
      </text>
      <text x="62" y={y + 43} fontSize="14" fontFamily={workbenchCanvasFont} fontWeight="300" fill="currentColor" opacity="0.78">
        {detail}
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
      <rect x="0" y="0" width="260" height="154" rx="18" fill="var(--dfw-bg)" stroke={accent} strokeWidth="2" />
      <text x="18" y="30" fontSize="20" fontFamily={workbenchCanvasFont} fontWeight="600" fill="currentColor">
        新增节点
      </text>
      <g
        className="cursor-pointer"
        transform="translate(224 12)"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        <rect x="0" y="0" width="24" height="24" rx="7" fill="transparent" />
        <CloseGlyph />
      </g>

      <NodeOption
        y={48}
        title="[COMPONENTS]"
        detail={componentsVisible ? '已在画布中' : '组件配置区域'}
        disabled={componentsVisible}
        onClick={onAddComponents}
      />
      <NodeOption y={108} title="[[Deployment]]" detail="后续阶段接入" disabled />
    </g>
  )
}
