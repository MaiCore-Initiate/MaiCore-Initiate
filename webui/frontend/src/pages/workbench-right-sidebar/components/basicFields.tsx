import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  fieldLineHeight,
  fieldMaxCollapsedLines,
  fieldMaxWidth,
  fieldVerticalPadding,
  font,
  optionLabels,
  platformOptions,
  runtimeOptions,
} from '../constants'
import { resolveFieldMetrics } from '../textMeasurement'

export function FieldLabel({ children }: { children: string }) {
  return (
    <label
      className="block min-h-[36px] leading-[36px]"
      style={{ fontFamily: font, fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}
    >
      {children}
    </label>
  )
}

export function AutoGrowTextField({
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

export function BooleanSwitchField({
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

export function RuntimeSelectField({
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

export function OptionSelectField({
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

export function PlatformSelectField({
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

export function ArrayListInput({
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

export function ConditionalField({
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
