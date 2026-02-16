import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import HomePage from './pages/HomePage'
import Instances from './pages/Instances'
import Deployment from './pages/Deployment'
import Knowledge from './pages/Knowledge'
import Settings from './pages/Settings'
import type { Page, Tab } from './types'

const pageLabels: Record<Page, string> = {
  home: '首页', instances: '实例启动/多开', config: '配置管理', knowledge: '知识库构建',
  'db-migration': '数据库迁移', plugins: '插件管理', deploy: '实例部署辅助系统',
  status: '查看运行状态', logs: '日志查看器', misc: '杂项', settings: '设置',
}

let tabCounter = 1
function makeTab(page: Page): Tab {
  return { id: `tab-${tabCounter++}`, page, label: pageLabels[page] }
}

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'home': return <HomePage />
    case 'instances': return <Instances />
    case 'deploy': return <Deployment />
    case 'knowledge': return <Knowledge />
    case 'settings': return <Settings />
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-black/30" style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
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

function App() {
  const zoom = useZoom()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
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

  const handleNavigate = (page: Page) => {
    const existing = tabs.find(t => t.page === page)
    if (existing) {
      setActiveTabId(existing.id)
    } else {
      const tab = makeTab(page)
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

  const handleAddTab = () => {
    const tab = makeTab('home')
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="relative overflow-hidden" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
      {/* 三层背景 */}
      <div className="absolute inset-0 bg-white" />
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/bg-temp.png')" }} />
      <div className="absolute inset-0 bg-white/50 backdrop-blur-[0px]" />

      {/* 内容 */}
      <div className="relative z-10 flex h-full">
        <Sidebar currentPage={activeTab.page} onNavigate={handleNavigate} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            onAddTab={handleAddTab}
            onLogout={handleLogout}
          />
          <main className="flex-1 overflow-auto">
            <PageContent page={activeTab.page} />
          </main>
        </div>
      </div>
    </div>
  )
}

/**
 * 登录页 - 严格按照 UI设计-登录页.svg 实现
 *
 * 三层背景结构：背景衬底(白) → 背景图片(用户上传) → 背景盖层(白色半透明，控制糊化)
 * 居中白色卡片 764x833 圆角30px 带阴影
 * 字体：汉仪文黑 + Cascadia Code
 */
function LoginPage({ onLogin }: { onLogin: () => void }) {
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

  // 倒计时
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
          setError(data.message || 'Token验证失败，请检查后重试')
        }
      }
    } catch {
      setError('连接失败，请确保服务器正在运行')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 第一层：背景衬底 - 纯白 */}
      <div className="absolute inset-0 bg-white" />

      {/* 第二层：背景图片 - 临时测试背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-temp.png')" }}
      />

      {/* 第三层：背景盖层 - 白色半透明 + 模糊，控制背景图的可见度 */}
      <div className="absolute inset-0 bg-white/50 backdrop-blur-[0px]" />

      {/* 内容层 */}
      <div className="relative z-10 flex items-center justify-center w-full h-full ">
        {/* 登录卡片 - 764x833 圆角30px 带阴影，通过 transform scale 缩放适配屏幕 */}
        <div
          className="bg-white/1 border-2 border-black/30 flex flex-col items-center origin-center backdrop-blur-[50px] shadow-login-card"
          style={{
            width: 764,
            height: 833,
            borderRadius: 30,
            padding: '0 54px',
            transform: `scale(${cardScale})`,
          }}
        >
          {/* 标题：欢迎使用MCStart */}
          <h1
            className="mt-[60px] text-black/80 text-center select-none whitespace-nowrap"
            style={{ fontSize: 60, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
          >
            欢迎使用MCStart
          </h1>

          {/* 副标题 */}
          <p
            className="mt-[16px] text-black/50 text-center select-none whitespace-nowrap"
            style={{ fontSize: 30, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
          >
            输入账户令牌继续使用系统
          </p>

          {/* Token输入栏及登录键 - 外框 */}
          <div
            className="mt-[32px] border-[3px] border-black/50 flex flex-col items-center justify-center gap-[18px] py-[26px] shadow-shadow-light rounded-[30px]"
            style={{ borderRadius: 30, width: 658 }}
          >
            {/* Token 输入框 - 胶囊形 */}
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); if (!isLocked) setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e) }}
              placeholder="Account Token"
              disabled={isLoading || isLocked}
              className="bg-white/10 border-[3px] border-black/50 text-black/80 placeholder-black/30 focus:outline-none focus:border-black/70 transition-colors disabled:opacity-50"
              style={{
                width: 583,
                height: 80,
                borderRadius: 40,
                paddingLeft: 32,
                paddingRight: 32,
                fontSize: 30,
                fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif",
                boxShadow: '5px 5px 9px rgba(0, 0, 0, 0.16)',
              }}
            />

            {/* 登录按钮 - 胶囊形 */}
            <button
              onClick={handleSubmit}
              disabled={isLoading || isLocked}
              className="bg-white/50 border-[3px] border-black/50 text-black/70 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none"
              style={{
                width: 583,
                height: 80,
                borderRadius: 40,
                fontSize: 30,
                fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif",
                boxShadow: '5px 5px 9px rgba(0, 0, 0, 0.16)',
              }}
            >
              {isLocked ? `已锁定 ${lockDisplay}` : isLoading ? '验证中...' : '登录'}
            </button>
          </div>

          {/* 错误提示 */}
          <p
            className="mt-3 text-red-500 text-center"
            style={{ fontSize: 20, minHeight: 28, visibility: (error || isLocked) ? 'visible' : 'hidden' }}
          >
            {isLocked ? `尝试次数过多，请等待 ${lockDisplay}` : error || ' '}
          </p>

          {/* 提示框 */}
          <div
            className="mt-2 border-[3px] border-black/50 px-[28px] py-[20px] shadow-shadow-light"
            style={{ borderRadius: 30, width: 658 }}
          >
            {/* 提示框标题行 */}
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
                style={{ fontSize: 25, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
              >
                我该去哪里找Token？
              </span>
            </div>

            <div className="space-y-[4px] ml-[36px]">
              <p style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
                <span className="text-black/70">1.</span>
                <span className="text-black/50"> 在主程序终端中，输入 </span>
                <span className="text-black/70">H</span>
                <span className="text-black/50"> 进入杂项，再输入 </span>
                <span className="text-black/70">E</span>
                <span className="text-black/50"> 查看Token</span>
              </p>
              <div style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
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

          {/* 版权信息 */}
          <p
            className="mt-auto mb-[24px] pt-[12px] text-black/50 select-none"
            style={{ fontSize: 20, fontFamily: "'Cascadia Code', monospace" }}
          >
            © 2026 xiaoCZX
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
