import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GlassCard from '../components/ui/GlassCard'

type LogSource = 'main' | 'webui' | 'desktop_pet'

interface LogFile {
  name: string
  size: number
  date: string
  type: 'main' | 'webui' | 'desktop_pet' | 'misc'
}

interface LogLine {
  timestamp: string
  level: string
  logger: string
  message: string
}

interface LogFinding {
  severity: 'error' | 'warning'
  title: string
  count: number
  last_seen: string
  hint: string
}

interface LogAnalysis {
  kind: string
  summary: string
  findings: LogFinding[]
  last_model_url?: string
  last_backend_url?: string
}

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const titleFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const PAGE_SIZE = 200
const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
const levelColors: Record<string, string> = {
  DEBUG: '#06b6d4',
  INFO: '#22c55e',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
}

function SourceTabs({ value, onChange }: { value: LogSource; onChange: (value: LogSource) => void }) {
  const items: Array<{ value: LogSource; label: string }> = [
    { value: 'main', label: '主程序日志' },
    { value: 'webui', label: 'WebUI 日志' },
    { value: 'desktop_pet', label: '桌宠日志' },
  ]

  return (
    <div className="flex flex-wrap gap-[10px]">
      {items.map(item => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className="h-[46px] px-[18px] rounded-[23px] transition-colors"
            style={{
              ...titleFont,
              fontSize: 18,
              background: active ? 'var(--mc-control-solid)' : 'var(--mc-control-bg)',
              border: `2px solid ${active ? 'var(--mc-choice-selected-border)' : 'var(--mc-border-soft)'}`,
              boxShadow: active ? '3px 3px 6px var(--mc-shadow-soft)' : 'none',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Logs({ initialSource }: { initialSource?: LogSource }) {
  const [source, setSource] = useState<LogSource>(initialSource || 'main')
  const [files, setFiles] = useState<LogFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [lines, setLines] = useState<LogLine[]>([])
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)

  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(new Set(LEVELS))
  const [keyword, setKeyword] = useState('')
  const [loggerKeyword, setLoggerKeyword] = useState('')
  const [keywordBlacklist, setKeywordBlacklist] = useState('')
  const [autoScroll, setAutoScroll] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/logs/files', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) setFiles(d.files || [])
      })
      .catch(() => {})
  }, [])

  const filteredFiles = useMemo(
    () => files.filter(file => file.type === source),
    [files, source],
  )

  useEffect(() => {
    const first = filteredFiles[0]
    setSelectedFile(first?.name ?? '')
    setOffset(0)
  }, [filteredFiles])

  const fetchContent = useCallback(() => {
    if (!selectedFile) {
      setLines([])
      setAnalysis(null)
      setTotal(0)
      return
    }

    setLoading(true)
    fetch(`/api/logs/content/${encodeURIComponent(selectedFile)}?offset=${offset}&limit=${PAGE_SIZE}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLines(d.lines || [])
          setAnalysis(d.analysis ?? null)
          setTotal(d.total || 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedFile, offset])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const filteredLines = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const loggerKw = loggerKeyword.trim().toLowerCase()
    const blacklist = keywordBlacklist
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)

    return lines.filter(line => {
      if (!enabledLevels.has(line.level)) return false
      if (kw && !line.message.toLowerCase().includes(kw) && !line.logger.toLowerCase().includes(kw)) return false
      if (loggerKw && !line.logger.toLowerCase().includes(loggerKw)) return false
      if (blacklist.some(item => line.message.toLowerCase().includes(item))) return false
      return true
    })
  }, [enabledLevels, keyword, keywordBlacklist, lines, loggerKeyword])

  const toggleLevel = (level: string) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="w-full h-full p-[24px] overflow-hidden">
      <div className="max-w-[1700px] mx-auto h-full flex flex-col gap-[20px]">
        <div className="flex items-end justify-between gap-[16px] flex-wrap">
          <div>
            <div style={{ ...titleFont, fontSize: 56, color: 'var(--mc-text-primary)' }}>日志查看</div>
            <div className="mt-[4px]" style={{ ...monoFont, fontSize: 16, color: 'var(--mc-text-muted)' }}>支持主程序、WebUI 与桌宠渲染日志解析</div>
          </div>
        </div>

        <GlassCard className="flex-1 min-h-0">
          <div className="p-[24px] h-full flex flex-col gap-[14px]">
            <div className="flex items-center gap-[12px] flex-wrap">
              <SourceTabs value={source} onChange={setSource} />
              <select
                value={selectedFile}
                onChange={e => { setSelectedFile(e.target.value); setOffset(0) }}
                className="h-[46px] px-[16px] rounded-[23px] min-w-[360px] max-w-full outline-none"
                style={{ ...monoFont, fontSize: 17, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
              >
                {filteredFiles.length === 0 ? (
                  <option value="">暂无日志文件</option>
                ) : (
                  filteredFiles.map(file => (
                    <option key={file.name} value={file.name}>
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </option>
                  ))
                )}
              </select>
            </div>

            {analysis && source === 'desktop_pet' ? (
              <div className="rounded-[18px] p-[16px]" style={{ background: 'var(--mc-control-bg)', border: '1px solid var(--mc-border-soft)' }}>
                <div className="flex items-center justify-between gap-[12px] flex-wrap">
                  <div style={{ ...titleFont, fontSize: 22, color: 'var(--mc-text-primary)' }}>桌宠渲染诊断</div>
                  <div style={{ ...monoFont, fontSize: 14, color: 'var(--mc-text-muted)' }}>{analysis.kind}</div>
                </div>
                <div className="mt-[8px]" style={{ ...monoFont, fontSize: 15, color: 'var(--mc-text-secondary)' }}>{analysis.summary}</div>
                {analysis.last_backend_url ? <div className="mt-[8px] break-all" style={{ ...monoFont, fontSize: 13, color: 'var(--mc-text-muted)' }}>后端地址: {analysis.last_backend_url}</div> : null}
                {analysis.last_model_url ? <div className="mt-[4px] break-all" style={{ ...monoFont, fontSize: 13, color: 'var(--mc-text-muted)' }}>最近模型: {analysis.last_model_url}</div> : null}
                <div className="mt-[12px] grid grid-cols-1 xl:grid-cols-2 gap-[10px]">
                  {analysis.findings.length === 0 ? (
                    <div className="rounded-[14px] px-[12px] py-[10px]" style={{ ...monoFont, fontSize: 14, background: 'var(--mc-control-bg-soft)', color: 'var(--mc-text-muted)' }}>
                      暂未识别到明确的桌宠渲染错误关键词。
                    </div>
                  ) : analysis.findings.map((item, idx) => (
                    <div
                      key={`${item.title}-${idx}`}
                      className="rounded-[14px] px-[12px] py-[10px]"
                      style={{
                        background: item.severity === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.10)',
                        border: `1px solid ${item.severity === 'error' ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.25)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-[10px] flex-wrap">
                        <span style={{ ...monoFont, fontSize: 14, fontWeight: 700, color: item.severity === 'error' ? '#dc2626' : '#b45309' }}>{item.title}</span>
                        <span style={{ ...monoFont, fontSize: 12, color: 'var(--mc-text-muted)' }}>命中 {item.count} 次{item.last_seen ? ` · 最近 ${item.last_seen.replace('T', ' ').slice(0, 19)}` : ''}</span>
                      </div>
                      <div className="mt-[4px]" style={{ ...monoFont, fontSize: 13, color: 'var(--mc-text-secondary)' }}>{item.hint}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-[10px] flex-wrap">
              {LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className="h-[38px] px-[14px] rounded-[19px]"
                  style={{
                    ...monoFont,
                    fontSize: 15,
                    fontWeight: 700,
                    background: enabledLevels.has(level) ? `${levelColors[level]}20` : 'transparent',
                    color: enabledLevels.has(level) ? levelColors[level] : 'var(--mc-text-faint)',
                    border: `2px solid ${enabledLevels.has(level) ? levelColors[level] : 'var(--mc-border-soft)'}`,
                  }}
                >
                  {level}
                </button>
              ))}
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="关键词搜索"
                className="h-[38px] px-[14px] rounded-[19px] outline-none min-w-[180px]"
                style={{ ...monoFont, fontSize: 15, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
              />
              <input
                value={loggerKeyword}
                onChange={e => setLoggerKeyword(e.target.value)}
                placeholder="Logger 过滤"
                className="h-[38px] px-[14px] rounded-[19px] outline-none min-w-[180px]"
                style={{ ...monoFont, fontSize: 15, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
              />
              <input
                value={keywordBlacklist}
                onChange={e => setKeywordBlacklist(e.target.value)}
                placeholder="屏蔽词，多个用逗号分隔"
                className="h-[38px] px-[14px] rounded-[19px] outline-none min-w-[240px] flex-1"
                style={{ ...monoFont, fontSize: 15, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
              />
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto rounded-[16px]" style={{ background: 'var(--mc-panel-bg-soft)', border: '1px solid var(--mc-border-soft)' }}>
              {loading ? (
                <div className="h-full flex items-center justify-center" style={{ ...monoFont, fontSize: 18, color: 'var(--mc-text-faint)' }}>加载中...</div>
              ) : filteredLines.length === 0 ? (
                <div className="h-full flex items-center justify-center" style={{ ...monoFont, fontSize: 18, color: 'var(--mc-text-faint)' }}>暂无日志</div>
              ) : (
                <table className="w-full border-collapse" style={{ ...monoFont, fontSize: 14 }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, background: 'var(--mc-chart-tooltip-bg)', zIndex: 1 }}>
                      <th className="text-left px-[12px] py-[8px]" style={{ width: 190, color: 'var(--mc-text-muted)' }}>时间</th>
                      <th className="text-left px-[12px] py-[8px]" style={{ width: 90, color: 'var(--mc-text-muted)' }}>级别</th>
                      <th className="text-left px-[12px] py-[8px]" style={{ width: 220, color: 'var(--mc-text-muted)' }}>来源</th>
                      <th className="text-left px-[12px] py-[8px]" style={{ color: 'var(--mc-text-muted)' }}>消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line, index) => (
                      <tr key={`${line.timestamp}-${index}`} style={{ transition: 'background-color 200ms ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--mc-control-bg-soft)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <td className="px-[12px] py-[7px] whitespace-nowrap" style={{ color: 'var(--mc-text-muted)' }}>{line.timestamp ? line.timestamp.replace('T', ' ').slice(0, 19) : '-'}</td>
                        <td className="px-[12px] py-[7px] font-bold whitespace-nowrap" style={{ color: levelColors[line.level] || 'var(--mc-text-secondary)' }}>{line.level}</td>
                        <td className="px-[12px] py-[7px] truncate max-w-[220px]" style={{ color: 'var(--mc-text-secondary)' }}>{line.logger || '-'}</td>
                        <td className="px-[12px] py-[7px] break-all" style={{ color: 'var(--mc-text-primary)' }}>{line.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between gap-[12px] flex-wrap">
              <div className="flex items-center gap-[10px]">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="h-[40px] px-[16px] rounded-[20px] disabled:opacity-30"
                  style={{ ...monoFont, fontSize: 15, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
                >
                  上一页
                </button>
                <span style={{ ...monoFont, fontSize: 14, color: 'var(--mc-text-muted)' }}>{currentPage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="h-[40px] px-[16px] rounded-[20px] disabled:opacity-30"
                  style={{ ...monoFont, fontSize: 15, border: '2px solid var(--mc-border-soft)', background: 'var(--mc-control-bg)', color: 'var(--mc-text-primary)' }}
                >
                  下一页
                </button>
              </div>

              <div className="flex items-center gap-[10px]">
                <span style={{ ...monoFont, fontSize: 14, color: 'var(--mc-text-muted)' }}>总计 {total} 行</span>
                <button
                  type="button"
                  onClick={() => setAutoScroll(prev => !prev)}
                  className="h-[40px] px-[16px] rounded-[20px]"
                  style={{
                    ...monoFont,
                    fontSize: 15,
                    border: `2px solid ${autoScroll ? 'rgba(34,197,94,0.35)' : 'var(--mc-border-soft)'}`,
                    background: autoScroll ? 'rgba(34,197,94,0.16)' : 'var(--mc-control-bg)',
                    color: autoScroll ? '#15803d' : 'var(--mc-text-primary)',
                  }}
                >
                  自动滚动 {autoScroll ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
