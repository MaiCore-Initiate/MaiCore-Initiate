import { useEffect, useRef, useState, type PointerEvent } from 'react'
import AddNodePopover from './AddNodePopover'
import CanvasConnectionLayer from './CanvasConnectionLayer'
import ComponentBlock, { componentBlockInputOffset, componentBlockMinSize, resolveComponentBlockOutputOffset } from './blocks/ComponentBlock'
import ComponentsBlock, { componentsBlockInputOffset, componentsBlockMinSize, resolveComponentsBlockComponentOutputOffset, resolveComponentsBlockOutputOffset } from './blocks/ComponentsBlock'
import DeployBlock, { deployBlockInputOffset, deployBlockMinSize } from './blocks/DeployBlock'
import InitBlock from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import { workbenchCanvasFont, type WorkbenchBlockId, type WorkbenchBlockMeta, type WorkbenchCanvasProps, type WorkbenchComponentBlockId, type WorkbenchComponentMeta, type WorkbenchConnectionSource, type WorkbenchConnectorDragHandlers, type WorkbenchPoint, type WorkbenchResizeDirection, type WorkbenchSize, type WorkbenchVisibleBlocks } from './types'

const defaultComponentMeta: WorkbenchComponentMeta = {
  name: '',
  id: '',
  choose: null,
  runtime: '',
  commandTheme: 'classical',
  install: null,
  check: null,
  checkCommand: [],
  checkVersionContains: [],
  checkVersionRegex: [],
  commandInstall: null,
  installCommandList: [],
  getMethod: '',
  directLink: '',
  getVersion: '',
  githubRepo: '',
  versionFile: [],
  versionCustom: [],
  getLink: '',
  getLinkProvideList: [],
  linkFile: [],
  linkCustom: [],
  denoPermissions: [],
  jvm: [],
  userChoose: null,
  chooseList: [],
  formatVersion: null,
  versionFormattingFormula: [],
  installOperate: '',
  installCustomList: [],
  installPath: '',
  customPath: '',
  splicingLink: '',
  beforeCommand: null,
  beforeCommandList: [],
  afterCommand: null,
  afterCommandList: [],
  envOutput: null,
  envOutputList: [],
  envInput: null,
  envInputList: [],
}

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
  platforms: ['windows'],
  schemaVersion: '',
  componentsEnvOutput: null,
  componentsEnvInput: null,
  componentsList: [],
  components: [],
}

const initBlockInputOffset: WorkbenchPoint = { x: 5, y: 115.5 }
const startEndpointOutputOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }
const longPressMs = 220
const connectorLongPressMs = 180
const initBlockMinSize: WorkbenchSize = { width: 421, height: 431 }
const defaultVisibleBlocks: WorkbenchVisibleBlocks = { components: false, deploy: false, componentCount: 0 }
type DraggableBlockId = WorkbenchBlockId
type ResizableBlockId = Exclude<WorkbenchBlockId, 'start'>
type ConnectorEndpoint = 'components-input' | 'deploy-input' | `component-input:${number}`

type ConnectorDragState = {
  pointerId: number
  source: WorkbenchConnectionSource
  from: WorkbenchPoint
  current: WorkbenchPoint
  active: boolean
  timer: number
  mode: 'create' | 'detach'
  detachTarget?: ConnectorEndpoint
}

function resolveInitBlockOutputOffset(size: WorkbenchSize): WorkbenchPoint {
  return {
    x: 5 + Math.max(initBlockMinSize.width, size.width),
    y: 5 + Math.max(initBlockMinSize.height, size.height) / 2,
  }
}

function createComponentBlockId(index: number): WorkbenchComponentBlockId {
  return `component:${index}`
}

function parseComponentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('component:')) return null
  const index = Number(blockId.slice('component:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function createDefaultComponentPosition(index: number): WorkbenchPoint {
  return { x: 1810 + index * 72, y: 330 + index * 72 }
}

function resizeArray<T>(values: T[], length: number, createValue: (index: number) => T) {
  if (values.length === length) return values
  if (values.length > length) return values.slice(0, length)
  return [
    ...values,
    ...Array.from({ length: length - values.length }, (_, offset) => createValue(values.length + offset)),
  ]
}

function canvasPointFromEvent(event: PointerEvent<SVGGElement>, viewport: { scale: number; x: number; y: number }): WorkbenchPoint {
  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
  const scale = viewport.scale || 1
  const originX = rect?.left ?? 0
  const originY = rect?.top ?? 0
  return {
    x: (event.clientX - originX) / scale,
    y: (event.clientY - originY) / scale,
  }
}

export default function WorkbenchCanvas({
  viewport,
  addNodeAnchor = null,
  selectedBlockId = null,
  onSelectedBlockChange,
  visibleBlocks,
  onVisibleBlocksChange,
  blockMeta,
}: WorkbenchCanvasProps) {
  const meta = { ...defaultBlockMeta, ...blockMeta }
  const blockVisibility = { ...defaultVisibleBlocks, ...visibleBlocks }
  const [startEndpointPosition, setStartEndpointPosition] = useState<WorkbenchPoint>({ x: 605.289, y: 469.289 })
  const [initBlockPosition, setInitBlockPosition] = useState<WorkbenchPoint>({ x: 829, y: 359 })
  const [initBlockSize, setInitBlockSize] = useState<WorkbenchSize>(initBlockMinSize)
  const [componentsBlockPosition, setComponentsBlockPosition] = useState<WorkbenchPoint>({ x: 1332, y: 342 })
  const [componentsBlockSize, setComponentsBlockSize] = useState<WorkbenchSize>(componentsBlockMinSize)
  const [deployBlockPosition, setDeployBlockPosition] = useState<WorkbenchPoint>({ x: 1900, y: 342 })
  const [deployBlockSize, setDeployBlockSize] = useState<WorkbenchSize>(deployBlockMinSize)
  const [componentBlockPositions, setComponentBlockPositions] = useState<WorkbenchPoint[]>([])
  const [componentBlockSizes, setComponentBlockSizes] = useState<WorkbenchSize[]>([])
  const [componentConnections, setComponentConnections] = useState<boolean[]>([])
  const [componentsConnected, setComponentsConnected] = useState(false)
  const [deployConnected, setDeployConnected] = useState(false)
  const [addNodePopoverPosition, setAddNodePopoverPosition] = useState<WorkbenchPoint | null>(null)
  const [addNodePopoverSource, setAddNodePopoverSource] = useState<WorkbenchConnectionSource | null>(null)
  const [connectorDrag, setConnectorDrag] = useState<ConnectorDragState | null>(null)
  const connectorDragRef = useRef<ConnectorDragState | null>(null)
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

  const clearConnectorDragTimer = () => {
    if (!connectorDragRef.current) return
    window.clearTimeout(connectorDragRef.current.timer)
  }

  useEffect(() => {
    const count = Math.max(0, blockVisibility.componentCount)
    setComponentBlockPositions(current => resizeArray(current, count, createDefaultComponentPosition))
    setComponentBlockSizes(current => resizeArray(current, count, () => componentBlockMinSize))
    setComponentConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.componentCount])


  const setBlockPosition = (blockId: DraggableBlockId, position: WorkbenchPoint) => {
    const componentIndex = parseComponentBlockIndex(blockId)
    if (blockId === 'init') setInitBlockPosition(position)
    else if (blockId === 'components') setComponentsBlockPosition(position)
    else if (blockId === 'deploy') setDeployBlockPosition(position)
    else if (componentIndex !== null) {
      setComponentBlockPositions(current => current.map((item, index) => (index === componentIndex ? position : item)))
    }
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
    blockId === 'init'
      ? initBlockSize
      : blockId === 'components'
        ? componentsBlockSize
        : blockId === 'deploy'
          ? deployBlockSize
          : componentBlockSizes[parseComponentBlockIndex(blockId) ?? -1] ?? componentBlockMinSize
  )

  const resizeBlock = (blockId: ResizableBlockId, size: WorkbenchSize) => {
    const componentIndex = parseComponentBlockIndex(blockId)
    if (blockId === 'init') setInitBlockSize(size)
    else if (blockId === 'components') setComponentsBlockSize(size)
    else if (blockId === 'deploy') setDeployBlockSize(size)
    else if (componentIndex !== null) {
      setComponentBlockSizes(current => current.map((item, index) => (index === componentIndex ? size : item)))
    }
  }

  const getBlockMinSize = (blockId: ResizableBlockId) => (
    blockId === 'init'
      ? initBlockMinSize
      : blockId === 'components'
        ? componentsBlockMinSize
        : blockId === 'deploy'
          ? deployBlockMinSize
          : componentBlockMinSize
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
  const componentsDeployOutputOffset = resolveComponentsBlockOutputOffset(componentsBlockSize)
  const componentsDeployOutput = {
    x: componentsBlockPosition.x + componentsDeployOutputOffset.x,
    y: componentsBlockPosition.y + componentsDeployOutputOffset.y,
  }
  const componentsComponentOutputOffset = resolveComponentsBlockComponentOutputOffset(componentsBlockSize)
  const componentsComponentOutput = {
    x: componentsBlockPosition.x + componentsComponentOutputOffset.x,
    y: componentsBlockPosition.y + componentsComponentOutputOffset.y,
  }
  const deployBlockInput = {
    x: deployBlockPosition.x + deployBlockInputOffset.x,
    y: deployBlockPosition.y + deployBlockInputOffset.y,
  }
  const componentBlocks = Array.from({ length: blockVisibility.componentCount }, (_, index) => {
    const position = componentBlockPositions[index] ?? createDefaultComponentPosition(index)
    const size = componentBlockSizes[index] ?? componentBlockMinSize
    const input = {
      x: position.x + componentBlockInputOffset.x,
      y: position.y + componentBlockInputOffset.y,
    }
    const outputOffset = resolveComponentBlockOutputOffset(size)
    const output = {
      x: position.x + outputOffset.x,
      y: position.y + outputOffset.y,
    }
    return { index, blockId: createComponentBlockId(index), position, size, input, output, connected: componentConnections[index] ?? false } as const
  })

  const endpointTargets = [
    ...(blockVisibility.components ? [{ endpoint: 'components-input' as const, point: componentsBlockInput }] : []),
    ...(blockVisibility.deploy ? [{ endpoint: 'deploy-input' as const, point: deployBlockInput }] : []),
    ...componentBlocks.map(block => ({ endpoint: `component-input:${block.index}` as const, point: block.input })),
  ]

  const findConnectorTarget = (point: WorkbenchPoint, exclude?: ConnectorEndpoint) => {
    const threshold = 34
    return endpointTargets.find(target => {
      if (target.endpoint === exclude) return false
      return Math.hypot(point.x - target.point.x, point.y - target.point.y) <= threshold
    }) ?? null
  }

  const setConnectionForEndpoint = (endpoint: ConnectorEndpoint, connected: boolean) => {
    if (endpoint === 'components-input') setComponentsConnected(connected)
    else if (endpoint === 'deploy-input') setDeployConnected(connected)
    else {
      const index = Number(endpoint.slice('component-input:'.length))
      if (Number.isInteger(index)) {
        setComponentConnections(current => current.map((item, itemIndex) => (itemIndex === index ? connected : item)))
      }
    }
  }

  const connectTarget = (source: WorkbenchConnectionSource, endpoint: ConnectorEndpoint | null) => {
    if (source === 'init-components' && endpoint === 'components-input') {
      setComponentsConnected(true)
      return true
    }
    if (source === 'components-deploy' && endpoint === 'deploy-input') {
      setDeployConnected(true)
      return true
    }
    if (source === 'components-component' && endpoint?.startsWith('component-input:')) {
      const index = Number(endpoint.slice('component-input:'.length))
      if (Number.isInteger(index)) {
        setComponentConnections(current => current.map((item, itemIndex) => (itemIndex === index ? true : item)))
        return true
      }
    }
    return false
  }

  const sourcePoint = (source: WorkbenchConnectionSource) => {
    if (source === 'init-components') return initBlockOutput
    if (source === 'components-deploy') return componentsDeployOutput
    return componentsComponentOutput
  }

  const openAddNodePopover = (position: WorkbenchPoint, source: WorkbenchConnectionSource | null = null) => {
    setAddNodePopoverPosition({
      x: position.x + 32,
      y: position.y - 42,
    })
    setAddNodePopoverSource(source)
  }

  useEffect(() => {
    if (!addNodeAnchor) return
    openAddNodePopover(addNodeAnchor.point, addNodeAnchor.source ?? null)
  }, [addNodeAnchor])

  const addComponentsBlock = () => {
    onVisibleBlocksChange?.({ components: true })
    if (addNodePopoverSource === 'init-components') setComponentsConnected(true)
    onSelectedBlockChange?.('components')
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addDeployBlock = () => {
    onVisibleBlocksChange?.({ deploy: true })
    if (addNodePopoverSource === 'components-deploy') setDeployConnected(true)
    onSelectedBlockChange?.('deploy')
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addComponentBlock = () => {
    const nextIndex = blockVisibility.componentCount
    const position = addNodePopoverSource === 'components-component'
      ? { x: componentsComponentOutput.x - componentBlockInputOffset.x - 160, y: componentsComponentOutput.y + 110 }
      : createDefaultComponentPosition(nextIndex)
    setComponentBlockPositions(current => [...current, position])
    setComponentBlockSizes(current => [...current, componentBlockMinSize])
    setComponentConnections(current => [...current, addNodePopoverSource === 'components-component'])
    onVisibleBlocksChange?.({ componentCount: nextIndex + 1 })
    onSelectedBlockChange?.(createComponentBlockId(nextIndex))
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const startConnectorDrag = (source: WorkbenchConnectionSource, from: WorkbenchPoint, mode: 'create' | 'detach', event: PointerEvent<SVGGElement>, detachTarget?: ConnectorEndpoint) => {
    event.preventDefault()
    event.stopPropagation()
    const currentTarget = event.currentTarget
    currentTarget.setPointerCapture(event.pointerId)
    const state: ConnectorDragState = {
      pointerId: event.pointerId,
      source,
      from,
      current: canvasPointFromEvent(event, viewport),
      active: false,
      timer: window.setTimeout(() => {
        const current = connectorDragRef.current
        if (!current || current.pointerId !== event.pointerId) return
        const next = { ...current, active: true }
        connectorDragRef.current = next
        setConnectorDrag(next)
      }, connectorLongPressMs),
      mode,
      detachTarget,
    }
    connectorDragRef.current = state
    setConnectorDrag(state)
  }

  const moveConnectorDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = connectorDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const next = { ...drag, current: canvasPointFromEvent(event, viewport) }
    connectorDragRef.current = next
    setConnectorDrag(next)
  }

  const stopConnectorDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = connectorDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    clearConnectorDragTimer()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (drag.active) {
      const target = findConnectorTarget(drag.current, drag.detachTarget)
      if (drag.mode === 'detach') {
        if (!target) {
          setConnectionForEndpoint(drag.detachTarget!, false)
        } else if (target.endpoint !== drag.detachTarget && connectTarget(drag.source, target.endpoint)) {
          setConnectionForEndpoint(drag.detachTarget!, false)
        }
      } else if (target) {
        connectTarget(drag.source, target.endpoint)
      } else {
        openAddNodePopover(drag.current, drag.source)
      }
    } else if (drag.mode === 'create') {
      openAddNodePopover(sourcePoint(drag.source), drag.source)
    }

    connectorDragRef.current = null
    setConnectorDrag(null)
  }

  const createConnectorDragHandlers = (source: WorkbenchConnectionSource, from: WorkbenchPoint): WorkbenchConnectorDragHandlers => ({
    onConnectorPointerDown: (event: PointerEvent<SVGGElement>) => startConnectorDrag(source, from, 'create', event),
    onConnectorPointerMove: moveConnectorDrag,
    onConnectorPointerUp: stopConnectorDrag,
    onConnectorPointerCancel: stopConnectorDrag,
  })

  const createDetachDragHandlers = (source: WorkbenchConnectionSource, from: WorkbenchPoint, target: ConnectorEndpoint): WorkbenchConnectorDragHandlers => ({
    onConnectorPointerDown: (event: PointerEvent<SVGGElement>) => startConnectorDrag(source, from, 'detach', event, target),
    onConnectorPointerMove: moveConnectorDrag,
    onConnectorPointerUp: stopConnectorDrag,
    onConnectorPointerCancel: stopConnectorDrag,
  })

  const addNodePopoverScreenPosition = addNodePopoverPosition
    ? {
      x: viewport.x + addNodePopoverPosition.x * viewport.scale,
      y: viewport.y + addNodePopoverPosition.y * viewport.scale,
    }
    : null

  return (
    <>
      <div
        className="absolute left-0 top-0 z-0 h-[1920px] w-[1920px] origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          color: 'var(--dfw-text)',
          fontFamily: workbenchCanvasFont,
        }}
        onClick={() => {
          setAddNodePopoverPosition(null)
          setAddNodePopoverSource(null)
          onSelectedBlockChange?.(null)
        }}
      >
        <svg
          width="1920"
          height="1080"
          viewBox="0 0 1920 1080"
          className="block select-none overflow-visible"
          style={{ fill: 'currentColor', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <CanvasConnectionLayer from={startEndpointOutput} to={initBlockInput} />
          {blockVisibility.components && componentsConnected && (
            <CanvasConnectionLayer from={initBlockOutput} to={componentsBlockInput} stroke="#22b386" />
          )}
          {blockVisibility.deploy && deployConnected && (
            <CanvasConnectionLayer from={componentsDeployOutput} to={deployBlockInput} stroke="#d97706" />
          )}
          {componentBlocks.filter(block => block.connected).map(block => (
            <CanvasConnectionLayer
              key={`component-line-${block.index}`}
              from={componentsComponentOutput}
              to={block.input}
              stroke="#22b386"
            />
          ))}
          {connectorDrag?.active && (
            <CanvasConnectionLayer from={connectorDrag.from} to={connectorDrag.current} stroke="#0084ff" arrow />
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
            onAddConnectorClick={() => openAddNodePopover(initBlockOutput, 'init-components')}
            meta={meta}
            dragHandlers={createDragHandlers('init', initBlockPosition)}
            resizeHandlers={createResizeHandlers('init')}
            connectorDragHandlers={createConnectorDragHandlers('init-components', initBlockOutput)}
          />
          {blockVisibility.components && (
            <ComponentsBlock
              position={componentsBlockPosition}
              size={componentsBlockSize}
              selected={selectedBlockId === 'components'}
              onSelect={() => onSelectedBlockChange?.('components')}
              onDeployConnectorClick={() => openAddNodePopover(componentsDeployOutput, 'components-deploy')}
              onComponentConnectorClick={() => openAddNodePopover(componentsComponentOutput, 'components-component')}
              componentsEnvOutput={meta.componentsEnvOutput}
              componentsEnvInput={meta.componentsEnvInput}
              componentsList={meta.componentsList}
              dragHandlers={createDragHandlers('components', componentsBlockPosition)}
              resizeHandlers={createResizeHandlers('components')}
              inputDragHandlers={componentsConnected ? createDetachDragHandlers('init-components', initBlockOutput, 'components-input') : undefined}
              deployConnectorDragHandlers={createConnectorDragHandlers('components-deploy', componentsDeployOutput)}
              componentConnectorDragHandlers={createConnectorDragHandlers('components-component', componentsComponentOutput)}
            />
          )}
          {blockVisibility.deploy && (
            <DeployBlock
              position={deployBlockPosition}
              size={deployBlockSize}
              selected={selectedBlockId === 'deploy'}
              onSelect={() => onSelectedBlockChange?.('deploy')}
              dragHandlers={createDragHandlers('deploy', deployBlockPosition)}
              resizeHandlers={createResizeHandlers('deploy')}
              inputDragHandlers={deployConnected ? createDetachDragHandlers('components-deploy', componentsDeployOutput, 'deploy-input') : undefined}
            />
          )}
          {componentBlocks.map(block => (
            <ComponentBlock
              key={block.blockId}
              blockIndex={block.index}
              position={block.position}
              size={block.size}
              selected={selectedBlockId === block.blockId}
              onSelect={() => onSelectedBlockChange?.(block.blockId)}
              onAddConnectorClick={() => openAddNodePopover(block.output)}
              component={meta.components[block.index] ?? defaultComponentMeta}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
              inputDragHandlers={block.connected ? createDetachDragHandlers('components-component', componentsComponentOutput, `component-input:${block.index}`) : undefined}
            />
          ))}
        </svg>
      </div>
      {addNodePopoverScreenPosition && (
        <>
          <button
            data-workbench-ui
            type="button"
            className="absolute inset-0 z-[9] cursor-default bg-transparent outline-none"
            onClick={event => {
              event.stopPropagation()
              setAddNodePopoverPosition(null)
              setAddNodePopoverSource(null)
            }}
            onPointerDown={event => event.stopPropagation()}
            aria-label="关闭添加节点菜单"
          />
          <AddNodePopover
            position={addNodePopoverScreenPosition}
            componentsVisible={blockVisibility.components}
            deployVisible={blockVisibility.deploy}
            source={addNodePopoverSource}
            onAddComponents={addComponentsBlock}
            onAddDeploy={addDeployBlock}
            onAddComponent={addComponentBlock}
            onClose={() => {
              setAddNodePopoverPosition(null)
              setAddNodePopoverSource(null)
            }}
          />
        </>
      )}
    </>
  )
}