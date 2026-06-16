import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type {
  WorkbenchCustomInstallRule,
  WorkbenchEnvVariableEntry,
  WorkbenchVersionFormattingRule,
} from '../../workbench-canvas/types'
import { font } from '../constants'
import {
  envVariableEntriesEqual,
  extractEnvNameFromString,
  formattingRulesEqual,
  normalizeEnvVariableEntries,
} from '../envVariables'
import { DeleteGlyph, PlusGlyph } from '../icons'
import {
  arraysEqual,
  clampSelectionIds,
  createArrayListItem,
  createCustomInstallRuleItem,
  createEnvVariableEntryItem,
  createVersionFormattingRuleItem,
  moveItemGroup,
  resolveDragGroup,
  resolveGroupBoundaryTarget,
  resolveSelectionRange,
} from '../selection'
import { resolveSplitTableCellWidths } from '../textMeasurement'
import type {
  ArrayListItem,
  ArrayListPresetOption,
  CustomInstallRuleItem,
  EnvVariableEntryItem,
  VersionFormattingRuleItem,
} from '../types'
import { ArrayListInput, BooleanSwitchField } from './basicFields'

// 单行输入项：用于 ArrayListField
export function ArrayListField({
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
    if (!shouldReorder) {
      drag.lastClientY = event.clientY
      return
    }

    const nextItems = moveItemGroup(itemsRef.current, dragGroupIds, direction)
    const targetIndex = nextItems.findIndex(item => item.id === drag.itemId)
    commitItems(nextItems, true)
    setFocusedIndex(current => {
      if (current === null) return null
      const focusedId = itemsRef.current[current]?.id
      const nextIndex = focusedId ? nextItems.findIndex(item => item.id === focusedId) : -1
      return nextIndex >= 0 ? nextIndex : null
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

// 双列 table：match + replace（版本格式化规则）
export function VersionFormattingRuleField({
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

// 双列 table：name + value（环境变量条目），支持 preset
export function EnvVariableTableField({
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

// 双列 table：extension + operate（自定义安装规则）
export function CustomInstallRuleField({
  label,
  values,
  onChange,
  maxWidth,
  outlineTargetId,
}: {
  label: string
  values: WorkbenchCustomInstallRule[]
  onChange: (values: WorkbenchCustomInstallRule[]) => void
  maxWidth: number
  outlineTargetId?: string
}) {
  const [focusedCell, setFocusedCell] = useState<{ index: number; key: keyof WorkbenchCustomInstallRule } | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [items, setItems] = useState<CustomInstallRuleItem[]>(() => values.map(createCustomInstallRuleItem))
  const itemsRef = useRef(items)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const previousRectsRef = useRef<Map<string, DOMRect> | null>(null)
  const dragRef = useRef<{ pointerId: number; index: number; itemId: string; lastClientY: number; active: boolean; timer: number } | null>(null)

  useEffect(() => {
    setItems(currentItems => {
      const currentValues = currentItems.map(item => item.value)
      if (currentValues.length === values.length && currentValues.every((item, index) => item.extension === values[index]?.extension && item.operate === values[index]?.operate)) {
        return currentItems
      }
      const nextItems = values.map((value, index) => ({
        id: currentItems[index]?.id ?? createCustomInstallRuleItem(value).id,
        value: { extension: value.extension, operate: value.operate },
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
        { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
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

  const commitItems = (nextItems: CustomInstallRuleItem[], animate = false) => {
    if (animate) captureRowRects()
    itemsRef.current = nextItems
    setItems(nextItems)
    onChange(nextItems.map(item => item.value))
  }

  const addItem = () => {
    commitItems([...itemsRef.current, createCustomInstallRuleItem({ extension: '', operate: false })], true)
  }

  const updateItem = <K extends keyof WorkbenchCustomInstallRule>(index: number, key: K, nextValue: WorkbenchCustomInstallRule[K]) => {
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
          const extensionFocused = focusedCell?.index === index && focusedCell.key === 'extension'
          const operateFocused = focusedCell?.index === index && focusedCell.key === 'operate'
          const selected = selectedIds.includes(item.id)
          const dragLocked = activeDragId !== null && activeDragId !== item.id
          const { leftWidth: extensionWidth, rightWidth: operateWidth } = resolveSplitTableCellWidths(
            item.value.extension,
            item.value.operate ? 'true' : 'false',
            maxWidth,
            120,
            120,
          )

          return (
            <div
              key={item.id}
              ref={node => {
                if (node) rowRefs.current.set(item.id, node)
                else rowRefs.current.delete(item.id)
              }}
              style={{ width: maxWidth }}
              className="flex max-w-full items-stretch gap-[8px]"
            >
              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-extension` : undefined}
                className="flex max-w-full items-stretch rounded-[5px] border transition-[border-color,background-color] duration-150"
                style={{
                  width: extensionWidth,
                  borderColor: extensionFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: extensionFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
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
                  扩展名
                </span>
                <ArrayListInput
                  value={item.value.extension}
                  onChange={nextValue => updateItem(index, 'extension', nextValue)}
                  onFocus={() => setFocusedCell({ index, key: 'extension' })}
                  onBlur={() => setFocusedCell(current => (
                    current?.index === index && current.key === 'extension' ? null : current
                  ))}
                  ariaLabel={`扩展名${index + 1}`}
                  placeholder=".zip"
                />
              </div>

              <div
                data-outline-target={outlineTargetId ? `${outlineTargetId}-${index}-operate` : undefined}
                className="flex max-w-full items-center rounded-[5px] border px-[10px] transition-[border-color,background-color] duration-150"
                style={{
                  width: operateWidth,
                  borderColor: operateFocused || selected ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                  background: operateFocused || selected ? 'var(--dfw-outline-selected-bg)' : 'var(--dfw-sidebar-bg)',
                  color: 'var(--dfw-text)',
                }}
              >
                <span
                  className="shrink-0 pr-[8px] text-[16px] font-light"
                  style={{ color: 'var(--dfw-outline-muted)', fontFamily: font }}
                >
                  自动处理
                </span>
                <div onFocus={() => setFocusedCell({ index, key: 'operate' })} onBlur={() => setFocusedCell(current => (
                  current?.index === index && current.key === 'operate' ? null : current
                ))}>
                  <BooleanSwitchField
                    value={item.value.operate}
                    onChange={nextValue => updateItem(index, 'operate', nextValue)}
                  />
                </div>
                <button
                  type="button"
                  className="ml-auto flex min-h-[40px] w-[30px] shrink-0 items-center justify-center rounded-r-[5px] transition-colors hover:bg-[var(--dfw-control-hover)]"
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
