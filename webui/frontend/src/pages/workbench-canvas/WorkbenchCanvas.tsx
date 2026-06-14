import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import AddNodePopover from './AddNodePopover'
import CanvasConnectionLayer from './CanvasConnectionLayer'
import ComponentBlock, { componentBlockInputOffset, componentBlockMinSize, resolveComponentBlockOutputOffset } from './blocks/ComponentBlock'
import ComponentsBlock, { componentsBlockInputOffset, componentsBlockMinSize, resolveComponentsBlockComponentOutputOffset, resolveComponentsBlockOutputOffset } from './blocks/ComponentsBlock'
import ConfigBlock, { configBlockInputOffset, configBlockMinSize, resolveConfigBlockItemOutputOffset, resolveConfigBlockOutputOffset } from './blocks/ConfigBlock'
import ConfigItemBlock, { configItemBlockInputOffset, configItemBlockMinSize, resolveConfigItemBlockOutputOffset } from './blocks/ConfigItemBlock'
import DeployBlock, { deployBlockInputOffset, deployBlockMinSize, resolveDeployBlockConfigOutputOffset, resolveDeployBlockOutputOffset } from './blocks/DeployBlock'
import FileBlock, { fileBlockMinSize, resolveFileBlockOutputOffset } from './blocks/FileBlock'
import LaunchBlock, { launchBlockInputOffset, launchBlockMinSize, resolveLaunchBlockItemOutputOffset, resolveLaunchBlockOutputOffset } from './blocks/LaunchBlock'
import LaunchItemBlock, { launchItemBlockInputOffset, launchItemBlockMinSize, resolveLaunchItemBlockOutputOffset } from './blocks/LaunchItemBlock'
import UninstallBlock, { uninstallBlockInputOffset, uninstallBlockMinSize, resolveUninstallBlockItemOutputOffset } from './blocks/UninstallBlock'
import UninstallItemBlock, { uninstallItemBlockInputOffset, uninstallItemBlockMinSize, resolveUninstallItemBlockOutputOffset } from './blocks/UninstallItemBlock'
import DeploymentBlock, { deploymentBlockInputOffset, deploymentBlockMinSize, resolveDeploymentBlockOutputOffset } from './blocks/DeploymentBlock'
import InitBlock, { resolveInitBlockFileInputOffset } from './blocks/InitBlock'
import StartEndpointBlock from './blocks/StartEndpointBlock'
import FileConflictDialog, { type FileConflictResolution } from '../../components/FileConflictDialog'
import NewFileDialog from '../../components/NewFileDialog'
import { WORKBENCH_FILE_EXTENSIONS, createFileBlockId, parseFileBlockId, workbenchCanvasFont, type WorkbenchBlockId, type WorkbenchBlockMeta, type WorkbenchCanvasProps, type WorkbenchComponentBlockId, type WorkbenchComponentMeta, type WorkbenchConfigItemBlockId, type WorkbenchConfigItemMeta, type WorkbenchConnectionSource, type WorkbenchDeploymentBlockId, type WorkbenchDeploymentMeta, type WorkbenchFileMeta, type WorkbenchLaunchItemBlockId, type WorkbenchLaunchItemMeta, type WorkbenchPoint, type WorkbenchResizeDirection, type WorkbenchSize, type WorkbenchUninstallItemBlockId, type WorkbenchUninstallItemMeta, type WorkbenchVisibleBlocks } from './types'

const defaultComponentMeta: WorkbenchComponentMeta = {
  name: '',
  id: '',
  choose: false,
  runtime: '',
  commandTheme: 'classical',
  install: false,
  check: false,
  checkCommand: [],
  checkVersionContains: [],
  checkVersionRegex: [],
  commandInstall: false,
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
  userChoose: false,
  chooseList: [],
  formatVersion: false,
  versionFormattingFormula: [],
  installOperate: '',
  installCustomList: [],
  installPath: '',
  customPath: '',
  splicingLink: '',
  beforeCommand: false,
  beforeCommandList: [],
  afterCommand: false,
  afterCommandList: [],
  envOutput: false,
  envOutputList: [],
  envInput: false,
  envInputList: [],
}

const defaultDeploymentMeta: WorkbenchDeploymentMeta = {
  name: '',
  id: '',
  choose: false,
  runtime: '',
  commandTheme: 'classical',
  deploy: false,
  commandDeploy: false,
  deployCommandList: [],
  deployMethod: '',
  baseLink: '',
  getMethod: '',
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
  userChoose: false,
  chooseList: [],
  formatVersion: false,
  versionFormattingFormula: [],
  deployPath: '',
  customPath: '',
  beforeCommand: false,
  beforeCommandList: [],
  afterCommand: false,
  afterCommandList: [],
  splicingLink: '',
  envOutput: false,
  envOutputList: [],
  envInput: false,
  envInputList: [],
}

const defaultConfigItemMeta: WorkbenchConfigItemMeta = {
  id: '',
  name: '',
  runtime: '',
  commandTheme: 'classical',
  filePath: '',
  choose: false,
  envInput: false,
  envInputList: [],
}

const defaultLaunchItemMeta: WorkbenchLaunchItemMeta = {
  id: '',
  name: '',
  choose: false,
  runtime: '',
  commandTheme: 'classical',
  launch: false,
  launchCommand: [],
  envInput: false,
  envInputList: [],
  envOutput: false,
  envOutputList: [],
}

const defaultUninstallItemMeta: WorkbenchUninstallItemMeta = {
  id: '',
  name: '',
  choose: false,
  runtime: '',
  commandTheme: 'classical',
  uninstall: false,
  stopBeforeUninstall: false,
  stopCommandList: [],
  removeInstanceConfig: false,
  removeRuntimeFiles: false,
  removeDeployRoot: false,
  removeComponent: false,
  deploymentTargets: [],
  componentTargets: [],
  beforeCommand: false,
  beforeCommandList: [],
  afterCommand: false,
  afterCommandList: [],
  envInput: false,
  envInputList: [],
  envOutput: false,
  envOutputList: [],
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
  fileImport: false,
  fileImportList: [],
  runtime: 'powershell',
  denoNet: false,
  denoRead: false,
  denoWrite: false,
  denoEnv: false,
  denoRun: false,
  denoHrtime: false,
  denoFfi: false,
  denoSys: false,
  denoAll: false,
  denoCustomPermissions: false,
  denoPermissionList: [],
  platforms: ['windows'],
  schemaVersion: '',
  componentsEnvOutput: false,
  componentsEnvInput: false,
  componentsList: [],
  components: [],
  deployEnvOutput: false,
  deployEnvInput: false,
  deployList: [],
  deployments: [],
  configEnvOutput: false,
  configEnvInput: false,
  configList: [],
  configItems: [],
  launchEnvOutput: false,
  launchEnvInput: false,
  launchList: [],
  launchItems: [],
  uninstallEnvOutput: false,
  uninstallEnvInput: false,
  uninstallList: [],
  uninstallItems: [],
  files: [],
}

const initBlockInputOffset: WorkbenchPoint = { x: 5, y: 115.5 }
const startEndpointOutputOffset: WorkbenchPoint = { x: 95.711, y: 70.711 }
const longPressMs = 220
const initBlockMinSize: WorkbenchSize = { width: 421, height: 431 }
const defaultVisibleBlocks: WorkbenchVisibleBlocks = { components: false, deploy: false, config: false, launch: false, uninstall: false, componentCount: 0, deploymentCount: 0, configItemCount: 0, launchItemCount: 0, uninstallItemCount: 0 }
type DraggableBlockId = WorkbenchBlockId
type ResizableBlockId = Exclude<WorkbenchBlockId, 'start'>
type ManualConnection = { id: string; from: WorkbenchBlockId; to: WorkbenchBlockId }
type DraggingConnection = {
  sourceBlockId: WorkbenchBlockId
  sourcePoint: WorkbenchPoint
  targetBlockId: WorkbenchBlockId
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

function createDeploymentBlockId(index: number): WorkbenchDeploymentBlockId {
  return `deployment:${index}`
}

function createConfigItemBlockId(index: number): WorkbenchConfigItemBlockId {
  return `config-item:${index}`
}

function createLaunchItemBlockId(index: number): WorkbenchLaunchItemBlockId {
  return `launch-item:${index}`
}

function createUninstallItemBlockId(index: number): WorkbenchUninstallItemBlockId {
  return `uninstall-item:${index}`
}

function parseComponentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('component:')) return null
  const index = Number(blockId.slice('component:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function parseDeploymentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('deployment:')) return null
  const index = Number(blockId.slice('deployment:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function parseConfigItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('config-item:')) return null
  const index = Number(blockId.slice('config-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function parseLaunchItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('launch-item:')) return null
  const index = Number(blockId.slice('launch-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function parseUninstallItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('uninstall-item:')) return null
  const index = Number(blockId.slice('uninstall-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function createDefaultComponentPosition(index: number): WorkbenchPoint {
  return { x: 1810 + index * 72, y: 330 + index * 72 }
}

function createDefaultDeploymentPosition(index: number): WorkbenchPoint {
  return { x: 2440 + index * 72, y: 330 + index * 72 }
}

function createDefaultConfigItemPosition(index: number): WorkbenchPoint {
  return { x: 3070 + index * 72, y: 330 + index * 72 }
}

function createDefaultLaunchItemPosition(index: number): WorkbenchPoint {
  return { x: 3700 + index * 72, y: 330 + index * 72 }
}

function createDefaultUninstallItemPosition(index: number): WorkbenchPoint {
  return { x: 4330 + index * 72, y: 330 + index * 72 }
}

function resizeArray<T>(values: T[], length: number, createValue: (index: number) => T) {
  if (values.length === length) return values
  if (values.length > length) return values.slice(0, length)
  return [
    ...values,
    ...Array.from({ length: length - values.length }, (_, offset) => createValue(values.length + offset)),
  ]
}

function removeArrayItem<T>(values: T[], indexToRemove: number) {
  return values.filter((_, index) => index !== indexToRemove)
}

function remapIndexedBlockId(blockId: WorkbenchBlockId, prefix: 'component' | 'deployment' | 'config-item' | 'launch-item' | 'uninstall-item', removedIndex: number) {
  const index = prefix === 'component'
    ? parseComponentBlockIndex(blockId)
    : prefix === 'deployment'
      ? parseDeploymentBlockIndex(blockId)
      : prefix === 'config-item'
        ? parseConfigItemBlockIndex(blockId)
        : prefix === 'launch-item'
          ? parseLaunchItemBlockIndex(blockId)
          : parseUninstallItemBlockIndex(blockId)
  if (index === null) return blockId
  if (index === removedIndex) return null
  return `${prefix}:${index > removedIndex ? index - 1 : index}` as WorkbenchBlockId
}

function areFilesEqual(left: WorkbenchFileMeta[], right: WorkbenchFileMeta[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return other
      && item.id === other.id
      && item.name === other.name
      && item.path === other.path
      && item.size === other.size
      && item.modifiedAt === other.modifiedAt
      && item.binary === other.binary
      && item.language === other.language
  })
}

function isFileConnectionSource(blockId: WorkbenchBlockId) {
  return parseFileBlockId(blockId) !== null
}


export default function WorkbenchCanvas({
  viewport,
  addNodeAnchor = null,
  selectedBlockId = null,
  onSelectedBlockChange,
  visibleBlocks,
  onVisibleBlocksChange,
  blockMeta,
  onBlockMetaPatch,
  onOpenFileEditor,
  projectSequence = null,
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
  const [configBlockPosition, setConfigBlockPosition] = useState<WorkbenchPoint>({ x: 2468, y: 342 })
  const [configBlockSize, setConfigBlockSize] = useState<WorkbenchSize>(configBlockMinSize)
  const [launchBlockPosition, setLaunchBlockPosition] = useState<WorkbenchPoint>({ x: 3036, y: 342 })
  const [launchBlockSize, setLaunchBlockSize] = useState<WorkbenchSize>(launchBlockMinSize)
  const [uninstallBlockPosition, setUninstallBlockPosition] = useState<WorkbenchPoint>({ x: 3604, y: 342 })
  const [uninstallBlockSize, setUninstallBlockSize] = useState<WorkbenchSize>(uninstallBlockMinSize)
  const [componentBlockPositions, setComponentBlockPositions] = useState<WorkbenchPoint[]>([])
  const [componentBlockSizes, setComponentBlockSizes] = useState<WorkbenchSize[]>([])
  const [componentConnections, setComponentConnections] = useState<boolean[]>([])
  const [deploymentBlockPositions, setDeploymentBlockPositions] = useState<WorkbenchPoint[]>([])
  const [deploymentBlockSizes, setDeploymentBlockSizes] = useState<WorkbenchSize[]>([])
  const [deploymentConnections, setDeploymentConnections] = useState<boolean[]>([])
  const [configItemBlockPositions, setConfigItemBlockPositions] = useState<WorkbenchPoint[]>([])
  const [configItemBlockSizes, setConfigItemBlockSizes] = useState<WorkbenchSize[]>([])
  const [configItemConnections, setConfigItemConnections] = useState<boolean[]>([])
  const [launchItemBlockPositions, setLaunchItemBlockPositions] = useState<WorkbenchPoint[]>([])
  const [launchItemBlockSizes, setLaunchItemBlockSizes] = useState<WorkbenchSize[]>([])
  const [launchItemConnections, setLaunchItemConnections] = useState<boolean[]>([])
  const [uninstallItemBlockPositions, setUninstallItemBlockPositions] = useState<WorkbenchPoint[]>([])
  const [uninstallItemBlockSizes, setUninstallItemBlockSizes] = useState<WorkbenchSize[]>([])
  const [uninstallItemConnections, setUninstallItemConnections] = useState<boolean[]>([])
  const [fileBlockPositions, setFileBlockPositions] = useState<Record<string, WorkbenchPoint>>({})
  const [fileBlockSizes, setFileBlockSizes] = useState<Record<string, WorkbenchSize>>({})
  const [componentsConnected, setComponentsConnected] = useState(false)
  const [deployConnected, setDeployConnected] = useState(false)
  const [configConnected, setConfigConnected] = useState(false)
  const [launchConnected, setLaunchConnected] = useState(false)
  const [uninstallConnected, setUninstallConnected] = useState(false)
  const [addNodePopoverPosition, setAddNodePopoverPosition] = useState<WorkbenchPoint | null>(null)
  const [addNodePopoverSource, setAddNodePopoverSource] = useState<WorkbenchConnectionSource | null>(null)
  const [linkSourceBlockId, setLinkSourceBlockId] = useState<WorkbenchBlockId | null>(null)
  const [manualConnections, setManualConnections] = useState<ManualConnection[]>([])
  const [dragConnector, setDragConnector] = useState<{
    source: WorkbenchConnectionSource
    from: WorkbenchPoint
    fromBlockId: WorkbenchBlockId
  } | null>(null)
  const [dragCursor, setDragCursor] = useState<WorkbenchPoint | null>(null)
  const [hoveredDropBlockId, setHoveredDropBlockId] = useState<WorkbenchBlockId | null>(null)
  const [draggingConnection, setDraggingConnection] = useState<DraggingConnection | null>(null)
  const [pendingFileConflict, setPendingFileConflict] = useState<{
    file: File
    suggestedName: string
  } | null>(null)
  const [fileImportError, setFileImportError] = useState<string | null>(null)
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false)
  const [newFileSubmitting, setNewFileSubmitting] = useState(false)
  const [newFileError, setNewFileError] = useState<string | null>(null)
  const [newFileConflict, setNewFileConflict] = useState<{
    name: string
    suggestedName: string
    payload: { name: string; content: string }
  } | null>(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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


  useEffect(() => {
    const count = Math.max(0, blockVisibility.componentCount)
    setComponentBlockPositions(current => resizeArray(current, count, createDefaultComponentPosition))
    setComponentBlockSizes(current => resizeArray(current, count, () => componentBlockMinSize))
    setComponentConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.componentCount])

  useEffect(() => {
    const count = Math.max(0, blockVisibility.deploymentCount)
    setDeploymentBlockPositions(current => resizeArray(current, count, createDefaultDeploymentPosition))
    setDeploymentBlockSizes(current => resizeArray(current, count, () => deploymentBlockMinSize))
    setDeploymentConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.deploymentCount])

  useEffect(() => {
    const count = Math.max(0, blockVisibility.configItemCount)
    setConfigItemBlockPositions(current => resizeArray(current, count, createDefaultConfigItemPosition))
    setConfigItemBlockSizes(current => resizeArray(current, count, () => configItemBlockMinSize))
    setConfigItemConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.configItemCount])

  useEffect(() => {
    const count = Math.max(0, blockVisibility.launchItemCount)
    setLaunchItemBlockPositions(current => resizeArray(current, count, createDefaultLaunchItemPosition))
    setLaunchItemBlockSizes(current => resizeArray(current, count, () => launchItemBlockMinSize))
    setLaunchItemConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.launchItemCount])

  useEffect(() => {
    const count = Math.max(0, blockVisibility.uninstallItemCount)
    setUninstallItemBlockPositions(current => resizeArray(current, count, createDefaultUninstallItemPosition))
    setUninstallItemBlockSizes(current => resizeArray(current, count, () => uninstallItemBlockMinSize))
    setUninstallItemConnections(current => resizeArray(current, count, () => false))
  }, [blockVisibility.uninstallItemCount])


  const setBlockPosition = (blockId: DraggableBlockId, position: WorkbenchPoint) => {
    const componentIndex = parseComponentBlockIndex(blockId)
    const deploymentIndex = parseDeploymentBlockIndex(blockId)
    const configItemIndex = parseConfigItemBlockIndex(blockId)
    const launchItemIndex = parseLaunchItemBlockIndex(blockId)
    const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
    const fileId = parseFileBlockId(blockId)
    if (blockId === 'init') setInitBlockPosition(position)
    else if (blockId === 'components') setComponentsBlockPosition(position)
    else if (blockId === 'deploy') setDeployBlockPosition(position)
    else if (blockId === 'config') setConfigBlockPosition(position)
    else if (blockId === 'launch') setLaunchBlockPosition(position)
    else if (blockId === 'uninstall') setUninstallBlockPosition(position)
    else if (componentIndex !== null) {
      setComponentBlockPositions(current => current.map((item, index) => (index === componentIndex ? position : item)))
    } else if (deploymentIndex !== null) {
      setDeploymentBlockPositions(current => current.map((item, index) => (index === deploymentIndex ? position : item)))
    } else if (configItemIndex !== null) {
      setConfigItemBlockPositions(current => current.map((item, index) => (index === configItemIndex ? position : item)))
    } else if (launchItemIndex !== null) {
      setLaunchItemBlockPositions(current => current.map((item, index) => (index === launchItemIndex ? position : item)))
    } else if (uninstallItemIndex !== null) {
      setUninstallItemBlockPositions(current => current.map((item, index) => (index === uninstallItemIndex ? position : item)))
    } else if (fileId !== null) {
      setFileBlockPositions(current => ({ ...current, [fileId]: position }))
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
    onHeaderDoubleClick: (event: MouseEvent<SVGGElement>) => handleHeaderDoubleClick(blockId, event),
  })

  const getBlockSize = (blockId: ResizableBlockId) => (
    blockId === 'init'
      ? initBlockSize
      : blockId === 'components'
        ? componentsBlockSize
        : blockId === 'deploy'
          ? deployBlockSize
          : blockId === 'config'
            ? configBlockSize
            : blockId === 'launch'
              ? launchBlockSize
              : blockId === 'uninstall'
                ? uninstallBlockSize
                : parseComponentBlockIndex(blockId) !== null
                  ? componentBlockSizes[parseComponentBlockIndex(blockId) ?? -1] ?? componentBlockMinSize
                  : parseDeploymentBlockIndex(blockId) !== null
                    ? deploymentBlockSizes[parseDeploymentBlockIndex(blockId) ?? -1] ?? deploymentBlockMinSize
                    : parseConfigItemBlockIndex(blockId) !== null
                      ? configItemBlockSizes[parseConfigItemBlockIndex(blockId) ?? -1] ?? configItemBlockMinSize
                      : parseLaunchItemBlockIndex(blockId) !== null
                        ? launchItemBlockSizes[parseLaunchItemBlockIndex(blockId) ?? -1] ?? launchItemBlockMinSize
                        : parseFileBlockId(blockId) !== null
                          ? fileBlockSizes[parseFileBlockId(blockId) ?? ''] ?? fileBlockMinSize
                          : uninstallItemBlockSizes[parseUninstallItemBlockIndex(blockId) ?? -1] ?? uninstallItemBlockMinSize
  )

  const resizeBlock = (blockId: ResizableBlockId, size: WorkbenchSize) => {
    const componentIndex = parseComponentBlockIndex(blockId)
    const deploymentIndex = parseDeploymentBlockIndex(blockId)
    const configItemIndex = parseConfigItemBlockIndex(blockId)
    const launchItemIndex = parseLaunchItemBlockIndex(blockId)
    const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
    if (blockId === 'init') setInitBlockSize(size)
    else if (blockId === 'components') setComponentsBlockSize(size)
    else if (blockId === 'deploy') setDeployBlockSize(size)
    else if (blockId === 'config') setConfigBlockSize(size)
    else if (blockId === 'launch') setLaunchBlockSize(size)
    else if (blockId === 'uninstall') setUninstallBlockSize(size)
    else if (componentIndex !== null) {
      setComponentBlockSizes(current => current.map((item, index) => (index === componentIndex ? size : item)))
    } else if (deploymentIndex !== null) {
      setDeploymentBlockSizes(current => current.map((item, index) => (index === deploymentIndex ? size : item)))
    } else if (configItemIndex !== null) {
      setConfigItemBlockSizes(current => current.map((item, index) => (index === configItemIndex ? size : item)))
    } else if (launchItemIndex !== null) {
      setLaunchItemBlockSizes(current => current.map((item, index) => (index === launchItemIndex ? size : item)))
    } else if (uninstallItemIndex !== null) {
      setUninstallItemBlockSizes(current => current.map((item, index) => (index === uninstallItemIndex ? size : item)))
    }
  }

  const getBlockMinSize = (blockId: ResizableBlockId) => (
    blockId === 'init'
      ? initBlockMinSize
      : blockId === 'components'
        ? componentsBlockMinSize
        : blockId === 'deploy'
          ? deployBlockMinSize
          : blockId === 'config'
            ? configBlockMinSize
            : blockId === 'launch'
              ? launchBlockMinSize
              : blockId === 'uninstall'
                ? uninstallBlockMinSize
                : parseComponentBlockIndex(blockId) !== null
                  ? componentBlockMinSize
                  : parseDeploymentBlockIndex(blockId) !== null
                    ? deploymentBlockMinSize
                    : parseConfigItemBlockIndex(blockId) !== null
                      ? configItemBlockMinSize
                      : parseLaunchItemBlockIndex(blockId) !== null
                        ? launchItemBlockMinSize
                        : uninstallItemBlockMinSize
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
  const initBlockFileInputOffset = resolveInitBlockFileInputOffset(initBlockSize)
  const initBlockFileInput = {
    x: initBlockPosition.x + initBlockFileInputOffset.x,
    y: initBlockPosition.y + initBlockFileInputOffset.y,
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
  const deployBlockOutputOffset = resolveDeployBlockOutputOffset(deployBlockSize)
  const deployBlockOutput = {
    x: deployBlockPosition.x + deployBlockOutputOffset.x,
    y: deployBlockPosition.y + deployBlockOutputOffset.y,
  }
  const deployConfigOutputOffset = resolveDeployBlockConfigOutputOffset(deployBlockSize)
  const deployConfigOutput = {
    x: deployBlockPosition.x + deployConfigOutputOffset.x,
    y: deployBlockPosition.y + deployConfigOutputOffset.y,
  }
  const configBlockInput = {
    x: configBlockPosition.x + configBlockInputOffset.x,
    y: configBlockPosition.y + configBlockInputOffset.y,
  }
  const configBlockOutputOffsetResolved = resolveConfigBlockOutputOffset(configBlockSize)
  const configBlockOutput = {
    x: configBlockPosition.x + configBlockOutputOffsetResolved.x,
    y: configBlockPosition.y + configBlockOutputOffsetResolved.y,
  }
  const configItemOutputOffset = resolveConfigBlockItemOutputOffset(configBlockSize)
  const configItemBlockOutput = {
    x: configBlockPosition.x + configItemOutputOffset.x,
    y: configBlockPosition.y + configItemOutputOffset.y,
  }
  const launchBlockInput = {
    x: launchBlockPosition.x + launchBlockInputOffset.x,
    y: launchBlockPosition.y + launchBlockInputOffset.y,
  }
  const launchBlockOutputOffset = resolveLaunchBlockOutputOffset(launchBlockSize)
  const launchBlockOutput = {
    x: launchBlockPosition.x + launchBlockOutputOffset.x,
    y: launchBlockPosition.y + launchBlockOutputOffset.y,
  }
  const launchItemOutputOffset = resolveLaunchBlockItemOutputOffset(launchBlockSize)
  const launchItemBlockOutput = {
    x: launchBlockPosition.x + launchItemOutputOffset.x,
    y: launchBlockPosition.y + launchItemOutputOffset.y,
  }
  const uninstallBlockInput = {
    x: uninstallBlockPosition.x + uninstallBlockInputOffset.x,
    y: uninstallBlockPosition.y + uninstallBlockInputOffset.y,
  }
  const uninstallItemOutputOffset = resolveUninstallBlockItemOutputOffset(uninstallBlockSize)
  const uninstallItemBlockOutput = {
    x: uninstallBlockPosition.x + uninstallItemOutputOffset.x,
    y: uninstallBlockPosition.y + uninstallItemOutputOffset.y,
  }
  const fileBlocks = meta.files.map((file, index) => {
    const blockId = createFileBlockId(file.id)
    const position = fileBlockPositions[file.id] ?? defaultFilePosition(index)
    const size = fileBlockSizes[file.id] ?? fileBlockMinSize
    const outputOffset = resolveFileBlockOutputOffset(size)
    const output = {
      x: position.x + outputOffset.x,
      y: position.y + outputOffset.y,
    }
    return { file, index, blockId, position, size, output } as const
  })
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
  const deploymentBlocks = Array.from({ length: blockVisibility.deploymentCount }, (_, index) => {
    const position = deploymentBlockPositions[index] ?? createDefaultDeploymentPosition(index)
    const size = deploymentBlockSizes[index] ?? deploymentBlockMinSize
    const input = {
      x: position.x + deploymentBlockInputOffset.x,
      y: position.y + deploymentBlockInputOffset.y,
    }
    const outputOffset = resolveDeploymentBlockOutputOffset(size)
    const output = {
      x: position.x + outputOffset.x,
      y: position.y + outputOffset.y,
    }
    return { index, blockId: createDeploymentBlockId(index), position, size, input, output, connected: deploymentConnections[index] ?? false } as const
  })
  const configItemBlocks = Array.from({ length: blockVisibility.configItemCount }, (_, index) => {
    const position = configItemBlockPositions[index] ?? createDefaultConfigItemPosition(index)
    const size = configItemBlockSizes[index] ?? configItemBlockMinSize
    const input = {
      x: position.x + configItemBlockInputOffset.x,
      y: position.y + configItemBlockInputOffset.y,
    }
    const itemOutputOffset = resolveConfigItemBlockOutputOffset(size)
    const output = {
      x: position.x + itemOutputOffset.x,
      y: position.y + itemOutputOffset.y,
    }
    return { index, blockId: createConfigItemBlockId(index), position, size, input, output, connected: configItemConnections[index] ?? false } as const
  })
  const launchItemBlocks = Array.from({ length: blockVisibility.launchItemCount }, (_, index) => {
    const position = launchItemBlockPositions[index] ?? createDefaultLaunchItemPosition(index)
    const size = launchItemBlockSizes[index] ?? launchItemBlockMinSize
    const input = {
      x: position.x + launchItemBlockInputOffset.x,
      y: position.y + launchItemBlockInputOffset.y,
    }
    const itemOutputOffset = resolveLaunchItemBlockOutputOffset(size)
    const output = {
      x: position.x + itemOutputOffset.x,
      y: position.y + itemOutputOffset.y,
    }
    return { index, blockId: createLaunchItemBlockId(index), position, size, input, output, connected: launchItemConnections[index] ?? false } as const
  })
  const uninstallItemBlocks = Array.from({ length: blockVisibility.uninstallItemCount }, (_, index) => {
    const position = uninstallItemBlockPositions[index] ?? createDefaultUninstallItemPosition(index)
    const size = uninstallItemBlockSizes[index] ?? uninstallItemBlockMinSize
    const input = {
      x: position.x + uninstallItemBlockInputOffset.x,
      y: position.y + uninstallItemBlockInputOffset.y,
    }
    const itemOutputOffset = resolveUninstallItemBlockOutputOffset(size)
    const output = {
      x: position.x + itemOutputOffset.x,
      y: position.y + itemOutputOffset.y,
    }
    return { index, blockId: createUninstallItemBlockId(index), position, size, input, output, connected: uninstallItemConnections[index] ?? false } as const
  })

  const isBlockVisible = (blockId: WorkbenchBlockId) => {
    if (blockId === 'start' || blockId === 'init' || blockId === 'init-file') return true
    if (blockId === 'components') return blockVisibility.components
    if (blockId === 'deploy') return blockVisibility.deploy
    if (blockId === 'config') return blockVisibility.config
    if (blockId === 'launch') return blockVisibility.launch
    if (blockId === 'uninstall') return blockVisibility.uninstall
    const componentIndex = parseComponentBlockIndex(blockId)
    if (componentIndex !== null) return componentIndex < blockVisibility.componentCount
    const deploymentIndex = parseDeploymentBlockIndex(blockId)
    if (deploymentIndex !== null) return deploymentIndex < blockVisibility.deploymentCount
    const configItemIndex = parseConfigItemBlockIndex(blockId)
    if (configItemIndex !== null) return configItemIndex < blockVisibility.configItemCount
    const launchItemIndex = parseLaunchItemBlockIndex(blockId)
    if (launchItemIndex !== null) return launchItemIndex < blockVisibility.launchItemCount
    const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
    if (uninstallItemIndex !== null) return uninstallItemIndex < blockVisibility.uninstallItemCount
    const fileId = parseFileBlockId(blockId)
    return fileId !== null && meta.files.some(file => file.id === fileId)
  }

  const resolveBlockInputPoint = (blockId: WorkbenchBlockId) => {
    if (!isBlockVisible(blockId)) return null
    if (blockId === 'start') return startEndpointOutput
    if (blockId === 'init') return initBlockInput
    if (blockId === 'init-file') return initBlockFileInput
    if (blockId === 'components') return componentsBlockInput
    if (blockId === 'deploy') return deployBlockInput
    if (blockId === 'config') return configBlockInput
    if (blockId === 'launch') return launchBlockInput
    if (blockId === 'uninstall') return uninstallBlockInput
    const componentIndex = parseComponentBlockIndex(blockId)
    if (componentIndex !== null) return componentBlocks[componentIndex]?.input ?? null
    const deploymentIndex = parseDeploymentBlockIndex(blockId)
    if (deploymentIndex !== null) return deploymentBlocks[deploymentIndex]?.input ?? null
    const configItemIndex = parseConfigItemBlockIndex(blockId)
    if (configItemIndex !== null) return configItemBlocks[configItemIndex]?.input ?? null
    const launchItemIndex = parseLaunchItemBlockIndex(blockId)
    if (launchItemIndex !== null) return launchItemBlocks[launchItemIndex]?.input ?? null
    const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
    if (uninstallItemIndex !== null) return uninstallItemBlocks[uninstallItemIndex]?.input ?? null
    return null
  }

  const resolveBlockOutputPoint = (blockId: WorkbenchBlockId) => {
    if (!isBlockVisible(blockId)) return null
    if (blockId === 'start') return startEndpointOutput
    if (blockId === 'init') return initBlockOutput
    if (blockId === 'components') return componentsDeployOutput
    if (blockId === 'deploy') return deployBlockOutput
    if (blockId === 'config') return configBlockOutput
    if (blockId === 'launch') return launchBlockOutput
    const componentIndex = parseComponentBlockIndex(blockId)
    if (componentIndex !== null) return componentBlocks[componentIndex]?.output ?? null
    const deploymentIndex = parseDeploymentBlockIndex(blockId)
    if (deploymentIndex !== null) return deploymentBlocks[deploymentIndex]?.output ?? null
    const configItemIndex = parseConfigItemBlockIndex(blockId)
    if (configItemIndex !== null) return configItemBlocks[configItemIndex]?.output ?? null
    const launchItemIndex = parseLaunchItemBlockIndex(blockId)
    if (launchItemIndex !== null) return launchItemBlocks[launchItemIndex]?.output ?? null
    const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
    if (uninstallItemIndex !== null) return uninstallItemBlocks[uninstallItemIndex]?.output ?? null
    const fileId = parseFileBlockId(blockId)
    if (fileId !== null) return fileBlocks.find(block => block.file.id === fileId)?.output ?? null
    return null
  }

  const resolveSourceOutputPoint = (source: WorkbenchConnectionSource, blockId: WorkbenchBlockId): WorkbenchPoint | null => {
    switch (source) {
      case 'init-components':      return initBlockOutput
      case 'components-deploy':    return componentsDeployOutput
      case 'components-component': return componentsComponentOutput
      case 'deploy-deployment':    return deployBlockOutput
      case 'deploy-config':        return deployConfigOutput
      case 'config-launch':        return configBlockOutput
      case 'config-item':          return configItemBlockOutput
      case 'launch-uninstall':     return launchBlockOutput
      case 'launch-item':          return launchItemBlockOutput
      case 'uninstall-item':       return uninstallItemBlockOutput
      case 'component-output':
      case 'deployment-output':
      case 'config-item-output':
      case 'launch-item-output':
      case 'uninstall-item-output':
      case 'file-output':
        return resolveBlockOutputPoint(blockId)
      default:
        return resolveBlockOutputPoint(blockId)
    }
  }

  const addImportedFileName = (name: string) => {
    const nextList = Array.from(new Set([...meta.fileImportList, name]))
    onBlockMetaPatch?.({ fileImportList: nextList, fileImport: true })
  }

  const removeImportedFileName = (name: string) => {
    onBlockMetaPatch?.({ fileImportList: meta.fileImportList.filter(item => item !== name) })
  }

  const normalizeDropTargetForSource = (sourceBlockId: WorkbenchBlockId, blockId: WorkbenchBlockId | null): WorkbenchBlockId | null => {
    if (!blockId) return null
    if (isFileConnectionSource(sourceBlockId)) {
      return blockId === 'init' ? 'init-file' : null
    }
    return blockId
  }

  const connectKnownRelation = (from: WorkbenchBlockId, to: WorkbenchBlockId) => {
    if (from === 'init' && to === 'components' && blockVisibility.components) {
      setComponentsConnected(true)
      return true
    }

    if (from === 'components' && to === 'deploy' && blockVisibility.components && blockVisibility.deploy) {
      setDeployConnected(true)
      return true
    }

    if (from === 'deploy' && to === 'config' && blockVisibility.deploy && blockVisibility.config) {
      setConfigConnected(true)
      return true
    }

    if (from === 'config' && to === 'launch' && blockVisibility.config && blockVisibility.launch) {
      setLaunchConnected(true)
      return true
    }

    if (from === 'launch' && to === 'uninstall' && blockVisibility.launch && blockVisibility.uninstall) {
      setUninstallConnected(true)
      return true
    }

    if (from === 'components') {
      const componentIndex = parseComponentBlockIndex(to)
      if (componentIndex !== null && componentIndex < blockVisibility.componentCount) {
        setComponentConnections(current => (
          resizeArray(current, blockVisibility.componentCount, () => false).map((item, index) => (
            index === componentIndex ? true : item
          ))
        ))
        return true
      }
    }

    if (from === 'deploy') {
      const deploymentIndex = parseDeploymentBlockIndex(to)
      if (deploymentIndex !== null && deploymentIndex < blockVisibility.deploymentCount) {
        setDeploymentConnections(current => (
          resizeArray(current, blockVisibility.deploymentCount, () => false).map((item, index) => (
            index === deploymentIndex ? true : item
          ))
        ))
        return true
      }
    }

    if (from === 'config') {
      const configItemIndex = parseConfigItemBlockIndex(to)
      if (configItemIndex !== null && configItemIndex < blockVisibility.configItemCount) {
        setConfigItemConnections(current => (
          resizeArray(current, blockVisibility.configItemCount, () => false).map((item, index) => (
            index === configItemIndex ? true : item
          ))
        ))
        return true
      }
    }

    if (from === 'launch') {
      const launchItemIndex = parseLaunchItemBlockIndex(to)
      if (launchItemIndex !== null && launchItemIndex < blockVisibility.launchItemCount) {
        setLaunchItemConnections(current => (
          resizeArray(current, blockVisibility.launchItemCount, () => false).map((item, index) => (
            index === launchItemIndex ? true : item
          ))
        ))
        return true
      }
    }

    if (from === 'uninstall') {
      const uninstallItemIndex = parseUninstallItemBlockIndex(to)
      if (uninstallItemIndex !== null && uninstallItemIndex < blockVisibility.uninstallItemCount) {
        setUninstallItemConnections(current => (
          resizeArray(current, blockVisibility.uninstallItemCount, () => false).map((item, index) => (
            index === uninstallItemIndex ? true : item
          ))
        ))
        return true
      }
    }

    return false
  }

  const addManualConnection = (from: WorkbenchBlockId, to: WorkbenchBlockId) => {
    if (to === 'init-file' && !isFileConnectionSource(from)) return
    if (isFileConnectionSource(from) && to !== 'init-file') return
    setManualConnections(current => {
      if (current.some(connection => connection.from === from && connection.to === to)) return current
      return [...current, { id: `${from}->${to}-${Date.now()}`, from, to }]
    })
    if (to === 'init-file') {
      const fileId = parseFileBlockId(from)
      const file = fileId ? meta.files.find(item => item.id === fileId) : null
      if (file) addImportedFileName(file.name)
    }
  }

  const findIncomingConnection = (targetBlockId: WorkbenchBlockId): DraggingConnection | null => {
    if (targetBlockId === 'components' && componentsConnected) {
      return { sourceBlockId: 'init', sourcePoint: initBlockOutput, targetBlockId }
    }
    if (targetBlockId === 'deploy' && deployConnected) {
      return { sourceBlockId: 'components', sourcePoint: componentsDeployOutput, targetBlockId }
    }
    if (targetBlockId === 'config' && configConnected) {
      return { sourceBlockId: 'deploy', sourcePoint: deployConfigOutput, targetBlockId }
    }
    if (targetBlockId === 'launch' && launchConnected) {
      return { sourceBlockId: 'config', sourcePoint: configBlockOutput, targetBlockId }
    }
    if (targetBlockId === 'uninstall' && uninstallConnected) {
      return { sourceBlockId: 'launch', sourcePoint: launchBlockOutput, targetBlockId }
    }

    const componentIndex = parseComponentBlockIndex(targetBlockId)
    if (componentIndex !== null && componentConnections[componentIndex]) {
      return { sourceBlockId: 'components', sourcePoint: componentsComponentOutput, targetBlockId }
    }
    const deploymentIndex = parseDeploymentBlockIndex(targetBlockId)
    if (deploymentIndex !== null && deploymentConnections[deploymentIndex]) {
      return { sourceBlockId: 'deploy', sourcePoint: deployBlockOutput, targetBlockId }
    }
    const configItemIndex = parseConfigItemBlockIndex(targetBlockId)
    if (configItemIndex !== null && configItemConnections[configItemIndex]) {
      return { sourceBlockId: 'config', sourcePoint: configItemBlockOutput, targetBlockId }
    }
    const launchItemIndex = parseLaunchItemBlockIndex(targetBlockId)
    if (launchItemIndex !== null && launchItemConnections[launchItemIndex]) {
      return { sourceBlockId: 'launch', sourcePoint: launchItemBlockOutput, targetBlockId }
    }
    const uninstallItemIndex = parseUninstallItemBlockIndex(targetBlockId)
    if (uninstallItemIndex !== null && uninstallItemConnections[uninstallItemIndex]) {
      return { sourceBlockId: 'uninstall', sourcePoint: uninstallItemBlockOutput, targetBlockId }
    }

    for (const conn of manualConnections) {
      if (conn.to === targetBlockId) {
        const from = resolveBlockOutputPoint(conn.from)
        if (from) return { sourceBlockId: conn.from, sourcePoint: from, targetBlockId }
      }
    }
    return null
  }

  const isInputConnected = (blockId: WorkbenchBlockId): boolean => {
    return findIncomingConnection(blockId) !== null
  }

  const removeConnection = (sourceBlockId: WorkbenchBlockId, targetBlockId: WorkbenchBlockId) => {
    if (sourceBlockId === 'init' && targetBlockId === 'components') {
      setComponentsConnected(false)
      return
    }
    if (sourceBlockId === 'components' && targetBlockId === 'deploy') {
      setDeployConnected(false)
      return
    }
    if (sourceBlockId === 'deploy' && targetBlockId === 'config') {
      setConfigConnected(false)
      return
    }
    if (sourceBlockId === 'config' && targetBlockId === 'launch') {
      setLaunchConnected(false)
      return
    }
    if (sourceBlockId === 'launch' && targetBlockId === 'uninstall') {
      setUninstallConnected(false)
      return
    }

    if (sourceBlockId === 'components') {
      const componentIndex = parseComponentBlockIndex(targetBlockId)
      if (componentIndex !== null) {
        setComponentConnections(current => current.map((item, index) => (index === componentIndex ? false : item)))
        return
      }
    }
    if (sourceBlockId === 'deploy') {
      const deploymentIndex = parseDeploymentBlockIndex(targetBlockId)
      if (deploymentIndex !== null) {
        setDeploymentConnections(current => current.map((item, index) => (index === deploymentIndex ? false : item)))
        return
      }
    }
    if (sourceBlockId === 'config') {
      const configItemIndex = parseConfigItemBlockIndex(targetBlockId)
      if (configItemIndex !== null) {
        setConfigItemConnections(current => current.map((item, index) => (index === configItemIndex ? false : item)))
        return
      }
    }
    if (sourceBlockId === 'launch') {
      const launchItemIndex = parseLaunchItemBlockIndex(targetBlockId)
      if (launchItemIndex !== null) {
        setLaunchItemConnections(current => current.map((item, index) => (index === launchItemIndex ? false : item)))
        return
      }
    }
    if (sourceBlockId === 'uninstall') {
      const uninstallItemIndex = parseUninstallItemBlockIndex(targetBlockId)
      if (uninstallItemIndex !== null) {
        setUninstallItemConnections(current => current.map((item, index) => (index === uninstallItemIndex ? false : item)))
        return
      }
    }

    setManualConnections(current => current.filter(connection => !(connection.from === sourceBlockId && connection.to === targetBlockId)))
    if (targetBlockId === 'init-file') {
      const fileId = parseFileBlockId(sourceBlockId)
      const file = fileId ? meta.files.find(item => item.id === fileId) : null
      if (file) removeImportedFileName(file.name)
    }
  }

  const startDragConnector = (
    source: WorkbenchConnectionSource,
    _fromPoint: WorkbenchPoint,
    fromBlockId: WorkbenchBlockId,
    event: PointerEvent<SVGGElement>,
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startBlockId = fromBlockId
    let dropTarget: WorkbenchBlockId | null = null

    const fromWorld = resolveSourceOutputPoint(source, fromBlockId)
    if (!fromWorld) return
    const startRect = canvasRef.current?.getBoundingClientRect()
    if (!startRect) return
    const startScale = startRect.width / 1920

    setDragConnector({ source, from: fromWorld, fromBlockId })
    setDragCursor({
      x: (event.clientX - startRect.left) / startScale,
      y: (event.clientY - startRect.top) / startScale,
    })

    const detectDropTarget = (clientX: number, clientY: number): WorkbenchBlockId | null => {
      const target = document.elementFromPoint(clientX, clientY)
      const blockEl = target?.closest('[data-workbench-block-id]')
      if (!blockEl) return null
      const blockId = blockEl.getAttribute('data-workbench-block-id') as WorkbenchBlockId | null
      if (!blockId || blockId === startBlockId) return null
      return isBlockVisible(blockId) ? blockId : null
    }

    const handleMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      e.preventDefault()
      const moveRect = canvasRef.current?.getBoundingClientRect()
      if (moveRect) {
        const moveScale = moveRect.width / 1920
        setDragCursor({
          x: (e.clientX - moveRect.left) / moveScale,
          y: (e.clientY - moveRect.top) / moveScale,
        })
      } else {
        setDragCursor({ x: e.clientX, y: e.clientY })
      }
      const next = detectDropTarget(e.clientX, e.clientY)
      if (next !== dropTarget) {
        dropTarget = normalizeDropTargetForSource(startBlockId, next)
        setHoveredDropBlockId(dropTarget)
      }
    }

    const handleUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
      const distance = Math.hypot(e.clientX - startClientX, e.clientY - startClientY)
      setDragConnector(null)
      setDragCursor(null)
      setHoveredDropBlockId(null)
      if (distance < 5) return
      if (!dropTarget) return
      if (
        !connectKnownRelation(startBlockId, dropTarget) &&
        !connectKnownRelation(dropTarget, startBlockId)
      ) {
        addManualConnection(startBlockId, dropTarget)
      }
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
  }

  const startInputDragDisconnect = (
    targetBlockId: WorkbenchBlockId,
    event: PointerEvent<SVGGElement>,
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const incoming = findIncomingConnection(targetBlockId)
    if (!incoming) return

    const sourceBlockId = incoming.sourceBlockId
    const sourcePoint = incoming.sourcePoint
    const pointerId = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startRect = canvasRef.current?.getBoundingClientRect()
    if (!startRect) return
    const startScale = startRect.width / 1920

    setDraggingConnection(incoming)
    setDragConnector({ source: 'disconnect', from: sourcePoint, fromBlockId: sourceBlockId })
    setDragCursor({
      x: (event.clientX - startRect.left) / startScale,
      y: (event.clientY - startRect.top) / startScale,
    })

    let dropTarget: WorkbenchBlockId | null = null

    const detectDropTarget = (clientX: number, clientY: number): WorkbenchBlockId | null => {
      const target = document.elementFromPoint(clientX, clientY)
      const blockEl = target?.closest('[data-workbench-block-id]')
      if (!blockEl) return null
      const blockId = blockEl.getAttribute('data-workbench-block-id') as WorkbenchBlockId | null
      if (!blockId || blockId === targetBlockId || blockId === sourceBlockId) return null
      return isBlockVisible(blockId) ? blockId : null
    }

    const handleMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      e.preventDefault()
      const moveRect = canvasRef.current?.getBoundingClientRect()
      if (moveRect) {
        const moveScale = moveRect.width / 1920
        setDragCursor({
          x: (e.clientX - moveRect.left) / moveScale,
          y: (e.clientY - moveRect.top) / moveScale,
        })
      } else {
        setDragCursor({ x: e.clientX, y: e.clientY })
      }
      const next = normalizeDropTargetForSource(sourceBlockId, detectDropTarget(e.clientX, e.clientY))
      if (next !== dropTarget) {
        dropTarget = next
        setHoveredDropBlockId(next)
      }
    }

    const handleUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
      const distance = Math.hypot(e.clientX - startClientX, e.clientY - startClientY)
      setDragConnector(null)
      setDragCursor(null)
      setHoveredDropBlockId(null)
      setDraggingConnection(null)
      if (distance < 5) return
      removeConnection(sourceBlockId, targetBlockId)
      if (!dropTarget || dropTarget === targetBlockId) return
      if (
        !connectKnownRelation(sourceBlockId, dropTarget) &&
        !connectKnownRelation(dropTarget, sourceBlockId)
      ) {
        addManualConnection(sourceBlockId, dropTarget)
      }
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
  }

  const handleHeaderDoubleClick = (blockId: WorkbenchBlockId, event: MouseEvent<SVGGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    clearDragTimer()
    dragRef.current = null
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
    onSelectedBlockChange?.(blockId)

    if (!linkSourceBlockId) {
      setLinkSourceBlockId(blockId)
      return
    }

    if (linkSourceBlockId === blockId) {
      setLinkSourceBlockId(null)
      return
    }

    const normalizedTarget = normalizeDropTargetForSource(linkSourceBlockId, blockId)
    if (
      normalizedTarget
      && !connectKnownRelation(linkSourceBlockId, normalizedTarget)
      && !connectKnownRelation(normalizedTarget, linkSourceBlockId)
    ) {
      addManualConnection(linkSourceBlockId, normalizedTarget)
    }
    setLinkSourceBlockId(null)
  }

  const clearManualConnectionsFor = (blockId: WorkbenchBlockId) => {
    const removedFileNames = manualConnections
      .filter(connection => (connection.from === blockId || connection.to === blockId) && connection.to === 'init-file')
      .flatMap(connection => {
        const fileId = parseFileBlockId(connection.from)
        const file = fileId ? meta.files.find(item => item.id === fileId) : null
        return file ? [file.name] : []
      })
    setManualConnections(current => current.filter(connection => connection.from !== blockId && connection.to !== blockId))
    setLinkSourceBlockId(current => (current === blockId ? null : current))
    removedFileNames.forEach(removeImportedFileName)
  }

  const remapManualConnectionsAfterIndexedDelete = (prefix: 'component' | 'deployment' | 'config-item' | 'launch-item' | 'uninstall-item', removedIndex: number) => {
    setManualConnections(current => current.flatMap(connection => {
      const from = remapIndexedBlockId(connection.from, prefix, removedIndex)
      const to = remapIndexedBlockId(connection.to, prefix, removedIndex)
      return from && to ? [{ ...connection, from, to }] : []
    }))
    setLinkSourceBlockId(current => (current ? remapIndexedBlockId(current, prefix, removedIndex) : null))
  }

  const remapSelectedBlockAfterIndexedDelete = (prefix: 'component' | 'deployment' | 'config-item' | 'launch-item' | 'uninstall-item', removedIndex: number) => {
    if (!selectedBlockId) return
    onSelectedBlockChange?.(remapIndexedBlockId(selectedBlockId, prefix, removedIndex))
  }

  const deleteComponentsBlock = () => {
    onVisibleBlocksChange?.({ components: false })
    setComponentsConnected(false)
    setDeployConnected(false)
    setComponentConnections(current => current.map(() => false))
    clearManualConnectionsFor('components')
    if (selectedBlockId === 'components') onSelectedBlockChange?.(null)
  }

  const deleteDeployBlock = () => {
    onVisibleBlocksChange?.({ deploy: false })
    setDeployConnected(false)
    setDeploymentConnections(current => current.map(() => false))
    clearManualConnectionsFor('deploy')
    if (selectedBlockId === 'deploy') onSelectedBlockChange?.(null)
  }

  const deleteConfigBlock = () => {
    onVisibleBlocksChange?.({ config: false })
    setConfigConnected(false)
    setLaunchConnected(false)
    setConfigItemConnections(current => current.map(() => false))
    clearManualConnectionsFor('config')
    if (selectedBlockId === 'config') onSelectedBlockChange?.(null)
  }

  const deleteLaunchBlock = () => {
    onVisibleBlocksChange?.({ launch: false })
    setLaunchConnected(false)
    setUninstallConnected(false)
    setLaunchItemConnections(current => current.map(() => false))
    clearManualConnectionsFor('launch')
    if (selectedBlockId === 'launch') onSelectedBlockChange?.(null)
  }

  const deleteUninstallBlock = () => {
    onVisibleBlocksChange?.({ uninstall: false })
    setUninstallConnected(false)
    setUninstallItemConnections(current => current.map(() => false))
    clearManualConnectionsFor('uninstall')
    if (selectedBlockId === 'uninstall') onSelectedBlockChange?.(null)
  }

  const deleteComponentBlock = (indexToRemove: number) => {
    const componentToRemove = meta.components[indexToRemove]
    const nextComponents = removeArrayItem(meta.components, indexToRemove)
    const nextComponentsList = componentToRemove?.id
      ? meta.componentsList.filter(id => id !== componentToRemove.id)
      : meta.componentsList
    setComponentBlockPositions(current => removeArrayItem(current, indexToRemove))
    setComponentBlockSizes(current => removeArrayItem(current, indexToRemove))
    setComponentConnections(current => removeArrayItem(current, indexToRemove))
    onVisibleBlocksChange?.({ componentCount: Math.max(0, blockVisibility.componentCount - 1) })
    onBlockMetaPatch?.({ components: nextComponents, componentsList: nextComponentsList })
    remapManualConnectionsAfterIndexedDelete('component', indexToRemove)
    remapSelectedBlockAfterIndexedDelete('component', indexToRemove)
  }

  const deleteDeploymentBlock = (indexToRemove: number) => {
    const deploymentToRemove = meta.deployments[indexToRemove]
    const nextDeployments = removeArrayItem(meta.deployments, indexToRemove)
    const nextDeployList = deploymentToRemove?.id
      ? meta.deployList.filter(id => id !== deploymentToRemove.id)
      : meta.deployList
    setDeploymentBlockPositions(current => removeArrayItem(current, indexToRemove))
    setDeploymentBlockSizes(current => removeArrayItem(current, indexToRemove))
    setDeploymentConnections(current => removeArrayItem(current, indexToRemove))
    onVisibleBlocksChange?.({ deploymentCount: Math.max(0, blockVisibility.deploymentCount - 1) })
    onBlockMetaPatch?.({ deployments: nextDeployments, deployList: nextDeployList })
    remapManualConnectionsAfterIndexedDelete('deployment', indexToRemove)
    remapSelectedBlockAfterIndexedDelete('deployment', indexToRemove)
  }

  const deleteConfigItemBlock = (indexToRemove: number) => {
    const configItemToRemove = meta.configItems[indexToRemove]
    const nextConfigItems = removeArrayItem(meta.configItems, indexToRemove)
    const nextConfigList = configItemToRemove?.id
      ? meta.configList.filter(id => id !== configItemToRemove.id)
      : meta.configList
    setConfigItemBlockPositions(current => removeArrayItem(current, indexToRemove))
    setConfigItemBlockSizes(current => removeArrayItem(current, indexToRemove))
    setConfigItemConnections(current => removeArrayItem(current, indexToRemove))
    onVisibleBlocksChange?.({ configItemCount: Math.max(0, blockVisibility.configItemCount - 1) })
    onBlockMetaPatch?.({ configItems: nextConfigItems, configList: nextConfigList })
    remapManualConnectionsAfterIndexedDelete('config-item', indexToRemove)
    remapSelectedBlockAfterIndexedDelete('config-item', indexToRemove)
  }

  const deleteLaunchItemBlock = (indexToRemove: number) => {
    const launchItemToRemove = meta.launchItems[indexToRemove]
    const nextLaunchItems = removeArrayItem(meta.launchItems, indexToRemove)
    const nextLaunchList = launchItemToRemove?.id
      ? meta.launchList.filter(id => id !== launchItemToRemove.id)
      : meta.launchList
    setLaunchItemBlockPositions(current => removeArrayItem(current, indexToRemove))
    setLaunchItemBlockSizes(current => removeArrayItem(current, indexToRemove))
    setLaunchItemConnections(current => removeArrayItem(current, indexToRemove))
    onVisibleBlocksChange?.({ launchItemCount: Math.max(0, blockVisibility.launchItemCount - 1) })
    onBlockMetaPatch?.({ launchItems: nextLaunchItems, launchList: nextLaunchList })
    remapManualConnectionsAfterIndexedDelete('launch-item', indexToRemove)
    remapSelectedBlockAfterIndexedDelete('launch-item', indexToRemove)
  }

  const deleteUninstallItemBlock = (indexToRemove: number) => {
    const uninstallItemToRemove = meta.uninstallItems[indexToRemove]
    const nextUninstallItems = removeArrayItem(meta.uninstallItems, indexToRemove)
    const nextUninstallList = uninstallItemToRemove?.id
      ? meta.uninstallList.filter(id => id !== uninstallItemToRemove.id)
      : meta.uninstallList
    setUninstallItemBlockPositions(current => removeArrayItem(current, indexToRemove))
    setUninstallItemBlockSizes(current => removeArrayItem(current, indexToRemove))
    setUninstallItemConnections(current => removeArrayItem(current, indexToRemove))
    onVisibleBlocksChange?.({ uninstallItemCount: Math.max(0, blockVisibility.uninstallItemCount - 1) })
    onBlockMetaPatch?.({ uninstallItems: nextUninstallItems, uninstallList: nextUninstallList })
    remapManualConnectionsAfterIndexedDelete('uninstall-item', indexToRemove)
    remapSelectedBlockAfterIndexedDelete('uninstall-item', indexToRemove)
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

  const addConfigBlock = () => {
    onVisibleBlocksChange?.({ config: true })
    if (addNodePopoverSource === 'deploy-config') setConfigConnected(true)
    onSelectedBlockChange?.('config')
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addLaunchBlock = () => {
    onVisibleBlocksChange?.({ launch: true })
    if (addNodePopoverSource === 'config-launch') setLaunchConnected(true)
    onSelectedBlockChange?.('launch')
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addUninstallBlock = () => {
    onVisibleBlocksChange?.({ uninstall: true })
    if (addNodePopoverSource === 'launch-uninstall') setUninstallConnected(true)
    onSelectedBlockChange?.('uninstall')
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

  const addDeploymentBlock = () => {
    const nextIndex = blockVisibility.deploymentCount
    const position = addNodePopoverSource === 'deploy-deployment'
      ? { x: deployBlockOutput.x - deploymentBlockInputOffset.x - 160, y: deployBlockOutput.y + 110 }
      : createDefaultDeploymentPosition(nextIndex)
    setDeploymentBlockPositions(current => [...current, position])
    setDeploymentBlockSizes(current => [...current, deploymentBlockMinSize])
    setDeploymentConnections(current => [...current, addNodePopoverSource === 'deploy-deployment'])
    onVisibleBlocksChange?.({ deploymentCount: nextIndex + 1 })
    onSelectedBlockChange?.(createDeploymentBlockId(nextIndex))
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addConfigItemBlock = () => {
    const nextIndex = blockVisibility.configItemCount
    const position = addNodePopoverSource === 'config-item'
      ? { x: configItemBlockOutput.x - configItemBlockInputOffset.x - 160, y: configItemBlockOutput.y + 110 }
      : createDefaultConfigItemPosition(nextIndex)
    setConfigItemBlockPositions(current => [...current, position])
    setConfigItemBlockSizes(current => [...current, configItemBlockMinSize])
    setConfigItemConnections(current => [...current, addNodePopoverSource === 'config-item'])
    onVisibleBlocksChange?.({ configItemCount: nextIndex + 1 })
    onSelectedBlockChange?.(createConfigItemBlockId(nextIndex))
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addLaunchItemBlock = () => {
    const nextIndex = blockVisibility.launchItemCount
    const position = addNodePopoverSource === 'launch-item'
      ? { x: launchItemBlockOutput.x - launchItemBlockInputOffset.x - 160, y: launchItemBlockOutput.y + 110 }
      : createDefaultLaunchItemPosition(nextIndex)
    setLaunchItemBlockPositions(current => [...current, position])
    setLaunchItemBlockSizes(current => [...current, launchItemBlockMinSize])
    setLaunchItemConnections(current => [...current, addNodePopoverSource === 'launch-item'])
    onVisibleBlocksChange?.({ launchItemCount: nextIndex + 1 })
    onSelectedBlockChange?.(createLaunchItemBlockId(nextIndex))
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const addUninstallItemBlock = () => {
    const nextIndex = blockVisibility.uninstallItemCount
    const position = addNodePopoverSource === 'uninstall-item'
      ? { x: uninstallItemBlockOutput.x - uninstallItemBlockInputOffset.x - 160, y: uninstallItemBlockOutput.y + 110 }
      : createDefaultUninstallItemPosition(nextIndex)
    setUninstallItemBlockPositions(current => [...current, position])
    setUninstallItemBlockSizes(current => [...current, uninstallItemBlockMinSize])
    setUninstallItemConnections(current => [...current, addNodePopoverSource === 'uninstall-item'])
    onVisibleBlocksChange?.({ uninstallItemCount: nextIndex + 1 })
    onSelectedBlockChange?.(createUninstallItemBlockId(nextIndex))
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
  }

  const defaultFilePosition = (index: number): WorkbenchPoint => ({
    x: initBlockPosition.x - 220 - (index % 3) * 140,
    y: initBlockPosition.y + 24 + Math.floor(index / 3) * 140,
  })

  const triggerFileImport = () => {
    if (!projectSequence) {
      setFileImportError('当前未关联工作台项目，无法导入文件。')
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    event.target.value = ''
    if (!files || files.length === 0) return
    if (!projectSequence) {
      setFileImportError('未关联工作台项目，无法导入。')
      return
    }
    setFileImportError(null)
    for (const file of Array.from(files)) {
      await processFileUpload(file, null)
    }
  }

  const processFileUpload = async (file: File, conflictResolution: FileConflictResolution | null) => {
    if (!projectSequence) return
    const name = file.name
    try {
      const checkRes = await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/check-name`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      )
      if (!checkRes.ok) {
        setFileImportError(`检测文件名失败 (${checkRes.status})`)
        return
      }
      const check: { available: boolean; suggestion: string } = await checkRes.json()
      let uploadName = name
      let resolution = conflictResolution
      if (!check.available) {
        if (!resolution) {
          setPendingFileConflict({ file, suggestedName: check.suggestion })
          return
        }
        if (resolution === 'rename') {
          uploadName = check.suggestion
        }
      }
      const params = new URLSearchParams({ filename: uploadName })
      if (resolution) params.set('conflictResolution', resolution)
      const form = new FormData()
      form.append('file', file)
      const uploadRes = await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/upload?${params.toString()}`,
        {
          method: 'POST',
          credentials: 'include',
          body: form,
        },
      )
      if (uploadRes.status === 409) {
        const detail = await uploadRes.json().catch(() => null)
        const suggestion = detail?.detail?.suggestion ?? check.suggestion
        setPendingFileConflict({ file, suggestedName: suggestion })
        return
      }
      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '')
        setFileImportError(`上传失败 (${uploadRes.status}): ${text || '未知错误'}`)
        return
      }
      const newMeta: WorkbenchFileMeta = await uploadRes.json()
      const nextIndex = meta.files.length
      setFileBlockPositions(current => ({ ...current, [newMeta.id]: defaultFilePosition(nextIndex) }))
      onBlockMetaPatch?.({
        files: [...meta.files.filter(file => file.id !== newMeta.id && file.name !== newMeta.name), newMeta],
      })
    } catch (err) {
      setFileImportError(`上传异常: ${(err as Error).message ?? String(err)}`)
    }
  }

  const handleFileConflictResolve = (resolution: FileConflictResolution) => {
    if (!pendingFileConflict) return
    const { file } = pendingFileConflict
    setPendingFileConflict(null)
    if (resolution === 'cancel') return
    void processFileUpload(file, resolution)
  }

  const deleteFileBlock = async (file: WorkbenchFileMeta) => {
    if (!projectSequence) return
    try {
      await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/${encodeURIComponent(file.name)}`,
        { method: 'DELETE', credentials: 'include' },
      )
    } catch (err) {
      setFileImportError(`删除失败: ${(err as Error).message ?? String(err)}`)
    }
    setFileBlockPositions(current => {
      const next = { ...current }
      delete next[file.id]
      return next
    })
    setFileBlockSizes(current => {
      const next = { ...current }
      delete next[file.id]
      return next
    })
    onBlockMetaPatch?.({
      files: meta.files.filter(f => f.id !== file.id),
      fileImportList: meta.fileImportList.filter(n => n !== file.name),
    })
    clearManualConnectionsFor(createFileBlockId(file.id))
    if (selectedBlockId === createFileBlockId(file.id)) onSelectedBlockChange?.(null)
  }

  const openFileEditorForBlock = (file: WorkbenchFileMeta) => {
    onOpenFileEditor?.(file.id)
  }

  const openNewFileDialog = () => {
    if (!projectSequence) {
      setFileImportError('当前未关联工作台项目，无法新建文件。')
      return
    }
    setAddNodePopoverPosition(null)
    setAddNodePopoverSource(null)
    setNewFileError(null)
    setNewFileDialogOpen(true)
  }

  const closeNewFileDialog = () => {
    setNewFileDialogOpen(false)
    setNewFileConflict(null)
    setNewFileSubmitting(false)
    setNewFileError(null)
  }

  const processNewFile = async (
    payload: { name: string; content: string },
    conflictResolution: FileConflictResolution | null,
  ) => {
    if (!projectSequence) return
    setNewFileSubmitting(true)
    setNewFileError(null)
    try {
      const res = await fetch(
        `/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/create`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name,
            content: payload.content,
            conflictResolution,
          }),
        },
      )
      if (res.status === 409) {
        const detail = await res.json().catch(() => null)
        setNewFileConflict({
          name: payload.name,
          suggestedName: detail?.detail?.suggestion ?? '',
          payload,
        })
        setNewFileSubmitting(false)
        return
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setNewFileError(`新建失败 (${res.status}): ${text || '未知错误'}`)
        setNewFileSubmitting(false)
        return
      }
      const newMeta: WorkbenchFileMeta = await res.json()
      const nextIndex = meta.files.length
      setFileBlockPositions(current => ({ ...current, [newMeta.id]: defaultFilePosition(nextIndex) }))
      onBlockMetaPatch?.({
        files: [...meta.files.filter(file => file.id !== newMeta.id && file.name !== newMeta.name), newMeta],
      })
      onSelectedBlockChange?.(createFileBlockId(newMeta.id))
      closeNewFileDialog()
    } catch (err) {
      setNewFileError(`新建异常: ${(err as Error).message ?? String(err)}`)
      setNewFileSubmitting(false)
    }
  }

  const handleNewFileConflictResolve = (resolution: FileConflictResolution) => {
    if (!newFileConflict) return
    const { payload } = newFileConflict
    setNewFileConflict(null)
    if (resolution === 'cancel') return
    void processNewFile(payload, resolution)
  }


  const addNodePopoverScreenPosition = addNodePopoverPosition
    ? {
      x: viewport.x + addNodePopoverPosition.x * viewport.scale,
      y: viewport.y + addNodePopoverPosition.y * viewport.scale,
    }
    : null

  const isConnectionBeingDragged = (source: WorkbenchBlockId, target: WorkbenchBlockId): boolean => {
    if (!draggingConnection) return false
    return draggingConnection.sourceBlockId === source && draggingConnection.targetBlockId === target
  }

  useEffect(() => {
    if (!projectSequence) return
    let cancelled = false
    let timer: number | null = null

    const syncProjectFiles = async () => {
      try {
        const response = await fetch(`/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/files/sync`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!response.ok) return
        const nextFiles = await response.json() as WorkbenchFileMeta[]
        if (cancelled || areFilesEqual(meta.files, nextFiles)) return

        const nextIds = new Set(nextFiles.map(file => file.id))
        setFileBlockPositions(current => {
          const next = { ...current }
          nextFiles.forEach((file, index) => {
            if (!next[file.id]) next[file.id] = defaultFilePosition(index)
          })
          Object.keys(next).forEach(fileId => {
            if (!nextIds.has(fileId)) delete next[fileId]
          })
          return next
        })
        setFileBlockSizes(current => {
          const next = { ...current }
          Object.keys(next).forEach(fileId => {
            if (!nextIds.has(fileId)) delete next[fileId]
          })
          return next
        })
        onBlockMetaPatch?.({
          files: nextFiles,
          fileImportList: meta.fileImportList.filter(name => nextFiles.some(file => file.name === name)),
        })
      } catch {
        // 目录热检测失败时保持静默，等待下一次轮询重试
      }
    }

    void syncProjectFiles()
    timer = window.setInterval(() => {
      void syncProjectFiles()
    }, 5000)

    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
    }
  }, [projectSequence, meta.files, meta.fileImportList, onBlockMetaPatch])

  return (
    <>
      <div
        ref={canvasRef}
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
          {blockVisibility.components && componentsConnected && !isConnectionBeingDragged('init', 'components') && (
            <CanvasConnectionLayer from={initBlockOutput} to={componentsBlockInput} stroke="#22b386" />
          )}
          {blockVisibility.deploy && deployConnected && !isConnectionBeingDragged('components', 'deploy') && (
            <CanvasConnectionLayer from={componentsDeployOutput} to={deployBlockInput} stroke="#d97706" />
          )}
          {blockVisibility.config && configConnected && !isConnectionBeingDragged('deploy', 'config') && (
            <CanvasConnectionLayer from={deployConfigOutput} to={configBlockInput} stroke="#8b5cf6" />
          )}
          {blockVisibility.launch && launchConnected && !isConnectionBeingDragged('config', 'launch') && (
            <CanvasConnectionLayer from={configBlockOutput} to={launchBlockInput} stroke="#14b8a6" />
          )}
          {blockVisibility.uninstall && uninstallConnected && !isConnectionBeingDragged('launch', 'uninstall') && (
            <CanvasConnectionLayer from={launchBlockOutput} to={uninstallBlockInput} stroke="#dc2626" />
          )}
          {componentBlocks.filter(block => block.connected && !isConnectionBeingDragged('components', block.blockId)).map(block => (
            <CanvasConnectionLayer
              key={`component-line-${block.index}`}
              from={componentsComponentOutput}
              to={block.input}
              stroke="#22b386"
            />
          ))}
          {deploymentBlocks.filter(block => block.connected && !isConnectionBeingDragged('deploy', block.blockId)).map(block => (
            <CanvasConnectionLayer
              key={`deployment-line-${block.index}`}
              from={deployBlockOutput}
              to={block.input}
              stroke="#d97706"
            />
          ))}
          {configItemBlocks.filter(block => block.connected && !isConnectionBeingDragged('config', block.blockId)).map(block => (
            <CanvasConnectionLayer
              key={`config-item-line-${block.index}`}
              from={configItemBlockOutput}
              to={block.input}
              stroke="#8b5cf6"
            />
          ))}
          {launchItemBlocks.filter(block => block.connected && !isConnectionBeingDragged('launch', block.blockId)).map(block => (
            <CanvasConnectionLayer
              key={`launch-item-line-${block.index}`}
              from={launchItemBlockOutput}
              to={block.input}
              stroke="#14b8a6"
            />
          ))}
          {uninstallItemBlocks.filter(block => block.connected && !isConnectionBeingDragged('uninstall', block.blockId)).map(block => (
            <CanvasConnectionLayer
              key={`uninstall-item-line-${block.index}`}
              from={uninstallItemBlockOutput}
              to={block.input}
              stroke="#dc2626"
            />
          ))}
          {manualConnections.map(connection => {
            if (isConnectionBeingDragged(connection.from, connection.to)) return null
            const from = resolveBlockOutputPoint(connection.from)
            const to = resolveBlockInputPoint(connection.to)
            if (!from || !to) return null
            return (
              <CanvasConnectionLayer
                key={connection.id}
                from={from}
                to={to}
                stroke="#8fdca4"
              />
            )
          })}

          {dragConnector && dragCursor && (() => {
            const from = dragConnector.from
            const to = hoveredDropBlockId
              ? (resolveBlockInputPoint(hoveredDropBlockId) ?? dragCursor)
              : dragCursor
            return (
              <CanvasConnectionLayer
                from={from}
                to={to}
                stroke={hoveredDropBlockId ? '#8b5cf6' : '#94a3b8'}
                strokeWidth={hoveredDropBlockId ? 3 : 2}
              />
            )
          })()}

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
            onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'init', event)}
            onInputDragStart={event => startInputDragDisconnect('init', event)}
            onFileInputDragStart={event => startInputDragDisconnect('init-file', event)}
            inputConnected={isInputConnected('init')}
            fileInputConnected={isInputConnected('init-file')}
            meta={meta}
            linking={linkSourceBlockId === 'init'}
            dragHandlers={createDragHandlers('init', initBlockPosition)}
            resizeHandlers={createResizeHandlers('init')}
          />
          {blockVisibility.components && (
            <ComponentsBlock
              position={componentsBlockPosition}
              size={componentsBlockSize}
              selected={selectedBlockId === 'components'}
              onSelect={() => onSelectedBlockChange?.('components')}
              onDeployConnectorClick={() => openAddNodePopover(componentsDeployOutput, 'components-deploy')}
              onComponentConnectorClick={() => openAddNodePopover(componentsComponentOutput, 'components-component')}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'components', event)}
              onInputDragStart={event => startInputDragDisconnect('components', event)}
              inputConnected={isInputConnected('components')}
              onDelete={deleteComponentsBlock}
              componentsEnvOutput={meta.componentsEnvOutput}
              componentsEnvInput={meta.componentsEnvInput}
              componentsList={meta.componentsList}
              linking={linkSourceBlockId === 'components'}
              dragHandlers={createDragHandlers('components', componentsBlockPosition)}
              resizeHandlers={createResizeHandlers('components')}
            />
          )}
          {blockVisibility.deploy && (
            <DeployBlock
              position={deployBlockPosition}
              size={deployBlockSize}
              selected={selectedBlockId === 'deploy'}
              onSelect={() => onSelectedBlockChange?.('deploy')}
              onDeploymentConnectorClick={() => openAddNodePopover(deployBlockOutput, 'deploy-deployment')}
              onConfigConnectorClick={() => openAddNodePopover(deployConfigOutput, 'deploy-config')}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'deploy', event)}
              onInputDragStart={event => startInputDragDisconnect('deploy', event)}
              inputConnected={isInputConnected('deploy')}
              onDelete={deleteDeployBlock}
              deployEnvOutput={meta.deployEnvOutput}
              deployEnvInput={meta.deployEnvInput}
              deployList={meta.deployList}
              linking={linkSourceBlockId === 'deploy'}
              dragHandlers={createDragHandlers('deploy', deployBlockPosition)}
              resizeHandlers={createResizeHandlers('deploy')}
            />
          )}
          {blockVisibility.config && (
            <ConfigBlock
              position={configBlockPosition}
              size={configBlockSize}
              selected={selectedBlockId === 'config'}
              onSelect={() => onSelectedBlockChange?.('config')}
              onNextConnectorClick={() => openAddNodePopover(configBlockOutput, 'config-launch')}
              onItemConnectorClick={() => openAddNodePopover(configItemBlockOutput, 'config-item')}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'config', event)}
              onInputDragStart={event => startInputDragDisconnect('config', event)}
              inputConnected={isInputConnected('config')}
              onDelete={deleteConfigBlock}
              configEnvOutput={meta.configEnvOutput}
              configEnvInput={meta.configEnvInput}
              configList={meta.configList}
              linking={linkSourceBlockId === 'config'}
              dragHandlers={createDragHandlers('config', configBlockPosition)}
              resizeHandlers={createResizeHandlers('config')}
            />
          )}
          {blockVisibility.launch && (
            <LaunchBlock
              position={launchBlockPosition}
              size={launchBlockSize}
              selected={selectedBlockId === 'launch'}
              onSelect={() => onSelectedBlockChange?.('launch')}
              onNextConnectorClick={() => openAddNodePopover(launchBlockOutput, 'launch-uninstall')}
              onItemConnectorClick={() => openAddNodePopover(launchItemBlockOutput, 'launch-item')}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'launch', event)}
              onInputDragStart={event => startInputDragDisconnect('launch', event)}
              inputConnected={isInputConnected('launch')}
              onDelete={deleteLaunchBlock}
              launchEnvOutput={meta.launchEnvOutput}
              launchEnvInput={meta.launchEnvInput}
              launchList={meta.launchList}
              linking={linkSourceBlockId === 'launch'}
              dragHandlers={createDragHandlers('launch', launchBlockPosition)}
              resizeHandlers={createResizeHandlers('launch')}
            />
          )}
          {blockVisibility.uninstall && (
            <UninstallBlock
              position={uninstallBlockPosition}
              size={uninstallBlockSize}
              selected={selectedBlockId === 'uninstall'}
              onSelect={() => onSelectedBlockChange?.('uninstall')}
              onItemConnectorClick={() => openAddNodePopover(uninstallItemBlockOutput, 'uninstall-item')}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, 'uninstall', event)}
              onInputDragStart={event => startInputDragDisconnect('uninstall', event)}
              inputConnected={isInputConnected('uninstall')}
              onDelete={deleteUninstallBlock}
              uninstallEnvOutput={meta.uninstallEnvOutput}
              uninstallEnvInput={meta.uninstallEnvInput}
              uninstallList={meta.uninstallList}
              linking={linkSourceBlockId === 'uninstall'}
              dragHandlers={createDragHandlers('uninstall', uninstallBlockPosition)}
              resizeHandlers={createResizeHandlers('uninstall')}
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
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, block.blockId, event)}
              onInputDragStart={event => startInputDragDisconnect(block.blockId, event)}
              inputConnected={isInputConnected(block.blockId)}
              onDelete={() => deleteComponentBlock(block.index)}
              component={meta.components[block.index] ?? defaultComponentMeta}
              linking={linkSourceBlockId === block.blockId}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
            />
          ))}
          {deploymentBlocks.map(block => (
            <DeploymentBlock
              key={block.blockId}
              blockIndex={block.index}
              position={block.position}
              size={block.size}
              selected={selectedBlockId === block.blockId}
              onSelect={() => onSelectedBlockChange?.(block.blockId)}
              onAddConnectorClick={() => openAddNodePopover(block.output)}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, block.blockId, event)}
              onInputDragStart={event => startInputDragDisconnect(block.blockId, event)}
              inputConnected={isInputConnected(block.blockId)}
              onDelete={() => deleteDeploymentBlock(block.index)}
              deployment={meta.deployments[block.index] ?? defaultDeploymentMeta}
              linking={linkSourceBlockId === block.blockId}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
            />
          ))}
          {configItemBlocks.map(block => (
            <ConfigItemBlock
              key={block.blockId}
              blockIndex={block.index}
              position={block.position}
              size={block.size}
              selected={selectedBlockId === block.blockId}
              onSelect={() => onSelectedBlockChange?.(block.blockId)}
              onAddConnectorClick={() => openAddNodePopover(block.output)}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, block.blockId, event)}
              onInputDragStart={event => startInputDragDisconnect(block.blockId, event)}
              inputConnected={isInputConnected(block.blockId)}
              onDelete={() => deleteConfigItemBlock(block.index)}
              configItem={meta.configItems[block.index] ?? defaultConfigItemMeta}
              linking={linkSourceBlockId === block.blockId}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
            />
          ))}
          {launchItemBlocks.map(block => (
            <LaunchItemBlock
              key={block.blockId}
              blockIndex={block.index}
              position={block.position}
              size={block.size}
              selected={selectedBlockId === block.blockId}
              onSelect={() => onSelectedBlockChange?.(block.blockId)}
              onAddConnectorClick={() => openAddNodePopover(block.output)}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, block.blockId, event)}
              onInputDragStart={event => startInputDragDisconnect(block.blockId, event)}
              inputConnected={isInputConnected(block.blockId)}
              onDelete={() => deleteLaunchItemBlock(block.index)}
              launchItem={meta.launchItems[block.index] ?? defaultLaunchItemMeta}
              linking={linkSourceBlockId === block.blockId}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
            />
          ))}
          {uninstallItemBlocks.map(block => (
            <UninstallItemBlock
              key={block.blockId}
              blockIndex={block.index}
              position={block.position}
              size={block.size}
              selected={selectedBlockId === block.blockId}
              onSelect={() => onSelectedBlockChange?.(block.blockId)}
              onAddConnectorClick={() => openAddNodePopover(block.output)}
              onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, block.blockId, event)}
              onInputDragStart={event => startInputDragDisconnect(block.blockId, event)}
              inputConnected={isInputConnected(block.blockId)}
              onDelete={() => deleteUninstallItemBlock(block.index)}
              uninstallItem={meta.uninstallItems[block.index] ?? defaultUninstallItemMeta}
              linking={linkSourceBlockId === block.blockId}
              dragHandlers={createDragHandlers(block.blockId, block.position)}
              resizeHandlers={createResizeHandlers(block.blockId)}
            />
          ))}
          {fileBlocks.map(block => {
            const blockId = block.blockId
            return (
              <FileBlock
                key={blockId}
                blockId={blockId}
                file={block.file}
                position={block.position}
                size={block.size}
                selected={selectedBlockId === blockId}
                onSelect={() => onSelectedBlockChange?.(blockId)}
                onBodyDoubleClick={() => openFileEditorForBlock(block.file)}
                onDelete={() => void deleteFileBlock(block.file)}
                onConnectorDragStart={(source, fromPoint, event) => startDragConnector(source, fromPoint, blockId, event)}
                dragHandlers={createDragHandlers(blockId, block.position)}
              />
            )
          })}
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
            configVisible={blockVisibility.config}
            launchVisible={blockVisibility.launch}
            uninstallVisible={blockVisibility.uninstall}
            source={addNodePopoverSource}
            onAddComponents={addComponentsBlock}
            onAddDeploy={addDeployBlock}
            onAddConfig={addConfigBlock}
            onAddLaunch={addLaunchBlock}
            onAddUninstall={addUninstallBlock}
            onAddComponent={addComponentBlock}
            onAddDeployment={addDeploymentBlock}
            onAddConfigItem={addConfigItemBlock}
            onAddLaunchItem={addLaunchItemBlock}
            onAddUninstallItem={addUninstallItemBlock}
            onAddFile={triggerFileImport}
            onAddNewFile={openNewFileDialog}
            onClose={() => {
              setAddNodePopoverPosition(null)
              setAddNodePopoverSource(null)
            }}
          />
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept={WORKBENCH_FILE_EXTENSIONS.join(',')}
        onChange={handleFileInputChange}
      />

      {fileImportError && (
        <div
          className="absolute right-4 top-4 z-30 max-w-sm rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm text-red-100 shadow-lg"
          role="alert"
        >
          {fileImportError}
          <button
            type="button"
            className="ml-3 text-red-100/80 underline hover:text-red-50"
            onClick={() => setFileImportError(null)}
          >
            关闭
          </button>
        </div>
      )}

      <FileConflictDialog
        open={pendingFileConflict !== null}
        conflictingName={pendingFileConflict?.file.name ?? ''}
        suggestedName={pendingFileConflict?.suggestedName ?? ''}
        onResolve={handleFileConflictResolve}
      />

      <NewFileDialog
        open={newFileDialogOpen}
        submitting={newFileSubmitting}
        errorMessage={newFileError}
        conflictState={newFileConflict}
        onClose={closeNewFileDialog}
        onCreate={payload => void processNewFile(payload, null)}
        onConflictResolve={handleNewFileConflictResolve}
      />
    </>
  )
}
