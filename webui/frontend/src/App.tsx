import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import HomePage from './pages/HomePage'
import Instances from './pages/Instances'
import Config from './pages/Config'
import Deployment from './pages/Deployment'
import Knowledge from './pages/Knowledge'
import Plugins from './pages/Plugins'
import Status from './pages/Status'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Misc from './pages/Misc'
import ComponentDownload from './pages/ComponentDownload'
import { NotificationProvider, useNotification } from './components/ui/Notification'
import DynamicBackground, { BgProvider, useBaseBgUrl, useBgContext } from './components/background/DynamicBackground'
import type { Page, Tab } from './types'

const pageLabels: Record<Page, string> = {
  home: '首页', instances: '实例启动/多开', config: '配置管理', knowledge: '知识库构建',
  'db-migration': '数据库迁移', plugins: '插件管理', deploy: '实例部署辅助系统',
  status: '查看运行状态', logs: '日志查看器', misc: '杂项', settings: '设置',
  'component-download': '组件下载'
}

let tabCounter = 1
function makeTab(page: Page): Tab {
  return { id: `tab-${tabCounter++}`, page, label: pageLabels[page] }
}

function PageTransition({ tabId, children }: { tabId: string; children: React.ReactNode }) {
  const [layers, setLayers] = useState<{ id: string; content: React.ReactNode; phase: 'in' | 'out' }[]>(
    [{ id: tabId, content: children, phase: 'in' }]
  )
  const prevTabId = useRef(tabId)
  const latestChildren = useRef(children)
  const pendingRef = useRef<{ id: string; content: React.ReactNode } | null>(null)
  latestChildren.current = children

  useEffect(() => {
    if (tabId === prevTabId.current) {
      setLayers(prev => prev.map(l => l.id === tabId ? { ...l, content: latestChildren.current } : l))
      return
    }
    prevTabId.current = tabId
    pendingRef.current = { id: tabId, content: latestChildren.current }
    // 先标记旧层退场
    setLayers(prev => prev.map(l => ({ ...l, phase: 'out' as const })))
    // 退场结束后，移除旧层，添加新层入场
    const t = setTimeout(() => {
      const pending = pendingRef.current!
      setLayers([{ id: pending.id, content: pending.content, phase: 'in' }])
      pendingRef.current = null
    }, 200)
    return () => clearTimeout(t)
  }, [tabId])

  return (
    <>
      {layers.map(l => (
        <div
          key={l.id}
          className="absolute inset-0 overflow-auto"
          style={l.phase === 'in'
            ? { animation: 'page-enter 0.35s cubic-bezier(0.16,1,0.3,1) both' }
            : { animation: 'page-exit 0.2s ease-in forwards', pointerEvents: 'none' }
          }
        >
          {l.content}
        </div>
      ))}
    </>
  )
}

function PageContent({ page, params, onNavigate }: {
  page: Page;
  params?: import('./types').SubPageParams;
  onNavigate?: (page: Page, params?: import('./types').SubPageParams) => void;
}) {
  switch (page) {
    case 'home': return <HomePage onNavigate={onNavigate} />
    case 'instances': return <Instances />
    case 'config': return <Config initialAction={params?.configAction} />
    case 'deploy': return <Deployment />
    case 'knowledge': return <Knowledge />
    case 'plugins': return <Plugins />
    case 'status': return <Status />
    case 'logs': return <Logs initialSource={params?.logSource} />
    case 'settings': return <Settings />
    case 'misc': return <Misc initialTab={params?.miscTab} />
    case 'component-download': return <ComponentDownload />
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-black/30" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
            {pageLabels[page]} — 页面开发中
          </span>
        </div>
      )
  }
}

function useZoom() {
  const [zoom, setZoom] = useState(window.innerWidth / 1920)
  useEffect(() => {
    const onResize = () => setZoom(window.innerWidth / 1920)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return zoom
}

const VIDEO_EXTS = ['.mp4', '.webm']
function isVideoUrl(url: string) {
  return VIDEO_EXTS.some(ext => url.toLowerCase().endsWith(ext))
}

function BaseBackgroundLayer({ url, className = 'absolute inset-0' }: { url: string; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {isVideoUrl(url)
        ? <video key={url} src={url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${url}')` }} />}
    </div>
  )
}

function App() {
  const zoom = useZoom()
  const baseBgUrl = useBaseBgUrl()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loginTransition, setLoginTransition] = useState<'none' | 'cover-in' | 'cover-out'>('none')
  const [tabs, setTabs] = useState<Tab[]>([makeTab('home')])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'include' })
        const data = await res.json()
        if (data.logged_in) setIsAuthenticated(true)
      } catch {}
      setIsLoading(false)
    }
    checkAuth()
  }, [])

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    setIsAuthenticated(false)
  }

  const handleNavigate = (page: Page, params?: import('./types').SubPageParams) => {
    const existing = tabs.find(t => t.page === page)
    if (existing) {
      setActiveTabId(existing.id)
      // 如果有参数，需要更新该标签页的参数
      if (params) {
        setTabs(prev => prev.map(t =>
          t.id === existing.id ? { ...t, params } : t
        ))
      }
    } else {
      if (tabs.length >= 12) return
      const tab = { ...makeTab(page), params }
      setTabs(prev => [...prev, tab])
      setActiveTabId(tab.id)
    }
  }

  const handleCloseTab = (id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) return prev
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveTabId(next[Math.min(idx, next.length - 1)].id)
      }
      return next
    })
  }

  const handleCloseOtherTabs = (id: string) => {
    setTabs(prev => prev.filter(t => t.id === id))
    setActiveTabId(id)
  }

  const handleCloseRightTabs = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id)
      const next = prev.slice(0, idx + 1)
      if (!next.find(t => t.id === activeTabId)) setActiveTabId(id)
      return next
    })
  }

  const handleReorderTabs = (from: number, to: number) => {
    setTabs(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const handleAddTab = () => {
    const tab = makeTab('home')
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }

  if (isLoading) {
    return (
      <div className="relative overflow-hidden" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
        <BaseBackgroundLayer url={baseBgUrl} />
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  const showLogin = !isAuthenticated
  const showMain = isAuthenticated

  return (
    <div className="relative overflow-hidden" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
      {/* 基层背景（常驻），用于避免切换阶段出现白屏 */}
      <BaseBackgroundLayer url={baseBgUrl} />

      <BgProvider key={isAuthenticated ? 'auth' : 'guest'}>
      <NotificationProvider>
      {/* 动态背景 */}
      <DynamicBackground />

      {/* 通知挂载点 — 在背景图上方，z-index 最高 */}
      <div id="notification-root" className="absolute inset-0 z-[60] pointer-events-none" />

      {/* 登录卡片层 */}
      {showLogin && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <LoginCard
            onLogin={() => {
              setLoginTransition('cover-in')
              setTimeout(() => {
                setIsAuthenticated(true)
                setLoginTransition('cover-out')
                setTimeout(() => setLoginTransition('none'), 1000)
              }, 1000)
            }}
          />
        </div>
      )}

      {/* 主页内容层 */}
      {showMain && (
        <div className="relative z-10 flex h-full">
          <Sidebar currentPage={activeTab.page} onNavigate={handleNavigate} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={handleCloseTab}
              onCloseOtherTabs={handleCloseOtherTabs}
              onCloseRightTabs={handleCloseRightTabs}
              onReorderTabs={handleReorderTabs}
              onAddTab={handleAddTab}
              onLogout={handleLogout}
            />
            <main className="flex-1 overflow-auto relative">
              <PageTransition tabId={activeTabId}>
                <PageContent page={activeTab.page} params={activeTab.params} onNavigate={handleNavigate} />
              </PageTransition>
            </main>
          </div>
        </div>
      )}

      {/* 过渡遮罩层 — 最顶层 */}
      {loginTransition !== 'none' && (
        <LoginTransitionOverlay loginTransition={loginTransition} />
      )}
      </NotificationProvider>
      </BgProvider>
    </div>
  )
}

/**
 * 登录过渡遮罩 - 使用动态背景
 */
function LoginTransitionOverlay({ loginTransition }: { loginTransition: 'cover-in' | 'cover-out' }) {
  const { currentBgUrl, settings } = useBgContext()
  return (
    <div className={`absolute inset-0 z-30 pointer-events-none ${loginTransition === 'cover-in' ? 'animate-login-fade-in' : 'animate-login-fade-out'}`}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${currentBgUrl}')` }} />
      <div className="absolute inset-0" style={{ background: `rgba(${settings.overlay_color},${settings.overlay_opacity})` }} />
    </div>
  )
}

/**
 * 登录卡片 - 只渲染卡片本身，背景由 App 统一管理
 */
function LoginCard({ onLogin }: { onLogin: () => void }) {
  const { notify } = useNotification()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lockSeconds, setLockSeconds] = useState(0)
  const [viewSize, setViewSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const onResize = () => setViewSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startCountdown = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setLockSeconds(seconds)
    timerRef.current = setInterval(() => {
      setLockSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          setError('')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const cardScale = useMemo(() => {
    return Math.min(1, viewSize.h * 0.92 / 833, viewSize.w * 0.92 / 764)
  }, [viewSize])

  const isLocked = lockSeconds > 0
  const lockDisplay = isLocked ? `${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, '0')}` : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked || isLoading) return
    if (!token.trim()) {
      setError('请输入Token')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (data.success) {
        if (data.session_id) {
          document.cookie = `webui_session=${data.session_id}; path=/; max-age=86400`
        }
        onLogin()
      } else {
        if (data.locked && data.lock_seconds > 0) {
          setError(`尝试次数过多，请等待 ${lockDisplay || '...'}`)
          startCountdown(data.lock_seconds)
        } else {
          const msg = data.message || 'Token验证失败，请检查后重试'
          setError(msg)
          notify(msg, 'warning')
        }
      }
    } catch {
      setError('连接失败，请确保服务器正在运行')
      notify('连接失败，请确保服务器正在运行', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="bg-white/1 border-2 border-black/30 flex flex-col items-center origin-center backdrop-blur-[50px] shadow-login-card animate-scale-fade-in"
      style={{
        width: 764,
        height: 833,
        borderRadius: 30,
        padding: '0 54px',
        transform: `scale(${cardScale})`,
      }}
    >
      <h1
        className="mt-[60px] text-black/80 text-center select-none whitespace-nowrap"
        style={{ fontSize: 60, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
      >
        欢迎使用MCStart
      </h1>

      <p
        className="mt-[16px] text-black/50 text-center select-none whitespace-nowrap"
        style={{ fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
      >
        输入账户令牌继续使用系统
      </p>

      <div
        className="mt-[32px] border-[3px] border-black/50 flex flex-col items-center justify-center gap-[18px] py-[26px] shadow-shadow-light rounded-[30px]"
        style={{ borderRadius: 30, width: 658 }}
      >
        <input
          type="password"
          value={token}
          onChange={(e) => { setToken(e.target.value); if (!isLocked) setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e) }}
          placeholder="Account Token"
          disabled={isLoading || isLocked}
          className="bg-white/10 border-[3px] border-black/50 text-black/80 placeholder-black/30 focus:outline-none focus:border-black/70 transition-colors disabled:opacity-50"
          style={{
            width: 583, height: 80, borderRadius: 40,
            paddingLeft: 32, paddingRight: 32,
            fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
            boxShadow: '5px 5px 9px rgba(0, 0, 0, 0.16)',
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={isLoading || isLocked}
          className="bg-white/50 border-[3px] border-black/50 text-black/70 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none"
          style={{
            width: 583, height: 80, borderRadius: 40,
            fontSize: 30, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
            boxShadow: '5px 5px 9px rgba(0, 0, 0, 0.16)',
          }}
        >
          {isLocked ? `已锁定 ${lockDisplay}` : isLoading ? '验证中...' : '登录'}
        </button>
      </div>

      <p
        className="mt-3 text-red-500 text-center"
        style={{ fontSize: 20, minHeight: 28, visibility: (error || isLocked) ? 'visible' : 'hidden' }}
      >
        {isLocked ? `尝试次数过多，请等待 ${lockDisplay}` : error || ' '}
      </p>

      <div
        className="mt-2 border-[3px] border-black/50 px-[28px] py-[20px] shadow-shadow-light"
        style={{ borderRadius: 30, width: 658 }}
      >
        <div className="flex items-center gap-[8px] mb-[10px]">
          <div
            className="flex items-center justify-center border-[3px] border-black/70 rounded-full shrink-0"
            style={{ width: 28, height: 28 }}
          >
            <span
              className="text-black/70 leading-none"
              style={{ fontSize: 20, fontFamily: "'Cascadia Code', monospace", marginTop: 1 }}
            >
              i
            </span>
          </div>
          <span
            className="text-black/70"
            style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
          >
            我该去哪里找Token？
          </span>
        </div>

        <div className="space-y-[4px] ml-[36px]">
          <p style={{ fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
            <span className="text-black/70">1.</span>
            <span className="text-black/50"> 在主程序终端中，输入 </span>
            <span className="text-black/70">H</span>
            <span className="text-black/50"> 进入杂项，再输入 </span>
            <span className="text-black/70">E</span>
            <span className="text-black/50"> 查看Token</span>
          </p>
          <div style={{ fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
            <p>
              <span className="text-black/70">2.</span>
              <span className="text-black/50"> 进入</span>
              <span className="text-black/70">&lt;程序根目录&gt;\config</span>
              <span className="text-black/50">文件夹，打开</span>
              <span className="text-black/70">P-config.toml</span>
              <span className="text-black/50">文件，</span>
            </p>
            <p className="">
              <span className="text-black/70">webui_token</span>
              <span className="text-black/50">一栏的值即为Token</span>
            </p>
          </div>
        </div>
      </div>

      <p
        className="mt-auto mb-[24px] pt-[12px] text-black/50 select-none"
        style={{ fontSize: 20, fontFamily: "'Cascadia Code', monospace" }}
      >
        © 2026 xiaoCZX
      </p>
    </div>
  )
}

export default App
