import type {
  WorkbenchCustomInstallRule,
  WorkbenchEnvVariableEntry,
  WorkbenchVersionFormattingRule,
} from '../workbench-canvas/types'
import type {
  ArrayListItem,
  CustomInstallRuleItem,
  EnvVariableEntryItem,
  VersionFormattingRuleItem,
} from './types'

// 列表拖拽、选择相关纯工具 + module-private 计数器。
let arrayListItemId = 0

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function clampSelectionIds<T extends { id: string }>(ids: string[], items: T[]) {
  const itemIds = new Set(items.map(item => item.id))
  return ids.filter(id => itemIds.has(id))
}

export function resolveSelectionRange<T extends { id: string }>(items: T[], anchorId: string | null, targetIndex: number) {
  const anchorIndex = anchorId ? items.findIndex(item => item.id === anchorId) : -1
  const start = anchorIndex >= 0 ? anchorIndex : targetIndex
  const from = Math.min(start, targetIndex)
  const to = Math.max(start, targetIndex)
  return items.slice(from, to + 1).map(item => item.id)
}

export function resolveDragGroup<T extends { id: string }>(items: T[], selectedIds: string[], dragItemId: string) {
  const selected = clampSelectionIds(selectedIds, items)
  return selected.includes(dragItemId) ? selected : [dragItemId]
}

export function resolveGroupBoundaryTarget<T extends { id: string }>(items: T[], groupIds: string[], direction: 1 | -1) {
  const groupSet = new Set(groupIds)
  const selectedIndices = items
    .map((item, index) => (groupSet.has(item.id) ? index : -1))
    .filter(index => index >= 0)
  if (selectedIndices.length === 0) return null

  const targetIndex = direction > 0
    ? Math.max(...selectedIndices) + 1
    : Math.min(...selectedIndices) - 1
  const target = items[targetIndex]
  return target && !groupSet.has(target.id) ? target : null
}

export function moveItemGroup<T extends { id: string }>(items: T[], groupIds: string[], direction: 1 | -1) {
  const target = resolveGroupBoundaryTarget(items, groupIds, direction)
  if (!target) return items

  const groupSet = new Set(groupIds)
  const groupItems = items.filter(item => groupSet.has(item.id))
  const restItems = items.filter(item => !groupSet.has(item.id))
  const targetRestIndex = restItems.findIndex(item => item.id === target.id)
  if (targetRestIndex < 0) return items

  const insertIndex = direction > 0 ? targetRestIndex + 1 : targetRestIndex
  return [
    ...restItems.slice(0, insertIndex),
    ...groupItems,
    ...restItems.slice(insertIndex),
  ]
}

// 4 个 item 创建器：每个分配 module-private 唯一 id。
export function createArrayListItem(value: string): ArrayListItem {
  arrayListItemId += 1
  return { id: `array-list-item-${arrayListItemId}`, value }
}

export function createVersionFormattingRuleItem(value: WorkbenchVersionFormattingRule): VersionFormattingRuleItem {
  arrayListItemId += 1
  return {
    id: `version-formatting-rule-${arrayListItemId}`,
    value: { match: value.match, replace: value.replace },
  }
}

export function createEnvVariableEntryItem(value: WorkbenchEnvVariableEntry): EnvVariableEntryItem {
  arrayListItemId += 1
  return {
    id: `env-variable-entry-${arrayListItemId}`,
    value: { name: value.name, value: value.value },
  }
}

export function createCustomInstallRuleItem(value: WorkbenchCustomInstallRule): CustomInstallRuleItem {
  arrayListItemId += 1
  return {
    id: `custom-install-rule-${arrayListItemId}`,
    value: { extension: value.extension, operate: value.operate },
  }
}
