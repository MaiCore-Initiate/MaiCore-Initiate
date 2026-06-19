import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ExternalLink, GripVertical, X } from 'lucide-react'
import {
  parseFileBlockId,
  type WorkbenchBlockId,
  type WorkbenchComponentMeta,
  type WorkbenchConfigItemMeta,
  type WorkbenchDeploymentMeta,
  type WorkbenchEnvVariableEntry,
  type WorkbenchLaunchItemMeta,
  type WorkbenchPoint,
  type WorkbenchUninstallItemMeta,
} from '../workbench-canvas/types'
import {
  fillComponentsToIndex,
  fillConfigItemsToIndex,
  fillDeploymentsToIndex,
  fillLaunchItemsToIndex,
  fillUninstallItemsToIndex,
  parseComponentBlockIndex,
  parseConfigItemBlockIndex,
  parseDeploymentBlockIndex,
  parseLaunchItemBlockIndex,
  parseUninstallItemBlockIndex,
} from '../workbench-right-sidebar/blockIndex'
import {
  commandThemeOptions,
  deployMethodOptions,
  deploymentGetMethodOptions,
  getLinkOptions,
  getMethodOptions,
  getVersionOptions,
  installOperateOptions,
  font,
  optionLabels,
  runtimeOptions,
} from '../workbench-right-sidebar/constants'
import {
  emptyComponentMeta,
  emptyConfigItemMeta,
  emptyDeploymentMeta,
  emptyLaunchItemMeta,
  emptyUninstallItemMeta,
} from '../workbench-right-sidebar/defaultMetas'
import type { WorkbenchModInfoMeta } from '../workbench-right-sidebar/types'

const panelWidth = 420
const panelMaxHeight = 620
const viewportMargin = 12

interface WorkbenchTransientEditorProps {
  blockId: WorkbenchBlockId
  anchor: WorkbenchPoint
  selectedName: string
  meta: WorkbenchModInfoMeta
  modeLabel: string
  onClose: () => void
  onMetaPatch: (patch: Partial<WorkbenchModInfoMeta>) => void
  onOpenFileEditor?: (fileId: string) => void
}

interface SelectOption {
  value: string
  label: string
}

function viewportSize() {
  if (typeof window === 'undefined') return { width: 1280, height: 720 }
  return { width: window.innerWidth, height: window.innerHeight }
}

function clampPosition(position: WorkbenchPoint) {
  const viewport = viewportSize()
  return {
    x: Math.max(viewportMargin, Math.min(position.x, viewport.width - panelWidth - viewportMargin)),
    y: Math.max(viewportMargin, Math.min(position.y, viewport.height - 160)),
  }
}

function resolveInitialPosition(anchor: WorkbenchPoint) {
  const viewport = viewportSize()
  const rightX = anchor.x + 16
  const leftX = anchor.x - panelWidth - 16
  const x = rightX + panelWidth + viewportMargin <= viewport.width ? rightX : leftX
  return clampPosition({ x, y: anchor.y - 24 })
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function listToText(value: string[]) {
  return value.join('\n')
}

function textToList(value: string) {
  if (!value) return []
  return value.replace(/\r\n/g, '\n').split('\n').filter(line => line.length > 0)
}

function envEntriesToText(value: WorkbenchEnvVariableEntry[]) {
  return value.map(entry => `${entry.name}=${entry.value}`).join('\n')
}

function textToEnvEntries(value: string): WorkbenchEnvVariableEntry[] {
  if (!value) return []
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex < 0) return { name: line.trim(), value: '' }
      return {
        name: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1),
      }
    })
    .filter(entry => entry.name)
}

function runtimeSelectOptions(allowInherit: boolean): SelectOption[] {
  const options = runtimeOptions.map(value => ({ value, label: optionLabels[value] ?? value }))
  return allowInherit ? [{ value: '', label: '继承 [MODINFO]' }, ...options] : options
}

function commandThemeSelectOptions(): SelectOption[] {
  return commandThemeOptions.map(value => ({ value, label: optionLabels[value] ?? value }))
}

function optionList(values: string[]): SelectOption[] {
  return values.map(value => ({ value, label: optionLabels[value] ?? value }))
}

function controlStyle(active = false) {
  return {
    borderColor: active ? 'var(--dfw-blue)' : 'color-mix(in srgb, var(--dfw-sidebar-border) 34%, transparent)',
    background: active ? 'var(--dfw-outline-selected-bg)' : 'color-mix(in srgb, var(--dfw-sidebar-bg) 90%, transparent)',
    color: 'var(--dfw-text)',
  }
}

function mutedTextStyle(opacity = 0.66) {
  return { color: 'var(--dfw-text)', opacity }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-[6px]">
      <span className="text-[12px] font-medium leading-[16px]" style={mutedTextStyle(0.68)}>{label}</span>
      {children}
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  const sharedClass = 'w-full rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[18px] outline-none transition-colors focus:border-[var(--dfw-blue)]'
  return (
    <Field label={label}>
      {multiline ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          className={`${sharedClass} min-h-[76px] resize-y`}
          style={controlStyle()}
        />
      ) : (
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          className={sharedClass}
          style={controlStyle()}
        />
      )}
    </Field>
  )
}

function ListField({
  label,
  values,
  onChange,
  minHeight = 86,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  minHeight?: number
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => listToText(values))

  useEffect(() => {
    if (!focused) setDraft(listToText(values))
  }, [focused, values])

  return (
    <Field label={label}>
      <textarea
        value={draft}
        onChange={event => {
          setDraft(event.target.value)
          onChange(textToList(event.target.value))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDraft(listToText(textToList(draft)))
        }}
        className="w-full resize-y rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[18px] outline-none transition-colors focus:border-[var(--dfw-blue)]"
        style={{ ...controlStyle(), minHeight }}
      />
    </Field>
  )
}

function EnvField({
  label,
  values,
  onChange,
}: {
  label: string
  values: WorkbenchEnvVariableEntry[]
  onChange: (values: WorkbenchEnvVariableEntry[]) => void
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => envEntriesToText(values))

  useEffect(() => {
    if (!focused) setDraft(envEntriesToText(values))
  }, [focused, values])

  return (
    <Field label={label}>
      <textarea
        value={draft}
        onChange={event => {
          setDraft(event.target.value)
          onChange(textToEnvEntries(event.target.value))
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDraft(envEntriesToText(textToEnvEntries(draft)))
        }}
        className="w-full resize-y rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[18px] outline-none transition-colors focus:border-[var(--dfw-blue)]"
        style={{ ...controlStyle(), minHeight: 86 }}
      />
    </Field>
  )
}

function JsonField<T>({
  label,
  value,
  onChange,
}: {
  label: string
  value: T
  onChange: (value: T) => void
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!invalid) setDraft(JSON.stringify(value, null, 2))
  }, [invalid, value])

  return (
    <Field label={label}>
      <textarea
        value={draft}
        onChange={event => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        onBlur={() => {
          try {
            onChange(JSON.parse(draft) as T)
            setInvalid(false)
          } catch {
            setInvalid(true)
          }
        }}
        className="w-full resize-y rounded-[8px] border px-[10px] py-[8px] font-mono text-[12px] leading-[18px] outline-none transition-colors focus:border-[var(--dfw-blue)]"
        style={{
          ...controlStyle(),
          minHeight: 110,
          borderColor: invalid ? '#ef4444' : controlStyle().borderColor,
        }}
      />
    </Field>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-[36px] w-full rounded-[8px] border px-[10px] text-[13px] outline-none transition-colors focus:border-[var(--dfw-blue)]"
        style={controlStyle()}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex h-[36px] items-center justify-between rounded-[8px] border px-[10px] text-left text-[13px] font-medium transition-colors"
      style={controlStyle(value)}
    >
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      <span
        className="ml-[10px] flex h-[18px] w-[34px] shrink-0 items-center rounded-full border px-[2px] transition-colors"
        style={{
          borderColor: value ? 'var(--dfw-blue)' : 'color-mix(in srgb, var(--dfw-sidebar-border) 34%, transparent)',
          background: value ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-control-bg)',
        }}
        aria-hidden
      >
        <span
          className="h-[12px] w-[12px] rounded-full bg-current transition-transform"
          style={{ transform: value ? 'translateX(14px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="min-h-[36px] rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[18px]" style={controlStyle()}>
        {value || '空'}
      </div>
    </Field>
  )
}

export default function WorkbenchTransientEditor({
  blockId,
  anchor,
  selectedName,
  meta,
  modeLabel,
  onClose,
  onMetaPatch,
  onOpenFileEditor,
}: WorkbenchTransientEditorProps) {
  const [position, setPosition] = useState(() => resolveInitialPosition(anchor))
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startPosition: WorkbenchPoint } | null>(null)
  const componentIndex = parseComponentBlockIndex(blockId)
  const deploymentIndex = parseDeploymentBlockIndex(blockId)
  const configItemIndex = parseConfigItemBlockIndex(blockId)
  const launchItemIndex = parseLaunchItemBlockIndex(blockId)
  const uninstallItemIndex = parseUninstallItemBlockIndex(blockId)
  const fileId = parseFileBlockId(blockId)
  const component = componentIndex === null ? emptyComponentMeta : { ...emptyComponentMeta, ...meta.components[componentIndex] }
  const deployment = deploymentIndex === null ? emptyDeploymentMeta : { ...emptyDeploymentMeta, ...meta.deployments[deploymentIndex] }
  const configItem = configItemIndex === null ? emptyConfigItemMeta : { ...emptyConfigItemMeta, ...meta.configItems[configItemIndex] }
  const launchItem = launchItemIndex === null ? emptyLaunchItemMeta : { ...emptyLaunchItemMeta, ...meta.launchItems[launchItemIndex] }
  const uninstallItem = uninstallItemIndex === null ? emptyUninstallItemMeta : { ...emptyUninstallItemMeta, ...meta.uninstallItems[uninstallItemIndex] }
  const file = fileId ? meta.files.find(item => item.id === fileId) ?? null : null
  const inheritedRuntimeOptions = useMemo(() => runtimeSelectOptions(true), [])
  const rootRuntimeOptions = useMemo(() => runtimeSelectOptions(false), [])
  const commandThemeOptionsMemo = useMemo(() => commandThemeSelectOptions(), [])

  useEffect(() => {
    setPosition(resolveInitialPosition(anchor))
  }, [anchor, blockId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setPosition(current => clampPosition(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const updateComponent = (patch: Partial<WorkbenchComponentMeta>) => {
    if (componentIndex === null) return
    const nextComponents = fillComponentsToIndex(meta.components, componentIndex)
    nextComponents[componentIndex] = { ...component, ...patch }
    onMetaPatch({ components: nextComponents })
  }

  const updateComponentId = (id: string) => {
    if (componentIndex === null) return
    const previousId = component.id
    const nextComponents = fillComponentsToIndex(meta.components, componentIndex)
    nextComponents[componentIndex] = { ...component, id }
    const componentIds = nextComponents.map(item => item.id).filter(Boolean)
    const extraIds = meta.componentsList.filter(item => item && item !== previousId && !componentIds.includes(item))
    const nextList = [...componentIds, ...extraIds]
    onMetaPatch({
      components: nextComponents,
      componentsList: arraysEqual(nextList, meta.componentsList) ? meta.componentsList : nextList,
    })
  }

  const updateDeployment = (patch: Partial<WorkbenchDeploymentMeta>) => {
    if (deploymentIndex === null) return
    const nextDeployments = fillDeploymentsToIndex(meta.deployments, deploymentIndex)
    nextDeployments[deploymentIndex] = { ...deployment, ...patch }
    onMetaPatch({ deployments: nextDeployments })
  }

  const updateDeploymentId = (id: string) => {
    if (deploymentIndex === null) return
    const previousId = deployment.id
    const nextDeployments = fillDeploymentsToIndex(meta.deployments, deploymentIndex)
    nextDeployments[deploymentIndex] = { ...deployment, id }
    const deploymentIds = nextDeployments.map(item => item.id).filter(Boolean)
    const extraIds = meta.deployList.filter(item => item && item !== previousId && !deploymentIds.includes(item))
    const nextList = [...deploymentIds, ...extraIds]
    onMetaPatch({
      deployments: nextDeployments,
      deployList: arraysEqual(nextList, meta.deployList) ? meta.deployList : nextList,
    })
  }

  const updateConfigItem = (patch: Partial<WorkbenchConfigItemMeta>) => {
    if (configItemIndex === null) return
    const nextConfigItems = fillConfigItemsToIndex(meta.configItems, configItemIndex)
    nextConfigItems[configItemIndex] = { ...configItem, ...patch }
    onMetaPatch({ configItems: nextConfigItems })
  }

  const updateConfigItemId = (id: string) => {
    if (configItemIndex === null) return
    const previousId = configItem.id
    const nextConfigItems = fillConfigItemsToIndex(meta.configItems, configItemIndex)
    nextConfigItems[configItemIndex] = { ...configItem, id }
    const configItemIds = nextConfigItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.configList.filter(item => item && item !== previousId && !configItemIds.includes(item))
    const nextList = [...configItemIds, ...extraIds]
    onMetaPatch({
      configItems: nextConfigItems,
      configList: arraysEqual(nextList, meta.configList) ? meta.configList : nextList,
    })
  }

  const updateLaunchItem = (patch: Partial<WorkbenchLaunchItemMeta>) => {
    if (launchItemIndex === null) return
    const nextLaunchItems = fillLaunchItemsToIndex(meta.launchItems, launchItemIndex)
    nextLaunchItems[launchItemIndex] = { ...launchItem, ...patch }
    onMetaPatch({ launchItems: nextLaunchItems })
  }

  const updateLaunchItemId = (id: string) => {
    if (launchItemIndex === null) return
    const previousId = launchItem.id
    const nextLaunchItems = fillLaunchItemsToIndex(meta.launchItems, launchItemIndex)
    nextLaunchItems[launchItemIndex] = { ...launchItem, id }
    const launchItemIds = nextLaunchItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.launchList.filter(item => item && item !== previousId && !launchItemIds.includes(item))
    const nextList = [...launchItemIds, ...extraIds]
    onMetaPatch({
      launchItems: nextLaunchItems,
      launchList: arraysEqual(nextList, meta.launchList) ? meta.launchList : nextList,
    })
  }

  const updateUninstallItem = (patch: Partial<WorkbenchUninstallItemMeta>) => {
    if (uninstallItemIndex === null) return
    const nextUninstallItems = fillUninstallItemsToIndex(meta.uninstallItems, uninstallItemIndex)
    nextUninstallItems[uninstallItemIndex] = { ...uninstallItem, ...patch }
    onMetaPatch({ uninstallItems: nextUninstallItems })
  }

  const updateUninstallItemId = (id: string) => {
    if (uninstallItemIndex === null) return
    const previousId = uninstallItem.id
    const nextUninstallItems = fillUninstallItemsToIndex(meta.uninstallItems, uninstallItemIndex)
    nextUninstallItems[uninstallItemIndex] = { ...uninstallItem, id }
    const uninstallItemIds = nextUninstallItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.uninstallList.filter(item => item && item !== previousId && !uninstallItemIds.includes(item))
    const nextList = [...uninstallItemIds, ...extraIds]
    onMetaPatch({
      uninstallItems: nextUninstallItems,
      uninstallList: arraysEqual(nextList, meta.uninstallList) ? meta.uninstallList : nextList,
    })
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: position,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    setPosition(clampPosition({
      x: drag.startPosition.x + event.clientX - drag.startX,
      y: drag.startPosition.y + event.clientY - drag.startY,
    }))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const body = (() => {
    if (blockId === 'init') {
      return (
        <>
          <TextField label="作者" value={meta.author} onChange={author => onMetaPatch({ author })} />
          <ListField label="标签列表" values={meta.tags} onChange={tags => onMetaPatch({ tags })} minHeight={64} />
          <TextField label="模板名称" value={meta.modName} onChange={modName => onMetaPatch({ modName })} />
          <TextField label="模板 ID" value={meta.modId} onChange={modId => onMetaPatch({ modId })} />
          <TextField label="版本号" value={meta.version} onChange={version => onMetaPatch({ version })} />
          <TextField label="最低支持版本" value={meta.minVersion} onChange={minVersion => onMetaPatch({ minVersion })} />
          <TextField label="最高支持版本" value={meta.maxVersion} onChange={maxVersion => onMetaPatch({ maxVersion })} />
          <TextField label="描述" value={meta.description} onChange={description => onMetaPatch({ description })} multiline />
          <SelectField label="默认运行时" value={meta.runtime} options={rootRuntimeOptions} onChange={runtime => onMetaPatch({ runtime })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="启用文件导入" value={meta.fileImport} onChange={fileImport => onMetaPatch({ fileImport })} />
            <ToggleField label="Deno 全部权限" value={meta.denoAll} onChange={denoAll => onMetaPatch({ denoAll })} />
            <ToggleField label="Deno 网络" value={meta.denoNet} onChange={denoNet => onMetaPatch({ denoNet })} />
            <ToggleField label="Deno 读取" value={meta.denoRead} onChange={denoRead => onMetaPatch({ denoRead })} />
            <ToggleField label="Deno 写入" value={meta.denoWrite} onChange={denoWrite => onMetaPatch({ denoWrite })} />
            <ToggleField label="Deno 环境变量" value={meta.denoEnv} onChange={denoEnv => onMetaPatch({ denoEnv })} />
            <ToggleField label="Deno 子进程" value={meta.denoRun} onChange={denoRun => onMetaPatch({ denoRun })} />
            <ToggleField label="Deno 高精度时间" value={meta.denoHrtime} onChange={denoHrtime => onMetaPatch({ denoHrtime })} />
            <ToggleField label="Deno 动态库" value={meta.denoFfi} onChange={denoFfi => onMetaPatch({ denoFfi })} />
            <ToggleField label="Deno 系统信息" value={meta.denoSys} onChange={denoSys => onMetaPatch({ denoSys })} />
            <ToggleField label="自定义 Deno 权限" value={meta.denoCustomPermissions} onChange={denoCustomPermissions => onMetaPatch({ denoCustomPermissions })} />
          </div>
          <ListField label="文件导入列表" values={meta.fileImportList} onChange={fileImportList => onMetaPatch({ fileImportList })} />
          <ListField label="平台限制" values={meta.platforms} onChange={platforms => onMetaPatch({ platforms })} minHeight={64} />
          <ListField label="Deno 自定义权限" values={meta.denoPermissionList} onChange={denoPermissionList => onMetaPatch({ denoPermissionList })} />
          <TextField label="模板格式版本" value={meta.schemaVersion} onChange={schemaVersion => onMetaPatch({ schemaVersion })} />
        </>
      )
    }

    if (blockId === 'components') {
      return (
        <>
          <ToggleField label="[COMPONENTS] 环境变量导出" value={meta.componentsEnvOutput} onChange={componentsEnvOutput => onMetaPatch({ componentsEnvOutput })} />
          <ToggleField label="[COMPONENTS] 环境变量导入" value={meta.componentsEnvInput} onChange={componentsEnvInput => onMetaPatch({ componentsEnvInput })} />
          <ListField label="组件 ID 列表" values={meta.componentsList} onChange={componentsList => onMetaPatch({ componentsList })} />
        </>
      )
    }

    if (blockId === 'deploy') {
      return (
        <>
          <ToggleField label="[DEPLOY] 环境变量导出" value={meta.deployEnvOutput} onChange={deployEnvOutput => onMetaPatch({ deployEnvOutput })} />
          <ToggleField label="[DEPLOY] 环境变量导入" value={meta.deployEnvInput} onChange={deployEnvInput => onMetaPatch({ deployEnvInput })} />
          <ListField label="部署 ID 列表" values={meta.deployList} onChange={deployList => onMetaPatch({ deployList })} />
        </>
      )
    }

    if (blockId === 'config') {
      return (
        <>
          <ToggleField label="[CONFIG] 环境变量导出" value={meta.configEnvOutput} onChange={configEnvOutput => onMetaPatch({ configEnvOutput })} />
          <ToggleField label="[CONFIG] 环境变量导入" value={meta.configEnvInput} onChange={configEnvInput => onMetaPatch({ configEnvInput })} />
          <ListField label="配置 ID 列表" values={meta.configList} onChange={configList => onMetaPatch({ configList })} />
        </>
      )
    }

    if (blockId === 'launch') {
      return (
        <>
          <ToggleField label="[LAUNCH] 环境变量导出" value={meta.launchEnvOutput} onChange={launchEnvOutput => onMetaPatch({ launchEnvOutput })} />
          <ToggleField label="[LAUNCH] 环境变量导入" value={meta.launchEnvInput} onChange={launchEnvInput => onMetaPatch({ launchEnvInput })} />
          <ListField label="启动 ID 列表" values={meta.launchList} onChange={launchList => onMetaPatch({ launchList })} />
        </>
      )
    }

    if (blockId === 'uninstall') {
      return (
        <>
          <ToggleField label="[UNINSTALL] 环境变量导出" value={meta.uninstallEnvOutput} onChange={uninstallEnvOutput => onMetaPatch({ uninstallEnvOutput })} />
          <ToggleField label="[UNINSTALL] 环境变量导入" value={meta.uninstallEnvInput} onChange={uninstallEnvInput => onMetaPatch({ uninstallEnvInput })} />
          <ListField label="卸载 ID 列表" values={meta.uninstallList} onChange={uninstallList => onMetaPatch({ uninstallList })} />
        </>
      )
    }

    if (componentIndex !== null) {
      return (
        <>
          <TextField label="组件名称" value={component.name} onChange={name => updateComponent({ name })} />
          <TextField label="组件 ID" value={component.id} onChange={updateComponentId} />
          <SelectField label="运行时" value={component.runtime} options={inheritedRuntimeOptions} onChange={runtime => updateComponent({ runtime })} />
          <SelectField label="命令主题" value={component.commandTheme} options={commandThemeOptionsMemo} onChange={commandTheme => updateComponent({ commandTheme })} />
          <SelectField label="获取方法" value={component.getMethod} options={optionList(getMethodOptions)} onChange={getMethod => updateComponent({ getMethod })} />
          <SelectField label="版本获取方式" value={component.getVersion} options={optionList(getVersionOptions)} onChange={getVersion => updateComponent({ getVersion })} />
          <SelectField label="链接获取方式" value={component.getLink} options={optionList(getLinkOptions)} onChange={getLink => updateComponent({ getLink })} />
          <SelectField label="安装操作方式" value={component.installOperate} options={optionList(installOperateOptions)} onChange={installOperate => updateComponent({ installOperate })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="用户可选" value={component.choose} onChange={choose => updateComponent({ choose })} />
            <ToggleField label="需要安装" value={component.install} onChange={install => updateComponent({ install })} />
            <ToggleField label="安装命令" value={component.commandInstall} onChange={commandInstall => updateComponent({ commandInstall })} />
            <ToggleField label="安装检查" value={component.check} onChange={check => updateComponent({ check })} />
            <ToggleField label="用户可选版本" value={component.userChoose} onChange={userChoose => updateComponent({ userChoose })} />
            <ToggleField label="格式化版本" value={component.formatVersion} onChange={formatVersion => updateComponent({ formatVersion })} />
            <ToggleField label="安装前操作" value={component.beforeCommand} onChange={beforeCommand => updateComponent({ beforeCommand })} />
            <ToggleField label="安装后操作" value={component.afterCommand} onChange={afterCommand => updateComponent({ afterCommand })} />
            <ToggleField label="变量导出" value={component.envOutput} onChange={envOutput => updateComponent({ envOutput })} />
            <ToggleField label="变量导入" value={component.envInput} onChange={envInput => updateComponent({ envInput })} />
          </div>
          <TextField label="直接下载链接" value={component.directLink} onChange={directLink => updateComponent({ directLink })} />
          <TextField label="GitHub 仓库" value={component.githubRepo} onChange={githubRepo => updateComponent({ githubRepo })} />
          <TextField label="版本拼接链接" value={component.splicingLink} onChange={splicingLink => updateComponent({ splicingLink })} />
          <ListField label="安装命令列表" values={component.installCommandList} onChange={installCommandList => updateComponent({ installCommandList })} />
          <ListField label="检查命令列表" values={component.checkCommand} onChange={checkCommand => updateComponent({ checkCommand })} />
          <ListField label="版本关键字" values={component.checkVersionContains} onChange={checkVersionContains => updateComponent({ checkVersionContains })} />
          <ListField label="版本正则" values={component.checkVersionRegex} onChange={checkVersionRegex => updateComponent({ checkVersionRegex })} />
          <ListField label="版本文件来源" values={component.versionFile} onChange={versionFile => updateComponent({ versionFile })} />
          <ListField label="版本脚本来源" values={component.versionCustom} onChange={versionCustom => updateComponent({ versionCustom })} />
          <ListField label="可选链接列表" values={component.getLinkProvideList} onChange={getLinkProvideList => updateComponent({ getLinkProvideList })} />
          <ListField label="链接文件来源" values={component.linkFile} onChange={linkFile => updateComponent({ linkFile })} />
          <ListField label="链接脚本来源" values={component.linkCustom} onChange={linkCustom => updateComponent({ linkCustom })} />
          <ListField label="Deno 权限参数" values={component.denoPermissions} onChange={denoPermissions => updateComponent({ denoPermissions })} />
          <ListField label="JVM 参数" values={component.jvm} onChange={jvm => updateComponent({ jvm })} />
          <ListField label="版本选择列表" values={component.chooseList} onChange={chooseList => updateComponent({ chooseList })} />
          <ListField label="安装前命令" values={component.beforeCommandList} onChange={beforeCommandList => updateComponent({ beforeCommandList })} />
          <ListField label="安装后命令" values={component.afterCommandList} onChange={afterCommandList => updateComponent({ afterCommandList })} />
          <TextField label="安装路径" value={component.installPath} onChange={installPath => updateComponent({ installPath })} />
          <TextField label="自定义路径" value={component.customPath} onChange={customPath => updateComponent({ customPath })} />
          <EnvField label="导出变量 name=value" values={component.envOutputList} onChange={envOutputList => updateComponent({ envOutputList })} />
          <EnvField label="导入变量 name=value" values={component.envInputList} onChange={envInputList => updateComponent({ envInputList })} />
          <JsonField label="版本格式化规则 JSON" value={component.versionFormattingFormula} onChange={versionFormattingFormula => updateComponent({ versionFormattingFormula })} />
          <JsonField label="自定义安装规则 JSON" value={component.installCustomList} onChange={installCustomList => updateComponent({ installCustomList })} />
        </>
      )
    }

    if (deploymentIndex !== null) {
      return (
        <>
          <TextField label="部署名称" value={deployment.name} onChange={name => updateDeployment({ name })} />
          <TextField label="部署 ID" value={deployment.id} onChange={updateDeploymentId} />
          <SelectField label="运行时" value={deployment.runtime} options={inheritedRuntimeOptions} onChange={runtime => updateDeployment({ runtime })} />
          <SelectField label="命令主题" value={deployment.commandTheme} options={commandThemeOptionsMemo} onChange={commandTheme => updateDeployment({ commandTheme })} />
          <SelectField label="部署方式" value={deployment.deployMethod} options={optionList(deployMethodOptions)} onChange={deployMethod => updateDeployment({ deployMethod })} />
          <SelectField label="获取方法" value={deployment.getMethod} options={optionList(deploymentGetMethodOptions)} onChange={getMethod => updateDeployment({ getMethod })} />
          <SelectField label="版本获取方式" value={deployment.getVersion} options={optionList(getVersionOptions)} onChange={getVersion => updateDeployment({ getVersion })} />
          <SelectField label="链接获取方式" value={deployment.getLink} options={optionList(getLinkOptions)} onChange={getLink => updateDeployment({ getLink })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="用户可选" value={deployment.choose} onChange={choose => updateDeployment({ choose })} />
            <ToggleField label="启用部署" value={deployment.deploy} onChange={deploy => updateDeployment({ deploy })} />
            <ToggleField label="部署命令" value={deployment.commandDeploy} onChange={commandDeploy => updateDeployment({ commandDeploy })} />
            <ToggleField label="用户可选版本" value={deployment.userChoose} onChange={userChoose => updateDeployment({ userChoose })} />
            <ToggleField label="格式化版本" value={deployment.formatVersion} onChange={formatVersion => updateDeployment({ formatVersion })} />
            <ToggleField label="部署前操作" value={deployment.beforeCommand} onChange={beforeCommand => updateDeployment({ beforeCommand })} />
            <ToggleField label="部署后操作" value={deployment.afterCommand} onChange={afterCommand => updateDeployment({ afterCommand })} />
            <ToggleField label="变量导出" value={deployment.envOutput} onChange={envOutput => updateDeployment({ envOutput })} />
            <ToggleField label="变量导入" value={deployment.envInput} onChange={envInput => updateDeployment({ envInput })} />
          </div>
          <TextField label="部署基础链接" value={deployment.baseLink} onChange={baseLink => updateDeployment({ baseLink })} />
          <TextField label="GitHub 仓库" value={deployment.githubRepo} onChange={githubRepo => updateDeployment({ githubRepo })} />
          <TextField label="版本拼接链接" value={deployment.splicingLink} onChange={splicingLink => updateDeployment({ splicingLink })} />
          <ListField label="部署命令列表" values={deployment.deployCommandList} onChange={deployCommandList => updateDeployment({ deployCommandList })} />
          <ListField label="版本文件来源" values={deployment.versionFile} onChange={versionFile => updateDeployment({ versionFile })} />
          <ListField label="版本脚本来源" values={deployment.versionCustom} onChange={versionCustom => updateDeployment({ versionCustom })} />
          <ListField label="可选链接列表" values={deployment.getLinkProvideList} onChange={getLinkProvideList => updateDeployment({ getLinkProvideList })} />
          <ListField label="链接文件来源" values={deployment.linkFile} onChange={linkFile => updateDeployment({ linkFile })} />
          <ListField label="链接脚本来源" values={deployment.linkCustom} onChange={linkCustom => updateDeployment({ linkCustom })} />
          <ListField label="Deno 权限参数" values={deployment.denoPermissions} onChange={denoPermissions => updateDeployment({ denoPermissions })} />
          <ListField label="JVM 参数" values={deployment.jvm} onChange={jvm => updateDeployment({ jvm })} />
          <ListField label="版本选择列表" values={deployment.chooseList} onChange={chooseList => updateDeployment({ chooseList })} />
          <ListField label="部署前命令" values={deployment.beforeCommandList} onChange={beforeCommandList => updateDeployment({ beforeCommandList })} />
          <ListField label="部署后命令" values={deployment.afterCommandList} onChange={afterCommandList => updateDeployment({ afterCommandList })} />
          <TextField label="部署路径" value={deployment.deployPath} onChange={deployPath => updateDeployment({ deployPath })} />
          <TextField label="自定义路径" value={deployment.customPath} onChange={customPath => updateDeployment({ customPath })} />
          <EnvField label="导出变量 name=value" values={deployment.envOutputList} onChange={envOutputList => updateDeployment({ envOutputList })} />
          <EnvField label="导入变量 name=value" values={deployment.envInputList} onChange={envInputList => updateDeployment({ envInputList })} />
          <JsonField label="版本格式化规则 JSON" value={deployment.versionFormattingFormula} onChange={versionFormattingFormula => updateDeployment({ versionFormattingFormula })} />
        </>
      )
    }

    if (configItemIndex !== null) {
      return (
        <>
          <TextField label="配置名称" value={configItem.name} onChange={name => updateConfigItem({ name })} />
          <TextField label="配置 ID" value={configItem.id} onChange={updateConfigItemId} />
          <SelectField label="运行时" value={configItem.runtime} options={inheritedRuntimeOptions} onChange={runtime => updateConfigItem({ runtime })} />
          <SelectField label="命令主题" value={configItem.commandTheme} options={commandThemeOptionsMemo} onChange={commandTheme => updateConfigItem({ commandTheme })} />
          <TextField label="配置文件路径" value={configItem.filePath} onChange={filePath => updateConfigItem({ filePath })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="用户可选" value={configItem.choose} onChange={choose => updateConfigItem({ choose })} />
            <ToggleField label="变量导入" value={configItem.envInput} onChange={envInput => updateConfigItem({ envInput })} />
          </div>
          <EnvField label="导入变量 name=value" values={configItem.envInputList} onChange={envInputList => updateConfigItem({ envInputList })} />
        </>
      )
    }

    if (launchItemIndex !== null) {
      return (
        <>
          <TextField label="启动名称" value={launchItem.name} onChange={name => updateLaunchItem({ name })} />
          <TextField label="启动 ID" value={launchItem.id} onChange={updateLaunchItemId} />
          <SelectField label="运行时" value={launchItem.runtime} options={inheritedRuntimeOptions} onChange={runtime => updateLaunchItem({ runtime })} />
          <SelectField label="命令主题" value={launchItem.commandTheme} options={commandThemeOptionsMemo} onChange={commandTheme => updateLaunchItem({ commandTheme })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="用户可选" value={launchItem.choose} onChange={choose => updateLaunchItem({ choose })} />
            <ToggleField label="启用启动" value={launchItem.launch} onChange={launch => updateLaunchItem({ launch })} />
            <ToggleField label="变量导入" value={launchItem.envInput} onChange={envInput => updateLaunchItem({ envInput })} />
            <ToggleField label="变量导出" value={launchItem.envOutput} onChange={envOutput => updateLaunchItem({ envOutput })} />
          </div>
          <ListField label="启动命令列表" values={launchItem.launchCommand} onChange={launchCommand => updateLaunchItem({ launchCommand })} />
          <EnvField label="导入变量 name=value" values={launchItem.envInputList} onChange={envInputList => updateLaunchItem({ envInputList })} />
          <EnvField label="导出变量 name=value" values={launchItem.envOutputList} onChange={envOutputList => updateLaunchItem({ envOutputList })} />
        </>
      )
    }

    if (uninstallItemIndex !== null) {
      return (
        <>
          <TextField label="卸载名称" value={uninstallItem.name} onChange={name => updateUninstallItem({ name })} />
          <TextField label="卸载 ID" value={uninstallItem.id} onChange={updateUninstallItemId} />
          <SelectField label="运行时" value={uninstallItem.runtime} options={inheritedRuntimeOptions} onChange={runtime => updateUninstallItem({ runtime })} />
          <SelectField label="命令主题" value={uninstallItem.commandTheme} options={commandThemeOptionsMemo} onChange={commandTheme => updateUninstallItem({ commandTheme })} />
          <div className="grid grid-cols-2 gap-[8px]">
            <ToggleField label="用户可选" value={uninstallItem.choose} onChange={choose => updateUninstallItem({ choose })} />
            <ToggleField label="启用卸载" value={uninstallItem.uninstall} onChange={uninstall => updateUninstallItem({ uninstall })} />
            <ToggleField label="先停止" value={uninstallItem.stopBeforeUninstall} onChange={stopBeforeUninstall => updateUninstallItem({ stopBeforeUninstall })} />
            <ToggleField label="删除配置" value={uninstallItem.removeInstanceConfig} onChange={removeInstanceConfig => updateUninstallItem({ removeInstanceConfig })} />
            <ToggleField label="删除运行文件" value={uninstallItem.removeRuntimeFiles} onChange={removeRuntimeFiles => updateUninstallItem({ removeRuntimeFiles })} />
            <ToggleField label="删除部署目录" value={uninstallItem.removeDeployRoot} onChange={removeDeployRoot => updateUninstallItem({ removeDeployRoot })} />
            <ToggleField label="删除组件目录" value={uninstallItem.removeComponent} onChange={removeComponent => updateUninstallItem({ removeComponent })} />
            <ToggleField label="卸载前操作" value={uninstallItem.beforeCommand} onChange={beforeCommand => updateUninstallItem({ beforeCommand })} />
            <ToggleField label="卸载后操作" value={uninstallItem.afterCommand} onChange={afterCommand => updateUninstallItem({ afterCommand })} />
            <ToggleField label="变量导入" value={uninstallItem.envInput} onChange={envInput => updateUninstallItem({ envInput })} />
            <ToggleField label="变量导出" value={uninstallItem.envOutput} onChange={envOutput => updateUninstallItem({ envOutput })} />
          </div>
          <ListField label="停止命令列表" values={uninstallItem.stopCommandList} onChange={stopCommandList => updateUninstallItem({ stopCommandList })} />
          <ListField label="部署目标" values={uninstallItem.deploymentTargets} onChange={deploymentTargets => updateUninstallItem({ deploymentTargets })} />
          <ListField label="组件目标" values={uninstallItem.componentTargets} onChange={componentTargets => updateUninstallItem({ componentTargets })} />
          <ListField label="卸载前命令" values={uninstallItem.beforeCommandList} onChange={beforeCommandList => updateUninstallItem({ beforeCommandList })} />
          <ListField label="卸载后命令" values={uninstallItem.afterCommandList} onChange={afterCommandList => updateUninstallItem({ afterCommandList })} />
          <EnvField label="导入变量 name=value" values={uninstallItem.envInputList} onChange={envInputList => updateUninstallItem({ envInputList })} />
          <EnvField label="导出变量 name=value" values={uninstallItem.envOutputList} onChange={envOutputList => updateUninstallItem({ envOutputList })} />
        </>
      )
    }

    if (fileId) {
      return (
        <>
          <ReadOnlyField label="文件名" value={file?.name ?? fileId} />
          <ReadOnlyField label="文件路径" value={file?.path ?? ''} />
          <ReadOnlyField label="语言" value={file?.language ?? ''} />
          <button
            type="button"
            onClick={() => onOpenFileEditor?.(fileId)}
            className="flex h-[38px] items-center justify-center gap-[8px] rounded-[8px] border px-[12px] text-[13px] font-medium transition-colors hover:bg-[var(--dfw-control-hover)]"
            style={{
              borderColor: 'var(--dfw-blue)',
              background: 'var(--dfw-outline-selected-bg)',
              color: 'var(--dfw-text)',
            }}
          >
            <ExternalLink size={16} strokeWidth={2} />
            <span>打开文件编辑器</span>
          </button>
        </>
      )
    }

    return (
      <div className="rounded-[8px] border px-[10px] py-[12px] text-[13px] leading-[20px]" style={controlStyle()}>
        这个块暂无可快捷编辑的字段。
      </div>
    )
  })()

  return (
    <section
      data-workbench-ui
      className="fixed z-50 overflow-hidden rounded-[8px] border shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur"
      style={{
        left: position.x,
        top: position.y,
        width: panelWidth,
        maxHeight: `min(${panelMaxHeight}px, calc(100vh - ${viewportMargin * 2}px))`,
        borderColor: 'color-mix(in srgb, var(--dfw-sidebar-border) 34%, transparent)',
        background: 'color-mix(in srgb, var(--dfw-sidebar-bg) 96%, transparent)',
        color: 'var(--dfw-text)',
        fontFamily: font,
      }}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      <div
        className="flex h-[46px] cursor-grab items-center gap-[10px] border-b px-[12px] active:cursor-grabbing"
        style={{ borderColor: 'color-mix(in srgb, var(--dfw-sidebar-border) 28%, transparent)' }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <GripVertical size={16} className="shrink-0" style={mutedTextStyle(0.52)} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold leading-[18px]" style={{ color: 'var(--dfw-text)' }}>
            {selectedName}
          </h2>
          <p className="text-[11px] leading-[14px]" style={mutedTextStyle(0.56)}>{modeLabel}快捷编辑</p>
        </div>
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={onClose}
          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{ color: 'var(--dfw-text)' }}
          aria-label="关闭临时编辑框"
          title="关闭"
        >
          <X size={17} strokeWidth={2} />
        </button>
      </div>

      <div
        className="grid gap-[10px] overflow-y-auto px-[12px] py-[12px]"
        style={{ maxHeight: `min(${panelMaxHeight - 46}px, calc(100vh - 94px))` }}
      >
        {body}
      </div>
    </section>
  )
}
