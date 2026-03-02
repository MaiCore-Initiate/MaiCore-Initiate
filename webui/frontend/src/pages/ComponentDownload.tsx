import { useState, useEffect, useRef } from 'react'
import GlassCard from '../components/ui/GlassCard'
import { useNotification } from '../components/ui/Notification'
import { cn } from '../lib/utils'
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

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

const d = (i: number) => ({ animationDelay: `${i * 80}ms` })

interface Component {
  key: string
  name: string
  description: string
  icon: string
  status: string
}

interface ProgressInfo {
  taskId: string
  percent: number
  phase: string
  message?: string
  status?: string
}

export default function ComponentDownload() {
  const { notify } = useNotification()
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [progressMap, setProgressMap] = useState<Record<string, ProgressInfo>>({})
  const pollingTimers = useRef<Record<string, NodeJS.Timeout>>({})

  useEffect(() => {
    fetchComponents()
    return () => {
      Object.values(pollingTimers.current).forEach(timer => clearInterval(timer))
    }
  }, [])

  const fetchComponents = async () => {
    try {
      const res = await fetch('/api/components/list', { credentials: 'include' })
      if (!res.ok) throw new Error('获取组件列表失败')
      const data = await res.json()
      setComponents(data)
    } catch (error) {
      notify('获取组件列表失败', 'error')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const startPolling = (componentKey: string, taskId: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/components/progress/${taskId}`, { credentials: 'include' })
        if (!res.ok) throw new Error('进度查询失败')
        const data = await res.json()

        setProgressMap(prev => ({
          ...prev,
          [componentKey]: {
            taskId,
            percent: data.percent ?? 0,
            phase: data.phase ?? 'pending',
            message: data.message,
            status: data.status,
          }
        }))

        const finished = ['done', 'failed'].includes(data.status)
        const percentDone = (data.percent ?? 0) >= 100
        if (finished || percentDone) {
          clearInterval(timer)
          delete pollingTimers.current[componentKey]
          setDownloading(null)
          if (data.status === 'done') {
            notify(`${componentKey} 下载完成`, 'success')
          } else if (data.status === 'failed') {
            notify(`${componentKey} 下载失败：${data.message || ''}`, 'error')
          }
        }
      } catch (e) {
        console.error(e)
      }
    }, 1500)
    pollingTimers.current[componentKey] = timer
  }

  const handleCleanup = async () => {
    if (!confirm('确定要清理所有临时安装包吗？此操作不可撤销。')) {
      return
    }

    try {
      const res = await fetch('/api/components/cleanup', {
        method: 'POST',
        credentials: 'include'
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || '清理失败')
      }

      if (data.errors && data.errors.length > 0) {
        notify(`${data.message}，部分文件清理失败`, 'warning')
      } else {
        notify(data.message || '清理成功', 'success')
      }
    } catch (error: any) {
      notify(`清理失败：${error.message || error}`, 'error')
      console.error(error)
    }
  }

  const handleDownload = async (componentKey: string, componentName: string) => {
    if (downloading) {
      notify('请等待当前下载完成', 'warning')
      return
    }

    let installPath: string | undefined = undefined

    // SQLiteStudio 需要用户指定安装目录
    if (componentKey === 'sqlitestudio') {
      installPath = prompt('请输入 SQLiteStudio 安装目录（例如：D:\\Tools\\SQLiteStudio）：')
      if (!installPath) {
        notify('已取消下载', 'info')
        return
      }
    }

    setDownloading(componentKey)
    setProgressMap(prev => ({
      ...prev,
      [componentKey]: { taskId: '', percent: 5, phase: 'preparing', status: 'running', message: '准备中' }
    }))
    notify(`正在下载 ${componentName}，请稍候...`, 'info')

    try {
      const res = await fetch('/api/components/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          component_key: componentKey,
          install_path: installPath
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || '下载请求失败')
      }

      const { task_id: taskId } = data
      if (!taskId) throw new Error('未获取到任务ID')

      setProgressMap(prev => ({
        ...prev,
        [componentKey]: { taskId, percent: 5, phase: 'preparing', status: 'running', message: '准备中' }
      }))

      startPolling(componentKey, taskId)
    } catch (error: any) {
      notify(`下载 ${componentName} 时发生错误：${error.message || error}`, 'error')
      console.error(error)
      setDownloading(null)
    }
  }

  const handleCancel = async (componentKey: string, taskId: string) => {
    try {
      const res = await fetch(`/api/components/cancel/${taskId}`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || '取消请求失败')
      }

      notify('已取消下载', 'info')
      setProgressMap(prev => ({
        ...prev,
        [componentKey]: { ...prev[componentKey], status: 'canceled', phase: 'canceled', message: '已取消' }
      }))
      setDownloading(null)

      // 停止轮询
      if (pollingTimers.current[componentKey]) {
        clearInterval(pollingTimers.current[componentKey])
        delete pollingTimers.current[componentKey]
      }
    } catch (error: any) {
      notify(`取消失败：${error.message || error}`, 'error')
      console.error(error)
    }
  }

  const getPhaseLabel = (phase?: string, status?: string) => {
    if (status === 'failed') return '失败'
    if (status === 'done') return '完成'
    switch (phase) {
      case 'preparing':
        return '准备中'
      case 'downloading':
        return '下载中'
      case 'installing':
        return '安装中'
      case 'done':
        return '完成'
      default:
        return '等待中'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black/50"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      {/* 页面标题和清理按钮 */}
      <div className="animate-fade-slide-up flex items-start justify-between" style={d(0)}>
        <div>
          <h1 className="text-black/80 mb-2" style={pageTitleStyle}>
            组件下载中心
          </h1>
          <p className="text-black/50" style={textFont}>
            下载和安装项目所需的各种开发工具和运行环境
          </p>
        </div>
        <button
          onClick={handleCleanup}
          disabled={downloading !== null}
          className={cn(
            'px-[24px] py-[12px] rounded-[16px] border-2 transition-all flex-shrink-0',
            downloading !== null
              ? 'bg-gray-100/50 border-gray-300/50 text-gray-400 cursor-not-allowed'
              : 'bg-white/50 border-orange-400/60 text-orange-600 hover:bg-orange-50/70 active:bg-orange-100/80 cursor-pointer'
          )}
          style={{ ...labelFont, fontSize: 20, boxShadow: downloading !== null ? 'none' : '2px 3px 6px rgba(0,0,0,0.15)' }}
        >
          清理安装包
        </button>
      </div>

      {/* 组件网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg-grid-cols-3 gap-6">
        {components.map((component, index) => (
          <div key={component.key} className="animate-fade-slide-up" style={d(index + 1)}>
            <ComponentCard
              component={component}
              downloading={downloading === component.key}
              progress={progressMap[component.key]}
              onDownload={() => handleDownload(component.key, component.name)}
              onCancel={() => {
                const progress = progressMap[component.key]
                if (progress?.taskId) {
                  handleCancel(component.key, progress.taskId)
                }
              }}
            />
          </div>
        ))}
      </div>

      {/* 空状态 */}
      {components.length === 0 && (
        <div className="animate-fade-slide-up" style={d(1)}>
          <GlassCard>
            <div className="p-[60px] flex flex-col items-center justify-center">
              <p className="text-black/30" style={sectionTitle}>暂无可用组件</p>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}

interface ComponentCardProps {
  component: Component
  downloading: boolean
  progress?: ProgressInfo
  onDownload: () => void
  onCancel: () => void
}

function ComponentCard({ component, downloading, progress, onDownload, onCancel }: ComponentCardProps) {
  const percent = progress?.percent ?? 0
  const status = progress?.status
  const phaseLabel = getPhaseLabel(progress?.phase, status)
  const isRunning = downloading || status === 'running'

  return (
    <GlassCard>
      <div className="p-[30px] flex flex-col h-full">
        {/* 标题 */}
        <div className="mb-[20px]">
          <h3 className="text-black/80 truncate" style={{ ...labelFont, fontSize: 28 }}>
            {component.name}
          </h3>
          <p className="text-black/50 mt-2" style={textFont}>
            {component.description}
          </p>
        </div>

        {/* 状态标签 */}
        <div className="mb-[12px]">
          <span
            className={cn(
              'inline-block px-[16px] py-[6px] rounded-[12px] text-sm border flex items-center gap-[6px] w-fit',
              component.status === 'available'
                ? 'bg-green-100/50 text-green-700 border-green-300/50'
                : 'bg-gray-100/50 text-gray-600 border-gray-300/50'
            )}
            style={textFont}
          >
            {component.status === 'available' ? (
              <>
                <CheckCircle size={16} />
                可下载
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                不可用
              </>
            )}
          </span>
        </div>

        {/* 下载按钮 */}
        <button
          onClick={onDownload}
          disabled={isRunning || component.status !== 'available'}
          className={cn(
            'mt-auto w-full py-[12px] rounded-[20px] border-2 transition-all flex items-center justify-center gap-[8px]',
            isRunning && 'bg-blue-100/50 border-blue-400/50 text-blue-600 cursor-wait',
            !isRunning && component.status === 'available' && 'bg-white/50 border-black/50 text-black/70 hover:bg-white/70 active:bg-white/90 cursor-pointer',
            !isRunning && component.status !== 'available' && 'bg-gray-100/30 border-gray-300/50 text-gray-400 cursor-not-allowed'
          )}
          style={{ ...labelFont, boxShadow: isRunning ? 'none' : '2px 3px 6px rgba(0,0,0,0.15)' }}
        >
          {isRunning ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              {`下载中... ${percent}%`}
            </>
          ) : (
            <>
              <Download size={20} />
              下载
            </>
          )}
        </button>

        {/* 取消安装按钮 */}
        {isRunning && (
          <button
            onClick={onCancel}
            className="mt-2 w-full py-[10px] rounded-[14px] border border-red-300/70 text-red-600 bg-red-50/70 hover:bg-red-100 active:bg-red-200 cursor-pointer transition-all"
            style={{ ...textFont, fontSize: 16 }}
          >
            取消安装
          </button>
        )}

        {/* 进度条 */}
        {progress && (
          <div className="mt-3">
            <div className="flex justify-between text-black/60" style={{ ...textFont, fontSize: 16 }}>
              <span>{phaseLabel}</span>
              <span>{percent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  status === 'failed' ? 'bg-red-400' : 'bg-blue-500'
                )}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
            {progress.message && (
              <p className="text-black/50 mt-1" style={{ ...textFont, fontSize: 14 }}>
                {progress.message}
              </p>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function getPhaseLabel(phase?: string, status?: string) {
  if (status === 'canceled') return '已取消'
  if (status === 'failed') return '失败'
  if (status === 'done') return '完成'
  switch (phase) {
    case 'preparing':
      return '准备中'
    case 'downloading':
      return '下载中'
    case 'installing':
      return '安装中'
    case 'done':
      return '完成'
    case 'canceled':
      return '已取消'
    default:
      return '等待中'
  }
}
