import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowLeft, Bug, Cpu, Plus } from 'lucide-react'
import WorkbenchBottomBar from './WorkbenchBottomBar'
import WorkbenchRightSidebar from './workbench-right-sidebar/WorkbenchRightSidebar'
import WorkbenchRuntimePanel, {
  type WorkbenchRunFormField,
  type WorkbenchRunInputValue,
  type WorkbenchRunProgress,
  type WorkbenchRunStartOptions,
} from './workbench-right-sidebar/WorkbenchRuntimePanel'
import WorkbenchDebugPanel, {
  type WorkbenchDebugBlockOption,
  type WorkbenchDebugProcess,
  type WorkbenchDebugSession,
  type WorkbenchDebugStartOptions,
} from './workbench-right-sidebar/WorkbenchDebugPanel'
import WorkbenchDebugTimelineDrawer from './workbench-debug-timeline/WorkbenchDebugTimelineDrawer'
import { rightSidebarCollapsedWidth, rightSidebarExpandedWidth } from './workbench-right-sidebar/constants'
import type { WorkbenchModInfoMeta } from './workbench-right-sidebar/types'
import WorkbenchTopTabs from './WorkbenchTopTabs'
import WorkbenchCanvas from './workbench-canvas/WorkbenchCanvas'
import WorkbenchTransientEditor from './workbench-transient-editor/WorkbenchTransientEditor'
import FileEditorModal from './FileEditorModal'
import type { WorkbenchAddNodeAnchor, WorkbenchBlockId, WorkbenchCanvasState, WorkbenchComponentBlockId, WorkbenchComponentMeta, WorkbenchConfigItemBlockId, WorkbenchConfigItemMeta, WorkbenchCustomInstallRule, WorkbenchDeploymentBlockId, WorkbenchDeploymentMeta, WorkbenchEnvVariableEntry, WorkbenchFileMeta, WorkbenchLaunchItemBlockId, WorkbenchLaunchItemMeta, WorkbenchPoint, WorkbenchUninstallItemBlockId, WorkbenchUninstallItemMeta, WorkbenchVersionFormattingRule, WorkbenchVisibleBlocks } from './workbench-canvas/types'

const outlineFont = "'JetBrainsMono Nerd Font', 'HarmonyOS Sans SC', monospace"
const gridBaseSpacing = 32
const gridMinScreenSpacing = 16
const gridMaxScreenSpacing = 48
const workbenchMinZoom = 0.08
const workbenchMaxZoom = 8
const leftSidebarDefaultWidth = 305
const leftSidebarCollapsedWidth = 70
const leftSidebarMinWidth = 230
const leftSidebarMaxWidth = 520
const outlineRowHeight = 24
const outlineIndent = 10
const outlineBaseCaretLeft = 8
const outlineBaseIconLeft = 36
const outlineBaseTextLeft = 25.84
const outlineIconTextGap = 19.84
const bottomBarZoomAnimationMs = 180
const baseBlockNames = {
  start: '起始端点',
  init: '初始化块',
  components: '[COMPONENTS]',
  deploy: '[DEPLOY]',
  config: '[CONFIG]',
  launch: '[LAUNCH]',
  uninstall: '[UNINSTALL]',
}

type WorkbenchViewport = { scale: number; x: number; y: number }
const defaultVisibleBlocks: WorkbenchVisibleBlocks = { components: false, deploy: false, config: false, launch: false, uninstall: false, componentCount: 0, deploymentCount: 0, configItemCount: 0, launchItemCount: 0, uninstallItemCount: 0 }

export type OutlineIconType = 'boolean' | 'array' | 'object' | 'string' | 'number'
export type OutlineNodeTone = 'normal' | 'locked' | 'note'

export interface OutlineNode {
  id: string
  label: string
  icon?: OutlineIconType
  trailingIcon?: OutlineIconType
  children?: OutlineNode[]
  defaultExpanded?: boolean
  defaultSelected?: boolean
  tone?: OutlineNodeTone
  selectable?: boolean
  blockId?: WorkbenchBlockId
}

export interface DeploymentFlowWorkbenchProps {
  onBackToLibrary: () => void
  outline?: OutlineNode[]
  projectSequence?: string
}

interface WorkbenchProjectInfo {
  sequence: string
  mod_name: string
  path: string
  mod_id?: string
  description?: string
  author?: string
  cover?: string | null
  files?: WorkbenchFileMeta[]
  workbench_meta?: Partial<WorkbenchMetaState> | null
  visible_blocks?: Partial<WorkbenchVisibleBlocks> | null
  workbench_canvas_state?: Partial<WorkbenchCanvasState> | null
}

type WorkbenchMetaState = WorkbenchModInfoMeta

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
const emptyConfigItemMeta: WorkbenchConfigItemMeta = {
  id: '',
  name: '',
  runtime: '',
  commandTheme: 'classical',
  filePath: '',
  choose: false,
  envInput: false,
  envInputList: [],
}

const emptyLaunchItemMeta: WorkbenchLaunchItemMeta = {
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

const emptyUninstallItemMeta: WorkbenchUninstallItemMeta = {
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
const defaultWorkbenchMeta: WorkbenchMetaState = {
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

function serializeTomlString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function serializeTomlStringArray(values: string[]) {
  return `[${values.map(serializeTomlString).join(', ')}]`
}

function serializeTomlVersionFormattingRule(value: WorkbenchVersionFormattingRule) {
  return `{match = ${serializeTomlString(value.match)}, replace = ${serializeTomlString(value.replace)}}`
}

function serializeTomlEnvVariableEntry(value: WorkbenchEnvVariableEntry) {
  return `{name = ${serializeTomlString(value.name)}, value = ${serializeTomlString(value.value)}}`
}

function serializeTomlInlineTableArray<T>(values: T[], formatter: (value: T) => string) {
  return `[${values.map(formatter).join(', ')}]`
}

function appendTomlString(lines: string[], key: string, value: string) {
  lines.push(`${key} = ${serializeTomlString(value)}`)
}

function appendTomlBoolean(lines: string[], key: string, value: boolean) {
  lines.push(`${key} = ${formatTomlBoolean(value)}`)
}

function appendTomlStringArray(lines: string[], key: string, values: string[]) {
  lines.push(`${key} = ${serializeTomlStringArray(values)}`)
}

function appendTomlEnvVariableArray(lines: string[], key: string, values: WorkbenchEnvVariableEntry[]) {
  lines.push(`${key} = ${serializeTomlInlineTableArray(values, serializeTomlEnvVariableEntry)}`)
}

function appendTomlVersionFormattingArray(lines: string[], key: string, values: WorkbenchVersionFormattingRule[]) {
  lines.push(`${key} = ${serializeTomlInlineTableArray(values, serializeTomlVersionFormattingRule)}`)
}

function appendTomlCustomInstallArray(lines: string[], key: string, values: WorkbenchCustomInstallRule[]) {
  lines.push(`${key} = ${serializeTomlInlineTableArray(values, value => `{extension = ${serializeTomlString(value.extension)}, operate = ${formatTomlBoolean(value.operate)}}`)}`)
}

function formatTomlString(value: string) {
  return value ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
}

function formatTomlArray(values: string[]) {
  return `[${values.map(formatTomlString).join(', ')}]`
}

function hasDenoCustomSource(values: string[]) {
  return values.some(value => value.toLowerCase().includes('.ts'))
}

function hasJvmCustomSource(values: string[]) {
  return values.some(value => {
    const normalized = value.toLowerCase()
    return normalized.includes('.java') || normalized.includes('.jar')
  })
}

function formatTomlVersionFormattingRule(value: WorkbenchVersionFormattingRule) {
  return `{match = ${formatTomlString(value.match)}, replace = ${formatTomlString(value.replace)}}`
}

function formatTomlEnvVariableEntry(value: WorkbenchEnvVariableEntry) {
  return `{name = ${formatTomlString(value.name)}, value = ${formatTomlString(value.value)}}`
}

function formatTomlCustomInstallRule(value: WorkbenchCustomInstallRule) {
  return `{extension = ${formatTomlString(value.extension)}, operate = ${formatTomlBoolean(value.operate)}}`
}

function formatTomlInlineTableArray<T>(values: T[], formatter: (value: T) => string) {
  return `[${values.map(formatter).join(', ')}]`
}

function formatTomlBoolean(value: boolean) {
  return value ? 'true' : 'false'
}

function createBooleanOutlineNode(id: string, fieldName: string, value: boolean): OutlineNode {
  return {
    id,
    label: `${fieldName} = ${formatTomlBoolean(value)}`,
    icon: 'boolean',
  }
}

function createStringArrayOutlineNode(id: string, fieldName: string, values: string[], defaultExpanded = false): OutlineNode {
  return {
    id,
    label: `${fieldName} = ${values.length ? formatTomlArray(values) : ''}`,
    icon: 'array',
    defaultExpanded,
    children: values.map((value, index) => ({
      id: `${id}-${index}`,
      label: `${index} = ${formatTomlString(value)}`,
      icon: 'string' as const,
    })),
  }
}

function createVersionFormattingOutlineNode(id: string, values: WorkbenchVersionFormattingRule[]): OutlineNode {
  return {
    id,
    label: `version_formatting_formula = ${values.length ? formatTomlInlineTableArray(values, formatTomlVersionFormattingRule) : ''}`,
    icon: 'object',
    defaultExpanded: true,
    children: values.map((value, index) => ({
      id: `${id}-${index}`,
      label: `${index}`,
      icon: 'object' as const,
      defaultExpanded: true,
      children: [
        {
          id: `${id}-${index}-match`,
          label: `match = ${formatTomlString(value.match)}`,
          icon: 'string' as const,
        },
        {
          id: `${id}-${index}-replace`,
          label: `replace = ${formatTomlString(value.replace)}`,
          icon: 'string' as const,
        },
      ],
    })),
  }
}

function createEnvVariableOutlineNode(id: string, fieldName: string, values: WorkbenchEnvVariableEntry[]): OutlineNode {
  return {
    id,
    label: `${fieldName} = ${values.length ? formatTomlInlineTableArray(values, formatTomlEnvVariableEntry) : ''}`,
    icon: 'object',
    defaultExpanded: true,
    children: values.map((value, index) => ({
      id: `${id}-${index}`,
      label: `${index}`,
      icon: 'object' as const,
      defaultExpanded: true,
      children: [
        {
          id: `${id}-${index}-name`,
          label: `name = ${formatTomlString(value.name)}`,
          icon: 'string' as const,
        },
        {
          id: `${id}-${index}-value`,
          label: `value = ${formatTomlString(value.value)}`,
          icon: 'string' as const,
        },
      ],
    })),
  }
}

function createCustomInstallRuleOutlineNode(id: string, values: WorkbenchCustomInstallRule[]): OutlineNode {
  return {
    id,
    label: `install_custom_list = ${values.length ? formatTomlInlineTableArray(values, formatTomlCustomInstallRule) : ''}`,
    icon: 'object',
    defaultExpanded: true,
    children: values.map((value, index) => ({
      id: `${id}-${index}`,
      label: `${index}`,
      icon: 'object' as const,
      defaultExpanded: true,
      children: [
        {
          id: `${id}-${index}-extension`,
          label: `extension = ${formatTomlString(value.extension)}`,
          icon: 'string' as const,
        },
        {
          id: `${id}-${index}-operate`,
          label: `operate = ${formatTomlBoolean(value.operate)}`,
          icon: 'boolean' as const,
        },
      ],
    })),
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

function formatSelectedBlockName(blockId: WorkbenchBlockId | null, meta: WorkbenchMetaState) {
  if (!blockId) return '无'
  const componentIndex = parseComponentBlockIndex(blockId)
  if (componentIndex !== null) {
    const componentName = meta.components[componentIndex]?.name
    return componentName ? `[[Component]] ${componentIndex}：${componentName}` : `[[Component]] ${componentIndex}`
  }
  const deploymentIndex = parseDeploymentBlockIndex(blockId)
  if (deploymentIndex !== null) {
    const deploymentName = meta.deployments[deploymentIndex]?.name
    return deploymentName ? `[[Deployment]] ${deploymentIndex}：${deploymentName}` : `[[Deployment]] ${deploymentIndex}`
  }
  const configItemIndex = parseConfigItemBlockIndex(blockId)
  if (configItemIndex !== null) {
    const configItemName = meta.configItems[configItemIndex]?.name
    return configItemName ? `[[ConfigItem]] ${configItemIndex}：${configItemName}` : `[[ConfigItem]] ${configItemIndex}`
  }
  const launchItemIndex = parseLaunchItemBlockIndex(blockId)
  if (launchItemIndex !== null) {
    const launchItemName = meta.launchItems[launchItemIndex]?.name
    return launchItemName ? `[[LaunchItem]] ${launchItemIndex}：${launchItemName}` : `[[LaunchItem]] ${launchItemIndex}`
  }
  const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
  if (uninstallItemIndex !== null) {
    const uninstallItemName = meta.uninstallItems[uninstallItemIndex]?.name
    return uninstallItemName ? `[[UninstallItem]] ${uninstallItemIndex}：${uninstallItemName}` : `[[UninstallItem]] ${uninstallItemIndex}`
  }
  if (blockId.startsWith('file:')) {
    const fileId = blockId.slice('file:'.length)
    const fileName = meta.files.find(file => file.id === fileId)?.name
    return fileName ? `文件：${fileName}` : '文件块'
  }
  return baseBlockNames[blockId as keyof typeof baseBlockNames] ?? blockId
}

function createDebugBlockOptions(meta: WorkbenchMetaState, connected: ConnectedIndexSets): WorkbenchDebugBlockOption[] {
  const options: WorkbenchDebugBlockOption[] = []
  if (connected.stages.components) {
    options.push({ value: 'components', label: '[COMPONENTS] 组件分区', stage: 'components' })
    connected.componentIndices.forEach(index => {
      const item = meta.components[index]
      options.push({ value: `component:${index}`, label: `组件 ${index}: ${item?.name || item?.id || '未命名'}`, stage: 'components' })
    })
  }
  if (connected.stages.deploy) {
    options.push({ value: 'deploy', label: '[DEPLOY] 部署分区', stage: 'deployments' })
    connected.deploymentIndices.forEach(index => {
      const item = meta.deployments[index]
      options.push({ value: `deployment:${index}`, label: `部署 ${index}: ${item?.name || item?.id || '未命名'}`, stage: 'deployments' })
    })
  }
  if (connected.stages.config) {
    options.push({ value: 'config', label: '[CONFIG] 配置分区', stage: 'configs' })
    connected.configItemIndices.forEach(index => {
      const item = meta.configItems[index]
      options.push({ value: `config-item:${index}`, label: `配置 ${index}: ${item?.name || item?.id || '未命名'}`, stage: 'configs' })
    })
  }
  if (connected.stages.launch) {
    options.push({ value: 'launch', label: '[LAUNCH] 启动分区', stage: 'launches' })
    connected.launchItemIndices.forEach(index => {
      const item = meta.launchItems[index]
      options.push({ value: `launch-item:${index}`, label: `启动 ${index}: ${item?.name || item?.id || '未命名'}`, stage: 'launches' })
    })
  }
  if (connected.stages.uninstall) {
    options.push({ value: 'uninstall', label: '[UNINSTALL] 卸载分区', stage: 'uninstalls' })
    connected.uninstallItemIndices.forEach(index => {
      const item = meta.uninstallItems[index]
      options.push({ value: `uninstall-item:${index}`, label: `卸载 ${index}: ${item?.name || item?.id || '未命名'}`, stage: 'uninstalls' })
    })
  }
  return options
}

function formatDebugDuration(durationMs?: number) {
  const value = Math.max(0, Math.round(durationMs ?? 0))
  if (value < 1000) return `${value}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function debugStatusColor(status?: string) {
  if (status === 'completed') return '#86efac'
  if (status === 'failed') return '#fca5a5'
  if (status === 'running') return '#93c5fd'
  if (status === 'paused') return '#fde68a'
  return 'rgba(226, 232, 240, 0.62)'
}

function createDenoPermissionOutlineChildren(meta: WorkbenchMetaState): OutlineNode[] {
  return [
    createBooleanOutlineNode('modinfo-deno-net', 'deno_net', meta.denoNet),
    createBooleanOutlineNode('modinfo-deno-read', 'deno_read', meta.denoRead),
    createBooleanOutlineNode('modinfo-deno-write', 'deno_write', meta.denoWrite),
    createBooleanOutlineNode('modinfo-deno-env', 'deno_env', meta.denoEnv),
    createBooleanOutlineNode('modinfo-deno-run', 'deno_run', meta.denoRun),
    createBooleanOutlineNode('modinfo-deno-hrtime', 'deno_hrtime', meta.denoHrtime),
    createBooleanOutlineNode('modinfo-deno-ffi', 'deno_ffi', meta.denoFfi),
    createBooleanOutlineNode('modinfo-deno-sys', 'deno_sys', meta.denoSys),
    createBooleanOutlineNode('modinfo-deno-all', 'deno_all', meta.denoAll),
    createBooleanOutlineNode('modinfo-deno-custom-permissions', 'deno_custom_permissions', meta.denoCustomPermissions),
    ...(meta.denoCustomPermissions === true
      ? [createStringArrayOutlineNode('modinfo-deno-permission-list', 'deno_permission_list', meta.denoPermissionList)]
      : []),
  ]
}

function createModInfoOutlineChildren(meta: WorkbenchMetaState): OutlineNode[] {
  return [
    { id: 'modinfo-author', label: `author = ${formatTomlString(meta.author)}`, icon: 'string' },
    createStringArrayOutlineNode('modinfo-tags', 'tags', meta.tags, true),
    { id: 'modinfo-description', label: `description = ${formatTomlString(meta.description)}`, icon: 'string' },
    { id: 'modinfo-mod-id', label: `mod_id = ${formatTomlString(meta.modId)}`, icon: 'string' },
    { id: 'modinfo-mod-name', label: `mod_name = ${formatTomlString(meta.modName)}`, icon: 'string' },
    { id: 'modinfo-version', label: `version = ${formatTomlString(meta.version)}`, icon: 'string' },
    { id: 'modinfo-min-version', label: `min_version = ${formatTomlString(meta.minVersion)}`, icon: 'string' },
    { id: 'modinfo-max-version', label: `max_version = ${formatTomlString(meta.maxVersion)}`, icon: 'string' },
    { id: 'modinfo-file-import', label: `file_import = ${meta.fileImport === null ? '' : meta.fileImport ? 'true' : 'false'}`, icon: 'boolean' },
    ...(meta.fileImport === true
      ? [createStringArrayOutlineNode('modinfo-file-import-list', 'file_import_list', meta.fileImportList)]
      : []),
    { id: 'modinfo-runtime', label: `runtime = ${formatTomlString(meta.runtime)}`, icon: 'string' },
    ...(meta.runtime === 'deno' ? createDenoPermissionOutlineChildren(meta) : []),
    createStringArrayOutlineNode('modinfo-platforms', 'platforms', meta.platforms, true),
    { id: 'modinfo-schema-version', label: `schema_version = ${formatTomlString(meta.schemaVersion)}`, icon: 'string' },
  ]
}

function createComponentOutlineChildren(component: WorkbenchComponentMeta, index: number): OutlineNode[] {
  const id = (fieldName: string) => `component-${index}-${fieldName}`
  const versionFile = component.versionFile ?? []
  const versionCustom = component.versionCustom ?? []
  const getLinkProvideList = component.getLinkProvideList ?? []
  const linkFile = component.linkFile ?? []
  const linkCustom = component.linkCustom ?? []
  const denoPermissions = component.denoPermissions ?? []
  const jvm = component.jvm ?? []

  return [
    { id: id('name'), label: `name = ${formatTomlString(component.name)}`, icon: 'string' },
    { id: id('id'), label: `id = ${formatTomlString(component.id)}`, icon: 'string' },
    ...(component.install === true ? [createBooleanOutlineNode(id('choose'), 'choose', component.choose)] : []),
    { id: id('runtime'), label: `runtime = ${formatTomlString(component.runtime)}`, icon: 'string' },
    { id: id('command-theme'), label: `command_theme = ${formatTomlString(component.commandTheme)}`, icon: 'string' },
    createBooleanOutlineNode(id('install'), 'install', component.install),
    createBooleanOutlineNode(id('check'), 'check', component.check),
    ...(component.check === true
      ? [
        createStringArrayOutlineNode(id('check-command'), 'check_command', component.checkCommand),
        createStringArrayOutlineNode(id('check-version-contains'), 'check_version_contains', component.checkVersionContains),
        createStringArrayOutlineNode(id('check-version-regex'), 'check_version_regex', component.checkVersionRegex),
      ]
      : []),
    ...(component.install === true ? [createBooleanOutlineNode(id('command-install'), 'command_install', component.commandInstall)] : []),
    ...(component.commandInstall === true
      ? [createStringArrayOutlineNode(id('install-command-list'), 'install_command_list', component.installCommandList)]
      : []),
    { id: id('get-method'), label: `get_method = ${formatTomlString(component.getMethod)}`, icon: 'string' },
    ...(component.getMethod === 'direct'
      ? [{ id: id('direct-link'), label: `direct_link = ${formatTomlString(component.directLink)}`, icon: 'string' as const }]
      : []),
    ...(component.getMethod === 'get_version'
      ? [
        { id: id('get-version'), label: `get_version = ${formatTomlString(component.getVersion)}`, icon: 'string' as const },
        ...(component.getVersion === 'github_repo'
          ? [{ id: id('github-repo'), label: `github_repo = ${formatTomlString(component.githubRepo)}`, icon: 'string' as const }]
          : []),
        ...(component.getVersion === 'filelink'
          ? [createStringArrayOutlineNode(id('version-file'), 'version_file', versionFile)]
          : []),
        ...(component.getVersion === 'custom'
          ? [
            createStringArrayOutlineNode(id('version-custom'), 'version_custom', versionCustom),
            ...(hasDenoCustomSource(versionCustom) ? [createStringArrayOutlineNode(id('deno-permissions'), 'deno_permissions', denoPermissions)] : []),
            ...(hasJvmCustomSource(versionCustom) ? [createStringArrayOutlineNode(id('jvm'), 'JVM', jvm)] : []),
          ]
          : []),
        createBooleanOutlineNode(id('format-version'), 'format_version', component.formatVersion),
        ...(component.formatVersion === true
          ? [createVersionFormattingOutlineNode(id('version-formatting-formula'), component.versionFormattingFormula)]
          : []),
        { id: id('splicing-link'), label: `splicing_link = ${formatTomlString(component.splicingLink)}`, icon: 'string' as const },
      ]
      : []),
    ...(component.getMethod === 'get_link'
      ? [
        { id: id('get-link'), label: `get_link = ${formatTomlString(component.getLink)}`, icon: 'string' as const },
        ...(component.getLink === 'filelink' || component.getLink === 'custom'
          ? [createStringArrayOutlineNode(id('get-link-provide-list'), 'get_link_provide_list', getLinkProvideList)]
          : []),
        ...(component.getLink === 'filelink' && getLinkProvideList.length === 0
          ? [createStringArrayOutlineNode(id('link-file'), 'link_file', linkFile)]
          : []),
        ...(component.getLink === 'custom' && getLinkProvideList.length === 0
          ? [
            createStringArrayOutlineNode(id('link-custom'), 'link_custom', linkCustom),
            ...(hasDenoCustomSource(linkCustom) ? [createStringArrayOutlineNode(id('deno-permissions'), 'deno_permissions', denoPermissions)] : []),
            ...(hasJvmCustomSource(linkCustom) ? [createStringArrayOutlineNode(id('jvm'), 'JVM', jvm)] : []),
          ]
          : []),
      ]
      : []),
    createBooleanOutlineNode(id('user-choose'), 'user_choose', component.userChoose),
    ...(component.userChoose === true ? [createStringArrayOutlineNode(id('choose-list'), 'choose_list', component.chooseList)] : []),
    ...(component.install === true && component.commandInstall !== true
      ? [
        { id: id('install-operate'), label: `install_operate = ${formatTomlString(component.installOperate)}`, icon: 'string' as const },
        ...(component.installOperate === 'custom'
          ? [createCustomInstallRuleOutlineNode(id('install-custom-list'), component.installCustomList)]
          : []),
      ]
      : []),
    ...(component.install === true
      ? [
        { id: id('install-path'), label: `install_path = ${formatTomlString(component.installPath)}`, icon: 'string' as const },
        ...(component.installPath === '$CustomPath'
          ? [{ id: id('custom-path'), label: `custom_path = ${formatTomlString(component.customPath)}`, icon: 'string' as const }]
          : []),
      ]
      : []),
    createBooleanOutlineNode(id('before-command'), 'before_command', component.beforeCommand),
    ...(component.beforeCommand === true
      ? [createStringArrayOutlineNode(id('before-command-list'), 'before_command_list', component.beforeCommandList)]
      : []),
    createBooleanOutlineNode(id('after-command'), 'after_command', component.afterCommand),
    ...(component.afterCommand === true
      ? [createStringArrayOutlineNode(id('after-command-list'), 'after_command_list', component.afterCommandList)]
      : []),
    createBooleanOutlineNode(id('env-output'), 'env_output', component.envOutput),
    ...(component.envOutput === true ? [createEnvVariableOutlineNode(id('env-output-list'), 'env_output_list', component.envOutputList)] : []),
    createBooleanOutlineNode(id('env-input'), 'env_input', component.envInput),
    ...(component.envInput === true ? [createEnvVariableOutlineNode(id('env-input-list'), 'env_input_list', component.envInputList)] : []),
  ]
}

function createDeploymentOutlineChildren(deployment: WorkbenchDeploymentMeta, index: number): OutlineNode[] {
  const id = (fieldName: string) => `deployment-${index}-${fieldName}`
  const versionFile = deployment.versionFile ?? []
  const versionCustom = deployment.versionCustom ?? []
  const getLinkProvideList = deployment.getLinkProvideList ?? []
  const linkFile = deployment.linkFile ?? []
  const linkCustom = deployment.linkCustom ?? []
  const denoPermissions = deployment.denoPermissions ?? []
  const jvm = deployment.jvm ?? []

  return [
    { id: id('name'), label: `name = ${formatTomlString(deployment.name)}`, icon: 'string' },
    { id: id('id'), label: `id = ${formatTomlString(deployment.id)}`, icon: 'string' },
    ...(deployment.deploy === true ? [createBooleanOutlineNode(id('choose'), 'choose', deployment.choose)] : []),
    { id: id('runtime'), label: `runtime = ${formatTomlString(deployment.runtime)}`, icon: 'string' },
    { id: id('command-theme'), label: `command_theme = ${formatTomlString(deployment.commandTheme)}`, icon: 'string' },
    createBooleanOutlineNode(id('deploy'), 'deploy', deployment.deploy),
    ...(deployment.deploy === true ? [createBooleanOutlineNode(id('command-deploy'), 'command_deploy', deployment.commandDeploy)] : []),
    ...(deployment.deploy === true && deployment.commandDeploy === true
      ? [createStringArrayOutlineNode(id('deploy-command-list'), 'deploy_command_list', deployment.deployCommandList)]
      : []),
    ...(deployment.deploy === true && deployment.commandDeploy !== true
      ? [
        { id: id('deploy-method'), label: `deploy_method = ${formatTomlString(deployment.deployMethod)}`, icon: 'string' as const },
        { id: id('base-link'), label: `base_link = ${formatTomlString(deployment.baseLink)}`, icon: 'string' as const },
        { id: id('get-method'), label: `get_method = ${formatTomlString(deployment.getMethod)}`, icon: 'string' as const },
        ...(deployment.getMethod === 'get_version'
          ? [
            { id: id('get-version'), label: `get_version = ${formatTomlString(deployment.getVersion)}`, icon: 'string' as const },
            ...(deployment.getVersion === 'github_repo'
              ? [{ id: id('github-repo'), label: `github_repo = ${formatTomlString(deployment.githubRepo)}`, icon: 'string' as const }]
              : []),
            ...(deployment.getVersion === 'filelink'
              ? [createStringArrayOutlineNode(id('version-file'), 'version_file', versionFile)]
              : []),
            ...(deployment.getVersion === 'custom'
              ? [
                createStringArrayOutlineNode(id('version-custom'), 'version_custom', versionCustom),
                ...(hasDenoCustomSource(versionCustom) ? [createStringArrayOutlineNode(id('deno-permissions'), 'deno_permissions', denoPermissions)] : []),
                ...(hasJvmCustomSource(versionCustom) ? [createStringArrayOutlineNode(id('jvm'), 'JVM', jvm)] : []),
              ]
              : []),
            createBooleanOutlineNode(id('format-version'), 'format_version', deployment.formatVersion),
            ...(deployment.formatVersion === true
              ? [createVersionFormattingOutlineNode(id('version-formatting-formula'), deployment.versionFormattingFormula)]
              : []),
            { id: id('splicing-link'), label: `splicing_link = ${formatTomlString(deployment.splicingLink)}`, icon: 'string' as const },
          ]
          : []),
        ...(deployment.getMethod === 'get_link'
          ? [
            { id: id('get-link'), label: `get_link = ${formatTomlString(deployment.getLink)}`, icon: 'string' as const },
            ...(deployment.getLink === 'filelink' || deployment.getLink === 'custom'
              ? [createStringArrayOutlineNode(id('get-link-provide-list'), 'get_link_provide_list', getLinkProvideList)]
              : []),
            ...(deployment.getLink === 'filelink' && getLinkProvideList.length === 0
              ? [createStringArrayOutlineNode(id('link-file'), 'link_file', linkFile)]
              : []),
            ...(deployment.getLink === 'custom' && getLinkProvideList.length === 0
              ? [
                createStringArrayOutlineNode(id('link-custom'), 'link_custom', linkCustom),
                ...(hasDenoCustomSource(linkCustom) ? [createStringArrayOutlineNode(id('deno-permissions'), 'deno_permissions', denoPermissions)] : []),
                ...(hasJvmCustomSource(linkCustom) ? [createStringArrayOutlineNode(id('jvm'), 'JVM', jvm)] : []),
              ]
              : []),
          ]
          : []),
        { id: id('deploy-path'), label: `deploy_path = ${formatTomlString(deployment.deployPath)}`, icon: 'string' as const },
        ...(deployment.deployPath === '$CustomPath'
          ? [{ id: id('custom-path'), label: `custom_path = ${formatTomlString(deployment.customPath)}`, icon: 'string' as const }]
          : []),
      ]
      : []),
    createBooleanOutlineNode(id('user-choose'), 'user_choose', deployment.userChoose),
    ...(deployment.userChoose === true ? [createStringArrayOutlineNode(id('choose-list'), 'choose_list', deployment.chooseList)] : []),
    createBooleanOutlineNode(id('before-command'), 'before_command', deployment.beforeCommand),
    ...(deployment.beforeCommand === true
      ? [createStringArrayOutlineNode(id('before-command-list'), 'before_command_list', deployment.beforeCommandList)]
      : []),
    createBooleanOutlineNode(id('after-command'), 'after_command', deployment.afterCommand),
    ...(deployment.afterCommand === true
      ? [createStringArrayOutlineNode(id('after-command-list'), 'after_command_list', deployment.afterCommandList)]
      : []),
    createBooleanOutlineNode(id('env-output'), 'env_output', deployment.envOutput),
    ...(deployment.envOutput === true ? [createEnvVariableOutlineNode(id('env-output-list'), 'env_output_list', deployment.envOutputList)] : []),
    createBooleanOutlineNode(id('env-input'), 'env_input', deployment.envInput),
    ...(deployment.envInput === true ? [createEnvVariableOutlineNode(id('env-input-list'), 'env_input_list', deployment.envInputList)] : []),
  ]
}

function createConfigItemOutlineChildren(configItem: WorkbenchConfigItemMeta, index: number): OutlineNode[] {
  const id = (fieldName: string) => `config-item-${index}-${fieldName}`

  return [
    { id: id('id'), label: `id = ${formatTomlString(configItem.id)}`, icon: 'string' },
    { id: id('name'), label: `name = ${formatTomlString(configItem.name)}`, icon: 'string' },
    { id: id('runtime'), label: `runtime = ${formatTomlString(configItem.runtime)}`, icon: 'string' },
    { id: id('command-theme'), label: `command_theme = ${formatTomlString(configItem.commandTheme)}`, icon: 'string' },
    { id: id('file-path'), label: `file_path = ${formatTomlString(configItem.filePath)}`, icon: 'string' },
    createBooleanOutlineNode(id('choose'), 'choose', configItem.choose),
    createBooleanOutlineNode(id('env-input'), 'env_input', configItem.envInput),
    ...(configItem.envInput === true ? [createEnvVariableOutlineNode(id('env-input-list'), 'env_input_list', configItem.envInputList)] : []),
  ]
}

function createLaunchItemOutlineChildren(launchItem: WorkbenchLaunchItemMeta, index: number): OutlineNode[] {
  const id = (fieldName: string) => `launch-item-${index}-${fieldName}`

  return [
    { id: id('id'), label: `id = ${formatTomlString(launchItem.id)}`, icon: 'string' },
    { id: id('name'), label: `name = ${formatTomlString(launchItem.name)}`, icon: 'string' },
    createBooleanOutlineNode(id('choose'), 'choose', launchItem.choose),
    { id: id('runtime'), label: `runtime = ${formatTomlString(launchItem.runtime)}`, icon: 'string' },
    { id: id('command-theme'), label: `command_theme = ${formatTomlString(launchItem.commandTheme)}`, icon: 'string' },
    createBooleanOutlineNode(id('launch'), 'launch', launchItem.launch),
    ...(launchItem.launch === true
      ? [createStringArrayOutlineNode(id('launch-command'), 'launch_command', launchItem.launchCommand)]
      : []),
    createBooleanOutlineNode(id('env-input'), 'env_input', launchItem.envInput),
    ...(launchItem.envInput === true ? [createEnvVariableOutlineNode(id('env-input-list'), 'env_input_list', launchItem.envInputList)] : []),
    createBooleanOutlineNode(id('env-output'), 'env_output', launchItem.envOutput),
    ...(launchItem.envOutput === true ? [createEnvVariableOutlineNode(id('env-output-list'), 'env_output_list', launchItem.envOutputList)] : []),
  ]
}

function createUninstallItemOutlineChildren(uninstallItem: WorkbenchUninstallItemMeta, index: number): OutlineNode[] {
  const id = (fieldName: string) => `uninstall-item-${index}-${fieldName}`

  return [
    { id: id('id'), label: `id = ${formatTomlString(uninstallItem.id)}`, icon: 'string' },
    { id: id('name'), label: `name = ${formatTomlString(uninstallItem.name)}`, icon: 'string' },
    createBooleanOutlineNode(id('choose'), 'choose', uninstallItem.choose),
    { id: id('runtime'), label: `runtime = ${formatTomlString(uninstallItem.runtime)}`, icon: 'string' },
    { id: id('command-theme'), label: `command_theme = ${formatTomlString(uninstallItem.commandTheme)}`, icon: 'string' },
    createBooleanOutlineNode(id('uninstall'), 'uninstall', uninstallItem.uninstall),
    createBooleanOutlineNode(id('stop-before-uninstall'), 'stop_before_uninstall', uninstallItem.stopBeforeUninstall),
    ...(uninstallItem.stopBeforeUninstall === true
      ? [createStringArrayOutlineNode(id('stop-command-list'), 'stop_command_list', uninstallItem.stopCommandList)]
      : []),
    createBooleanOutlineNode(id('remove-instance-config'), 'remove_instance_config', uninstallItem.removeInstanceConfig),
    createBooleanOutlineNode(id('remove-runtime-files'), 'remove_runtime_files', uninstallItem.removeRuntimeFiles),
    createBooleanOutlineNode(id('remove-deploy-root'), 'remove_deploy_root', uninstallItem.removeDeployRoot),
    createBooleanOutlineNode(id('remove-component'), 'remove_component', uninstallItem.removeComponent),
    ...(uninstallItem.removeDeployRoot === true
      ? [createStringArrayOutlineNode(id('deployment-targets'), 'deployment_targets', uninstallItem.deploymentTargets)]
      : []),
    ...(uninstallItem.removeComponent === true
      ? [createStringArrayOutlineNode(id('component-targets'), 'component_targets', uninstallItem.componentTargets)]
      : []),
    createBooleanOutlineNode(id('before-command'), 'before_command', uninstallItem.beforeCommand),
    ...(uninstallItem.beforeCommand === true
      ? [createStringArrayOutlineNode(id('before-command-list'), 'before_command_list', uninstallItem.beforeCommandList)]
      : []),
    createBooleanOutlineNode(id('after-command'), 'after_command', uninstallItem.afterCommand),
    ...(uninstallItem.afterCommand === true
      ? [createStringArrayOutlineNode(id('after-command-list'), 'after_command_list', uninstallItem.afterCommandList)]
      : []),
    createBooleanOutlineNode(id('env-input'), 'env_input', uninstallItem.envInput),
    ...(uninstallItem.envInput === true ? [createEnvVariableOutlineNode(id('env-input-list'), 'env_input_list', uninstallItem.envInputList)] : []),
    createBooleanOutlineNode(id('env-output'), 'env_output', uninstallItem.envOutput),
    ...(uninstallItem.envOutput === true ? [createEnvVariableOutlineNode(id('env-output-list'), 'env_output_list', uninstallItem.envOutputList)] : []),
  ]
}
interface ConnectedIndexSets {
  stages: {
    components: boolean
    deploy: boolean
    config: boolean
    launch: boolean
    uninstall: boolean
  }
  componentIndices: number[]
  deploymentIndices: number[]
  configItemIndices: number[]
  launchItemIndices: number[]
  uninstallItemIndices: number[]
}

function createComponentsOutlineNodes(meta: WorkbenchMetaState, connected: ConnectedIndexSets): OutlineNode[] {
  const nodes: OutlineNode[] = []

  if (connected.stages.components) {
    nodes.push({
      id: 'components',
      label: '[COMPONENTS]',
      defaultExpanded: true,
      children: [
        createBooleanOutlineNode('components-env-output', 'env_output', meta.componentsEnvOutput),
        createBooleanOutlineNode('components-env-input', 'env_input', meta.componentsEnvInput),
        createStringArrayOutlineNode('components-list', 'list', meta.componentsList, true),
      ],
    })
  }

  if (connected.componentIndices.length > 0) {
    nodes.push({
      id: 'component-array',
      label: '[[Component]]',
      defaultExpanded: true,
      selectable: false,
      children: connected.componentIndices.map(index => ({
        id: `component-${index}`,
        label: String(index),
        icon: 'object' as const,
        defaultExpanded: true,
        blockId: createComponentBlockId(index),
        children: createComponentOutlineChildren(meta.components[index] ?? defaultComponentMeta, index),
      })),
    })
  }

  if (connected.stages.deploy) {
    nodes.push({
      id: 'deploy',
      label: '[DEPLOY]',
      defaultExpanded: true,
      blockId: 'deploy',
      children: [
        createBooleanOutlineNode('deploy-env-output', 'env_output', meta.deployEnvOutput),
        createBooleanOutlineNode('deploy-env-input', 'env_input', meta.deployEnvInput),
        createStringArrayOutlineNode('deploy-list', 'list', meta.deployList, true),
      ],
    })
  }

  if (connected.deploymentIndices.length > 0) {
    nodes.push({
      id: 'deployment-array',
      label: '[[Deployment]]',
      defaultExpanded: true,
      selectable: false,
      children: connected.deploymentIndices.map(index => ({
        id: `deployment-${index}`,
        label: String(index),
        icon: 'object' as const,
        defaultExpanded: true,
        blockId: createDeploymentBlockId(index),
        children: createDeploymentOutlineChildren(meta.deployments[index] ?? defaultDeploymentMeta, index),
      })),
    })
  }

  if (connected.stages.config) {
    nodes.push({
      id: 'config',
      label: '[CONFIG]',
      defaultExpanded: true,
      blockId: 'config',
      children: [
        createBooleanOutlineNode('config-env-output', 'env_output', meta.configEnvOutput),
        createBooleanOutlineNode('config-env-input', 'env_input', meta.configEnvInput),
        createStringArrayOutlineNode('config-list', 'list', meta.configList, true),
      ],
    })
  }

  if (connected.configItemIndices.length > 0) {
    nodes.push({
      id: 'config-item-array',
      label: '[[ConfigItem]]',
      defaultExpanded: true,
      selectable: false,
      children: connected.configItemIndices.map(index => ({
        id: `config-item-${index}`,
        label: String(index),
        icon: 'object' as const,
        defaultExpanded: true,
        blockId: createConfigItemBlockId(index),
        children: createConfigItemOutlineChildren(meta.configItems[index] ?? emptyConfigItemMeta, index),
      })),
    })
  }

  if (connected.stages.launch) {
    nodes.push({
      id: 'launch',
      label: '[LAUNCH]',
      defaultExpanded: true,
      blockId: 'launch',
      children: [
        createBooleanOutlineNode('launch-env-output', 'env_output', meta.launchEnvOutput),
        createBooleanOutlineNode('launch-env-input', 'env_input', meta.launchEnvInput),
        createStringArrayOutlineNode('launch-list', 'list', meta.launchList, true),
      ],
    })
  }

  if (connected.launchItemIndices.length > 0) {
    nodes.push({
      id: 'launch-item-array',
      label: '[[LaunchItem]]',
      defaultExpanded: true,
      selectable: false,
      children: connected.launchItemIndices.map(index => ({
        id: `launch-item-${index}`,
        label: String(index),
        icon: 'object' as const,
        defaultExpanded: true,
        blockId: createLaunchItemBlockId(index),
        children: createLaunchItemOutlineChildren(meta.launchItems[index] ?? emptyLaunchItemMeta, index),
      })),
    })
  }

  if (connected.stages.uninstall) {
    nodes.push({
      id: 'uninstall',
      label: '[UNINSTALL]',
      defaultExpanded: true,
      blockId: 'uninstall',
      children: [
        createBooleanOutlineNode('uninstall-env-output', 'env_output', meta.uninstallEnvOutput),
        createBooleanOutlineNode('uninstall-env-input', 'env_input', meta.uninstallEnvInput),
        createStringArrayOutlineNode('uninstall-list', 'list', meta.uninstallList, true),
      ],
    })
  }

  if (connected.uninstallItemIndices.length > 0) {
    nodes.push({
      id: 'uninstall-item-array',
      label: '[[UninstallItem]]',
      defaultExpanded: true,
      selectable: false,
      children: connected.uninstallItemIndices.map(index => ({
        id: `uninstall-item-${index}`,
        label: String(index),
        icon: 'object' as const,
        defaultExpanded: true,
        blockId: createUninstallItemBlockId(index),
        children: createUninstallItemOutlineChildren(meta.uninstallItems[index] ?? emptyUninstallItemMeta, index),
      })),
    })
  }

  return nodes
}

function createOutline(meta: WorkbenchMetaState, connected: ConnectedIndexSets): OutlineNode[] {
  return [
    {
      id: 'mcstart',
      label: '[MCStart]',
      defaultExpanded: true,
      tone: 'locked',
      children: [
        { id: 'mcstart-enabled', label: 'MCStart = true', icon: 'boolean', tone: 'locked' },
      ],
    },
    {
      id: 'modinfo',
      label: '[MODINFO]',
      defaultExpanded: true,
      children: createModInfoOutlineChildren(meta),
    },
    ...createComponentsOutlineNodes(meta, connected),
  ]
}

function buildWorkbenchToml(meta: WorkbenchMetaState, connected: ConnectedIndexSets) {
  const lines: string[] = []

  lines.push('[MCStart]')
  appendTomlBoolean(lines, 'MCStart', true)
  lines.push('')

  lines.push('[MODINFO]')
  appendTomlString(lines, 'author', meta.author)
  appendTomlStringArray(lines, 'tags', meta.tags)
  appendTomlString(lines, 'description', meta.description)
  appendTomlString(lines, 'mod_id', meta.modId)
  appendTomlString(lines, 'mod_name', meta.modName)
  appendTomlString(lines, 'version', meta.version)
  appendTomlString(lines, 'min_version', meta.minVersion)
  appendTomlString(lines, 'max_version', meta.maxVersion)
  appendTomlBoolean(lines, 'file_import', meta.fileImport)
  appendTomlStringArray(lines, 'file_import_list', meta.fileImport ? meta.fileImportList : [])
  appendTomlString(lines, 'runtime', meta.runtime)
  if (meta.runtime === 'deno') {
    appendTomlBoolean(lines, 'deno_net', meta.denoNet)
    appendTomlBoolean(lines, 'deno_read', meta.denoRead)
    appendTomlBoolean(lines, 'deno_write', meta.denoWrite)
    appendTomlBoolean(lines, 'deno_env', meta.denoEnv)
    appendTomlBoolean(lines, 'deno_run', meta.denoRun)
    appendTomlBoolean(lines, 'deno_hrtime', meta.denoHrtime)
    appendTomlBoolean(lines, 'deno_ffi', meta.denoFfi)
    appendTomlBoolean(lines, 'deno_sys', meta.denoSys)
    appendTomlBoolean(lines, 'deno_all', meta.denoAll)
    appendTomlBoolean(lines, 'deno_custom_permissions', meta.denoCustomPermissions)
    if (meta.denoCustomPermissions) appendTomlStringArray(lines, 'deno_permission_list', meta.denoPermissionList)
  }
  appendTomlStringArray(lines, 'platforms', meta.platforms)
  appendTomlString(lines, 'schema_version', meta.schemaVersion)

  if (connected.stages.components || connected.componentIndices.length > 0) {
    lines.push('')
    lines.push('[COMPONENTS]')
    appendTomlBoolean(lines, 'env_output', meta.componentsEnvOutput)
    appendTomlBoolean(lines, 'env_input', meta.componentsEnvInput)
    appendTomlStringArray(lines, 'list', meta.componentsList)
  }

  Array.from(connected.componentIndices, index => meta.components[index] ?? defaultComponentMeta).forEach(component => {
    const versionFile = component.versionFile ?? []
    const versionCustom = component.versionCustom ?? []
    const linkFile = component.linkFile ?? []
    const linkCustom = component.linkCustom ?? []
    const getLinkProvideList = component.getLinkProvideList ?? []
    const denoPermissions = component.denoPermissions ?? []
    const jvm = component.jvm ?? []

    lines.push('')
    lines.push('[[Component]]')
    appendTomlString(lines, 'name', component.name)
    appendTomlString(lines, 'id', component.id)
    if (component.install) appendTomlBoolean(lines, 'choose', component.choose)
    appendTomlString(lines, 'runtime', component.runtime)
    appendTomlString(lines, 'command_theme', component.commandTheme)
    appendTomlBoolean(lines, 'install', component.install)
    appendTomlBoolean(lines, 'check', component.check)
    if (component.check) {
      appendTomlStringArray(lines, 'check_command', component.checkCommand)
      appendTomlStringArray(lines, 'check_version_contains', component.checkVersionContains)
      appendTomlStringArray(lines, 'check_version_regex', component.checkVersionRegex)
    }
    if (component.install) appendTomlBoolean(lines, 'command_install', component.commandInstall)
    if (component.commandInstall) appendTomlStringArray(lines, 'install_command_list', component.installCommandList)
    appendTomlString(lines, 'get_method', component.getMethod)
    if (component.getMethod === 'direct') appendTomlString(lines, 'direct_link', component.directLink)
    if (component.getMethod === 'get_version') {
      appendTomlString(lines, 'get_version', component.getVersion)
      if (component.getVersion === 'github_repo') appendTomlString(lines, 'github_repo', component.githubRepo)
      if (component.getVersion === 'filelink') appendTomlStringArray(lines, 'version_file', versionFile)
      if (component.getVersion === 'custom') {
        appendTomlStringArray(lines, 'version_custom', versionCustom)
        if (hasDenoCustomSource(versionCustom)) appendTomlStringArray(lines, 'deno_permissions', denoPermissions)
        if (hasJvmCustomSource(versionCustom)) appendTomlStringArray(lines, 'JVM', jvm)
      }
      appendTomlBoolean(lines, 'format_version', component.formatVersion)
      if (component.formatVersion) appendTomlVersionFormattingArray(lines, 'version_formatting_formula', component.versionFormattingFormula)
      appendTomlString(lines, 'splicing_link', component.splicingLink)
    }
    if (component.getMethod === 'get_link') {
      appendTomlString(lines, 'get_link', component.getLink)
      if (component.getLink === 'filelink' || component.getLink === 'custom') {
        appendTomlStringArray(lines, 'get_link_provide_list', getLinkProvideList)
      }
      if (component.getLink === 'filelink' && getLinkProvideList.length === 0) appendTomlStringArray(lines, 'link_file', linkFile)
      if (component.getLink === 'custom' && getLinkProvideList.length === 0) {
        appendTomlStringArray(lines, 'link_custom', linkCustom)
        if (hasDenoCustomSource(linkCustom)) appendTomlStringArray(lines, 'deno_permissions', denoPermissions)
        if (hasJvmCustomSource(linkCustom)) appendTomlStringArray(lines, 'JVM', jvm)
      }
    }
    appendTomlBoolean(lines, 'user_choose', component.userChoose)
    if (component.userChoose) appendTomlStringArray(lines, 'choose_list', component.chooseList)
    if (component.install && !component.commandInstall) {
      appendTomlString(lines, 'install_operate', component.installOperate)
      if (component.installOperate === 'custom') appendTomlCustomInstallArray(lines, 'install_custom_list', component.installCustomList)
    }
    if (component.install) {
      appendTomlString(lines, 'install_path', component.installPath)
      if (component.installPath === '$CustomPath') appendTomlString(lines, 'custom_path', component.customPath)
    }
    appendTomlBoolean(lines, 'before_command', component.beforeCommand)
    if (component.beforeCommand) appendTomlStringArray(lines, 'before_command_list', component.beforeCommandList)
    appendTomlBoolean(lines, 'after_command', component.afterCommand)
    if (component.afterCommand) appendTomlStringArray(lines, 'after_command_list', component.afterCommandList)
    appendTomlBoolean(lines, 'env_output', component.envOutput)
    if (component.envOutput) appendTomlEnvVariableArray(lines, 'env_output_list', component.envOutputList)
    appendTomlBoolean(lines, 'env_input', component.envInput)
    if (component.envInput) appendTomlEnvVariableArray(lines, 'env_input_list', component.envInputList)
  })

  if (connected.stages.deploy || connected.deploymentIndices.length > 0) {
    lines.push('')
    lines.push('[DEPLOY]')
    appendTomlBoolean(lines, 'env_output', meta.deployEnvOutput)
    appendTomlBoolean(lines, 'env_input', meta.deployEnvInput)
    appendTomlStringArray(lines, 'list', meta.deployList)
  }

  Array.from(connected.deploymentIndices, index => meta.deployments[index] ?? defaultDeploymentMeta).forEach(deployment => {
    const versionFile = deployment.versionFile ?? []
    const versionCustom = deployment.versionCustom ?? []
    const linkFile = deployment.linkFile ?? []
    const linkCustom = deployment.linkCustom ?? []
    const getLinkProvideList = deployment.getLinkProvideList ?? []
    const denoPermissions = deployment.denoPermissions ?? []
    const jvm = deployment.jvm ?? []

    lines.push('')
    lines.push('[[Deployment]]')
    appendTomlString(lines, 'name', deployment.name)
    appendTomlString(lines, 'id', deployment.id)
    appendTomlBoolean(lines, 'choose', deployment.choose)
    appendTomlString(lines, 'runtime', deployment.runtime)
    appendTomlString(lines, 'command_theme', deployment.commandTheme)
    appendTomlBoolean(lines, 'deploy', deployment.deploy)
    if (deployment.deploy) appendTomlBoolean(lines, 'command_deploy', deployment.commandDeploy)
    if (deployment.deploy && deployment.commandDeploy) appendTomlStringArray(lines, 'deploy_command_list', deployment.deployCommandList)
    if (deployment.deploy && !deployment.commandDeploy) {
      appendTomlString(lines, 'deploy_method', deployment.deployMethod)
      appendTomlString(lines, 'base_link', deployment.baseLink)
      appendTomlString(lines, 'get_method', deployment.getMethod)
      if (deployment.getMethod === 'get_version') {
        appendTomlString(lines, 'get_version', deployment.getVersion)
        if (deployment.getVersion === 'github_repo') appendTomlString(lines, 'github_repo', deployment.githubRepo)
        if (deployment.getVersion === 'filelink') appendTomlStringArray(lines, 'version_file', versionFile)
        if (deployment.getVersion === 'custom') {
          appendTomlStringArray(lines, 'version_custom', versionCustom)
          if (hasDenoCustomSource(versionCustom)) appendTomlStringArray(lines, 'deno_permissions', denoPermissions)
          if (hasJvmCustomSource(versionCustom)) appendTomlStringArray(lines, 'JVM', jvm)
        }
        appendTomlBoolean(lines, 'format_version', deployment.formatVersion)
        if (deployment.formatVersion) appendTomlVersionFormattingArray(lines, 'version_formatting_formula', deployment.versionFormattingFormula)
        appendTomlString(lines, 'splicing_link', deployment.splicingLink)
      }
      if (deployment.getMethod === 'get_link') {
        appendTomlString(lines, 'get_link', deployment.getLink)
        if (deployment.getLink === 'filelink' || deployment.getLink === 'custom') {
          appendTomlStringArray(lines, 'get_link_provide_list', getLinkProvideList)
        }
        if (deployment.getLink === 'filelink' && getLinkProvideList.length === 0) appendTomlStringArray(lines, 'link_file', linkFile)
        if (deployment.getLink === 'custom' && getLinkProvideList.length === 0) {
          appendTomlStringArray(lines, 'link_custom', linkCustom)
          if (hasDenoCustomSource(linkCustom)) appendTomlStringArray(lines, 'deno_permissions', denoPermissions)
          if (hasJvmCustomSource(linkCustom)) appendTomlStringArray(lines, 'JVM', jvm)
        }
      }
      appendTomlString(lines, 'deploy_path', deployment.deployPath)
      if (deployment.deployPath === '$CustomPath') appendTomlString(lines, 'custom_path', deployment.customPath)
    }
    appendTomlBoolean(lines, 'user_choose', deployment.userChoose)
    if (deployment.userChoose) appendTomlStringArray(lines, 'choose_list', deployment.chooseList)
    appendTomlBoolean(lines, 'before_command', deployment.beforeCommand)
    if (deployment.beforeCommand) appendTomlStringArray(lines, 'before_command_list', deployment.beforeCommandList)
    appendTomlBoolean(lines, 'after_command', deployment.afterCommand)
    if (deployment.afterCommand) appendTomlStringArray(lines, 'after_command_list', deployment.afterCommandList)
    appendTomlBoolean(lines, 'env_output', deployment.envOutput)
    if (deployment.envOutput) appendTomlEnvVariableArray(lines, 'env_output_list', deployment.envOutputList)
    appendTomlBoolean(lines, 'env_input', deployment.envInput)
    if (deployment.envInput) appendTomlEnvVariableArray(lines, 'env_input_list', deployment.envInputList)
  })

  if (connected.stages.launch || connected.launchItemIndices.length > 0) {
    lines.push('')
    lines.push('[LAUNCH]')
    appendTomlBoolean(lines, 'env_output', meta.launchEnvOutput)
    appendTomlBoolean(lines, 'env_input', meta.launchEnvInput)
    appendTomlStringArray(lines, 'list', meta.launchList)
  }

  Array.from(connected.launchItemIndices, index => meta.launchItems[index] ?? emptyLaunchItemMeta).forEach(launchItem => {
    lines.push('')
    lines.push('[[LaunchItem]]')
    appendTomlString(lines, 'id', launchItem.id)
    appendTomlString(lines, 'name', launchItem.name)
    appendTomlBoolean(lines, 'choose', launchItem.choose)
    appendTomlString(lines, 'runtime', launchItem.runtime)
    appendTomlString(lines, 'command_theme', launchItem.commandTheme)
    appendTomlBoolean(lines, 'launch', launchItem.launch)
    if (launchItem.launch) appendTomlStringArray(lines, 'launch_command', launchItem.launchCommand)
    appendTomlBoolean(lines, 'env_input', launchItem.envInput)
    if (launchItem.envInput) appendTomlEnvVariableArray(lines, 'env_input_list', launchItem.envInputList)
    appendTomlBoolean(lines, 'env_output', launchItem.envOutput)
    if (launchItem.envOutput) appendTomlEnvVariableArray(lines, 'env_output_list', launchItem.envOutputList)
  })

  if (connected.stages.config || connected.configItemIndices.length > 0) {
    lines.push('')
    lines.push('[CONFIG]')
    appendTomlBoolean(lines, 'env_output', meta.configEnvOutput)
    appendTomlBoolean(lines, 'env_input', meta.configEnvInput)
    appendTomlStringArray(lines, 'list', meta.configList)
  }

  Array.from(connected.configItemIndices, index => meta.configItems[index] ?? emptyConfigItemMeta).forEach(configItem => {
    lines.push('')
    lines.push('[[ConfigItem]]')
    appendTomlString(lines, 'id', configItem.id)
    appendTomlString(lines, 'name', configItem.name)
    appendTomlString(lines, 'runtime', configItem.runtime)
    appendTomlString(lines, 'command_theme', configItem.commandTheme)
    appendTomlString(lines, 'file_path', configItem.filePath)
    appendTomlBoolean(lines, 'choose', configItem.choose)
    appendTomlBoolean(lines, 'env_input', configItem.envInput)
    if (configItem.envInput) appendTomlEnvVariableArray(lines, 'env_input_list', configItem.envInputList)
  })

  if (connected.stages.uninstall || connected.uninstallItemIndices.length > 0) {
    lines.push('')
    lines.push('[UNINSTALL]')
    appendTomlBoolean(lines, 'env_output', meta.uninstallEnvOutput)
    appendTomlBoolean(lines, 'env_input', meta.uninstallEnvInput)
    appendTomlStringArray(lines, 'list', meta.uninstallList)
  }

  Array.from(connected.uninstallItemIndices, index => meta.uninstallItems[index] ?? emptyUninstallItemMeta).forEach(uninstallItem => {
    lines.push('')
    lines.push('[[UninstallItem]]')
    appendTomlString(lines, 'id', uninstallItem.id)
    appendTomlString(lines, 'name', uninstallItem.name)
    appendTomlBoolean(lines, 'choose', uninstallItem.choose)
    appendTomlString(lines, 'runtime', uninstallItem.runtime)
    appendTomlString(lines, 'command_theme', uninstallItem.commandTheme)
    appendTomlBoolean(lines, 'uninstall', uninstallItem.uninstall)
    appendTomlBoolean(lines, 'stop_before_uninstall', uninstallItem.stopBeforeUninstall)
    if (uninstallItem.stopBeforeUninstall) appendTomlStringArray(lines, 'stop_command_list', uninstallItem.stopCommandList)
    appendTomlBoolean(lines, 'remove_instance_config', uninstallItem.removeInstanceConfig)
    appendTomlBoolean(lines, 'remove_runtime_files', uninstallItem.removeRuntimeFiles)
    appendTomlBoolean(lines, 'remove_deploy_root', uninstallItem.removeDeployRoot)
    appendTomlBoolean(lines, 'remove_component', uninstallItem.removeComponent)
    appendTomlStringArray(lines, 'deployment_targets', uninstallItem.deploymentTargets)
    appendTomlStringArray(lines, 'component_targets', uninstallItem.componentTargets)
    appendTomlBoolean(lines, 'before_command', uninstallItem.beforeCommand)
    if (uninstallItem.beforeCommand) appendTomlStringArray(lines, 'before_command_list', uninstallItem.beforeCommandList)
    appendTomlBoolean(lines, 'after_command', uninstallItem.afterCommand)
    if (uninstallItem.afterCommand) appendTomlStringArray(lines, 'after_command_list', uninstallItem.afterCommandList)
    appendTomlBoolean(lines, 'env_output', uninstallItem.envOutput)
    if (uninstallItem.envOutput) appendTomlEnvVariableArray(lines, 'env_output_list', uninstallItem.envOutputList)
    appendTomlBoolean(lines, 'env_input', uninstallItem.envInput)
    if (uninstallItem.envInput) appendTomlEnvVariableArray(lines, 'env_input_list', uninstallItem.envInputList)
  })

  return `${lines.join('\n')}\n`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function resolveGridSpacing(scale: number) {
  let logicalSpacing = gridBaseSpacing
  let screenSpacing = logicalSpacing * scale

  while (screenSpacing < gridMinScreenSpacing) {
    logicalSpacing *= 2
    screenSpacing *= 2
  }

  while (screenSpacing > gridMaxScreenSpacing) {
    logicalSpacing /= 2
    screenSpacing /= 2
  }

  return { logicalSpacing, screenSpacing }
}

function mergeWorkbenchProgress(
  current: WorkbenchRunProgress | null,
  next: WorkbenchRunProgress,
): WorkbenchRunProgress {
  const merged = {
    ...(current ?? {}),
    ...next,
    logs: next.logs ?? current?.logs ?? [],
  }
  if (current && JSON.stringify(current) === JSON.stringify(merged)) return current
  return merged
}

function isWorkbenchRunDone(status?: string) {
  return status === 'completed' || status === 'failed'
}

function parseApiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function defaultWorkbenchRunInputValue(field: WorkbenchRunFormField): WorkbenchRunInputValue {
  if (field.field_type === 'boolean') return Boolean(field.default)
  return field.default === undefined || field.default === null ? '' : String(field.default)
}

function collectDefaultExpanded(nodes: OutlineNode[], result = new Set<string>()) {
  for (const node of nodes) {
    if (node.defaultExpanded) result.add(node.id)
    if (node.children) collectDefaultExpanded(node.children, result)
  }
  return result
}

function firstSelectableNode(nodes: OutlineNode[]): string {
  for (const node of nodes) {
    if (node.defaultSelected && node.selectable !== false) return node.id
    if (node.children) {
      const child = firstSelectableNode(node.children)
      if (child) return child
    }
  }

  for (const node of nodes) {
    if (node.selectable !== false) return node.id
    if (node.children) {
      const child = firstSelectableNode(node.children)
      if (child) return child
    }
  }
  return ''
}

interface FlattenedOutlineNode {
  node: OutlineNode
  depth: number
  hasChildren: boolean
  expanded: boolean
}

interface OutlineLineSegment {
  id: string
  depth: number
  startIndex: number
  endIndex: number
}

function flattenOutline(
  nodes: OutlineNode[],
  expanded: Set<string>,
  depth = 0,
): FlattenedOutlineNode[] {
  return nodes.flatMap(node => {
    const hasChildren = Boolean(node.children?.length)
    const isExpanded = hasChildren && expanded.has(node.id)
    const current = [{ node, depth, hasChildren, expanded: isExpanded }]
    if (!isExpanded || !node.children) return current
    return [...current, ...flattenOutline(node.children, expanded, depth + 1)]
  })
}

function collectOutlineLineSegments(flatNodes: FlattenedOutlineNode[]): OutlineLineSegment[] {
  return flatNodes.flatMap((item, index) => {
    if (!item.expanded) return []

    let lastDescendantIndex = index
    for (let nextIndex = index + 1; nextIndex < flatNodes.length; nextIndex += 1) {
      if (flatNodes[nextIndex].depth <= item.depth) break
      lastDescendantIndex = nextIndex
    }

    if (lastDescendantIndex === index) return []

    return [{
      id: `${item.node.id}-outline-line`,
      depth: item.depth,
      startIndex: index + 1,
      endIndex: lastDescendantIndex,
    }]
  })
}

function resolveOutlineBlockId(node: OutlineNode): WorkbenchBlockId | null {
  if (node.blockId) return node.blockId
  if (node.id === 'mcstart' || node.id.startsWith('mcstart-')) return 'start'
  if (node.id === 'modinfo' || node.id.startsWith('modinfo-')) return 'init'
  const componentMatch = /^component-(\d+)(?:-|$)/.exec(node.id)
  if (componentMatch) return createComponentBlockId(Number(componentMatch[1]))
  const deploymentMatch = /^deployment-(\d+)(?:-|$)/.exec(node.id)
  if (deploymentMatch) return createDeploymentBlockId(Number(deploymentMatch[1]))
  if (
    node.id === 'components'
    || node.id.startsWith('components-')
  ) {
    return 'components'
  }
  if (
    node.id === 'deploy'
    || node.id.startsWith('deploy-')
  ) {
    return 'deploy'
  }
  return null
}
function findOutlineNodeIdForBlock(nodes: OutlineNode[], blockId: WorkbenchBlockId): string {
  for (const node of nodes) {
    if (resolveOutlineBlockId(node) === blockId) return node.id
    if (node.children) {
      const childId = findOutlineNodeIdForBlock(node.children, blockId)
      if (childId) return childId
    }
  }
  return ''
}

function SidebarToolButton({
  left,
  top = 20,
  label,
  onClick,
  tone = 'default',
  children,
}: {
  left: number
  top?: number
  label: string
  onClick?: () => void
  tone?: 'default' | 'saving' | 'success' | 'error'
  children: ReactNode
}) {
  const isSaving = tone === 'saving'
  const isSuccess = tone === 'success'
  const isError = tone === 'error'
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-[transform,background-color,border-color,box-shadow] duration-200 hover:bg-[var(--dfw-control-hover)]"
      style={{
        left,
        top,
        borderColor: isSuccess
          ? 'rgba(34, 197, 94, 0.85)'
          : isError
            ? 'rgba(248, 113, 113, 0.9)'
            : isSaving
              ? 'rgba(96, 165, 250, 0.9)'
              : 'var(--dfw-sidebar-border)',
        background: isSuccess
          ? 'rgba(34, 197, 94, 0.14)'
          : isError
            ? 'rgba(248, 113, 113, 0.12)'
            : isSaving
              ? 'rgba(59, 130, 246, 0.16)'
              : 'var(--dfw-sidebar-bg)',
        color: isSuccess
          ? '#86efac'
          : isError
            ? '#fca5a5'
            : isSaving
              ? '#93c5fd'
              : 'var(--dfw-text)',
        transform: isSaving ? 'scale(1.06)' : isSuccess ? 'scale(1.08)' : 'scale(1)',
        boxShadow: isSaving
          ? '0 0 0 5px rgba(59, 130, 246, 0.12)'
          : isSuccess
            ? '0 0 0 5px rgba(34, 197, 94, 0.12)'
            : isError
              ? '0 0 0 5px rgba(248, 113, 113, 0.10)'
              : 'none',
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function TextAlignLeftGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 41 41" fill="none" aria-hidden>
      <path d="M9.5 13h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 18h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 23h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 28h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function SaveGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 41 41" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M9.5 0L31.5 0C36.7467 0 41 4.2533 41 9.5L41 31.5C41 36.7467 36.7467 41 31.5 41L9.5 41C4.2533 41 0 36.7467 0 31.5L0 9.5C0 4.2533 4.2533 0 9.5 0ZM9.5 1C4.80558 1 1 4.80558 1 9.5L1 31.5C1 36.1944 4.80558 40 9.5 40L31.5 40C36.1944 40 40 36.1944 40 31.5L40 9.5C40 4.80558 36.1944 1 31.5 1L9.5 1Z"
      />
      <path
        d="M31.5 15.9125L31.5 30.5C31.5 31.0523 31.0523 31.5 30.5 31.5L10.5 31.5C9.94772 31.5 9.5 31.0523 9.5 30.5L9.5 10.5C9.5 9.94772 9.94772 9.50001 10.5 9.50001L25.0875 9.50001C25.2201 9.49953 25.3474 9.55193 25.4412 9.64566L31.3543 15.5588C31.4481 15.6526 31.5005 15.7799 31.5 15.9125Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M14.5 31.5L14.5 23.5C14.5 22.9477 14.9477 22.5 15.5 22.5L25.5 22.5C26.0523 22.5 26.5 22.9477 26.5 23.5L26.5 31.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M23.5 13.5L16.5 13.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function OutlineTypeIcon({ type }: { type: OutlineIconType }) {
  if (type === 'boolean') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M12.75 6.25L15.25 8.75L12.75 11.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.75 8.75H15.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.25 13.75L3.75 11.25L6.25 8.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.25 11.25H3.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'array') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M6.25 3.125H3.125V16.875H6.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.75 3.125H16.875V16.875H13.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'object') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M6.25 3.125C1.25 3.125 6.25 10 1.25 10C6.25 10 1.25 16.875 6.25 16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.75 3.125C18.75 3.125 13.75 10 18.75 10C13.75 10 18.75 16.875 13.75 16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'string') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path d="M2.5 2.25H15.5C16.328 2.25 17 2.922 17 3.75V14.25C17 15.078 16.328 15.75 15.5 15.75H2.5C1.672 15.75 1 15.078 1 14.25V3.75C1 2.922 1.672 2.25 2.5 2.25Z" stroke="currentColor" />
        <path d="M4.438 6.5H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.438 9H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.438 11.5H12.563" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.125 7.5H16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.125 12.5H16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 3.125V16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 3.125V16.875" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OutlineTree({
  nodes,
  sidebarWidth,
  selectedBlockId,
  onBlockSelect,
  onNodeDoubleClick,
}: {
  nodes: OutlineNode[]
  sidebarWidth: number
  selectedBlockId: WorkbenchBlockId | null
  onBlockSelect: (blockId: WorkbenchBlockId) => void
  onNodeDoubleClick: (node: OutlineNode) => void
}) {
  const [expanded, setExpanded] = useState(() => collectDefaultExpanded(nodes))
  const [selectedId, setSelectedId] = useState(() => selectedBlockId ? findOutlineNodeIdForBlock(nodes, selectedBlockId) : '')
  const flatNodes = useMemo(() => flattenOutline(nodes, expanded), [nodes, expanded])
  const lineSegments = useMemo(() => collectOutlineLineSegments(flatNodes), [flatNodes])
  const rowWidth = Math.max(0, sidebarWidth - 27)
  const selectedWidth = Math.max(0, sidebarWidth - 40)

  useEffect(() => {
    const defaultExpanded = collectDefaultExpanded(nodes)
    setExpanded(prev => new Set([...prev, ...collectDefaultExpanded(nodes)]))
    setSelectedId(prev => {
      if (selectedBlockId === null) return ''
      const flatDefaultNodes = flattenOutline(nodes, defaultExpanded)
      const currentNode = flatDefaultNodes.find(item => item.node.id === prev)?.node
      const hasCurrent = Boolean(currentNode)
      if (selectedBlockId && (!currentNode || resolveOutlineBlockId(currentNode) !== selectedBlockId)) {
        const nextId = findOutlineNodeIdForBlock(nodes, selectedBlockId)
        if (nextId) return nextId
      }
      return hasCurrent ? prev : firstSelectableNode(nodes)
    })
  }, [nodes, selectedBlockId])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="absolute" style={{ left: 13.16, top: 128.32, width: rowWidth, bottom: 16 }}>
      <span
        className="absolute leading-[24px]"
        style={{ left: 5.84, top: 0, color: 'var(--dfw-text)', fontFamily: outlineFont, fontSize: 20, fontWeight: 400 }}
      >
        大纲
      </span>

      <div className="absolute left-0 right-0 top-[45px] bottom-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
          {lineSegments.map(segment => (
            <span
              key={segment.id}
              className="absolute w-px transition-[top,height,opacity] duration-150 ease-out"
              style={{
                left: outlineBaseCaretLeft + 8 + segment.depth * outlineIndent,
                top: segment.startIndex * outlineRowHeight,
                height: Math.max(0, (segment.endIndex - segment.startIndex + 1) * outlineRowHeight - 2),
                background: 'var(--dfw-text)',
              }}
            />
          ))}
        </div>
        {flatNodes.map(({ node, depth, hasChildren, expanded: isExpanded }, index) => {
          const depthOffset = depth * outlineIndent
          const iconLeft = outlineBaseIconLeft + depthOffset
          const textLeft = node.icon ? iconLeft + outlineIconTextGap : outlineBaseTextLeft + depthOffset
          const color = node.tone === 'locked' ? 'var(--dfw-outline-muted)' : 'var(--dfw-text)'
          const selectable = node.selectable !== false
          const selected = selectable && node.id === selectedId

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                if (hasChildren) toggleExpanded(node.id)
                if (selectable) {
                  setSelectedId(node.id)
                  const blockId = resolveOutlineBlockId(node)
                  if (blockId) onBlockSelect(blockId)
                }
              }}
              onDoubleClick={event => {
                event.preventDefault()
                event.stopPropagation()
                if (selectable) {
                  setSelectedId(node.id)
                  const blockId = resolveOutlineBlockId(node)
                  if (blockId) onBlockSelect(blockId)
                }
                onNodeDoubleClick(node)
              }}
              className="absolute left-0 h-[24px] text-left transition-[top,background-color,opacity,transform] duration-150 ease-out hover:bg-[var(--dfw-outline-hover)]"
              style={{
                top: index * outlineRowHeight,
                width: rowWidth,
                color,
                cursor: selectable || hasChildren ? 'pointer' : 'default',
                animation: 'dfw-outline-row-enter 0.16s ease-out both',
              }}
              aria-expanded={hasChildren ? isExpanded : undefined}
            >
              {selected && (
                <span
                  className="absolute left-[6px] top-0 h-[24px]"
                  style={{
                    width: selectedWidth,
                    background: 'var(--dfw-outline-selected-bg)',
                    border: '1px solid var(--dfw-blue)',
                  }}
                />
              )}
              {hasChildren && (
                <span
                  className="absolute top-[4px] z-20 flex h-[16px] w-[16px] items-center justify-center transition-transform duration-150 ease-out"
                  style={{
                    left: outlineBaseCaretLeft + depthOffset,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M5.5 1.75L11.75 8L5.5 14.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {node.icon && (
                <span className="absolute top-[2px] z-20 flex h-[20px] w-[20px] items-center justify-center" style={{ left: iconLeft }}>
                  <OutlineTypeIcon type={node.icon} />
                </span>
              )}
              <span
                className="absolute top-0 z-20 block h-[24px] overflow-hidden text-ellipsis whitespace-nowrap leading-[24px]"
                style={{
                  left: textLeft,
                  right: node.trailingIcon ? 32 : 4,
                  fontFamily: outlineFont,
                  fontSize: 20,
                  fontWeight: 300,
                }}
              >
                {node.label}
              </span>
              {node.trailingIcon && (
                <span className="absolute right-[14px] top-[2px] z-20 flex h-[20px] w-[20px] items-center justify-center">
                  <OutlineTypeIcon type={node.trailingIcon} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WorkbenchLeftSidebar({
  collapsed,
  width,
  onToggleCollapsed,
  onBackToLibrary,
  onSave,
  saveStatusLabel,
  saveTone,
  onResize,
  outline,
  selectedBlockId,
  onBlockSelect,
  onOutlineNodeDoubleClick,
}: {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onBackToLibrary: () => void
  onSave: () => void
  saveStatusLabel: string
  saveTone: 'default' | 'saving' | 'success' | 'error'
  onResize: (width: number) => void
  outline: OutlineNode[]
  selectedBlockId: WorkbenchBlockId | null
  onBlockSelect: (blockId: WorkbenchBlockId) => void
  onOutlineNodeDoubleClick: (node: OutlineNode) => void
}) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const nextWidth = start.width + event.clientX - start.x
    if (nextWidth < leftSidebarMinWidth - 24) {
      resizeStartRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onToggleCollapsed()
      return
    }
    onResize(clamp(nextWidth, leftSidebarMinWidth, leftSidebarMaxWidth))
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStartRef.current = null
  }

  if (collapsed) {
    return (
      <aside
        data-workbench-ui
        className="absolute left-0 top-0 z-20 h-full"
        style={{ width: leftSidebarCollapsedWidth }}
      >
        <div
          className="absolute inset-y-0 left-0 border"
          style={{
            width: leftSidebarCollapsedWidth,
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            borderRadius: '0 30px 30px 0',
          }}
        />
        <SidebarToolButton left={15} label="展开左侧边栏" onClick={onToggleCollapsed}>
          <TextAlignLeftGlyph />
        </SidebarToolButton>
      </aside>
    )
  }

  return (
    <aside data-workbench-ui className="absolute left-0 top-0 z-20 h-full" style={{ width }}>
      <div
        className="absolute inset-0 border"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          borderRadius: '0 30px 30px 0',
        }}
      />
      <SidebarToolButton left={20} label="返回项目列表" onClick={onBackToLibrary}>
        <ArrowLeft size={30} strokeWidth={2} />
      </SidebarToolButton>
      <SidebarToolButton left={70} label={saveStatusLabel} onClick={onSave} tone={saveTone}>
        <SaveGlyph />
      </SidebarToolButton>
      <SidebarToolButton left={120} label="收起左侧边栏" onClick={onToggleCollapsed}>
        <TextAlignLeftGlyph />
      </SidebarToolButton>
      <SidebarToolButton left={170} label="新建工作区">
        <Plus size={30} strokeWidth={2} />
      </SidebarToolButton>
      <div
        className="absolute h-px"
        style={{ left: 20, top: 109.5, width: Math.max(0, width - 40), background: 'var(--dfw-sidebar-border)' }}
        aria-hidden
      />
      <OutlineTree
        nodes={outline}
        sidebarWidth={width}
        selectedBlockId={selectedBlockId}
        onBlockSelect={onBlockSelect}
        onNodeDoubleClick={onOutlineNodeDoubleClick}
      />
      <div
        className="absolute bottom-[30px] right-[-5px] top-[30px] w-[10px] cursor-ew-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        aria-label="调整左侧边栏宽度"
        title="调整左侧边栏宽度"
      />
    </aside>
  )
}

function WorkbenchDebugLeftSidebar({
  collapsed,
  width,
  onToggleCollapsed,
  onBackToLibrary,
  onSave,
  saveStatusLabel,
  saveTone,
  onResize,
  session,
  selectedProcessId,
  onProcessSelect,
}: {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onBackToLibrary: () => void
  onSave: () => void
  saveStatusLabel: string
  saveTone: 'default' | 'saving' | 'success' | 'error'
  onResize: (width: number) => void
  session: WorkbenchDebugSession | null
  selectedProcessId: number | null
  onProcessSelect: (pid: number) => void
}) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const processesByBlock = useMemo(() => {
    const map = new Map<string, WorkbenchDebugProcess[]>()
    for (const process of session?.processes ?? []) {
      const blockId = process.block_id || 'session'
      const list = map.get(blockId) ?? []
      list.push(process)
      map.set(blockId, list)
    }
    return map
  }, [session?.processes])

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStartRef.current = { pointerId: event.pointerId, x: event.clientX, width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const nextWidth = start.width + event.clientX - start.x
    if (nextWidth < leftSidebarMinWidth - 24) {
      resizeStartRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onToggleCollapsed()
      return
    }
    onResize(clamp(nextWidth, leftSidebarMinWidth, leftSidebarMaxWidth))
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStartRef.current = null
  }

  if (collapsed) {
    return (
      <aside data-workbench-ui className="absolute left-0 top-0 z-20 h-full" style={{ width: leftSidebarCollapsedWidth }}>
        <div
          className="absolute inset-y-0 left-0 border"
          style={{ width: leftSidebarCollapsedWidth, borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', borderRadius: '0 30px 30px 0' }}
        />
        <SidebarToolButton left={15} label="展开调试侧栏" onClick={onToggleCollapsed}>
          <TextAlignLeftGlyph />
        </SidebarToolButton>
      </aside>
    )
  }

  return (
    <aside data-workbench-ui className="absolute left-0 top-0 z-20 h-full" style={{ width }}>
      <div
        className="absolute inset-0 border"
        style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', borderRadius: '0 30px 30px 0' }}
      />
      <SidebarToolButton left={20} label="返回项目列表" onClick={onBackToLibrary}>
        <ArrowLeft size={30} strokeWidth={2} />
      </SidebarToolButton>
      <SidebarToolButton left={70} label={saveStatusLabel} onClick={onSave} tone={saveTone}>
        <SaveGlyph />
      </SidebarToolButton>
      <SidebarToolButton left={120} label="收起左侧边栏" onClick={onToggleCollapsed}>
        <TextAlignLeftGlyph />
      </SidebarToolButton>
      <SidebarToolButton left={170} label="调试视图">
        <Bug size={28} strokeWidth={2} />
      </SidebarToolButton>
      <div className="absolute h-px" style={{ left: 20, top: 109.5, width: Math.max(0, width - 40), background: 'var(--dfw-sidebar-border)' }} aria-hidden />

      <div className="absolute" style={{ left: 20, right: 18, top: 128, bottom: 22 }}>
        <div className="mb-[14px] flex items-center justify-between gap-[10px]">
          <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[20px] font-semibold" style={{ color: 'var(--dfw-text)', fontFamily: outlineFont }}>
            调试进程
          </div>
          <div className="shrink-0 text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>
            {session?.processes?.length ?? 0} 个
          </div>
        </div>
        <div className="absolute left-0 right-0 top-[42px] bottom-0 overflow-y-auto overflow-x-hidden pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(session?.blocks ?? []).length ? (
            <div className="flex flex-col gap-[10px]">
              {(session?.blocks ?? []).map(block => {
                const processes = processesByBlock.get(block.id) ?? []
                return (
                  <section key={block.id} className="rounded-[8px] border px-[10px] py-[9px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
                    <div className="mb-[7px] flex items-center justify-between gap-[8px]">
                      <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold" style={{ color: 'rgba(226, 232, 240, 0.86)' }}>
                        {block.label || block.id}
                      </div>
                      <div className="shrink-0 text-[11px]" style={{ color: debugStatusColor(block.status) }}>
                        {block.status || 'pending'}
                      </div>
                    </div>
                    <div className="mb-[8px] flex items-center gap-[8px] text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>
                      <span>{processes.length} 进程</span>
                      <span>{block.command_count ?? 0} 命令</span>
                      <span>{formatDebugDuration(block.duration_ms)}</span>
                    </div>
                    {processes.length ? (
                      <div className="flex flex-col gap-[5px]">
                        {processes.map(process => {
                          const selected = selectedProcessId === process.pid
                          return (
                            <button
                              key={`${block.id}-${process.pid}`}
                              type="button"
                              onClick={() => onProcessSelect(process.pid)}
                              className="grid min-h-[42px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-[8px] rounded-[7px] border px-[8px] py-[6px] text-left transition-colors hover:bg-[var(--dfw-control-hover)]"
                              style={{
                                borderColor: selected ? 'rgba(96, 165, 250, 0.9)' : 'rgba(148, 163, 184, 0.22)',
                                background: selected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(2, 6, 23, 0.12)',
                                color: 'var(--dfw-text)',
                              }}
                            >
                              <Cpu size={16} strokeWidth={2} style={{ color: debugStatusColor(process.status) }} />
                              <span className="min-w-0">
                                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold">
                                  {process.name || process.label || `PID ${process.pid}`}
                                </span>
                                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>
                                  PID {process.pid}{process.parent_pid ? ` / PPID ${process.parent_pid}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.54)' }}>
                                {formatDebugDuration(process.duration_ms)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[7px] border px-[8px] py-[8px] text-center text-[12px]" style={{ borderColor: 'rgba(148, 163, 184, 0.18)', color: 'rgba(226, 232, 240, 0.42)' }}>
                        暂无子进程
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[8px] border px-[12px] py-[18px] text-center text-[13px] leading-[20px]" style={{ borderColor: 'var(--dfw-sidebar-border)', color: 'rgba(226, 232, 240, 0.48)', background: 'rgba(15, 23, 42, 0.12)' }}>
              启动调试后会按块显示子进程
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute bottom-[30px] right-[-5px] top-[30px] w-[10px] cursor-ew-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        aria-label="调整左侧调试栏宽度"
        title="调整左侧调试栏宽度"
      />
    </aside>
  )
}

export default function DeploymentFlowWorkbench({
  onBackToLibrary,
  outline,
  projectSequence,
}: DeploymentFlowWorkbenchProps) {
  const [viewport, setViewport] = useState<WorkbenchViewport>({ scale: 1, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(leftSidebarDefaultWidth)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(rightSidebarExpandedWidth)
  const [projectInfo, setProjectInfo] = useState<WorkbenchProjectInfo | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<WorkbenchBlockId | null>(null)
  const [rightSidebarFocusTarget, setRightSidebarFocusTarget] = useState<{ id: string; nonce: number } | null>(null)
  const [addNodeAnchor, setAddNodeAnchor] = useState<WorkbenchAddNodeAnchor | null>(null)
  const [openFileEditorFileId, setOpenFileEditorFileId] = useState<string | null>(null)
  const [meta, setMeta] = useState<WorkbenchMetaState>(defaultWorkbenchMeta)
  const [visibleBlocks, setVisibleBlocks] = useState<WorkbenchVisibleBlocks>(defaultVisibleBlocks)
  const [canvasState, setCanvasState] = useState<Partial<WorkbenchCanvasState>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveTone, setSaveTone] = useState<'default' | 'saving' | 'success' | 'error'>('default')
  const [runtimePanelOpen, setRuntimePanelOpen] = useState(false)
  const [runtimeTaskId, setRuntimeTaskId] = useState<string | null>(null)
  const [runtimeProgress, setRuntimeProgress] = useState<WorkbenchRunProgress | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeStarting, setRuntimeStarting] = useState(false)
  const [runtimeFormFields, setRuntimeFormFields] = useState<WorkbenchRunFormField[]>([])
  const [runtimeFormValues, setRuntimeFormValues] = useState<Record<string, WorkbenchRunInputValue>>({})
  const [runtimeFormLoading, setRuntimeFormLoading] = useState(false)
  const [runtimeFormError, setRuntimeFormError] = useState<string | null>(null)
  const [runtimeFormLoaded, setRuntimeFormLoaded] = useState(false)
  const [runtimeFormAutoTried, setRuntimeFormAutoTried] = useState(false)
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  const [debugSessionId, setDebugSessionId] = useState<string | null>(null)
  const [debugSession, setDebugSession] = useState<WorkbenchDebugSession | null>(null)
  const [debugError, setDebugError] = useState<string | null>(null)
  const [debugStarting, setDebugStarting] = useState(false)
  const [debugSelectedProcessId, setDebugSelectedProcessId] = useState<number | null>(null)
  const [transientEditor, setTransientEditor] = useState<{ blockId: WorkbenchBlockId; anchor: WorkbenchPoint } | null>(null)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef<{ pointerId: number; x: number; y: number; viewportX: number; viewportY: number } | null>(null)
  const viewportRef = useRef<WorkbenchViewport>(viewport)
  const viewportAnimationFrameRef = useRef<number | null>(null)
  const transientEditorEnabled = runtimePanelOpen || debugPanelOpen
  const grid = resolveGridSpacing(viewport.scale)
  const gridStyle = {
    backgroundSize: `${grid.screenSpacing}px ${grid.screenSpacing}px`,
    backgroundPosition: `${positiveModulo(viewport.x, grid.screenSpacing)}px ${positiveModulo(viewport.y, grid.screenSpacing)}px`,
  }
  const topTabs = useMemo(() => [{
    id: 'workspace-0',
    title: projectInfo?.mod_name || '未命名',
  }], [projectInfo?.mod_name])

  // 只把「已连」的 stage / 子块呈现到大纲和 toml。判定：
  //  - stage 自身 = visibleBlocks.x && canvasState.xConnected
  //  - 子块 = (canvasState.xConnections[i] === true) || manualConnections 中存在 conn.to === 'x:i'
  // 未连的子块 / 孤立的 stage 不会写进 toml，但 meta 数组中所有数据保留，
  // 重新连上后即恢复。
  const connectedIndexSets = useMemo<ConnectedIndexSets>(() => {
    const manualTargets = new Set(
      (canvasState?.manualConnections ?? []).map(connection => connection.to),
    )
    const pickIndices = (
      flags: boolean[] | undefined,
      prefix: 'component' | 'deployment' | 'config-item' | 'launch-item' | 'uninstall-item',
    ): number[] => {
      if (!flags) return []
      const out: number[] = []
      flags.forEach((flag, index) => {
        if (flag || manualTargets.has(`${prefix}:${index}`)) out.push(index)
      })
      return out
    }
    return {
      stages: {
        components: visibleBlocks.components && (canvasState?.componentsConnected ?? false),
        deploy: visibleBlocks.deploy && (canvasState?.deployConnected ?? false),
        config: visibleBlocks.config && (canvasState?.configConnected ?? false),
        launch: visibleBlocks.launch && (canvasState?.launchConnected ?? false),
        uninstall: visibleBlocks.uninstall && (canvasState?.uninstallConnected ?? false),
      },
      componentIndices: pickIndices(canvasState?.componentConnections, 'component'),
      deploymentIndices: pickIndices(canvasState?.deploymentConnections, 'deployment'),
      configItemIndices: pickIndices(canvasState?.configItemConnections, 'config-item'),
      launchItemIndices: pickIndices(canvasState?.launchItemConnections, 'launch-item'),
      uninstallItemIndices: pickIndices(canvasState?.uninstallItemConnections, 'uninstall-item'),
    }
  }, [visibleBlocks, canvasState])

  const effectiveOutline = useMemo(
    () => outline ?? createOutline(meta, connectedIndexSets),
    [outline, meta, connectedIndexSets],
  )
  const blockMeta = meta
  const debugBlockOptions = useMemo(
    () => createDebugBlockOptions(meta, connectedIndexSets),
    [meta, connectedIndexSets],
  )

  const cancelViewportAnimation = () => {
    if (viewportAnimationFrameRef.current === null) return
    cancelAnimationFrame(viewportAnimationFrameRef.current)
    viewportAnimationFrameRef.current = null
  }

  const updateViewport = (nextViewport: WorkbenchViewport | ((current: WorkbenchViewport) => WorkbenchViewport)) => {
    setViewport(prev => {
      const next = typeof nextViewport === 'function' ? nextViewport(prev) : nextViewport
      viewportRef.current = next
      return next
    })
  }

  useEffect(() => {
    setCanvasState(prev => {
      const currentViewport = prev.viewport
      if (
        currentViewport?.scale === viewport.scale
        && currentViewport?.x === viewport.x
        && currentViewport?.y === viewport.y
      ) {
        return prev
      }
      return { ...prev, viewport }
    })
  }, [viewport])

  const animateViewportTo = (target: WorkbenchViewport) => {
    cancelViewportAnimation()

    const start = viewportRef.current
    const startedAt = performance.now()

    const step = (now: number) => {
      const progress = clamp((now - startedAt) / bottomBarZoomAnimationMs, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      updateViewport({
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      })

      if (progress < 1) {
        viewportAnimationFrameRef.current = requestAnimationFrame(step)
      } else {
        viewportAnimationFrameRef.current = null
      }
    }

    viewportAnimationFrameRef.current = requestAnimationFrame(step)
  }

  useEffect(() => () => cancelViewportAnimation(), [])

  useEffect(() => {
    if (!projectSequence) {
      setProjectInfo(null)
      return
    }

    let cancelled = false
    const loadProject = async () => {
      try {
        const response = await fetch(`/api/template-workbench/projects/${encodeURIComponent(projectSequence)}`, { credentials: 'include' })
        if (!response.ok) throw new Error(`加载工作台项目失败: ${response.status}`)
        const project = await response.json() as WorkbenchProjectInfo
        if (!cancelled) {
          setProjectInfo(project)
          const fallbackMeta: WorkbenchMetaState = {
            ...defaultWorkbenchMeta,
            modName: project.mod_name || defaultWorkbenchMeta.modName,
            modId: project.mod_id || (project.path ? project.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') : '') || defaultWorkbenchMeta.modId,
            description: project.description || defaultWorkbenchMeta.description,
            author: project.author || defaultWorkbenchMeta.author,
            files: Array.isArray(project.files) ? project.files : defaultWorkbenchMeta.files,
          }
          setMeta({
            ...fallbackMeta,
            ...(project.workbench_meta ?? {}),
            files: Array.isArray(project.workbench_meta?.files)
              ? project.workbench_meta.files
              : fallbackMeta.files,
          })
          setVisibleBlocks({
            ...defaultVisibleBlocks,
            ...(project.visible_blocks ?? {}),
          })
          const nextCanvasState = project.workbench_canvas_state ?? {}
          setCanvasState(nextCanvasState)
          const nextSavedViewport = nextCanvasState.viewport
          const savedViewport = {
            scale: clamp(nextSavedViewport?.scale ?? 1, workbenchMinZoom, workbenchMaxZoom),
            x: Number.isFinite(nextSavedViewport?.x) ? nextSavedViewport?.x ?? 0 : 0,
            y: Number.isFinite(nextSavedViewport?.y) ? nextSavedViewport?.y ?? 0 : 0,
          }
          viewportRef.current = savedViewport
          setViewport(savedViewport)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setProjectInfo(null)
      }
    }

    void loadProject()
    return () => {
      cancelled = true
    }
  }, [projectSequence])

  useEffect(() => {
    setRuntimeFormFields([])
    setRuntimeFormValues({})
    setRuntimeFormError(null)
    setRuntimeFormLoaded(false)
    setRuntimeFormAutoTried(false)
    setDebugSessionId(null)
    setDebugSession(null)
    setDebugError(null)
    setDebugSelectedProcessId(null)
  }, [projectSequence])

  useEffect(() => {
    const workbench = workbenchRef.current
    if (!workbench) return

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-workbench-ui]')) return

      cancelViewportAnimation()
      event.preventDefault()
      event.stopPropagation()

      const rect = workbench.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      updateViewport(prev => {
        const nextScale = clamp(prev.scale * Math.exp(-event.deltaY * 0.0012), workbenchMinZoom, workbenchMaxZoom)
        const scaleRatio = nextScale / prev.scale
        return {
          scale: nextScale,
          x: pointerX - (pointerX - prev.x) * scaleRatio,
          y: pointerY - (pointerY - prev.y) * scaleRatio,
        }
      })
    }

    workbench.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => workbench.removeEventListener('wheel', handleNativeWheel)
  }, [])

  useEffect(() => {
    const preventBrowserGestureZoom = (event: Event) => {
      event.preventDefault()
    }

    document.addEventListener('gesturestart', preventBrowserGestureZoom)
    document.addEventListener('gesturechange', preventBrowserGestureZoom)
    return () => {
      document.removeEventListener('gesturestart', preventBrowserGestureZoom)
      document.removeEventListener('gesturechange', preventBrowserGestureZoom)
    }
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('[data-workbench-ui]')) return
    cancelViewportAnimation()
    panStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPanning(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    updateViewport(prev => ({
      ...prev,
      x: start.viewportX + event.clientX - start.x,
      y: start.viewportY + event.clientY - start.y,
    }))
  }

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panStartRef.current = null
    setIsPanning(false)
  }

  const setScaleFromBottomBar = (scale: number) => {
    const workbench = workbenchRef.current
    if (!workbench) {
      updateViewport(prev => ({ ...prev, scale: clamp(scale, workbenchMinZoom, workbenchMaxZoom) }))
      return
    }

    const rect = workbench.getBoundingClientRect()
    const pointerX = rect.width / 2
    const pointerY = rect.height / 2

    const current = viewportRef.current
    const nextScale = clamp(scale, workbenchMinZoom, workbenchMaxZoom)
    const scaleRatio = nextScale / current.scale
    animateViewportTo({
      scale: nextScale,
      x: pointerX - (pointerX - current.x) * scaleRatio,
      y: pointerY - (pointerY - current.y) * scaleRatio,
    })
  }

  const leftSidebarRight = leftSidebarCollapsed ? leftSidebarCollapsedWidth : leftSidebarWidth
  const rightSidebarLeft = rightSidebarCollapsed ? rightSidebarCollapsedWidth : rightSidebarWidth
  const openAddNodeFromBottomBar = () => {
    const workbench = workbenchRef.current
    if (!workbench) return

    const current = viewportRef.current
    const rect = workbench.getBoundingClientRect()
    const visibleLeft = leftSidebarRight
    const visibleRight = Math.max(visibleLeft, rect.width - rightSidebarLeft)
    const screenX = visibleLeft + (visibleRight - visibleLeft) / 2
    const screenY = rect.height / 2

    setAddNodeAnchor(prev => ({
      id: (prev?.id ?? 0) + 1,
      point: {
        x: (screenX - current.x) / current.scale,
        y: (screenY - current.y) / current.scale,
      },
    }))
  }

  const focusRightSidebarFromOutline = (node: OutlineNode) => {
    const blockId = resolveOutlineBlockId(node)
    if (blockId) setSelectedBlockId(blockId)
    if (rightSidebarCollapsed) setRightSidebarCollapsed(false)
    setRightSidebarFocusTarget(prev => ({
      id: node.id,
      nonce: (prev?.nonce ?? 0) + 1,
    }))
  }

  const handleSaveWorkbench = async (): Promise<boolean> => {
    if (!projectSequence || isSaving) return false
    setIsSaving(true)
    setSaveTone('saving')
    setSaveMessage('正在保存工作台…')
    try {
      const response = await fetch(`/api/template-workbench/projects/${encodeURIComponent(projectSequence)}/workbench-state`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta,
          visible_blocks: visibleBlocks,
          canvas_state: canvasState,
          toml_content: buildWorkbenchToml(meta, connectedIndexSets),
        }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `HTTP ${response.status}`)
      }
      const project = await response.json() as WorkbenchProjectInfo
      setProjectInfo(project)
      setSaveTone('success')
      setSaveMessage('工作台已保存')
      window.setTimeout(() => {
        setSaveTone(current => (current === 'success' ? 'default' : current))
        setSaveMessage(current => (current === '工作台已保存' ? null : current))
      }, 2200)
      return true
    } catch (error) {
      const message = parseApiErrorMessage(error)
      setSaveTone('error')
      setSaveMessage(`保存失败：${message}`)
      window.setTimeout(() => {
        setSaveTone(current => (current === 'error' ? 'default' : current))
      }, 2600)
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const openRuntimePanel = () => {
    setRuntimePanelOpen(true)
    setDebugPanelOpen(false)
    if (rightSidebarCollapsed) setRightSidebarCollapsed(false)
  }

  const openDebugPanel = () => {
    setDebugPanelOpen(true)
    setRuntimePanelOpen(false)
    if (rightSidebarCollapsed) setRightSidebarCollapsed(false)
  }

  const refreshWorkbenchRunForm = async () => {
    if (!projectSequence || runtimeFormLoading) return false
    setRuntimeFormAutoTried(true)
    setRuntimeFormLoading(true)
    setRuntimeFormError(null)

    const saved = await handleSaveWorkbench()
    if (!saved) {
      setRuntimeFormLoading(false)
      setRuntimeFormError('保存工作台失败，无法读取运行参数。')
      return false
    }

    try {
      const response = await fetch(`/api/deployment-mod/workbench/${encodeURIComponent(projectSequence)}/form`, { credentials: 'include' })
      const payload = await response.json().catch(() => null) as { form?: { fields?: WorkbenchRunFormField[] }; detail?: string } | null
      if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`)
      const fields = Array.isArray(payload?.form?.fields) ? payload.form.fields : []
      setRuntimeFormFields(fields)
      setRuntimeFormLoaded(true)
      setRuntimeFormValues(prev => {
        const next: Record<string, WorkbenchRunInputValue> = {}
        for (const field of fields) {
          next[field.key] = prev[field.key] ?? defaultWorkbenchRunInputValue(field)
        }
        return next
      })
      return true
    } catch (error) {
      setRuntimeFormError(parseApiErrorMessage(error))
      setRuntimeFormLoaded(true)
      return false
    } finally {
      setRuntimeFormLoading(false)
    }
  }

  const startWorkbenchRun = async (options: WorkbenchRunStartOptions) => {
    openRuntimePanel()
    if (!projectSequence) {
      setRuntimeError('当前工作台项目缺少序列号，无法启动试运行。')
      return
    }

    setRuntimeStarting(true)
    setRuntimeError(null)
    setRuntimeTaskId(null)
    setRuntimeProgress({
      status: 'running',
      step: 0,
      total_steps: options.mode === 'full' ? 6 : 1,
      step_name: '保存工作台',
      message: '正在写入当前画布生成的模板文件',
      logs: [],
    })

    const saved = await handleSaveWorkbench()
    if (!saved) {
      setRuntimeStarting(false)
      setRuntimeError('工作台保存失败，已取消试运行。')
      setRuntimeProgress(prev => mergeWorkbenchProgress(prev, {
        status: 'failed',
        step_name: '保存工作台失败',
        message: '请先处理保存错误后再试运行',
      }))
      return
    }

    const userInputs: Record<string, WorkbenchRunInputValue> = {
      ...options.userInputs,
      nickname: options.nickname || meta.modName || projectInfo?.mod_name || '工作台试运行',
    }
    if (options.serialNumber) userInputs.serial_number = options.serialNumber

    try {
      const response = await fetch(`/api/deployment-mod/workbench/${encodeURIComponent(projectSequence)}/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: options.mode,
          stage: options.mode === 'stage' ? options.stage : '',
          user_inputs: userInputs,
          serial_number: options.serialNumber,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null
        throw new Error(payload?.detail || `HTTP ${response.status}`)
      }
      const payload = await response.json() as { task_id?: string; message?: string }
      if (!payload.task_id) throw new Error('后端没有返回任务 ID')
      setRuntimeTaskId(payload.task_id)
      setRuntimeProgress(prev => mergeWorkbenchProgress(prev, {
        task_id: payload.task_id,
        status: 'running',
        step: 0,
        total_steps: options.mode === 'full' ? 6 : 1,
        step_name: '任务已启动',
        message: payload.message || '工作台试运行任务已启动',
      }))
    } catch (error) {
      const message = parseApiErrorMessage(error)
      setRuntimeError(message)
      setRuntimeProgress(prev => mergeWorkbenchProgress(prev, {
        status: 'failed',
        step_name: '启动试运行失败',
        message,
      }))
    } finally {
      setRuntimeStarting(false)
    }
  }

  const startWorkbenchDebug = async (options: WorkbenchDebugStartOptions) => {
    openDebugPanel()
    if (!projectSequence) {
      setDebugError('当前工作台项目缺少序列号，无法启动调试。')
      return
    }

    setDebugStarting(true)
    setDebugError(null)
    setDebugSessionId(null)
    setDebugSelectedProcessId(null)
    setDebugSession({
      status: 'running',
      message: '正在写入当前画布生成的模板文件',
      scope: options.scope,
      stage: options.scope === 'stage' ? options.stage : '',
      block_key: options.scope === 'block' ? options.blockKey : '',
      monitor_level: options.monitorLevel,
      hydrate_context: options.hydrateContext,
      blocks: [],
      commands: [],
      processes: [],
      logs: [],
    })

    const saved = await handleSaveWorkbench()
    if (!saved) {
      setDebugStarting(false)
      setDebugError('工作台保存失败，已取消调试。')
      setDebugSession(prev => ({
        ...(prev ?? {}),
        status: 'failed',
        message: '请先处理保存错误后再调试',
      }))
      return
    }

    const userInputs: Record<string, WorkbenchRunInputValue> = {
      ...options.userInputs,
      nickname: options.nickname || meta.modName || projectInfo?.mod_name || '工作台调试',
    }
    if (options.serialNumber) userInputs.serial_number = options.serialNumber

    try {
      const response = await fetch(`/api/deployment-mod/workbench/${encodeURIComponent(projectSequence)}/debug/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: options.scope,
          stage: options.scope === 'stage' ? options.stage : '',
          block_key: options.scope === 'block' ? options.blockKey : '',
          monitor_level: options.monitorLevel,
          hydrate_context: options.hydrateContext,
          user_inputs: userInputs,
          serial_number: options.serialNumber,
        }),
      })
      const payload = await response.json().catch(() => null) as { session_id?: string; session?: WorkbenchDebugSession; detail?: string; message?: string } | null
      if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`)
      if (!payload?.session_id) throw new Error('后端没有返回调试会话 ID')
      setDebugSessionId(payload.session_id)
      setDebugSession(payload.session ?? null)
    } catch (error) {
      const message = parseApiErrorMessage(error)
      setDebugError(message)
      setDebugSession(prev => ({
        ...(prev ?? {}),
        status: 'failed',
        message,
      }))
    } finally {
      setDebugStarting(false)
    }
  }

  const controlDebugSession = async (action: 'pause' | 'resume' | 'stop') => {
    if (!debugSessionId) return
    try {
      const response = await fetch(`/api/deployment-mod/debug/${encodeURIComponent(debugSessionId)}/${action}`, {
        method: 'POST',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => null) as { session?: WorkbenchDebugSession; detail?: string } | null
      if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`)
      if (payload?.session) setDebugSession(payload.session)
      setDebugError(null)
    } catch (error) {
      setDebugError(parseApiErrorMessage(error))
    }
  }

  useEffect(() => {
    if (!runtimeTaskId) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'deployment_progress' }))
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as { type?: string; data?: WorkbenchRunProgress }
        if (message.type !== 'deployment_progress' || message.data?.task_id !== runtimeTaskId) return
        setRuntimeProgress(prev => mergeWorkbenchProgress(prev, message.data as WorkbenchRunProgress))
        if (message.data.status === 'failed') {
          const nextError = String(message.data.message || '工作台试运行失败')
          setRuntimeError(prev => (prev === nextError ? prev : nextError))
        }
        if (message.data.status === 'completed') setRuntimeError(prev => (prev === null ? prev : null))
      } catch {
        // 忽略非 JSON 推送。
      }
    }

    return () => ws.close()
  }, [runtimeTaskId])

  useEffect(() => {
    if (!runtimeTaskId) return

    let cancelled = false
    let timer: number | null = null
    const stopPolling = () => {
      if (timer === null) return
      window.clearInterval(timer)
      timer = null
    }
    const loadProgress = async () => {
      try {
        const response = await fetch(`/api/deployment-mod/progress/${encodeURIComponent(runtimeTaskId)}`, { credentials: 'include' })
        if (!response.ok) return
        const payload = await response.json() as WorkbenchRunProgress & { success?: boolean }
        if (cancelled || payload.success === false) return
        setRuntimeProgress(prev => mergeWorkbenchProgress(prev, payload))
        if (payload.status === 'failed') {
          const nextError = String(payload.message || '工作台试运行失败')
          setRuntimeError(prev => (prev === nextError ? prev : nextError))
        }
        if (payload.status === 'completed') setRuntimeError(prev => (prev === null ? prev : null))
        if (isWorkbenchRunDone(payload.status)) stopPolling()
      } catch {
        // WebSocket 仍是主通道，轮询失败不打断运行面板。
      }
    }

    void loadProgress()
    timer = window.setInterval(loadProgress, 3000)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [runtimeTaskId])

  useEffect(() => {
    if (!debugSessionId) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'deployment_debug' }))
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as { type?: string; session_id?: string; data?: WorkbenchDebugSession }
        if (message.type !== 'deployment_debug') return
        const session = message.data
        if (!session || (message.session_id !== debugSessionId && session.session_id !== debugSessionId)) return
        setDebugSession(session)
        if (session.status === 'failed') setDebugError(session.error || session.message || '工作台调试失败')
        if (session.status === 'completed') setDebugError(null)
      } catch {
        // 忽略非 JSON 推送。
      }
    }

    return () => ws.close()
  }, [debugSessionId])

  useEffect(() => {
    if (!debugSessionId) return

    let cancelled = false
    let timer: number | null = null
    const stopPolling = () => {
      if (timer === null) return
      window.clearInterval(timer)
      timer = null
    }
    const loadSession = async () => {
      try {
        const response = await fetch(`/api/deployment-mod/debug/${encodeURIComponent(debugSessionId)}`, { credentials: 'include' })
        if (!response.ok) return
        const payload = await response.json() as { success?: boolean; session?: WorkbenchDebugSession }
        if (cancelled || payload.success === false || !payload.session) return
        setDebugSession(payload.session)
        if (payload.session.status === 'failed') setDebugError(payload.session.error || payload.session.message || '工作台调试失败')
        if (payload.session.status === 'completed') setDebugError(null)
        if (['completed', 'failed', 'stopped'].includes(String(payload.session.status || ''))) stopPolling()
      } catch {
        // WebSocket 仍是主通道，轮询失败不打断调试面板。
      }
    }

    void loadSession()
    timer = window.setInterval(loadSession, 2000)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [debugSessionId])

  useEffect(() => {
    const processes = debugSession?.processes ?? []
    if (!processes.length) {
      setDebugSelectedProcessId(null)
      return
    }
    if (debugSelectedProcessId && processes.some(process => process.pid === debugSelectedProcessId)) return
    setDebugSelectedProcessId(processes[0].pid)
  }, [debugSelectedProcessId, debugSession?.processes])

  useEffect(() => {
    if (!(runtimePanelOpen || debugPanelOpen) || !projectSequence || runtimeFormAutoTried || runtimeFormLoaded || runtimeFormLoading) return
    void refreshWorkbenchRunForm()
  }, [runtimePanelOpen, debugPanelOpen, projectSequence, runtimeFormAutoTried, runtimeFormLoaded, runtimeFormLoading])

  useEffect(() => {
    if (!transientEditorEnabled) setTransientEditor(null)
  }, [transientEditorEnabled])

  useEffect(() => {
    setTransientEditor(null)
  }, [projectSequence])

  const openTransientEditorForBlock = (blockId: WorkbenchBlockId, anchor: WorkbenchPoint) => {
    if (!transientEditorEnabled) return false
    setSelectedBlockId(blockId)
    setTransientEditor({ blockId, anchor })
    return true
  }

  return (
    <div
      ref={workbenchRef}
      className="deployment-flow-workbench relative h-full w-full overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
      style={{
        background: 'var(--dfw-bg)',
        color: 'var(--dfw-text)',
        cursor: isPanning ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div className="deployment-flow-workbench-grid absolute inset-0 pointer-events-none" style={gridStyle} aria-hidden />
      {saveMessage && (
        <div
          data-workbench-ui
          className="absolute top-[28px] z-40 rounded-[16px] border px-4 py-3 text-[15px] font-medium shadow-[0_14px_32px_rgba(0,0,0,0.28)] transition-all duration-200"
          style={{
            right: rightSidebarLeft + 24,
            borderColor: saveTone === 'success'
              ? 'rgba(34, 197, 94, 0.65)'
              : saveTone === 'error'
                ? 'rgba(248, 113, 113, 0.75)'
                : 'rgba(96, 165, 250, 0.75)',
            background: saveTone === 'success'
              ? 'rgba(8, 34, 18, 0.92)'
              : saveTone === 'error'
                ? 'rgba(53, 16, 16, 0.94)'
                : 'rgba(16, 30, 53, 0.94)',
            color: saveTone === 'success'
              ? '#bbf7d0'
              : saveTone === 'error'
                ? '#fecaca'
                : '#dbeafe',
            transform: 'translateY(0) scale(1)',
            opacity: 1,
          }}
          role="status"
          aria-live="polite"
        >
          {saveMessage}
        </div>
      )}
      <WorkbenchCanvas
        viewport={viewport}
        addNodeAnchor={addNodeAnchor}
        selectedBlockId={selectedBlockId}
        onSelectedBlockChange={setSelectedBlockId}
        visibleBlocks={visibleBlocks}
        onVisibleBlocksChange={patch => setVisibleBlocks(prev => ({ ...prev, ...patch }))}
        blockMeta={blockMeta}
        onBlockMetaPatch={patch => setMeta(prev => ({ ...prev, ...patch }))}
        onOpenFileEditor={setOpenFileEditorFileId}
        onBlockDoubleClick={openTransientEditorForBlock}
        projectSequence={projectSequence}
        canvasState={canvasState}
        onCanvasStatePatch={patch => setCanvasState(prev => ({ ...prev, ...patch }))}
        onViewportChange={next => updateViewport(next)}
      />
      {debugPanelOpen ? (
        <WorkbenchDebugLeftSidebar
          collapsed={leftSidebarCollapsed}
          width={leftSidebarWidth}
          onToggleCollapsed={() => setLeftSidebarCollapsed(prev => !prev)}
          onSave={() => void handleSaveWorkbench()}
          saveStatusLabel={isSaving ? '正在保存…' : saveMessage ?? '保存模板'}
          saveTone={saveTone}
          onResize={setLeftSidebarWidth}
          onBackToLibrary={onBackToLibrary}
          session={debugSession}
          selectedProcessId={debugSelectedProcessId}
          onProcessSelect={setDebugSelectedProcessId}
        />
      ) : (
        <WorkbenchLeftSidebar
          collapsed={leftSidebarCollapsed}
          width={leftSidebarWidth}
          onToggleCollapsed={() => setLeftSidebarCollapsed(prev => !prev)}
          onSave={() => void handleSaveWorkbench()}
          saveStatusLabel={isSaving ? '正在保存…' : saveMessage ?? '保存模板'}
          saveTone={saveTone}
          onResize={setLeftSidebarWidth}
          onBackToLibrary={onBackToLibrary}
          outline={effectiveOutline}
          selectedBlockId={selectedBlockId}
          onBlockSelect={setSelectedBlockId}
          onOutlineNodeDoubleClick={focusRightSidebarFromOutline}
        />
      )}
      <WorkbenchTopTabs
        onBackToLibrary={onBackToLibrary}
        leftBoundary={leftSidebarRight}
        rightReservedWidth={rightSidebarLeft}
        initialTabs={topTabs}
      />
      {debugPanelOpen ? (
        <WorkbenchDebugPanel
          collapsed={rightSidebarCollapsed}
          width={rightSidebarWidth}
          sessionId={debugSessionId}
          session={debugSession}
          selectedProcessId={debugSelectedProcessId}
          error={debugError}
          formFields={runtimeFormFields}
          formValues={runtimeFormValues}
          formLoading={runtimeFormLoading}
          formError={runtimeFormError}
          starting={debugStarting}
          blockOptions={debugBlockOptions}
          onToggleCollapsed={() => setRightSidebarCollapsed(prev => !prev)}
          onResize={setRightSidebarWidth}
          onStart={options => void startWorkbenchDebug(options)}
          onPause={() => void controlDebugSession('pause')}
          onResume={() => void controlDebugSession('resume')}
          onStop={() => void controlDebugSession('stop')}
          onFormValueChange={(key, value) => setRuntimeFormValues(prev => ({ ...prev, [key]: value }))}
          onRefreshForm={() => void refreshWorkbenchRunForm()}
          onClose={() => setDebugPanelOpen(false)}
        />
      ) : runtimePanelOpen ? (
        <WorkbenchRuntimePanel
          collapsed={rightSidebarCollapsed}
          width={rightSidebarWidth}
          taskId={runtimeTaskId}
          progress={runtimeProgress}
          error={runtimeError}
          formFields={runtimeFormFields}
          formValues={runtimeFormValues}
          formLoading={runtimeFormLoading}
          formError={runtimeFormError}
          starting={runtimeStarting}
          onToggleCollapsed={() => setRightSidebarCollapsed(prev => !prev)}
          onResize={setRightSidebarWidth}
          onStart={options => void startWorkbenchRun(options)}
          onFormValueChange={(key, value) => setRuntimeFormValues(prev => ({ ...prev, [key]: value }))}
          onRefreshForm={() => void refreshWorkbenchRunForm()}
          onClose={() => setRuntimePanelOpen(false)}
        />
      ) : (
        <WorkbenchRightSidebar
          collapsed={rightSidebarCollapsed}
          width={rightSidebarWidth}
          onToggleCollapsed={() => setRightSidebarCollapsed(prev => !prev)}
          onResize={setRightSidebarWidth}
          selectedName={formatSelectedBlockName(selectedBlockId, meta)}
          selectedBlockId={selectedBlockId}
          focusTarget={rightSidebarFocusTarget}
          onOpenFileEditor={setOpenFileEditorFileId}
          meta={meta}
          onMetaPatch={patch => setMeta(prev => ({ ...prev, ...patch }))}
          hiddenFileBlockIds={canvasState.hiddenFileBlockIds ?? []}
          onHiddenFileBlockIdsChange={hiddenFileBlockIds => setCanvasState(prev => ({ ...prev, hiddenFileBlockIds }))}
          onDeleteFile={(fileId: string) => {
            const removed = meta.files.find(file => file.id === fileId)
            if (!removed) return
            const refPath = (removed.path?.trim() || removed.name).replace(/\\/g, '/')
            const ok = window.confirm(`确定删除文件 "${refPath}" 吗？此操作不可撤销。`)
            if (!ok) return
            void (async () => {
              try {
                await fetch(
                  `/api/template-workbench/projects/${encodeURIComponent(projectSequence ?? '')}/files?path=${encodeURIComponent(refPath)}`,
                  { method: 'DELETE', credentials: 'include' },
                )
              } finally {
                setMeta(prev => ({
                  ...prev,
                  files: prev.files.filter(file => file.id !== fileId),
                  fileImportList: prev.fileImportList.filter(name => name !== refPath),
                }))
                setCanvasState(prev => ({
                  ...prev,
                  hiddenFileBlockIds: (prev.hiddenFileBlockIds ?? []).filter(id => id !== fileId),
                }))
                if (openFileEditorFileId === fileId) setOpenFileEditorFileId(null)
                if (selectedBlockId === `file:${fileId}`) setSelectedBlockId(null)
              }
            })()
          }}
        />
      )}
      {transientEditor && transientEditorEnabled && (
        <WorkbenchTransientEditor
          blockId={transientEditor.blockId}
          anchor={transientEditor.anchor}
          selectedName={formatSelectedBlockName(transientEditor.blockId, meta)}
          meta={meta}
          modeLabel={debugPanelOpen ? '调试' : '运行'}
          onClose={() => setTransientEditor(null)}
          onMetaPatch={patch => setMeta(prev => ({ ...prev, ...patch }))}
          onOpenFileEditor={setOpenFileEditorFileId}
        />
      )}
      <WorkbenchDebugTimelineDrawer
        enabled={debugPanelOpen || Boolean(debugSessionId)}
        session={debugSession}
        selectedProcessId={debugSelectedProcessId}
        leftBoundary={leftSidebarRight}
        rightReservedWidth={rightSidebarLeft}
        viewportHeight={workbenchRef.current?.clientHeight ?? window.innerHeight}
        onProcessSelect={setDebugSelectedProcessId}
      />
      <WorkbenchBottomBar
        scale={viewport.scale}
        leftBoundary={leftSidebarRight}
        rightReservedWidth={rightSidebarLeft}
        collapsedLeft={leftSidebarRight + 30}
        onScaleChange={setScaleFromBottomBar}
        onAddNode={openAddNodeFromBottomBar}
        onRun={openRuntimePanel}
        onDebug={openDebugPanel}
        runActive={runtimeStarting || runtimeProgress?.status === 'running'}
        runDisabled={!projectSequence}
      />
      <FileEditorModal
        file={
          openFileEditorFileId
            ? meta.files.find(f => f.id === openFileEditorFileId) ?? null
            : null
        }
        projectSequence={projectSequence ?? null}
        onClose={() => setOpenFileEditorFileId(null)}
        onRenamed={(newMeta: WorkbenchFileMeta) => {
          const previousFile = meta.files.find(f => f.id === newMeta.id)
          setMeta(prev => ({
            ...prev,
            files: prev.files.map(f => (f.id === newMeta.id ? newMeta : f)),
            fileImportList: previousFile && prev.fileImportList.includes(previousFile.name)
              ? Array.from(new Set([...prev.fileImportList.filter(n => n !== previousFile.name), newMeta.name]))
              : prev.fileImportList,
          }))
        }}
        onDeleted={() => {
          if (openFileEditorFileId) {
            const removed = meta.files.find(f => f.id === openFileEditorFileId)
            setMeta(prev => ({
              ...prev,
              files: prev.files.filter(f => f.id !== openFileEditorFileId),
              fileImportList: removed
                ? prev.fileImportList.filter(n => n !== removed.name)
                : prev.fileImportList,
            }))
            setCanvasState(prev => ({
              ...prev,
              hiddenFileBlockIds: (prev.hiddenFileBlockIds ?? []).filter(id => id !== openFileEditorFileId),
            }))
            setOpenFileEditorFileId(null)
          }
        }}
      />
    </div>
  )
}
