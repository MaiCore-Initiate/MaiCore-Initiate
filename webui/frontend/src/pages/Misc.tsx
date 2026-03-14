import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import GlassCard from '../components/ui/GlassCard'
import ComponentDownload from './ComponentDownload'
import WebShell from './WebShell'
import { cn } from '../lib/utils'
import { Package, User, Cpu, BookOpen, FileText, Download, Terminal, Monitor, RefreshCw, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseMiscContent, type MiscContent, type Contributor, type Library } from '../lib/misc-parser'
import { useBgContext } from '../components/background/DynamicBackground'
import { DesktopPetManager } from '../components/live2d/DesktopPet'

const pageTitleStyle = {
  fontSize: 60,
  fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
  filter: 'drop-shadow(3px 3px 6px rgba(0,0,0,0.37))'
}

const sectionTitle = {
  fontSize: 40,
  fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif"
}

const labelFont = {
  fontSize: 25,
  fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif"
}

const textFont = {
  fontSize: 20,
  fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif"
}

const monoFont = {
  fontFamily: "'Ubuntu Mono', 'Cascadia Code', monospace"
}

const d = (i: number) => ({ animationDelay: `${i * 80}ms` })

type MiscTab = 'about' | 'author' | 'tech' | 'libs' | 'license' | 'components' | 'webshell' | 'screensaver' | 'desktop-pet'

type DailyQuote = {
  text: string
  from: string
}

const QUOTE_REFRESH_MS = 20 * 60 * 1000
const ESC_HOLD_MS = 1200
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v']
const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const FALLBACK_QUOTES: DailyQuote[] = [
  { text: '慢一点也没关系，只要方向是向前的。', from: 'MaiCore' },
  { text: '把今天能做好的事做到位，明天自然会更轻松。', from: 'MaiCore' },
  { text: '所有看似突然的进步，都是日复一日的积累。', from: 'MaiCore' },
  { text: '先让系统跑起来，再把细节打磨到满意。', from: 'MaiCore' },
]

function pickFallbackQuote(): DailyQuote {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)]
}

function isVideoUrl(url: string | null): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return VIDEO_EXTS.some(ext => lower.endsWith(ext))
}

async function fetchDailyQuote(signal?: AbortSignal): Promise<DailyQuote> {
  try {
    const resp = await fetch('https://v1.hitokoto.cn/?encode=json', { signal })
    if (!resp.ok) return pickFallbackQuote()
    const data = await resp.json()
    const text = typeof data?.hitokoto === 'string' ? data.hitokoto.trim() : ''
    if (!text) return pickFallbackQuote()
    const from = [data?.from_who, data?.from].filter(Boolean).join(' · ')
    return { text, from: from || '每日一言' }
  } catch {
    return pickFallbackQuote()
  }
}

export default function Misc() {
  const [activeTab, setActiveTab] = useState<MiscTab>('about')
  const [content, setContent] = useState<MiscContent | null>(null)
  const [loading, setLoading] = useState(true)
  const compactMode = activeTab === 'webshell' || activeTab === 'screensaver' || activeTab === 'desktop-pet'

  const startScreenSaver = useCallback(async () => {
    setActiveTab('screensaver')
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // 某些浏览器会拒绝非激活态全屏，屏保层仍会显示并允许手动重试
    }
  }, [])

  useEffect(() => {
    parseMiscContent()
      .then(data => {
        console.log('Parsed content:', data)
        setContent(data)
      })
      .catch(err => {
        console.error('Parse error:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black/50"></div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-black/50" style={textFont}>加载内容失败</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页面标题和标签 */}
      <div className={`transition-all duration-500 ${compactMode ? 'p-4' : 'p-6'}`}>
        <div className="flex items-center gap-4 animate-fade-slide-up" style={d(0)}>
          <h1 className="text-black/80" style={pageTitleStyle}>
            杂项
          </h1>

          {/* WebShell/屏保激活时显示的小标签 */}
          {compactMode && (
            <button
              onClick={() => setActiveTab('about')}
              className="px-6 py-3 rounded-2xl border-2 bg-white/60 border-black/50 text-black/80 flex items-center gap-2 shadow-md hover:bg-white/70 transition-all animate-scale-in"
              style={labelFont}
            >
              {activeTab === 'webshell' ? <Terminal size={20} /> : <Monitor size={20} />}
              {activeTab === 'webshell' ? 'WebShell' : activeTab === 'desktop-pet' ? '桌宠' : '屏保模式'}
            </button>
          )}
        </div>

        {/* 标签页导航 - WebShell/屏保时隐藏 */}
        {!compactMode && (
          <div className="animate-fade-slide-up mt-6" style={d(1)}>
            <GlassCard>
              <div className="p-[14px]">
                <div className="flex gap-[10px] overflow-x-auto whitespace-nowrap pb-[2px] [scrollbar-width:thin]">
                {[
                  { key: 'about', label: '关于项目', icon: Package },
                  { key: 'author', label: '关于作者', icon: User },
                  { key: 'tech', label: '技术栈', icon: Cpu },
                  { key: 'libs', label: '开源库', icon: BookOpen },
                  { key: 'license', label: '开源许可', icon: FileText },
                  { key: 'components', label: '组件下载', icon: Download },
                  { key: 'webshell', label: 'WebShell', icon: Terminal },
                  { key: 'screensaver', label: '屏保', icon: Monitor },
                  { key: 'desktop-pet', label: '桌宠', icon: Monitor },
                ].map(tab => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      onClick={() => {
                        if (tab.key === 'screensaver') {
                          void startScreenSaver()
                          return
                        }
                        setActiveTab(tab.key as MiscTab)
                      }}
                      className={cn(
                        'px-[16px] py-[8px] rounded-[16px] border-2 transition-all flex items-center gap-[6px] shrink-0',
                        activeTab === tab.key
                          ? 'bg-white/60 border-black/50 text-black/80'
                          : 'bg-white/20 border-black/30 text-black/50 hover:bg-white/40'
                      )}
                      style={{ ...labelFont, fontSize: 21, boxShadow: activeTab === tab.key ? '2px 3px 6px rgba(0,0,0,0.15)' : 'none' }}
                    >
                      <Icon size={18} />
                      {tab.label}
                    </button>
                  )
                })}
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className={`flex-1 overflow-auto transition-all duration-500 ${compactMode ? 'px-4 pb-4' : 'px-6 pb-6'}`}>
        {activeTab === 'about' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <AboutProject content={content.about} />
          </div>
        )}
        {activeTab === 'author' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <AboutAuthor contributors={content.author.contributors} footer={content.author.footer} />
          </div>
        )}
        {activeTab === 'tech' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <TechStack tech={content.tech} />
          </div>
        )}
        {activeTab === 'libs' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <OpenSourceLibs libraries={content.libs.libraries} footer={content.libs.footer} />
          </div>
        )}
        {activeTab === 'license' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <License content={content.license} />
          </div>
        )}
        {activeTab === 'components' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <ComponentDownloadTab />
          </div>
        )}
        {activeTab === 'webshell' && (
          <div className="h-full animate-fade-in">
            <WebShellTab />
          </div>
        )}
        {activeTab === 'desktop-pet' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <DesktopPetTab />
          </div>
        )}
        {activeTab === 'screensaver' && (
          <div className="h-full animate-fade-in">
            <ScreenSaverTab onExit={() => setActiveTab('about')} />
          </div>
        )}
      </div>
    </div>
  )
}

/** 关于项目 */
function AboutProject({ content }: { content: string }) {
  return (
    <GlassCard>
      <div className="p-[40px] prose prose-slate max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => (
              <h2 className="text-black/80 mb-4" style={sectionTitle}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-black/70 mb-3" style={{ ...labelFont, fontSize: 28 }}>{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-black/60 mb-3" style={textFont}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="space-y-[8px] text-black/60 mb-4" style={textFont}>{children}</ul>
            ),
            li: ({ children }) => (
              <li className="ml-4">• {children}</li>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline" style={textFont}>
                {children}
              </a>
            ),
            strong: ({ children }) => (
              <strong className="text-black/80" style={labelFont}>{children}</strong>
            ),
            blockquote: ({ children }) => (
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 rounded-[20px] p-[24px] border-2 border-black/10 my-4">
                <div className="text-black/70 text-center" style={{ ...textFont, fontSize: 22 }}>
                  {children}
                </div>
              </div>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </GlassCard>
  )
}

/** 关于作者 */
function AboutAuthor({ contributors, footer }: { contributors: Contributor[], footer: string }) {
  return (
    <GlassCard>
      <div className="p-[40px] space-y-[30px]">
        <h2 className="text-black/80" style={sectionTitle}>贡献者</h2>

        <div className="space-y-[24px]">
          {contributors.map((contributor, index) => (
            <ContributorCard key={index} contributor={contributor} />
          ))}
        </div>

        <div className="text-center pt-[16px]">
          <p className="text-black/50" style={textFont}>
            {footer}
          </p>
        </div>
      </div>
    </GlassCard>
  )
}

/** 贡献者卡片组件 */
function ContributorCard({ contributor }: { contributor: Contributor }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const avatarUrl = `https://github.com/${contributor.username}.png?size=120`

  return (
    <a
      href={contributor.github}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white/30 rounded-[20px] p-[24px] border-2 border-black/10 hover:bg-white/40 hover:border-black/20 transition-all"
    >
      <div className="flex items-center gap-[16px] mb-[16px]">
        <div className="relative w-[60px] h-[60px] rounded-full overflow-hidden">
          {/* 占位符背景 - 使用内联样式确保渐变生效 */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center text-white text-[28px] font-bold transition-opacity duration-300',
              imageLoaded && !imageError ? 'opacity-0' : 'opacity-100'
            )}
            style={{
              background: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
              '--tw-gradient-from': contributor.fallbackColor.includes('blue') ? '#60a5fa' :
                                     contributor.fallbackColor.includes('green') ? '#4ade80' :
                                     contributor.fallbackColor.includes('orange') ? '#fb923c' : '#a78bfa',
              '--tw-gradient-to': contributor.fallbackColor.includes('purple') ? '#a78bfa' :
                                   contributor.fallbackColor.includes('teal') ? '#2dd4bf' :
                                   contributor.fallbackColor.includes('red') ? '#f87171' : '#c084fc',
              '--tw-gradient-stops': 'var(--tw-gradient-from), var(--tw-gradient-to)'
            } as React.CSSProperties}
          >
            {contributor.fallbackInitial}
          </div>

          {/* GitHub 头像 */}
          {!imageError && (
            <img
              src={avatarUrl}
              alt={contributor.name}
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-black/80 flex items-center gap-[8px]" style={{ ...labelFont, fontSize: 28 }}>
            {contributor.name}
            <span className="text-black/40" style={{ ...monoFont, fontSize: 18 }}>
              @{contributor.username}
            </span>
          </h3>
          <p className="text-black/50" style={textFont}>{contributor.role}</p>
        </div>
      </div>
      <p className="text-black/60" style={textFont}>
        {contributor.desc}
      </p>
    </a>
  )
}

/** 技术栈 */
function TechStack({ tech }: { tech: MiscContent['tech'] }) {
  console.log('TechStack received:', tech)

  const sections = [
    { title: '后端', items: tech.backend },
    { title: '前端', items: tech.frontend },
    { title: '数据库', items: tech.database },
    { title: '工具链', items: tech.toolchain }
  ]

  return (
    <GlassCard>
      <div className="p-[40px] space-y-[30px]">
        <h2 className="text-black/80" style={sectionTitle}>技术栈</h2>

        {sections.map((section, idx) => (
          <div key={idx} className="space-y-[16px]">
            <h3 className="text-black/70" style={{ ...labelFont, fontSize: 28 }}>{section.title}</h3>
            {section.items.length > 0 ? (
              <div className="grid grid-cols-1 gap-[12px]">
                {section.items.map((item, i) => (
                  <div key={i} className="bg-white/30 rounded-[16px] p-[20px] border-2 border-black/10 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-[12px]">
                        <span className="text-black/80 font-semibold" style={labelFont}>{item.name}</span>
                        {item.version !== '-' && (
                          <span className="px-[12px] py-[4px] bg-blue-100/50 rounded-[8px] text-blue-700" style={{ ...monoFont, fontSize: 16 }}>
                            {item.version}
                          </span>
                        )}
                      </div>
                      <p className="text-black/50 mt-[4px]" style={{ ...textFont, fontSize: 18 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-black/40" style={textFont}>暂无数据</p>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/** 开源库 */
function OpenSourceLibs({ libraries, footer }: { libraries: Library[], footer: string }) {
  return (
    <GlassCard>
      <div className="p-[40px] space-y-[30px]">
        <h2 className="text-black/80" style={sectionTitle}>开源库</h2>
        <p className="text-black/60" style={textFont}>
          {footer}
        </p>

        <div className="grid grid-cols-1 gap-[12px]">
          {libraries.map((lib, idx) => (
            <div key={idx} className="bg-white/30 rounded-[16px] p-[20px] border-2 border-black/10">
              <div className="flex items-center justify-between mb-[8px]">
                <span className="text-black/80 font-semibold" style={labelFont}>{lib.name}</span>
                <span className="px-[12px] py-[4px] bg-green-100/50 rounded-[8px] text-green-700" style={{ ...monoFont, fontSize: 16 }}>
                  {lib.license}
                </span>
              </div>
              <p className="text-black/50" style={{ ...textFont, fontSize: 18 }}>{lib.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

/** 开源许可 */
function License({ content }: { content: string }) {
  return (
    <GlassCard>
      <div className="p-[40px] prose prose-slate max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => (
              <h2 className="text-black/80 mb-4" style={sectionTitle}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-black/80 mb-3" style={{ ...labelFont, fontSize: 32 }}>{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-black/70 font-semibold mb-2" style={labelFont}>{children}</h4>
            ),
            p: ({ children }) => (
              <p className="text-black/60 mb-3" style={textFont}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="space-y-[6px] ml-[20px] mb-4 text-black/60" style={textFont}>{children}</ul>
            ),
            li: ({ children }) => (
              <li>• {children}</li>
            ),
            strong: ({ children }) => (
              <strong className="text-black/80">{children}</strong>
            ),
            blockquote: ({ children }) => (
              <div className="mt-[24px] pt-[24px] border-t-2 border-black/10">
                <div className="text-black/50 text-center" style={{ ...textFont, fontSize: 18 }}>
                  {children}
                </div>
              </div>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </GlassCard>
  )
}

/** 组件下载标签页 */
function ComponentDownloadTab() {
  return (
    <div className="-m-6">
      <ComponentDownload />
    </div>
  )
}

function ScreenSaverTab({ onExit }: { onExit: () => void }) {
  return <ScreenSaverOverlay onExit={onExit} />
}

function ScreenSaverOverlay({ onExit }: { onExit: () => void }) {
  const { currentBgUrl } = useBgContext()
  const [now, setNow] = useState(() => new Date())
  const [quote, setQuote] = useState<DailyQuote>({ text: '正在加载每日一言...', from: '系统' })
  const [refreshing, setRefreshing] = useState(false)
  const [fullScreenLost, setFullScreenLost] = useState(false)
  const [escProgress, setEscProgress] = useState(0)
  const escTimeoutRef = useRef<number | null>(null)
  const escProgressRef = useRef<number | null>(null)
  const escHoldStartRef = useRef<number>(0)
  const exitingRef = useRef(false)

  const timeText = useMemo(
    () => now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    [now]
  )
  const dateText = useMemo(
    () => `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY_CN[now.getDay()]}`,
    [now]
  )

  const clearEscHold = useCallback(() => {
    if (escTimeoutRef.current !== null) {
      window.clearTimeout(escTimeoutRef.current)
      escTimeoutRef.current = null
    }
    if (escProgressRef.current !== null) {
      window.clearInterval(escProgressRef.current)
      escProgressRef.current = null
    }
    setEscProgress(0)
  }, [])

  const exitSaver = useCallback(async () => {
    if (exitingRef.current) return
    exitingRef.current = true
    clearEscHold()
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // 忽略全屏退出异常，继续返回普通界面
    } finally {
      onExit()
    }
  }, [clearEscHold, onExit])

  const refreshQuote = useCallback(async () => {
    setRefreshing(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    const next = await fetchDailyQuote(controller.signal)
    window.clearTimeout(timeout)
    setQuote(next)
    setRefreshing(false)
  }, [])

  // 每秒更新时间
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // 每日一言：初始化 + 20 分钟轮询
  useEffect(() => {
    void refreshQuote()
    const id = window.setInterval(() => void refreshQuote(), QUOTE_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refreshQuote])

  // 进入屏保时尽力进入浏览器全屏
  useEffect(() => {
    let cancelled = false
    const ensureFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen()
        }
      } catch {
        if (!cancelled) {
          setFullScreenLost(true)
        }
      }
    }

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        setFullScreenLost(false)
        return
      }
      if (!exitingRef.current) {
        setFullScreenLost(true)
      }
    }

    void ensureFullscreen()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      cancelled = true
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // 长按 Esc 退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (e.repeat || escTimeoutRef.current !== null) return

      escHoldStartRef.current = Date.now()
      setEscProgress(0.01)

      escProgressRef.current = window.setInterval(() => {
        const elapsed = Date.now() - escHoldStartRef.current
        setEscProgress(Math.min(1, elapsed / ESC_HOLD_MS))
      }, 16)

      escTimeoutRef.current = window.setTimeout(() => {
        void exitSaver()
      }, ESC_HOLD_MS)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      clearEscHold()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      clearEscHold()
    }
  }, [clearEscHold, exitSaver])

  return (
    <div className="fixed inset-0 z-[9999] text-white select-none overflow-hidden">
      {currentBgUrl && (isVideoUrl(currentBgUrl) ? (
        <video src={currentBgUrl} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${currentBgUrl}')` }} />
      ))}

      <button
        onClick={() => void exitSaver()}
        className="absolute right-6 top-6 z-20 inline-flex h-11 items-center justify-center rounded-full border border-white/65 bg-black/35 px-4 text-white/95 backdrop-blur-sm hover:bg-black/50 transition"
        style={{ fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontSize: 19 }}
      >
        <span className="inline-flex items-center gap-2 leading-none">
          <X size={17} className="shrink-0" />
          <span className="relative top-px">退出</span>
        </span>
      </button>

      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="w-full max-w-[1100px] text-center min-h-[78vh] py-[5vh] flex flex-col justify-between">
          <div className="-translate-y-[5vh]">
            <div
              className="text-white tracking-[2px] leading-none"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(76px, 13.5vw, 180px)',
                textShadow: '0 14px 46px rgba(0,0,0,0.68), 0 3px 14px rgba(0,0,0,0.58)',
              }}
            >
              {timeText}
            </div>

            <div
              className="mt-4 text-white/90"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(20px, 2.2vw, 34px)',
                textShadow: '0 7px 24px rgba(0,0,0,0.62), 0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              {dateText}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[940px] px-4">
            <div className="mx-auto mb-10 h-[1px] w-[min(78vw,860px)] bg-white/55" />

            <p
              className="text-white/95 leading-relaxed"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(20px, 2.2vw, 32px)',
                textShadow: '0 8px 30px rgba(0,0,0,0.62), 0 2px 10px rgba(0,0,0,0.48)',
              }}
            >
              {quote.text}
            </p>
            <p
              className="mt-5 text-white/75"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(14px, 1.2vw, 18px)',
                textShadow: '0 5px 16px rgba(0,0,0,0.62), 0 1px 6px rgba(0,0,0,0.5)',
              }}
            >
              {quote.from}
            </p>

            <div className="mt-9 flex items-center justify-center gap-4">
              <button
                onClick={() => void refreshQuote()}
                disabled={refreshing}
                className="mx-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/70 bg-black/35 px-5 py-2 text-white/95 hover:bg-black/50 disabled:opacity-60 transition"
                style={{ fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontSize: 18 }}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                <span className="leading-none">刷新一言</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 bottom-6 z-20 -translate-x-1/2 w-[min(460px,88vw)]">
        <div
          className="text-center text-white/85"
          style={{ fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontSize: 16 }}
        >
          长按 Esc 退出屏保
        </div>
        <div className="mt-2 h-[4px] rounded-full bg-white/25 overflow-hidden">
          <div className="h-full rounded-full bg-white/90 transition-[width] duration-75" style={{ width: `${Math.round(escProgress * 100)}%` }} />
        </div>
      </div>

      {fullScreenLost && (
        <button
          onClick={() => void document.documentElement.requestFullscreen().then(() => setFullScreenLost(false)).catch(() => {})}
          className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full border border-white/65 bg-black/35 px-4 py-2 text-white/95 hover:bg-black/50 transition"
          style={{ fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontSize: 18 }}
        >
          浏览器未进入全屏，点击重试
        </button>
      )}
    </div>
  )
}

/** WebShell 标签页 */
function WebShellTab() {
  return (
    <div className="h-full">
      <WebShell />
    </div>
  )
}

/** 桌宠标签页 — 包含 exe 路径配置、启停控制、使用时长统计 */
function DesktopPetTab() {
  return (
    <div className="space-y-4">
      <ExePathCard />
      <PetLaunchCard />
      <UsageStatsCard />
    </div>
  )
}

/** exe 路径检测与手动配置卡片 */
function ExePathCard() {
  const [found, setFound] = useState<boolean | null>(null)
  const [exePath, setExePath] = useState('')
  const [manualPath, setManualPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/settings/live2d/electron/find', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setFound(d.found ?? false)
        setExePath(d.path ?? '')
      })
      .catch(() => setFound(false))
  }, [])

  const handleSave = async () => {
    if (!manualPath.trim()) return
    setSaving(true)
    setMsg('')
    try {
      const r = await fetch('/api/settings/live2d/electron/set-path', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: manualPath.trim() }),
      })
      const d = await r.json()
      if (d.success) {
        setFound(true)
        setExePath(d.path)
        setMsg('路径已保存')
      } else {
        setMsg(d.detail || '保存失败')
      }
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard>
      <div className="p-6">
        <h3 className="text-black/70 mb-4" style={labelFont}>桌宠程序路径</h3>
        {found === null ? (
          <p className="text-black/40" style={textFont}>检测中...</p>
        ) : found ? (
          <div className="flex items-center gap-3">
            <span className="text-green-600 text-xl">✅</span>
            <span className="text-black/60 break-all" style={{ ...textFont, fontSize: 16 }}>{exePath}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-xl">⚠️</span>
              <span className="text-black/50" style={textFont}>未找到桌宠程序，请手动指定路径</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualPath}
                onChange={e => setManualPath(e.target.value)}
                placeholder="如: C:\Program Files\Desktop Pet\Desktop Pet.exe"
                className="flex-1 px-3 py-2 rounded-xl border-2 border-black/20 bg-white/50 text-black/70 text-sm focus:outline-none focus:border-black/40"
                style={textFont}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-white/60 border-2 border-black/30 text-black/70 hover:bg-white/80 transition-all"
                style={textFont}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
            {msg && <p className="text-sm text-black/50">{msg}</p>}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

/** 桌宠启停控制卡片 */
function PetLaunchCard() {
  const [status, setStatus] = useState<{ running: boolean; pid?: number | null }>({ running: false })
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/live2d/runtime/status', { credentials: 'include' })
      const d = await r.json()
      setStatus({ running: d.running, pid: d.pid })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void fetchStatus()
    const id = window.setInterval(() => void fetchStatus(), 5000)
    return () => window.clearInterval(id)
  }, [fetchStatus])

  const handleToggle = async () => {
    setLoading(true)
    try {
      const url = status.running
        ? '/api/settings/live2d/runtime/stop'
        : '/api/settings/live2d/runtime/start'
      await fetch(url, { method: 'POST', credentials: 'include' })
      await fetchStatus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassCard>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-black/70" style={labelFont}>桌宠控制</h3>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${status.running ? 'text-green-600' : 'text-black/40'}`} style={textFont}>
              {status.running ? `运行中 (PID: ${status.pid ?? '-'})` : '未运行'}
            </span>
            <button
              onClick={handleToggle}
              disabled={loading}
              className={`px-6 py-2 rounded-2xl border-2 transition-all font-medium ${
                status.running
                  ? 'bg-red-50/60 border-red-300 text-red-600 hover:bg-red-100/70'
                  : 'bg-green-50/60 border-green-300 text-green-600 hover:bg-green-100/70'
              }`}
              style={textFont}
            >
              {loading ? '处理中...' : status.running ? '停止桌宠' : '启动桌宠'}
            </button>
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-black/40 hover:text-black/60 transition-colors text-sm"
          style={textFont}
        >
          {expanded ? '▲ 收起高级设置' : '▼ 展开高级设置'}
        </button>
        {expanded && (
          <div className="mt-4 animate-fade-slide-up">
            <DesktopPetManager />
          </div>
        )}
      </div>
    </GlassCard>
  )
}

type DailyUsage = { date: string; minutes: number }

/** 使用时长统计卡片 */
function UsageStatsCard() {
  const [stats, setStats] = useState<{
    today_minutes: number
    week_minutes: number
    current_session_minutes: number
    daily: DailyUsage[]
    running: boolean
  } | null>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/settings/live2d/usage-stats', { credentials: 'include' })
        .then(r => r.json())
        .then(d => d.success && setStats(d))
        .catch(() => {})
    }
    load()
    const id = window.setInterval(load, 30000)
    return () => window.clearInterval(id)
  }, [])

  if (!stats) return null

  const maxMinutes = Math.max(...stats.daily.map(d => d.minutes), 1)

  const fmtMin = (m: number) => {
    if (m < 60) return `${m} 分钟`
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`
  }

  return (
    <GlassCard>
      <div className="p-6">
        <h3 className="text-black/70 mb-4" style={labelFont}>使用时长统计</h3>

        {/* 3 张数字卡片 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: '今日', value: fmtMin(stats.today_minutes) },
            { label: '本周', value: fmtMin(stats.week_minutes) },
            { label: '当前会话', value: stats.running ? fmtMin(stats.current_session_minutes) : '-' },
          ].map(item => (
            <div key={item.label} className="bg-white/30 rounded-2xl p-4 border-2 border-black/10 text-center">
              <div className="text-black/40 mb-1" style={{ ...textFont, fontSize: 16 }}>{item.label}</div>
              <div className="text-black/70 font-semibold" style={{ ...textFont, fontSize: 18 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* 7 日柱状图（纯 CSS）*/}
        <div className="mb-2">
          <span className="text-black/40" style={{ ...textFont, fontSize: 16 }}>近 7 日</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
          {stats.daily.map(d => {
            const h = Math.max(4, Math.round((d.minutes / maxMinutes) * 80))
            const label = d.date.slice(5) // MM-DD
            return (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div
                  style={{
                    width: '100%',
                    height: h,
                    background: 'rgba(100,160,100,0.55)',
                    borderRadius: '4px 4px 0 0',
                    cursor: 'default',
                  }}
                  title={`${d.date}: ${fmtMin(d.minutes)}`}
                />
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontFamily: 'monospace' }}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </GlassCard>
  )
}
