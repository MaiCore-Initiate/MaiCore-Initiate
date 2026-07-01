import type { WorkbenchBlockId } from '../workbench-canvas/types'
import type {
  WorkbenchComponentMeta,
  WorkbenchConfigItemMeta,
  WorkbenchDeploymentMeta,
  WorkbenchLaunchItemMeta,
  WorkbenchUninstallItemMeta,
} from '../workbench-canvas/types'
import {
  emptyComponentMeta,
  emptyConfigItemMeta,
  emptyDeploymentMeta,
  emptyLaunchItemMeta,
  emptyUninstallItemMeta,
} from './defaultMetas'

// 5 对 parse + fill 工具：解析 'xxx:N' 形式的 blockId 出索引 N；把数组填充到指定索引（缺位用空 meta 占位）。
// 仅依赖 defaultMetas 单向引用，不构成循环。

export function parseComponentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('component:')) return null
  const index = Number(blockId.slice('component:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function fillComponentsToIndex(components: WorkbenchComponentMeta[], index: number) {
  if (components.length > index) return [...components]
  return [
    ...components,
    ...Array.from({ length: index - components.length + 1 }, () => ({ ...emptyComponentMeta })),
  ]
}

export function parseDeploymentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('deployment:')) return null
  const index = Number(blockId.slice('deployment:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function fillDeploymentsToIndex(deployments: WorkbenchDeploymentMeta[], index: number) {
  if (deployments.length > index) return [...deployments]
  return [
    ...deployments,
    ...Array.from({ length: index - deployments.length + 1 }, () => ({ ...emptyDeploymentMeta })),
  ]
}

export function parseConfigItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('config-item:')) return null
  const index = Number(blockId.slice('config-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function fillConfigItemsToIndex(configItems: WorkbenchConfigItemMeta[], index: number) {
  if (configItems.length > index) return [...configItems]
  return [
    ...configItems,
    ...Array.from({ length: index - configItems.length + 1 }, () => ({ ...emptyConfigItemMeta })),
  ]
}

export function parseLaunchItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('launch-item:')) return null
  const index = Number(blockId.slice('launch-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function fillLaunchItemsToIndex(launchItems: WorkbenchLaunchItemMeta[], index: number) {
  if (launchItems.length > index) return [...launchItems]
  return [
    ...launchItems,
    ...Array.from({ length: index - launchItems.length + 1 }, () => ({ ...emptyLaunchItemMeta })),
  ]
}

export function parseUninstallItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('uninstall-item:')) return null
  const index = Number(blockId.slice('uninstall-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

export function fillUninstallItemsToIndex(uninstallItems: WorkbenchUninstallItemMeta[], index: number) {
  if (uninstallItems.length > index) return [...uninstallItems]
  return [
    ...uninstallItems,
    ...Array.from({ length: index - uninstallItems.length + 1 }, () => ({ ...emptyUninstallItemMeta })),
  ]
}
