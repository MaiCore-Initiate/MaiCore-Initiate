import type { Page } from '../../types'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const sections = [
  {
    title: '摘要',
    items: [
      { id: 'home' as Page, label: '首页', icon: HomeIcon },
      { id: 'instances' as Page, label: '实例管理', icon: InstancesIcon },
    ]
  },
  {
    title: '功能',
    items: [
      { id: 'config' as Page, label: '配置管理', icon: ConfigIcon },
      { id: 'knowledge' as Page, label: '知识库', icon: KnowledgeIcon },
      { id: 'db-migration' as Page, label: '数据库迁移', icon: DbMigrationIcon },
      { id: 'plugins' as Page, label: '插件管理', icon: PluginsIcon },
      { id: 'deploy' as Page, label: '部署管理', icon: DeployIcon },
      { id: 'status' as Page, label: '运行状态', icon: StatusIcon },
      { id: 'logs' as Page, label: '日志查看', icon: LogsIcon },
    ]
  },
  {
    title: '杂项',
    items: [
      { id: 'misc' as Page, label: '杂项', icon: MiscIcon },
      { id: 'settings' as Page, label: '设置', icon: SettingsIcon },
    ]
  },
]

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-[340px] h-screen flex flex-col shrink-0 bg-white/5 backdrop-blur-[50px] border-r border-black/10">
      {/* 品牌区 */}
      <div className="flex flex-col items-center justify-center pt-8 pb-4">
        <span className="text-black/80 select-none" style={{ fontSize: 50, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
          MaiCoreStart
        </span>
        <span className="text-black/40 select-none" style={{ fontSize: 20, fontFamily: "'Cascadia Code', monospace" }}>
          v4.2.0
        </span>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="mx-4 my-2 border-t border-black/15" />}
            <div className="px-4 py-1 text-black/35 select-none" style={{ fontSize: 14, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = currentPage === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="w-full flex items-center gap-3 px-5 my-[2px] transition-all cursor-pointer"
                  style={{
                    width: 316,
                    height: 60,
                    borderRadius: 30,
                    margin: '2px auto',
                    border: active ? '5px solid rgba(0,0,0,0.8)' : '3px solid rgba(0,0,0,0.45)',
                    background: active ? 'rgba(255,255,255,0.3)' : 'transparent',
                  }}
                >
                  <Icon className={active ? 'text-black/80' : 'text-black/50'} />
                  <span
                    className={active ? 'text-black/80' : 'text-black/50'}
                    style={{ fontSize: 20, fontFamily: "'HYWenHei', 'Microsoft YaHei', sans-serif" }}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
