import { useEffect, useRef, useState, type PointerEvent } from 'react'
import AddNodePopover from './AddNodePopover'
import CanvasConnectionLayer from './CanvasConnectionLayer'
import ComponentsBlock, { componentsBlockInputOffset, componentsBlockMinSize, resolveComponentsBlockOutputOffset } from './blocks/ComponentsBlock'
import InitBlock from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import { workbenchCanvasFont, type WorkbenchBlockId, type WorkbenchBlockMeta, type WorkbenchCanvasProps, type WorkbenchPoint, type WorkbenchResizeDirection, type WorkbenchSize } from './types'

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
  runtime: 'powershell',
  denoNet: null,
  denoRead: null,
  denoWrite: null,
  denoEnv: null,
  denoRun: null,
  denoHrtime: null,
  denoFfi: null,
  denoSys: null,
  denoAll: null,
  denoCustomPermissions: null,
  denoPermissionList: [],
  platforms: [],
  schemaVersion: '',
}

const initBlockInputOffset: WorkbenchPoint = { x: 5, y: 115.5 }
const startEndpointOutputOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }
const longPressMs = 220
const initBlockMinSize: WorkbenchSize = { width: 421, height: 431 }
type DraggableBlockId = WorkbenchBlockId
type ResizableBlockId = 'init' | 'components'

function resolveInitBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: 5 + Math.max(initBlockMinSize.width, size.width),
    y: 5 + Math.max(initBlockMinSize.height, size.height) / 2,
  }
}

export default function WorkbenchCanvas({
  viewport,
  addNodeAnchor = null,
  selectedBlockId = null,
  onSelectedBlockChange,
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }
  const [startEndpointPosition, setStartEndpointPosition] = useState<WorkbenchPoint>({ x: 605.289, y: 469.289 })
  const [initBlockPosition, setInitBlockPosition] = useState<WorkbenchPoint>({ x: 829, y: 359 })
  const [initBlockSize, setInitBlockSize] = useState<WorkbenchSize>(initBlockMinSize)
  const [componentsBlockVisible, setComponentsBlockVisible] = useState(false)
  const [componentsBlockPosition, setComponentsBlockPosition] = useState<WorkbenchPoint>({ x: 1332, y: 342 })
  const [componentsBlockSize, setComponentsBlockSize] = useState<WorkbenchSize>(componentsBlockMinSize)
  const [addNodePopoverPosition, setAddNodePopoverPosition] = useState<WorkbenchPoint | null>(null)
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
    blockId: ResizableBlockId
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
    else if (blockId === 'components') setComponentsBlockPosition(position)
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

  const getBlockSize = (blockId: ResizableBlockId) => (
    blockId === 'init' ? initBlockSize : componentsBlockSize
  )

  const resizeBlock = (blockId: ResizableBlockId, size: WorkbenchSize) => {
    if (blockId === 'init') setInitBlockSize(size)
    else setComponentsBlockSize(size)
  }

  const getBlockMinSize = (blockId: ResizableBlockId) => (
    blockId === 'init' ? initBlockMinSize : componentsBlockMinSize
  )

  const startBlockResize = (blockId: ResizableBlockId, direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectedBlockChange?.(blockId)
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      blockId,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: getBlockSize(blockId),
    }
  }

  const moveBlockResize = (event: PointerEvent<SVGRectElement>) => {
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
    const minSize = getBlockMinSize(resize.blockId)
    resizeBlock(resize.blockId, {
      width: Math.max(minSize.width, nextWidth),
      height: Math.max(minSize.height, nextHeight),
    })
  }

  const stopBlockResize = (event: PointerEvent<SVGRectElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeRef.current = null
  }

  const createResizeHandlers = (blockId: ResizableBlockId) => ({
    onResizePointerDown: (direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => startBlockResize(blockId, direction, event),
    onResizePointerMove: moveBlockResize,
    onResizePointerUp: stopBlockResize,
    onResizePointerCancel: stopBlockResize,
  })

  const startEndpointOutput = {
    x: startEndpointPosition.x + startEndpointOutputOffset.x,
    y: startEndpointPosition.y + startEndpointOutputOffset.y,
  }
  const initBlockInput = {
    x: initBlockPosition.x + initBlockInputOffset.x,
    y: initBlockPosition.y + initBlockInputOffset.y,
  }
  const initBlockOutputOffset = resolveInitBlockOutputOffset(initBlockSize)
  const initBlockOutput = {
    x: initBlockPosition.x + initBlockOutputOffset.x,
    y: initBlockPosition.y + initBlockOutputOffset.y,
  }
  const componentsBlockInput = {
    x: componentsBlockPosition.x + componentsBlockInputOffset.x,
    y: componentsBlockPosition.y + componentsBlockInputOffset.y,
  }
  const componentsBlockOutputOffset = resolveComponentsBlockOutputOffset(componentsBlockSize)
  const componentsBlockOutput = {
    x: componentsBlockPosition.x + componentsBlockOutputOffset.x,
    y: componentsBlockPosition.y + componentsBlockOutputOffset.y,
  }

  const openAddNodePopover = (position: WorkbenchPoint) => {
    setAddNodePopoverPosition({
      x: position.x + 32,
      y: position.y - 42,
    })
  }

  useEffect(() => {
    if (!addNodeAnchor) return
    openAddNodePopover(addNodeAnchor.point)
  }, [addNodeAnchor])

  const addComponentsBlock = () => {
    setComponentsBlockVisible(true)
    onSelectedBlockChange?.('components')
    setAddNodePopoverPosition(null)
  }

  return (
    <div
      className="absolute left-0 top-0 z-0 h-[1920px] w-[1920px] origin-top-left"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        color: 'var(--dfw-text)',
        fontFamily: workbenchCanvasFont,
      }}
      onClick={() => {
        setAddNodePopoverPosition(null)
        onSelectedBlockChange?.(null)
      }}
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" className="block overflow-visible" style={{ fill: 'currentColor' }}>
        <CanvasConnectionLayer from={startEndpointOutput} to={initBlockInput} />
        {componentsBlockVisible && (
          <CanvasConnectionLayer from={initBlockOutput} to={componentsBlockInput} stroke="#22b386" />
        )}
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
          onAddConnectorClick={() => openAddNodePopover(initBlockOutput)}
          meta={meta}
          dragHandlers={createDragHandlers('init', initBlockPosition)}
          resizeHandlers={createResizeHandlers('init')}
        />
        {componentsBlockVisible && (
          <ComponentsBlock
            position={componentsBlockPosition}
            size={componentsBlockSize}
            selected={selectedBlockId === 'components'}
            onSelect={() => onSelectedBlockChange?.('components')}
            onAddConnectorClick={() => openAddNodePopover(componentsBlockOutput)}
            dragHandlers={createDragHandlers('components', componentsBlockPosition)}
            resizeHandlers={createResizeHandlers('components')}
          />
        )}
        {addNodePopoverPosition && (
          <AddNodePopover
            position={addNodePopoverPosition}
            componentsVisible={componentsBlockVisible}
            onAddComponents={addComponentsBlock}
            onClose={() => setAddNodePopoverPosition(null)}
          />
        )}
      </svg>
    </div>
  )
}
