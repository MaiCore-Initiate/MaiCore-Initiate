import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import AuthPortal from './components/auth/AuthPortal'
import AccessGuard from './components/ui/AccessGuard'
import { NotificationProvider } from './components/ui/Notification'
import DynamicBackground, { BgProvider, resolveOverlayStyle, useBaseBgUrl, useBgContext } from './components/background/DynamicBackground'
import { useTheme } from './components/theme/ThemeProvider'
import { AccountSystemProvider, PAGE_PERMISSION_LABELS, useAccountSystem } from './lib/account-system'
import type { Page, SubPageParams, Tab } from './types'

const pageLabels: Record<Page, string> = PAGE_PERMISSION_LABELS

let tabCounter = 1
function makeTab(page: Page): Tab {
  return { id: `tab-${tabCounter++}`, page, label: pageLabels[page] }
}

function PageTransition({ tabId, children }: { tabId: string; children: ReactNode }) {
  const [layers, setLayers] = useState<{ id: string; content: ReactNode; phase: 'in' | 'out' }[]>([
    { id: tabId, content: children, phase: 'in' },
  ])
  const prevTabId = useRef(tabId)
  const latestChildren = useRef(children)
  const pendingRef = useRef<{ id: string; content: ReactNode } | null>(null)
  latestChildren.current = children

  useEffect(() => {
    if (tabId === prevTabId.current) {
      setLayers(prev => prev.map(layer => layer.id === tabId ? { ...layer, content: latestChildren.current } : layer))
      return
    }
    prevTabId.current = tabId
    pendingRef.current = { id: tabId, content: latestChildren.current }
    setLayers(prev => prev.map(layer => ({ ...layer, phase: 'out' as const })))
    const timer = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending) return
      setLayers([{ id: pending.id, content: pending.content, phase: 'in' }])
      pendingRef.current = null
    }, 200)
    return () => window.clearTimeout(timer)
  }, [tabId])

  return (
    <>
      {layers.map(layer => (
        <div
          key={layer.id}
          className="absolute inset-0 overflow-auto"
          style={layer.phase === 'in'
            ? { animation: 'page-enter 0.35s cubic-bezier(0.16,1,0.3,1) both' }
            : { animation: 'page-exit 0.2s ease-in forwards', pointerEvents: 'none' }}
        >
          {layer.content}
        </div>
      ))}
    </>
  )
}

function PageContent({
  page,
  params,
  onNavigate,
}: {
  page: Page
  params?: SubPageParams
  onNavigate?: (page: Page, params?: SubPageParams) => void
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

function LoginTransitionOverlay({ loginTransition }: { loginTransition: 'cover-in' | 'cover-out' }) {
  const { currentBgUrl, settings } = useBgContext()
  const { resolvedTheme } = useTheme()
  return (
    <div className={`absolute inset-0 z-30 pointer-events-none ${loginTransition === 'cover-in' ? 'animate-login-fade-in' : 'animate-login-fade-out'}`}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${currentBgUrl}')` }} />
      <div className="absolute inset-0" style={resolveOverlayStyle(settings, resolvedTheme)} />
    </div>
  )
}

function AppShell() {
  const zoom = useZoom()
  const baseBgUrl = useBaseBgUrl()
  const { resolvedTheme } = useTheme()
  const { currentUser, adminToken, canAccessPage, logout } = useAccountSystem()
  const [isLoading, setIsLoading] = useState(true)
  const [loginTransition, setLoginTransition] = useState<'none' | 'cover-in' | 'cover-out'>('none')
  const [tabs, setTabs] = useState<Tab[]>([makeTab('home')])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)

  useEffect(() => {
    const restoreSession = async () => {
      if (!currentUser || !adminToken) {
        setIsLoading(false)
        return
      }
      try {
        const res = await fetch('/api/auth/status', { credentials: 'include' })
        const data = await res.json()
        if (!data?.logged_in) {
          await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: adminToken }),
          })
        }
      } catch {
        // ignore restore failures in frontend prototype
      } finally {
        setIsLoading(false)
      }
    }
    void restoreSession()
  }, [adminToken, currentUser])

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0]

  const handleNavigate = (page: Page, params?: SubPageParams) => {
    const existing = tabs.find(tab => tab.page === page)
    if (existing) {
      setActiveTabId(existing.id)
      if (params) {
        setTabs(prev => prev.map(tab => tab.id === existing.id ? { ...tab, params } : tab))
      }
      return
    }
    if (tabs.length >= 12) return
    const tab = { ...makeTab(page), params }
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }

  const handleCloseTab = (id: string) => {
    setTabs(prev => {
      const next = prev.filter(tab => tab.id !== id)
      if (next.length === 0) return prev
      if (activeTabId === id) {
        const idx = prev.findIndex(tab => tab.id === id)
        setActiveTabId(next[Math.min(idx, next.length - 1)].id)
      }
      return next
    })
  }

  const handleCloseOtherTabs = (id: string) => {
    setTabs(prev => prev.filter(tab => tab.id === id))
    setActiveTabId(id)
  }

  const handleCloseRightTabs = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(tab => tab.id === id)
      const next = prev.slice(0, idx + 1)
      if (!next.find(tab => tab.id === activeTabId)) setActiveTabId(id)
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore logout failures
    }
    logout()
  }

  if (isLoading) {
    return (
      <div className="relative overflow-hidden" style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
        <BaseBackgroundLayer url={baseBgUrl} />
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  const showLogin = !currentUser
  const pageDetail = currentUser
    ? `${pageLabels[activeTab.page]} 对当前 ${currentUser.role === 'guest' ? '访客' : '成员'} 模板未开放。`
    : '请先登录后再访问该页面。'

  return (
    <div className={`relative overflow-hidden theme-shell theme-${resolvedTheme}`} style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
      <BaseBackgroundLayer url={baseBgUrl} />

      <BgProvider key={currentUser?.id ?? 'auth-guest'}>
        <NotificationProvider>
          <DynamicBackground />
          <div id="notification-root" className="absolute inset-0 z-[60] pointer-events-none" />

          {showLogin && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <AuthPortal
                onAuthenticated={() => {
                  setLoginTransition('cover-in')
                  window.setTimeout(() => {
                    setLoginTransition('cover-out')
                    window.setTimeout(() => setLoginTransition('none'), 900)
                  }, 560)
                }}
              />
            </div>
          )}

          {!showLogin && currentUser && (
            <div className="relative z-10 flex h-full">
              <Sidebar currentPage={activeTab.page} onNavigate={handleNavigate} isPageAccessible={canAccessPage} />
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
                  currentUser={currentUser}
                />
                <main className="flex-1 overflow-auto relative">
                  <PageTransition tabId={activeTabId}>
                    <AccessGuard
                      allowed={canAccessPage(activeTab.page)}
                      className="h-full min-h-full"
                      detail={pageDetail}
                    >
                      <PageContent page={activeTab.page} params={activeTab.params} onNavigate={handleNavigate} />
                    </AccessGuard>
                  </PageTransition>
                </main>
              </div>
            </div>
          )}

          {loginTransition !== 'none' && <LoginTransitionOverlay loginTransition={loginTransition} />}
        </NotificationProvider>
      </BgProvider>
    </div>
  )
}

export default function App() {
  return (
    <AccountSystemProvider>
      <AppShell />
    </AccountSystemProvider>
  )
}
