import { useState, useEffect } from 'react'
import { Plus, Play, Square, Trash2, RefreshCw } from 'lucide-react'

interface Instance {
  serial: string
  name: string
  status: 'running' | 'stopped' | 'error'
  botType: string
  port?: number
  lastStartTime?: string
}

export default function Instances() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchInstances()
  }, [])

  const fetchInstances = async () => {
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/instances', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setInstances(data.data || data)
      }
    } catch (error) {
      console.error('Failed to fetch instances:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStart = async (serial: string) => {
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/launcher/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serial, components: ['mai'] }),
      })
      if (response.ok) {
        fetchInstances()
      }
    } catch (error) {
      console.error('Failed to start instance:', error)
    }
  }

  const handleStop = async (serial: string) => {
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/launcher/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serial }),
      })
      if (response.ok) {
        fetchInstances()
      }
    } catch (error) {
      console.error('Failed to stop instance:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">实例管理</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchInstances}
            className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            新建实例
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="bg-card rounded-[30px] border border-border p-12 text-center">
          <p className="text-muted-foreground mb-4">暂无实例</p>
          <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            部署新实例
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.serial}
              instance={instance}
              onStart={() => handleStart(instance.serial)}
              onStop={() => handleStop(instance.serial)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InstanceCard({ 
  instance, 
  onStart, 
  onStop 
}: { 
  instance: Instance
  onStart: () => void
  onStop: () => void
}) {
  const statusColors = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    error: 'bg-red-500',
  }

  return (
    <div className="bg-card rounded-[30px] border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{instance.name}</h3>
        <span className={`px-3 py-1 rounded-full text-xs text-white ${statusColors[instance.status]}`}>
          {instance.status === 'running' ? '运行中' : instance.status === 'stopped' ? '已停止' : '错误'}
        </span>
      </div>
      
      <div className="space-y-2 mb-4">
        <p className="text-sm text-muted-foreground">序列号: {instance.serial}</p>
        <p className="text-sm text-muted-foreground">类型: {instance.botType}</p>
        {instance.port && <p className="text-sm text-muted-foreground">端口: {instance.port}</p>}
      </div>

      <div className="flex gap-2">
        {instance.status === 'running' ? (
          <button
            onClick={onStop}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
          >
            <Square className="w-4 h-4" />
            停止
          </button>
        ) : (
          <button
            onClick={onStart}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <Play className="w-4 h-4" />
            启动
          </button>
        )}
        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>
      </div>
    </div>
  )
}
