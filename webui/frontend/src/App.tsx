import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import TemplateWorkbench from './pages/TemplateWorkbench'
import AuthPortal from './components/auth/AuthPortal'
import AccessGuard from './components/ui/AccessGuard'
import { NotificationProvider, useNotification } from './components/ui/Notification'
import DynamicBackground, { BgProvider, resolveOverlayStyle, useBaseBgUrl, useBgContext, useCachedBgSettings } from './components/background/DynamicBackground'
import { useTheme } from './components/theme/ThemeProvider'
import { AccountSystemProvider, PAGE_PERMISSION_LABELS, useAccountSystem } from './lib/account-system'
import type { Page, SubPageParams, Tab } from './types'
import {
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'

const pageLabels: Record<Page, string> = PAGE_PERMISSION_LABELS
const titleFont = { fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }
const monoFont = { fontFamily: "'Ubuntu', 'HarmonyOS Sans SC', monospace" }

const miscTabs = ['about', 'author', 'tech', 'libs', 'license', 'components', 'webshell', 'screensaver', 'desktop-pet', 'custom-console'] as const
const configActions = ['edit', 'open-config', 'open-folder'] as const
const logSources = ['main', 'webui', 'desktop_pet'] as const

export const pageRoutes = {
  home: '/',
  instances: '/instances',
  config: '/config',
  knowledge: '/knowledge',
  'db-migration': '/db-migration',
  plugins: '/plugins',
  deploy: '/deploy',
  status: '/status',
  logs: '/logs',
  misc: '/misc',
  settings: '/settings',
  'component-download': '/component-download',
  'template-workbench': '/template-workbench',
} as const satisfies Record<Page, `/${string}`>

const pageByRoute = Object.fromEntries(
  Object.entries(pageRoutes).map(([page, route]) => [route, page])
) as Record<string, Page>

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

function normalizeRouteSearch(search: Record<string, unknown>): SubPageParams | undefined {
  const params: SubPageParams = {}
  if (isOneOf(search.miscTab, miscTabs)) params.miscTab = search.miscTab
  if (isOneOf(search.configAction, configActions)) params.configAction = search.configAction
  if (isOneOf(search.logSource, logSources)) params.logSource = search.logSource
  return Object.keys(params).length ? params : undefined
}

function paramsKey(params?: SubPageParams) {
  return `${params?.miscTab ?? ''}|${params?.configAction ?? ''}|${params?.logSource ?? ''}`
}

function routeSearch(params?: SubPageParams) {
  return {
    ...(params?.miscTab ? { miscTab: params.miscTab } : {}),
    ...(params?.configAction ? { configAction: params.configAction } : {}),
    ...(params?.logSource ? { logSource: params.logSource } : {}),
  }
}

function resolveRoutePage(pathname: string): Page {
  const normalized = pathname === '/' ? '/' : `/${pathname.replace(/^\/+|\/+$/g, '')}`
  return pageByRoute[normalized] ?? 'home'
}

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
  onReturnFromWorkbench,
}: {
  page: Page
  params?: SubPageParams
  onNavigate?: (page: Page, params?: SubPageParams) => void
  onReturnFromWorkbench?: () => void
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
    case 'misc': return <Misc initialTab={params?.miscTab} onNavigate={onNavigate} />
    case 'component-download': return <ComponentDownload />
    case 'template-workbench': return <TemplateWorkbench onReturnToSource={onReturnFromWorkbench} />
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

function GithubAdminTransferPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { replaceGithubAdmin } = useAccountSystem()
  const { notify } = useNotification()
  const [mode, setMode] = useState<'confirm' | 'token'>('confirm')
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMode('confirm')
      setToken('')
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const handleDecline = async () => {
    setSubmitting(true)
    try {
      const result = await replaceGithubAdmin('', false)
      notify(result.message, result.success ? 'info' : 'warning')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!token.trim()) {
      notify('请输入系统初始化时生成的 Token。', 'warning')
      return
    }
    setSubmitting(true)
    try {
      const result = await replaceGithubAdmin(token.trim())
      notify(result.message, result.success ? 'success' : 'error')
      if (result.success) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-[20px]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" onClick={onClose} />
      <div
        className="relative w-full max-w-[560px] rounded-[24px] border-2 border-black/25 bg-white/75 p-[26px] shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-[34px]"
        onClick={event => event.stopPropagation()}
      >
        <h2 className="text-black/82" style={{ ...titleFont, fontSize: 32 }}>移交管理员权限</h2>
        {mode === 'confirm' ? (
          <p className="mt-[12px] text-black/58" style={{ ...titleFont, fontSize: 21, lineHeight: 1.55 }}>
            当前 GitHub 账号是除系统管理员外第一个注册的账号，是否将管理员权限移交至该账户？
          </p>
        ) : (
          <>
            <p className="mt-[12px] text-black/58" style={{ ...titleFont, fontSize: 21, lineHeight: 1.55 }}>
              请输入系统初始化时生成的 Token。验证通过后，系统管理员会降为成员，当前 GitHub 账号会成为新的管理员。
            </p>
            <input
              value={token}
              onChange={event => setToken(event.target.value)}
              type="password"
              placeholder="系统初始化 Token"
              className="mt-[20px] w-full rounded-[18px] border-2 border-black/20 bg-white/45 px-[18px] outline-none"
              style={{ height: 54, ...monoFont, fontSize: 18 }}
              autoFocus
            />
          </>
        )}
        <div className="mt-[22px] flex flex-wrap justify-end gap-[12px]">
          <button
            type="button"
            onClick={() => {
              if (mode === 'token') {
                setMode('confirm')
                setToken('')
              } else {
                void handleDecline()
              }
            }}
            disabled={submitting}
            className="cursor-pointer rounded-[18px] border-2 border-black/18 bg-white/28 px-[20px] py-[10px] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ ...titleFont, fontSize: 20 }}
          >
            {mode === 'token' ? '返回' : '不同意'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === 'confirm') {
                setMode('token')
                return
              }
              void handleSubmit()
            }}
            disabled={submitting}
            className="cursor-pointer rounded-[18px] border-2 border-black/30 bg-white/48 px-[20px] py-[10px] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ ...titleFont, fontSize: 20 }}
          >
            {submitting ? '处理中...' : mode === 'confirm' ? '同意' : '验证并移交'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AppRootRoute() {
  return (
    <AccountSystemProvider>
      <RoutedAppShell />
    </AccountSystemProvider>
  )
}

function RoutedAppShell() {
  const location = useRouterState({ select: state => state.location })
  const routePage = resolveRoutePage(location.pathname)
  const routeParams = normalizeRouteSearch(location.search as Record<string, unknown>)
  return <AppShell routePage={routePage} routeParams={routeParams} />
}

const rootRoute = createRootRoute({ component: AppRootRoute })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const appPageRoutes = Object.entries(pageRoutes)
  .filter(([page]) => page !== 'home')
  .map(([, routePath]) => createRoute({
    getParentRoute: () => rootRoute,
    path: routePath.slice(1),
  }))

const routeTree = rootRoute.addChildren([indexRoute, ...appPageRoutes])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function AppShell({ routePage, routeParams }: { routePage: Page; routeParams?: SubPageParams }) {
  const zoom = useZoom()
  const baseBgUrl = useBaseBgUrl()
  const cachedBgSettings = useCachedBgSettings()
  const { resolvedTheme } = useTheme()
  const { ready, currentUser, canAccessPage, logout } = useAccountSystem()
  const [loginTransition, setLoginTransition] = useState<'none' | 'cover-in' | 'cover-out'>('none')
  const [dismissedGithubTransferUserId, setDismissedGithubTransferUserId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([makeTab('home')])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const workbenchReturnTarget = useRef<{ page: Page; params?: SubPageParams }>({ page: 'misc' })
  const navigate = useNavigate()

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0]
  const routeParamsKey = paramsKey(routeParams)

  const navigateToPage = useCallback((page: Page, params?: SubPageParams) => {
    void navigate({
      to: pageRoutes[page],
      search: routeSearch(params),
    } as never)
  }, [navigate])

  const navigateToTab = useCallback((tab: Tab) => {
    navigateToPage(tab.page, tab.params)
  }, [navigateToPage])

  const handleReturnFromWorkbench = useCallback(() => {
    const target = workbenchReturnTarget.current
    navigateToPage(target.page, target.params)
  }, [navigateToPage])

  useEffect(() => {
    if (routePage !== 'template-workbench') {
      workbenchReturnTarget.current = { page: routePage, params: routeParams }
    }
  }, [routePage, routeParams, routeParamsKey])

  useEffect(() => {
    setTabs(prev => {
      const existing = prev.find(tab => tab.page === routePage)
      if (existing) {
        setActiveTabId(existing.id)
        return prev.map(tab => tab.id === existing.id ? { ...tab, params: routeParams } : tab)
      }
      const tab = { ...makeTab(routePage), params: routeParams }
      setActiveTabId(tab.id)
      if (prev.length >= 12) {
        return [...prev.slice(1), tab]
      }
      return [...prev, tab]
    })
  }, [routePage, routeParams, routeParamsKey])

  const handleNavigate = (page: Page, params?: SubPageParams) => {
    const existing = tabs.find(tab => tab.page === page)
    if (!existing && tabs.length >= 12) return
    navigateToPage(page, params)
  }

  const handleSelectTab = (id: string) => {
    const tab = tabs.find(item => item.id === id)
    if (!tab) return
    setActiveTabId(id)
    navigateToTab(tab)
  }

  const handleCloseTab = (id: string) => {
    setTabs(prev => {
      const next = prev.filter(tab => tab.id !== id)
      if (next.length === 0) return prev
      if (activeTabId === id) {
        const idx = prev.findIndex(tab => tab.id === id)
        const nextActive = next[Math.min(idx, next.length - 1)]
        setActiveTabId(nextActive.id)
        navigateToTab(nextActive)
      }
      return next
    })
  }

  const handleCloseOtherTabs = (id: string) => {
    const tab = tabs.find(item => item.id === id)
    if (!tab) return
    setTabs(prev => prev.filter(item => item.id === id))
    setActiveTabId(id)
    navigateToTab(tab)
  }

  const handleCloseRightTabs = (id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(tab => tab.id === id)
      const next = prev.slice(0, idx + 1)
      if (!next.find(tab => tab.id === activeTabId)) {
        const nextActive = next.find(tab => tab.id === id)
        if (nextActive) {
          setActiveTabId(id)
          navigateToTab(nextActive)
        }
      }
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
    handleNavigate('home')
  }

  const handleAuthenticated = () => {
    setTabs(prev => {
      const homeTab = prev.find(tab => tab.page === 'home') ?? makeTab('home')
      setActiveTabId(homeTab.id)
      return prev.some(tab => tab.id === homeTab.id) ? prev : [homeTab, ...prev]
    })
    navigateToPage('home')
    setLoginTransition('cover-in')
    window.setTimeout(() => {
      setLoginTransition('cover-out')
      window.setTimeout(() => setLoginTransition('none'), 900)
    }, 560)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore logout failures
    }
    logout()
  }

  if (!ready) {
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
  const shouldPromptGithubAdminTransfer = Boolean(
    currentUser &&
    currentUser.githubAdminTransferPending &&
    currentUser.role !== 'admin' &&
    currentUser.id !== dismissedGithubTransferUserId,
  )
  const pageDetail = currentUser
    ? `${pageLabels[activeTab.page]} 对当前 ${currentUser.role === 'guest' ? '访客' : '成员'} 模板未开放。`
    : '请先登录后再访问该页面。'

  return (
    <div className={`relative overflow-hidden theme-shell theme-${resolvedTheme}`} style={{ zoom, width: `${100 / zoom}vw`, height: `${100 / zoom}vh` }}>
      <BaseBackgroundLayer url={baseBgUrl} />

      {showLogin ? (
        <NotificationProvider>
          <div id="notification-root" className="absolute inset-0 z-[60] pointer-events-none" />
          <div className="absolute inset-0 z-10" style={resolveOverlayStyle(cachedBgSettings, resolvedTheme)} />
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <AuthPortal
              onAuthenticated={handleAuthenticated}
            />
          </div>
        </NotificationProvider>
      ) : (
        <BgProvider key={currentUser?.id ?? 'auth-guest'}>
          <NotificationProvider>
            <DynamicBackground />
            <div id="notification-root" className="absolute inset-0 z-[60] pointer-events-none" />

            {currentUser && routePage === 'template-workbench' ? (
              <div className="relative z-10 h-full">
                <AccessGuard
                  allowed={canAccessPage('template-workbench')}
                  className="h-full min-h-full"
                  detail={`${pageLabels['template-workbench']} 对当前 ${currentUser.role === 'guest' ? '访客' : '成员'} 模板未开放。`}
                >
                  <TemplateWorkbench onReturnToSource={handleReturnFromWorkbench} />
                </AccessGuard>
              </div>
            ) : currentUser && (
              <div className="relative z-10 flex h-full">
                <Sidebar currentPage={activeTab.page} onNavigate={handleNavigate} isPageAccessible={canAccessPage} />
                <div className="flex-1 flex flex-col overflow-hidden">
                  <Header
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onSelectTab={handleSelectTab}
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
                        <PageContent
                          page={activeTab.page}
                          params={activeTab.params}
                          onNavigate={handleNavigate}
                          onReturnFromWorkbench={handleReturnFromWorkbench}
                        />
                      </AccessGuard>
                    </PageTransition>
                  </main>
                </div>
              </div>
            )}

            {loginTransition !== 'none' && <LoginTransitionOverlay loginTransition={loginTransition} />}
            <GithubAdminTransferPrompt
              open={shouldPromptGithubAdminTransfer}
              onClose={() => setDismissedGithubTransferUserId(currentUser?.id ?? null)}
            />
          </NotificationProvider>
        </BgProvider>
      )}
    </div>
  )
}

export default function App() {
  return <RouterProvider router={router} />
}
