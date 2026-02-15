import { 
  LayoutDashboard, 
  Bot, 
  Rocket, 
  BrainCircuit, 
  Settings,
  Plug,
  Activity
} from 'lucide-react'

type Page = 'dashboard' | 'instances' | 'deployment' | 'knowledge' | 'settings'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const menuItems = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'instances', label: '实例管理', icon: Bot },
  { id: 'deployment', label: '部署管理', icon: Rocket },
  { id: 'knowledge', label: '知识库', icon: BrainCircuit },
  { id: 'settings', label: '设置', icon: Settings },
]

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-[340px] h-screen bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-[87px] flex items-center px-6 border-b border-border">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          MaiCore Start
        </h1>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as Page)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                ${isActive 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* 底部信息 */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          MaiCore Start v4.2.0
        </div>
      </div>
    </aside>
  )
}
