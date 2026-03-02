import { useState, useEffect } from 'react'
import GlassCard from '../components/ui/GlassCard'
import ComponentDownload from './ComponentDownload'
import WebShell from './WebShell'
import { cn } from '../lib/utils'
import { Package, User, Cpu, BookOpen, FileText, Download, Terminal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { parseMiscContent, type MiscContent, type Contributor, type Library } from '../lib/misc-parser'

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

export default function Misc() {
  const [activeTab, setActiveTab] = useState<'about' | 'author' | 'tech' | 'libs' | 'license' | 'components' | 'webshell'>('about')
  const [content, setContent] = useState<MiscContent | null>(null)
  const [loading, setLoading] = useState(true)

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
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      {/* 页面标题 */}
      <div className="animate-fade-slide-up" style={d(0)}>
        <h1 className="text-black/80 mb-2" style={pageTitleStyle}>
          杂项
        </h1>
      </div>

      {/* 标签页导航 */}
      <div className="animate-fade-slide-up" style={d(1)}>
        <GlassCard>
          <div className="p-[20px] flex gap-[12px] flex-wrap">
            {[
              { key: 'about', label: '关于项目', icon: Package },
              { key: 'author', label: '关于作者', icon: User },
              { key: 'tech', label: '技术栈', icon: Cpu },
              { key: 'libs', label: '开源库', icon: BookOpen },
              { key: 'license', label: '开源许可', icon: FileText },
              { key: 'components', label: '组件下载', icon: Download },
              { key: 'webshell', label: 'WebShell', icon: Terminal },
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    'px-[24px] py-[12px] rounded-[20px] border-2 transition-all flex items-center gap-[8px]',
                    activeTab === tab.key
                      ? 'bg-white/60 border-black/50 text-black/80'
                      : 'bg-white/20 border-black/30 text-black/50 hover:bg-white/40'
                  )}
                  style={{ ...labelFont, boxShadow: activeTab === tab.key ? '2px 3px 6px rgba(0,0,0,0.15)' : 'none' }}
                >
                  <Icon size={20} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </GlassCard>
      </div>

      {/* 内容区域 */}
      <div className="animate-fade-slide-up" style={d(2)}>
        {activeTab === 'about' && <AboutProject content={content.about} />}
        {activeTab === 'author' && <AboutAuthor contributors={content.author.contributors} footer={content.author.footer} />}
        {activeTab === 'tech' && <TechStack tech={content.tech} />}
        {activeTab === 'libs' && <OpenSourceLibs libraries={content.libs.libraries} footer={content.libs.footer} />}
        {activeTab === 'license' && <License content={content.license} />}
        {activeTab === 'components' && <ComponentDownloadTab />}
        {activeTab === 'webshell' && <WebShellTab />}
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

/** WebShell 标签页 */
function WebShellTab() {
  return (
    <div className="-m-6 h-[calc(100vh-200px)]">
      <WebShell />
    </div>
  )
}
