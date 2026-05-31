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
  const controlDirection = to.x >= from.x ? 1 : -1
  const controlOffset = Math.max(68, Math.abs(to.x - from.x) * 0.46)
  const flowPath = `M${from.x},${from.y} C${from.x + controlDirection * controlOffset * 0.45},${from.y} ${to.x - controlDirection * controlOffset},${to.y} ${to.x},${to.y}`
  const dragPath = `M${from.x},${from.y} L${to.x},${to.y}`
  const path = arrow ? dragPath : flowPath
  const markerId = `dfw-arrow-${stroke.replace(/[^a-zA-Z0-9]/g, '') || 'current'}`

  return (
    <g pointerEvents="none">
      {arrow && (
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M1,1 L9,5 L1,9 Z" fill={stroke} />
          </marker>
        </defs>
      )}
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" markerEnd={arrow ? `url(#${markerId})` : undefined} />
    </g>
  )
}