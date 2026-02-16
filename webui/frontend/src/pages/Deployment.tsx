import { useState, useEffect } from 'react'
import { Rocket, Download, RefreshCw } from 'lucide-react'

interface Version {
  version: string
  date: string
  isLatest: boolean
}

interface BotType {
  name: string
  versions: Version[]
}

export default function Deployment() {
  const [botTypes, setBotTypes] = useState<BotType[]>([])
  const [selectedBotType, setSelectedBotType] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDeploying] = useState(false)

  useEffect(() => {
    fetchVersions()
  }, [])

  const fetchVersions = async () => {
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/deploy/versions', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setBotTypes(data.data || data)
      }
    } catch (error) {
      console.error('Failed to fetch versions:', error)
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">部署管理</h1>
        <button
          onClick={fetchVersions}
          className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 部署新实例 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          部署新实例
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 选择Bot类型 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">选择Bot类型</label>
            <select
              value={selectedBotType}
              onChange={(e) => setSelectedBotType(e.target.value)}
              className="w-full h-12 px-4 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">请选择Bot类型</option>
              {botTypes.map((bot) => (
                <option key={bot.name} value={bot.name}>
                  {bot.name}
                </option>
              ))}
            </select>
          </div>

          {/* 选择版本 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">选择版本</label>
            <select
              className="w-full h-12 px-4 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={!selectedBotType}
            >
              <option value="">请先选择Bot类型</option>
              {selectedBotType && (
                <>
                  {botTypes
                    .find((b) => b.name === selectedBotType)
                    ?.versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        {v.version} {v.isLatest ? '(最新)' : ''} - {v.date}
                      </option>
                    ))}
                </>
              )}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <button
            disabled={!selectedBotType || isDeploying}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeploying ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                部署中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                开始部署
              </>
            )}
          </button>
        </div>
      </div>

      {/* 版本列表 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">可用版本</h2>
        
        {botTypes.map((bot) => (
          <div key={bot.name} className="mb-6">
            <h3 className="font-medium mb-3">{bot.name}</h3>
            <div className="space-y-2">
              {bot.versions.slice(0, 5).map((version) => (
                <div
                  key={version.version}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div>
                    <span className="font-medium">{version.version}</span>
                    {version.isLatest && (
                      <span className="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                        最新
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{version.date}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
