import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { X } from 'lucide-react'
import type { WorkbenchDebugProcess, WorkbenchDebugSession } from '../workbench-right-sidebar/WorkbenchDebugPanel'

const font = "'HarmonyOS Sans SC', 'HYWenHei', sans-serif"
const monoFont = "'JetBrainsMono Nerd Font', 'HarmonyOS Sans SC', monospace"
const hiddenHeight = 0
const defaultHeight = 180
const minVisibleHeight = 96
const hideThreshold = 72
const minTrackWidth = 6
const chromeBarHeight = 61
const topChromeTop = 19.5
const bottomChromeBottom = 30
const maximizedGap = 30

interface WorkbenchDebugTimelineDrawerProps {
  enabled: boolean
  session: WorkbenchDebugSession | null
  selectedProcessId: number | null
  viewportHeight: number
  onProcessSelect: (pid: number) => void
  onVisibleHeightChange?: (height: number) => void
}

interface TimelineLane {
  blockId: string
  label: string
  status?: string
  processes: WorkbenchDebugProcess[]
}

function timestampMs(value?: string) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatDuration(durationMs: number) {
  const value = Math.max(0, Math.round(durationMs))
  if (value < 1000) return `${value}ms`
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function formatTimeOffset(offsetMs: number) {
  if (offsetMs < 1000) return `${Math.round(offsetMs)} ms`
  const seconds = offsetMs / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function processStartMs(process: WorkbenchDebugProcess, sessionStart: number) {
  return timestampMs(process.started_at) ?? sessionStart
}

function processEndMs(process: WorkbenchDebugProcess, nowMs: number) {
  return timestampMs(process.ended_at) ?? nowMs
}

function processDurationMs(process: WorkbenchDebugProcess, nowMs: number, sessionStart: number) {
  const started = processStartMs(process, sessionStart)
  const ended = processEndMs(process, nowMs)
  if (ended > started) return ended - started
  return Math.max(0, process.duration_ms ?? 0)
}

function heatColor(ratio: number, status?: string) {
  if (status === 'failed') return '#ef4444'
  if (status === 'terminated') return '#94a3b8'
  if (ratio < 0.18) return '#38bdf8'
  if (ratio < 0.38) return '#22c55e'
  if (ratio < 0.62) return '#eab308'
  if (ratio < 0.82) return '#f97316'
  return '#ef4444'
}

function laneStatusColor(status?: string) {
  if (status === 'failed') return '#fca5a5'
  if (status === 'completed') return '#86efac'
  if (status === 'running') return '#93c5fd'
  if (status === 'paused') return '#fde68a'
  return 'rgba(226, 232, 240, 0.54)'
}

function buildLanes(session: WorkbenchDebugSession | null): TimelineLane[] {
  const blocks = session?.blocks ?? []
  const processes = session?.processes ?? []
  const processesByBlock = new Map<string, WorkbenchDebugProcess[]>()
  for (const process of processes) {
    const blockId = process.block_id || 'session'
    const list = processesByBlock.get(blockId) ?? []
    list.push(process)
    processesByBlock.set(blockId, list)
  }

  const lanes: TimelineLane[] = blocks.map(block => ({
    blockId: block.id,
    label: block.label || block.id,
    status: block.status,
    processes: (processesByBlock.get(block.id) ?? []).slice(),
  }))

  for (const [blockId, list] of processesByBlock.entries()) {
    if (blocks.some(block => block.id === blockId)) continue
    lanes.push({ blockId, label: blockId, status: undefined, processes: list.slice() })
  }

  return lanes.map(lane => ({
    ...lane,
    processes: lane.processes.sort((a, b) => (timestampMs(a.started_at) ?? 0) - (timestampMs(b.started_at) ?? 0)),
  }))
}

export default function WorkbenchDebugTimelineDrawer({
  enabled,
  session,
  selectedProcessId,
  viewportHeight,
  onProcessSelect,
  onVisibleHeightChange,
}: WorkbenchDebugTimelineDrawerProps) {
  const [visible, setVisible] = useState(false)
  const [height, setHeight] = useState(defaultHeight)
  const [hoveringHotZone, setHoveringHotZone] = useState(false)
  const [hoveredPid, setHoveredPid] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number; fromHidden: boolean } | null>(null)
  const lanes = useMemo(() => buildLanes(session), [session])
  const sessionStart = timestampMs(session?.started_at) ?? nowMs
  const sessionEnd = timestampMs(session?.ended_at) ?? nowMs
  const maxObservedEnd = lanes.reduce((max, lane) => (
    lane.processes.reduce((innerMax, process) => Math.max(innerMax, processEndMs(process, nowMs)), max)
  ), sessionEnd)
  const timelineStart = sessionStart
  const timelineEnd = Math.max(sessionStart + 1, maxObservedEnd)
  const timelineSpan = timelineEnd - timelineStart
  const longestDuration = lanes.reduce((max, lane) => (
    lane.processes.reduce((innerMax, process) => Math.max(innerMax, processDurationMs(process, nowMs, sessionStart)), max)
  ), 1)
  const fullHeight = Math.max(minVisibleHeight, Math.round(viewportHeight))
  const normalMaxHeight = clampNumber(
    Math.round(viewportHeight - topChromeTop - chromeBarHeight - maximizedGap - chromeBarHeight - bottomChromeBottom),
    minVisibleHeight,
    fullHeight,
  )
  const isMaximized = height >= fullHeight - 1
  const activeHeight = enabled && visible
    ? isMaximized
      ? fullHeight
      : clampNumber(height, minVisibleHeight, normalMaxHeight)
    : hiddenHeight
  const hoveredProcess = useMemo(() => (
    lanes.flatMap(lane => lane.processes).find(process => process.pid === hoveredPid) ?? null
  ), [hoveredPid, lanes])

  useEffect(() => {
    onVisibleHeightChange?.(activeHeight)
  }, [activeHeight, onVisibleHeightChange])

  useEffect(() => {
    if (!enabled) {
      setVisible(false)
      setHoveredPid(null)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !visible) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [enabled, visible])

  const startDrag = (event: PointerEvent<HTMLDivElement>, fromHidden: boolean) => {
    if (!enabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const nextStartHeight = visible ? activeHeight : 0
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: nextStartHeight,
      fromHidden,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (fromHidden) {
      setVisible(true)
      setHeight(minVisibleHeight)
    }
  }

  const resolveDraggedHeight = (rawHeight: number) => {
    if (rawHeight > normalMaxHeight) return fullHeight
    return clampNumber(rawHeight, minVisibleHeight, normalMaxHeight)
  }

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const delta = drag.startY - event.clientY
    const rawHeight = drag.startHeight >= fullHeight - 1 && delta < 0
      ? normalMaxHeight + delta
      : drag.startHeight + delta
    if (rawHeight <= hideThreshold && !drag.fromHidden) {
      setHeight(minVisibleHeight)
      return
    }
    setVisible(true)
    setHeight(resolveDraggedHeight(rawHeight))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const delta = drag.startY - event.clientY
    const finalHeight = drag.startHeight >= fullHeight - 1 && delta < 0
      ? normalMaxHeight + delta
      : drag.startHeight + delta
    if (finalHeight <= hideThreshold) {
      setVisible(false)
      setHoveredPid(null)
    } else {
      setVisible(true)
      setHeight(resolveDraggedHeight(finalHeight))
    }
    dragRef.current = null
  }

  if (!enabled) return null

  return (
    <>
      {!visible && (
        <div
          data-workbench-ui
          className="absolute bottom-0 z-20 h-[18px] cursor-ns-resize"
          style={{ left: 0, right: 0 }}
          onPointerEnter={() => setHoveringHotZone(true)}
          onPointerLeave={() => setHoveringHotZone(false)}
          onPointerDown={event => startDrag(event, true)}
          onPointerMove={updateDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="拉起调试耗时底栏"
          title="向上拖拽拉起调试耗时底栏"
        >
          <div
            className="absolute bottom-[4px] left-1/2 h-[4px] w-[160px] max-w-[42%] -translate-x-1/2 rounded-full transition-[opacity,transform] duration-150"
            style={{
              background: 'rgba(148, 163, 184, 0.68)',
              opacity: hoveringHotZone ? 1 : 0.42,
              transform: hoveringHotZone ? 'translateX(-50%) scaleY(1.35)' : 'translateX(-50%) scaleY(1)',
            }}
          />
        </div>
      )}

      <section
        data-workbench-ui
        className={`absolute bottom-0 overflow-hidden border-t transition-[height,opacity] duration-150 ease-out ${isMaximized ? 'z-40' : 'z-20'}`}
        style={{
          left: 0,
          right: 0,
          height: activeHeight,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          borderColor: 'rgba(148, 163, 184, 0.32)',
          background: 'rgba(15, 23, 42, 0.94)',
          boxShadow: visible ? '0 -18px 36px rgba(0, 0, 0, 0.28)' : 'none',
          color: 'var(--dfw-text)',
          fontFamily: font,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0 z-20 h-[10px] cursor-ns-resize"
          onPointerDown={event => startDrag(event, false)}
          onPointerMove={updateDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          aria-label="调整调试耗时底栏高度"
          title="拖拽调整高度，向下拖到底部隐藏"
        >
          <div className="mx-auto mt-[3px] h-[3px] w-[128px] rounded-full" style={{ background: 'rgba(148, 163, 184, 0.78)' }} />
        </div>

        <div className="absolute left-[18px] right-[18px] top-[14px] flex h-[28px] items-center justify-between gap-[14px]">
          <div className="flex min-w-0 items-center gap-[10px]">
            <span className="text-[15px] font-semibold">进程耗时热力图</span>
            <span className="text-[12px]" style={{ color: 'rgba(226, 232, 240, 0.52)' }}>
              {lanes.length} 块 / {session?.processes?.length ?? 0} 进程 / {formatDuration(timelineSpan)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setVisible(false)
              setHoveredPid(null)
            }}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] border transition-colors hover:bg-[var(--dfw-control-hover)]"
            style={{ borderColor: 'rgba(148, 163, 184, 0.32)', color: 'rgba(226, 232, 240, 0.82)' }}
            aria-label="隐藏调试耗时底栏"
            title="隐藏"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="absolute left-[18px] right-[18px] top-[48px] bottom-[12px] overflow-hidden">
          <div className="grid h-[24px] grid-cols-[126px_minmax(0,1fr)] items-end gap-[12px] text-[11px]" style={{ color: 'rgba(226, 232, 240, 0.52)', fontFamily: monoFont }}>
            <span>块</span>
            <div className="relative h-[18px] border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.24)' }}>
              {[0, 0.5, 1].map(mark => (
                <span
                  key={mark}
                  className="absolute bottom-[-1px] h-[8px] border-l"
                  style={{
                    left: `${mark * 100}%`,
                    borderColor: 'rgba(148, 163, 184, 0.34)',
                    transform: mark === 1 ? 'translateX(-1px)' : 'none',
                  }}
                >
                  <span
                    className="absolute top-[-16px] whitespace-nowrap"
                    style={{ transform: mark === 1 ? 'translateX(-100%)' : mark === 0.5 ? 'translateX(-50%)' : 'none' }}
                  >
                    {formatTimeOffset(timelineSpan * mark)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="absolute left-0 right-0 top-[30px] bottom-0 overflow-y-auto overflow-x-hidden pr-[4px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {lanes.length ? (
              <div className="flex flex-col gap-[8px]">
                {lanes.map(lane => (
                  <div key={lane.blockId} className="grid min-h-[32px] grid-cols-[126px_minmax(0,1fr)] items-center gap-[12px]">
                    <div className="min-w-0">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold" style={{ color: 'rgba(226, 232, 240, 0.82)' }}>
                        {lane.label}
                      </div>
                      <div className="text-[10px]" style={{ color: laneStatusColor(lane.status), fontFamily: monoFont }}>
                        {lane.processes.length} proc
                      </div>
                    </div>
                    <div className="relative h-[28px] rounded-[7px] border" style={{ borderColor: 'rgba(148, 163, 184, 0.18)', background: 'rgba(2, 6, 23, 0.22)' }}>
                      <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l" style={{ borderColor: 'rgba(148, 163, 184, 0.18)' }} />
                      {lane.processes.map(process => {
                        const start = processStartMs(process, sessionStart)
                        const end = processEndMs(process, nowMs)
                        const duration = processDurationMs(process, nowMs, sessionStart)
                        const left = clampNumber(((start - timelineStart) / timelineSpan) * 100, 0, 100)
                        const width = Math.max(minTrackWidth, ((Math.max(end, start + 1) - start) / timelineSpan) * 100)
                        const selected = process.pid === selectedProcessId
                        const hovered = process.pid === hoveredPid
                        const color = heatColor(duration / longestDuration, process.status)
                        return (
                          <button
                            key={`${lane.blockId}-${process.pid}`}
                            type="button"
                            onClick={() => onProcessSelect(process.pid)}
                            onPointerEnter={() => setHoveredPid(process.pid)}
                            onPointerLeave={() => setHoveredPid(current => (current === process.pid ? null : current))}
                            className="absolute top-[5px] h-[18px] min-w-[6px] rounded-[5px] border transition-[opacity,box-shadow,transform] duration-150"
                            style={{
                              left: `${left}%`,
                              width: `min(${Math.max(width, 1)}%, ${100 - left}%)`,
                              borderColor: process.status === 'failed'
                                ? '#fecaca'
                                : selected || hovered
                                  ? 'rgba(255, 255, 255, 0.88)'
                                  : 'rgba(255, 255, 255, 0.28)',
                              background: color,
                              opacity: selected ? 1 : 0.82,
                              boxShadow: selected
                                ? `0 0 0 2px rgba(255,255,255,0.22), 0 0 18px ${color}`
                                : hovered
                                  ? `0 0 14px ${color}`
                                  : process.status === 'running'
                                    ? `0 0 10px ${color}`
                                    : 'none',
                              transform: selected || hovered ? 'scaleY(1.18)' : 'scaleY(1)',
                            }}
                            aria-label={`选择进程 ${process.pid}`}
                            title={`${process.name || process.label || '进程'} / PID ${process.pid} / ${formatDuration(duration)}`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[8px] border text-[13px]" style={{ borderColor: 'rgba(148, 163, 184, 0.2)', color: 'rgba(226, 232, 240, 0.48)' }}>
                启动调试后会在这里显示进程耗时
              </div>
            )}
          </div>
        </div>

        {hoveredProcess && (
          <div
            className="pointer-events-none absolute right-[18px] top-[48px] z-30 max-w-[360px] rounded-[8px] border px-[10px] py-[8px] text-[12px] leading-[18px] shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
            style={{
              borderColor: 'rgba(148, 163, 184, 0.36)',
              background: 'rgba(2, 6, 23, 0.96)',
              color: 'rgba(226, 232, 240, 0.82)',
              fontFamily: monoFont,
            }}
          >
            <div className="mb-[3px] font-semibold" style={{ color: '#f8fafc' }}>
              {hoveredProcess.name || hoveredProcess.label || '进程'} / PID {hoveredProcess.pid}
            </div>
            <div>状态: {hoveredProcess.status || 'unknown'}</div>
            <div>耗时: {formatDuration(processDurationMs(hoveredProcess, nowMs, sessionStart))}</div>
            {hoveredProcess.parent_pid && <div>父进程: {hoveredProcess.parent_pid}</div>}
            {hoveredProcess.cmdline && (
              <div className="mt-[3px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {hoveredProcess.cmdline}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
