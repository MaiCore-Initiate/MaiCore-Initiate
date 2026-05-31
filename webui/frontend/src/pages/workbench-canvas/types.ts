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
  deployEnvOutput: boolean | null
  deployEnvInput: boolean | null
  deployList: string[]
  deployments: WorkbenchDeploymentMeta[]
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
  versionFile: string[]
  versionCustom: string[]
  getLink: string
  getLinkProvideList: string[]
  linkFile: string[]
  linkCustom: string[]
  denoPermissions: string[]
  jvm: string[]
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
  envOutputList: WorkbenchEnvVariableEntry[]
  envInput: boolean | null
  envInputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchDeploymentMeta {
  name: string
  id: string
  choose: boolean | null
  runtime: string
  commandTheme: string
  deploy: boolean | null
  commandDeploy: boolean | null
  deployCommandList: string[]
  deployMethod: string
  baseLink: string
  getMethod: string
  getVersion: string
  githubRepo: string
  versionFile: string[]
  versionCustom: string[]
  getLink: string
  getLinkProvideList: string[]
  linkFile: string[]
  linkCustom: string[]
  denoPermissions: string[]
  jvm: string[]
  userChoose: boolean | null
  chooseList: string[]
  formatVersion: boolean | null
  versionFormattingFormula: WorkbenchVersionFormattingRule[]
  deployPath: string
  customPath: string
  beforeCommand: boolean | null
  beforeCommandList: string[]
  afterCommand: boolean | null
  afterCommandList: string[]
  splicingLink: string
  envOutput: boolean | null
  envOutputList: WorkbenchEnvVariableEntry[]
  envInput: boolean | null
  envInputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchVersionFormattingRule {
  match: string
  replace: string
}

export interface WorkbenchEnvVariableEntry {
  name: string
  value: string
}

export interface WorkbenchPoint {
  x: number
  y: number
}

export type WorkbenchConnectionSource = 'init-components' | 'components-deploy' | 'components-component' | 'deploy-deployment'

export interface WorkbenchAddNodeAnchor {
  id: number
  point: WorkbenchPoint
  source?: WorkbenchConnectionSource | null
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
export type WorkbenchDeploymentBlockId = `deployment:${number}`
export type WorkbenchBlockId = 'start' | 'init' | 'components' | 'deploy' | WorkbenchComponentBlockId | WorkbenchDeploymentBlockId

export interface WorkbenchVisibleBlocks {
  components: boolean
  deploy: boolean
  componentCount: number
  deploymentCount: number
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