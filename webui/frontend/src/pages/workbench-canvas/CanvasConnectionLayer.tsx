import type { WorkbenchPoint } from './types'

export default function CanvasConnectionLayer({
  from,
  to,
  stroke = 'currentColor',
}: {
  from: WorkbenchPoint
  to: WorkbenchPoint
  stroke?: string
}) {
  const controlOffset = Math.max(68, Math.abs(to.x - from.x) * 0.46)
  const path = `M${to.x},${to.y} C${to.x - controlOffset},${to.y} ${from.x + controlOffset * 0.45},${from.y} ${from.x},${from.y}`

  return (
    <g pointerEvents="none">
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
    </g>
  )
}
