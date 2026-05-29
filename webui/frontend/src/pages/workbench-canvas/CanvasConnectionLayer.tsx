import type { WorkbenchPoint } from './types'

export default function CanvasConnectionLayer({
  from,
  to,
}: {
  from: WorkbenchPoint
  to: WorkbenchPoint
}) {
  const controlOffset = Math.max(68, Math.abs(to.x - from.x) * 0.46)
  const path = `M${to.x},${to.y} C${to.x - controlOffset},${to.y} ${from.x + controlOffset * 0.45},${from.y} ${from.x},${from.y}`

  return (
    <g>
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
      <g transform={`translate(${to.x - 2.5} ${to.y - 2.5})`}>
        <circle cx="2.5" cy="2.5" r="2.5" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
        <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>
      <g transform={`translate(${from.x - 2.5} ${from.y - 2.5})`}>
        <circle cx="2.5" cy="2.5" r="2.5" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="2" />
        <circle cx="2.5" cy="2.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>
    </g>
  )
}
