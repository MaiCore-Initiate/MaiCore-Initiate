import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, Bug, CircleAlert, CircleDashed, Loader2, Pause, Play, RefreshCw, RotateCcw, Square, TextCursorInput } from 'lucide-react'
import {
  font,
  rightSidebarCollapsedWidth,
  rightSidebarMaxWidth,
  rightSidebarMinWidth,
} from './constants'
import { clamp } from './selection'
import { TextAlignRightGlyph } from './icons'
import type {
  WorkbenchRunFormField,
  WorkbenchRunFormOption,
  WorkbenchRunInputValue,
  WorkbenchRunStage,
} from './WorkbenchRuntimePanel'

export type WorkbenchDebugScope = 'full' | 'stage' | 'block'
export type WorkbenchDebugMonitorLevel = 'normal' | 'strict'

export interface WorkbenchDebugBlockOption {
  value: string
  label: string
  stage: WorkbenchRunStage
}

export interface WorkbenchDebugBlock {
  id: string
  stage?: string
  item_id?: string
  label?: string
  status?: string
  started_at?: string
  ended_at?: string
  duration_ms?: number
  command_ids?: string[]
  process_ids?: number[]
  command_count?: number
  process_count?: number
  error?: string
}

export interface WorkbenchDebugCommand {
  id: string
  block_id?: string
  label?: string
  runtime?: string
  runtime_label?: string
  cwd?: string
  script_path?: string
  primary_command?: string
  commands?: string[]
  status?: string
  returncode?: number | null
  pid?: number | null
  started_at?: string
  ended_at?: string
  duration_ms?: number
  output_lines?: Array<{ line?: string; command_index?: number | null; runtime?: string; timestamp?: string }>
  process_ids?: number[]
  call_stack?: string[]
  error?: string
}

export interface WorkbenchDebugProcess {
  id?: string
  pid: number
  parent_pid?: number
  block_id?: string
  command_id?: string
  label?: string
  name?: string
  status?: string
  source?: string
  root?: boolean
  exe?: string
  cwd?: string
  cmdline?: string
  username?: string
  cpu_percent?: number
  memory_mb?: number
  thread_count?: number
  children?: number[]
  call_stack?: string[]
  started_at?: string
  ended_at?: string
  duration_ms?: number
  error?: string
}

export interface WorkbenchDebugSession {
  session_id?: string
  task_id?: string
  project_sequence?: string
  template_path?: string
  scope?: WorkbenchDebugScope | string
  stage?: string
  block_key?: string
  monitor_level?: WorkbenchDebugMonitorLevel | string
  hydrate_context?: boolean
  status?: string
  message?: string
  error?: string
  started_at?: string
  ended_at?: string
  duration_ms?: number
  blocks?: WorkbenchDebugBlock[]
  commands?: WorkbenchDebugCommand[]
  processes?: WorkbenchDebugProcess[]
  logs?: string[]
  monitor_warnings?: string[]
  result?: Record<string, unknown>
}

export interface WorkbenchDebugStartOptions {
  scope: WorkbenchDebugScope
  stage: WorkbenchRunStage
  blockKey: string
  monitorLevel: WorkbenchDebugMonitorLevel
  hydrateContext: boolean
  nickname: string
  serialNumber: string
  userInputs: Record<string, WorkbenchRunInputValue>
}

interface WorkbenchDebugPanelProps {
  collapsed: boolean
  width: number
  sessionId: string | null
  session: WorkbenchDebugSession | null
  selectedProcessId: number | null
  error: string | null
  formFields?: WorkbenchRunFormField[]
  formValues?: Record<string, WorkbenchRunInputValue>
  formLoading?: boolean
  formError?: string | null
  starting?: boolean
  blockOptions: WorkbenchDebugBlockOption[]
  bottomInset?: number
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  onStart: (options: WorkbenchDebugStartOptions) => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onFormValueChange?: (key: string, value: WorkbenchRunInputValue) => void
  onRefreshForm?: () => void
  onClose: () => void
}

const runStages: Array<{ value: WorkbenchRunStage; label: string }> = [
  { value: 'components', label: '组件' },
  { value: 'deployments', label: '部署' },
  { value: 'configs', label: '配置' },
  { value: 'launches', label: '启动' },
  { value: 'uninstalls', label: '卸载' },
]

function FieldLabel({ children }: { children: string }) {
  return (
    <div className="mb-[8px] text-[14px] font-semibold leading-[20px]" style={{ color: 'rgba(226, 232, 240, 0.78)' }}>
      {children}
    </div>
  )
}

function defaultFormFieldValue(field: WorkbenchRunFormField): WorkbenchRunInputValue {
  if (field.field_type === 'boolean') return Boolean(field.default)
  return field.default === undefined || field.default === null ? '' : String(field.default)
}

function fieldValueAsString(value: WorkbenchRunInputValue | undefined) {
  return value === undefined ? '' : String(value)
}

function formOptionValueAsString(value: WorkbenchRunFormOption['value']) {
  return value === undefined || value === null ? '' : String(value)
}

function formatDuration(durationMs?: number) {
  const value = Math.max(0, Math.round(durationMs ?? 0))
  if (value < 1000) return `${value}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function resolveStatusLabel(status?: string) {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'paused') return '已暂停'
  if (status === 'stopped') return '已停止'
  if (status === 'stopping') return '停止中'
  if (status === 'running') return '调试中'
  return '待调试'
}

function resolveStatusColor(status?: string) {
  if (status === 'completed') return '#86efac'
  if (status === 'failed') return '#fca5a5'
  if (status === 'paused') return '#fde68a'
  if (status === 'stopped' || status === 'stopping') return 'rgba(226, 232, 240, 0.72)'
  if (status === 'running') return '#93c5fd'
  return 'rgba(226, 232, 240, 0.66)'
}

function SegmentButton<T extends string>({
  value,
  selected,
  children,
  onSelect,
  disabled,
}: {
  value: T
  selected: boolean
  children: string
  onSelect: (value: T) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className="h-[34px] rounded-[8px] px-[12px] text-[14px] font-semibold leading-none transition-[background-color,border-color,color,opacity] disabled:cursor-default disabled:opacity-45"
      style={{
        border: `1px solid ${selected ? 'rgba(96, 165, 250, 0.9)' : 'var(--dfw-sidebar-border)'}`,
        background: selected ? 'rgba(59, 130, 246, 0.22)' : 'rgba(15, 23, 42, 0.14)',
        color: selected ? '#dbeafe' : 'var(--dfw-text)',
      }}
    >
      {children}
    </button>
  )
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-[8px] py-[3px] text-[12px] leading-[18px]">
      <span style={{ color: 'rgba(226, 232, 240, 0.45)' }}>{label}</span>
      <span className="min-w-0 break-words" style={{ color: 'rgba(226, 232, 240, 0.78)' }}>{value}</span>
    </div>
  )
}

export default function WorkbenchDebugPanel({
  collapsed,
  width,
  sessionId,
  session,
  selectedProcessId,
  error,
  formFields = [],
  formValues = {},
  formLoading = false,
  formError = null,
  starting = false,
  blockOptions,
  bottomInset = 0,
  onToggleCollapsed,
  onResize,
  onStart,
  onPause,
  onResume,
  onStop,
  onFormValueChange,
  onRefreshForm,
  onClose,
}: WorkbenchDebugPanelProps) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [scope, setScope] = useState<WorkbenchDebugScope>('full')
  const [stage, setStage] = useState<WorkbenchRunStage>('components')
  const [blockKey, setBlockKey] = useState('')
  const [monitorLevel, setMonitorLevel] = useState<WorkbenchDebugMonitorLevel>('normal')
  const [hydrateContext, setHydrateContext] = useState(true)
  const [nickname, setNickname] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const logs = useMemo(() => session?.logs ?? [], [session?.logs])
  const status = session?.status ?? (starting ? 'running' : sessionId ? 'running' : undefined)
  const running = status === 'running' || status === 'paused' || status === 'stopping'
  const selectedProcess = useMemo(
    () => (session?.processes ?? []).find(process => process.pid === selectedProcessId) ?? null,
    [selectedProcessId, session?.processes],
  )
  const selectedCommand = useMemo(
    () => (session?.commands ?? []).find(command => command.id === selectedProcess?.command_id) ?? null,
    [selectedProcess?.command_id, session?.commands],
  )
  const visibleFormFields = useMemo(() => (
    formFields.filter(field => field.field_type !== 'hidden' && !['nickname', 'serial_number'].includes(field.key))
  ), [formFields])
  const firstBlockKey = blockOptions[0]?.value ?? ''
  const effectiveBlockKey = blockKey || firstBlockKey

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStartRef.current = { pointerId: event.pointerId, x: event.clientX, width }
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

  if (collapsed) {
    return (
      <aside data-workbench-ui className="absolute right-0 top-0 z-20 transition-[bottom,width] duration-150 ease-out" style={{ width: rightSidebarCollapsedWidth, bottom: bottomInset }}>
        <div className="absolute inset-y-0 right-0 border" style={{ width: rightSidebarCollapsedWidth, borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', borderRadius: '30px 0 0 30px' }} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute right-[15px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
          style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', color: 'var(--dfw-text)' }}
          aria-label="展开调试面板"
          title="展开调试面板"
        >
          <TextAlignRightGlyph />
        </button>
      </aside>
    )
  }

  return (
    <aside data-workbench-ui className="absolute right-0 top-0 z-20 transition-[bottom,width] duration-150 ease-out" style={{ width, bottom: bottomInset, color: 'var(--dfw-text)', fontFamily: font }}>
      <div className="absolute inset-0 border" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', borderRadius: '30px 0 0 30px' }} />
      <div className="absolute left-0 top-0 h-[86px] w-full border" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', borderRadius: '30px 0 0 0' }} />
      <div className="absolute left-[25px] right-[132px] top-[22px] flex h-[36px] items-center gap-[10px] overflow-hidden text-[30px] font-semibold leading-[36px]" title="调试">
        <Bug size={28} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">调试</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-[75px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', color: 'var(--dfw-text)' }}
        aria-label="返回配置"
        title="返回配置"
      >
        <ArrowLeft size={24} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="absolute right-[23px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'var(--dfw-sidebar-bg)', color: 'var(--dfw-text)' }}
        aria-label="收起调试面板"
        title="收起调试面板"
      >
        <TextAlignRightGlyph />
      </button>

      <div className="absolute left-[19.5px] right-[20.5px] top-[102px] bottom-[24px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
            <FieldLabel>调试范围</FieldLabel>
            <div className="flex flex-wrap gap-[8px]">
              <SegmentButton value="full" selected={scope === 'full'} onSelect={setScope} disabled={starting || running}>完整</SegmentButton>
              <SegmentButton value="stage" selected={scope === 'stage'} onSelect={setScope} disabled={starting || running}>分区</SegmentButton>
              <SegmentButton value="block" selected={scope === 'block'} onSelect={setScope} disabled={starting || running}>单块</SegmentButton>
            </div>
          </section>

          {scope === 'stage' && (
            <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
              <FieldLabel>调试分区</FieldLabel>
              <div className="grid grid-cols-2 gap-[8px]">
                {runStages.map(item => (
                  <SegmentButton key={item.value} value={item.value} selected={stage === item.value} onSelect={setStage} disabled={starting || running}>
                    {item.label}
                  </SegmentButton>
                ))}
              </div>
            </section>
          )}

          {scope === 'block' && (
            <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
              <FieldLabel>调试块</FieldLabel>
              <select
                value={effectiveBlockKey}
                disabled={starting || running || blockOptions.length === 0}
                onChange={event => setBlockKey(event.target.value)}
                className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none disabled:opacity-55"
                style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)', fontFamily: font }}
              >
                {blockOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                role="switch"
                aria-checked={hydrateContext}
                disabled={starting || running}
                onClick={() => setHydrateContext(value => !value)}
                className="mt-[12px] flex h-[34px] w-full items-center justify-between rounded-[8px] border px-[10px] text-[13px] font-semibold transition-colors disabled:opacity-55"
                style={{ borderColor: hydrateContext ? 'rgba(96, 165, 250, 0.8)' : 'var(--dfw-sidebar-border)', background: hydrateContext ? 'rgba(59, 130, 246, 0.16)' : 'rgba(15, 23, 42, 0.12)', color: 'var(--dfw-text)' }}
              >
                <span>补上下文</span>
                <span>{hydrateContext ? '开' : '关'}</span>
              </button>
            </section>
          )}

          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
            <FieldLabel>监控级别</FieldLabel>
            <div className="flex flex-wrap gap-[8px]">
              <SegmentButton value="normal" selected={monitorLevel === 'normal'} onSelect={setMonitorLevel} disabled={starting || running}>常规</SegmentButton>
              <SegmentButton value="strict" selected={monitorLevel === 'strict'} onSelect={setMonitorLevel} disabled={starting || running}>严格</SegmentButton>
            </div>
          </section>

          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
            <FieldLabel>实例名称</FieldLabel>
            <input
              value={nickname}
              onChange={event => setNickname(event.target.value)}
              disabled={starting || running}
              placeholder="完整调试会写入实例配置"
              className="mb-[12px] h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
              style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)', fontFamily: font }}
            />
            <FieldLabel>实例序列号</FieldLabel>
            <input
              value={serialNumber}
              onChange={event => setSerialNumber(event.target.value)}
              disabled={starting || running}
              placeholder={scope === 'full' ? '留空则自动生成' : '补上下文时通常需要填写'}
              className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
              style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)', fontFamily: font }}
            />
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)_42px_42px] gap-[8px]">
            <button
              type="button"
              disabled={starting || (scope === 'block' && !effectiveBlockKey)}
              onClick={() => onStart({
                scope,
                stage,
                blockKey: effectiveBlockKey,
                monitorLevel,
                hydrateContext,
                nickname: nickname.trim(),
                serialNumber: serialNumber.trim(),
                userInputs: formValues,
              })}
              className="flex h-[42px] items-center justify-center gap-[10px] rounded-[10px] border text-[16px] font-semibold leading-none transition-[opacity,transform] hover:opacity-90 disabled:cursor-default disabled:opacity-55"
              style={{ borderColor: 'rgba(96, 165, 250, 0.7)', background: 'var(--dfw-bottom-run-bg)', color: 'var(--dfw-bottom-action-text)', fontFamily: font }}
            >
              {starting ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              <span>{starting ? '正在启动' : running ? '重新开始' : '开始调试'}</span>
            </button>
            <button
              type="button"
              disabled={!sessionId || !running || status === 'stopping'}
              onClick={status === 'paused' ? onResume : onPause}
              className="flex h-[42px] items-center justify-center rounded-[10px] border transition-colors hover:bg-[var(--dfw-control-hover)] disabled:cursor-default disabled:opacity-45"
              style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)' }}
              title={status === 'paused' ? '恢复' : '暂停'}
              aria-label={status === 'paused' ? '恢复' : '暂停'}
            >
              {status === 'paused' ? <RotateCcw size={20} /> : <Pause size={20} />}
            </button>
            <button
              type="button"
              disabled={!sessionId || !running || status === 'stopping'}
              onClick={onStop}
              className="flex h-[42px] items-center justify-center rounded-[10px] border transition-colors hover:bg-[var(--dfw-control-hover)] disabled:cursor-default disabled:opacity-45"
              style={{ borderColor: 'rgba(248, 113, 113, 0.55)', background: 'rgba(127, 29, 29, 0.18)', color: '#fecaca' }}
              title="停止"
              aria-label="停止"
            >
              <Square size={18} />
            </button>
          </div>

          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
            <div className="mb-[10px] flex items-center justify-between gap-[10px]">
              <FieldLabel>运行参数</FieldLabel>
              <button
                type="button"
                onClick={onRefreshForm}
                disabled={starting || running || formLoading}
                className="flex h-[28px] items-center gap-[6px] rounded-[7px] border px-[8px] text-[12px] font-semibold transition-colors hover:bg-[var(--dfw-control-hover)] disabled:cursor-default disabled:opacity-50"
                style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)', color: 'var(--dfw-text)', fontFamily: font }}
                title="刷新运行参数"
                aria-label="刷新运行参数"
              >
                <RefreshCw size={14} className={formLoading ? 'animate-spin' : ''} />
                <span>刷新</span>
              </button>
            </div>
            {formError && <div className="mb-[10px] rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[20px]" style={{ borderColor: 'rgba(248,113,113,0.55)', color: '#fecaca', background: 'rgba(127,29,29,0.22)' }}>{formError}</div>}
            {formLoading ? (
              <div className="flex h-[70px] items-center justify-center gap-[8px] text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.62)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span>正在读取模板参数</span>
              </div>
            ) : visibleFormFields.length > 0 ? (
              <div className="flex flex-col gap-[12px]">
                {visibleFormFields.map(field => {
                  const value = formValues[field.key] ?? defaultFormFieldValue(field)
                  return (
                    <div key={field.key}>
                      <div className="mb-[6px] flex items-center justify-between gap-[10px]">
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold" style={{ color: 'rgba(226, 232, 240, 0.76)' }}>
                          {field.label || field.key}{field.required ? ' *' : ''}
                        </span>
                        <span className="shrink-0 text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.4)' }}>{field.key}</span>
                      </div>
                      {field.field_type === 'boolean' ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(value)}
                          disabled={starting || running}
                          onClick={() => onFormValueChange?.(field.key, !Boolean(value))}
                          className="flex h-[34px] w-[108px] items-center rounded-[17px] border px-[4px] transition-colors disabled:opacity-55"
                          style={{ borderColor: Boolean(value) ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)', background: Boolean(value) ? 'rgba(59, 130, 246, 0.22)' : 'rgba(15, 23, 42, 0.16)' }}
                        >
                          <span className="h-[24px] w-[24px] rounded-full transition-transform duration-150" style={{ transform: Boolean(value) ? 'translateX(72px)' : 'translateX(0)', background: Boolean(value) ? 'var(--dfw-blue)' : 'rgba(226, 232, 240, 0.54)' }} aria-hidden />
                        </button>
                      ) : field.field_type === 'select' ? (
                        <select
                          value={fieldValueAsString(value)}
                          disabled={starting || running}
                          onChange={event => onFormValueChange?.(field.key, event.target.value)}
                          className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none disabled:opacity-55"
                          style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)', fontFamily: font }}
                        >
                          {(field.options ?? []).map(option => {
                            const optionValue = formOptionValueAsString(option.value)
                            return <option key={`${field.key}-${optionValue}`} value={optionValue}>{option.label || optionValue}</option>
                          })}
                        </select>
                      ) : (
                        <input
                          value={fieldValueAsString(value)}
                          onChange={event => onFormValueChange?.(field.key, event.target.value)}
                          disabled={starting || running}
                          className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
                          style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.16)', color: 'var(--dfw-text)', fontFamily: font }}
                        />
                      )}
                      {field.description && <div className="mt-[5px] text-[11px] leading-[16px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>{field.description}</div>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-[16px] text-center text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.45)' }}>当前模板没有额外运行参数</div>
            )}
          </section>

          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}>
            <div className="mb-[12px] flex items-center justify-between gap-[10px]">
              <div className="flex min-w-0 items-center gap-[8px]">
                {status === 'failed' ? <CircleAlert size={20} style={{ color: resolveStatusColor(status) }} /> : status === 'running' || status === 'paused' ? <Loader2 size={20} className={status === 'running' ? 'animate-spin' : ''} style={{ color: resolveStatusColor(status) }} /> : <CircleDashed size={20} style={{ color: resolveStatusColor(status) }} />}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-semibold">{resolveStatusLabel(status)}</span>
              </div>
              {sessionId && <span className="shrink-0 text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.54)' }}>{sessionId}</span>}
            </div>
            <div className="grid grid-cols-3 gap-[8px] text-center">
              <div className="rounded-[7px] border px-[8px] py-[8px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.14)' }}>
                <div className="text-[18px] font-semibold">{session?.blocks?.length ?? 0}</div>
                <div className="text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>块</div>
              </div>
              <div className="rounded-[7px] border px-[8px] py-[8px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.14)' }}>
                <div className="text-[18px] font-semibold">{session?.processes?.length ?? 0}</div>
                <div className="text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>进程</div>
              </div>
              <div className="rounded-[7px] border px-[8px] py-[8px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.14)' }}>
                <div className="text-[18px] font-semibold">{formatDuration(session?.duration_ms)}</div>
                <div className="text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>耗时</div>
              </div>
            </div>
            <div className="mt-[10px] text-[13px] leading-[20px]" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>{session?.message || (sessionId ? '等待调试事件...' : '选择范围后开始调试')}</div>
            {(error || session?.error) && <div className="mt-[10px] rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[20px]" style={{ borderColor: 'rgba(248,113,113,0.55)', color: '#fecaca', background: 'rgba(127,29,29,0.22)' }}>{error || session?.error}</div>}
          </section>

          <section className="rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.22)' }}>
            <div className="mb-[10px] flex items-center gap-[8px]">
              <TextCursorInput size={18} />
              <FieldLabel>进程详情</FieldLabel>
            </div>
            {selectedProcess ? (
              <div className="font-mono">
                <DetailRow label="PID" value={selectedProcess.pid} />
                <DetailRow label="父进程" value={selectedProcess.parent_pid} />
                <DetailRow label="名称" value={selectedProcess.name || selectedProcess.label} />
                <DetailRow label="状态" value={selectedProcess.status} />
                <DetailRow label="来源" value={selectedProcess.source} />
                <DetailRow label="CPU" value={selectedProcess.cpu_percent === undefined ? null : `${selectedProcess.cpu_percent}%`} />
                <DetailRow label="内存" value={selectedProcess.memory_mb === undefined ? null : `${selectedProcess.memory_mb} MB`} />
                <DetailRow label="线程" value={selectedProcess.thread_count} />
                <DetailRow label="耗时" value={formatDuration(selectedProcess.duration_ms)} />
                <DetailRow label="工作目录" value={selectedProcess.cwd} />
                <DetailRow label="执行文件" value={selectedProcess.exe} />
                <DetailRow label="命令行" value={selectedProcess.cmdline} />
                <DetailRow label="调用栈" value={selectedProcess.call_stack?.join(' > ')} />
                <DetailRow label="命令" value={selectedCommand?.primary_command} />
                {selectedCommand?.output_lines?.length ? (
                  <div className="mt-[10px] max-h-[180px] overflow-y-auto rounded-[6px] border p-[8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.18)' }}>
                    {selectedCommand.output_lines.slice(-60).map((item, index) => (
                      <div key={`${index}-${item.timestamp ?? ''}`} className="break-words py-[2px] text-[11px] leading-[16px]" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>{item.line}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-[18px] text-center text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.45)' }}>从左侧选择一个进程查看详情</div>
            )}
          </section>

          <section className="min-h-[180px] rounded-[8px] border p-[14px]" style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.22)' }}>
            <div className="mb-[10px] flex items-center justify-between gap-[10px]">
              <FieldLabel>调试日志</FieldLabel>
              <span className="text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>{logs.length} 条</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded-[6px] px-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {logs.length ? logs.map((line, index) => (
                <div key={`${index}-${line}`} className="break-words py-[3px] text-[12px] leading-[18px]" style={{ color: 'rgba(226, 232, 240, 0.72)', fontFamily: "'JetBrainsMono Nerd Font', 'HarmonyOS Sans SC', monospace" }}>{line}</div>
              )) : <div className="py-[18px] text-center text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.45)' }}>暂无日志</div>}
            </div>
          </section>
        </div>
      </div>

      <div
        className="absolute bottom-[30px] left-[-5px] top-[30px] w-[10px] cursor-ew-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        aria-label="调整调试面板宽度"
        title="调整调试面板宽度"
      />
    </aside>
  )
}
