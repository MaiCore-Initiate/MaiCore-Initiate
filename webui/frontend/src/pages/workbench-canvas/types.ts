import type { MouseEvent, PointerEvent } from 'react'

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
  fileImport: boolean
  fileImportList: string[]
  runtime: string
  denoNet: boolean
  denoRead: boolean
  denoWrite: boolean
  denoEnv: boolean
  denoRun: boolean
  denoHrtime: boolean
  denoFfi: boolean
  denoSys: boolean
  denoAll: boolean
  denoCustomPermissions: boolean
  denoPermissionList: string[]
  platforms: string[]
  schemaVersion: string
  componentsEnvOutput: boolean
  componentsEnvInput: boolean
  componentsList: string[]
  components: WorkbenchComponentMeta[]
  deployEnvOutput: boolean
  deployEnvInput: boolean
  deployList: string[]
  deployments: WorkbenchDeploymentMeta[]
  configEnvOutput: boolean
  configEnvInput: boolean
  configList: string[]
  configItems: WorkbenchConfigItemMeta[]
  launchEnvOutput: boolean
  launchEnvInput: boolean
  launchList: string[]
  launchItems: WorkbenchLaunchItemMeta[]
  uninstallEnvOutput: boolean
  uninstallEnvInput: boolean
  uninstallList: string[]
  uninstallItems: WorkbenchUninstallItemMeta[]
  files: WorkbenchFileMeta[]
}

export interface WorkbenchComponentMeta {
  name: string
  id: string
  choose: boolean
  runtime: string
  commandTheme: string
  install: boolean
  check: boolean
  checkCommand: string[]
  checkVersionContains: string[]
  checkVersionRegex: string[]
  commandInstall: boolean
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
  userChoose: boolean
  chooseList: string[]
  formatVersion: boolean
  versionFormattingFormula: WorkbenchVersionFormattingRule[]
  installOperate: string
  installCustomList: string[]
  installPath: string
  customPath: string
  splicingLink: string
  beforeCommand: boolean
  beforeCommandList: string[]
  afterCommand: boolean
  afterCommandList: string[]
  envOutput: boolean
  envOutputList: WorkbenchEnvVariableEntry[]
  envInput: boolean
  envInputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchDeploymentMeta {
  name: string
  id: string
  choose: boolean
  runtime: string
  commandTheme: string
  deploy: boolean
  commandDeploy: boolean
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
  userChoose: boolean
  chooseList: string[]
  formatVersion: boolean
  versionFormattingFormula: WorkbenchVersionFormattingRule[]
  deployPath: string
  customPath: string
  beforeCommand: boolean
  beforeCommandList: string[]
  afterCommand: boolean
  afterCommandList: string[]
  splicingLink: string
  envOutput: boolean
  envOutputList: WorkbenchEnvVariableEntry[]
  envInput: boolean
  envInputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchVersionFormattingRule {
  match: string
  replace: string
}

export interface WorkbenchConfigItemMeta {
  id: string
  name: string
  runtime: string
  commandTheme: string
  filePath: string
  choose: boolean
  envInput: boolean
  envInputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchLaunchItemMeta {
  id: string
  name: string
  choose: boolean
  runtime: string
  commandTheme: string
  launch: boolean
  launchCommand: string[]
  envInput: boolean
  envInputList: WorkbenchEnvVariableEntry[]
  envOutput: boolean
  envOutputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchUninstallItemMeta {
  id: string
  name: string
  choose: boolean
  runtime: string
  commandTheme: string
  uninstall: boolean
  stopBeforeUninstall: boolean
  stopCommandList: string[]
  removeInstanceConfig: boolean
  removeRuntimeFiles: boolean
  removeDeployRoot: boolean
  removeComponent: boolean
  deploymentTargets: string[]
  componentTargets: string[]
  beforeCommand: boolean
  beforeCommandList: string[]
  afterCommand: boolean
  afterCommandList: string[]
  envInput: boolean
  envInputList: WorkbenchEnvVariableEntry[]
  envOutput: boolean
  envOutputList: WorkbenchEnvVariableEntry[]
}

export interface WorkbenchEnvVariableEntry {
  name: string
  value: string
}

export interface WorkbenchPoint {
  x: number
  y: number
}

export type WorkbenchConnectionSource = 'init-components' | 'components-deploy' | 'components-component' | 'deploy-deployment' | 'deploy-config' | 'config-item' | 'config-launch' | 'launch-item' | 'launch-uninstall' | 'uninstall-item' | 'component-output' | 'deployment-output' | 'config-item-output' | 'launch-item-output' | 'uninstall-item-output' | 'disconnect'

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
  onBlockMetaPatch?: (patch: Partial<WorkbenchBlockMeta>) => void
  onOpenFileEditor?: (fileId: string) => void
  projectSequence?: string | null
}

export type WorkbenchComponentBlockId = `component:${number}`
export type WorkbenchDeploymentBlockId = `deployment:${number}`
export type WorkbenchConfigItemBlockId = `config-item:${number}`
export type WorkbenchLaunchItemBlockId = `launch-item:${number}`
export type WorkbenchUninstallItemBlockId = `uninstall-item:${number}`
export type WorkbenchFileBlockId = `file:${string}`
export type WorkbenchBlockId = 'start' | 'init' | 'components' | 'deploy' | 'config' | 'launch' | 'uninstall' | WorkbenchComponentBlockId | WorkbenchDeploymentBlockId | WorkbenchConfigItemBlockId | WorkbenchLaunchItemBlockId | WorkbenchUninstallItemBlockId | WorkbenchFileBlockId

export const WORKBENCH_FILE_EXTENSIONS = [
  '.py', '.cmd', '.bat', '.ps1', '.sh', '.js', '.ts',
  '.json', '.txt', '.jsonl', '.log', '.java', '.jar', '.toml', '.exe',
  '.yaml', '.xml',
] as const

export type WorkbenchFileExtension = (typeof WORKBENCH_FILE_EXTENSIONS)[number]

export type WorkbenchFileLanguage =
  | 'python'
  | 'powershell'
  | 'shell'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'plaintext'
  | 'java'
  | 'ini'
  | 'xml'
  | 'yaml'

export interface WorkbenchFileMeta {
  id: string
  name: string
  path: string
  size: number
  modifiedAt: string
  binary: boolean
  language: WorkbenchFileLanguage
}

export function parseFileBlockId(blockId: WorkbenchBlockId | null | undefined): string | null {
  if (!blockId?.startsWith('file:')) return null
  return blockId.slice('file:'.length)
}

export function createFileBlockId(fileId: string): WorkbenchFileBlockId {
  return `file:${fileId}` as WorkbenchFileBlockId
}

export interface WorkbenchVisibleBlocks {
  components: boolean
  deploy: boolean
  config: boolean
  launch: boolean
  uninstall: boolean
  componentCount: number
  deploymentCount: number
  configItemCount: number
  launchItemCount: number
  uninstallItemCount: number
}

export interface WorkbenchBlockDragHandlers {
  onHeaderPointerDown?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerMove?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerUp?: (event: PointerEvent<SVGGElement>) => void
  onHeaderPointerCancel?: (event: PointerEvent<SVGGElement>) => void
  onHeaderDoubleClick?: (event: MouseEvent<SVGGElement>) => void
}

export type WorkbenchResizeDirection = 'right' | 'bottom' | 'corner'

export interface WorkbenchBlockResizeHandlers {
  onResizePointerDown?: (direction: WorkbenchResizeDirection, event: PointerEvent<SVGRectElement>) => void
  onResizePointerMove?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerUp?: (event: PointerEvent<SVGRectElement>) => void
  onResizePointerCancel?: (event: PointerEvent<SVGRectElement>) => void
}
