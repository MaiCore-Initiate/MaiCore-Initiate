import { useState } from 'react'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
export const rightSidebarExpandedWidth = 600
export const rightSidebarCollapsedWidth = 70

export interface WorkbenchRightSidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  selectedName?: string
  initialAuthor?: string
  initialTags?: string[]
  initialDescription?: string
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

function FieldLabel({ children, top }: { children: string; top: number }) {
  return (
    <label
      className="absolute left-[20px] h-[36px] leading-[36px]"
      style={{ top, fontFamily: font, fontSize: 30, fontWeight: 600 }}
    >
      {children}
    </label>
  )
}

function roundedInputPath(width: number, height: number) {
  const radius = height / 2
  const right = Math.max(radius, width - radius)
  return `M0,0H${right}a${radius},${radius},0,0,1,${radius},${radius}v0a${radius},${radius},0,0,1,-${radius},${radius}H${radius}A${radius},${radius},0,0,1,0,${radius}V0A0,0,0,0,1,0,0Z`
}

function InputFrame({
  left,
  top,
  width,
  height = 44,
  selected = false,
}: {
  left: number
  top: number
  width: number
  height?: number
  selected?: boolean
}) {
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left, top, width, height }}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path
        d={roundedInputPath(width, height)}
        fill={selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)'}
        stroke={selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)'}
      />
    </svg>
  )
}

function parseTags(value: string) {
  return value
    .split('#')
    .map(tag => tag.trim())
    .filter(Boolean)
}

export default function WorkbenchRightSidebar({
  collapsed,
  onToggleCollapsed,
  selectedName = '初始化块',
  initialAuthor = 'MCStartTeam',
  initialTags = ['test'],
  initialDescription = '这是一个基于MCStart模块化部署功能的理念编写的概念模版',
}: WorkbenchRightSidebarProps) {
  const [author, setAuthor] = useState(initialAuthor)
  const [tagInput, setTagInput] = useState(`#${initialTags.join(' #')}`)
  const [tags, setTags] = useState(initialTags)
  const [description, setDescription] = useState(initialDescription)

  const commitTags = () => {
    const parsedTags = parseTags(tagInput)
    if (parsedTags.length) setTags(parsedTags)
  }

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
      style={{ width: rightSidebarExpandedWidth, color: 'var(--dfw-text)', fontFamily: font }}
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
        <div className="relative h-[954px] min-w-[560px]">
          <FieldLabel top={0} children="作者" />
          <InputFrame left={0.5} top={40} width={142} />
          <input
            value={author}
            onChange={event => setAuthor(event.target.value)}
            className="absolute left-[10.5px] top-[40px] h-[44px] w-[122px] bg-transparent text-[20px] font-light outline-none"
            style={{ fontFamily: font }}
            aria-label="作者"
          />

          <FieldLabel top={85} children="标签" />
          <InputFrame left={0.5} top={125} width={142} selected />
          <input
            value={tagInput}
            onChange={event => setTagInput(event.target.value)}
            onBlur={commitTags}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.currentTarget.blur()
            }}
            className="absolute left-[10.5px] top-[125px] h-[44px] w-[122px] bg-transparent text-[20px] font-light outline-none"
            style={{ fontFamily: font }}
            aria-label="标签"
          />
          <div className="absolute left-[0.5px] top-[189px] flex max-w-[553px] flex-wrap gap-[8px]">
            {tags.map(tag => (
              <span
                key={tag}
                className="h-[30px] max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] border px-[6px] text-[20px] font-light leading-[30px]"
                style={{
                  borderColor: 'var(--dfw-sidebar-border)',
                  background: 'var(--dfw-sidebar-bg)',
                  fontFamily: font,
                }}
                title={tag}
              >
                {tag}
              </span>
            ))}
          </div>

          <FieldLabel top={235} children="模板描述" />
          <InputFrame left={0.5} top={275} width={553} />
          <input
            value={description}
            onChange={event => setDescription(event.target.value)}
            className="absolute left-[10.5px] top-[275px] h-[44px] w-[533px] bg-transparent text-[20px] font-light outline-none"
            style={{ fontFamily: font }}
            aria-label="模板描述"
          />

          <div
            className="absolute left-[6.5px] top-[358px] h-[36px] leading-[36px]"
            style={{ fontFamily: font, fontSize: 20, fontWeight: 300 }}
          >
            省略其他条目......
          </div>
        </div>
      </div>
    </aside>
  )
}
