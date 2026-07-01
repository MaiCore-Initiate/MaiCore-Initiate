import type { WorkbenchPoint } from './types'

export default function CanvasConnectionLayer({
  from,
  to,
  stroke = 'currentColor',
  strokeWidth = 4,
}: {
  from: WorkbenchPoint
  to: WorkbenchPoint
  stroke?: string
  strokeWidth?: number
}) {
  const controlDirection = to.x >= from.x ? 1 : -1
  const controlOffset = Math.max(68, Math.abs(to.x - from.x) * 0.46)
  const path = `M${from.x},${from.y} C${from.x + controlDirection * controlOffset * 0.45},${from.y} ${to.x - controlDirection * controlOffset},${to.y} ${to.x},${to.y}`

  return (
    <g pointerEvents="none">
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth={strokeWidth} />
    </g>
  )
}