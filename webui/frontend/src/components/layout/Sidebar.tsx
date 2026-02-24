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

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-[340px] h-full flex flex-col shrink-0 border-r border-black/10">
      {/* 品牌区 */}
      <div className="h-[87px] flex flex-col justify-center px-[11px] shrink-0">
        <span className="text-[#707070] select-none leading-none" style={{ fontSize: 40, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: 700 }}>
          MaiCoreStart
        </span>
        <span className="text-[#707070] select-none mt-[3px]" style={{ fontSize: 20, fontFamily: "'Segoe', 'HarmonyOS Sans SC', sans-serif" }}>
          v4.2.1-beta
        </span>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="mx-0 my-2 border-t border-[#707070]" />}
            <div className="px-[3px] py-1 text-[#707070] select-none" style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: 300 }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = currentPage === item.id
              const Icon = item.icon
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
                    border: active ? '5px solid rgba(112,112,112,0.8)' : '3px solid rgba(112,112,112,0.45)',
                    background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                    transition: 'border 0.25s ease, background 0.25s ease',
                  }}
                >
                  <Icon className={active ? 'text-black' : 'text-[#707070]'} />
                  <span
                    className={active ? 'text-black' : 'text-[#707070]'}
                    style={{ fontSize: 25, fontFamily: "'HYWenHei', 'HarmonyOS Sans SC', sans-serif", fontWeight: active ? 600 : 400, marginTop: 4 }}
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
