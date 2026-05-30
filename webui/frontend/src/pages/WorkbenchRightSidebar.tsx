import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { WorkbenchBlockId, WorkbenchComponentMeta } from './workbench-canvas/types'

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
const platformOptions = ['windows', 'linux', 'macos']
const commandThemeOptions = ['oh-my-push', 'classical']
const getMethodOptions = ['direct', 'get_version', 'get_link']
const getVersionOptions = ['github_repo', 'filelink', 'custom']
const getLinkOptions = ['filelink', 'custom', 'user_input']
const installOperateOptions = ['auto', 'no', 'custom']

let denoPermissionItemId = 0

export interface WorkbenchModInfoMeta {
  author: string
  tags: string[]
  description: string
  modId: string
  modName: string
  version: string
  minVersion: string
  maxVersion: string
  fileImport: boolean | null
  fileImportList: string[]
  runtime: string
  denoNet: boolean | null
  denoRead: boolean | null
  denoWrite: boolean | null
  denoEnv: boolean | null
  denoRun: boolean | null
  denoHrtime: boolean | null
  denoFfi: boolean | null
  denoSys: boolean | null
  denoAll: boolean | null
  denoCustomPermissions: boolean | null
  denoPermissionList: string[]
  platforms: string[]
  schemaVersion: string
  componentsEnvOutput: boolean | null
  componentsEnvInput: boolean | null
  componentsList: string[]
  component: WorkbenchComponentMeta
}

const emptyComponentMeta: WorkbenchComponentMeta = {
  name: '',
  id: '',
  choose: null,
  runtime: '',
  commandTheme: '',
  install: null,
  check: null,
  checkCommand: [],
  checkVersionContains: [],
  checkVersionRegex: [],
  commandInstall: null,
  installCommandList: [],
  getMethod: '',
  directLink: '',
  getVersion: '',
  githubRepo: '',
  getLink: '',
  getLinkProvideList: [],
  userChoose: null,
  chooseList: [],
  formatVersion: null,
  versionFormattingFormula: [],
  installOperate: '',
  installCustomList: [],
  installPath: '',
  customPath: '',
  splicingLink: '',
  beforeCommand: null,
  beforeCommandList: [],
  afterCommand: null,
  afterCommandList: [],
  envOutput: null,
  envOutputList: [],
  envInput: null,
  envInputList: [],
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
  fileImport: null,
  fileImportList: [],
  runtime: 'powershell',
  denoNet: null,
  denoRead: null,
  denoWrite: null,
  denoEnv: null,
  denoRun: null,
  denoHrtime: null,
  denoFfi: null,
  denoSys: null,
  denoAll: null,
  denoCustomPermissions: null,
  denoPermissionList: [],
  platforms: [],
  schemaVersion: '',
  componentsEnvOutput: null,
  componentsEnvInput: null,
  componentsList: [],
  component: emptyComponentMeta,
}

export interface WorkbenchRightSidebarProps {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  selectedName?: string
  selectedBlockId?: WorkbenchBlockId | null
  meta?: WorkbenchModInfoMeta
  onMetaPatch?: (patch: Partial<WorkbenchModInfoMeta>) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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

function parseTags(value: string) {
  return value
    .split('#')
    .map(tag => tag.trim())
    .filter(Boolean)
}

function formatTagInput(tags: string[]) {
  return tags.length ? `#${tags.join(' #')}` : ''
}

function parseLineList(value: string) {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function formatLineList(values: string[]) {
  return values.join('\n')
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
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

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="block h-[36px] leading-[36px]" style={{ fontFamily: font, fontSize: 30, fontWeight: 600 }}>
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
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === true}
      onClick={() => onChange(value === true ? false : true)}
      className="flex h-[42px] w-[142px] items-center rounded-[21px] border px-[5px] transition-colors"
      style={{
        borderColor: value === true ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
        background: value === true ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
        fontFamily: font,
      }}
      title={value === null ? '未设置' : value ? '已启用' : '已关闭'}
    >
      <span
        className="h-[30px] w-[30px] rounded-full border transition-transform duration-150 ease-out"
        style={{
          transform: value === true ? 'translateX(96px)' : 'translateX(0)',
          borderColor: value === true ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
          background: value === true ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-bg)',
        }}
        aria-hidden
      />
    </button>
  )
}

function RuntimeSelectField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const options = ['', ...runtimeOptions]
  const displayValue = value || '空白'

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

      {open && (
        <div
          className="absolute left-0 top-[48px] z-40 w-full overflow-hidden rounded-[14px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
            fontFamily: font,
          }}
          role="listbox"
        >
          {options.map(option => {
            const selected = option === value
            return (
              <button
                key={option || 'empty'}
                type="button"
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
                {option || '空白'}
              </button>
            )
          })}
        </div>
      )}
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
  const allOptions = ['', ...options]
  const displayValue = value || '空白'

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

      {open && (
        <div
          className="absolute left-0 top-[48px] z-40 w-full overflow-hidden rounded-[14px] border py-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
            fontFamily: font,
          }}
          role="listbox"
        >
          {allOptions.map(option => {
            const selected = option === value
            return (
              <button
                key={option || 'empty'}
                type="button"
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
                {option || '空白'}
              </button>
            )
          })}
        </div>
      )}
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
        marginBottom: show ? 0 : -18,
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

function PlatformPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const togglePlatform = (platform: string) => {
    onChange(value.includes(platform)
      ? value.filter(item => item !== platform)
      : [...value, platform])
  }

  return (
    <div className="flex max-w-full flex-wrap gap-[8px]">
      {platformOptions.map(platform => {
        const selected = value.includes(platform)
        return (
          <button
            key={platform}
            type="button"
            onClick={() => togglePlatform(platform)}
            className="h-[34px] rounded-[17px] border px-[12px] text-[18px] font-light leading-[32px] transition-colors hover:bg-[var(--dfw-control-hover)]"
            style={{
              borderColor: selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
              background: selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
              fontFamily: font,
            }}
          >
            {platform}
          </button>
        )
      })}
    </div>
  )
}

function ValueChips({ values }: { values: string[] }) {
  if (!values.length) return null

  return (
    <div className="mt-[10px] flex max-w-[553px] flex-wrap gap-[8px]">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="h-[30px] max-w-[180px] overflow-hidden whitespace-nowrap rounded-[5px] border px-[6px] text-[20px] font-light leading-[28px]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            fontFamily: font,
          }}
          title={value}
        >
          {value}
        </span>
      ))}
    </div>
  )
}

function LineListField({
  values,
  onChange,
  maxWidth,
  ariaLabel,
}: {
  values: string[]
  onChange: (values: string[]) => void
  maxWidth: number
  ariaLabel: string
}) {
  const [input, setInput] = useState(formatLineList(values))

  useEffect(() => {
    if (!arraysEqual(parseLineList(input), values)) {
      setInput(formatLineList(values))
    }
  }, [values])

  const updateInput = (value: string) => {
    setInput(value)
    onChange(parseLineList(value))
  }

  return (
    <AutoGrowTextField
      value={input}
      onChange={updateInput}
      allowLineBreaks
      maxWidth={maxWidth}
      ariaLabel={ariaLabel}
    />
  )
}

interface DenoPermissionItem {
  id: string
  value: string
}

function createDenoPermissionItem(value: string): DenoPermissionItem {
  denoPermissionItemId += 1
  return { id: `deno-permission-${denoPermissionItemId}`, value }
}

function reorderItems<T>(values: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return values
  const next = [...values]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
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

function DenoPermissionInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  ariaLabel: string
}) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textArea = textAreaRef.current
    if (!textArea) return
    textArea.style.height = 'auto'
    textArea.style.height = `${Math.max(30, textArea.scrollHeight)}px`
  }, [value])

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
      className="min-h-[30px] min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[5px] pr-[8px] text-[18px] font-light leading-[24px] outline-none"
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

function DenoPermissionListField({
  values,
  onChange,
  maxWidth,
}: {
  values: string[]
  onChange: (values: string[]) => void
  maxWidth: number
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [items, setItems] = useState<DenoPermissionItem[]>(() => values.map(createDenoPermissionItem))
  const itemsRef = useRef(items)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const previousRectsRef = useRef<Map<string, DOMRect> | null>(null)
  const dragRef = useRef<{ pointerId: number; index: number; active: boolean; timer: number } | null>(null)

  useEffect(() => {
    setItems(currentItems => {
      const currentValues = currentItems.map(item => item.value)
      if (arraysEqual(currentValues, values)) return currentItems

      const nextItems = values.map((value, index) => ({
        id: currentItems[index]?.id ?? createDenoPermissionItem(value),
        value,
      }))
      itemsRef.current = nextItems
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

  const commitItems = (nextItems: DenoPermissionItem[], animate = false) => {
    if (animate) captureRowRects()
    itemsRef.current = nextItems
    setItems(nextItems)
    onChange(nextItems.map(item => item.value))
  }

  const addPermission = () => {
    commitItems([...itemsRef.current, createDenoPermissionItem('')], true)
  }

  const updatePermission = (index: number, nextValue: string) => {
    const nextItems = itemsRef.current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value: nextValue } : item
    ))
    commitItems(nextItems)
  }

  const deletePermission = (index: number) => {
    setFocusedIndex(current => {
      if (current === null) return null
      if (current === index) return null
      return current > index ? current - 1 : current
    })
    commitItems(itemsRef.current.filter((_, itemIndex) => itemIndex !== index), true)
  }

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      active: false,
      timer: window.setTimeout(() => {
        if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
        dragRef.current.active = true
      }, 180),
    }
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !drag.active) return
    event.preventDefault()
    event.stopPropagation()

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-deno-permission-index]')
    if (!target) return

    const targetIndex = Number(target.dataset.denoPermissionIndex)
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= itemsRef.current.length) return
    if (targetIndex === drag.index) return

    commitItems(reorderItems(itemsRef.current, drag.index, targetIndex), true)
    drag.index = targetIndex
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
  }

  return (
    <div className="max-w-full">
      <div className="flex h-[36px] max-w-full items-center justify-between" style={{ width: maxWidth }}>
        <label className="block h-[36px] leading-[36px]" style={{ fontFamily: font, fontSize: 30, fontWeight: 600 }}>
          Deno自定义权限列表
        </label>
        <button
          type="button"
          onClick={addPermission}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{
            borderColor: 'var(--dfw-sidebar-border)',
            background: 'var(--dfw-sidebar-bg)',
            color: 'var(--dfw-text)',
          }}
          aria-label="添加Deno权限参数"
          title="添加Deno权限参数"
        >
          <PlusGlyph />
        </button>
      </div>

      <div className="mt-[8px] flex max-w-full flex-col gap-[8px]" style={{ width: maxWidth }}>
        {items.map((item, index) => {
          const focused = focusedIndex === index
          return (
            <div
              key={item.id}
              ref={node => {
                if (node) rowRefs.current.set(item.id, node)
                else rowRefs.current.delete(item.id)
              }}
              data-deno-permission-index={index}
              className="flex max-w-full items-start rounded-[5px] border transition-[border-color,background-color] duration-150"
              style={{
                borderColor: focused ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                background: focused ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                color: 'var(--dfw-text)',
              }}
            >
              <button
                type="button"
                className="flex min-h-[40px] w-[30px] shrink-0 cursor-grab select-none items-center justify-center rounded-l-[5px] text-[18px] active:cursor-grabbing"
                style={{ color: 'var(--dfw-outline-muted)', touchAction: 'none' }}
                onPointerDown={event => startDrag(index, event)}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                aria-label={`拖拽排序第${index + 1}条Deno权限参数`}
                title="长按拖拽排序"
              >
                ⠿
              </button>
              <DenoPermissionInput
                value={item.value}
                onChange={nextValue => updatePermission(index, nextValue)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(current => (current === index ? null : current))}
                ariaLabel={`Deno权限参数${index + 1}`}
              />
              <button
                type="button"
                className="flex min-h-[40px] w-[30px] shrink-0 items-center justify-center rounded-r-[5px] transition-colors hover:bg-[var(--dfw-control-hover)]"
                style={{ color: 'var(--dfw-outline-muted)' }}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  deletePermission(index)
                }}
                aria-label={`删除第${index + 1}条Deno权限参数`}
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

export default function WorkbenchRightSidebar({
  collapsed,
  width,
  onToggleCollapsed,
  onResize,
  selectedName = '初始化块',
  selectedBlockId = 'init',
  meta = emptyModInfoMeta,
  onMetaPatch,
}: WorkbenchRightSidebarProps) {
  const [tagInput, setTagInput] = useState(formatTagInput(meta.tags))
  const [fileImportListInput, setFileImportListInput] = useState(formatLineList(meta.fileImportList))
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const fieldAvailableWidth = Math.max(fieldMinWidth, Math.min(fieldMaxWidth, width - 40))

  useEffect(() => {
    if (!arraysEqual(parseTags(tagInput), meta.tags)) {
      setTagInput(formatTagInput(meta.tags))
    }
  }, [meta.tags])

  useEffect(() => {
    if (!arraysEqual(parseLineList(fileImportListInput), meta.fileImportList)) {
      setFileImportListInput(formatLineList(meta.fileImportList))
    }
  }, [meta.fileImportList])

  const updateMeta = (patch: Partial<WorkbenchModInfoMeta>) => {
    onMetaPatch?.(patch)
  }

  const commitTags = () => {
    const parsedTags = parseTags(tagInput)
    updateMeta({ tags: parsedTags })
  }

  const updateTagInput = (value: string) => {
    setTagInput(value)
    updateMeta({ tags: parseTags(value) })
  }

  const commitFileImportList = () => {
    updateMeta({ fileImportList: parseLineList(fileImportListInput) })
  }

  const updateFileImportListInput = (value: string) => {
    setFileImportListInput(value)
    updateMeta({ fileImportList: parseLineList(value) })
  }

  const component = meta.component ?? emptyComponentMeta
  const updateComponent = (patch: Partial<WorkbenchComponentMeta>) => {
    updateMeta({ component: { ...component, ...patch } })
  }

  const updateComponentId = (id: string) => {
    const previousId = component.id
    const nextList = meta.componentsList.length === 0
      ? (id ? [id] : [])
      : meta.componentsList
        .map(item => (item === previousId ? id : item))
        .filter(Boolean)
    updateMeta({
      component: { ...component, id },
      componentsList: arraysEqual(nextList, meta.componentsList) ? meta.componentsList : nextList,
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

      <div className="absolute left-[19.5px] right-[20.5px] top-[102px] bottom-[24px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shouldShowInitMeta ? (
        <div className="flex min-h-[1660px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
          <section>
            <FieldLabel>模版作者</FieldLabel>
            <AutoGrowTextField
              value={meta.author}
              onChange={author => updateMeta({ author })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="作者"
            />
          </section>

          <section>
            <FieldLabel>模版标签</FieldLabel>
            <AutoGrowTextField
              value={tagInput}
              onChange={updateTagInput}
              onCommit={commitTags}
              maxWidth={fieldAvailableWidth}
              ariaLabel="标签"
            />
            <ValueChips values={meta.tags} />
          </section>

          <section>
            <FieldLabel>模版描述</FieldLabel>
            <AutoGrowTextField
              value={meta.description}
              onChange={description => updateMeta({ description })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模板描述"
            />
          </section>

          <section>
            <FieldLabel>模版唯一ID</FieldLabel>
            <AutoGrowTextField
              value={meta.modId}
              onChange={modId => updateMeta({ modId })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版ID"
            />
          </section>

          <section>
            <FieldLabel>模版显示名称</FieldLabel>
            <AutoGrowTextField
              value={meta.modName}
              onChange={modName => updateMeta({ modName })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版名称"
            />
          </section>

          <section>
            <FieldLabel>模版版本</FieldLabel>
            <AutoGrowTextField
              value={meta.version}
              onChange={version => updateMeta({ version })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="模版版本"
            />
          </section>

          <section>
            <FieldLabel>最低支持版本</FieldLabel>
            <AutoGrowTextField
              value={meta.minVersion}
              onChange={minVersion => updateMeta({ minVersion })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="最低支持版本"
            />
          </section>

          <section>
            <FieldLabel>最高支持版本</FieldLabel>
            <AutoGrowTextField
              value={meta.maxVersion}
              onChange={maxVersion => updateMeta({ maxVersion })}
              maxWidth={fieldAvailableWidth}
              ariaLabel="最高支持版本"
            />
          </section>

          <section>
            <FieldLabel>启用文件导入</FieldLabel>
            <BooleanSwitchField
              value={meta.fileImport}
              onChange={fileImport => updateMeta({ fileImport })}
            />
          </section>

          <ConditionalField show={meta.fileImport === true}>
            <section>
              <FieldLabel>文件导入列表</FieldLabel>
              <AutoGrowTextField
                value={fileImportListInput}
                onChange={updateFileImportListInput}
                onCommit={commitFileImportList}
                allowLineBreaks
                maxWidth={fieldAvailableWidth}
                ariaLabel="文件导入列表"
              />
              <ValueChips values={meta.fileImportList} />
            </section>
          </ConditionalField>

          <section>
            <FieldLabel>运行时环境</FieldLabel>
            <RuntimeSelectField
              value={meta.runtime}
              onChange={runtime => updateMeta({ runtime })}
            />
          </section>

          <ConditionalField show={meta.runtime === 'deno'}>
            <div className="flex flex-col gap-[18px]">
              <section>
                <FieldLabel>Deno网络权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoNet}
                  onChange={denoNet => updateMeta({ denoNet })}
                />
              </section>

              <section>
                <FieldLabel>Deno读取权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoRead}
                  onChange={denoRead => updateMeta({ denoRead })}
                />
              </section>

              <section>
                <FieldLabel>Deno写入权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoWrite}
                  onChange={denoWrite => updateMeta({ denoWrite })}
                />
              </section>

              <section>
                <FieldLabel>Deno环境变量权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoEnv}
                  onChange={denoEnv => updateMeta({ denoEnv })}
                />
              </section>

              <section>
                <FieldLabel>Deno子进程权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoRun}
                  onChange={denoRun => updateMeta({ denoRun })}
                />
              </section>

              <section>
                <FieldLabel>Deno高精度时间权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoHrtime}
                  onChange={denoHrtime => updateMeta({ denoHrtime })}
                />
              </section>

              <section>
                <FieldLabel>Deno动态库权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoFfi}
                  onChange={denoFfi => updateMeta({ denoFfi })}
                />
              </section>

              <section>
                <FieldLabel>Deno系统信息权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoSys}
                  onChange={denoSys => updateMeta({ denoSys })}
                />
              </section>

              <section>
                <FieldLabel>Deno全部权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoAll}
                  onChange={denoAll => updateMeta({ denoAll })}
                />
              </section>

              <section>
                <FieldLabel>自定义Deno权限</FieldLabel>
                <BooleanSwitchField
                  value={meta.denoCustomPermissions}
                  onChange={denoCustomPermissions => updateMeta({ denoCustomPermissions })}
                />
              </section>

              <ConditionalField show={meta.denoCustomPermissions === true}>
                <section>
                  <DenoPermissionListField
                    values={meta.denoPermissionList}
                    onChange={denoPermissionList => updateMeta({ denoPermissionList })}
                    maxWidth={fieldAvailableWidth}
                  />
                </section>
              </ConditionalField>
            </div>
          </ConditionalField>

          <section>
            <FieldLabel>平台限制</FieldLabel>
            <PlatformPicker
              value={meta.platforms}
              onChange={platforms => updateMeta({ platforms })}
            />
          </section>

          <section>
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
          <div className="flex min-h-[3600px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
            <section>
              <FieldLabel>[COMPONENTS] 环境变量导出</FieldLabel>
              <BooleanSwitchField
                value={meta.componentsEnvOutput}
                onChange={componentsEnvOutput => updateMeta({ componentsEnvOutput })}
              />
            </section>

            <section>
              <FieldLabel>[COMPONENTS] 环境变量导入</FieldLabel>
              <BooleanSwitchField
                value={meta.componentsEnvInput}
                onChange={componentsEnvInput => updateMeta({ componentsEnvInput })}
              />
            </section>

            <section>
              <FieldLabel>组件ID列表</FieldLabel>
              <LineListField
                values={meta.componentsList}
                onChange={componentsList => updateMeta({ componentsList })}
                maxWidth={fieldAvailableWidth}
                ariaLabel="组件ID列表"
              />
              <ValueChips values={meta.componentsList} />
            </section>

            <section>
              <FieldLabel>组件名称</FieldLabel>
              <AutoGrowTextField
                value={component.name}
                onChange={name => updateComponent({ name })}
                maxWidth={fieldAvailableWidth}
                ariaLabel="组件名称"
              />
            </section>

            <section>
              <FieldLabel>组件ID</FieldLabel>
              <AutoGrowTextField
                value={component.id}
                onChange={updateComponentId}
                maxWidth={fieldAvailableWidth}
                ariaLabel="组件ID"
              />
            </section>

            <section>
              <FieldLabel>需要安装</FieldLabel>
              <BooleanSwitchField
                value={component.install}
                onChange={install => updateComponent({ install })}
              />
            </section>

            <ConditionalField show={component.install === true}>
              <section>
                <FieldLabel>用户可选安装</FieldLabel>
                <BooleanSwitchField
                  value={component.choose}
                  onChange={choose => updateComponent({ choose })}
                />
              </section>
            </ConditionalField>

            <section>
              <FieldLabel>组件运行时</FieldLabel>
              <RuntimeSelectField
                value={component.runtime}
                onChange={runtime => updateComponent({ runtime })}
              />
            </section>

            <section>
              <FieldLabel>命令主题</FieldLabel>
              <OptionSelectField
                value={component.commandTheme}
                options={commandThemeOptions}
                onChange={commandTheme => updateComponent({ commandTheme })}
                ariaLabel="命令主题"
              />
            </section>

            <section>
              <FieldLabel>检查已安装</FieldLabel>
              <BooleanSwitchField
                value={component.check}
                onChange={check => updateComponent({ check })}
              />
            </section>

            <ConditionalField show={component.check === true}>
              <div className="flex flex-col gap-[18px]">
                <section>
                  <FieldLabel>检查命令列表</FieldLabel>
                  <LineListField
                    values={component.checkCommand}
                    onChange={checkCommand => updateComponent({ checkCommand })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="检查命令列表"
                  />
                </section>

                <section>
                  <FieldLabel>版本关键字</FieldLabel>
                  <LineListField
                    values={component.checkVersionContains}
                    onChange={checkVersionContains => updateComponent({ checkVersionContains })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="版本关键字"
                  />
                </section>

                <section>
                  <FieldLabel>版本正则匹配</FieldLabel>
                  <LineListField
                    values={component.checkVersionRegex}
                    onChange={checkVersionRegex => updateComponent({ checkVersionRegex })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="版本正则匹配"
                  />
                </section>
              </div>
            </ConditionalField>

            <section>
              <FieldLabel>获取方法</FieldLabel>
              <OptionSelectField
                value={component.getMethod}
                options={getMethodOptions}
                onChange={getMethod => updateComponent({ getMethod })}
                ariaLabel="获取方法"
              />
            </section>

            <ConditionalField show={component.getMethod === 'direct'}>
              <section>
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
                <section>
                  <FieldLabel>版本获取方式</FieldLabel>
                  <OptionSelectField
                    value={component.getVersion}
                    options={getVersionOptions}
                    onChange={getVersion => updateComponent({ getVersion })}
                    ariaLabel="版本获取方式"
                  />
                </section>

                <ConditionalField show={component.getVersion === 'github_repo'}>
                  <section>
                    <FieldLabel>GitHub仓库链接</FieldLabel>
                    <AutoGrowTextField
                      value={component.githubRepo}
                      onChange={githubRepo => updateComponent({ githubRepo })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="GitHub仓库链接"
                    />
                  </section>
                </ConditionalField>

                <section>
                  <FieldLabel>版本拼接链接</FieldLabel>
                  <AutoGrowTextField
                    value={component.splicingLink}
                    onChange={splicingLink => updateComponent({ splicingLink })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="版本拼接链接"
                  />
                </section>

                <section>
                  <FieldLabel>格式化版本号</FieldLabel>
                  <BooleanSwitchField
                    value={component.formatVersion}
                    onChange={formatVersion => updateComponent({ formatVersion })}
                  />
                </section>

                <ConditionalField show={component.formatVersion === true}>
                  <section>
                    <FieldLabel>格式化规则列表</FieldLabel>
                    <LineListField
                      values={component.versionFormattingFormula}
                      onChange={versionFormattingFormula => updateComponent({ versionFormattingFormula })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="格式化规则列表"
                    />
                  </section>
                </ConditionalField>
              </div>
            </ConditionalField>

            <ConditionalField show={component.getMethod === 'get_link'}>
              <div className="flex flex-col gap-[18px]">
                <section>
                  <FieldLabel>链接获取方式</FieldLabel>
                  <OptionSelectField
                    value={component.getLink}
                    options={getLinkOptions}
                    onChange={getLink => updateComponent({ getLink })}
                    ariaLabel="链接获取方式"
                  />
                </section>

                <ConditionalField show={component.getLink === 'filelink' || component.getLink === 'custom'}>
                  <section>
                    <FieldLabel>可选链接列表</FieldLabel>
                    <LineListField
                      values={component.getLinkProvideList}
                      onChange={getLinkProvideList => updateComponent({ getLinkProvideList })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="可选链接列表"
                    />
                  </section>
                </ConditionalField>
              </div>
            </ConditionalField>

            <section>
              <FieldLabel>用户可选版本</FieldLabel>
              <BooleanSwitchField
                value={component.userChoose}
                onChange={userChoose => updateComponent({ userChoose })}
              />
            </section>

            <ConditionalField show={component.userChoose === true}>
              <section>
                <FieldLabel>版本选择列表</FieldLabel>
                <LineListField
                  values={component.chooseList}
                  onChange={chooseList => updateComponent({ chooseList })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="版本选择列表"
                />
              </section>
            </ConditionalField>

            <ConditionalField show={component.install === true}>
              <div className="flex flex-col gap-[18px]">
                <section>
                  <FieldLabel>命令行安装</FieldLabel>
                  <BooleanSwitchField
                    value={component.commandInstall}
                    onChange={commandInstall => updateComponent({ commandInstall })}
                  />
                </section>

                <ConditionalField show={component.commandInstall === true}>
                  <section>
                    <FieldLabel>安装命令列表</FieldLabel>
                    <LineListField
                      values={component.installCommandList}
                      onChange={installCommandList => updateComponent({ installCommandList })}
                      maxWidth={fieldAvailableWidth}
                      ariaLabel="安装命令列表"
                    />
                  </section>
                </ConditionalField>

                <ConditionalField show={component.commandInstall === false}>
                  <div className="flex flex-col gap-[18px]">
                    <section>
                      <FieldLabel>安装操作方式</FieldLabel>
                      <OptionSelectField
                        value={component.installOperate}
                        options={installOperateOptions}
                        onChange={installOperate => updateComponent({ installOperate })}
                        ariaLabel="安装操作方式"
                      />
                    </section>

                    <ConditionalField show={component.installOperate === 'custom'}>
                      <section>
                        <FieldLabel>自定义安装规则</FieldLabel>
                        <LineListField
                          values={component.installCustomList}
                          onChange={installCustomList => updateComponent({ installCustomList })}
                          maxWidth={fieldAvailableWidth}
                          ariaLabel="自定义安装规则"
                        />
                      </section>
                    </ConditionalField>
                  </div>
                </ConditionalField>

                <section>
                  <FieldLabel>安装路径</FieldLabel>
                  <AutoGrowTextField
                    value={component.installPath}
                    onChange={installPath => updateComponent({ installPath })}
                    maxWidth={fieldAvailableWidth}
                    ariaLabel="安装路径"
                  />
                </section>

                <ConditionalField show={component.installPath === '$CustomPath'}>
                  <section>
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

            <section>
              <FieldLabel>安装前操作</FieldLabel>
              <BooleanSwitchField
                value={component.beforeCommand}
                onChange={beforeCommand => updateComponent({ beforeCommand })}
              />
            </section>

            <ConditionalField show={component.beforeCommand === true}>
              <section>
                <FieldLabel>安装前命令列表</FieldLabel>
                <LineListField
                  values={component.beforeCommandList}
                  onChange={beforeCommandList => updateComponent({ beforeCommandList })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="安装前命令列表"
                />
              </section>
            </ConditionalField>

            <section>
              <FieldLabel>安装后操作</FieldLabel>
              <BooleanSwitchField
                value={component.afterCommand}
                onChange={afterCommand => updateComponent({ afterCommand })}
              />
            </section>

            <ConditionalField show={component.afterCommand === true}>
              <section>
                <FieldLabel>安装后命令列表</FieldLabel>
                <LineListField
                  values={component.afterCommandList}
                  onChange={afterCommandList => updateComponent({ afterCommandList })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="安装后命令列表"
                />
              </section>
            </ConditionalField>

            <section>
              <FieldLabel>组件环境变量导出</FieldLabel>
              <BooleanSwitchField
                value={component.envOutput}
                onChange={envOutput => updateComponent({ envOutput })}
              />
            </section>

            <ConditionalField show={component.envOutput === true}>
              <section>
                <FieldLabel>导出变量列表</FieldLabel>
                <LineListField
                  values={component.envOutputList}
                  onChange={envOutputList => updateComponent({ envOutputList })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="导出变量列表"
                />
              </section>
            </ConditionalField>

            <section>
              <FieldLabel>组件环境变量导入</FieldLabel>
              <BooleanSwitchField
                value={component.envInput}
                onChange={envInput => updateComponent({ envInput })}
              />
            </section>

            <ConditionalField show={component.envInput === true}>
              <section>
                <FieldLabel>导入变量列表</FieldLabel>
                <LineListField
                  values={component.envInputList}
                  onChange={envInputList => updateComponent({ envInputList })}
                  maxWidth={fieldAvailableWidth}
                  ariaLabel="导入变量列表"
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
