import type {
  WorkbenchConfigItemMeta,
  WorkbenchDeploymentMeta,
  WorkbenchEnvVariableEntry,
  WorkbenchLaunchItemMeta,
  WorkbenchUninstallItemMeta,
} from '../../workbench-canvas/types'
import {
  commandThemeOptions,
  deploymentGetMethodOptions,
  deployMethodOptions,
  getLinkOptions,
  getVersionOptions,
} from '../constants'
import { uniquePresetOptions } from '../envVariables'
import type { WorkbenchModInfoMeta } from '../types'
import { ArrayListField, EnvVariableTableField, VersionFormattingRuleField } from './listFields'
import { AutoGrowTextField, BooleanSwitchField, ConditionalField, FieldLabel, OptionSelectField, RuntimeSelectField } from './basicFields'

export function DeployMetaEditor({
  meta,
  updateMeta,
  fieldAvailableWidth,
  width,
}: {
  meta: WorkbenchModInfoMeta
  updateMeta: (patch: Partial<WorkbenchModInfoMeta>) => void
  fieldAvailableWidth: number
  width: number
}) {
  return (
    <div className="flex min-h-[390px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target="deploy-env-output">
        <FieldLabel>[DEPLOY] 环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={meta.deployEnvOutput}
          onChange={deployEnvOutput => updateMeta({ deployEnvOutput })}
        />
      </section>

      <section data-outline-target="deploy-env-input">
        <FieldLabel>[DEPLOY] 环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={meta.deployEnvInput}
          onChange={deployEnvInput => updateMeta({ deployEnvInput })}
        />
      </section>

      <section data-outline-target="deploy-list">
        <ArrayListField
          label="部署ID列表"
          values={meta.deployList}
          outlineTargetId="deploy-list"
          onChange={deployList => updateMeta({ deployList })}
          maxWidth={fieldAvailableWidth}
          itemAriaLabel="部署ID"
        />
      </section>
    </div>
  )
}

export function ConfigMetaEditor({
  meta,
  updateMeta,
  fieldAvailableWidth,
  width,
}: {
  meta: WorkbenchModInfoMeta
  updateMeta: (patch: Partial<WorkbenchModInfoMeta>) => void
  fieldAvailableWidth: number
  width: number
}) {
  return (
    <div className="flex min-h-[390px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target="config-env-output">
        <FieldLabel>[CONFIG] 环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={meta.configEnvOutput}
          onChange={configEnvOutput => updateMeta({ configEnvOutput })}
        />
      </section>

      <section data-outline-target="config-env-input">
        <FieldLabel>[CONFIG] 环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={meta.configEnvInput}
          onChange={configEnvInput => updateMeta({ configEnvInput })}
        />
      </section>

      <section data-outline-target="config-list">
        <ArrayListField
          label="配置ID列表"
          values={meta.configList}
          outlineTargetId="config-list"
          onChange={configList => updateMeta({ configList })}
          maxWidth={fieldAvailableWidth}
          itemAriaLabel="配置ID"
        />
      </section>
    </div>
  )
}

export function ConfigItemMetaEditor({
  configItem,
  updateConfigItem,
  updateConfigItemId,
  configItemOutlineTarget,
  fieldAvailableWidth,
  width,
  configItemEnvInputList,
  showConfigItemEnvInput,
}: {
  configItem: WorkbenchConfigItemMeta
  updateConfigItem: (patch: Partial<WorkbenchConfigItemMeta>) => void
  updateConfigItemId: (id: string) => void
  configItemOutlineTarget: (fieldName: string) => string | undefined
  fieldAvailableWidth: number
  width: number
  configItemEnvInputList: WorkbenchEnvVariableEntry[]
  showConfigItemEnvInput: boolean
}) {
  return (
    <div className="flex min-h-[1100px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target={configItemOutlineTarget('id')}>
        <FieldLabel>配置ID</FieldLabel>
        <AutoGrowTextField
          value={configItem.id}
          onChange={updateConfigItemId}
          maxWidth={fieldAvailableWidth}
          ariaLabel="配置ID"
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('name')}>
        <FieldLabel>配置名称</FieldLabel>
        <AutoGrowTextField
          value={configItem.name}
          onChange={name => updateConfigItem({ name })}
          maxWidth={fieldAvailableWidth}
          ariaLabel="配置名称"
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('runtime')}>
        <FieldLabel>运行时</FieldLabel>
        <RuntimeSelectField
          value={configItem.runtime}
          onChange={runtime => updateConfigItem({ runtime })}
          allowInherit
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('command-theme')}>
        <FieldLabel>命令主题</FieldLabel>
        <OptionSelectField
          value={configItem.commandTheme}
          options={commandThemeOptions}
          onChange={commandTheme => updateConfigItem({ commandTheme })}
          ariaLabel="命令主题"
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('file-path')}>
        <FieldLabel>配置文件路径</FieldLabel>
        <AutoGrowTextField
          value={configItem.filePath}
          onChange={filePath => updateConfigItem({ filePath })}
          maxWidth={fieldAvailableWidth}
          ariaLabel="配置文件路径"
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('choose')}>
        <FieldLabel>用户可选配置</FieldLabel>
        <BooleanSwitchField
          value={configItem.choose}
          onChange={choose => updateConfigItem({ choose })}
        />
      </section>

      <section data-outline-target={configItemOutlineTarget('env-input')}>
        <FieldLabel>环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={configItem.envInput}
          onChange={envInput => updateConfigItem({ envInput })}
        />
      </section>

      <ConditionalField show={showConfigItemEnvInput}>
        <section data-outline-target={configItemOutlineTarget('env-input-list')}>
          <EnvVariableTableField
            label="导入变量"
            values={configItemEnvInputList}
            onChange={envInputList => updateConfigItem({ envInputList })}
            maxWidth={fieldAvailableWidth}
            outlineTargetId={configItemOutlineTarget('env-input-list') ?? 'config-item-env-input-list'}
          />
        </section>
      </ConditionalField>
    </div>
  )
}

export function LaunchMetaEditor({
  meta,
  updateMeta,
  fieldAvailableWidth,
  width,
}: {
  meta: WorkbenchModInfoMeta
  updateMeta: (patch: Partial<WorkbenchModInfoMeta>) => void
  fieldAvailableWidth: number
  width: number
}) {
  return (
    <div className="flex min-h-[390px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target="launch-env-output">
        <FieldLabel>[LAUNCH] 环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={meta.launchEnvOutput}
          onChange={launchEnvOutput => updateMeta({ launchEnvOutput })}
        />
      </section>

      <section data-outline-target="launch-env-input">
        <FieldLabel>[LAUNCH] 环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={meta.launchEnvInput}
          onChange={launchEnvInput => updateMeta({ launchEnvInput })}
        />
      </section>

      <section data-outline-target="launch-list">
        <ArrayListField
          label="启动ID列表"
          values={meta.launchList}
          outlineTargetId="launch-list"
          onChange={launchList => updateMeta({ launchList })}
          maxWidth={fieldAvailableWidth}
          itemAriaLabel="启动ID"
        />
      </section>
    </div>
  )
}

export function LaunchItemMetaEditor({
  launchItem,
  updateLaunchItem,
  updateLaunchItemId,
  launchItemOutlineTarget,
  fieldAvailableWidth,
  width,
  launchItemEnvInputList,
  launchItemEnvOutputList,
  showLaunchItemEnvInput,
  showLaunchItemEnvOutput,
}: {
  launchItem: WorkbenchLaunchItemMeta
  updateLaunchItem: (patch: Partial<WorkbenchLaunchItemMeta>) => void
  updateLaunchItemId: (id: string) => void
  launchItemOutlineTarget: (fieldName: string) => string | undefined
  fieldAvailableWidth: number
  width: number
  launchItemEnvInputList: WorkbenchEnvVariableEntry[]
  launchItemEnvOutputList: WorkbenchEnvVariableEntry[]
  showLaunchItemEnvInput: boolean
  showLaunchItemEnvOutput: boolean
}) {
  return (
    <div className="flex min-h-[1500px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target={launchItemOutlineTarget('id')}>
        <FieldLabel>启动ID</FieldLabel>
        <AutoGrowTextField
          value={launchItem.id}
          onChange={updateLaunchItemId}
          maxWidth={fieldAvailableWidth}
          ariaLabel="启动ID"
        />
      </section>

      <section data-outline-target={launchItemOutlineTarget('name')}>
        <FieldLabel>启动名称</FieldLabel>
        <AutoGrowTextField
          value={launchItem.name}
          onChange={name => updateLaunchItem({ name })}
          maxWidth={fieldAvailableWidth}
          ariaLabel="启动名称"
        />
      </section>

      <section data-outline-target={launchItemOutlineTarget('choose')}>
        <FieldLabel>用户可选启动</FieldLabel>
        <BooleanSwitchField
          value={launchItem.choose}
          onChange={choose => updateLaunchItem({ choose })}
        />
      </section>

      <section data-outline-target={launchItemOutlineTarget('runtime')}>
        <FieldLabel>运行时</FieldLabel>
        <RuntimeSelectField
          value={launchItem.runtime}
          onChange={runtime => updateLaunchItem({ runtime })}
          allowInherit
        />
      </section>

      <section data-outline-target={launchItemOutlineTarget('command-theme')}>
        <FieldLabel>命令主题</FieldLabel>
        <OptionSelectField
          value={launchItem.commandTheme}
          options={commandThemeOptions}
          onChange={commandTheme => updateLaunchItem({ commandTheme })}
          ariaLabel="命令主题"
        />
      </section>

      <section data-outline-target={launchItemOutlineTarget('launch')}>
        <FieldLabel>需要启动</FieldLabel>
        <BooleanSwitchField
          value={launchItem.launch}
          onChange={launch => updateLaunchItem({ launch })}
        />
      </section>

      <ConditionalField show={launchItem.launch === true}>
        <section data-outline-target={launchItemOutlineTarget('launch-command')}>
          <ArrayListField
            label="启动命令"
            values={launchItem.launchCommand}
            outlineTargetId={launchItemOutlineTarget('launch-command') ?? 'launch-item-launch-command'}
            onChange={launchCommand => updateLaunchItem({ launchCommand })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="启动命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={launchItemOutlineTarget('env-input')}>
        <FieldLabel>环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={launchItem.envInput}
          onChange={envInput => updateLaunchItem({ envInput })}
        />
      </section>

      <ConditionalField show={showLaunchItemEnvInput}>
        <section data-outline-target={launchItemOutlineTarget('env-input-list')}>
          <EnvVariableTableField
            label="导入变量"
            values={launchItemEnvInputList}
            onChange={envInputList => updateLaunchItem({ envInputList })}
            maxWidth={fieldAvailableWidth}
            outlineTargetId={launchItemOutlineTarget('env-input-list') ?? 'launch-item-env-input-list'}
          />
        </section>
      </ConditionalField>

      <section data-outline-target={launchItemOutlineTarget('env-output')}>
        <FieldLabel>环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={launchItem.envOutput}
          onChange={envOutput => updateLaunchItem({ envOutput })}
        />
      </section>

      <ConditionalField show={showLaunchItemEnvOutput}>
        <section data-outline-target={launchItemOutlineTarget('env-output-list')}>
          <EnvVariableTableField
            label="导出变量"
            values={launchItemEnvOutputList}
            onChange={envOutputList => updateLaunchItem({ envOutputList })}
            maxWidth={fieldAvailableWidth}
            outlineTargetId={launchItemOutlineTarget('env-output-list') ?? 'launch-item-env-output-list'}
          />
        </section>
      </ConditionalField>
    </div>
  )
}

export function UninstallMetaEditor({
  meta,
  updateMeta,
  fieldAvailableWidth,
  width,
}: {
  meta: WorkbenchModInfoMeta
  updateMeta: (patch: Partial<WorkbenchModInfoMeta>) => void
  fieldAvailableWidth: number
  width: number
}) {
  return (
    <div className="flex min-h-[390px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target="uninstall-env-output">
        <FieldLabel>[UNINSTALL] 环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={meta.uninstallEnvOutput}
          onChange={uninstallEnvOutput => updateMeta({ uninstallEnvOutput })}
        />
      </section>

      <section data-outline-target="uninstall-env-input">
        <FieldLabel>[UNINSTALL] 环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={meta.uninstallEnvInput}
          onChange={uninstallEnvInput => updateMeta({ uninstallEnvInput })}
        />
      </section>

      <section data-outline-target="uninstall-list">
        <ArrayListField
          label="卸载ID列表"
          values={meta.uninstallList}
          outlineTargetId="uninstall-list"
          onChange={uninstallList => updateMeta({ uninstallList })}
          maxWidth={fieldAvailableWidth}
          itemAriaLabel="卸载ID"
        />
      </section>
    </div>
  )
}

export function UninstallItemMetaEditor({
  uninstallItem,
  updateUninstallItem,
  updateUninstallItemId,
  uninstallItemOutlineTarget,
  fieldAvailableWidth,
  width,
  uninstallItemEnvInputList,
  uninstallItemEnvOutputList,
  showUninstallItemEnvInput,
  showUninstallItemEnvOutput,
}: {
  uninstallItem: WorkbenchUninstallItemMeta
  updateUninstallItem: (patch: Partial<WorkbenchUninstallItemMeta>) => void
  updateUninstallItemId: (id: string) => void
  uninstallItemOutlineTarget: (fieldName: string) => string | undefined
  fieldAvailableWidth: number
  width: number
  uninstallItemEnvInputList: WorkbenchEnvVariableEntry[]
  uninstallItemEnvOutputList: WorkbenchEnvVariableEntry[]
  showUninstallItemEnvInput: boolean
  showUninstallItemEnvOutput: boolean
}) {
  return (
    <div className="flex min-h-[2000px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target={uninstallItemOutlineTarget('id')}>
        <FieldLabel>卸载ID</FieldLabel>
        <AutoGrowTextField
          value={uninstallItem.id}
          onChange={updateUninstallItemId}
          maxWidth={fieldAvailableWidth}
          ariaLabel="卸载ID"
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('name')}>
        <FieldLabel>卸载名称</FieldLabel>
        <AutoGrowTextField
          value={uninstallItem.name}
          onChange={name => updateUninstallItem({ name })}
          maxWidth={fieldAvailableWidth}
          ariaLabel="卸载名称"
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('choose')}>
        <FieldLabel>用户可选卸载</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.choose}
          onChange={choose => updateUninstallItem({ choose })}
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('runtime')}>
        <FieldLabel>运行时</FieldLabel>
        <RuntimeSelectField
          value={uninstallItem.runtime}
          onChange={runtime => updateUninstallItem({ runtime })}
          allowInherit
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('command-theme')}>
        <FieldLabel>命令主题</FieldLabel>
        <OptionSelectField
          value={uninstallItem.commandTheme}
          options={commandThemeOptions}
          onChange={commandTheme => updateUninstallItem({ commandTheme })}
          ariaLabel="命令主题"
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('uninstall')}>
        <FieldLabel>需要卸载</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.uninstall}
          onChange={uninstall => updateUninstallItem({ uninstall })}
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('stop-before-uninstall')}>
        <FieldLabel>卸载前停止</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.stopBeforeUninstall}
          onChange={stopBeforeUninstall => updateUninstallItem({ stopBeforeUninstall })}
        />
      </section>

      <ConditionalField show={uninstallItem.stopBeforeUninstall === true}>
        <section data-outline-target={uninstallItemOutlineTarget('stop-command-list')}>
          <ArrayListField
            label="停止命令"
            values={uninstallItem.stopCommandList}
            outlineTargetId={uninstallItemOutlineTarget('stop-command-list') ?? 'uninstall-item-stop-command-list'}
            onChange={stopCommandList => updateUninstallItem({ stopCommandList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="停止命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={uninstallItemOutlineTarget('remove-instance-config')}>
        <FieldLabel>删除实例配置</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.removeInstanceConfig}
          onChange={removeInstanceConfig => updateUninstallItem({ removeInstanceConfig })}
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('remove-runtime-files')}>
        <FieldLabel>删除运行时状态</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.removeRuntimeFiles}
          onChange={removeRuntimeFiles => updateUninstallItem({ removeRuntimeFiles })}
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('remove-deploy-root')}>
        <FieldLabel>删除部署目录</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.removeDeployRoot}
          onChange={removeDeployRoot => updateUninstallItem({ removeDeployRoot })}
        />
      </section>

      <section data-outline-target={uninstallItemOutlineTarget('remove-component')}>
        <FieldLabel>删除组件目录</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.removeComponent}
          onChange={removeComponent => updateUninstallItem({ removeComponent })}
        />
      </section>

      <ConditionalField show={uninstallItem.removeDeployRoot === true}>
        <section data-outline-target={uninstallItemOutlineTarget('deployment-targets')}>
          <ArrayListField
            label="部署目标"
            values={uninstallItem.deploymentTargets}
            outlineTargetId={uninstallItemOutlineTarget('deployment-targets') ?? 'uninstall-item-deployment-targets'}
            onChange={deploymentTargets => updateUninstallItem({ deploymentTargets })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="部署目标"
          />
        </section>
      </ConditionalField>

      <ConditionalField show={uninstallItem.removeComponent === true}>
        <section data-outline-target={uninstallItemOutlineTarget('component-targets')}>
          <ArrayListField
            label="组件目标"
            values={uninstallItem.componentTargets}
            outlineTargetId={uninstallItemOutlineTarget('component-targets') ?? 'uninstall-item-component-targets'}
            onChange={componentTargets => updateUninstallItem({ componentTargets })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="组件目标"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={uninstallItemOutlineTarget('before-command')}>
        <FieldLabel>卸载前操作</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.beforeCommand}
          onChange={beforeCommand => updateUninstallItem({ beforeCommand })}
        />
      </section>

      <ConditionalField show={uninstallItem.beforeCommand === true}>
        <section data-outline-target={uninstallItemOutlineTarget('before-command-list')}>
          <ArrayListField
            label="卸载前命令"
            values={uninstallItem.beforeCommandList}
            outlineTargetId={uninstallItemOutlineTarget('before-command-list') ?? 'uninstall-item-before-command-list'}
            onChange={beforeCommandList => updateUninstallItem({ beforeCommandList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="卸载前命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={uninstallItemOutlineTarget('after-command')}>
        <FieldLabel>卸载后操作</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.afterCommand}
          onChange={afterCommand => updateUninstallItem({ afterCommand })}
        />
      </section>

      <ConditionalField show={uninstallItem.afterCommand === true}>
        <section data-outline-target={uninstallItemOutlineTarget('after-command-list')}>
          <ArrayListField
            label="卸载后命令"
            values={uninstallItem.afterCommandList}
            outlineTargetId={uninstallItemOutlineTarget('after-command-list') ?? 'uninstall-item-after-command-list'}
            onChange={afterCommandList => updateUninstallItem({ afterCommandList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="卸载后命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={uninstallItemOutlineTarget('env-input')}>
        <FieldLabel>环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.envInput}
          onChange={envInput => updateUninstallItem({ envInput })}
        />
      </section>

      <ConditionalField show={showUninstallItemEnvInput}>
        <section data-outline-target={uninstallItemOutlineTarget('env-input-list')}>
          <EnvVariableTableField
            label="导入变量"
            values={uninstallItemEnvInputList}
            onChange={envInputList => updateUninstallItem({ envInputList })}
            maxWidth={fieldAvailableWidth}
            outlineTargetId={uninstallItemOutlineTarget('env-input-list') ?? 'uninstall-item-env-input-list'}
          />
        </section>
      </ConditionalField>

      <section data-outline-target={uninstallItemOutlineTarget('env-output')}>
        <FieldLabel>环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={uninstallItem.envOutput}
          onChange={envOutput => updateUninstallItem({ envOutput })}
        />
      </section>

      <ConditionalField show={showUninstallItemEnvOutput}>
        <section data-outline-target={uninstallItemOutlineTarget('env-output-list')}>
          <EnvVariableTableField
            label="导出变量"
            values={uninstallItemEnvOutputList}
            onChange={envOutputList => updateUninstallItem({ envOutputList })}
            maxWidth={fieldAvailableWidth}
            outlineTargetId={uninstallItemOutlineTarget('env-output-list') ?? 'uninstall-item-env-output-list'}
          />
        </section>
      </ConditionalField>
    </div>
  )
}

export function DeploymentMetaEditor({
  deployment,
  updateDeployment,
  updateDeploymentId,
  deploymentOutlineTarget,
  fieldAvailableWidth,
  width,
  deploymentVersionFile,
  deploymentVersionCustom,
  deploymentLinkFile,
  deploymentLinkCustom,
  deploymentGetLinkProvideList,
  deploymentDenoPermissions,
  deploymentJvm,
  showDeploymentVersionDenoPermissions,
  showDeploymentVersionJvmOptions,
  showDeploymentLinkDenoPermissions,
  showDeploymentLinkJvmOptions,
  deploymentEnvOutputList,
  deploymentEnvInputList,
  deploymentEnvOutputOptions,
  deploymentEnvInputOptions,
}: {
  deployment: WorkbenchDeploymentMeta
  updateDeployment: (patch: Partial<WorkbenchDeploymentMeta>) => void
  updateDeploymentId: (id: string) => void
  deploymentOutlineTarget: (fieldName: string) => string | undefined
  fieldAvailableWidth: number
  width: number
  deploymentVersionFile: string[]
  deploymentVersionCustom: string[]
  deploymentLinkFile: string[]
  deploymentLinkCustom: string[]
  deploymentGetLinkProvideList: string[]
  deploymentDenoPermissions: string[]
  deploymentJvm: string[]
  showDeploymentVersionDenoPermissions: boolean
  showDeploymentVersionJvmOptions: boolean
  showDeploymentLinkDenoPermissions: boolean
  showDeploymentLinkJvmOptions: boolean
  deploymentEnvOutputList: WorkbenchEnvVariableEntry[]
  deploymentEnvInputList: WorkbenchEnvVariableEntry[]
  deploymentEnvOutputOptions: ReturnType<typeof uniquePresetOptions>
  deploymentEnvInputOptions: ReturnType<typeof uniquePresetOptions>
}) {
  return (
    <div className="flex min-h-[3200px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
      <section data-outline-target={deploymentOutlineTarget('name')}>
        <FieldLabel>部署名称</FieldLabel>
        <AutoGrowTextField
          value={deployment.name}
          onChange={name => updateDeployment({ name })}
          maxWidth={fieldAvailableWidth}
          ariaLabel="部署名称"
        />
      </section>

      <section data-outline-target={deploymentOutlineTarget('id')}>
        <FieldLabel>部署ID</FieldLabel>
        <AutoGrowTextField
          value={deployment.id}
          onChange={updateDeploymentId}
          maxWidth={fieldAvailableWidth}
          ariaLabel="部署ID"
        />
      </section>

      <section data-outline-target={deploymentOutlineTarget('deploy')}>
        <FieldLabel>需要部署</FieldLabel>
        <BooleanSwitchField
          value={deployment.deploy}
          onChange={deploy => updateDeployment({ deploy })}
        />
      </section>

      <ConditionalField show={deployment.deploy === true}>
        <section data-outline-target={deploymentOutlineTarget('choose')}>
          <FieldLabel>用户可选部署</FieldLabel>
          <BooleanSwitchField
            value={deployment.choose}
            onChange={choose => updateDeployment({ choose })}
          />
        </section>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('runtime')}>
        <FieldLabel>部署运行时</FieldLabel>
        <RuntimeSelectField
          value={deployment.runtime}
          onChange={runtime => updateDeployment({ runtime })}
          allowInherit
        />
      </section>

      <section data-outline-target={deploymentOutlineTarget('command-theme')}>
        <FieldLabel>命令主题</FieldLabel>
        <OptionSelectField
          value={deployment.commandTheme}
          options={commandThemeOptions}
          onChange={commandTheme => updateDeployment({ commandTheme })}
          ariaLabel="命令主题"
        />
      </section>

      <ConditionalField show={deployment.deploy === true}>
        <div className="flex flex-col gap-[18px]">
          <section data-outline-target={deploymentOutlineTarget('command-deploy')}>
            <FieldLabel>命令行部署</FieldLabel>
            <BooleanSwitchField
              value={deployment.commandDeploy}
              onChange={commandDeploy => updateDeployment({ commandDeploy })}
            />
          </section>

          <ConditionalField show={deployment.commandDeploy === true}>
            <section data-outline-target={deploymentOutlineTarget('deploy-command-list')}>
              <ArrayListField
                label="部署命令列表"
                values={deployment.deployCommandList}
                outlineTargetId={deploymentOutlineTarget('deploy-command-list')}
                onChange={deployCommandList => updateDeployment({ deployCommandList })}
                maxWidth={fieldAvailableWidth}
                itemAriaLabel="部署命令"
              />
            </section>
          </ConditionalField>

          <ConditionalField show={deployment.commandDeploy !== true}>
            <div className="flex flex-col gap-[18px]">
              <section data-outline-target={deploymentOutlineTarget('deploy-method')}>
                <FieldLabel>部署方式</FieldLabel>
                <OptionSelectField
                  value={deployment.deployMethod}
                  options={deployMethodOptions}
                  onChange={deployMethod => updateDeployment({ deployMethod })}
                  ariaLabel="部署方式"
                />
              </section>

              <section data-outline-target={deploymentOutlineTarget('base-link')}>
                <FieldLabel>部署基础链接</FieldLabel>
                <AutoGrowTextField
                  value={deployment.baseLink}
                  onChange={baseLink => updateDeployment({ baseLink })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="部署基础链接"
                />
              </section>

              <section data-outline-target={deploymentOutlineTarget('get-method')}>
                <FieldLabel>获取方法</FieldLabel>
                <OptionSelectField
                  value={deployment.getMethod}
                  options={deploymentGetMethodOptions}
                  onChange={getMethod => updateDeployment({ getMethod })}
                  ariaLabel="获取方法"
                />
              </section>

              <ConditionalField show={deployment.getMethod === 'get_version'}>
                <div className="flex flex-col gap-[18px]">
                  <section data-outline-target={deploymentOutlineTarget('get-version')}>
                    <FieldLabel>版本获取方式</FieldLabel>
                    <OptionSelectField
                      value={deployment.getVersion}
                      options={getVersionOptions}
                      onChange={getVersion => updateDeployment({ getVersion })}
                      ariaLabel="版本获取方式"
                    />
                  </section>

                  <ConditionalField show={deployment.getVersion === 'github_repo'}>
                    <section data-outline-target={deploymentOutlineTarget('github-repo')}>
                      <FieldLabel>GitHub仓库链接</FieldLabel>
                      <AutoGrowTextField
                        value={deployment.githubRepo}
                        onChange={githubRepo => updateDeployment({ githubRepo })}
                        maxWidth={fieldAvailableWidth}
                        ariaLabel="GitHub仓库链接"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getVersion === 'filelink'}>
                    <section data-outline-target={deploymentOutlineTarget('version-file')}>
                      <ArrayListField
                        label="版本文件来源列表"
                        values={deploymentVersionFile}
                        outlineTargetId={deploymentOutlineTarget('version-file')}
                        onChange={versionFile => updateDeployment({ versionFile })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="版本文件来源"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getVersion === 'custom'}>
                    <section data-outline-target={deploymentOutlineTarget('version-custom')}>
                      <ArrayListField
                        label="版本脚本来源列表"
                        values={deploymentVersionCustom}
                        outlineTargetId={deploymentOutlineTarget('version-custom')}
                        onChange={versionCustom => updateDeployment({ versionCustom })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="版本脚本来源"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getVersion === 'custom' && showDeploymentVersionDenoPermissions}>
                    <section data-outline-target={deploymentOutlineTarget('deno-permissions')}>
                      <ArrayListField
                        label="Deno权限参数列表"
                        values={deploymentDenoPermissions}
                        outlineTargetId={deploymentOutlineTarget('deno-permissions')}
                        onChange={denoPermissions => updateDeployment({ denoPermissions })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="Deno权限参数"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getVersion === 'custom' && showDeploymentVersionJvmOptions}>
                    <section data-outline-target={deploymentOutlineTarget('jvm')}>
                      <ArrayListField
                        label="JVM参数列表"
                        values={deploymentJvm}
                        outlineTargetId={deploymentOutlineTarget('jvm')}
                        onChange={jvm => updateDeployment({ jvm })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="JVM参数"
                      />
                    </section>
                  </ConditionalField>

                  <section data-outline-target={deploymentOutlineTarget('splicing-link')}>
                    <FieldLabel>版本拼接链接</FieldLabel>
                    <AutoGrowTextField
                      value={deployment.splicingLink}
                      onChange={splicingLink => updateDeployment({ splicingLink })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="版本拼接链接"
                    />
                  </section>

                  <section data-outline-target={deploymentOutlineTarget('format-version')}>
                    <FieldLabel>格式化版本号</FieldLabel>
                    <BooleanSwitchField
                      value={deployment.formatVersion}
                      onChange={formatVersion => updateDeployment({ formatVersion })}
                    />
                  </section>

                  <ConditionalField show={deployment.formatVersion === true}>
                    <section data-outline-target={deploymentOutlineTarget('version-formatting-formula')}>
                      <VersionFormattingRuleField
                        label="格式化规则列表"
                        values={deployment.versionFormattingFormula}
                        outlineTargetId={deploymentOutlineTarget('version-formatting-formula')}
                        onChange={versionFormattingFormula => updateDeployment({ versionFormattingFormula })}
                        maxWidth={fieldAvailableWidth}
                      />
                    </section>
                  </ConditionalField>
                </div>
              </ConditionalField>

              <ConditionalField show={deployment.getMethod === 'get_link'}>
                <div className="flex flex-col gap-[18px]">
                  <section data-outline-target={deploymentOutlineTarget('get-link')}>
                    <FieldLabel>链接获取方式</FieldLabel>
                    <OptionSelectField
                      value={deployment.getLink}
                      options={getLinkOptions}
                      onChange={getLink => updateDeployment({ getLink })}
                      ariaLabel="链接获取方式"
                    />
                  </section>

                  <ConditionalField show={deployment.getLink === 'filelink' || deployment.getLink === 'custom'}>
                    <section data-outline-target={deploymentOutlineTarget('get-link-provide-list')}>
                      <ArrayListField
                        label="可选链接列表"
                        values={deploymentGetLinkProvideList}
                        outlineTargetId={deploymentOutlineTarget('get-link-provide-list')}
                        onChange={getLinkProvideList => updateDeployment({ getLinkProvideList })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="可选链接"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getLink === 'filelink' && deploymentGetLinkProvideList.length === 0}>
                    <section data-outline-target={deploymentOutlineTarget('link-file')}>
                      <ArrayListField
                        label="链接文件来源列表"
                        values={deploymentLinkFile}
                        outlineTargetId={deploymentOutlineTarget('link-file')}
                        onChange={linkFile => updateDeployment({ linkFile })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="链接文件来源"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getLink === 'custom' && deploymentGetLinkProvideList.length === 0}>
                    <section data-outline-target={deploymentOutlineTarget('link-custom')}>
                      <ArrayListField
                        label="链接脚本来源列表"
                        values={deploymentLinkCustom}
                        outlineTargetId={deploymentOutlineTarget('link-custom')}
                        onChange={linkCustom => updateDeployment({ linkCustom })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="链接脚本来源"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getLink === 'custom' && deploymentGetLinkProvideList.length === 0 && showDeploymentLinkDenoPermissions}>
                    <section data-outline-target={deploymentOutlineTarget('deno-permissions')}>
                      <ArrayListField
                        label="Deno权限参数列表"
                        values={deploymentDenoPermissions}
                        outlineTargetId={deploymentOutlineTarget('deno-permissions')}
                        onChange={denoPermissions => updateDeployment({ denoPermissions })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="Deno权限参数"
                      />
                    </section>
                  </ConditionalField>

                  <ConditionalField show={deployment.getLink === 'custom' && deploymentGetLinkProvideList.length === 0 && showDeploymentLinkJvmOptions}>
                    <section data-outline-target={deploymentOutlineTarget('jvm')}>
                      <ArrayListField
                        label="JVM参数列表"
                        values={deploymentJvm}
                        outlineTargetId={deploymentOutlineTarget('jvm')}
                        onChange={jvm => updateDeployment({ jvm })}
                        maxWidth={fieldAvailableWidth}
                        itemAriaLabel="JVM参数"
                      />
                    </section>
                  </ConditionalField>
                </div>
              </ConditionalField>
            </div>
          </ConditionalField>

          <section data-outline-target={deploymentOutlineTarget('deploy-path')}>
            <FieldLabel>部署路径</FieldLabel>
            <AutoGrowTextField
              value={deployment.deployPath}
              onChange={deployPath => updateDeployment({ deployPath })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="部署路径"
            />
          </section>

          <ConditionalField show={deployment.deployPath === '$CustomPath'}>
            <section data-outline-target={deploymentOutlineTarget('custom-path')}>
              <FieldLabel>自定义路径</FieldLabel>
              <AutoGrowTextField
                value={deployment.customPath}
                onChange={customPath => updateDeployment({ customPath })}
                maxWidth={fieldAvailableWidth}
                ariaLabel="自定义路径"
              />
            </section>
          </ConditionalField>
        </div>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('user-choose')}>
        <FieldLabel>用户可选版本</FieldLabel>
        <BooleanSwitchField
          value={deployment.userChoose}
          onChange={userChoose => updateDeployment({ userChoose })}
        />
      </section>

      <ConditionalField show={deployment.userChoose === true}>
        <section data-outline-target={deploymentOutlineTarget('choose-list')}>
          <ArrayListField
            label="版本选择列表"
            values={deployment.chooseList}
            outlineTargetId={deploymentOutlineTarget('choose-list')}
            onChange={chooseList => updateDeployment({ chooseList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="版本选择项"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('before-command')}>
        <FieldLabel>部署前操作</FieldLabel>
        <BooleanSwitchField
          value={deployment.beforeCommand}
          onChange={beforeCommand => updateDeployment({ beforeCommand })}
        />
      </section>

      <ConditionalField show={deployment.beforeCommand === true}>
        <section data-outline-target={deploymentOutlineTarget('before-command-list')}>
          <ArrayListField
            label="部署前命令列表"
            values={deployment.beforeCommandList}
            outlineTargetId={deploymentOutlineTarget('before-command-list')}
            onChange={beforeCommandList => updateDeployment({ beforeCommandList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="部署前命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('after-command')}>
        <FieldLabel>部署后操作</FieldLabel>
        <BooleanSwitchField
          value={deployment.afterCommand}
          onChange={afterCommand => updateDeployment({ afterCommand })}
        />
      </section>

      <ConditionalField show={deployment.afterCommand === true}>
        <section data-outline-target={deploymentOutlineTarget('after-command-list')}>
          <ArrayListField
            label="部署后命令列表"
            values={deployment.afterCommandList}
            outlineTargetId={deploymentOutlineTarget('after-command-list')}
            onChange={afterCommandList => updateDeployment({ afterCommandList })}
            maxWidth={fieldAvailableWidth}
            itemAriaLabel="部署后命令"
          />
        </section>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('env-output')}>
        <FieldLabel>部署环境变量导出</FieldLabel>
        <BooleanSwitchField
          value={deployment.envOutput}
          onChange={envOutput => updateDeployment({ envOutput })}
        />
      </section>

      <ConditionalField show={deployment.envOutput === true}>
        <section data-outline-target={deploymentOutlineTarget('env-output-list')}>
          <EnvVariableTableField
            label="导出变量列表"
            values={deploymentEnvOutputList}
            outlineTargetId={deploymentOutlineTarget('env-output-list')}
            onChange={envOutputList => updateDeployment({ envOutputList })}
            maxWidth={fieldAvailableWidth}
            presetOptions={deploymentEnvOutputOptions}
          />
        </section>
      </ConditionalField>

      <section data-outline-target={deploymentOutlineTarget('env-input')}>
        <FieldLabel>部署环境变量导入</FieldLabel>
        <BooleanSwitchField
          value={deployment.envInput}
          onChange={envInput => updateDeployment({ envInput })}
        />
      </section>

      <ConditionalField show={deployment.envInput === true}>
        <section data-outline-target={deploymentOutlineTarget('env-input-list')}>
          <EnvVariableTableField
            label="导入变量列表"
            values={deploymentEnvInputList}
            outlineTargetId={deploymentOutlineTarget('env-input-list')}
            onChange={envInputList => updateDeployment({ envInputList })}
            maxWidth={fieldAvailableWidth}
            presetOptions={deploymentEnvInputOptions}
          />
        </section>
      </ConditionalField>
    </div>
  )
}
