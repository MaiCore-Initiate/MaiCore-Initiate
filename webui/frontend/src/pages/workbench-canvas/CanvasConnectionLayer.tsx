import type { WorkbenchPoint } from './types'

export default function CanvasConnectionLayer({
  from,
  to,
  stroke = 'currentColor',
  arrow = false,
}: {
  from: WorkbenchPoint
  to: WorkbenchPoint
  stroke?: string
  arrow?: boolean
}) {
  const controlOffset = Math.max(68, Math.abs(to.x - from.x) * 0.46)
  const path = `M${to.x},${to.y} C${to.x - controlOffset},${to.y} ${from.x + controlOffset * 0.45},${from.y} ${from.x},${from.y}`
  const markerId = `dfw-arrow-${stroke.replace(/[^a-zA-Z0-9]/g, '') || 'current'}`

  return (
    <g pointerEvents="none">
      {arrow && (
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M1,1 L9,5 L1,9 Z" fill={stroke} />
          </marker>
        </defs>
      )}
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" markerEnd={arrow ? `url(#${markerId})` : undefined} />
    </g>
  )
}