import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, RotateCcw } from 'lucide-react'

interface ProgramSettings {
  theme: {
    primary: string
    secondary: string
  }
  logging: {
    log_rotation_days: number
  }
  ui: {
    minimize_to_tray: boolean
  }
  notifications: {
    windows_center_enabled: boolean
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<ProgramSettings>({
    theme: { primary: '#BADFFA', secondary: '#00FFBB' },
    logging: { log_rotation_days: 30 },
    ui: { minimize_to_tray: false },
    notifications: { windows_center_enabled: false },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/settings/program', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setSettings(data.data || data)
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const token = localStorage.getItem('webui_token')
      const response = await fetch('/api/settings/program', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })
      if (response.ok) {
        alert('设置已保存')
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setIsSaving(false)
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
        <h1 className="text-2xl font-bold">系统设置</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      {/* 主题设置 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          主题颜色
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">主色调</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={settings.theme.primary}
                onChange={(e) => setSettings({ ...settings, theme: { ...settings.theme, primary: e.target.value } })}
                className="w-12 h-12 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={settings.theme.primary}
                onChange={(e) => setSettings({ ...settings, theme: { ...settings.theme, primary: e.target.value } })}
                className="flex-1 h-12 px-4 bg-muted rounded-lg border border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">次要色</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={settings.theme.secondary}
                onChange={(e) => setSettings({ ...settings, theme: { ...settings.theme, secondary: e.target.value } })}
                className="w-12 h-12 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={settings.theme.secondary}
                onChange={(e) => setSettings({ ...settings, theme: { ...settings.theme, secondary: e.target.value } })}
                className="flex-1 h-12 px-4 bg-muted rounded-lg border border-border"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 日志设置 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">日志设置</h2>

        <div className="space-y-2">
          <label className="text-sm font-medium">日志保留天数</label>
          <input
            type="number"
            value={settings.logging.log_rotation_days}
            onChange={(e) => setSettings({ ...settings, logging: { ...settings.logging, log_rotation_days: parseInt(e.target.value) } })}
            className="w-full h-12 px-4 bg-muted rounded-lg border border-border"
          />
        </div>
      </div>

      {/* UI设置 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">界面设置</h2>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-muted/30 rounded-lg cursor-pointer">
            <span>最小化到系统托盘</span>
            <input
              type="checkbox"
              checked={settings.ui.minimize_to_tray}
              onChange={(e) => setSettings({ ...settings, ui: { ...settings.ui, minimize_to_tray: e.target.checked } })}
              className="w-5 h-5"
            />
          </label>

          flex items-center justify<label className="-between p-4 bg-muted/30 rounded-lg cursor-pointer">
            <span>启用Windows通知</span>
            <input
              type="checkbox"
              checked={settings.notifications.windows_center_enabled}
              onChange={(e) => setSettings({ ...settings, notifications: { ...settings.notifications, windows_center_enabled: e.target.checked } })}
              className="w-5 h-5"
            />
          </label>
        </div>
      </div>

      {/* Token设置 */}
      <div className="bg-card rounded-[30px] border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">WebUI Token</h2>
        
        <p className="text-muted-foreground mb-4">
          Token用于WebUI登录验证，可在主程序杂项菜单中查看和管理
        </p>
        
        <button className="px-6 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
          查看当前Token
        </button>
      </div>
    </div>
  )
}
