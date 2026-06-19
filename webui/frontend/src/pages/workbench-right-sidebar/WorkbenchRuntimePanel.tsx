import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, CircleDashed, Loader2, Play, RefreshCw, SquareTerminal } from 'lucide-react'
import {
  font,
  rightSidebarCollapsedWidth,
  rightSidebarMaxWidth,
  rightSidebarMinWidth,
} from './constants'
import { clamp } from './selection'
import { TextAlignRightGlyph } from './icons'

export type WorkbenchRunMode = 'full' | 'stage'
export type WorkbenchRunStage = 'components' | 'deployments' | 'configs' | 'launches' | 'uninstalls'
export type WorkbenchRunInputValue = string | boolean

export interface WorkbenchRunFormOption {
  label?: string
  value?: string | number | boolean
}

export interface WorkbenchRunFormField {
  key: string
  label: string
  field_type: 'text' | 'select' | 'boolean' | 'hidden'
  required?: boolean
  default?: string | number | boolean | null
  options?: WorkbenchRunFormOption[]
  description?: string
}

export interface WorkbenchRunProgress {
  task_id?: string
  status?: string
  step?: number
  total_steps?: number
  step_name?: string
  message?: string
  logs?: string[]
  result?: {
    success?: boolean
    message?: string
    runtime_env_file?: string
    runtime_state_file?: string
    runtime_log_file?: string
    instance_config_name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WorkbenchRunStartOptions {
  mode: WorkbenchRunMode
  stage: WorkbenchRunStage
  nickname: string
  serialNumber: string
  userInputs: Record<string, WorkbenchRunInputValue>
}

interface WorkbenchRuntimePanelProps {
  collapsed: boolean
  width: number
  taskId: string | null
  progress: WorkbenchRunProgress | null
  error: string | null
  formFields?: WorkbenchRunFormField[]
  formValues?: Record<string, WorkbenchRunInputValue>
  formLoading?: boolean
  formError?: string | null
  starting?: boolean
  onToggleCollapsed: () => void
  onResize: (width: number) => void
  onStart: (options: WorkbenchRunStartOptions) => void
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

function resolveStatusLabel(status?: string) {
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'skipped') return '已跳过'
  if (status === 'warning') return '警告'
  if (status === 'running') return '运行中'
  return '待运行'
}

function resolveStatusColor(status?: string) {
  if (status === 'completed') return '#86efac'
  if (status === 'failed') return '#fca5a5'
  if (status === 'warning') return '#fde68a'
  if (status === 'skipped') return 'rgba(226, 232, 240, 0.72)'
  if (status === 'running') return '#93c5fd'
  return 'rgba(226, 232, 240, 0.66)'
}

function FieldLabel({ children }: { children: string }) {
  return (
    <div
      className="mb-[8px] text-[14px] font-semibold leading-[20px]"
      style={{ color: 'rgba(226, 232, 240, 0.78)' }}
    >
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

export default function WorkbenchRuntimePanel({
  collapsed,
  width,
  taskId,
  progress,
  error,
  formFields = [],
  formValues = {},
  formLoading = false,
  formError = null,
  starting = false,
  onToggleCollapsed,
  onResize,
  onStart,
  onFormValueChange,
  onRefreshForm,
  onClose,
}: WorkbenchRuntimePanelProps) {
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [mode, setMode] = useState<WorkbenchRunMode>('full')
  const [stage, setStage] = useState<WorkbenchRunStage>('components')
  const [nickname, setNickname] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const logs = useMemo(() => progress?.logs ?? [], [progress?.logs])
  const status = progress?.status ?? (starting ? 'running' : taskId ? 'running' : undefined)
  const done = status === 'completed' || status === 'failed'
  const visibleFormFields = useMemo(() => (
    formFields.filter(field => field.field_type !== 'hidden' && !['nickname', 'serial_number'].includes(field.key))
  ), [formFields])
  const progressRatio = progress?.total_steps
    ? clamp((progress.step ?? 0) / progress.total_steps, 0, 1)
    : status === 'completed'
      ? 1
      : 0

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
          aria-label="展开运行面板"
          title="展开运行面板"
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
        className="absolute left-[25px] right-[132px] top-[22px] flex h-[36px] items-center gap-[10px] overflow-hidden text-[30px] font-semibold leading-[36px]"
        title="试运行"
      >
        <SquareTerminal size={28} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">试运行</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-[75px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
        }}
        aria-label="返回配置"
        title="返回配置"
      >
        <ArrowLeft size={24} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="absolute right-[23px] top-[23px] flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
        style={{
          borderColor: 'var(--dfw-sidebar-border)',
          background: 'var(--dfw-sidebar-bg)',
          color: 'var(--dfw-text)',
        }}
        aria-label="收起运行面板"
        title="收起运行面板"
      >
        <TextAlignRightGlyph />
      </button>

      <div className="absolute left-[19.5px] right-[20.5px] top-[102px] bottom-[24px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-[160px] flex-col gap-[18px]" style={{ width: Math.max(0, width - 40) }}>
          <section
            className="rounded-[8px] border p-[14px]"
            style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}
          >
            <FieldLabel>运行类型</FieldLabel>
            <div className="flex flex-wrap gap-[8px]">
              <SegmentButton value="full" selected={mode === 'full'} onSelect={setMode} disabled={starting}>
                完整运行
              </SegmentButton>
              <SegmentButton value="stage" selected={mode === 'stage'} onSelect={setMode} disabled={starting}>
                阶段运行
              </SegmentButton>
            </div>
          </section>

          {mode === 'stage' && (
            <section
              className="rounded-[8px] border p-[14px]"
              style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}
            >
              <FieldLabel>运行阶段</FieldLabel>
              <div className="grid grid-cols-2 gap-[8px]">
                {runStages.map(item => (
                  <SegmentButton
                    key={item.value}
                    value={item.value}
                    selected={stage === item.value}
                    onSelect={setStage}
                    disabled={starting}
                  >
                    {item.label}
                  </SegmentButton>
                ))}
              </div>
            </section>
          )}

          <section
            className="rounded-[8px] border p-[14px]"
            style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}
          >
            <FieldLabel>实例名称</FieldLabel>
            <input
              value={nickname}
              onChange={event => setNickname(event.target.value)}
              disabled={starting}
              placeholder="完整运行会写入实例配置"
              className="mb-[12px] h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
              style={{
                borderColor: 'var(--dfw-sidebar-border)',
                background: 'rgba(15, 23, 42, 0.16)',
                color: 'var(--dfw-text)',
                fontFamily: font,
              }}
            />
            <FieldLabel>实例序列号</FieldLabel>
            <input
              value={serialNumber}
              onChange={event => setSerialNumber(event.target.value)}
              disabled={starting}
              placeholder={mode === 'full' ? '留空则自动生成' : '启动、配置、卸载通常需要填写'}
              className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
              style={{
                borderColor: 'var(--dfw-sidebar-border)',
                background: 'rgba(15, 23, 42, 0.16)',
                color: 'var(--dfw-text)',
                fontFamily: font,
              }}
            />
          </section>

          <button
            type="button"
            disabled={starting}
            onClick={() => onStart({
              mode,
              stage,
              nickname: nickname.trim(),
              serialNumber: serialNumber.trim(),
              userInputs: formValues,
            })}
            className="flex h-[42px] items-center justify-center gap-[10px] rounded-[10px] border text-[16px] font-semibold leading-none transition-[opacity,transform] hover:opacity-90 disabled:cursor-default disabled:opacity-55"
            style={{
              borderColor: 'rgba(96, 165, 250, 0.7)',
              background: 'var(--dfw-bottom-run-bg)',
              color: 'var(--dfw-bottom-action-text)',
              fontFamily: font,
            }}
          >
            {starting ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
            <span>{starting ? '正在启动' : taskId && !done ? '重新开始' : '开始试运行'}</span>
          </button>

          <section
            className="rounded-[8px] border p-[14px]"
            style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}
          >
            <div className="mb-[10px] flex items-center justify-between gap-[10px]">
              <FieldLabel>运行参数</FieldLabel>
              <button
                type="button"
                onClick={onRefreshForm}
                disabled={starting || formLoading}
                className="flex h-[28px] items-center gap-[6px] rounded-[7px] border px-[8px] text-[12px] font-semibold transition-colors hover:bg-[var(--dfw-control-hover)] disabled:cursor-default disabled:opacity-50"
                style={{
                  borderColor: 'var(--dfw-sidebar-border)',
                  background: 'rgba(15, 23, 42, 0.12)',
                  color: 'var(--dfw-text)',
                  fontFamily: font,
                }}
                title="刷新运行参数"
                aria-label="刷新运行参数"
              >
                <RefreshCw size={14} className={formLoading ? 'animate-spin' : ''} />
                <span>刷新</span>
              </button>
            </div>
            {formError && (
              <div className="mb-[10px] rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[20px]" style={{ borderColor: 'rgba(248,113,113,0.55)', color: '#fecaca', background: 'rgba(127,29,29,0.22)' }}>
                {formError}
              </div>
            )}
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
                        <span className="shrink-0 text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.4)' }}>
                          {field.key}
                        </span>
                      </div>
                      {field.field_type === 'boolean' ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(value)}
                          disabled={starting}
                          onClick={() => onFormValueChange?.(field.key, !Boolean(value))}
                          className="flex h-[34px] w-[108px] items-center rounded-[17px] border px-[4px] transition-colors disabled:opacity-55"
                          style={{
                            borderColor: Boolean(value) ? 'var(--dfw-blue)' : 'var(--dfw-sidebar-border)',
                            background: Boolean(value) ? 'rgba(59, 130, 246, 0.22)' : 'rgba(15, 23, 42, 0.16)',
                          }}
                        >
                          <span
                            className="h-[24px] w-[24px] rounded-full transition-transform duration-150"
                            style={{
                              transform: Boolean(value) ? 'translateX(72px)' : 'translateX(0)',
                              background: Boolean(value) ? 'var(--dfw-blue)' : 'rgba(226, 232, 240, 0.54)',
                            }}
                            aria-hidden
                          />
                        </button>
                      ) : field.field_type === 'select' ? (
                        <select
                          value={fieldValueAsString(value)}
                          disabled={starting}
                          onChange={event => onFormValueChange?.(field.key, event.target.value)}
                          className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none disabled:opacity-55"
                          style={{
                            borderColor: 'var(--dfw-sidebar-border)',
                            background: 'rgba(15, 23, 42, 0.16)',
                            color: 'var(--dfw-text)',
                            fontFamily: font,
                          }}
                        >
                          {(field.options ?? []).map(option => {
                            const optionValue = formOptionValueAsString(option.value)
                            return (
                              <option key={`${field.key}-${optionValue}`} value={optionValue}>
                                {option.label || optionValue}
                              </option>
                            )
                          })}
                        </select>
                      ) : (
                        <input
                          value={fieldValueAsString(value)}
                          onChange={event => onFormValueChange?.(field.key, event.target.value)}
                          disabled={starting}
                          className="h-[38px] w-full rounded-[8px] border px-[10px] text-[14px] outline-none transition-colors placeholder:text-[rgba(226,232,240,0.38)] disabled:opacity-55"
                          style={{
                            borderColor: 'var(--dfw-sidebar-border)',
                            background: 'rgba(15, 23, 42, 0.16)',
                            color: 'var(--dfw-text)',
                            fontFamily: font,
                          }}
                        />
                      )}
                      {field.description && (
                        <div className="mt-[5px] text-[11px] leading-[16px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>
                          {field.description}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-[16px] text-center text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.45)' }}>
                当前模板没有额外运行参数
              </div>
            )}
          </section>

          <section
            className="rounded-[8px] border p-[14px]"
            style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(15, 23, 42, 0.12)' }}
          >
            <div className="mb-[12px] flex items-center justify-between gap-[10px]">
              <div className="flex min-w-0 items-center gap-[8px]">
                {status === 'completed' ? (
                  <CheckCircle2 size={20} style={{ color: resolveStatusColor(status) }} />
                ) : status === 'failed' ? (
                  <CircleAlert size={20} style={{ color: resolveStatusColor(status) }} />
                ) : status === 'running' ? (
                  <Loader2 size={20} className="animate-spin" style={{ color: resolveStatusColor(status) }} />
                ) : (
                  <CircleDashed size={20} style={{ color: resolveStatusColor(status) }} />
                )}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-semibold">
                  {resolveStatusLabel(status)}
                </span>
              </div>
              {taskId && (
                <span className="shrink-0 text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.54)' }}>
                  {taskId}
                </span>
              )}
            </div>
            <div className="h-[8px] overflow-hidden rounded-full" style={{ background: 'rgba(148, 163, 184, 0.22)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${Math.round(progressRatio * 100)}%`,
                  background: status === 'failed' ? '#ef4444' : '#60a5fa',
                }}
              />
            </div>
            <div className="mt-[10px] text-[13px] leading-[20px]" style={{ color: 'rgba(226, 232, 240, 0.72)' }}>
              {progress?.step_name || (taskId ? '等待运行进度...' : '选择运行方式后开始执行')}
              {progress?.message ? `：${progress.message}` : ''}
            </div>
            {error && (
              <div className="mt-[10px] rounded-[8px] border px-[10px] py-[8px] text-[13px] leading-[20px]" style={{ borderColor: 'rgba(248,113,113,0.55)', color: '#fecaca', background: 'rgba(127,29,29,0.22)' }}>
                {error}
              </div>
            )}
            {progress?.result?.runtime_log_file && (
              <div className="mt-[10px] text-[12px] leading-[18px]" style={{ color: 'rgba(226, 232, 240, 0.58)' }}>
                日志文件：{progress.result.runtime_log_file}
              </div>
            )}
          </section>

          <section
            className="min-h-[180px] rounded-[8px] border p-[14px]"
            style={{ borderColor: 'var(--dfw-sidebar-border)', background: 'rgba(2, 6, 23, 0.22)' }}
          >
            <div className="mb-[10px] flex items-center justify-between gap-[10px]">
              <FieldLabel>运行日志</FieldLabel>
              <span className="text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.48)' }}>
                {logs.length} 条
              </span>
            </div>
            <div className="max-h-[360px] overflow-y-auto rounded-[6px] px-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {logs.length ? (
                logs.map((line, index) => (
                  <div
                    key={`${index}-${line}`}
                    className="break-words py-[3px] text-[12px] leading-[18px]"
                    style={{ color: 'rgba(226, 232, 240, 0.72)', fontFamily: "'JetBrainsMono Nerd Font', 'HarmonyOS Sans SC', monospace" }}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <div className="py-[18px] text-center text-[13px]" style={{ color: 'rgba(226, 232, 240, 0.45)' }}>
                  暂无日志
                </div>
              )}
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
        aria-label="调整运行面板宽度"
        title="调整运行面板宽度"
      />
    </aside>
  )
}
