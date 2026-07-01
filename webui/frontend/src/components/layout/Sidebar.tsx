import type { Page } from '../../types'
import {
  HomeIcon, InstancesIcon, ConfigIcon, KnowledgeIcon, DbMigrationIcon,
  PluginsIcon, DeployIcon, StatusIcon, LogsIcon, MiscIcon, SettingsIcon
} from '../icons/SidebarIcons'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  isPageAccessible: (page: Page) => boolean
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="11" width="12" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 11V8.7a3.5 3.5 0 0 1 7 0V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const sections = [
  {
    title: '摘要',
    items: [
      { id: 'home' as Page, label: '首页', icon: HomeIcon },
    ]
  },
  {
    title: '功能',
    items: [
      { id: 'instances' as Page, label: '实例启动/多开', icon: InstancesIcon },
      { id: 'config' as Page, label: '配置管理', icon: ConfigIcon },
      { id: 'knowledge' as Page, label: '知识库构建', icon: KnowledgeIcon },
      { id: 'db-migration' as Page, label: '数据库迁移', icon: DbMigrationIcon },
      { id: 'plugins' as Page, label: '插件管理', icon: PluginsIcon },
      { id: 'deploy' as Page, label: '实例部署辅助系统', icon: DeployIcon },
      { id: 'status' as Page, label: '查看运行状态', icon: StatusIcon },
      { id: 'logs' as Page, label: '日志查看器', icon: LogsIcon },
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

export default function Sidebar({ currentPage, onNavigate, isPageAccessible }: SidebarProps) {
  return (
    <aside className="w-[340px] h-full flex flex-col shrink-0" style={{ borderRight: '1px solid var(--mc-border-soft)' }}>
      {/* 品牌区 */}
      <div className="h-[87px] flex flex-col justify-center px-[11px] shrink-0">
        <span className="select-none leading-none" style={{ color: 'var(--mc-text-muted)', fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: 700 }}>
          MaiCoreStart
        </span>
        <span className="select-none mt-[3px]" style={{ color: 'var(--mc-text-muted)', fontSize: 20, fontFamily: "'Segoe', 'HarmonyOS Sans SC', sans-serif" }}>
          v5.1.0-beta
        </span>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="mx-0 my-2" style={{ borderTop: '1px solid var(--mc-divider)' }} />}
            <div className="px-[3px] py-1 select-none" style={{ color: 'var(--mc-text-muted)', fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: 300 }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = currentPage === item.id
              const Icon = item.icon
              const accessible = isPageAccessible(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-3 my-[2px] transition-all cursor-pointer ${active ? 'backdrop-blur-[50px] brightness-105' : 'backdrop-blur-[4px]'}`}
                  style={{
                    width: 316,
                    height: 60,
                    borderRadius: 30,
                    margin: '2px auto',
                    paddingLeft: 16,
                    border: active ? '5px solid var(--mc-border-strong)' : '3px solid var(--mc-divider)',
                    background: active ? 'var(--mc-sidebar-active-bg)' : 'transparent',
                    opacity: accessible ? 1 : 0.76,
                    transition: 'border 0.25s ease, background 0.25s ease',
                  }}
                >
                  <Icon style={{ color: active ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)' }} />
                  <span
                    style={{ color: active ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)', fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: active ? 600 : 400, marginTop: 4 }}
                  >
                    {item.label}
                  </span>
                  {!accessible && (
                    <span className="ml-auto pr-[10px]" style={{ color: 'var(--mc-text-muted)' }}>
                      <LockIcon />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
