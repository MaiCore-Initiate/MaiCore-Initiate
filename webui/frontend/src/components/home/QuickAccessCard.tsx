import { useState, useEffect } from 'react'
import GlassCard from '../ui/GlassCard'
import Modal from '../ui/Modal'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'
import type { Page, SubPageParams } from '../../types'

const titleStyle = { fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.12))' }

const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  home: HomeIcon, instances: InstancesIcon, config: ConfigIcon,
  knowledge: KnowledgeIcon, 'db-migration': DbMigrationIcon,
  plugins: PluginsIcon, deploy: DeployIcon, status: StatusIcon,
  logs: LogsIcon, misc: MiscIcon, settings: SettingsIcon,
}

interface QuickItem {
  id: string
  page: Page
  label: string
  params?: SubPageParams
}

// 页面选项配置
interface PageOption {
  page: Page
  label: string
  params?: SubPageParams
  group: string
}

const PAGE_OPTIONS: PageOption[] = [
  // 主要功能组
  { page: 'home', label: '首页', group: '主要功能' },
  { page: 'instances', label: '实例启动/多开', group: '主要功能' },
  { page: 'deploy', label: '实例部署', group: '主要功能' },
  { page: 'plugins', label: '插件管理', group: '主要功能' },
  { page: 'knowledge', label: '知识库构建', group: '主要功能' },

  // 配置管理组
  { page: 'config', label: '配置管理', group: '配置管理' },
  { page: 'config', label: '编辑实例注册信息', params: { configAction: 'edit' }, group: '配置管理' },
  { page: 'config', label: '打开实例配置文件', params: { configAction: 'open-config' }, group: '配置管理' },
  { page: 'config', label: '打开实例所在目录', params: { configAction: 'open-folder' }, group: '配置管理' },

  // 监控与日志组
  { page: 'status', label: '查看运行状态', group: '监控与日志' },
  { page: 'logs', label: '日志查看器', group: '监控与日志' },
  { page: 'logs', label: '主程序日志', params: { logSource: 'main' }, group: '监控与日志' },
  { page: 'logs', label: 'WebUI 日志', params: { logSource: 'webui' }, group: '监控与日志' },
  { page: 'logs', label: '桌宠日志', params: { logSource: 'desktop_pet' }, group: '监控与日志' },

  // 杂项组
  { page: 'misc', label: '杂项', group: '杂项' },
  { page: 'misc', label: '关于项目', params: { miscTab: 'about' }, group: '杂项' },
  { page: 'misc', label: '关于作者', params: { miscTab: 'author' }, group: '杂项' },
  { page: 'misc', label: '技术栈', params: { miscTab: 'tech' }, group: '杂项' },
  { page: 'misc', label: '开源库', params: { miscTab: 'libs' }, group: '杂项' },
  { page: 'misc', label: '开源许可', params: { miscTab: 'license' }, group: '杂项' },
  { page: 'misc', label: '组件下载', params: { miscTab: 'components' }, group: '杂项' },
  { page: 'misc', label: 'WebShell', params: { miscTab: 'webshell' }, group: '杂项' },
  { page: 'misc', label: '屏保', params: { miscTab: 'screensaver' }, group: '杂项' },
  { page: 'misc', label: '桌宠', params: { miscTab: 'desktop-pet' }, group: '杂项' },

  // 其他组
  { page: 'settings', label: '设置', group: '其他' },
  { page: 'component-download', label: '组件下载', group: '其他' },
]

const defaultItems: QuickItem[] = [
  { id: '1', page: 'plugins', label: '插件管理' },
  { id: '2', page: 'instances', label: '实例启动/多开' },
  { id: '3', page: 'config', label: '配置管理' },
]

function ConfigModal({
  open,
  onClose,
  currentItems,
  onSave
}: {
  open: boolean
  onClose: () => void
  currentItems: QuickItem[]
  onSave: (items: QuickItem[]) => void
}) {
  const [selectedOptions, setSelectedOptions] = useState<PageOption[]>([])

  useEffect(() => {
    if (open) {
      // 根据 currentItems 初始化选中状态
      const selected = currentItems.map(item =>
        PAGE_OPTIONS.find(opt =>
          opt.page === item.page &&
          JSON.stringify(opt.params) === JSON.stringify(item.params)
        )
      ).filter(Boolean) as PageOption[]
      setSelectedOptions(selected)
    }
  }, [open, currentItems])

  const toggleOption = (option: PageOption) => {
    setSelectedOptions(prev => {
      const exists = prev.some(o =>
        o.page === option.page &&
        JSON.stringify(o.params) === JSON.stringify(option.params)
      )
      if (exists) {
        return prev.filter(o =>
          !(o.page === option.page &&
            JSON.stringify(o.params) === JSON.stringify(option.params))
        )
      } else {
        if (prev.length >= 5) return prev  // 最多5个
        return [...prev, option]
      }
    })
  }

  const handleSave = () => {
    const newItems: QuickItem[] = selectedOptions.map((opt, idx) => ({
      id: `quick-${Date.now()}-${idx}`,
      page: opt.page,
      label: opt.label,
      params: opt.params,
    }))
    onSave(newItems)
    onClose()
  }

  // 按分组整理选项
  const groupedOptions = PAGE_OPTIONS.reduce((acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = []
    acc[opt.group].push(opt)
    return acc
  }, {} as Record<string, PageOption[]>)

  return (
    <Modal open={open} onClose={onClose} width={800}>
      <div className="p-[32px]">
        <h2 className="text-black mb-[24px]" style={titleStyle}>
          配置快捷访问
        </h2>
        <p className="text-black/60 mb-[16px]" style={{ fontSize: 20, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
          选择最多 5 个页面（已选 {selectedOptions.length}/5）
        </p>

        <div className="max-h-[500px] overflow-y-auto pr-[8px]">
          {Object.entries(groupedOptions).map(([group, options]) => (
            <div key={group} className="mb-[24px]">
              <h3 className="text-black/70 mb-[12px]" style={{ fontSize: 28, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}>
                {group}
              </h3>
              <div className="flex flex-wrap gap-[8px]">
                {options.map((opt, idx) => {
                  const isSelected = selectedOptions.some(o =>
                    o.page === opt.page &&
                    JSON.stringify(o.params) === JSON.stringify(opt.params)
                  )
                  return (
                    <button
                      key={`${opt.page}-${idx}`}
                      onClick={() => toggleOption(opt)}
                      className="px-[16px] py-[8px] rounded-[20px] transition-all cursor-pointer"
                      style={{
                        border: '2px solid rgba(0,0,0,0.4)',
                        background: isSelected ? 'rgba(100,150,255,0.3)' : 'transparent',
                        fontSize: 20,
                        fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif",
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-[12px] mt-[24px] justify-end">
          <button
            onClick={onClose}
            className="px-[24px] py-[12px] rounded-[24px] border-2 border-black/40 cursor-pointer hover:border-black/60 transition-colors"
            style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-[24px] py-[12px] rounded-[24px] border-2 border-black/60 bg-black/10 cursor-pointer hover:bg-black/20 transition-colors"
            style={{ fontSize: 22, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif" }}
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function QuickAccessCard({
  onNavigate
}: {
  onNavigate?: (page: Page, params?: SubPageParams) => void
}) {
  const [items, setItems] = useState<QuickItem[]>(defaultItems)
  const [configOpen, setConfigOpen] = useState(false)

  useEffect(() => {
    fetch('/api/preferences/quickAccessItems', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setItems(d.value) })
      .catch(() => {})
  }, [])

  const saveItems = (next: QuickItem[]) => {
    setItems(next)
    fetch('/api/preferences/quickAccessItems', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ value: next }),
    }).catch(() => {})
  }

  const handleItemClick = (item: QuickItem) => {
    onNavigate?.(item.page, item.params)
  }

  return (
    <>
      <GlassCard>
        <div className="p-[33px] flex flex-col">
          <div className="flex items-center justify-between pb-[16px]">
            <h2 className="text-black" style={titleStyle}>快捷访问</h2>
            <button
              onClick={() => setConfigOpen(true)}
              className="w-[40px] h-[40px] rounded-[9px] border-3 border-black/50 flex items-center justify-center cursor-pointer hover:border-black/70 transition-colors"
              style={{ filter: 'drop-shadow(5px 3px 3px rgba(0,0,0,0.16))' }}
            >
              <svg width="30" height="30" viewBox="0 0 20 20" fill="none">
                <line x1="3" y1="4" x2="17" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="3" y1="10" x2="17" y2="10" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="3" y1="16" x2="17" y2="16" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="7" cy="4" r="2" fill="rgba(0,0,0,0.5)" />
                <circle cx="13" cy="10" r="2" fill="rgba(0,0,0,0.5)" />
                <circle cx="9" cy="16" r="2" fill="rgba(0,0,0,0.5)" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-center gap-[7px]">
            {items.length === 0 ? (
              <div className="flex items-center justify-center rounded-[30px] border-3 border-dashed border-[#9e9e9e]" style={{ width: 316, height: 60 }}>
                <span className="text-[#9e9e9e] font-semibold text-base" style={{ fontFamily: "'Segoe UI', 'HarmonyOS Sans SC', sans-serif" }}>no items</span>
              </div>
            ) : items.map(item => {
              const Icon = iconMap[item.page]
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex items-center gap-3 cursor-pointer transition-all backdrop-blur-[4px] hover:border-[rgba(112,112,112,0.65)]"
                  style={{
                    width: 316, height: 60, borderRadius: 30, paddingLeft: 16,
                    border: '3px solid rgba(112,112,112,0.45)', background: 'transparent',
                  }}
                >
                  {Icon && <Icon className="text-[#707070]" />}
                  <span
                    className="text-[#707070]"
                    style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: 400, marginTop: 4 }}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </GlassCard>

      <ConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        currentItems={items}
        onSave={saveItems}
      />
    </>
  )
}
