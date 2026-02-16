import { useState, useEffect } from 'react'
import { BrainCircuit, Play } from 'lucide-react'

interface Instance {
  serial: string
  name: string
}

interface KnowledgeTask {
  id: string
  instanceName: string
  taskType: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
}

export default function Knowledge() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedInstance, setSelectedInstance] = useState('')
  const [_tasks] = useState<KnowledgeTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('webui_token')
      const headers = {
        'Authorization': `Bearer ${token}`,
      }

      const [instancesRes] = await Promise.all([
        fetch('/api/instances', { headers }),
      ])

      if (instancesRes.ok) {
        const data = await instancesRes.json()
        setInstances(data.data || data)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBuild = async (taskType: string) => {
    if (!selectedInstance) return

    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch(`/api/knowledge/${selectedInstance}/${taskType}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Failed to start build:', error)
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
      <h1 className="text-2xl font-bold">知识库构建</h1>

      {/* 选择实例 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5" />
          选择实例
        </h2>

        <select
          value={selectedInstance}
          onChange={(e) => setSelectedInstance(e.target.value)}
          className="w-full h-12 px-4 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">请选择实例</option>
          {instances.map((instance) => (
            <option key={instance.serial} value={instance.serial}>
              {instance.name} ({instance.serial})
            </option>
          ))}
        </select>
      </div>

      {/* 构建任务 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">构建任务</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <BuildTaskCard
            title="文本分割"
            description="将长文本分割为适合处理的片段"
            icon={Play}
            disabled={!selectedInstance}
            onClick={() => handleBuild('text-split')}
          />
          <BuildTaskCard
            title="实体提取"
            description="从文本中提取关键实体信息"
            icon={Play}
            disabled={!selectedInstance}
            onClick={() => handleBuild('entity-extract')}
          />
          <BuildTaskCard
            title="知识图谱导入"
            description="将实体信息导入知识图谱"
            icon={Play}
            disabled={!selectedInstance}
            onClick={() => handleBuild('knowledge-import')}
          />
          <BuildTaskCard
            title="一条龙构建"
            description="自动完成所有构建步骤"
            icon={Play}
            disabled={!selectedInstance}
            onClick={() => handleBuild('pipeline')}
          />
        </div>
      </div>

      {/* 数据库迁移 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">数据库迁移</h2>
        <p className="text-muted-foreground mb-4">
          将数据从 MongoDB 迁移到 SQLite
        </p>
        <button
          disabled={!selectedInstance}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          开始迁移
        </button>
      </div>
    </div>
  )
}

function BuildTaskCard({ 
  title, 
  description, 
  icon: Icon, 
  disabled,
  onClick 
}: { 
  title: string
  description: string
  icon: React.ElementType
  disabled: boolean
  onClick: () => void
}) {
  return (
    <div className={`p-4 rounded-xl border border-border/50 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        开始
      </button>
    </div>
  )
}
