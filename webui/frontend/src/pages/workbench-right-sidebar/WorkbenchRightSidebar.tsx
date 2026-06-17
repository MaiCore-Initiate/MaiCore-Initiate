import { useEffect, useMemo, useRef, type PointerEvent } from 'react'
import type {
  WorkbenchComponentMeta,
  WorkbenchConfigItemMeta,
  WorkbenchDeploymentMeta,
  WorkbenchFileMeta,
  WorkbenchLaunchItemMeta,
  WorkbenchUninstallItemMeta,
} from '../workbench-canvas/types'
import {
  font,
  fieldMaxWidth,
  fieldMinWidth,
  rightSidebarCollapsedWidth,
  rightSidebarMaxWidth,
  rightSidebarMinWidth,
  commandThemeOptions,
  getMethodOptions,
  getVersionOptions,
  getLinkOptions,
  installOperateOptions,
} from './constants'
import { emptyComponentMeta, emptyConfigItemMeta, emptyDeploymentMeta, emptyLaunchItemMeta, emptyModInfoMeta, emptyUninstallItemMeta } from './defaultMetas'
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
} from './blockIndex'
import {
  createEnvInputValue,
  createEnvVariableName,
  extractEnvName,
  hasDenoCustomSource,
  hasJvmCustomSource,
  normalizeEnvVariableEntries,
  uniquePresetOptions,
} from './envVariables'
import {
  WorkbenchPlaceholderProvider,
  buildWorkbenchPlaceholderContext,
  collectBuiltinEnvNames,
} from './placeholders'
import { arraysEqual, clamp } from './selection'
import type { WorkbenchModInfoMeta, WorkbenchRightSidebarProps } from './types'
import {
  ArrayListField,
  CustomInstallRuleField,
  EnvVariableTableField,
  VersionFormattingRuleField,
} from './components/listFields'
import {
  AutoGrowTextField,
  BooleanSwitchField,
  ConditionalField,
  FieldLabel,
  OptionSelectField,
  PlatformSelectField,
  RuntimeSelectField,
} from './components/basicFields'
import {
  ConfigItemMetaEditor,
  ConfigMetaEditor,
  DeployMetaEditor,
  DeploymentMetaEditor,
  LaunchItemMetaEditor,
  LaunchMetaEditor,
  UninstallItemMetaEditor,
  UninstallMetaEditor,
} from './components/metaEditors'
import { HiddenGlyph, TextAlignRightGlyph, VisibleGlyph } from './icons'
// 主组件：用 const 箭头函数声明，避免 function hoisting 在 ESM 循环依赖时
// 触发 TDZ；所有子模块、工具、组件从平级模块按需 import。
const WorkbenchRightSidebar = ({
  collapsed,
  width,
  onToggleCollapsed,
  onResize,
  selectedName = '初始化块',
  selectedBlockId = 'init',
  focusTarget = null,
  meta = emptyModInfoMeta,
  onMetaPatch,
  onOpenFileEditor,
  onDeleteFile,
  hiddenFileBlockIds = [],
  onHiddenFileBlockIdsChange,
}: WorkbenchRightSidebarProps) => {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const focusAnimationRef = useRef<Animation | null>(null)
  const fieldAvailableWidth = Math.max(fieldMinWidth, Math.min(fieldMaxWidth, width - 40))
  const hiddenFileBlockIdSet = new Set(hiddenFileBlockIds)

  const updateMeta = (patch: Partial<WorkbenchModInfoMeta>) => {
    onMetaPatch?.(patch)
  }

  const resolveFileRefKey = (file: WorkbenchFileMeta) => (file.path?.trim() || file.name).replace(/\\/g, '/')
  const resolveFileByImportValue = (value: string) => {
    const normalizedValue = value.trim().replace(/\\/g, '/')
    if (!normalizedValue) return null
    return meta.files.find(file => resolveFileRefKey(file) === normalizedValue) ?? null
  }
  const toggleFileBlockVisibility = (fileId: string) => {
    const next = hiddenFileBlockIdSet.has(fileId)
      ? hiddenFileBlockIds.filter(id => id !== fileId)
      : [...hiddenFileBlockIds, fileId]
    onHiddenFileBlockIdsChange?.(next)
  }

  const selectedComponentIndex = parseComponentBlockIndex(selectedBlockId)
  const selectedConfigItemIndex = parseConfigItemBlockIndex(selectedBlockId)
  const selectedLaunchItemIndex = parseLaunchItemBlockIndex(selectedBlockId)
  const selectedUninstallItemIndex = parseUninstallItemBlockIndex(selectedBlockId)
  const component = selectedComponentIndex === null
    ? emptyComponentMeta
    : { ...emptyComponentMeta, ...(meta.components[selectedComponentIndex] ?? {}) }
  const configItem = selectedConfigItemIndex === null
    ? emptyConfigItemMeta
    : { ...emptyConfigItemMeta, ...(meta.configItems[selectedConfigItemIndex] ?? {}) }
  const launchItem = selectedLaunchItemIndex === null
    ? emptyLaunchItemMeta
    : { ...emptyLaunchItemMeta, ...(meta.launchItems[selectedLaunchItemIndex] ?? {}) }
  const uninstallItem = selectedUninstallItemIndex === null
    ? emptyUninstallItemMeta
    : { ...emptyUninstallItemMeta, ...(meta.uninstallItems[selectedUninstallItemIndex] ?? {}) }
  const componentVersionFile = component.versionFile ?? []
  const componentVersionCustom = component.versionCustom ?? []
  const componentLinkFile = component.linkFile ?? []
  const componentLinkCustom = component.linkCustom ?? []
  const componentGetLinkProvideList = component.getLinkProvideList ?? []
  const componentDenoPermissions = component.denoPermissions ?? []
  const componentJvm = component.jvm ?? []
  const showVersionDenoPermissions = hasDenoCustomSource(componentVersionCustom)
  const showVersionJvmOptions = hasJvmCustomSource(componentVersionCustom)
  const showLinkDenoPermissions = hasDenoCustomSource(componentLinkCustom)
  const showLinkJvmOptions = hasJvmCustomSource(componentLinkCustom)
  const componentNameForPlaceholder = component.id || component.name || `组件${(selectedComponentIndex ?? 0) + 1}`
  const componentEnvOutputList = normalizeEnvVariableEntries(component.envOutputList)
  const componentEnvInputList = normalizeEnvVariableEntries(component.envInputList)
  const componentEnvNameBase = createEnvVariableName(component.id || component.name || `component-${(selectedComponentIndex ?? 0) + 1}`)
  const builtinEnvNames = collectBuiltinEnvNames(meta)
  const previousEnvNames = selectedComponentIndex === null
    ? []
    : meta.components.slice(0, selectedComponentIndex).flatMap(item => (
      normalizeEnvVariableEntries(item.envOutputList).map(extractEnvName).filter((name): name is string => Boolean(name))
    ))
  const componentEnvOutputOptions = uniquePresetOptions([
    {
      name: `${componentEnvNameBase}_HOME`,
      value: `{{install_path|${componentNameForPlaceholder}}}`,
      label: `安装路径：${componentNameForPlaceholder}`,
    },
    {
      name: `${componentEnvNameBase}_VERSION`,
      value: `{{version|${componentNameForPlaceholder}}}`,
      label: `版本号：${componentNameForPlaceholder}`,
    },
    ...componentGetLinkProvideList.map((_, index) => ({
      name: `${componentEnvNameBase}_LINK_${index}`,
      value: `{{key|Component.${componentNameForPlaceholder}.get_link_provide_list.${index}}}`,
      label: `可选链接 ${index}`,
    })),
    ...(meta.fileImport === true ? meta.fileImportList.filter(Boolean).map(fileName => ({
      name: `${createEnvVariableName(fileName)}_PATH`,
      value: `{{file_path|${fileName}}}`,
      label: `导入文件：${fileName}`,
    })) : []),
  ])
  const componentEnvInputOptions = uniquePresetOptions([...builtinEnvNames, ...previousEnvNames].map(name => ({
    name,
    value: createEnvInputValue(name),
    label: name,
  })))

  const selectedDeploymentIndex = parseDeploymentBlockIndex(selectedBlockId)
  const deployment = selectedDeploymentIndex === null
    ? emptyDeploymentMeta
    : { ...emptyDeploymentMeta, ...(meta.deployments[selectedDeploymentIndex] ?? {}) }
  const deploymentVersionFile = deployment.versionFile ?? []
  const deploymentVersionCustom = deployment.versionCustom ?? []
  const deploymentLinkFile = deployment.linkFile ?? []
  const deploymentLinkCustom = deployment.linkCustom ?? []
  const deploymentGetLinkProvideList = deployment.getLinkProvideList ?? []
  const deploymentDenoPermissions = deployment.denoPermissions ?? []
  const deploymentJvm = deployment.jvm ?? []
  const showDeploymentVersionDenoPermissions = hasDenoCustomSource(deploymentVersionCustom)
  const showDeploymentVersionJvmOptions = hasJvmCustomSource(deploymentVersionCustom)
  const showDeploymentLinkDenoPermissions = hasDenoCustomSource(deploymentLinkCustom)
  const showDeploymentLinkJvmOptions = hasJvmCustomSource(deploymentLinkCustom)
  const deploymentNameForPlaceholder = deployment.id || deployment.name || `部署${(selectedDeploymentIndex ?? 0) + 1}`
  const deploymentEnvOutputList = normalizeEnvVariableEntries(deployment.envOutputList)
  const deploymentEnvInputList = normalizeEnvVariableEntries(deployment.envInputList)
  const deploymentEnvNameBase = createEnvVariableName(deployment.id || deployment.name || `deployment-${(selectedDeploymentIndex ?? 0) + 1}`)
  const componentOutputEnvNames = meta.components.flatMap(item => (
    normalizeEnvVariableEntries(item.envOutputList).map(extractEnvName).filter((name): name is string => Boolean(name))
  ))
  const previousDeploymentEnvNames = selectedDeploymentIndex === null
    ? []
    : meta.deployments.slice(0, selectedDeploymentIndex).flatMap(item => (
      normalizeEnvVariableEntries(item.envOutputList).map(extractEnvName).filter((name): name is string => Boolean(name))
    ))
  const deploymentEnvOutputOptions = uniquePresetOptions([
    {
      name: `${deploymentEnvNameBase}_HOME`,
      value: `{{deploy_path|${deploymentNameForPlaceholder}}}`,
      label: `部署路径：${deploymentNameForPlaceholder}`,
    },
    {
      name: `${deploymentEnvNameBase}_VERSION`,
      value: `{{version|${deploymentNameForPlaceholder}}}`,
      label: `版本号：${deploymentNameForPlaceholder}`,
    },
    ...deploymentGetLinkProvideList.map((_, index) => ({
      name: `${deploymentEnvNameBase}_LINK_${index}`,
      value: `{{key|Deployment.${deploymentNameForPlaceholder}.get_link_provide_list.${index}}}`,
      label: `可选链接 ${index}`,
    })),
    ...(meta.fileImport === true ? meta.fileImportList.filter(Boolean).map(fileName => ({
      name: `${createEnvVariableName(fileName)}_PATH`,
      value: `{{file_path|${fileName}}}`,
      label: `导入文件：${fileName}`,
    })) : []),
  ])
  const deploymentEnvInputOptions = uniquePresetOptions([
    ...builtinEnvNames,
    ...componentOutputEnvNames,
    ...previousDeploymentEnvNames,
  ].map(name => ({
    name,
    value: createEnvInputValue(name),
    label: name,
  })))
  const updateComponent = (patch: Partial<WorkbenchComponentMeta>) => {
    if (selectedComponentIndex === null) return
    const nextComponents = fillComponentsToIndex(meta.components, selectedComponentIndex)
    nextComponents[selectedComponentIndex] = { ...nextComponents[selectedComponentIndex], ...component, ...patch }
    updateMeta({ components: nextComponents })
  }

  const updateComponentId = (id: string) => {
    if (selectedComponentIndex === null) return
    const previousId = component.id
    const nextComponents = fillComponentsToIndex(meta.components, selectedComponentIndex).map((item, index) => (
      index === selectedComponentIndex ? { ...item, ...component, id } : item
    ))
    const componentIds = nextComponents.map(item => item.id).filter(Boolean)
    const extraIds = meta.componentsList.filter(item => (
      item
      && item !== previousId
      && !componentIds.includes(item)
    ))
    const nextList = [...componentIds, ...extraIds]
    updateMeta({
      components: nextComponents,
      componentsList: arraysEqual(nextList, meta.componentsList) ? meta.componentsList : nextList,
    })
  }

  const updateDeployment = (patch: Partial<WorkbenchDeploymentMeta>) => {
    if (selectedDeploymentIndex === null) return
    const nextDeployments = fillDeploymentsToIndex(meta.deployments, selectedDeploymentIndex)
    nextDeployments[selectedDeploymentIndex] = { ...nextDeployments[selectedDeploymentIndex], ...deployment, ...patch }
    updateMeta({ deployments: nextDeployments })
  }

  const updateDeploymentId = (id: string) => {
    if (selectedDeploymentIndex === null) return
    const previousId = deployment.id
    const nextDeployments = fillDeploymentsToIndex(meta.deployments, selectedDeploymentIndex).map((item, index) => (
      index === selectedDeploymentIndex ? { ...item, ...deployment, id } : item
    ))
    const deploymentIds = nextDeployments.map(item => item.id).filter(Boolean)
    const extraIds = meta.deployList.filter(item => (
      item
      && item !== previousId
      && !deploymentIds.includes(item)
    ))
    const nextList = [...deploymentIds, ...extraIds]
    updateMeta({
      deployments: nextDeployments,
      deployList: arraysEqual(nextList, meta.deployList) ? meta.deployList : nextList,
    })
  }

  const updateConfigItem = (patch: Partial<WorkbenchConfigItemMeta>) => {
    if (selectedConfigItemIndex === null) return
    const nextConfigItems = fillConfigItemsToIndex(meta.configItems, selectedConfigItemIndex)
    nextConfigItems[selectedConfigItemIndex] = { ...nextConfigItems[selectedConfigItemIndex], ...configItem, ...patch }
    updateMeta({ configItems: nextConfigItems })
  }

  const updateConfigItemId = (id: string) => {
    if (selectedConfigItemIndex === null) return
    const previousId = configItem.id
    const nextConfigItems = fillConfigItemsToIndex(meta.configItems, selectedConfigItemIndex).map((item, index) => (
      index === selectedConfigItemIndex ? { ...item, ...configItem, id } : item
    ))
    const configItemIds = nextConfigItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.configList.filter(item => (
      item
      && item !== previousId
      && !configItemIds.includes(item)
    ))
    const nextList = [...configItemIds, ...extraIds]
    updateMeta({
      configItems: nextConfigItems,
      configList: arraysEqual(nextList, meta.configList) ? meta.configList : nextList,
    })
  }

  const updateLaunchItem = (patch: Partial<WorkbenchLaunchItemMeta>) => {
    if (selectedLaunchItemIndex === null) return
    const nextLaunchItems = fillLaunchItemsToIndex(meta.launchItems, selectedLaunchItemIndex)
    nextLaunchItems[selectedLaunchItemIndex] = { ...nextLaunchItems[selectedLaunchItemIndex], ...launchItem, ...patch }
    updateMeta({ launchItems: nextLaunchItems })
  }

  const updateLaunchItemId = (id: string) => {
    if (selectedLaunchItemIndex === null) return
    const previousId = launchItem.id
    const nextLaunchItems = fillLaunchItemsToIndex(meta.launchItems, selectedLaunchItemIndex).map((item, index) => (
      index === selectedLaunchItemIndex ? { ...item, ...launchItem, id } : item
    ))
    const launchItemIds = nextLaunchItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.launchList.filter(item => (
      item
      && item !== previousId
      && !launchItemIds.includes(item)
    ))
    const nextList = [...launchItemIds, ...extraIds]
    updateMeta({
      launchItems: nextLaunchItems,
      launchList: arraysEqual(nextList, meta.launchList) ? meta.launchList : nextList,
    })
  }

  const updateUninstallItem = (patch: Partial<WorkbenchUninstallItemMeta>) => {
    if (selectedUninstallItemIndex === null) return
    const nextUninstallItems = fillUninstallItemsToIndex(meta.uninstallItems, selectedUninstallItemIndex)
    nextUninstallItems[selectedUninstallItemIndex] = { ...nextUninstallItems[selectedUninstallItemIndex], ...uninstallItem, ...patch }
    updateMeta({ uninstallItems: nextUninstallItems })
  }

  const updateUninstallItemId = (id: string) => {
    if (selectedUninstallItemIndex === null) return
    const previousId = uninstallItem.id
    const nextUninstallItems = fillUninstallItemsToIndex(meta.uninstallItems, selectedUninstallItemIndex).map((item, index) => (
      index === selectedUninstallItemIndex ? { ...item, ...uninstallItem, id } : item
    ))
    const uninstallItemIds = nextUninstallItems.map(item => item.id).filter(Boolean)
    const extraIds = meta.uninstallList.filter(item => (
      item
      && item !== previousId
      && !uninstallItemIds.includes(item)
    ))
    const nextList = [...uninstallItemIds, ...extraIds]
    updateMeta({
      uninstallItems: nextUninstallItems,
      uninstallList: arraysEqual(nextList, meta.uninstallList) ? meta.uninstallList : nextList,
    })
  }

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
    const nextWidth = start.width + start.x - event.clientX
    if (nextWidth < rightSidebarMinWidth - 24) {
      resizeStartRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onToggleCollapsed()
      return
    }
    onResize(clamp(nextWidth, rightSidebarMinWidth, rightSidebarMaxWidth))
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeStartRef.current = null
  }

  const shouldShowInitMeta = selectedBlockId === 'init'
  const shouldShowComponentsMeta = selectedBlockId === 'components'
  const shouldShowComponentMeta = selectedComponentIndex !== null
  const shouldShowDeployMeta = selectedBlockId === 'deploy'
  const shouldShowDeploymentMeta = selectedDeploymentIndex !== null
  const shouldShowConfigMeta = selectedBlockId === 'config'
  const shouldShowConfigItemMeta = selectedConfigItemIndex !== null
  const shouldShowLaunchMeta = selectedBlockId === 'launch'
  const shouldShowLaunchItemMeta = selectedLaunchItemIndex !== null
  const shouldShowUninstallMeta = selectedBlockId === 'uninstall'
  const shouldShowUninstallItemMeta = selectedUninstallItemIndex !== null
  const selectedFileId = selectedBlockId?.startsWith('file:')
    ? selectedBlockId.slice('file:'.length)
    : null
  const selectedFile: WorkbenchFileMeta | null = selectedFileId
    ? meta.files.find(f => f.id === selectedFileId) ?? null
    : null
  const shouldShowFileMeta = selectedFile !== null
  const componentOutlineTarget = (fieldName: string) => (
    selectedComponentIndex === null ? undefined : `component-${selectedComponentIndex}-${fieldName}`
  )
  const deploymentOutlineTarget = (fieldName: string) => (
    selectedDeploymentIndex === null ? undefined : `deployment-${selectedDeploymentIndex}-${fieldName}`
  )
  const configItemOutlineTarget = (fieldName: string) => (
    selectedConfigItemIndex === null ? undefined : `config-item-${selectedConfigItemIndex}-${fieldName}`
  )
  const launchItemOutlineTarget = (fieldName: string) => (
    selectedLaunchItemIndex === null ? undefined : `launch-item-${selectedLaunchItemIndex}-${fieldName}`
  )
  const uninstallItemOutlineTarget = (fieldName: string) => (
    selectedUninstallItemIndex === null ? undefined : `uninstall-item-${selectedUninstallItemIndex}-${fieldName}`
  )
  const configItemEnvInputList = normalizeEnvVariableEntries(configItem.envInputList)
  const launchItemEnvInputList = normalizeEnvVariableEntries(launchItem.envInputList)
  const launchItemEnvOutputList = normalizeEnvVariableEntries(launchItem.envOutputList)
  const uninstallItemEnvInputList = normalizeEnvVariableEntries(uninstallItem.envInputList)
  const uninstallItemEnvOutputList = normalizeEnvVariableEntries(uninstallItem.envOutputList)
  const placeholderContextValue = useMemo(
    () => buildWorkbenchPlaceholderContext(meta, selectedBlockId),
    [meta, selectedBlockId],
  )

  useEffect(() => {
    if (!focusTarget || collapsed) return

    let firstFrame = 0
    let secondFrame = 0
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const scrollContainer = scrollContainerRef.current
        if (!scrollContainer) return

        const target = findOutlineTargetElement(scrollContainer, focusTarget.id)
        if (!target) return

        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        focusAnimationRef.current?.cancel()
        focusAnimationRef.current = flashOutlineTarget(target)
      })
    })

    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [collapsed, focusTarget, selectedBlockId])

  if (collapsed) {
    return (
      <aside
        data-workbench-ui
        className="absolute right-0 top-0 z-20 h-full transition-[width] duration-150 ease-out"
        style={{ width: rightSidebarCollapsedWidth }}
      >
        <div
          className="absolute inset-y-0 right-0 border"
          style={{
            width: rightSidebarCollapsedWidth,
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            borderRadius: '30px 0 0 30px',
          }}
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute right-[15px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
          }}
          aria-label="展开右侧边栏"
          title="展开右侧边栏"
        >
          <TextAlignRightGlyph />
        </button>
      </aside>
    )
  }

  return (
    <aside
      data-workbench-ui
      className="absolute right-0 top-0 z-20 h-full transition-[width] duration-150 ease-out"
      style={{ width, color: 'var(--dfw-text)', fontFamily: font }}
    >
      <div
        className="absolute inset-0 border"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          borderRadius: '30px 0 0 30px',
        }}
      />

      <div
        className="absolute left-0 top-0 h-[86px] w-full border"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          borderRadius: '30px 0 0 0',
        }}
      />
      <div
        className="absolute left-[25px] right-[82px] top-[22px] h-[36px] overflow-hidden text-ellipsis whitespace-nowrap leading-[36px]"
        style={{ fontSize: 30, fontWeight: 600 }}
        title={`当前选中：${selectedName}`}
      >
        当前选中：<span style={{ fontWeight: 300 }}>{selectedName}</span>
      </div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="absolute right-[23px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
        }}
        aria-label="收起右侧边栏"
        title="收起右侧边栏"
      >
        <TextAlignRightGlyph />
      </button>

      <WorkbenchPlaceholderProvider value={placeholderContextValue}>
        <div ref={scrollContainerRef} className="absolute left-[19.5px] right-[20.5px] top-[102px] bottom-[24px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shouldShowInitMeta ? (
        <div className="flex min-h-[1660px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
          <section data-outline-target="modinfo-author">
            <FieldLabel>模版作者</FieldLabel>
            <AutoGrowTextField
              value={meta.author}
              onChange={author => updateMeta({ author })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="作者"
            />
          </section>

          <section data-outline-target="modinfo-tags">
            <ArrayListField
              label="模版标签列表"
              values={meta.tags}
              outlineTargetId="modinfo-tags"
              onChange={tags => updateMeta({ tags })}
              maxWidth={fieldAvailableWidth}
              itemAriaLabel="模版标签"
            />
          </section>

          <section data-outline-target="modinfo-description">
            <FieldLabel>模版描述</FieldLabel>
            <AutoGrowTextField
              value={meta.description}
              onChange={description => updateMeta({ description })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模板描述"
            />
          </section>

          <section data-outline-target="modinfo-mod-id">
            <FieldLabel>模版唯一ID</FieldLabel>
            <AutoGrowTextField
              value={meta.modId}
              onChange={modId => updateMeta({ modId })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版ID"
            />
          </section>

          <section data-outline-target="modinfo-mod-name">
            <FieldLabel>模版显示名称</FieldLabel>
            <AutoGrowTextField
              value={meta.modName}
              onChange={modName => updateMeta({ modName })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版名称"
            />
          </section>

          <section data-outline-target="modinfo-version">
            <FieldLabel>模版版本</FieldLabel>
            <AutoGrowTextField
              value={meta.version}
              onChange={version => updateMeta({ version })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版版本"
            />
          </section>

          <section data-outline-target="modinfo-min-version">
            <FieldLabel>最低支持版本</FieldLabel>
            <AutoGrowTextField
              value={meta.minVersion}
              onChange={minVersion => updateMeta({ minVersion })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="最低支持版本"
            />
          </section>

          <section data-outline-target="modinfo-max-version">
            <FieldLabel>最高支持版本</FieldLabel>
            <AutoGrowTextField
              value={meta.maxVersion}
              onChange={maxVersion => updateMeta({ maxVersion })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="最高支持版本"
            />
          </section>

          <section data-outline-target="modinfo-file-import">
            <FieldLabel>启用文件导入</FieldLabel>
            <BooleanSwitchField
              value={meta.fileImport}
              onChange={fileImport => updateMeta({ fileImport })}
            />
          </section>

          <ConditionalField show={meta.fileImport === true}>
            <section data-outline-target="modinfo-file-import-list">
              <ArrayListField
                label="文件导入列表"
                values={meta.fileImportList}
                outlineTargetId="modinfo-file-import-list"
                onChange={fileImportList => updateMeta({ fileImportList })}
                maxWidth={fieldAvailableWidth}
                itemAriaLabel="文件导入项"
                renderItemPrefix={({ value }) => {
                  const file = resolveFileByImportValue(value)
                  if (!file) {
                    return (
                      <button
                        type="button"
                        disabled
                        className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border"
                        style={{
                          borderColor: 'var(--dfw-sidebar-border)',
                          background: 'var(--dfw-sidebar-bg)',
                          color: 'var(--dfw-outline-muted)',
                          opacity: 0.45,
                        }}
                        aria-label="未找到对应文件"
                        title="未找到对应文件"
                      >
                        <VisibleGlyph />
                      </button>
                    )
                  }
                  const hidden = hiddenFileBlockIdSet.has(file.id)
                  return (
                    <button
                      type="button"
                      className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
                      style={{
                        borderColor: hidden ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)',
                        background: hidden ? 'rgba(127, 29, 29, 0.08)' : 'rgba(20, 83, 45, 0.08)',
                        color: hidden ? '#ef4444' : '#22c55e',
                      }}
                      onClick={event => {
                        event.stopPropagation()
                        toggleFileBlockVisibility(file.id)
                      }}
                      aria-label={hidden ? `显示文件块：${value}` : `隐藏文件块：${value}`}
                      title={hidden ? '显示画布文件块' : '隐藏画布文件块'}
                    >
                      {hidden ? <HiddenGlyph /> : <VisibleGlyph />}
                    </button>
                  )
                }}
              />
            </section>
          </ConditionalField>

          <section data-outline-target="modinfo-runtime">
            <FieldLabel>运行时环境</FieldLabel>
            <RuntimeSelectField
              value={meta.runtime}
              onChange={runtime => updateMeta({ runtime })}
            />
          </section>

          <ConditionalField show={meta.runtime === 'deno'}>
            <div className="flex flex-col gap-[18px]">
              <section data-outline-target="modinfo-deno-net">
                <FieldLabel>Deno网络权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoNet}
                  onChange={denoNet => updateMeta({ denoNet })}
                />
              </section>

              <section data-outline-target="modinfo-deno-read">
                <FieldLabel>Deno读取权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoRead}
                  onChange={denoRead => updateMeta({ denoRead })}
                />
              </section>

              <section data-outline-target="modinfo-deno-write">
                <FieldLabel>Deno写入权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoWrite}
                  onChange={denoWrite => updateMeta({ denoWrite })}
                />
              </section>

              <section data-outline-target="modinfo-deno-env">
                <FieldLabel>Deno环境变量权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoEnv}
                  onChange={denoEnv => updateMeta({ denoEnv })}
                />
              </section>

              <section data-outline-target="modinfo-deno-run">
                <FieldLabel>Deno子进程权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoRun}
                  onChange={denoRun => updateMeta({ denoRun })}
                />
              </section>

              <section data-outline-target="modinfo-deno-hrtime">
                <FieldLabel>Deno高精度时间权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoHrtime}
                  onChange={denoHrtime => updateMeta({ denoHrtime })}
                />
              </section>

              <section data-outline-target="modinfo-deno-ffi">
                <FieldLabel>Deno动态库权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoFfi}
                  onChange={denoFfi => updateMeta({ denoFfi })}
                />
              </section>

              <section data-outline-target="modinfo-deno-sys">
                <FieldLabel>Deno系统信息权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoSys}
                  onChange={denoSys => updateMeta({ denoSys })}
                />
              </section>

              <section data-outline-target="modinfo-deno-all">
                <FieldLabel>Deno全部权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoAll}
                  onChange={denoAll => updateMeta({ denoAll })}
                />
              </section>

              <section data-outline-target="modinfo-deno-custom-permissions">
                <FieldLabel>自定义Deno权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoCustomPermissions}
                  onChange={denoCustomPermissions => updateMeta({ denoCustomPermissions })}
                />
              </section>

              <ConditionalField show={meta.denoCustomPermissions === true}>
                <section data-outline-target="modinfo-deno-permission-list">
                  <ArrayListField
                    label="Deno自定义权限列表"
                    values={meta.denoPermissionList}
                    outlineTargetId="modinfo-deno-permission-list"
                    onChange={denoPermissionList => updateMeta({ denoPermissionList })}
                    maxWidth={fieldAvailableWidth}
                    itemAriaLabel="Deno权限参数"
                  />
                </section>
              </ConditionalField>
            </div>
          </ConditionalField>

          <section data-outline-target="modinfo-platforms">
            <FieldLabel>平台限制列表</FieldLabel>
            <PlatformSelectField
              values={meta.platforms}
              onChange={platforms => updateMeta({ platforms })}
              width={fieldAvailableWidth}
            />
          </section>

          <section data-outline-target="modinfo-schema-version">
            <FieldLabel>模版格式版本</FieldLabel>
            <AutoGrowTextField
              value={meta.schemaVersion}
              onChange={schemaVersion => updateMeta({ schemaVersion })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版格式版本"
            />
          </section>
        </div>
        ) : shouldShowComponentsMeta ? (
          <div className="flex min-h-[390px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
            <section data-outline-target="components-env-output">
              <FieldLabel>[COMPONENTS] 环境变量导出</FieldLabel>
              <BooleanSwitchField
                value={meta.componentsEnvOutput}
                onChange={componentsEnvOutput => updateMeta({ componentsEnvOutput })}
              />
            </section>

            <section data-outline-target="components-env-input">
              <FieldLabel>[COMPONENTS] 环境变量导入</FieldLabel>
              <BooleanSwitchField
                value={meta.componentsEnvInput}
                onChange={componentsEnvInput => updateMeta({ componentsEnvInput })}
              />
            </section>

            <section data-outline-target="components-list">
              <ArrayListField
                label="组件ID列表"
                values={meta.componentsList}
                outlineTargetId="components-list"
                onChange={componentsList => updateMeta({ componentsList })}
                maxWidth={fieldAvailableWidth}
                itemAriaLabel="组件ID"
              />
            </section>
          </div>
        ) : shouldShowDeployMeta ? (
          <DeployMetaEditor
            meta={meta}
            updateMeta={updateMeta}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
          />
        ) : shouldShowConfigMeta ? (
          <ConfigMetaEditor
            meta={meta}
            updateMeta={updateMeta}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
          />
        ) : shouldShowConfigItemMeta ? (
          <ConfigItemMetaEditor
            configItem={configItem}
            updateConfigItem={updateConfigItem}
            updateConfigItemId={updateConfigItemId}
            configItemOutlineTarget={configItemOutlineTarget}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
            configItemEnvInputList={configItemEnvInputList}
            showConfigItemEnvInput={configItem.envInput === true}
          />
        ) : shouldShowLaunchMeta ? (
          <LaunchMetaEditor
            meta={meta}
            updateMeta={updateMeta}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
          />
        ) : shouldShowLaunchItemMeta ? (
          <LaunchItemMetaEditor
            launchItem={launchItem}
            updateLaunchItem={updateLaunchItem}
            updateLaunchItemId={updateLaunchItemId}
            launchItemOutlineTarget={launchItemOutlineTarget}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
            launchItemEnvInputList={launchItemEnvInputList}
            launchItemEnvOutputList={launchItemEnvOutputList}
            showLaunchItemEnvInput={launchItem.envInput === true}
            showLaunchItemEnvOutput={launchItem.envOutput === true}
          />
        ) : shouldShowUninstallMeta ? (
          <UninstallMetaEditor
            meta={meta}
            updateMeta={updateMeta}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
          />
        ) : shouldShowUninstallItemMeta ? (
          <UninstallItemMetaEditor
            uninstallItem={uninstallItem}
            updateUninstallItem={updateUninstallItem}
            updateUninstallItemId={updateUninstallItemId}
            uninstallItemOutlineTarget={uninstallItemOutlineTarget}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
            uninstallItemEnvInputList={uninstallItemEnvInputList}
            uninstallItemEnvOutputList={uninstallItemEnvOutputList}
            showUninstallItemEnvInput={uninstallItem.envInput === true}
            showUninstallItemEnvOutput={uninstallItem.envOutput === true}
          />
        ) : shouldShowFileMeta && selectedFile ? (
          <div className="space-y-4">
            <FieldLabel>文件块</FieldLabel>
            <div className="space-y-3">
              <div>
                <div className="text-xs opacity-60">文件名</div>
                <div className="break-all text-sm font-medium">{selectedFile.name}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">路径</div>
                <div className="break-all font-mono text-xs opacity-80">{selectedFile.path}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">大小</div>
                <div className="text-sm">{(selectedFile.size / 1024).toFixed(1)} KB</div>
              </div>
              <div>
                <div className="text-xs opacity-60">最后修改</div>
                <div className="text-sm">{new Date(selectedFile.modifiedAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">语言</div>
                <div className="text-sm">{selectedFile.language}</div>
              </div>
            </div>
            {selectedFile.binary && (
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                ⚠ 二进制文件，不可在编辑器中预览/编辑。可在编辑器中下载。
              </div>
            )}
            <button
              type="button"
              className="w-full rounded-md bg-[var(--dfw-blue)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              onClick={() => onOpenFileEditor?.(selectedFile.id)}
            >
              在编辑器中打开
            </button>
            <button
              type="button"
              className="w-full rounded-md border border-red-400/30 bg-transparent px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
              onClick={() => onDeleteFile?.(selectedFile.id)}
            >
              删除文件
            </button>
            <p className="text-xs text-[var(--dfw-text)] opacity-60">
              双击画布上的文件块也可以打开编辑器。
            </p>
          </div>
        ) : shouldShowDeploymentMeta ? (
          <DeploymentMetaEditor
            deployment={deployment}
            updateDeployment={updateDeployment}
            updateDeploymentId={updateDeploymentId}
            deploymentOutlineTarget={deploymentOutlineTarget}
            fieldAvailableWidth={fieldAvailableWidth}
            width={width}
            deploymentVersionFile={deploymentVersionFile}
            deploymentVersionCustom={deploymentVersionCustom}
            deploymentLinkFile={deploymentLinkFile}
            deploymentLinkCustom={deploymentLinkCustom}
            deploymentGetLinkProvideList={deploymentGetLinkProvideList}
            deploymentDenoPermissions={deploymentDenoPermissions}
            deploymentJvm={deploymentJvm}
            showDeploymentVersionDenoPermissions={showDeploymentVersionDenoPermissions}
            showDeploymentVersionJvmOptions={showDeploymentVersionJvmOptions}
            showDeploymentLinkDenoPermissions={showDeploymentLinkDenoPermissions}
            showDeploymentLinkJvmOptions={showDeploymentLinkJvmOptions}
            deploymentEnvOutputList={deploymentEnvOutputList}
            deploymentEnvInputList={deploymentEnvInputList}
            deploymentEnvOutputOptions={deploymentEnvOutputOptions}
            deploymentEnvInputOptions={deploymentEnvInputOptions}
          />
        ) : shouldShowComponentMeta ? (
          <div className="flex min-h-[3200px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>

            <section data-outline-target={componentOutlineTarget('name')}>
              <FieldLabel>组件名称</FieldLabel>
              <AutoGrowTextField
                value={component.name}
                onChange={name => updateComponent({ name })}
                maxWidth={fieldAvailableWidth}
                ariaLabel="组件名称"
              />
            </section>

            <section data-outline-target={componentOutlineTarget('id')}>
              <FieldLabel>组件ID</FieldLabel>
              <AutoGrowTextField
                value={component.id}
                onChange={updateComponentId}
                maxWidth={fieldAvailableWidth}
                ariaLabel="组件ID"
              />
            </section>

            <section data-outline-target={componentOutlineTarget('install')}>
              <FieldLabel>需要安装</FieldLabel>
              <BooleanSwitchField
                value={component.install}
                onChange={install => updateComponent({ install })}
              />
            </section>

            <ConditionalField show={component.install === true}>
              <section data-outline-target={componentOutlineTarget('choose')}>
                <FieldLabel>用户可选安装</FieldLabel>
                <BooleanSwitchField
                  value={component.choose}
                  onChange={choose => updateComponent({ choose })}
                />
              </section>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('runtime')}>
              <FieldLabel>组件运行时</FieldLabel>
              <RuntimeSelectField
                value={component.runtime}
                onChange={runtime => updateComponent({ runtime })}
                allowInherit
              />
            </section>

            <section data-outline-target={componentOutlineTarget('command-theme')}>
              <FieldLabel>命令主题</FieldLabel>
              <OptionSelectField
                value={component.commandTheme}
                options={commandThemeOptions}
                onChange={commandTheme => updateComponent({ commandTheme })}
                ariaLabel="命令主题"
              />
            </section>

            <section data-outline-target={componentOutlineTarget('check')}>
              <FieldLabel>检查已安装</FieldLabel>
              <BooleanSwitchField
                value={component.check}
                onChange={check => updateComponent({ check })}
              />
            </section>

            <ConditionalField show={component.check === true}>
              <div className="flex flex-col gap-[18px]">
                <section data-outline-target={componentOutlineTarget('check-command')}>
                  <ArrayListField
                    label="检查命令列表"
                    values={component.checkCommand}
                    outlineTargetId={componentOutlineTarget('check-command')}
                    onChange={checkCommand => updateComponent({ checkCommand })}
                    maxWidth={fieldAvailableWidth}
                    itemAriaLabel="检查命令"
                  />
                </section>

                <section data-outline-target={componentOutlineTarget('check-version-contains')}>
                  <ArrayListField
                    label="版本关键字列表"
                    values={component.checkVersionContains}
                    outlineTargetId={componentOutlineTarget('check-version-contains')}
                    onChange={checkVersionContains => updateComponent({ checkVersionContains })}
                    maxWidth={fieldAvailableWidth}
                    itemAriaLabel="版本关键字"
                  />
                </section>

                <section data-outline-target={componentOutlineTarget('check-version-regex')}>
                  <ArrayListField
                    label="版本正则匹配列表"
                    values={component.checkVersionRegex}
                    outlineTargetId={componentOutlineTarget('check-version-regex')}
                    onChange={checkVersionRegex => updateComponent({ checkVersionRegex })}
                    maxWidth={fieldAvailableWidth}
                    itemAriaLabel="版本正则"
                  />
                </section>
              </div>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('get-method')}>
              <FieldLabel>获取方法</FieldLabel>
              <OptionSelectField
                value={component.getMethod}
                options={getMethodOptions}
                onChange={getMethod => updateComponent({ getMethod })}
                ariaLabel="获取方法"
              />
            </section>

            <ConditionalField show={component.getMethod === 'direct'}>
              <section data-outline-target={componentOutlineTarget('direct-link')}>
                <FieldLabel>直接下载链接</FieldLabel>
                <AutoGrowTextField
                  value={component.directLink}
                  onChange={directLink => updateComponent({ directLink })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="直接下载链接"
                />
              </section>
            </ConditionalField>

            <ConditionalField show={component.getMethod === 'get_version'}>
              <div className="flex flex-col gap-[18px]">
                <section data-outline-target={componentOutlineTarget('get-version')}>
                  <FieldLabel>版本获取方式</FieldLabel>
                  <OptionSelectField
                    value={component.getVersion}
                    options={getVersionOptions}
                    onChange={getVersion => updateComponent({ getVersion })}
                    ariaLabel="版本获取方式"
                  />
                </section>

                <ConditionalField show={component.getVersion === 'github_repo'}>
                  <section data-outline-target={componentOutlineTarget('github-repo')}>
                    <FieldLabel>GitHub仓库链接</FieldLabel>
                    <AutoGrowTextField
                      value={component.githubRepo}
                      onChange={githubRepo => updateComponent({ githubRepo })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="GitHub仓库链接"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getVersion === 'filelink'}>
                  <section data-outline-target={componentOutlineTarget('version-file')}>
                    <ArrayListField
                      label="版本文件来源列表"
                      values={componentVersionFile}
                      outlineTargetId={componentOutlineTarget('version-file')}
                      onChange={versionFile => updateComponent({ versionFile })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="版本文件来源"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getVersion === 'custom'}>
                  <section data-outline-target={componentOutlineTarget('version-custom')}>
                    <ArrayListField
                      label="版本脚本来源列表"
                      values={componentVersionCustom}
                      outlineTargetId={componentOutlineTarget('version-custom')}
                      onChange={versionCustom => updateComponent({ versionCustom })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="版本脚本来源"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getVersion === 'custom' && showVersionDenoPermissions}>
                  <section data-outline-target={componentOutlineTarget('deno-permissions')}>
                    <ArrayListField
                      label="Deno权限参数列表"
                      values={componentDenoPermissions}
                      outlineTargetId={componentOutlineTarget('deno-permissions')}
                      onChange={denoPermissions => updateComponent({ denoPermissions })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="Deno权限参数"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getVersion === 'custom' && showVersionJvmOptions}>
                  <section data-outline-target={componentOutlineTarget('jvm')}>
                    <ArrayListField
                      label="JVM参数列表"
                      values={componentJvm}
                      outlineTargetId={componentOutlineTarget('jvm')}
                      onChange={jvm => updateComponent({ jvm })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="JVM参数"
                    />
                  </section>
                </ConditionalField>

                <section data-outline-target={componentOutlineTarget('splicing-link')}>
                  <FieldLabel>版本拼接链接</FieldLabel>
                  <AutoGrowTextField
                    value={component.splicingLink}
                    onChange={splicingLink => updateComponent({ splicingLink })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="版本拼接链接"
                  />
                </section>

                <section data-outline-target={componentOutlineTarget('format-version')}>
                  <FieldLabel>格式化版本号</FieldLabel>
                  <BooleanSwitchField
                    value={component.formatVersion}
                    onChange={formatVersion => updateComponent({ formatVersion })}
                  />
                </section>

                <ConditionalField show={component.formatVersion === true}>
                  <section data-outline-target={componentOutlineTarget('version-formatting-formula')}>
                    <VersionFormattingRuleField
                      label="格式化规则列表"
                      values={component.versionFormattingFormula}
                      outlineTargetId={componentOutlineTarget('version-formatting-formula')}
                      onChange={versionFormattingFormula => updateComponent({ versionFormattingFormula })}
                      maxWidth={fieldAvailableWidth}
                    />
                  </section>
                </ConditionalField>
              </div>
            </ConditionalField>

            <ConditionalField show={component.getMethod === 'get_link'}>
              <div className="flex flex-col gap-[18px]">
                <section data-outline-target={componentOutlineTarget('get-link')}>
                  <FieldLabel>链接获取方式</FieldLabel>
                  <OptionSelectField
                    value={component.getLink}
                    options={getLinkOptions}
                    onChange={getLink => updateComponent({ getLink })}
                    ariaLabel="链接获取方式"
                  />
                </section>

                <ConditionalField show={component.getLink === 'filelink' || component.getLink === 'custom'}>
                  <section data-outline-target={componentOutlineTarget('get-link-provide-list')}>
                    <ArrayListField
                      label="可选链接列表"
                      values={componentGetLinkProvideList}
                      outlineTargetId={componentOutlineTarget('get-link-provide-list')}
                      onChange={getLinkProvideList => updateComponent({ getLinkProvideList })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="可选链接"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getLink === 'filelink' && componentGetLinkProvideList.length === 0}>
                  <section data-outline-target={componentOutlineTarget('link-file')}>
                    <ArrayListField
                      label="链接文件来源列表"
                      values={componentLinkFile}
                      outlineTargetId={componentOutlineTarget('link-file')}
                      onChange={linkFile => updateComponent({ linkFile })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="链接文件来源"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getLink === 'custom' && componentGetLinkProvideList.length === 0}>
                  <section data-outline-target={componentOutlineTarget('link-custom')}>
                    <ArrayListField
                      label="链接脚本来源列表"
                      values={componentLinkCustom}
                      outlineTargetId={componentOutlineTarget('link-custom')}
                      onChange={linkCustom => updateComponent({ linkCustom })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="链接脚本来源"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getLink === 'custom' && componentGetLinkProvideList.length === 0 && showLinkDenoPermissions}>
                  <section data-outline-target={componentOutlineTarget('deno-permissions')}>
                    <ArrayListField
                      label="Deno权限参数列表"
                      values={componentDenoPermissions}
                      outlineTargetId={componentOutlineTarget('deno-permissions')}
                      onChange={denoPermissions => updateComponent({ denoPermissions })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="Deno权限参数"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.getLink === 'custom' && componentGetLinkProvideList.length === 0 && showLinkJvmOptions}>
                  <section data-outline-target={componentOutlineTarget('jvm')}>
                    <ArrayListField
                      label="JVM参数列表"
                      values={componentJvm}
                      outlineTargetId={componentOutlineTarget('jvm')}
                      onChange={jvm => updateComponent({ jvm })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="JVM参数"
                    />
                  </section>
                </ConditionalField>
              </div>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('user-choose')}>
              <FieldLabel>用户可选版本</FieldLabel>
              <BooleanSwitchField
                value={component.userChoose}
                onChange={userChoose => updateComponent({ userChoose })}
              />
            </section>

            <ConditionalField show={component.userChoose === true}>
              <section data-outline-target={componentOutlineTarget('choose-list')}>
                <ArrayListField
                  label="版本选择列表"
                  values={component.chooseList}
                  outlineTargetId={componentOutlineTarget('choose-list')}
                  onChange={chooseList => updateComponent({ chooseList })}
                  maxWidth={fieldAvailableWidth}
                  itemAriaLabel="版本选择项"
                />
              </section>
            </ConditionalField>

            <ConditionalField show={component.install === true}>
              <div className="flex flex-col gap-[18px]">
                <section data-outline-target={componentOutlineTarget('command-install')}>
                  <FieldLabel>命令行安装</FieldLabel>
                  <BooleanSwitchField
                    value={component.commandInstall}
                    onChange={commandInstall => updateComponent({ commandInstall })}
                  />
                </section>

                <ConditionalField show={component.commandInstall === true}>
                  <section data-outline-target={componentOutlineTarget('install-command-list')}>
                    <ArrayListField
                      label="安装命令列表"
                      values={component.installCommandList}
                      outlineTargetId={componentOutlineTarget('install-command-list')}
                      onChange={installCommandList => updateComponent({ installCommandList })}
                      maxWidth={fieldAvailableWidth}
                      itemAriaLabel="安装命令"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.commandInstall !== true}>
                  <div className="flex flex-col gap-[18px]">
                    <section data-outline-target={componentOutlineTarget('install-operate')}>
                      <FieldLabel>安装操作方式</FieldLabel>
                      <OptionSelectField
                        value={component.installOperate}
                        options={installOperateOptions}
                        onChange={installOperate => updateComponent({ installOperate })}
                        ariaLabel="安装操作方式"
                      />
                    </section>

                    <ConditionalField show={component.installOperate === 'custom'}>
                      <section data-outline-target={componentOutlineTarget('install-custom-list')}>
                        <CustomInstallRuleField
                          label="自定义安装规则"
                          values={component.installCustomList}
                          onChange={installCustomList => updateComponent({ installCustomList })}
                          maxWidth={fieldAvailableWidth}
                          outlineTargetId={componentOutlineTarget('install-custom-list')}
                        />
                      </section>
                    </ConditionalField>
                  </div>
                </ConditionalField>

                <section data-outline-target={componentOutlineTarget('install-path')}>
                  <FieldLabel>安装路径</FieldLabel>
                  <AutoGrowTextField
                    value={component.installPath}
                    onChange={installPath => updateComponent({ installPath })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="安装路径"
                  />
                </section>

                <ConditionalField show={component.installPath === '$CustomPath'}>
                  <section data-outline-target={componentOutlineTarget('custom-path')}>
                    <FieldLabel>自定义路径</FieldLabel>
                    <AutoGrowTextField
                      value={component.customPath}
                      onChange={customPath => updateComponent({ customPath })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="自定义路径"
                    />
                  </section>
                </ConditionalField>
              </div>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('before-command')}>
              <FieldLabel>安装前操作</FieldLabel>
              <BooleanSwitchField
                value={component.beforeCommand}
                onChange={beforeCommand => updateComponent({ beforeCommand })}
              />
            </section>

            <ConditionalField show={component.beforeCommand === true}>
              <section data-outline-target={componentOutlineTarget('before-command-list')}>
                <ArrayListField
                  label="安装前命令列表"
                  values={component.beforeCommandList}
                  outlineTargetId={componentOutlineTarget('before-command-list')}
                  onChange={beforeCommandList => updateComponent({ beforeCommandList })}
                  maxWidth={fieldAvailableWidth}
                  itemAriaLabel="安装前命令"
                />
              </section>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('after-command')}>
              <FieldLabel>安装后操作</FieldLabel>
              <BooleanSwitchField
                value={component.afterCommand}
                onChange={afterCommand => updateComponent({ afterCommand })}
              />
            </section>

            <ConditionalField show={component.afterCommand === true}>
              <section data-outline-target={componentOutlineTarget('after-command-list')}>
                <ArrayListField
                  label="安装后命令列表"
                  values={component.afterCommandList}
                  outlineTargetId={componentOutlineTarget('after-command-list')}
                  onChange={afterCommandList => updateComponent({ afterCommandList })}
                  maxWidth={fieldAvailableWidth}
                  itemAriaLabel="安装后命令"
                />
              </section>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('env-output')}>
              <FieldLabel>组件环境变量导出</FieldLabel>
              <BooleanSwitchField
                value={component.envOutput}
                onChange={envOutput => updateComponent({ envOutput })}
              />
            </section>

            <ConditionalField show={component.envOutput === true}>
              <section data-outline-target={componentOutlineTarget('env-output-list')}>
                <EnvVariableTableField
                  label="导出变量列表"
                  values={componentEnvOutputList}
                  outlineTargetId={componentOutlineTarget('env-output-list')}
                  onChange={envOutputList => updateComponent({ envOutputList })}
                  maxWidth={fieldAvailableWidth}
                  presetOptions={componentEnvOutputOptions}
                />
              </section>
            </ConditionalField>

            <section data-outline-target={componentOutlineTarget('env-input')}>
              <FieldLabel>组件环境变量导入</FieldLabel>
              <BooleanSwitchField
                value={component.envInput}
                onChange={envInput => updateComponent({ envInput })}
              />
            </section>

            <ConditionalField show={component.envInput === true}>
              <section data-outline-target={componentOutlineTarget('env-input-list')}>
                <EnvVariableTableField
                  label="导入变量列表"
                  values={componentEnvInputList}
                  outlineTargetId={componentOutlineTarget('env-input-list')}
                  onChange={envInputList => updateComponent({ envInputList })}
                  maxWidth={fieldAvailableWidth}
                  presetOptions={componentEnvInputOptions}
                />
              </section>
            </ConditionalField>
          </div>
          ) : (
            <div
              className="min-w-[160px] pt-[2px] text-[20px] font-light leading-[34px]"
              style={{ width: Math.max(0, width - 40), fontFamily: font }}
            >
              {selectedBlockId ? `${selectedName}暂无可编辑配置` : '未选中积木'}
            </div>
          )}
        </div>
      </WorkbenchPlaceholderProvider>
      <div
        className="absolute bottom-[30px] left-[-5px] top-[30px] w-[10px] cursor-ew-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        aria-label="调整右侧边栏宽度"
        title="调整右侧边栏宽度"
      />
    </aside>
  )
}

// 主组件局部工具：在大纲面板里按层级 id 找到目标元素并闪动高亮。
function findOutlineTargetElement(root: HTMLElement, id: string) {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-outline-target]'))
  let currentId = id

  while (currentId) {
    const target = targets.find(element => element.dataset.outlineTarget === currentId)
    if (target) return target

    const nextId = currentId.replace(/-[^-]+$/, '')
    if (nextId === currentId) break
    currentId = nextId
  }

  return null
}

function flashOutlineTarget(element: HTMLElement) {
  return element.animate(
    [
      { boxShadow: '0 0 0 0 rgba(0, 144, 255, 0)', backgroundColor: 'transparent', offset: 0 },
      { boxShadow: '0 0 0 2px var(--dfw-blue)', backgroundColor: 'var(--dfw-outline-selected-bg)', offset: 0.18 },
      { boxShadow: '0 0 0 0 rgba(0, 144, 255, 0)', backgroundColor: 'transparent', offset: 0.36 },
      { boxShadow: '0 0 0 2px var(--dfw-blue)', backgroundColor: 'var(--dfw-outline-selected-bg)', offset: 0.64 },
      { boxShadow: '0 0 0 0 rgba(0, 144, 255, 0)', backgroundColor: 'transparent', offset: 1 },
    ],
    {
      duration: 900,
      easing: 'ease-in-out',
    },
  )
}

export default WorkbenchRightSidebar
