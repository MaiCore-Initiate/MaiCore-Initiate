import { useRef, useState, type PointerEvent } from 'react'
import CanvasConnectionLayer from './CanvasConnectionLayer'
import InitBlock from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import { workbenchCanvasFont, type WorkbenchBlockMeta, type WorkbenchCanvasProps, type WorkbenchPoint, type WorkbenchResizeDirection, type WorkbenchSize } from './types'

const defaultBlockMeta: WorkbenchBlockMeta = {
  author: '',
  tags: [],
  description: '',
  modId: '',
  modName: '',
  version: '',
  minVersion: '',
  maxVersion: '',
  fileImport: null,
  fileImportList: [],
  runtime: '',
  platforms: [],
  schemaVersion: '',
}

const initBlockInputOffset: WorkbenchPoint = { x: 5, y: 115.5 }
const startEndpointOutputOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }
const longPressMs = 220
const initBlockMinSize: WorkbenchSize = { width: 421, height: 431 }
type DraggableBlockId = 'init' | 'start'

export default function WorkbenchCanvas({
  viewport,
  selectedBlockId = null,
  onSelectedBlockChange,
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }
  const [startEndpointPosition, setStartEndpointPosition] = useState<WorkbenchPoint>({ x: 605.289, y: 469.289 })
  const [initBlockPosition, setInitBlockPosition] = useState<WorkbenchPoint>({ x: 829, y: 359 })
  const [initBlockSize, setInitBlockSize] = useState<WorkbenchSize>(initBlockMinSize)
  const dragRef = useRef<{
    pointerId: number
    blockId: DraggableBlockId
    startClientX: number
    startClientY: number
    startPosition: WorkbenchPoint
    active: boolean
    timer: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    direction: WorkbenchResizeDirection
    startClientX: number
    startClientY: number
    startSize: WorkbenchSize
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
    onSelectedBlockChange?.(blockId)
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

  const startInitResize = (direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectedBlockChange?.('init')
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: initBlockSize,
    }
  }

  const moveInitResize = (event: PointerEvent<SVGRectElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const scale = viewport.scale || 1
    const nextWidth = resize.direction === 'bottom'
      ? resize.startSize.width
      : resize.startSize.width + (event.clientX - resize.startClientX) / scale
    const nextHeight = resize.direction === 'right'
      ? resize.startSize.height
      : resize.startSize.height + (event.clientY - resize.startClientY) / scale
    setInitBlockSize({
      width: Math.max(initBlockMinSize.width, nextWidth),
      height: Math.max(initBlockMinSize.height, nextHeight),
    })
  }

  const stopInitResize = (event: PointerEvent<SVGRectElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeRef.current = null
  }

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
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
      }}
      onClick={() => onSelectedBlockChange?.(null)}
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" className="block overflow-visible" style={{ fill: 'currentColor' }}>
        <CanvasConnectionLayer from={startEndpointOutput} to={initBlockInput} />
        <StartEndpointBlock
          position={startEndpointPosition}
          selected={selectedBlockId === 'start'}
          onSelect={() => onSelectedBlockChange?.('start')}
          dragHandlers={createDragHandlers('start', startEndpointPosition)}
        />
        <InitBlock
          position={initBlockPosition}
          size={initBlockSize}
          selected={selectedBlockId === 'init'}
          onSelect={() => onSelectedBlockChange?.('init')}
          meta={meta}
          dragHandlers={createDragHandlers('init', initBlockPosition)}
          resizeHandlers={{
            onResizePointerDown: startInitResize,
            onResizePointerMove: moveInitResize,
            onResizePointerUp: stopInitResize,
            onResizePointerCancel: stopInitResize,
          }}
        />
      </svg>
    </div>
  )
}
