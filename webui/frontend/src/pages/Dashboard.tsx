import { useState, useEffect } from 'react'
import { Bot, Cpu, HardDrive, Activity } from 'lucide-react'

interface SystemStats {
  totalInstances: number
  runningInstances: number
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
}

interface Instance {
  serial: string
  name: string
  status: 'running' | 'stopped' | 'error'
  botType: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<SystemStats>({
    totalInstances: 0,
    runningInstances: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,
  })
  const [instances, setInstances] = useState<Instance[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('webui_token')
      const headers = {
        'Authorization': `Bearer ${token}`,
      }

      const [statsRes, instancesRes] = await Promise.all([
        fetch('/api/statistics/summary', { headers }),
        fetch('/api/instances', { headers }),
      ])

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData.data || statsData)
      }

      if (instancesRes.ok) {
        const instancesData = await instancesRes.json()
        setInstances(instancesData.data || instancesData)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
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
      <h1 className="text-2xl font-bold">仪表盘</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="实例总数"
          value={stats.totalInstances}
          icon={Bot}
          color="bg-blue-500"
        />
        <StatCard
          title="运行中"
          value={stats.runningInstances}
          icon={Activity}
          color="bg-green-500"
        />
        <StatCard
          title="CPU 使用率"
          value={`${stats.cpuUsage.toFixed(1)}%`}
          icon={Cpu}
          color="bg-orange-500"
        />
        <StatCard
          title="内存使用"
          value={`${stats.memoryUsage.toFixed(1)}%`}
          icon={HardDrive}
          color="bg-purple-500"
        />
      </div>

      {/* 实例列表 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">实例概览</h2>
        
        {instances.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            暂无实例，请先部署一个实例
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map((instance) => (
              <InstanceCard key={instance.serial} instance={instance} />
            ))}
          </div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickActionButton label="部署新实例" href="/deployment" />
          <QuickActionButton label="查看实例" href="/instances" />
          <QuickActionButton label="构建知识库" href="/knowledge" />
          <QuickActionButton label="系统设置" href="/settings" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color }: {
  title: string
  value: number | string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-card rounded-[30px] border border-border p-6 flex items-center gap-4">
      <div className={`${color} p-3 rounded-xl`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  )
}

function InstanceCard({ instance }: { instance: Instance }) {
  const statusColors = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    error: 'bg-red-500',
  }

  return (
    <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{instance.name}</h3>
        <span className={`w-2 h-2 rounded-full ${statusColors[instance.status]}`}></span>
      </div>
      <p className="text-sm text-muted-foreground">序列号: {instance.serial}</p>
      <p className="text-sm text-muted-foreground">类型: {instance.botType}</p>
    </div>
  )
}

function QuickActionButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="block text-center py-4 px-6 bg-muted/30 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
    >
      <span className="text-sm font-medium">{label}</span>
    </a>
  )
}
