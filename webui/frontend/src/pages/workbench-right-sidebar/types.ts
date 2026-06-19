import type {
  WorkbenchBlockId,
  WorkbenchComponentMeta,
  WorkbenchConfigItemMeta,
  WorkbenchCustomInstallRule,
  WorkbenchDeploymentMeta,
  WorkbenchEnvVariableEntry,
  WorkbenchFileMeta,
  WorkbenchLaunchItemMeta,
  WorkbenchUninstallItemMeta,
  WorkbenchVersionFormattingRule,
} from '../workbench-canvas/types'

export interface WorkbenchModInfoMeta {
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

export interface WorkbenchRightSidebarProps {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  selectedName?: string
  selectedBlockId?: WorkbenchBlockId | null
  focusTarget?: { id: string; nonce: number } | null
  meta?: WorkbenchModInfoMeta
  bottomInset?: number
  onMetaPatch?: (patch: Partial<WorkbenchModInfoMeta>) => void
  onOpenFileEditor?: (fileId: string) => void
  onDeleteFile?: (fileId: string) => void
  hiddenFileBlockIds?: string[]
  onHiddenFileBlockIdsChange?: (next: string[]) => void
}

export interface ArrayListPresetOption {
  value: string
  name?: string
  label?: string
  description?: string
}

export interface ArrayListItem {
  id: string
  value: string
}

export interface VersionFormattingRuleItem {
  id: string
  value: WorkbenchVersionFormattingRule
}

export interface EnvVariableEntryItem {
  id: string
  value: WorkbenchEnvVariableEntry
}

export interface CustomInstallRuleItem {
  id: string
  value: WorkbenchCustomInstallRule
}
