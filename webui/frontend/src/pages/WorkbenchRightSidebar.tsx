import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { WorkbenchBlockId, WorkbenchComponentMeta, WorkbenchConfigItemMeta, WorkbenchDeploymentMeta, WorkbenchEnvVariableEntry, WorkbenchFileMeta, WorkbenchLaunchItemMeta, WorkbenchUninstallItemMeta, WorkbenchVersionFormattingRule } from './workbench-canvas/types'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const fieldLineHeight = 30
const fieldVerticalPadding = 7
const fieldMinWidth = 142
const fieldMaxWidth = 553
const fieldMaxCollapsedLines = 5

export const rightSidebarExpandedWidth = 600
export const rightSidebarCollapsedWidth = 70
export const rightSidebarMinWidth = 200
export const rightSidebarMaxWidth = 760

const runtimeOptions = ['powershell', 'pwsh', 'cmd', 'bash', 'python3', 'python', 'node', 'deno']
const commandThemeOptions = ['oh-my-posh', 'classical']
const getMethodOptions = ['direct', 'get_version', 'get_link']
const deploymentGetMethodOptions = ['get_version', 'get_link']
const getVersionOptions = ['github_repo', 'filelink', 'custom']
const getLinkOptions = ['filelink', 'custom', 'user_input']
const deployMethodOptions = ['auto', 'gitclone', '!gitclone', 'getfile']
const installOperateOptions = ['auto', 'no', 'custom']
const platformOptions = ['windows', 'linux', 'macos']
const optionLabels: Record<string, string> = {
  powershell: 'PowerShell',
  pwsh: 'PowerShell Core',
  cmd: '命令提示符',
  bash: 'Bash',
  python3: 'Python 3',
  python: 'Python',
  node: 'Node.js',
  deno: 'Deno',
  classical: '经典',
  direct: '直接获取',
  get_version: '获取版本',
  get_link: '获取链接',
  github_repo: 'GitHub仓库',
  filelink: '文件链接',
  custom: '自定义',
  user_input: '用户输入',
  auto: '自动处理',
  gitclone: 'Git 克隆',
  '!gitclone': '强制 Git 克隆',
  getfile: '获取文件',
  no: '不处理',
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
}

let arrayListItemId = 0

interface ArrayListPresetOption {
  value: string
  name?: string
  label?: string
  description?: string
}

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

const emptyComponentMeta: WorkbenchComponentMeta = {
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

const emptyDeploymentMeta: WorkbenchDeploymentMeta = {
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

const emptyModInfoMeta: WorkbenchModInfoMeta = {
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

export interface WorkbenchRightSidebarProps {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  selectedName?: string
  selectedBlockId?: WorkbenchBlockId | null
  focusTarget?: { id: string; nonce: number } | null
  meta?: WorkbenchModInfoMeta
  onMetaPatch?: (patch: Partial<WorkbenchModInfoMeta>) => void
  onOpenFileEditor?: (fileId: string) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

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

function TextAlignRightGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 41 41" fill="none" aria-hidden>
      <path d="M9.5 13h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M15.5 18h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M9.5 23h22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M15.5 28h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
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

function parseTomlInlineStringField(source: string, key: string) {
  const pattern = new RegExp(`${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`)
  const match = pattern.exec(source)
  return match?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? null
}

function extractEnvNameFromString(value: string) {
  const inlineName = parseTomlInlineStringField(value, 'name')
  if (inlineName) return inlineName

  const envPlaceholder = value.match(/\{\{env\|([^}]+)}}/)
  if (envPlaceholder?.[1]) return envPlaceholder[1]

  const trimmed = value.trim()
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ? trimmed : null
}

function extractEnvName(value: string | WorkbenchEnvVariableEntry) {
  if (typeof value !== 'string') {
    const name = value.name.trim()
    return name || extractEnvNameFromString(value.value)
  }

  return extractEnvNameFromString(value)
}

function normalizeEnvVariableEntry(value: WorkbenchEnvVariableEntry | string): WorkbenchEnvVariableEntry {
  if (typeof value !== 'string') {
    return { name: value.name ?? '', value: value.value ?? '' }
  }

  const name = extractEnvNameFromString(value) ?? ''
  const inlineValue = parseTomlInlineStringField(value, 'value')
  return { name, value: inlineValue ?? value }
}

function normalizeEnvVariableEntries(values: Array<WorkbenchEnvVariableEntry | string> | undefined) {
  return (values ?? []).map(normalizeEnvVariableEntry)
}

function envVariableEntriesEqual(left: WorkbenchEnvVariableEntry[], right: WorkbenchEnvVariableEntry[]) {
  return left.length === right.length && left.every((value, index) => (
    value.name === right[index].name && value.value === right[index].value
  ))
}

function createEnvVariableName(...parts: string[]) {
  const normalized = parts
    .filter(Boolean)
    .join('_')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return normalized || 'VARIABLE'
}

function uniquePresetOptions(options: ArrayListPresetOption[]) {
  const seen = new Set<string>()
  return options.filter(option => {
    if (!option.value || seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

function createEnvInputValue(name: string) {
  return `{{env|${name}}}`
}

function formattingRulesEqual(left: WorkbenchVersionFormattingRule[], right: WorkbenchVersionFormattingRule[]) {
  return left.length === right.length && left.every((value, index) => (
    value.match === right[index].match && value.replace === right[index].replace
  ))
}

function parseComponentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('component:')) return null
  const index = Number(blockId.slice('component:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function fillComponentsToIndex(components: WorkbenchComponentMeta[], index: number) {
  if (components.length > index) return [...components]
  return [
    ...components,
    ...Array.from({ length: index - components.length + 1 }, () => ({ ...emptyComponentMeta })),
  ]
}

function parseDeploymentBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('deployment:')) return null
  const index = Number(blockId.slice('deployment:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function fillDeploymentsToIndex(deployments: WorkbenchDeploymentMeta[], index: number) {
  if (deployments.length > index) return [...deployments]
  return [
    ...deployments,
    ...Array.from({ length: index - deployments.length + 1 }, () => ({ ...emptyDeploymentMeta })),
  ]
}

function parseConfigItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('config-item:')) return null
  const index = Number(blockId.slice('config-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function fillConfigItemsToIndex(configItems: WorkbenchConfigItemMeta[], index: number) {
  if (configItems.length > index) return [...configItems]
  return [
    ...configItems,
    ...Array.from({ length: index - configItems.length + 1 }, () => ({ ...emptyConfigItemMeta })),
  ]
}

function parseLaunchItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('launch-item:')) return null
  const index = Number(blockId.slice('launch-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function fillLaunchItemsToIndex(launchItems: WorkbenchLaunchItemMeta[], index: number) {
  if (launchItems.length > index) return [...launchItems]
  return [
    ...launchItems,
    ...Array.from({ length: index - launchItems.length + 1 }, () => ({ ...emptyLaunchItemMeta })),
  ]
}

function parseUninstallItemBlockIndex(blockId: WorkbenchBlockId | null | undefined) {
  if (!blockId?.startsWith('uninstall-item:')) return null
  const index = Number(blockId.slice('uninstall-item:'.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

function fillUninstallItemsToIndex(uninstallItems: WorkbenchUninstallItemMeta[], index: number) {
  if (uninstallItems.length > index) return [...uninstallItems]
  return [
    ...uninstallItems,
    ...Array.from({ length: index - uninstallItems.length + 1 }, () => ({ ...emptyUninstallItemMeta })),
  ]
}

let textMeasureContext: CanvasRenderingContext2D | null | undefined

function getTextMeasureContext() {
  if (textMeasureContext !== undefined) return textMeasureContext
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  textMeasureContext = canvas.getContext('2d')
  if (textMeasureContext) textMeasureContext.font = `300 20px ${font}`
  return textMeasureContext
}

function measureTextWidth(value: string) {
  const context = getTextMeasureContext()
  if (context) return Math.ceil(context.measureText(value || ' ').width)

  let width = 0

  for (const char of value || ' ') {
    width += /[\u4e00-\u9fff]/.test(char) ? 20 : 11
  }

  return width
}

function countWrappedLines(value: string, textWidth: number) {
  let lines = 1
  let lineWidth = 0

  for (const char of Array.from(value || ' ')) {
    const charWidth = measureTextWidth(char)
    if (lineWidth > 0 && lineWidth + charWidth > textWidth) {
      lines += 1
      lineWidth = charWidth
    } else {
      lineWidth += charWidth
    }
  }

  return lines
}

function resolveFieldMetrics(value: string, maxWidth = fieldMaxWidth) {
  const lines = value.split('\n')
  const longestLineWidth = Math.max(...lines.map(line => measureTextWidth(line)))
  const desiredWidth = longestLineWidth + 30
  const width = Math.min(maxWidth, Math.max(fieldMinWidth, desiredWidth))
  const textWidth = Math.max(1, width - 20)
  const wrappedLines = lines.reduce((total, line) => total + countWrappedLines(line, textWidth), 0)

  return { width, lines: wrappedLines }
}

const inlineTableGap = 8
const inlineTableCellMinWidth = 66
const inlineTablePreferredMinWidth = 132

function resolveInlineTableDesiredWidth(value: string, chromeWidth: number) {
  const lines = value.split('\n')
  const longestLineWidth = Math.max(...lines.map(line => measureTextWidth(line)))
  return longestLineWidth + chromeWidth
}

function resolveSplitTableCellWidths(
  leftValue: string,
  rightValue: string,
  maxWidth: number,
  leftChromeWidth: number,
  rightChromeWidth: number,
) {
  const contentWidth = Math.max(inlineTableCellMinWidth * 2, maxWidth - inlineTableGap)
  const defaultLeftWidth = Math.floor(contentWidth / 2)
  const defaultRightWidth = contentWidth - defaultLeftWidth
  const minCellWidth = Math.min(
    inlineTablePreferredMinWidth,
    Math.max(inlineTableCellMinWidth, Math.floor(contentWidth * 0.25)),
  )
  const leftDesiredWidth = resolveInlineTableDesiredWidth(leftValue, leftChromeWidth)
  const rightDesiredWidth = resolveInlineTableDesiredWidth(rightValue, rightChromeWidth)
  let leftWidth = defaultLeftWidth
  let rightWidth = defaultRightWidth

  if (leftDesiredWidth > leftWidth && rightDesiredWidth <= rightWidth) {
    const borrowedWidth = Math.min(leftDesiredWidth - leftWidth, rightWidth - minCellWidth)
    leftWidth += borrowedWidth
    rightWidth -= borrowedWidth
  } else if (rightDesiredWidth > rightWidth && leftDesiredWidth <= leftWidth) {
    const borrowedWidth = Math.min(rightDesiredWidth - rightWidth, leftWidth - minCellWidth)
    rightWidth += borrowedWidth
    leftWidth -= borrowedWidth
  }

  return { leftWidth, rightWidth }
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label
      className="block min-h-[36px] leading-[36px]"
      style={{ fontFamily: font, fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}
    >
      {children}
    </label>
  )
}

function AutoGrowTextField({
  value,
  onChange,
  ariaLabel,
  selected = false,
  onCommit,
  allowLineBreaks = false,
  maxWidth = fieldMaxWidth,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  selected?: boolean
  onCommit?: () => void
  allowLineBreaks?: boolean
  maxWidth?: number
}) {
  const [focused, setFocused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const metrics = useMemo(() => resolveFieldMetrics(value, maxWidth), [maxWidth, value])
  const naturalLines = metrics.lines
  const visibleLines = expanded ? naturalLines : Math.min(naturalLines, fieldMaxCollapsedLines)
  const fieldHeight = fieldVerticalPadding * 2 + visibleLines * fieldLineHeight
  const canCollapse = naturalLines > fieldMaxCollapsedLines
  const active = focused || selected

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!allowLineBreaks && event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <div className="max-w-full">
      <div
        className="relative max-w-full rounded-[22px] rounded-tl-none border transition-[background-color,border-color,width,height] duration-150"
        style={{
          width: metrics.width,
          maxWidth: '100%',
          height: fieldHeight,
          borderColor: active ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: active ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
        }}
      >
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            onCommit?.()
          }}
          onKeyDown={handleKeyDown}
          rows={visibleLines}
          className="absolute inset-x-[10px] top-[7px] resize-none overflow-hidden bg-transparent text-[20px] font-light leading-[30px] outline-none"
          style={{
            height: visibleLines * fieldLineHeight,
            fontFamily: font,
            whiteSpace: 'pre-wrap',
          }}
          aria-label={ariaLabel}
        />
      </div>

      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="mt-[8px] h-[30px] rounded-[15px] border px-[10px] text-[16px] leading-[28px] transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            fontFamily: font,
          }}
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  )
}

function BooleanSwitchField({
  value,
  onChange,
}: {
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex h-[42px] w-[142px] items-center rounded-[21px] border px-[5px] transition-colors"
      style={{
        borderColor: value ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
        background: value ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
        fontFamily: font,
      }}
      title={value ? '已启用' : '已关闭'}
    >
      <span
        className="h-[30px] w-[30px] rounded-full border transition-transform duration-150 ease-out"
        style={{
          transform: value ? 'translateX(96px)' : 'translateX(0)',
          borderColor: value ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: value ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-bg)',
        }}
        aria-hidden
      />
    </button>
  )
}

function RuntimeSelectField({
  value,
  onChange,
  allowInherit = false,
}: {
  value: string
  onChange: (value: string) => void
  allowInherit?: boolean
}) {
  const [open, setOpen] = useState(false)
  const options = allowInherit ? ['', ...runtimeOptions] : runtimeOptions
  const displayValue = value || (allowInherit ? '' : options[0])
  const dropdownHeight = options.length * 34 + 10

  return (
    <div
      className="relative w-[190px] max-w-full"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-[42px] w-full items-center justify-between rounded-[21px] border px-[14px] text-[20px] font-light outline-none transition-colors hover:bg-[var(--dfw-control-hover)] focus:border-[var(--dfw-blue)]"
        style={{
          borderColor: open ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: open ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
          fontFamily: font,
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="运行时"
      >
        <span className="overflow-hidden whitespace-nowrap">
          {displayValue === '' ? '继承 [MODINFO]' : optionLabels[displayValue] ?? displayValue}
        </span>
        <svg
          className="ml-[8px] shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className="mt-[6px] overflow-hidden transition-[height,opacity] duration-150 ease-out"
        style={{
          height: open ? dropdownHeight : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden={!open}
      >
        <div
          className="w-full overflow-hidden rounded-[14px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
            fontFamily: font,
          }}
          role="listbox"
        >
          {options.map(option => {
            const selected = option === displayValue
            return (
              <button
                key={option}
                type="button"
                tabIndex={open ? 0 : -1}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className="block h-[34px] w-full px-[12px] text-left text-[18px] font-light leading-[34px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{
                  background: selected ? 'var(--dfw-outline-selected-bg)' : 'transparent',
                }}
                role="option"
                aria-selected={selected}
              >
                {option === '' ? '继承 [MODINFO]' : optionLabels[option] ?? option}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function OptionSelectField({
  value,
  options,
  onChange,
  ariaLabel,
  width = 220,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  ariaLabel: string
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const allOptions = options
  const displayValue = value || allOptions[0]
  const dropdownHeight = allOptions.length * 34 + 10

  return (
    <div
      className="relative max-w-full"
      style={{ width }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-[42px] w-full items-center justify-between rounded-[21px] border px-[14px] text-[20px] font-light outline-none transition-colors hover:bg-[var(--dfw-control-hover)] focus:border-[var(--dfw-blue)]"
        style={{
          borderColor: open ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: open ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
          fontFamily: font,
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        <span className="overflow-hidden whitespace-nowrap">{optionLabels[displayValue] ?? displayValue}</span>
        <svg
          className="ml-[8px] shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className="mt-[6px] overflow-hidden transition-[height,opacity] duration-150 ease-out"
        style={{
          height: open ? dropdownHeight : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden={!open}
      >
        <div
          className="w-full overflow-hidden rounded-[14px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
            fontFamily: font,
          }}
          role="listbox"
        >
          {allOptions.map(option => {
            const selected = option === displayValue
            return (
              <button
                key={option}
                type="button"
                tabIndex={open ? 0 : -1}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className="block h-[34px] w-full px-[12px] text-left text-[18px] font-light leading-[34px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{
                  background: selected ? 'var(--dfw-outline-selected-bg)' : 'transparent',
                }}
                role="option"
                aria-selected={selected}
              >
                {optionLabels[option] ?? option}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PlatformSelectField({
  values,
  onChange,
  width = 220,
}: {
  values: string[]
  onChange: (values: string[]) => void
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const selectedValues = values.length ? values : ['windows']
  const selectedSet = new Set(selectedValues)
  const displayValue = selectedValues.map(value => optionLabels[value] ?? value).join('、')
  const dropdownHeight = platformOptions.length * 34 + 10

  const toggleOption = (option: string) => {
    const next = selectedSet.has(option)
      ? selectedValues.filter(value => value !== option)
      : [...selectedValues, option]
    onChange(next.length ? next : ['windows'])
  }

  return (
    <div
      className="relative max-w-full"
      style={{ width }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-[42px] w-full items-center justify-between rounded-[21px] border px-[14px] text-[20px] font-light outline-none transition-colors hover:bg-[var(--dfw-control-hover)] focus:border-[var(--dfw-blue)]"
        style={{
          borderColor: open ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: open ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
          fontFamily: font,
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="平台限制"
      >
        <span className="overflow-hidden whitespace-nowrap">{displayValue}</span>
        <svg
          className="ml-[8px] shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M3.5 6L8 10.5L12.5 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className="mt-[6px] overflow-hidden transition-[height,opacity] duration-150 ease-out"
        style={{
          height: open ? dropdownHeight : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        aria-hidden={!open}
      >
        <div
          className="w-full overflow-hidden rounded-[14px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
            fontFamily: font,
          }}
          role="listbox"
          aria-multiselectable="true"
        >
          {platformOptions.map(option => {
            const selected = selectedSet.has(option)
            return (
              <button
                key={option}
                type="button"
                tabIndex={open ? 0 : -1}
                onMouseDown={event => event.preventDefault()}
                onClick={() => toggleOption(option)}
                className="flex h-[34px] w-full items-center gap-[8px] px-[12px] text-left text-[18px] font-light leading-[34px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{
                  background: selected ? 'var(--dfw-outline-selected-bg)' : 'transparent',
                }}
                role="option"
                aria-selected={selected}
              >
                <span
                  className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border"
                  style={{
                    borderColor: selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                    background: selected ? 'var(--dfw-blue)' : 'transparent',
                    color: 'var(--dfw-bg)',
                  }}
                  aria-hidden
                >
                  {selected ? '✓' : ''}
                </span>
                <span>{optionLabels[option] ?? option}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
function ConditionalField({
  show,
  children,
}: {
  show: boolean
  children: ReactNode
}) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const updateHeight = () => {
      setHeight(content.scrollHeight)
    }

    updateHeight()

    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(content)
    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div
      className="overflow-hidden transition-[height,opacity,transform,margin] duration-200 ease-out"
      style={{
        height: show ? height : 0,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(-6px)',
        marginTop: show ? 0 : -18,
        marginBottom: 0,
        pointerEvents: show ? 'auto' : 'none',
      }}
      aria-hidden={!show}
    >
      <div ref={contentRef}>
        {children}
      </div>
    </div>
  )
}

interface ArrayListItem {
  id: string
  value: string
}

interface VersionFormattingRuleItem {
  id: string
  value: WorkbenchVersionFormattingRule
}

interface EnvVariableEntryItem {
  id: string
  value: WorkbenchEnvVariableEntry
}

function createArrayListItem(value: string): ArrayListItem {
  arrayListItemId += 1
  return { id: `array-list-item-${arrayListItemId}`, value }
}

function createVersionFormattingRuleItem(value: WorkbenchVersionFormattingRule): VersionFormattingRuleItem {
  arrayListItemId += 1
  return {
    id: `version-formatting-rule-${arrayListItemId}`,
    value: { match: value.match, replace: value.replace },
  }
}

function createEnvVariableEntryItem(value: WorkbenchEnvVariableEntry): EnvVariableEntryItem {
  arrayListItemId += 1
  return {
    id: `env-variable-entry-${arrayListItemId}`,
    value: { name: value.name, value: value.value },
  }
}

function clampSelectionIds<T extends { id: string }>(ids: string[], items: T[]) {
  const itemIds = new Set(items.map(item => item.id))
  return ids.filter(id => itemIds.has(id))
}

function resolveSelectionRange<T extends { id: string }>(items: T[], anchorId: string | null, targetIndex: number) {
  const anchorIndex = anchorId ? items.findIndex(item => item.id === anchorId) : -1
  const start = anchorIndex >= 0 ? anchorIndex : targetIndex
  const from = Math.min(start, targetIndex)
  const to = Math.max(start, targetIndex)
  return items.slice(from, to + 1).map(item => item.id)
}

function resolveDragGroup<T extends { id: string }>(items: T[], selectedIds: string[], dragItemId: string) {
  const selected = clampSelectionIds(selectedIds, items)
  return selected.includes(dragItemId) ? selected : [dragItemId]
}

function resolveGroupBoundaryTarget<T extends { id: string }>(items: T[], groupIds: string[], direction: 1 | -1) {
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

function moveItemGroup<T extends { id: string }>(items: T[], groupIds: string[], direction: 1 | -1) {
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

function PlusGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 4.5V17.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M4.5 11H17.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function DeleteGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4.5 4.5L13.5 13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M13.5 4.5L4.5 13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function ArrayListInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  ariaLabel: string
  placeholder?: string
}) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const textArea = textAreaRef.current
    if (!textArea) return
    textArea.style.height = 'auto'
    textArea.style.height = `${Math.max(40, textArea.scrollHeight)}px`
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <textarea
      ref={textAreaRef}
      value={value}
      onChange={event => onChange(event.target.value.replace(/\r?\n/g, ''))}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      rows={1}
      placeholder={placeholder}
      className="min-h-[40px] min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[8px] pr-[8px] text-[18px] font-light leading-[24px] outline-none"
      style={{
        color: 'var(--dfw-text)',
        fontFamily: font,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
      aria-label={ariaLabel}
    />
  )
}

function ArrayListField({
  label,
  values,
  onChange,
  maxWidth,
  itemAriaLabel,
  presetOptions = [],
  outlineTargetId,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  maxWidth: number
  itemAriaLabel?: string
  presetOptions?: ArrayListPresetOption[]
  outlineTargetId?: string
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const [items, setItems] = useState<ArrayListItem[]>(() => values.map(createArrayListItem))
  const itemsRef = useRef(items)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const previousRectsRef = useRef<Map<string, DOMRect> | null>(null)
  const dragRef = useRef<{ pointerId: number; index: number; itemId: string; lastClientY: number; active: boolean; timer: number } | null>(null)

  useEffect(() => {
    setItems(currentItems => {
      const currentValues = currentItems.map(item => item.value)
      if (arraysEqual(currentValues, values)) return currentItems

      const nextItems = values.map((value, index) => ({
        id: currentItems[index]?.id ?? createArrayListItem(value).id,
        value,
      }))
      itemsRef.current = nextItems
      setSelectedIds(current => clampSelectionIds(current, nextItems))
      setSelectionAnchorId(current => (current && nextItems.some(item => item.id === current) ? current : null))
      return nextItems
    })
  }, [values])

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current
    if (!previousRects) return

    for (const item of items) {
      const element = rowRefs.current.get(item.id)
      const previousRect = previousRects.get(item.id)
      if (!element || !previousRect) continue

      const currentRect = element.getBoundingClientRect()
      const deltaY = previousRect.top - currentRect.top
      if (Math.abs(deltaY) < 1) continue

      element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0)' },
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
      )
    }

    previousRectsRef.current = null
  }, [items])

  const captureRowRects = () => {
    const rects = new Map<string, DOMRect>()
    for (const item of itemsRef.current) {
      const element = rowRefs.current.get(item.id)
      if (element) rects.set(item.id, element.getBoundingClientRect())
    }
    previousRectsRef.current = rects
  }

  const commitItems = (nextItems: ArrayListItem[], animate = false) => {
    if (animate) captureRowRects()
    itemsRef.current = nextItems
    setItems(nextItems)
    onChange(nextItems.map(item => item.value))
  }

  const addItem = () => {
    commitItems([...itemsRef.current, createArrayListItem('')], true)
  }

  const presetValueExists = (value: string) => itemsRef.current.some(item => (
    item.value === value || item.value.includes(value)
  ))

  const addPresetItem = (value: string) => {
    commitItems([...itemsRef.current, createArrayListItem(value)], true)
    setPresetOpen(false)
  }

  const updateItem = (index: number, nextValue: string) => {
    const nextItems = itemsRef.current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value: nextValue } : item
    ))
    commitItems(nextItems)
  }

  const deleteItem = (index: number) => {
    const deletedId = itemsRef.current[index]?.id
    setFocusedIndex(current => {
      if (current === null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
    if (deletedId) {
      setSelectedIds(current => current.filter(id => id !== deletedId))
      setSelectionAnchorId(current => (current === deletedId ? null : current))
    }
    commitItems(itemsRef.current.filter((_, itemIndex) => itemIndex !== index), true)
  }

  const toggleSelection = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const item = itemsRef.current[index]
    if (!item) return

    if (event.shiftKey) {
      const rangeIds = resolveSelectionRange(itemsRef.current, selectionAnchorId, index)
      setSelectedIds(rangeIds)
      setSelectionAnchorId(current => current ?? item.id)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds(current => {
        const next = current.includes(item.id)
          ? current.filter(id => id !== item.id)
          : [...current, item.id]
        return next
      })
      setSelectionAnchorId(item.id)
      return
    }

    setSelectedIds(current => (current.length === 1 && current[0] === item.id ? current : [item.id]))
    setSelectionAnchorId(item.id)
  }

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const item = itemsRef.current[index]
    if (!item) return
    toggleSelection(index, event)
    if (event.shiftKey || event.ctrlKey || event.metaKey) return
    if (dragRef.current || (activeDragId !== null && activeDragId !== item.id)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      itemId: item.id,
      lastClientY: event.clientY,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
        setActiveDragId(item.id)
      }, 180),
    }
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.buttons !== 1) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    if (!drag.active) return
    event.preventDefault()
    event.stopPropagation()

    const dragGroupIds = resolveDragGroup(itemsRef.current, selectedIds, drag.itemId)
    const currentIndex = itemsRef.current.findIndex(item => item.id === drag.itemId)
    if (currentIndex < 0) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    drag.index = currentIndex

    const deltaY = event.clientY - drag.lastClientY
    if (Math.abs(deltaY) < 1) return

    const direction = deltaY > 0 ? 1 : -1
    const targetItem = resolveGroupBoundaryTarget(itemsRef.current, dragGroupIds, direction)
    if (!targetItem) {
      drag.lastClientY = event.clientY
      return
    }

    const targetElement = rowRefs.current.get(targetItem.id)
    if (!targetElement) {
      drag.lastClientY = event.clientY
      return
    }

    const targetRect = targetElement.getBoundingClientRect()
    const targetMiddle = targetRect.top + targetRect.height / 2
    const shouldReorder = direction > 0 ? event.clientY > targetMiddle : event.clientY < targetMiddle
    if (shouldReorder) {
      const nextItems = moveItemGroup(itemsRef.current, dragGroupIds, direction)
      commitItems(nextItems, true)
      drag.index = nextItems.findIndex(item => item.id === drag.itemId)
    }
    drag.lastClientY = event.clientY
  }

  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    window.clearTimeout(drag.timer)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setActiveDragId(null)
  }

  return (
    <div
      className="max-w-full"
      data-outline-target={outlineTargetId}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPresetOpen(false)
        }
      }}
    >
      <div className="flex min-h-[36px] max-w-full items-start justify-between gap-[12px]" style={{ width: maxWidth }}>
        <label
          className="block min-h-[36px] min-w-0 flex-1 leading-[36px]"
          style={{ fontFamily: font, fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {label}
        </label>
        <div className="relative flex shrink-0 items-start gap-[6px]">
          {presetOptions.length > 0 ? (
            <button
              type="button"
              onClick={() => setPresetOpen(current => !current)}
              className="flex h-[30px] items-center gap-[5px] rounded-[5px] border px-[8px] text-[14px] font-light leading-[30px] transition-colors hover:bg-[var(--dfw-control-hover)]"
              style={{
                borderColor: presetOpen ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                background: presetOpen ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                color: 'var(--dfw-text)',
                fontFamily: font,
              }}
              aria-expanded={presetOpen}
              aria-haspopup="listbox"
              aria-label={`${label}占位符`}
              title="占位符"
            >
              <span>占位符</span>
              <svg
                className="shrink-0 transition-transform duration-150"
                style={{ transform: presetOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}

          <button
            type="button"
            onClick={addItem}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
            style={{
              borderColor: 'var(--dfw-sidebar-border)',
              background: 'var(--dfw-sidebar-bg)',
              color: 'var(--dfw-text)',
            }}
            aria-label={`添加${label}`}
            title="添加"
          >
            <PlusGlyph />
          </button>
        </div>
      </div>

      {presetOpen && presetOptions.length > 0 ? (
        <div className="mt-[8px] flex max-w-full justify-end" style={{ width: maxWidth }}>
          <div
            className="max-h-[240px] overflow-auto rounded-[8px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
            style={{
              width: Math.min(330, Math.max(210, maxWidth - 42)),
              borderColor: 'var(--dfw-sidebar-border)',
              background: 'var(--dfw-sidebar-bg)',
              color: 'var(--dfw-text)',
              fontFamily: font,
            }}
            role="listbox"
          >
            {presetOptions.map(option => {
              const exists = presetValueExists(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => addPresetItem(option.value)}
                  className="flex min-h-[34px] w-full items-center gap-[8px] px-[10px] text-left text-[15px] font-light transition-colors hover:bg-[var(--dfw-control-hover)]"
                  style={{
                    background: exists ? 'var(--dfw-blue)' : 'transparent',
                    color: exists ? '#fff' : 'var(--dfw-text)',
                  }}
                  role="option"
                  aria-selected={exists}
                  title={exists ? '已存在于列表中' : option.value}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label ?? option.value}</span>
                  {exists || option.description ? (
                    <span className="shrink-0 text-[12px] opacity-75">{exists ? '已存在' : option.description}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-[8px] flex max-w-full flex-col gap-[8px]" style={{ width: maxWidth }}>
        {items.map((item, index) => {
          const focused = focusedIndex === index
          const selected = selectedIds.includes(item.id)
          const dragLocked = activeDragId !== null && activeDragId !== item.id
          return (
            <div
              key={item.id}
              ref={node => {
                if (node) rowRefs.current.set(item.id, node)
                else rowRefs.current.delete(item.id)
              }}
              data-array-list-index={index}
              data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}` : undefined}
              className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
              style={{
                width: maxWidth,
                borderColor: focused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                background: focused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                color: 'var(--dfw-text)',
              }}
            >
              <button
                type="button"
                disabled={dragLocked}
                className="flex min-h-[40px] w-[30px] shrink-0 cursor-grab select-none items-center justify-center rounded-l-[5px] text-[18px] active:cursor-grabbing"
                style={{
                  color: 'var(--dfw-outline-muted)',
                  opacity: dragLocked ? 0.38 : 1,
                  touchAction: 'none',
                }}
                onPointerDown={event => startDrag(index, event)}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                aria-label={`拖拽排序第${index + 1}条${itemAriaLabel ?? label}`}
                title="长按拖拽排序"
              >
                ⠿
              </button>
              <ArrayListInput
                value={item.value}
                onChange={nextValue => updateItem(index, nextValue)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(current => (current === index ? null : current))}
                ariaLabel={`${itemAriaLabel ?? label}${index + 1}`}
              />
              <button
                type="button"
                className="flex min-h-[40px] w-[30px] shrink-0 items-center justify-center rounded-r-[5px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{ color: 'var(--dfw-outline-muted)' }}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  deleteItem(index)
                }}
                aria-label={`删除第${index + 1}条${itemAriaLabel ?? label}`}
                title="删除"
              >
                <DeleteGlyph />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
function VersionFormattingRuleField({
  label,
  values,
  onChange,
  maxWidth,
  outlineTargetId,
}: {
  label: string
  values: WorkbenchVersionFormattingRule[]
  onChange: (values: WorkbenchVersionFormattingRule[]) => void
  maxWidth: number
  outlineTargetId?: string
}) {
  const [focusedCell, setFocusedCell] = useState<{ index: number; key: keyof WorkbenchVersionFormattingRule } | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [items, setItems] = useState<VersionFormattingRuleItem[]>(() => values.map(createVersionFormattingRuleItem))
  const itemsRef = useRef(items)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const previousRectsRef = useRef<Map<string, DOMRect> | null>(null)
  const dragRef = useRef<{ pointerId: number; index: number; itemId: string; lastClientY: number; active: boolean; timer: number } | null>(null)

  useEffect(() => {
    setItems(currentItems => {
      const currentValues = currentItems.map(item => item.value)
      if (formattingRulesEqual(currentValues, values)) return currentItems

      const nextItems = values.map((value, index) => ({
        id: currentItems[index]?.id ?? createVersionFormattingRuleItem(value).id,
        value: { match: value.match, replace: value.replace },
      }))
      itemsRef.current = nextItems
      setSelectedIds(current => clampSelectionIds(current, nextItems))
      setSelectionAnchorId(current => (current && nextItems.some(item => item.id === current) ? current : null))
      return nextItems
    })
  }, [values])

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current
    if (!previousRects) return

    for (const item of items) {
      const element = rowRefs.current.get(item.id)
      const previousRect = previousRects.get(item.id)
      if (!element || !previousRect) continue

      const currentRect = element.getBoundingClientRect()
      const deltaY = previousRect.top - currentRect.top
      if (Math.abs(deltaY) < 1) continue

      element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0)' },
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
      )
    }

    previousRectsRef.current = null
  }, [items])

  const captureRowRects = () => {
    const rects = new Map<string, DOMRect>()
    for (const item of itemsRef.current) {
      const element = rowRefs.current.get(item.id)
      if (element) rects.set(item.id, element.getBoundingClientRect())
    }
    previousRectsRef.current = rects
  }

  const commitItems = (nextItems: VersionFormattingRuleItem[], animate = false) => {
    if (animate) captureRowRects()
    itemsRef.current = nextItems
    setItems(nextItems)
    onChange(nextItems.map(item => item.value))
  }

  const addItem = () => {
    commitItems([...itemsRef.current, createVersionFormattingRuleItem({ match: '', replace: '' })], true)
  }

  const updateItem = (index: number, key: keyof WorkbenchVersionFormattingRule, nextValue: string) => {
    const nextItems = itemsRef.current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value: { ...item.value, [key]: nextValue } } : item
    ))
    commitItems(nextItems)
  }

  const deleteItem = (index: number) => {
    const deletedId = itemsRef.current[index]?.id
    setFocusedCell(current => {
      if (current === null) return null
      if (current.index === index) return null
      return current.index > index ? { ...current, index: current.index - 1 } : current
    })
    if (deletedId) {
      setSelectedIds(current => current.filter(id => id !== deletedId))
      setSelectionAnchorId(current => (current === deletedId ? null : current))
    }
    commitItems(itemsRef.current.filter((_, itemIndex) => itemIndex !== index), true)
  }

  const toggleSelection = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const item = itemsRef.current[index]
    if (!item) return

    if (event.shiftKey) {
      const rangeIds = resolveSelectionRange(itemsRef.current, selectionAnchorId, index)
      setSelectedIds(rangeIds)
      setSelectionAnchorId(current => current ?? item.id)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds(current => (
        current.includes(item.id)
          ? current.filter(id => id !== item.id)
          : [...current, item.id]
      ))
      setSelectionAnchorId(item.id)
      return
    }

    setSelectedIds(current => (current.length === 1 && current[0] === item.id ? current : [item.id]))
    setSelectionAnchorId(item.id)
  }

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const item = itemsRef.current[index]
    if (!item) return
    toggleSelection(index, event)
    if (event.shiftKey || event.ctrlKey || event.metaKey) return
    if (dragRef.current || (activeDragId !== null && activeDragId !== item.id)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      itemId: item.id,
      lastClientY: event.clientY,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
        setActiveDragId(item.id)
      }, 180),
    }
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.buttons !== 1) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    if (!drag.active) return
    event.preventDefault()
    event.stopPropagation()

    const dragGroupIds = resolveDragGroup(itemsRef.current, selectedIds, drag.itemId)
    const currentIndex = itemsRef.current.findIndex(item => item.id === drag.itemId)
    if (currentIndex < 0) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    drag.index = currentIndex

    const deltaY = event.clientY - drag.lastClientY
    if (Math.abs(deltaY) < 1) return

    const direction = deltaY > 0 ? 1 : -1
    const targetItem = resolveGroupBoundaryTarget(itemsRef.current, dragGroupIds, direction)
    if (!targetItem) {
      drag.lastClientY = event.clientY
      return
    }

    const targetElement = rowRefs.current.get(targetItem.id)
    if (!targetElement) {
      drag.lastClientY = event.clientY
      return
    }

    const targetRect = targetElement.getBoundingClientRect()
    const targetMiddle = targetRect.top + targetRect.height / 2
    const shouldReorder = direction > 0 ? event.clientY > targetMiddle : event.clientY < targetMiddle
    if (!shouldReorder) {
      drag.lastClientY = event.clientY
      return
    }

    const nextItems = moveItemGroup(itemsRef.current, dragGroupIds, direction)
    const targetIndex = nextItems.findIndex(item => item.id === drag.itemId)
    commitItems(nextItems, true)
    setFocusedCell(current => {
      if (current === null) return null
      const focusedId = itemsRef.current[current.index]?.id
      const nextIndex = focusedId ? nextItems.findIndex(item => item.id === focusedId) : -1
      return nextIndex >= 0 ? { ...current, index: nextIndex } : null
    })
    drag.index = targetIndex
    drag.lastClientY = event.clientY
  }

  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    window.clearTimeout(drag.timer)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setActiveDragId(null)
  }

  return (
    <div className="max-w-full" data-outline-target={outlineTargetId}>
      <div className="flex min-h-[36px] max-w-full items-start justify-between gap-[12px]" style={{ width: maxWidth }}>
        <label
          className="block min-h-[36px] min-w-0 flex-1 leading-[36px]"
          style={{ fontFamily: font, fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {label}
        </label>
        <button
          type="button"
          onClick={addItem}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
          }}
          aria-label={`添加${label}`}
          title="添加"
        >
          <PlusGlyph />
        </button>
      </div>

      <div className="mt-[8px] flex max-w-full flex-col gap-[8px]" style={{ width: maxWidth }}>
        {items.map((item, index) => {
          const matchFocused = focusedCell?.index === index && focusedCell.key === 'match'
          const replaceFocused = focusedCell?.index === index && focusedCell.key === 'replace'
          const selected = selectedIds.includes(item.id)
          const dragLocked = activeDragId !== null && activeDragId !== item.id
          const { leftWidth: matchWidth, rightWidth: replaceWidth } = resolveSplitTableCellWidths(
            item.value.match,
            item.value.replace,
            maxWidth,
            92,
            92,
          )

          return (
            <div
              key={item.id}
              ref={node => {
                if (node) rowRefs.current.set(item.id, node)
                else rowRefs.current.delete(item.id)
              }}
              data-formatting-rule-index={index}
              data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}` : undefined}
              style={{ width: maxWidth }}
              className="flex max-w-full items-stretch gap-[8px]"
            >
              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-match` : undefined}
                className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
                style={{
                  width: matchWidth,
                  borderColor: matchFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: matchFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  color: 'var(--dfw-text)',
                }}
              >
                <button
                  type="button"
                  disabled={dragLocked}
                  className="flex min-h-[40px] w-[30px] shrink-0 cursor-grab select-none items-center justify-center rounded-l-[5px] text-[18px] active:cursor-grabbing"
                  style={{
                    color: 'var(--dfw-outline-muted)',
                    opacity: dragLocked ? 0.38 : 1,
                    touchAction: 'none',
                  }}
                  onPointerDown={event => startDrag(index, event)}
                  onPointerMove={moveDrag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  aria-label={`拖拽排序第${index + 1}条${label}`}
                  title="长按拖拽排序"
                >
                  ⠿
                </button>
                <span
                  className="shrink-0 pl-[2px] pr-[6px] text-[16px] font-light leading-[40px]"
                  style={{ color: 'var(--dfw-outline-muted)', fontFamily: font }}
                >
                  匹配
                </span>
                <ArrayListInput
                  value={item.value.match}
                  onChange={nextValue => updateItem(index, 'match', nextValue)}
                  onFocus={() => setFocusedCell({ index, key: 'match' })}
                  onBlur={() => setFocusedCell(current => (
                    current?.index === index && current.key === 'match' ? null : current
                  ))}
                  ariaLabel={`匹配${index + 1}`}
                />
              </div>

              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-replace` : undefined}
                className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
                style={{
                  width: replaceWidth,
                  borderColor: replaceFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: replaceFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  color: 'var(--dfw-text)',
                }}
              >
                <span
                  className="shrink-0 pl-[10px] pr-[6px] text-[16px] font-light leading-[40px]"
                  style={{ color: 'var(--dfw-outline-muted)', fontFamily: font }}
                >
                  替换
                </span>
                <ArrayListInput
                  value={item.value.replace}
                  onChange={nextValue => updateItem(index, 'replace', nextValue)}
                  onFocus={() => setFocusedCell({ index, key: 'replace' })}
                  onBlur={() => setFocusedCell(current => (
                    current?.index === index && current.key === 'replace' ? null : current
                  ))}
                  ariaLabel={`替换${index + 1}`}
                />
                <button
                  type="button"
                  className="flex min-h-[40px] w-[30px] shrink-0 items-center justify-center rounded-r-[5px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                  style={{ color: 'var(--dfw-outline-muted)' }}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => {
                    event.stopPropagation()
                    deleteItem(index)
                  }}
                  aria-label={`删除第${index + 1}条${label}`}
                  title="删除"
                >
                  <DeleteGlyph />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EnvVariableTableField({
  label,
  values,
  onChange,
  maxWidth,
  presetOptions = [],
  outlineTargetId,
}: {
  label: string
  values: WorkbenchEnvVariableEntry[]
  onChange: (values: WorkbenchEnvVariableEntry[]) => void
  maxWidth: number
  presetOptions?: ArrayListPresetOption[]
  outlineTargetId?: string
}) {
  const [focusedCell, setFocusedCell] = useState<{ index: number; key: keyof WorkbenchEnvVariableEntry } | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const [items, setItems] = useState<EnvVariableEntryItem[]>(() => normalizeEnvVariableEntries(values).map(createEnvVariableEntryItem))
  const itemsRef = useRef(items)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const previousRectsRef = useRef<Map<string, DOMRect> | null>(null)
  const dragRef = useRef<{ pointerId: number; index: number; itemId: string; lastClientY: number; active: boolean; timer: number } | null>(null)

  useEffect(() => {
    setItems(currentItems => {
      const currentValues = currentItems.map(item => item.value)
      const nextValues = normalizeEnvVariableEntries(values)
      if (envVariableEntriesEqual(currentValues, nextValues)) return currentItems

      const nextItems = nextValues.map((value, index) => ({
        id: currentItems[index]?.id ?? createEnvVariableEntryItem(value).id,
        value: { name: value.name, value: value.value },
      }))
      itemsRef.current = nextItems
      setSelectedIds(current => clampSelectionIds(current, nextItems))
      setSelectionAnchorId(current => (current && nextItems.some(item => item.id === current) ? current : null))
      return nextItems
    })
  }, [values])

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current
    if (!previousRects) return

    for (const item of items) {
      const element = rowRefs.current.get(item.id)
      const previousRect = previousRects.get(item.id)
      if (!element || !previousRect) continue

      const currentRect = element.getBoundingClientRect()
      const deltaY = previousRect.top - currentRect.top
      if (Math.abs(deltaY) < 1) continue

      element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0)' },
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
      )
    }

    previousRectsRef.current = null
  }, [items])

  const captureRowRects = () => {
    const rects = new Map<string, DOMRect>()
    for (const item of itemsRef.current) {
      const element = rowRefs.current.get(item.id)
      if (element) rects.set(item.id, element.getBoundingClientRect())
    }
    previousRectsRef.current = rects
  }

  const commitItems = (nextItems: EnvVariableEntryItem[], animate = false) => {
    if (animate) captureRowRects()
    itemsRef.current = nextItems
    setItems(nextItems)
    onChange(nextItems.map(item => item.value))
  }

  const addItem = () => {
    commitItems([...itemsRef.current, createEnvVariableEntryItem({ name: '', value: '' })], true)
  }

  const presetValueExists = (option: ArrayListPresetOption) => {
    const optionName = option.name ?? extractEnvNameFromString(option.value) ?? ''
    return itemsRef.current.some(item => (
      item.value.value === option.value
      || item.value.value.includes(option.value)
      || (optionName !== '' && item.value.name === optionName)
    ))
  }

  const addPresetItem = (option: ArrayListPresetOption) => {
    commitItems([
      ...itemsRef.current,
      createEnvVariableEntryItem({ name: option.name ?? '', value: option.value }),
    ], true)
    setPresetOpen(false)
  }

  const updateItem = (index: number, key: keyof WorkbenchEnvVariableEntry, nextValue: string) => {
    const nextItems = itemsRef.current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value: { ...item.value, [key]: nextValue } } : item
    ))
    commitItems(nextItems)
  }

  const deleteItem = (index: number) => {
    const deletedId = itemsRef.current[index]?.id
    setFocusedCell(current => {
      if (current === null) return null
      if (current.index === index) return null
      return current.index > index ? { ...current, index: current.index - 1 } : current
    })
    if (deletedId) {
      setSelectedIds(current => current.filter(id => id !== deletedId))
      setSelectionAnchorId(current => (current === deletedId ? null : current))
    }
    commitItems(itemsRef.current.filter((_, itemIndex) => itemIndex !== index), true)
  }

  const toggleSelection = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const item = itemsRef.current[index]
    if (!item) return

    if (event.shiftKey) {
      const rangeIds = resolveSelectionRange(itemsRef.current, selectionAnchorId, index)
      setSelectedIds(rangeIds)
      setSelectionAnchorId(current => current ?? item.id)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds(current => (
        current.includes(item.id)
          ? current.filter(id => id !== item.id)
          : [...current, item.id]
      ))
      setSelectionAnchorId(item.id)
      return
    }

    setSelectedIds(current => (current.length === 1 && current[0] === item.id ? current : [item.id]))
    setSelectionAnchorId(item.id)
  }

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const item = itemsRef.current[index]
    if (!item) return
    toggleSelection(index, event)
    if (event.shiftKey || event.ctrlKey || event.metaKey) return
    if (dragRef.current || (activeDragId !== null && activeDragId !== item.id)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      itemId: item.id,
      lastClientY: event.clientY,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
        setActiveDragId(item.id)
      }, 180),
    }
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.buttons !== 1) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    if (!drag.active) return
    event.preventDefault()
    event.stopPropagation()

    const dragGroupIds = resolveDragGroup(itemsRef.current, selectedIds, drag.itemId)
    const currentIndex = itemsRef.current.findIndex(item => item.id === drag.itemId)
    if (currentIndex < 0) {
      window.clearTimeout(drag.timer)
      dragRef.current = null
      setActiveDragId(null)
      return
    }
    drag.index = currentIndex

    const deltaY = event.clientY - drag.lastClientY
    if (Math.abs(deltaY) < 1) return

    const direction = deltaY > 0 ? 1 : -1
    const targetItem = resolveGroupBoundaryTarget(itemsRef.current, dragGroupIds, direction)
    if (!targetItem) {
      drag.lastClientY = event.clientY
      return
    }

    const targetElement = rowRefs.current.get(targetItem.id)
    if (!targetElement) {
      drag.lastClientY = event.clientY
      return
    }

    const targetRect = targetElement.getBoundingClientRect()
    const targetMiddle = targetRect.top + targetRect.height / 2
    const shouldReorder = direction > 0 ? event.clientY > targetMiddle : event.clientY < targetMiddle
    if (!shouldReorder) {
      drag.lastClientY = event.clientY
      return
    }

    const nextItems = moveItemGroup(itemsRef.current, dragGroupIds, direction)
    const targetIndex = nextItems.findIndex(item => item.id === drag.itemId)
    commitItems(nextItems, true)
    setFocusedCell(current => {
      if (current === null) return null
      const focusedId = itemsRef.current[current.index]?.id
      const nextIndex = focusedId ? nextItems.findIndex(item => item.id === focusedId) : -1
      return nextIndex >= 0 ? { ...current, index: nextIndex } : null
    })
    drag.index = targetIndex
    drag.lastClientY = event.clientY
  }

  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    window.clearTimeout(drag.timer)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setActiveDragId(null)
  }

  return (
    <div
      className="max-w-full"
      data-outline-target={outlineTargetId}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPresetOpen(false)
        }
      }}
    >
      <div className="flex min-h-[36px] max-w-full items-start justify-between gap-[12px]" style={{ width: maxWidth }}>
        <label
          className="block min-h-[36px] min-w-0 flex-1 leading-[36px]"
          style={{ fontFamily: font, fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {label}
        </label>
        <div className="relative flex shrink-0 items-start gap-[6px]">
          {presetOptions.length > 0 ? (
            <button
              type="button"
              onClick={() => setPresetOpen(current => !current)}
              className="flex h-[30px] items-center gap-[5px] rounded-[5px] border px-[8px] text-[14px] font-light leading-[30px] transition-colors hover:bg-[var(--dfw-control-hover)]"
              style={{
                borderColor: presetOpen ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                background: presetOpen ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                color: 'var(--dfw-text)',
                fontFamily: font,
              }}
              aria-expanded={presetOpen}
              aria-haspopup="listbox"
              aria-label={`${label}占位符`}
              title="占位符"
            >
              <span>占位符</span>
              <svg
                className="shrink-0 transition-transform duration-150"
                style={{ transform: presetOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}

          <button
            type="button"
            onClick={addItem}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
            style={{
              borderColor: 'var(--dfw-sidebar-border)',
              background: 'var(--dfw-sidebar-bg)',
              color: 'var(--dfw-text)',
            }}
            aria-label={`添加${label}`}
            title="添加"
          >
            <PlusGlyph />
          </button>
        </div>
      </div>

      {presetOpen && presetOptions.length > 0 ? (
        <div className="mt-[8px] flex max-w-full justify-end" style={{ width: maxWidth }}>
          <div
            className="max-h-[240px] overflow-auto rounded-[8px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
            style={{
              width: Math.min(330, Math.max(210, maxWidth - 42)),
              borderColor: 'var(--dfw-sidebar-border)',
              background: 'var(--dfw-sidebar-bg)',
              color: 'var(--dfw-text)',
              fontFamily: font,
            }}
            role="listbox"
          >
            {presetOptions.map(option => {
              const exists = presetValueExists(option)
              return (
                <button
                  key={`${option.name ?? ''}-${option.value}`}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => addPresetItem(option)}
                  className="flex min-h-[34px] w-full items-center gap-[8px] px-[10px] text-left text-[15px] font-light transition-colors hover:bg-[var(--dfw-control-hover)]"
                  style={{
                    background: exists ? 'var(--dfw-blue)' : 'transparent',
                    color: exists ? '#fff' : 'var(--dfw-text)',
                  }}
                  role="option"
                  aria-selected={exists}
                  title={exists ? '已存在于列表中' : option.value}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label ?? option.value}</span>
                  {exists || option.description ? (
                    <span className="shrink-0 text-[12px] opacity-75">{exists ? '已存在' : option.description}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-[8px] flex max-w-full flex-col gap-[8px]" style={{ width: maxWidth }}>
        {items.map((item, index) => {
          const nameFocused = focusedCell?.index === index && focusedCell.key === 'name'
          const valueFocused = focusedCell?.index === index && focusedCell.key === 'value'
          const selected = selectedIds.includes(item.id)
          const dragLocked = activeDragId !== null && activeDragId !== item.id
          const { leftWidth: nameWidth, rightWidth: valueWidth } = resolveSplitTableCellWidths(
            item.value.name,
            item.value.value,
            maxWidth,
            76,
            70,
          )

          return (
            <div
              key={item.id}
              ref={node => {
                if (node) rowRefs.current.set(item.id, node)
                else rowRefs.current.delete(item.id)
              }}
              data-env-variable-entry-index={index}
              data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}` : undefined}
              style={{ width: maxWidth }}
              className="flex max-w-full items-stretch gap-[8px]"
            >
              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-name` : undefined}
                className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
                style={{
                  width: nameWidth,
                  borderColor: nameFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: nameFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  color: 'var(--dfw-text)',
                }}
              >
                <button
                  type="button"
                  disabled={dragLocked}
                  className="flex min-h-[40px] w-[30px] shrink-0 cursor-grab select-none items-center justify-center rounded-l-[5px] text-[18px] active:cursor-grabbing"
                  style={{
                    color: 'var(--dfw-outline-muted)',
                    opacity: dragLocked ? 0.38 : 1,
                    touchAction: 'none',
                  }}
                  onPointerDown={event => startDrag(index, event)}
                  onPointerMove={moveDrag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  aria-label={`拖拽排序第${index + 1}条${label}`}
                  title="长按拖拽排序"
                >
                  ⠿
                </button>
                <span
                  className="shrink-0 pl-[2px] pr-[6px] text-[16px] font-light leading-[40px]"
                  style={{ color: 'var(--dfw-outline-muted)', fontFamily: font }}
                >
                  键
                </span>
                <ArrayListInput
                  value={item.value.name}
                  onChange={nextValue => updateItem(index, 'name', nextValue)}
                  onFocus={() => setFocusedCell({ index, key: 'name' })}
                  onBlur={() => setFocusedCell(current => (
                    current?.index === index && current.key === 'name' ? null : current
                  ))}
                  ariaLabel={`键${index + 1}`}
                />
              </div>

              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-value` : undefined}
                className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
                style={{
                  width: valueWidth,
                  borderColor: valueFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: valueFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  color: 'var(--dfw-text)',
                }}
              >
                <span
                  className="shrink-0 pl-[10px] pr-[6px] text-[16px] font-light leading-[40px]"
                  style={{ color: 'var(--dfw-outline-muted)', fontFamily: font }}
                >
                  值
                </span>
                <ArrayListInput
                  value={item.value.value}
                  onChange={nextValue => updateItem(index, 'value', nextValue)}
                  onFocus={() => setFocusedCell({ index, key: 'value' })}
                  onBlur={() => setFocusedCell(current => (
                    current?.index === index && current.key === 'value' ? null : current
                  ))}
                  ariaLabel={`值${index + 1}`}
                />
                <button
                  type="button"
                  className="flex min-h-[40px] w-[30px] shrink-0 items-center justify-center rounded-r-[5px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                  style={{ color: 'var(--dfw-outline-muted)' }}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => {
                    event.stopPropagation()
                    deleteItem(index)
                  }}
                  aria-label={`删除第${index + 1}条${label}`}
                  title="删除"
                >
                  <DeleteGlyph />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeployMetaEditor({
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

function ConfigMetaEditor({
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

function ConfigItemMetaEditor({
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

function LaunchMetaEditor({
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

function LaunchItemMetaEditor({
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

function UninstallMetaEditor({
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

function UninstallItemMetaEditor({
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

function DeploymentMetaEditor({
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
  deploymentEnvOutputOptions: ArrayListPresetOption[]
  deploymentEnvInputOptions: ArrayListPresetOption[]
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
export default function WorkbenchRightSidebar({
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
}: WorkbenchRightSidebarProps) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const focusAnimationRef = useRef<Animation | null>(null)
  const fieldAvailableWidth = Math.max(fieldMinWidth, Math.min(fieldMaxWidth, width - 40))

  const updateMeta = (patch: Partial<WorkbenchModInfoMeta>) => {
    onMetaPatch?.(patch)
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
  const builtinEnvNames = ['nickname', 'serial_number']
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
  const selectedFile = selectedFileId ? meta.files.find(f => f.id === selectedFileId) ?? null : null
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
                        <ArrayListField
                          label="自定义安装规则"
                          values={component.installCustomList}
                          outlineTargetId={componentOutlineTarget('install-custom-list')}
                          onChange={installCustomList => updateComponent({ installCustomList })}
                          maxWidth={fieldAvailableWidth}
                          itemAriaLabel="自定义安装规则"
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
