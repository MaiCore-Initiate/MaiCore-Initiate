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
const startEndpointOutputOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }
const longPressMs = 220
type DraggableBlockId = 'init' | 'start'

export default function WorkbenchCanvas({
  viewport,
  selectedBlockId = 'init',
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }
  const [startEndpointPosition, setStartEndpointPosition] = useState<WorkbenchPoint>({ x: 605.289, y: 469.289 })
  const [initBlockPosition, setInitBlockPosition] = useState<WorkbenchPoint>({ x: 829, y: 359 })
  const dragRef = useRef<{
    pointerId: number
    blockId: DraggableBlockId
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

  const setBlockPosition = (blockId: DraggableBlockId, position: WorkbenchPoint) => {
    if (blockId === 'init') setInitBlockPosition(position)
    else setStartEndpointPosition(position)
  }

  const startBlockDrag = (blockId: DraggableBlockId, position: WorkbenchPoint, event: PointerEvent<SVGGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const currentTarget = event.currentTarget
    currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      blockId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: position,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
      }, longPressMs),
    }
  }

  const moveBlockDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (!drag.active) return
    const scale = viewport.scale || 1
    setBlockPosition(drag.blockId, {
      x: drag.startPosition.x + (event.clientX - drag.startClientX) / scale,
      y: drag.startPosition.y + (event.clientY - drag.startClientY) / scale,
    })
  }

  const stopBlockDrag = (event: PointerEvent<SVGGElement>) => {
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

  const createDragHandlers = (blockId: DraggableBlockId, position: WorkbenchPoint) => ({
    onHeaderPointerDown: (event: PointerEvent<SVGGElement>) => startBlockDrag(blockId, position, event),
    onHeaderPointerMove: moveBlockDrag,
    onHeaderPointerUp: stopBlockDrag,
    onHeaderPointerCancel: stopBlockDrag,
  })

  const startEndpointOutput = {
    x: startEndpointPosition.x + startEndpointOutputOffset.x,
    y: startEndpointPosition.y + startEndpointOutputOffset.y,
  }
  const initBlockInput = {
    x: initBlockPosition.x + initBlockInputOffset.x,
    y: initBlockPosition.y + initBlockInputOffset.y,
  }

  return (
    <div
      className="absolute left-0 top-0 z-0 h-[1920px] w-[1920px] origin-top-left"
      style={{
        transform: `translate(${viewport.canvasX}px, ${viewport.canvasY}px) scale(${viewport.scale})`,
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
      }}
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" className="block overflow-visible" style={{ fill: 'currentColor' }}>
        <CanvasConnectionLayer from={startEndpointOutput} to={initBlockInput} />
        <StartEndpointBlock
          position={startEndpointPosition}
          dragHandlers={createDragHandlers('start', startEndpointPosition)}
        />
        <InitBlock
          position={initBlockPosition}
          selected={selectedBlockId === 'init'}
          meta={meta}
          dragHandlers={createDragHandlers('init', initBlockPosition)}
        />
      </svg>
    </div>
  )
}
