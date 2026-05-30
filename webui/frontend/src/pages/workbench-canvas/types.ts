import type { PointerEvent } from 'react'

export const workbenchCanvasFont = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"

export interface WorkbenchCanvasViewport {
  scale: number
  x: number
  y: number
}

export interface WorkbenchBlockMeta {
  author: string
  tags: string[]
  description: string
  modId: string
  modName: string
  version: string
  minVersion: string
  maxVersion: string
  fileImport: boolean | null
  fileImportList: string[]
  runtime: string
  denoNet: boolean | null
  denoRead: boolean | null
  denoWrite: boolean | null
  denoEnv: boolean | null
  denoRun: boolean | null
  denoHrtime: boolean | null
  denoFfi: boolean | null
  denoSys: boolean | null
  denoAll: boolean | null
  denoCustomPermissions: boolean | null
  denoPermissionList: string[]
  platforms: string[]
  schemaVersion: string
  componentsEnvOutput: boolean | null
  componentsEnvInput: boolean | null
  componentsList: string[]
  components: WorkbenchComponentMeta[]
}

export interface WorkbenchComponentMeta {
  name: string
  id: string
  choose: boolean | null
  runtime: string
  commandTheme: string
  install: boolean | null
  check: boolean | null
  checkCommand: string[]
  checkVersionContains: string[]
  checkVersionRegex: string[]
  commandInstall: boolean | null
  installCommandList: string[]
  getMethod: string
  directLink: string
  getVersion: string
  githubRepo: string
  getLink: string
  getLinkProvideList: string[]
  userChoose: boolean | null
  chooseList: string[]
  formatVersion: boolean | null
  versionFormattingFormula: WorkbenchVersionFormattingRule[]
  installOperate: string
  installCustomList: string[]
  installPath: string
  customPath: string
  splicingLink: string
  beforeCommand: boolean | null
  beforeCommandList: string[]
  afterCommand: boolean | null
  afterCommandList: string[]
  envOutput: boolean | null
  envOutputList: string[]
  envInput: boolean | null
  envInputList: string[]
}

export interface WorkbenchVersionFormattingRule {
  match: string
  replace: string
}

export interface WorkbenchPoint {
  x: number
  y: number
}

export interface WorkbenchAddNodeAnchor {
  id: number
  point: WorkbenchPoint
}

export interface WorkbenchSize {
  width: number
  height: number
}

export interface WorkbenchCanvasProps {
  viewport: WorkbenchCanvasViewport
  addNodeAnchor?: WorkbenchAddNodeAnchor | null
  selectedBlockId?: WorkbenchBlockId | null
  onSelectedBlockChange?: (blockId: WorkbenchBlockId | null) => void
  visibleBlocks?: Partial<WorkbenchVisibleBlocks>
  onVisibleBlocksChange?: (patch: Partial<WorkbenchVisibleBlocks>) => void
  blockMeta?: Partial<WorkbenchBlockMeta>
}

export type WorkbenchComponentBlockId = `component:${number}`
export type WorkbenchBlockId = 'start' | 'init' | 'components' | WorkbenchComponentBlockId

export interface WorkbenchVisibleBlocks {
  components: boolean
  componentCount: number
}

export interface WorkbenchBlockDragHandlers {
  onHeaderPointerDown?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerMove?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerUp?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerCancel?: (event: PointerEvent<SVGGElement>) => void
}

export type WorkbenchResizeDirection = 'right' | 'bottom' | 'corner'

export interface WorkbenchBlockResizeHandlers {
  onResizePointerDown?: (direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => void
  onResizePointerMove?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerUp?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerCancel?: (event: PointerEvent<SVGRectElement>) => void
}
