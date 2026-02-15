import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Instances from './pages/Instances'
import Deployment from './pages/Deployment'
import Knowledge from './pages/Knowledge'
import Settings from './pages/Settings'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'

type Page = 'dashboard' | 'instances' | 'deployment' | 'knowledge' | 'settings'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 检查cookie中的认证状态
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/status', {
          credentials: 'include'
        })
        const data = await response.json()
        if (data.logged_in) {
          setIsAuthenticated(true)
        }
      } catch {
        // 未认证
      }
      setIsLoading(false)
    }
    checkAuth()
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch {
      // 忽略错误
    }
    setIsAuthenticated(false)
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
    <div className="flex h-screen bg-background">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onLogout={handleLogout} />
        <main className="flex-1 overflow-auto p-6">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'instances' && <Instances />}
          {currentPage === 'deployment' && <Deployment />}
          {currentPage === 'knowledge' && <Knowledge />}
          {currentPage === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  )
}

// 登录页面组件
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('请输入Token')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })

      if (response.ok) {
        localStorage.setItem('webui_token', token)
        onLogin()
      } else {
        setError('Token验证失败，请检查后重试')
      }
    } catch {
      setError('连接失败，请确保服务器正在运行')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20">
      {/* 背景模糊效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[50px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[50px]"></div>
      </div>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md p-8 bg-card/80 backdrop-blur-xl rounded-[30px] border border-border/50 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            MaiCore Start
          </h1>
          <p className="text-muted-foreground mt-2">WebUI 管理面板</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="token" className="text-sm font-medium">
              访问 Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="请输入您的访问Token"
              className="w-full h-12 px-4 bg-input/50 backdrop-blur-[30px] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-primary/90 hover:bg-primary backdrop-blur-[30px] text-primary-foreground rounded-lg font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '验证中...' : '登 录'}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-sm mt-6">
          Token 可在主程序杂项菜单中查看
        </p>
      </div>
    </div>
  )
}

export default App
