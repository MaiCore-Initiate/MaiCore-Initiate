import { useRef, useState, type PointerEvent } from 'react'
import CanvasConnectionLayer from './CanvasConnectionLayer'
import InitBlock from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import { workbenchCanvasFont, type WorkbenchBlockMeta, type WorkbenchCanvasProps, type WorkbenchPoint } from './types'

const defaultBlockMeta: WorkbenchBlockMeta = {
  author: 'MCStartTeam',
  tags: 'test',
  description: '这是一个基于MCStart...',
  templateId: 'MaiCore-Start.Deplo...',
  templateName: '示例部署模组',
}

const initBlockInputOffset: WorkbenchPoint = { x: 5, y: 115.5 }
const startEndpointOutput: WorkbenchPoint = { x: 701, y: 540 }
const longPressMs = 220

export default function WorkbenchCanvas({
  viewport,
  selectedBlockId = 'init',
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }
  const [initBlockPosition, setInitBlockPosition] = useState<WorkbenchPoint>({ x: 829, y: 359 })
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startPosition: WorkbenchPoint
    active: boolean
    timer: number
  } | null>(null)

  const clearDragTimer = () => {
    if (!dragRef.current) return
    window.clearTimeout(dragRef.current.timer)
  }

  const startHeaderDrag = (event: PointerEvent<SVGGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const currentTarget = event.currentTarget
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: initBlockPosition,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
        currentTarget.setPointerCapture(event.pointerId)
      }, longPressMs),
    }
  }

  const moveHeaderDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (!drag.active) return
    const scale = viewport.scale || 1
    setInitBlockPosition({
      x: drag.startPosition.x + (event.clientX - drag.startClientX) / scale,
      y: drag.startPosition.y + (event.clientY - drag.startClientY) / scale,
    })
  }

  const stopHeaderDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    clearDragTimer()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const initBlockInput = {
    x: initBlockPosition.x + initBlockInputOffset.x,
    y: initBlockPosition.y + initBlockInputOffset.y,
  }

  return (
    <div
      className="absolute left-0 top-0 z-0 h-[1920px] w-[1920px] origin-top-left"
      style={{
        transform: `scale(${viewport.scale})`,
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
      }}
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" className="block overflow-visible" style={{ fill: 'currentColor' }}>
        <StartEndpointBlock />
        <InitBlock
          position={initBlockPosition}
          selected={selectedBlockId === 'init'}
          meta={meta}
          dragHandlers={{
            onHeaderPointerDown: startHeaderDrag,
            onHeaderPointerMove: moveHeaderDrag,
            onHeaderPointerUp: stopHeaderDrag,
            onHeaderPointerCancel: stopHeaderDrag,
          }}
        />
        <CanvasConnectionLayer from={startEndpointOutput} to={initBlockInput} />
      </svg>
    </div>
  )
}
