import type { MouseEvent } from 'react'
import type { WorkbenchSize } from '../types'

export function LinkPendingOutline({ width, height }: WorkbenchSize) {
  return (
    <rect x="0" y="0" width={width} height={height} rx="36" fill="none" stroke="#8fdca4" strokeWidth="3">
      <animate attributeName="opacity" values="0.35;1;0.35" dur="1.2s" repeatCount="indefinite" />
    </rect>
  )
}

export function DeleteBlockButton({
  x,
  y,
  onDelete,
}: {
  x: number
  y: number
  onDelete?: () => void
}) {
  if (!onDelete) return null

  const handleClick = (event: MouseEvent<SVGGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onDelete()
  }

  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={handleClick}
      onDoubleClick={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={event => event.stopPropagation()}
      aria-label="删除积木"
    >
      <title>删除积木</title>
      <circle cx="14" cy="14" r="13" fill="var(--dfw-bg)" stroke="currentColor" strokeWidth="1.5" opacity="0.92" />
      <path d="M9.5 9.5L18.5 18.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M18.5 9.5L9.5 18.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </g>
  )
}
