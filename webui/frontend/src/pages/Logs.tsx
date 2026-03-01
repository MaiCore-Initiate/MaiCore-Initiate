import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import GlassCard from '../components/ui/GlassCard'

const monoFont = { fontFamily: "'Ubuntu','HarmonyOS Sans SC', monospace" }
const pageTitleStyle = { fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))' }
const pillShadow = "absolute inset-0 rounded-[27px] pointer-events-none"
const pillShadowStyle = { border: '2px solid rgba(0,0,0,0.5)', boxShadow: '2px 3px 6px rgba(0,0,0,0.15)' }

interface LogFile { name: string; size: number; date: string; type: 'main' | 'webui' }
interface LogLine { timestamp: string; level: string; logger: string; message: string }

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
const levelColors: Record<string, string> = { DEBUG: '#06b6d4', INFO: '#22c55e', WARNING: '#f59e0b', ERROR: '#ef4444' }

const PAGE_SIZE = 200

/* 自定义下拉框 - 参考 Deployment.tsx CustomSelect */
function CustomSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxH: 240 })
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      const dropUp = spaceBelow < 150 && spaceAbove > spaceBelow
      const maxH = Math.min(240, dropUp ? spaceAbove : spaceBelow)
      setPos({ top: dropUp ? r.top - Math.max(maxH, 60) - 4 : r.bottom + 4, left: r.left, width: r.width, maxH: Math.max(maxH, 60) })
    }
  }, [open])
  const sel = options.find(o => o.value === value)
  return (
    <div ref={ref} className="relative">
      <button ref={btnRef} onClick={() => setOpen(!open)}
        className="h-[50px] px-[22px] rounded-[25px] bg-white/60 border-2 border-black/50 flex items-center justify-between cursor-pointer min-w-[280px] gap-[12px]"
        style={{ ...monoFont, fontSize: 20 }}>
        <span className={sel ? 'text-black truncate' : 'text-black/30 truncate'}>{sel?.label || placeholder || '请选择'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0"><path d="M6 9l6 6 6-6" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" /></svg>
      </button>
      {open && options.length > 0 && createPortal(
        <div className="fixed rounded-[20px] bg-white/95 backdrop-blur-xl border-2 border-black/30 overflow-y-auto custom-scrollbar"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH, zIndex: 9999, boxShadow: '4px 4px 12px rgba(0,0,0,0.15)' }}
          onMouseDown={e => e.stopPropagation()}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full px-[22px] py-[10px] text-left hover:bg-black/5 transition-colors cursor-pointer"
              style={{ ...monoFont, fontSize: 18, background: o.value === value ? 'rgba(0,0,0,0.06)' : undefined }}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

/* 日志源选择器 - 参考 Knowledge.tsx ModeSelector */
function LogSourceSelector({ value, onChange }: { value: 'main' | 'webui'; onChange: (v: 'main' | 'webui') => void }) {
  const isMain = value === 'main'
  return (
    <div className="relative shrink-0 flex items-center" style={{ width: 280, height: 50 }}>
      <div className="absolute inset-0 rounded-[25px] pointer-events-none" style={{ border: '2px solid rgba(0,0,0,0.5)', boxShadow: '3px 3px 4.5px rgba(0,0,0,0.16)' }} />
      <div
        className="absolute top-[5px] rounded-[20px] bg-white transition-all duration-300 ease-in-out"
        style={{
          height: 40, width: 134,
          left: isMain ? 4 : 142,
          border: '1px solid rgba(0,0,0,0.5)', boxShadow: '3px 3px 4.5px rgba(0,0,0,0.16)',
        }}
      />
      <button className="h-full flex items-center justify-center cursor-pointer relative z-10" style={{ width: 140, fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }} onClick={() => onChange('main')}>主程序日志</button>
      <button className="h-full flex items-center justify-center cursor-pointer relative z-10" style={{ width: 140, fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }} onClick={() => onChange('webui')}>WebUI日志</button>
    </div>
  )
}

export default function Logs() {
  const [source, setSource] = useState<'main' | 'webui'>('main')
  const [files, setFiles] = useState<LogFile[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [lines, setLines] = useState<LogLine[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)

  // 过滤状态
  const [enabledLevels, setEnabledLevels] = useState<Set<string>>(new Set(LEVELS))
  const [keyword, setKeyword] = useState('')
  const [loggerFilter, setLoggerFilter] = useState<string[]>([])
  const [loggerInput, setLoggerInput] = useState('')
  const [loggerMode, setLoggerMode] = useState<'blacklist' | 'whitelist'>('blacklist')
  const [keywordBlacklist, setKeywordBlacklist] = useState<string[]>([])
  const [kwBlackInput, setKwBlackInput] = useState('')
  const [autoScroll, setAutoScroll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 加载文件列表
  useEffect(() => {
    fetch('/api/logs/files', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setFiles(d.files) })
      .catch(() => {})
  }, [])

  const filteredFiles = files.filter(f => f.type === source)

  // 切换source时自动选第一个文件
  useEffect(() => {
    const first = filteredFiles[0]
    setSelectedFile(first?.name ?? '')
    setOffset(0)
  }, [source, files.length])

  // 加载日志内容
  const fetchContent = useCallback(() => {
    if (!selectedFile) { setLines([]); setTotal(0); return }
    setLoading(true)
    fetch(`/api/logs/content/${encodeURIComponent(selectedFile)}?offset=${offset}&limit=${PAGE_SIZE}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) { setLines(d.lines); setTotal(d.total) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedFile, offset])

  useEffect(() => { fetchContent() }, [fetchContent])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  // 前端过滤
  const filtered = lines.filter(l => {
    if (!enabledLevels.has(l.level)) return false
    if (keyword && !l.message.toLowerCase().includes(keyword.toLowerCase()) && !l.logger.toLowerCase().includes(keyword.toLowerCase())) return false
    if (keywordBlacklist.length > 0 && keywordBlacklist.some(kw => l.message.toLowerCase().includes(kw.toLowerCase()))) return false
    if (loggerFilter.length > 0) {
      const match = loggerFilter.some(f => l.logger.includes(f))
      if (loggerMode === 'blacklist' && match) return false
      if (loggerMode === 'whitelist' && !match) return false
    }
    return true
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const toggleLevel = (lv: string) => {
    setEnabledLevels(prev => {
      const next = new Set(prev)
      if (next.has(lv)) next.delete(lv); else next.add(lv)
      return next
    })
  }

  const addLogger = () => {
    const v = loggerInput.trim()
    if (v && !loggerFilter.includes(v)) setLoggerFilter(prev => [...prev, v])
    setLoggerInput('')
  }

  const addKwBlack = () => {
    const v = kwBlackInput.trim()
    if (v && !keywordBlacklist.includes(v)) setKeywordBlacklist(prev => [...prev, v])
    setKwBlackInput('')
  }

  return (
    <div className="flex flex-col p-6 h-full">
      <h1 className="text-black shrink-0 mb-[16px] animate-card-enter" style={pageTitleStyle}>日志查看器</h1>
      <div className="flex-1 min-h-0 animate-card-enter" style={{ animationDelay: '80ms' }}>
        <GlassCard>
          <div className="p-[28px] flex flex-col h-full">
            {/* 顶部栏 */}
            <div className="flex items-center gap-[16px] flex-wrap">
              <LogSourceSelector value={source} onChange={setSource} />
              <CustomSelect
                value={selectedFile}
                onChange={v => { setSelectedFile(v); setOffset(0) }}
                options={filteredFiles.length === 0
                  ? [{ value: '', label: '无日志文件' }]
                  : filteredFiles.map(f => ({ value: f.name, label: `${f.name} (${(f.size / 1024).toFixed(1)}KB)` }))}
                placeholder="选择日志文件"
              />
            </div>

            {/* 过滤栏 */}
            <div className="flex items-center gap-[10px] mt-[12px] flex-wrap">
              {LEVELS.map(lv => (
                <button
                  key={lv}
                  onClick={() => toggleLevel(lv)}
                  className="h-[40px] px-[18px] rounded-[20px] cursor-pointer transition-all duration-200 relative"
                  style={{
                    background: enabledLevels.has(lv) ? levelColors[lv] + '22' : 'transparent',
                    color: enabledLevels.has(lv) ? levelColors[lv] : 'rgba(0,0,0,0.25)',
                    border: `2px solid ${enabledLevels.has(lv) ? levelColors[lv] : 'rgba(0,0,0,0.15)'}`,
                    ...monoFont, fontSize: 18, fontWeight: 600,
                  }}
                >{lv}</button>
              ))}
              <input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="关键词搜索..."
                className="h-[40px] px-[16px] rounded-[20px] bg-white/60 outline-none flex-1 min-w-[160px]"
                style={{ ...monoFont, fontSize: 18, border: '2px solid rgba(0,0,0,0.3)' }}
              />
            </div>

            {/* Logger过滤栏 */}
            <div className="flex items-center gap-[8px] mt-[8px] flex-wrap">
              <button
                onClick={() => setLoggerMode(prev => prev === 'blacklist' ? 'whitelist' : 'blacklist')}
                className="h-[36px] px-[14px] rounded-[18px] cursor-pointer"
                style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.3)', background: loggerMode === 'whitelist' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}
              >{loggerMode === 'blacklist' ? '黑名单' : '白名单'}</button>
              <input
                value={loggerInput}
                onChange={e => setLoggerInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addLogger() }}
                placeholder="Logger名称"
                className="h-[36px] px-[12px] rounded-[18px] bg-white/60 outline-none"
                style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.2)', width: 180 }}
              />
              <button onClick={addLogger} className="h-[36px] px-[12px] rounded-[18px] cursor-pointer" style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.3)' }}>添加</button>
              {loggerFilter.map(name => (
                <span key={name} className="h-[36px] px-[12px] rounded-[18px] flex items-center gap-[6px]" style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.2)' }}>
                  {name}
                  <button className="cursor-pointer hover:text-red-500" onClick={() => setLoggerFilter(prev => prev.filter(n => n !== name))}>×</button>
                </span>
              ))}
            </div>

            {/* 关键词黑名单栏 */}
            <div className="flex items-center gap-[8px] mt-[8px] flex-wrap">
              <span className="h-[36px] px-[14px] rounded-[18px] flex items-center" style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.3)', background: 'rgba(239,68,68,0.15)' }}>关键词屏蔽</span>
              <input
                value={kwBlackInput}
                onChange={e => setKwBlackInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addKwBlack() }}
                placeholder="屏蔽关键词"
                className="h-[36px] px-[12px] rounded-[18px] bg-white/60 outline-none"
                style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.2)', width: 180 }}
              />
              <button onClick={addKwBlack} className="h-[36px] px-[12px] rounded-[18px] cursor-pointer" style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(0,0,0,0.3)' }}>添加</button>
              {keywordBlacklist.map(kw => (
                <span key={kw} className="h-[36px] px-[12px] rounded-[18px] flex items-center gap-[6px]" style={{ ...monoFont, fontSize: 16, border: '2px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
                  {kw}
                  <button className="cursor-pointer hover:text-red-500" onClick={() => setKeywordBlacklist(prev => prev.filter(k => k !== kw))}>×</button>
                </span>
              ))}
            </div>
            <div ref={scrollRef} className="flex-1 mt-[12px] overflow-auto rounded-[16px]" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.1)' }}>
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-black/30" style={{ ...monoFont, fontSize: 20 }}>加载中...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-black/30" style={{ ...monoFont, fontSize: 20 }}>暂无日志</span>
                </div>
              ) : (
                <table className="w-full border-collapse" style={{ ...monoFont, fontSize: 16 }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.9)', zIndex: 1 }}>
                      <th className="text-left px-[12px] py-[8px] text-black/50" style={{ width: 200 }}>时间</th>
                      <th className="text-left px-[12px] py-[8px] text-black/50" style={{ width: 80 }}>级别</th>
                      <th className="text-left px-[12px] py-[8px] text-black/50" style={{ width: 200 }}>发出者</th>
                      <th className="text-left px-[12px] py-[8px] text-black/50">消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l, i) => (
                      <tr key={i} className="hover:bg-black/[0.03]" style={{ height: 32 }}>
                        <td className="px-[12px] text-black/40 whitespace-nowrap">{l.timestamp.replace('T', ' ').slice(0, 19)}</td>
                        <td className="px-[12px] font-bold whitespace-nowrap" style={{ color: levelColors[l.level] || '#666' }}>{l.level}</td>
                        <td className="px-[12px] text-black/60 truncate max-w-[200px]">{l.logger}</td>
                        <td className="px-[12px] text-black/80 break-all">{l.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 底部栏 */}
            <div className="flex items-center justify-between mt-[10px] shrink-0">
              <div className="flex items-center gap-[10px]">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="h-[40px] px-[18px] rounded-[20px] cursor-pointer disabled:opacity-30 relative"
                  style={{ ...monoFont, fontSize: 18 }}
                >
                  <div className={pillShadow} style={pillShadowStyle} />
                  上一页
                </button>
                <span className="text-black/50" style={{ ...monoFont, fontSize: 18 }}>{currentPage} / {totalPages || 1}</span>
                <button
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="h-[40px] px-[18px] rounded-[20px] cursor-pointer disabled:opacity-30 relative"
                  style={{ ...monoFont, fontSize: 18 }}
                >
                  <div className={pillShadow} style={pillShadowStyle} />
                  下一页
                </button>
              </div>
              <button
                onClick={() => setAutoScroll(prev => !prev)}
                className="h-[40px] px-[18px] rounded-[20px] cursor-pointer relative"
                style={{ ...monoFont, fontSize: 18, background: autoScroll ? 'rgba(34,197,94,0.15)' : 'transparent' }}
              >
                <div className={pillShadow} style={pillShadowStyle} />
                自动滚动 {autoScroll ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
