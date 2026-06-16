import { createContext, useContext, type ReactNode } from 'react'
import type {
  WorkbenchBlockId,
  WorkbenchComponentMeta,
  WorkbenchConfigItemMeta,
  WorkbenchDeploymentMeta,
  WorkbenchLaunchItemMeta,
  WorkbenchUninstallItemMeta,
} from '../workbench-canvas/types'
import {
  parseComponentBlockIndex,
  parseConfigItemBlockIndex,
  parseDeploymentBlockIndex,
  parseLaunchItemBlockIndex,
  parseUninstallItemBlockIndex,
} from './blockIndex'
import {
  emptyComponentMeta,
  emptyConfigItemMeta,
  emptyDeploymentMeta,
  emptyLaunchItemMeta,
  emptyUninstallItemMeta,
} from './defaultMetas'
import { extractEnvName, normalizeEnvVariableEntries } from './envVariables'
import type { WorkbenchModInfoMeta } from './types'

export type WorkbenchPlaceholderKind =
  | 'key'
  | 'file_key'
  | 'env'
  | 'install_path'
  | 'deploy_path'
  | 'version'
  | 'file_path'

export interface WorkbenchPlaceholderToken {
  raw: string
  kind: WorkbenchPlaceholderKind
  body: string
  start: number
  end: number
  valid: boolean
}

type WorkbenchPlaceholderScope =
  | 'init'
  | 'components'
  | 'component'
  | 'deploy'
  | 'deployment'
  | 'config'
  | 'config-item'
  | 'launch'
  | 'launch-item'
  | 'uninstall'
  | 'uninstall-item'
  | 'file'
  | 'unknown'

export interface WorkbenchPlaceholderContextValue {
  meta: WorkbenchModInfoMeta
  scope: WorkbenchPlaceholderScope
  importedFiles: Set<string>
  availableEnvNames: Set<string>
  currentComponentTargets: Set<string>
  currentDeploymentTargets: Set<string>
}

const placeholderPattern = /\{\{(key|file_key|env|install_path|deploy_path|version|file_path)\|([^}]*)}}/g
const workbenchPlaceholderContext = createContext<WorkbenchPlaceholderContextValue | null>(null)

const topLevelBlockFieldMap: Record<string, Record<string, string>> = {
  modinfo: {
    author: 'author',
    tags: 'tags',
    description: 'description',
    mod_id: 'modId',
    mod_name: 'modName',
    version: 'version',
    min_version: 'minVersion',
    max_version: 'maxVersion',
    file_import: 'fileImport',
    file_import_list: 'fileImportList',
    runtime: 'runtime',
    deno_net: 'denoNet',
    deno_read: 'denoRead',
    deno_write: 'denoWrite',
    deno_env: 'denoEnv',
    deno_run: 'denoRun',
    deno_hrtime: 'denoHrtime',
    deno_ffi: 'denoFfi',
    deno_sys: 'denoSys',
    deno_all: 'denoAll',
    deno_custom_permissions: 'denoCustomPermissions',
    deno_permission_list: 'denoPermissionList',
    platforms: 'platforms',
    schema_version: 'schemaVersion',
  },
  components: {
    env_output: 'componentsEnvOutput',
    env_input: 'componentsEnvInput',
    list: 'componentsList',
  },
  deploy: {
    env_output: 'deployEnvOutput',
    env_input: 'deployEnvInput',
    list: 'deployList',
  },
  config: {
    env_output: 'configEnvOutput',
    env_input: 'configEnvInput',
    list: 'configList',
  },
  launch: {
    env_output: 'launchEnvOutput',
    env_input: 'launchEnvInput',
    list: 'launchList',
  },
  uninstall: {
    env_output: 'uninstallEnvOutput',
    env_input: 'uninstallEnvInput',
    list: 'uninstallList',
  },
}

export function WorkbenchPlaceholderProvider({
  value,
  children,
}: {
  value: WorkbenchPlaceholderContextValue
  children: ReactNode
}) {
  return (
    <workbenchPlaceholderContext.Provider value={value}>
      {children}
    </workbenchPlaceholderContext.Provider>
  )
}

export function useWorkbenchPlaceholderContext() {
  return useContext(workbenchPlaceholderContext)
}

export function collectBuiltinEnvNames(meta: WorkbenchModInfoMeta) {
  const names = new Set<string>(['nickname', 'serial_number'])

  meta.components.forEach(component => {
    const id = component.id.trim()
    if (id) names.add(`path::component::${id}`)
  })

  meta.deployments.forEach(deployment => {
    const id = deployment.id.trim()
    if (id) names.add(`path::deployment::${id}`)
  })

  return Array.from(names)
}

export function buildWorkbenchPlaceholderContext(
  meta: WorkbenchModInfoMeta,
  selectedBlockId: WorkbenchBlockId | null | undefined,
): WorkbenchPlaceholderContextValue {
  const selectedComponentIndex = parseComponentBlockIndex(selectedBlockId)
  const selectedDeploymentIndex = parseDeploymentBlockIndex(selectedBlockId)
  const selectedConfigItemIndex = parseConfigItemBlockIndex(selectedBlockId)
  const selectedLaunchItemIndex = parseLaunchItemBlockIndex(selectedBlockId)
  const selectedUninstallItemIndex = parseUninstallItemBlockIndex(selectedBlockId)

  const component = selectedComponentIndex === null
    ? emptyComponentMeta
    : { ...emptyComponentMeta, ...(meta.components[selectedComponentIndex] ?? {}) }
  const deployment = selectedDeploymentIndex === null
    ? emptyDeploymentMeta
    : { ...emptyDeploymentMeta, ...(meta.deployments[selectedDeploymentIndex] ?? {}) }
  const configItem = selectedConfigItemIndex === null
    ? emptyConfigItemMeta
    : { ...emptyConfigItemMeta, ...(meta.configItems[selectedConfigItemIndex] ?? {}) }
  const launchItem = selectedLaunchItemIndex === null
    ? emptyLaunchItemMeta
    : { ...emptyLaunchItemMeta, ...(meta.launchItems[selectedLaunchItemIndex] ?? {}) }
  const uninstallItem = selectedUninstallItemIndex === null
    ? emptyUninstallItemMeta
    : { ...emptyUninstallItemMeta, ...(meta.uninstallItems[selectedUninstallItemIndex] ?? {}) }

  const scope = resolvePlaceholderScope(selectedBlockId)
  const importedFiles = new Set(
    meta.fileImport === true
      ? meta.fileImportList.map(value => value.trim()).filter(Boolean)
      : [],
  )
  const availableEnvNames = new Set(collectBuiltinEnvNames(meta))

  collectCurrentEnvInputNames(scope, component, deployment, configItem, launchItem, uninstallItem)
    .forEach(name => availableEnvNames.add(name))

  return {
    meta,
    scope,
    importedFiles,
    availableEnvNames,
    currentComponentTargets: selectedComponentIndex === null
      ? new Set<string>()
      : createCurrentTargets(component.id, component.name, `组件${selectedComponentIndex + 1}`),
    currentDeploymentTargets: selectedDeploymentIndex === null
      ? new Set<string>()
      : createCurrentTargets(deployment.id, deployment.name, `部署${selectedDeploymentIndex + 1}`),
  }
}

export function resolveWorkbenchPlaceholderTokens(
  value: string,
  context: WorkbenchPlaceholderContextValue | null,
) {
  if (!value.includes('{{')) return [] as WorkbenchPlaceholderToken[]

  const tokens: WorkbenchPlaceholderToken[] = []
  placeholderPattern.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = placeholderPattern.exec(value)) !== null) {
    const raw = match[0]
    const kind = match[1] as WorkbenchPlaceholderKind
    const body = match[2] ?? ''
    const start = match.index
    const end = start + raw.length
    tokens.push({
      raw,
      kind,
      body,
      start,
      end,
      valid: context ? validateWorkbenchPlaceholder(kind, body, context) : false,
    })
  }

  return tokens
}

function resolvePlaceholderScope(blockId: WorkbenchBlockId | null | undefined): WorkbenchPlaceholderScope {
  if (blockId === 'init') return 'init'
  if (blockId === 'components') return 'components'
  if (blockId === 'deploy') return 'deploy'
  if (blockId === 'config') return 'config'
  if (blockId === 'launch') return 'launch'
  if (blockId === 'uninstall') return 'uninstall'
  if (blockId?.startsWith('component:')) return 'component'
  if (blockId?.startsWith('deployment:')) return 'deployment'
  if (blockId?.startsWith('config-item:')) return 'config-item'
  if (blockId?.startsWith('launch-item:')) return 'launch-item'
  if (blockId?.startsWith('uninstall-item:')) return 'uninstall-item'
  if (blockId?.startsWith('file:')) return 'file'
  return 'unknown'
}

function collectCurrentEnvInputNames(
  scope: WorkbenchPlaceholderScope,
  component: WorkbenchComponentMeta,
  deployment: WorkbenchDeploymentMeta,
  configItem: WorkbenchConfigItemMeta,
  launchItem: WorkbenchLaunchItemMeta,
  uninstallItem: WorkbenchUninstallItemMeta,
) {
  switch (scope) {
    case 'component':
      return collectEnvInputNames(component.envInput, component.envInputList)
    case 'deployment':
      return collectEnvInputNames(deployment.envInput, deployment.envInputList)
    case 'config-item':
      return collectEnvInputNames(configItem.envInput, configItem.envInputList)
    case 'launch-item':
      return collectEnvInputNames(launchItem.envInput, launchItem.envInputList)
    case 'uninstall-item':
      return collectEnvInputNames(uninstallItem.envInput, uninstallItem.envInputList)
    default:
      return []
  }
}

function collectEnvInputNames(enabled: boolean, values: Parameters<typeof normalizeEnvVariableEntries>[0]) {
  if (enabled !== true) return []
  return normalizeEnvVariableEntries(values)
    .map(extractEnvName)
    .filter((name): name is string => Boolean(name))
}

function createCurrentTargets(...values: Array<string | undefined>) {
  return new Set(values.map(value => value?.trim() ?? '').filter(Boolean))
}

function validateWorkbenchPlaceholder(
  kind: WorkbenchPlaceholderKind,
  rawBody: string,
  context: WorkbenchPlaceholderContextValue,
) {
  const body = rawBody.trim()
  if (!body) return false

  switch (kind) {
    case 'env':
      return context.availableEnvNames.has(body)
    case 'file_path':
      return context.importedFiles.has(body)
    case 'file_key':
      return validateFileKeyPlaceholder(body, context)
    case 'install_path':
      return context.scope === 'component' && context.currentComponentTargets.has(body)
    case 'deploy_path':
      return context.scope === 'deployment' && context.currentDeploymentTargets.has(body)
    case 'version':
      if (context.scope === 'component') return context.currentComponentTargets.has(body)
      if (context.scope === 'deployment') return context.currentDeploymentTargets.has(body)
      return false
    case 'key':
      return validateStaticKeyPlaceholder(body, context.meta)
    default:
      return false
  }
}

function validateFileKeyPlaceholder(body: string, context: WorkbenchPlaceholderContextValue) {
  let matchedFileName = ''

  for (const fileName of context.importedFiles) {
    if (!body.startsWith(`${fileName}.`)) continue
    if (fileName.length > matchedFileName.length) matchedFileName = fileName
  }

  if (!matchedFileName) return false
  const keyPath = body.slice(matchedFileName.length + 1)
  return keyPath.length > 0 && keyPath.split('.').every(Boolean)
}

function validateStaticKeyPlaceholder(path: string, meta: WorkbenchModInfoMeta) {
  const segments = path.split('.').map(segment => segment.trim())
  if (segments.length < 2 || segments.some(segment => segment.length === 0)) return false

  const blockName = normalizeBlockName(segments[0])

  switch (blockName) {
    case 'modinfo':
      return resolveTopLevelBlock(meta, segments.slice(1), topLevelBlockFieldMap.modinfo)
    case 'components':
    case 'deploy':
    case 'config':
    case 'launch':
    case 'uninstall':
      return resolveTopLevelBlock(meta, segments.slice(1), topLevelBlockFieldMap[blockName])
    case 'component':
      return resolveArrayBlock(meta.components, segments.slice(1))
    case 'deployment':
      return resolveArrayBlock(meta.deployments, segments.slice(1))
    case 'configitem':
      return resolveArrayBlock(meta.configItems, segments.slice(1))
    case 'launchitem':
      return resolveArrayBlock(meta.launchItems, segments.slice(1))
    case 'uninstallitem':
      return resolveArrayBlock(meta.uninstallItems, segments.slice(1))
    default:
      return false
  }
}

function resolveTopLevelBlock(
  source: object,
  segments: string[],
  fieldMap?: Record<string, string>,
) {
  const [fieldSegment, ...rest] = segments
  const nextValue = readObjectField(source, fieldSegment, fieldMap)
  if (nextValue === undefined) return false
  return resolveNestedValue(nextValue, rest)
}

function resolveArrayBlock<T extends { id?: string; name?: string }>(source: T[], segments: string[]) {
  if (segments.length < 2) return false

  const [locator, fieldSegment, ...rest] = segments
  const nextValue = locatorIsIndex(locator)
    ? source[Number(locator)]
    : source.find(item => item.id === locator || item.name === locator)
  if (!nextValue) return false

  const fieldValue = readObjectField(nextValue as Record<string, unknown>, fieldSegment)
  if (fieldValue === undefined) return false
  return resolveNestedValue(fieldValue, rest)
}

function resolveNestedValue(value: unknown, segments: string[]): boolean {
  if (Array.isArray(value)) {
    if (segments.length === 0) return true
    const [segment, ...rest] = segments
    if (segment === 'length') return rest.length === 0
    if (!locatorIsIndex(segment)) return false
    const nextValue = value[Number(segment)]
    return nextValue === undefined ? false : resolveNestedValue(nextValue, rest)
  }

  if (value === null || value === undefined) return false
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return segments.length === 0
  }

  if (typeof value === 'object') {
    if (segments.length === 0) return false
    const [segment, ...rest] = segments
    const nextValue = readObjectField(value as Record<string, unknown>, segment)
    return nextValue === undefined ? false : resolveNestedValue(nextValue, rest)
  }

  return false
}

function readObjectField(
  source: object,
  segment: string,
  fieldMap?: Record<string, string>,
) {
  const key = fieldMap ? fieldMap[segment] : toCamelCase(segment)
  if (!key) return undefined
  const record = source as Record<string, unknown>
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined
}

function locatorIsIndex(value: string) {
  return /^\d+$/.test(value)
}

function normalizeBlockName(value: string) {
  return value.replace(/_/g, '').toLowerCase()
}

function toCamelCase(value: string) {
  return value.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}
