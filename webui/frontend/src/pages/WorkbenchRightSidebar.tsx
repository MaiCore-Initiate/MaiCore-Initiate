import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

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

const runtimeOptions = ['powershell', 'pwsh', 'cmd', 'bash', 'python3', 'python', 'node']
const platformOptions = ['windows', 'linux', 'macos']

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
  platforms: string[]
  schemaVersion: string
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
  runtime: '',
  platforms: [],
  schemaVersion: '',
}

export interface WorkbenchRightSidebarProps {
  collapsed: boolean
  width: number
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  selectedName?: string
  selectedBlockId?: 'start' | 'init' | null
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
        <div className="flex min-h-[1260px] min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
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

          {meta.fileImport === true && (
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
          )}

          <section>
            <FieldLabel>运行时环境</FieldLabel>
            <RuntimeSelectField
              value={meta.runtime}
              onChange={runtime => updateMeta({ runtime })}
            />
          </section>

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
        ) : (
          <div
            className="min-w-[160px] pt-[2px] text-[20px] font-light leading-[34px]"
            style={{ width: Math.max(0, width - 40), fontFamily: font }}
          >
            {selectedBlockId === 'start' ? '起始端点暂无可编辑配置' : '未选中积木'}
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
