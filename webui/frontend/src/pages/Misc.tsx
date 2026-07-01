import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import GlassCard from '../components/ui/GlassCard'
import AccessGuard from '../components/ui/AccessGuard'
import Modal from '../components/ui/Modal'
import ComponentDownload from './ComponentDownload'
import WebShell from './WebShell'
import { useNotification } from '../components/ui/Notification'
import { cn } from '../lib/utils'
import { Package, User, Cpu, BookOpen, FileText, Download, Terminal, Monitor, RefreshCw, X, Archive, Upload, FolderOpen, Check, Loader2, Box, Plug, ShieldCheck } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseMiscContent, type MiscContent, type Contributor, type Library } from '../lib/misc-parser'
import { useBgContext } from '../components/background/DynamicBackground'
import { DesktopPetManager } from '../components/live2d/DesktopPet'
import { useAccountSystem } from '../lib/account-system'
import { MISC_TAB_PERMISSION_MAP } from '../lib/misc-permissions'
import type { MiscTab, Page, SubPageParams } from '../types'

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

interface MiscProps {
  initialTab?: MiscTab
  onNavigate?: (page: Page, params?: SubPageParams) => void
}

function normalizeMiscTab(tab?: MiscTab | 'custom-console'): MiscTab | undefined {
  return tab === 'custom-console' ? 'package-instance' : tab
}

export default function Misc({ initialTab, onNavigate }: MiscProps) {
  const { can, canAccessPage } = useAccountSystem()
  const normalizedInitialTab = normalizeMiscTab(initialTab)
  const [activeTab, setActiveTab] = useState<MiscTab>(normalizedInitialTab ?? 'about')
  const [content, setContent] = useState<MiscContent | null>(null)
  const [loading, setLoading] = useState(true)
  const compactMode = activeTab === 'webshell' || activeTab === 'screensaver' || activeTab === 'desktop-pet'
  const tabs = useMemo(() => ([
    { key: 'about', label: '关于项目', icon: Package },
    { key: 'author', label: '关于作者', icon: User },
    { key: 'tech', label: '技术栈', icon: Cpu },
    { key: 'libs', label: '开源库', icon: BookOpen },
    { key: 'license', label: '开源许可', icon: FileText },
    { key: 'components', label: '组件下载', icon: Download },
    { key: 'package-instance', label: '打包实例', icon: Archive },
    { key: 'webshell', label: 'WebShell', icon: Terminal },
    { key: 'screensaver', label: '屏保', icon: Monitor },
    { key: 'desktop-pet', label: '桌宠', icon: Monitor },
  ] as const).map(tab => ({
    ...tab,
    allowed: can(MISC_TAB_PERMISSION_MAP[tab.key]),
  })), [can])
  const visibleTabs = useMemo(() => tabs.filter(tab => tab.allowed), [tabs])
  const activeTabAllowed = tabs.some(tab => tab.key === activeTab && tab.allowed)
  const workbenchAllowed = canAccessPage('template-workbench')

  useEffect(() => {
    const nextInitialTab = normalizeMiscTab(initialTab)
    const preferredTab = nextInitialTab && tabs.some(tab => tab.key === nextInitialTab && tab.allowed)
      ? nextInitialTab
      : undefined
    const fallbackTab = visibleTabs[0]?.key
    const currentStillAllowed = tabs.some(tab => tab.key === activeTab && tab.allowed)
    if (preferredTab && preferredTab !== activeTab) {
      setActiveTab(preferredTab)
      return
    }
    if (currentStillAllowed) return
    if (preferredTab) {
      setActiveTab(preferredTab)
      return
    }
    if (fallbackTab) {
      setActiveTab(fallbackTab)
    }
  }, [activeTab, initialTab, tabs, visibleTabs])

  const startScreenSaver = useCallback(async () => {
    if (!can('misc.screensaver.access')) return
    setActiveTab('screensaver')
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // 某些浏览器会拒绝非激活态全屏，屏保层仍会显示并允许手动重试
    }
  }, [can])

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
              onClick={() => {
                const fallbackTab = visibleTabs[0]?.key
                if (fallbackTab) {
                  setActiveTab(fallbackTab)
                }
              }}
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
                {visibleTabs.map(tab => {
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
                  <button
                    onClick={() => onNavigate?.('template-workbench')}
                    className={cn(
                      'px-[16px] py-[8px] rounded-[16px] border-2 transition-all flex items-center gap-[6px] shrink-0',
                      workbenchAllowed
                        ? 'bg-white/20 border-black/30 text-black/50 hover:bg-white/40'
                        : 'bg-white/10 border-black/20 text-black/35 hover:bg-white/20'
                    )}
                    style={{ ...labelFont, fontSize: 21 }}
                    title={workbenchAllowed ? '打开模板工作台' : '当前角色未开放模板工作台，点击后会显示权限提示'}
                  >
                    <Box size={18} />
                    模板工作台
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className={`flex-1 overflow-auto transition-all duration-500 ${compactMode ? 'px-4 pb-4' : 'px-6 pb-6'}`}>
        {!visibleTabs.length && (
          <AccessGuard
            allowed={false}
            className="h-full min-h-full"
            message="当前无权限访问杂项子页"
            detail="请在设置页的账号管理面板中，为当前角色开启对应的杂项子页权限。"
          >
            <div className="h-full" />
          </AccessGuard>
        )}
        {visibleTabs.length > 0 && !activeTabAllowed && (
          <AccessGuard
            allowed={false}
            className="h-full min-h-full"
            message="当前无权限访问该子页"
            detail="你打开的杂项子页未对当前账号开放，系统已自动回退到可访问页面。"
          >
            <div className="h-full" />
          </AccessGuard>
        )}
        {activeTabAllowed && activeTab === 'about' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <AboutProject content={content.about} />
          </div>
        )}
        {activeTabAllowed && activeTab === 'author' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <AboutAuthor contributors={content.author.contributors} footer={content.author.footer} />
          </div>
        )}
        {activeTabAllowed && activeTab === 'tech' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <TechStack tech={content.tech} />
          </div>
        )}
        {activeTabAllowed && activeTab === 'libs' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <OpenSourceLibs libraries={content.libs.libraries} footer={content.libs.footer} />
          </div>
        )}
        {activeTabAllowed && activeTab === 'license' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <License content={content.license} />
          </div>
        )}
        {activeTabAllowed && activeTab === 'components' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <ComponentDownloadTab />
          </div>
        )}
        {activeTabAllowed && activeTab === 'package-instance' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <PackageInstanceTab />
          </div>
        )}
        {activeTabAllowed && activeTab === 'webshell' && (
          <div className="h-full animate-fade-in">
            <WebShellTab />
          </div>
        )}
        {activeTabAllowed && activeTab === 'desktop-pet' && (
          <div className="animate-fade-slide-up" style={d(2)}>
            <DesktopPetTab />
          </div>
        )}
        {activeTabAllowed && activeTab === 'screensaver' && (
          <div className="h-full animate-fade-in">
            <ScreenSaverTab onExit={() => {
              const fallbackTab = visibleTabs.find(tab => tab.key !== 'screensaver')?.key ?? visibleTabs[0]?.key
              if (fallbackTab) {
                setActiveTab(fallbackTab)
              }
            }} />
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

type PackInstance = {
  name: string
  serial: string
  nickname: string
  absolute_serial: number
  bot_type: string
  version: string
  source: string
  main_path: string
  can_pack: boolean
  default_output_path: string
}

type InventoryItem = {
  name: string
  type: 'dir' | 'file'
}

type ImportMeta = {
  name: string
  serial: string
  author: string
  mail: string
  account: string
  time: string
  type: string
  version: string
  description: string
  components: string[]
  plugins: string[]
  pack_source: string
  venv_packed: boolean
}

type ImportPreview = {
  token: string
  filename: string
  default_dest_dir: string
  meta: ImportMeta
}

const PACK_OPTIONS = [
  { key: 'include_config', label: '配置文件', desc: '自动脱敏模型 API Key' },
  { key: 'include_data', label: '用户数据', desc: '包含 data 目录' },
  { key: 'include_src', label: '源码部分', desc: '主程序除配置/数据/插件外内容' },
  { key: 'include_components', label: '组件部分', desc: '实例目录下的其他组件' },
  { key: 'include_plugins', label: '插件部分', desc: '主程序 plugins 目录' },
  { key: 'include_venv', label: '虚拟环境', desc: '默认不推荐打包' },
] as const

type PackOptionKey = typeof PACK_OPTIONS[number]['key']

const packInputClass = 'w-full rounded-[16px] border-2 border-black/10 bg-white/35 px-[16px] py-[12px] text-black/75 outline-none transition focus:border-black/35 focus:bg-white/50'

function PackageInstanceTab() {
  const { notify } = useNotification()
  const [instances, setInstances] = useState<PackInstance[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [components, setComponents] = useState<InventoryItem[]>([])
  const [plugins, setPlugins] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exportResult, setExportResult] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [description, setDescription] = useState('')
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set())
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set())
  const [packOptions, setPackOptions] = useState<Record<PackOptionKey, boolean>>({
    include_config: true,
    include_data: true,
    include_src: true,
    include_components: true,
    include_plugins: true,
    include_venv: false,
  })
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importDest, setImportDest] = useState('')
  const [setupVenv, setSetupVenv] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedInstance = useMemo(
    () => instances.find(item => item.name === selectedName) ?? instances.find(item => item.can_pack) ?? instances[0],
    [instances, selectedName]
  )

  const loadInstances = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/instance-pack/instances', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '读取实例失败')
      const list = Array.isArray(data.instances) ? data.instances as PackInstance[] : []
      setInstances(list)
      const firstPackable = list.find(item => item.can_pack) ?? list[0]
      if (firstPackable) {
        setSelectedName(prev => prev && list.some(item => item.name === prev) ? prev : firstPackable.name)
        setOutputPath(prev => prev || firstPackable.default_output_path || '')
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取实例失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void loadInstances()
  }, [loadInstances])

  useEffect(() => {
    if (!selectedInstance) return
    if (!selectedInstance.can_pack) {
      setComponents([])
      setPlugins([])
      return
    }
    setOutputPath(prev => prev || selectedInstance.default_output_path || '')
    setInventoryLoading(true)
    fetch(`/api/instance-pack/instances/${encodeURIComponent(selectedInstance.name)}/inventory`, { credentials: 'include' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '读取实例清单失败')
        setComponents(Array.isArray(data.components) ? data.components : [])
        setPlugins(Array.isArray(data.plugins) ? data.plugins : [])
        setSelectedComponents(new Set())
        setSelectedPlugins(new Set())
      })
      .catch(error => {
        notify(error instanceof Error ? error.message : '读取实例清单失败', 'warning')
        setComponents([])
        setPlugins([])
      })
      .finally(() => setInventoryLoading(false))
  }, [selectedInstance?.name])

  const commandPreview = useMemo(() => {
    if (!selectedInstance) return 'mcsb -o <实例序列号>'
    const filters: string[] = []
    if (!packOptions.include_data) filters.push('!data')
    if (!packOptions.include_config) filters.push('!config')
    if (!packOptions.include_components) filters.push('!components')
    if (!packOptions.include_src) filters.push('!src')
    if (!packOptions.include_plugins) filters.push('!plugins')
    if (packOptions.include_venv) filters.push('!+venv')
    if (selectedComponents.size > 0 && packOptions.include_components) filters.push(`--c{${Array.from(selectedComponents).join(',')}}`)
    if (selectedPlugins.size > 0 && packOptions.include_plugins) filters.push(`--p{${Array.from(selectedPlugins).join(',')}}`)
    const filterPart = filters.length ? ` -f ${filters.join(',')}` : ''
    const sitePart = outputPath ? ` -s "${outputPath}"` : ''
    const descPart = description ? ' -des "<描述内容>"' : ''
    return `mcsb -o ${selectedInstance.serial || selectedInstance.name}${filterPart}${sitePart}${descPart}`
  }, [description, outputPath, packOptions, selectedComponents, selectedInstance, selectedPlugins])

  const updatePackOption = (key: PackOptionKey) => {
    setPackOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSetItem = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, name: string) => {
    setter(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const exportInstance = async () => {
    if (!selectedInstance || !selectedInstance.can_pack) return
    setExporting(true)
    setExportResult('')
    try {
      const res = await fetch('/api/instance-pack/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: selectedInstance.name,
          output_path: outputPath,
          description,
          ...packOptions,
          only_components: Array.from(selectedComponents),
          only_plugins: Array.from(selectedPlugins),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '打包失败')
      setExportResult(data.output_path || '')
      notify('实例打包完成', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '打包失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  const previewImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setImporting(true)
    try {
      const res = await fetch('/api/instance-pack/import/preview', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '读取实例包失败')
      setImportPreview(data as ImportPreview)
      setImportDest(data.default_dest_dir || '')
      notify('实例包读取完成，请确认导入信息', 'info')
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取实例包失败', 'error')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      const res = await fetch('/api/instance-pack/import/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: importPreview.token,
          dest_dir: importDest,
          setup_venv: setupVenv,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || '导入失败')
      notify('实例导入完成', 'success')
      setImportPreview(null)
      setSetupVenv(false)
      void loadInstances()
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,0.95fr)_minmax(420px,1.25fr)] gap-[18px]">
        <GlassCard>
          <div className="p-[30px] space-y-[22px]">
            <div className="flex items-start justify-between gap-[16px]">
              <div>
                <h2 className="text-black/80" style={sectionTitle}>打包实例</h2>
                <p className="text-black/50 mt-[4px]" style={{ ...textFont, fontSize: 18 }}>导出 .mcsins 包，或导入已有实例包。</p>
              </div>
              <button
                onClick={() => void loadInstances()}
                className="h-[44px] w-[44px] rounded-[14px] border-2 border-black/15 bg-white/30 text-black/60 hover:bg-white/50 transition flex items-center justify-center shrink-0"
                title="刷新实例列表"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="space-y-[10px]">
              {loading ? (
                <div className="rounded-[18px] border-2 border-black/10 bg-white/25 p-[18px] text-black/45 flex items-center gap-[10px]" style={textFont}>
                  <Loader2 size={20} className="animate-spin" /> 正在读取实例
                </div>
              ) : instances.length === 0 ? (
                <div className="rounded-[18px] border-2 border-black/10 bg-white/25 p-[18px] text-black/45" style={textFont}>当前没有可用实例。</div>
              ) : instances.map(instance => (
                <button
                  key={instance.name}
                  onClick={() => {
                    setSelectedName(instance.name)
                    setOutputPath(instance.default_output_path || '')
                  }}
                  className={cn(
                    'w-full text-left rounded-[18px] border-2 p-[16px] transition',
                    selectedInstance?.name === instance.name
                      ? 'bg-white/55 border-black/35 shadow-md'
                      : 'bg-white/25 border-black/10 hover:bg-white/40'
                  )}
                >
                  <div className="flex items-center justify-between gap-[12px]">
                    <span className="text-black/80 truncate" style={{ ...labelFont, fontSize: 24 }}>{instance.nickname || instance.name}</span>
                    <span className={cn(
                      'px-[10px] py-[3px] rounded-[8px] border text-[13px]',
                      instance.can_pack ? 'border-green-400/40 bg-green-100/45 text-green-700' : 'border-black/10 bg-white/20 text-black/45'
                    )}>
                      {instance.source || 'register'}
                    </span>
                  </div>
                  <div className="mt-[6px] text-black/50 truncate" style={{ ...monoFont, fontSize: 16 }}>
                    {instance.serial || instance.name} / {instance.bot_type} / {instance.version || '-'}
                  </div>
                  {!instance.can_pack && (
                    <div className="mt-[6px] text-black/40" style={{ ...textFont, fontSize: 16 }}>只允许打包已注册的本地实例</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        <div className="space-y-[18px]">
          <GlassCard>
            <div className="p-[30px] space-y-[20px]">
              <div className="flex items-center gap-[10px] text-black/75" style={{ ...labelFont, fontSize: 28 }}>
                <ShieldCheck size={22} />
                导出策略
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
                {PACK_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    onClick={() => updatePackOption(option.key)}
                    className={cn(
                      'rounded-[16px] border-2 p-[16px] text-left transition min-h-[92px]',
                      packOptions[option.key] ? 'bg-white/50 border-black/30' : 'bg-white/20 border-black/10 text-black/45'
                    )}
                  >
                    <div className="flex items-center gap-[10px]">
                      <span className={cn(
                        'h-[22px] w-[22px] rounded-[7px] border-2 flex items-center justify-center',
                        packOptions[option.key] ? 'border-black/45 bg-white/65' : 'border-black/20'
                      )}>
                        {packOptions[option.key] && <Check size={15} />}
                      </span>
                      <span style={{ ...labelFont, fontSize: 22 }}>{option.label}</span>
                    </div>
                    <p className="mt-[6px] text-black/48" style={{ ...textFont, fontSize: 16 }}>{option.desc}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px]">
                <SelectableList
                  title="指定组件"
                  icon={<Box size={18} />}
                  items={components}
                  selected={selectedComponents}
                  disabled={!packOptions.include_components || inventoryLoading}
                  emptyText={inventoryLoading ? '正在读取组件' : '没有检测到组件'}
                  onToggle={name => toggleSetItem(setSelectedComponents, name)}
                  onSelectAll={() => setSelectedComponents(new Set(components.map(item => item.name)))}
                  onClear={() => setSelectedComponents(new Set())}
                />
                <SelectableList
                  title="指定插件"
                  icon={<Plug size={18} />}
                  items={plugins}
                  selected={selectedPlugins}
                  disabled={!packOptions.include_plugins || inventoryLoading}
                  emptyText={inventoryLoading ? '正在读取插件' : '没有检测到插件'}
                  onToggle={name => toggleSetItem(setSelectedPlugins, name)}
                  onSelectAll={() => setSelectedPlugins(new Set(plugins.map(item => item.name)))}
                  onClear={() => setSelectedPlugins(new Set())}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-[14px]">
                <FieldBlock label="导出路径">
                  <input
                    value={outputPath}
                    onChange={event => setOutputPath(event.target.value)}
                    className={packInputClass}
                    style={{ ...monoFont, fontSize: 17 }}
                    placeholder="留空时使用实例同级目录"
                  />
                </FieldBlock>
                <FieldBlock label="命令预览">
                  <div className="rounded-[16px] border-2 border-black/10 bg-black/5 px-[14px] py-[12px] text-black/65 break-all min-h-[52px]" style={{ ...monoFont, fontSize: 16 }}>
                    {commandPreview}
                  </div>
                </FieldBlock>
              </div>

              <FieldBlock label="实例描述">
                <textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  className={`${packInputClass} min-h-[116px] resize-y`}
                  style={{ ...textFont, fontSize: 18 }}
                  placeholder="会写入实例包元数据，支持 Markdown 文本"
                />
              </FieldBlock>

              <div className="flex flex-wrap items-center justify-between gap-[12px]">
                <div className="text-black/50" style={{ ...textFont, fontSize: 17 }}>
                  {exportResult ? `已输出：${exportResult}` : '打包前会检查 GitHub 登录状态，并对配置中的 api_key 做脱敏处理。'}
                </div>
                <button
                  onClick={() => void exportInstance()}
                  disabled={!selectedInstance?.can_pack || exporting}
                  className="h-[52px] px-[24px] rounded-[18px] border-2 border-black/35 bg-white/55 text-black/80 hover:bg-white/70 disabled:opacity-45 disabled:cursor-not-allowed transition flex items-center gap-[8px]"
                  style={{ ...labelFont, fontSize: 22 }}
                >
                  {exporting ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
                  开始打包
                </button>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="p-[30px] flex flex-col lg:flex-row lg:items-center justify-between gap-[18px]">
              <div>
                <div className="flex items-center gap-[10px] text-black/75" style={{ ...labelFont, fontSize: 28 }}>
                  <Upload size={22} />
                  导入实例
                </div>
                <p className="text-black/50 mt-[4px]" style={{ ...textFont, fontSize: 18 }}>选择 .mcsins 文件后先预览元数据，再确认导入。</p>
              </div>
              <div className="flex items-center gap-[12px]">
                <input ref={fileInputRef} type="file" accept=".mcsins" className="hidden" onChange={previewImport} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="h-[52px] px-[24px] rounded-[18px] border-2 border-black/30 bg-white/45 text-black/75 hover:bg-white/65 disabled:opacity-45 transition flex items-center gap-[8px]"
                  style={{ ...labelFont, fontSize: 22 }}
                >
                  {importing ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                  选择实例包
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <ImportConfirmModal
        preview={importPreview}
        dest={importDest}
        setupVenv={setupVenv}
        importing={importing}
        onDestChange={setImportDest}
        onSetupVenvChange={setSetupVenv}
        onClose={() => setImportPreview(null)}
        onConfirm={() => void confirmImport()}
      />
    </>
  )
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-[8px]">
      <span className="text-black/65" style={{ ...labelFont, fontSize: 20 }}>{label}</span>
      {children}
    </label>
  )
}

function SelectableList({
  title,
  icon,
  items,
  selected,
  disabled,
  emptyText,
  onToggle,
  onSelectAll,
  onClear,
}: {
  title: string
  icon: React.ReactNode
  items: InventoryItem[]
  selected: Set<string>
  disabled: boolean
  emptyText: string
  onToggle: (name: string) => void
  onSelectAll: () => void
  onClear: () => void
}) {
  return (
    <div className={cn('rounded-[18px] border-2 border-black/10 bg-white/22 p-[16px]', disabled && 'opacity-55')}>
      <div className="flex items-center justify-between gap-[10px] mb-[10px]">
        <div className="flex items-center gap-[8px] text-black/70" style={{ ...labelFont, fontSize: 21 }}>
          {icon}
          {title}
        </div>
        <div className="flex items-center gap-[8px]">
          <button onClick={onSelectAll} disabled={disabled || items.length === 0} className="text-black/50 hover:text-black/75 disabled:opacity-40" style={{ ...textFont, fontSize: 15 }}>全选</button>
          <button onClick={onClear} disabled={disabled || selected.size === 0} className="text-black/50 hover:text-black/75 disabled:opacity-40" style={{ ...textFont, fontSize: 15 }}>清空</button>
        </div>
      </div>
      <div className="max-h-[174px] overflow-auto pr-[2px] space-y-[8px]">
        {items.length === 0 ? (
          <div className="text-black/40 py-[16px]" style={{ ...textFont, fontSize: 17 }}>{emptyText}</div>
        ) : items.map(item => (
          <button
            key={item.name}
            onClick={() => onToggle(item.name)}
            disabled={disabled}
            className={cn(
              'w-full min-h-[42px] rounded-[12px] border px-[12px] text-left flex items-center justify-between gap-[10px] transition',
              selected.has(item.name) ? 'border-black/30 bg-white/55 text-black/75' : 'border-black/10 bg-white/20 text-black/50 hover:bg-white/35'
            )}
          >
            <span className="truncate" style={{ ...monoFont, fontSize: 16 }}>{item.name}</span>
            <span className="shrink-0 text-black/38" style={{ ...textFont, fontSize: 14 }}>{item.type === 'dir' ? '目录' : '文件'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ImportConfirmModal({
  preview,
  dest,
  setupVenv,
  importing,
  onDestChange,
  onSetupVenvChange,
  onClose,
  onConfirm,
}: {
  preview: ImportPreview | null
  dest: string
  setupVenv: boolean
  importing: boolean
  onDestChange: (value: string) => void
  onSetupVenvChange: (value: boolean) => void
  onClose: () => void
  onConfirm: () => void
}) {
  if (!preview) return null
  const meta = preview.meta
  const rows = [
    ['名称', meta.name || '-'],
    ['序列号', meta.serial || '-'],
    ['类型', meta.type || '-'],
    ['版本', meta.version || '-'],
    ['作者', [meta.author, meta.mail].filter(Boolean).join(' / ') || '-'],
    ['来源', meta.pack_source || '-'],
  ]

  return (
    <Modal open={!!preview} onClose={importing ? undefined : onClose} width={760} radius={24}>
      <div className="p-[30px] space-y-[18px]">
        <div className="flex items-start justify-between gap-[16px]">
          <div>
            <h3 className="text-black/80" style={{ ...sectionTitle, fontSize: 34 }}>确认导入实例</h3>
            <p className="text-black/50 mt-[4px]" style={{ ...textFont, fontSize: 18 }}>{preview.filename}</p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="h-[42px] w-[42px] rounded-[14px] border-2 border-black/10 bg-white/30 text-black/55 hover:bg-white/50 disabled:opacity-40 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-[14px] border border-black/10 bg-white/28 px-[14px] py-[10px]">
              <div className="text-black/40" style={{ ...textFont, fontSize: 14 }}>{label}</div>
              <div className="text-black/70 truncate" style={{ ...labelFont, fontSize: 20 }}>{value}</div>
            </div>
          ))}
        </div>

        {meta.description && (
          <div className="rounded-[16px] border-2 border-black/10 bg-white/25 p-[14px] max-h-[150px] overflow-auto text-black/60" style={{ ...textFont, fontSize: 17 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{meta.description}</ReactMarkdown>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
          <div className="rounded-[14px] border border-black/10 bg-white/24 p-[12px] text-black/55" style={{ ...textFont, fontSize: 16 }}>
            组件：{meta.components.length ? meta.components.join('、') : '无'}
          </div>
          <div className="rounded-[14px] border border-black/10 bg-white/24 p-[12px] text-black/55" style={{ ...textFont, fontSize: 16 }}>
            插件：{meta.plugins.length ? meta.plugins.join('、') : '无'}
          </div>
        </div>

        <FieldBlock label="导入位置">
          <input
            value={dest}
            onChange={event => onDestChange(event.target.value)}
            className={packInputClass}
            style={{ ...monoFont, fontSize: 17 }}
            placeholder="留空时导入到当前目录"
          />
        </FieldBlock>

        <button
          onClick={() => onSetupVenvChange(!setupVenv)}
          className={cn(
            'w-full rounded-[16px] border-2 p-[14px] text-left transition',
            setupVenv ? 'border-black/30 bg-white/50' : 'border-black/10 bg-white/22'
          )}
        >
          <span className="inline-flex items-center gap-[10px] text-black/70" style={{ ...labelFont, fontSize: 20 }}>
            <span className={cn('h-[22px] w-[22px] rounded-[7px] border-2 flex items-center justify-center', setupVenv ? 'border-black/45 bg-white/65' : 'border-black/20')}>
              {setupVenv && <Check size={15} />}
            </span>
            导入后自动创建虚拟环境
          </span>
          <span className="block mt-[5px] text-black/45" style={{ ...textFont, fontSize: 16 }}>可能需要较长时间和网络环境，默认关闭。</span>
        </button>

        <div className="flex justify-end gap-[12px]">
          <button
            onClick={onClose}
            disabled={importing}
            className="h-[48px] px-[22px] rounded-[16px] border-2 border-black/15 bg-white/25 text-black/55 hover:bg-white/45 disabled:opacity-40 transition"
            style={{ ...labelFont, fontSize: 20 }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={importing}
            className="h-[48px] px-[24px] rounded-[16px] border-2 border-black/35 bg-white/55 text-black/80 hover:bg-white/70 disabled:opacity-45 transition flex items-center gap-[8px]"
            style={{ ...labelFont, fontSize: 20 }}
          >
            {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            确认导入
          </button>
        </div>
      </div>
    </Modal>
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

      <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto px-[clamp(18px,4vw,64px)] py-[clamp(76px,9vh,120px)]">
        <div
          className="grid w-full max-w-[1180px] grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-[clamp(24px,5vh,72px)] text-center"
          style={{ minHeight: 'min(760px, calc(100vh - 160px))' }}
        >
          <div>
            <div
              className="text-white leading-none"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(64px, min(13vw, 20vh), 180px)',
                letterSpacing: 0,
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

          <div className="mx-auto flex w-full max-w-[960px] flex-col items-center justify-center px-4">
            <div className="mx-auto mb-[clamp(20px,4vh,40px)] h-[1px] w-[min(78vw,860px)] bg-white/55" />

            <p
              className="max-h-[32vh] overflow-y-auto text-white/95 leading-relaxed"
              style={{
                fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                fontSize: 'clamp(18px, min(2.2vw, 4vh), 32px)',
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

            <div className="mt-[clamp(20px,4vh,36px)] flex items-center justify-center gap-4">
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

      <div className="absolute left-1/2 bottom-[clamp(14px,3vh,24px)] z-20 -translate-x-1/2 w-[min(460px,88vw)]">
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

function DesktopPetTab() {
  return <DesktopPetManager />
}
